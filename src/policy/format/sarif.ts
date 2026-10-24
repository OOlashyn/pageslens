import { fingerprint, sarifLog, siteUri, type SarifResult, type SarifRule } from '../../sarif.js';
import type { TestResult } from '../evaluate.js';
import type { Statement } from '../types.js';

export const POLICY_DOCS = 'https://github.com/OOlashyn/pageslens/blob/main/docs/policy.md';

/**
 * SARIF 2.1.0 for GitHub code scanning: one rule per statement, and for a failed statement
 * one result per site file that breaks it, with the statement's line in the policy as a
 * related location. Evidence without a file (a setting that isn't there, a privilege a role
 * lacks) is reported on the policy line, with the grants the role does have as related
 * locations. Every failure is an error.
 */
export function formatSarif(
  result: TestResult,
  sitePath: string,
  policyPath: string,
  lineOf: (file: string, recordId?: string) => number,
): string {
  const ids = ruleIds(result.results.map((r) => r.statement));
  const rules = result.results.map(({ statement }): SarifRule => ({
    id: ids.get(statement)!,
    shortDescription: statement.text,
    fullDescription: statement.because ?? `Requirement on line ${statement.line} of ${policyPath}.`,
    helpUri: POLICY_DOCS,
    level: 'error',
  }));

  const results = result.results.flatMap(({ statement, passed, evidence }): SarifResult[] => {
    if (passed) return [];
    const ruleId = ids.get(statement)!;
    const requirement = { uri: policyPath, line: statement.line, message: 'the requirement' };
    const causes = evidence.filter((e) => e.file && !e.context);
    const elsewhere = evidence.filter((e) => !e.file);
    const context = evidence.filter((e) => e.file && e.context);
    const found: SarifResult[] = causes.map((e) => ({
      ruleId,
      level: 'error',
      message: `${statement.text}: ${e.message}`,
      uri: siteUri(sitePath, e.file!),
      line: lineOf(e.file!, e.recordId),
      related: [requirement],
      fingerprint: fingerprint(ruleId, e.message),
    }));
    if (elsewhere.length > 0 || found.length === 0) {
      const detail = elsewhere.map((e) => e.message).join('; ');
      found.push({
        ruleId,
        level: 'error',
        message: detail ? `${statement.text}: ${detail}` : statement.text,
        uri: policyPath,
        line: statement.line,
        ...(context.length > 0 && {
          related: context.map((e) => ({
            uri: siteUri(sitePath, e.file!),
            line: lineOf(e.file!, e.recordId),
            message: e.message,
          })),
        }),
        fingerprint: fingerprint(ruleId, detail),
      });
    }
    return found;
  });

  return sarifLog('test', rules, results);
}

/**
 * A rule id per statement that stays the same when statements move: `policy/<id>`, or a slug
 * of the text. A repeated slug gets `-2`, `-3`, …
 */
function ruleIds(statements: Statement[]): Map<Statement, string> {
  const ids = new Map<Statement, string>();
  const used = new Map<string, number>();
  for (const statement of statements) {
    const base = `policy/${statement.id ?? slug(statement.text)}`;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    ids.set(statement, count === 1 ? base : `${base}-${count}`);
  }
  return ids;
}

function slug(text: string): string {
  const full = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return full.length <= 80 ? full : `${full.slice(0, 71)}-${fingerprint(full).slice(0, 8)}`;
}
