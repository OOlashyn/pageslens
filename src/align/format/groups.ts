import type { Severity } from '../../lint/types.js';
import {
  ACCESS_KINDS,
  kindLabel,
  type AlignFinding,
  type AlignResult,
  type AlignSide,
  type Check,
} from '../types.js';

// What the text and Markdown formats share: the header, the groups and their headings, and the
// counts line.

export const SYMBOLS: Record<Severity, string> = { error: '✗', warning: '⚠', info: 'ℹ' };

export const HEADINGS: Record<Check, string> = {
  'site-mismatch': 'different sites',
  'missing-from-solution': "missing from the solution: won't be in test or prod",
  'state-differs': 'active on one side only',
  'content-differs': 'content differs',
  'variable-missing': 'environment variable missing from the solution',
  'missing-from-download': 'in the solution, not in the download',
  'field-one-side': 'fields on one side only',
  'variable-no-value': 'environment variable with no value',
};

export interface Group {
  severity: Severity;
  check: Check;
  findings: AlignFinding[];
}

/** Findings by severity and check, in the result's order. */
export function groups(result: AlignResult): Group[] {
  const byKey = Map.groupBy(result.findings, (f) => `${f.severity} ${f.check}`);
  return [...byKey.values()].map((findings) => ({
    severity: findings[0]!.severity,
    check: findings[0]!.check,
    findings,
  }));
}

/** `classic site download`, `code site, solution PagesLensEDM2Sol 1.0.0.0`. */
export function describeSide(side: AlignSide): string {
  const site = side.layout === 'code' ? 'code site' : 'classic site';
  if (side.format === 'solution') {
    return side.solution ? `${side.solution.name} ${side.solution.version}` : 'unpacked solution';
  }
  return `${site} download`;
}

/** `web role "Course Admins"`, `(inactive)` added for an inactive record missing from the solution. */
export function recordLabel(finding: AlignFinding): string {
  return `${kindLabel(finding.kind)} "${finding.name}"${finding.inactive ? ' (inactive)' : ''}`;
}

/** Whether a finding is about who can see what, which `pageslens diff` explains. */
export function isAccess(finding: AlignFinding): boolean {
  if (finding.check === 'field-one-side' || finding.check.startsWith('variable-')) return false;
  if (ACCESS_KINDS.has(finding.kind)) return true;
  return finding.kind === 'sitesetting' && /^webapi\//i.test(finding.name);
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** `2 errors, 1 warning. 475 records match.`, with ignored findings and unused ignores. */
export function countsLine(result: AlignResult): string {
  const { error, warning, info } = result.counts;
  const parts = [plural(error, 'error'), plural(warning, 'warning')];
  if (info > 0) parts.push(`${info} info`);
  const notes = [
    result.ignored > 0 ? `${result.ignored} ignored` : '',
    result.unusedIgnores.length > 0 ? plural(result.unusedIgnores.length, 'unused ignore') : '',
  ].filter(Boolean);
  const head = result.findings.length === 0 ? 'No differences' : parts.join(', ');
  const line = `${head}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}.`;
  // Records of two different sites aren't compared
  if (result.findings.some((f) => f.check === 'site-mismatch')) return line;
  return `${line} ${plural(result.matched, 'record')} ${result.matched === 1 ? 'matches' : 'match'}.`;
}
