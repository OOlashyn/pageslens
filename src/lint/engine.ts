import { buildAccessGraph } from '../graph/access.js';
import { buildWebApiSurface } from '../graph/webapi.js';
import { compareText as compare } from '../model/normalize.js';
import type { Site } from '../model/schema.js';
import type { LintConfig } from './config.js';
import { RULES } from './rules/index.js';
import { SEVERITIES, type Finding, type Rule, type Severity } from './types.js';

export const RULE_DOCS_BASE = 'https://github.com/OOlashyn/pageslens/blob/main/rules';

export interface LintResult {
  findings: Finding[];
  counts: Record<Severity, number>;
}

/** Runs every rule that isn't turned off. Findings are sorted by file, rule, then message. */
export function lint(
  site: Site,
  config: Pick<LintConfig, 'rules'> = { rules: {} },
  rules: readonly Rule[] = RULES,
): LintResult {
  const graph = buildAccessGraph(site);
  const context = { site, graph, webApi: buildWebApiSurface(site, graph) };

  const findings: Finding[] = [];
  for (const rule of rules) {
    const setting = config.rules[rule.id] ?? rule.defaultSeverity;
    if (setting === 'off') continue;
    for (const finding of rule.check(context)) {
      findings.push({
        ...finding,
        ruleId: rule.id,
        severity: setting,
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
  return { findings, counts };
}
