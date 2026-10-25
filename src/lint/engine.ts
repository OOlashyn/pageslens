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
  /** File globs and record GUIDs in `ignore` entries that left out no finding. */
  unusedIgnores: UnusedIgnore[];
}

/** One pattern of an `ignore` entry that matched nothing: what was ignored is probably fixed. */
export interface UnusedIgnore {
  /** The entry's position in the config's `ignore` list, from 1. */
  entry: number;
  field: 'files' | 'records';
  value: string;
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
  const ignore = ignoreMatcher(config.ignore ?? []);

  const findings: Finding[] = [];
  let ignored = 0;
  for (const rule of rules) {
    const setting = config.rules[rule.id];
    if (setting === 'off') continue;
    for (const { severity, ...finding } of rule.check(context)) {
      if (ignore.matches(rule.id, finding)) {
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
  const ran = rules.filter((rule) => config.rules[rule.id] !== 'off').map((rule) => rule.id);
  return { findings, counts, ignored, unusedIgnores: ignore.unused(ran) };
}

function ignoreMatcher(entries: IgnoreEntry[]) {
  const compiled = entries.map((entry, index) => ({
    entry: index + 1,
    rules: entry.rules,
    files: (entry.files ?? []).map((glob) => ({ glob, test: globToRegExp(glob), used: false })),
    records: (entry.records ?? []).map((id) => ({ id, used: false })),
  }));
  return {
    /** Whether an entry leaves out the finding; marks every pattern that matches it as used. */
    matches(ruleId: string, finding: RuleFinding): boolean {
      let matched = false;
      for (const entry of compiled) {
        if (entry.rules && !entry.rules.includes(ruleId)) continue;
        for (const file of entry.files) {
          if (file.test.test(finding.source.file)) matched = file.used = true;
        }
        for (const record of entry.records) {
          if (record.id === finding.recordId) matched = record.used = true;
        }
      }
      return matched;
    },
    /**
     * The patterns no finding matched. An entry that lists a rule that didn't run is left out:
     * that rule's findings weren't looked for.
     */
    unused(ran: readonly string[]): UnusedIgnore[] {
      return compiled
        .filter((entry) => !entry.rules || entry.rules.every((id) => ran.includes(id)))
        .flatMap((entry) => [
          ...entry.files
            .filter((file) => !file.used)
            .map((file) => ({ entry: entry.entry, field: 'files' as const, value: file.glob })),
          ...entry.records
            .filter((record) => !record.used)
            .map((record) => ({ entry: entry.entry, field: 'records' as const, value: record.id })),
        ]);
    },
  };
}
