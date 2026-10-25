import { buildAccessGraph } from '../graph/access.js';
import { buildPageGraph } from '../graph/pages.js';
import { buildWebApiSurface } from '../graph/webapi.js';
import { compareText as compare } from '../model/normalize.js';
import type { Site } from '../model/schema.js';
import { globToRegExp } from '../util/glob.js';
import type { IgnoreEntry, LintConfig } from './config.js';
import { RULES } from './rules/index.js';
import { SEVERITIES, type Finding, type Rule, type RuleFinding, type Severity } from './types.js';

export const RULE_DOCS_BASE = 'https://github.com/OOlashyn/pageslens/blob/main/rules';

export interface LintResult {
  findings: Finding[];
  counts: Record<Severity, number>;
  /** Findings left out by the config's `ignore` entries. */
  ignored: number;
}

/**
 * Runs every rule that isn't turned off and leaves out ignored findings. Findings are sorted by
 * file, rule, then message.
 */
export function lint(
  site: Site,
  config: Pick<LintConfig, 'rules'> & Partial<Pick<LintConfig, 'ignore'>> = { rules: {} },
  rules: readonly Rule[] = RULES,
): LintResult {
  const graph = buildAccessGraph(site);
  const context = {
    site,
    graph,
    webApi: buildWebApiSurface(site, graph),
    pages: buildPageGraph(site),
  };
  const isIgnored = ignoreMatcher(config.ignore ?? []);

  const findings: Finding[] = [];
  let ignored = 0;
  for (const rule of rules) {
    const setting = config.rules[rule.id];
    if (setting === 'off') continue;
    for (const { severity, ...finding } of rule.check(context)) {
      if (isIgnored(rule.id, finding)) {
        ignored++;
        continue;
      }
      findings.push({
        ...finding,
        ruleId: rule.id,
        severity: setting ?? severity ?? rule.defaultSeverity,
        docs: `${RULE_DOCS_BASE}/${rule.id}.md`,
      });
    }
  }

  findings.sort(
    (a, b) =>
      compare(a.source.file, b.source.file) ||
      compare(a.ruleId, b.ruleId) ||
      compare(a.message, b.message),
  );
  const counts = Object.fromEntries(
    SEVERITIES.map((severity) => [
      severity,
      findings.filter((f) => f.severity === severity).length,
    ]),
  ) as Record<Severity, number>;
  return { findings, counts, ignored };
}

function ignoreMatcher(entries: IgnoreEntry[]) {
  const compiled = entries.map((entry) => ({
    rules: entry.rules,
    files: (entry.files ?? []).map(globToRegExp),
    records: entry.records ?? [],
  }));
  return (ruleId: string, finding: RuleFinding): boolean =>
    compiled.some(
      (entry) =>
        (!entry.rules || entry.rules.includes(ruleId)) &&
        (entry.files.some((glob) => glob.test(finding.source.file)) ||
          entry.records.includes(finding.recordId)),
    );
}
