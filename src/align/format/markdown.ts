import { code, escape } from '../../diff/format/markdown.js';
import { kindLabel, type AlignFinding, type AlignResult } from '../types.js';
import { countsLine, groups, HEADINGS, isAccess, SYMBOLS, type Group } from './groups.js';

// For the GitHub Action's pull request comment, above the access changes. Errors are always
// shown, warnings and notes folded. The comment shares GitHub's 65,536-character limit with the
// access changes, so output over the cap drops the folded groups, then error lines from the end.
// The counts line is always exact.

/** A third of GitHub's comment limit, so the access changes keep most of it. */
export const MARKDOWN_MAX_LENGTH = 20_000;

const ELSEWHERE = 'run `pageslens align` locally or see the job log';

export function formatMarkdown(result: AlignResult): string {
  const all = result.findings.length;
  for (const folded of [true, false]) {
    const output = render(result, folded, all);
    if (output.length <= MARKDOWN_MAX_LENGTH) return output;
  }
  let low = 0;
  let high = all;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (render(result, false, middle).length <= MARKDOWN_MAX_LENGTH) low = middle;
    else high = middle - 1;
  }
  return render(result, false, low);
}

/** `folded`: whether warnings and notes are shown; `errors`: how many error lines. */
function render(result: AlignResult, folded: boolean, errors: number): string {
  const { site, solution } = result;
  const lines = [
    `<!-- pageslens:align site=${site.path.replaceAll('--', '-\\-')} -->`,
    '### Download and solution',
    '',
    `${code(site.path)} → ${code(solution.path)}`,
    '',
    `**${countsLine(result)}**`,
  ];
  let shown = 0;
  for (const group of groups(result)) {
    const heading = `${SYMBOLS[group.severity]} ${capitalize(HEADINGS[group.check])}`;
    if (group.severity === 'error') {
      const items = group.findings.slice(0, Math.max(0, errors - shown)).map(item);
      shown += items.length;
      lines.push('', `#### ${escape(heading)}`, ...items);
      const more = group.findings.length - items.length;
      if (more > 0) lines.push('', `_and ${more} more: ${ELSEWHERE}._`);
    } else if (folded) {
      lines.push('', ...details(group, heading));
    } else {
      lines.push(
        '',
        `_${group.findings.length} × ${escape(heading)} not shown, to keep this comment under GitHub's size limit: ${ELSEWHERE}._`,
      );
    }
  }
  if (result.findings.some(isAccess)) {
    lines.push(
      '',
      `_Access components differ: ${code(`pageslens diff ${site.path} ${solution.path}`)} shows what the solution changes about who can see what._`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function details(group: Group, heading: string): string[] {
  return [
    `<details><summary>${escape(heading)} (${group.findings.length})</summary>`,
    '',
    ...group.findings.map(item),
    '',
    '</details>',
  ];
}

function item(finding: AlignFinding): string {
  const label = `${kindLabel(finding.kind)} **${escape(finding.name)}**${finding.inactive ? ' (inactive)' : ''}`;
  const file = code(finding.siteFile ?? finding.solutionFile ?? '');
  if (finding.check === 'site-mismatch') return `- ${escape(finding.message)}`;
  if (finding.check.startsWith('missing-from-')) return `- ${label} ${file}`;
  return `- ${label}: ${escape(finding.message)} ${file}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
