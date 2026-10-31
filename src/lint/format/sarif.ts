import {
  fingerprint,
  SARIF_LEVEL,
  sarifLog,
  siteUri,
  type SarifResult,
  type SarifRule,
} from '../../sarif.js';
import { RULE_DOCS_BASE, type LintResult } from '../engine.js';
import type { Rule } from '../types.js';

/**
 * SARIF 2.1.0 for GitHub code scanning: one rule per lint rule, one result per finding, on
 * the line of the record's GUID (`lineOf`).
 */
export function formatSarif(
  result: LintResult,
  sitePath: string,
  rules: readonly Rule[],
  lineOf: (file: string, recordId?: string) => number,
): string {
  const sarifRules = rules.map((rule): SarifRule => ({
    id: rule.id,
    shortDescription: rule.description,
    fullDescription: rule.description,
    helpUri: `${RULE_DOCS_BASE}/${rule.id}/`,
    level: SARIF_LEVEL[rule.defaultSeverity],
  }));
  const results = result.findings.map((finding): SarifResult => ({
    ruleId: finding.ruleId,
    level: SARIF_LEVEL[finding.severity],
    message: finding.message,
    uri: siteUri(sitePath, finding.source.file),
    line: lineOf(finding.source.file, finding.recordId),
    fingerprint: fingerprint(finding.ruleId, finding.recordId, finding.message),
  }));
  return sarifLog('lint', sarifRules, results);
}
