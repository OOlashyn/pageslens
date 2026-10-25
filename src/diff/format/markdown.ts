import type { Part } from '../../graph/describe.js';
import type { Change, ChangeClass, DiffResult } from '../types.js';
import { comparison, counts, notes, sitePath, sourceFiles } from './sides.js';

// For a pull request comment that the GitHub Action finds by its first line and edits in place.
// Summary first, wider changes always shown, narrower shown, neutral and sources folded. GitHub
// rejects comments over 65,536 characters, so output over the cap drops, in order, the sources
// table, the neutral details and the narrower details, then wider lines from the end. The counts
// line is always exact.

/** Under GitHub's 65,536-character comment limit, with room for the Action's own text. */
export const MARKDOWN_MAX_LENGTH = 60_000;

const ELSEWHERE = 'run `pageslens diff` locally or see the JSON artifact';

interface Shown {
  sources: boolean;
  neutral: boolean;
  narrower: boolean;
  /** How many wider lines to show. */
  wider: number;
}

export function formatMarkdown(result: DiffResult): string {
  const all = result.changes.length;
  const attempts: Shown[] = [
    { sources: true, neutral: true, narrower: true, wider: all },
    { sources: false, neutral: true, narrower: true, wider: all },
    { sources: false, neutral: false, narrower: true, wider: all },
    { sources: false, neutral: false, narrower: false, wider: all },
  ];
  for (const shown of attempts) {
    const output = render(result, shown);
    if (output.length <= MARKDOWN_MAX_LENGTH) return output;
  }
  // Keep as many wider lines as fit
  let low = 0;
  let high = result.summary.wider;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const output = render(result, { ...attempts[3]!, wider: middle });
    if (output.length <= MARKDOWN_MAX_LENGTH) low = middle;
    else high = middle - 1;
  }
  return render(result, { ...attempts[3]!, wider: low });
}

function render(result: DiffResult, shown: Shown): string {
  const lines = [
    `<!-- pageslens:diff site=${sitePath(result).replaceAll('--', '-\\-')} -->`,
    '### Access changes',
    '',
  ];
  const where = comparison(result, code);
  lines.push(
    result.changes.length === 0
      ? `No access changes in ${where}.`
      : `**${counts(result.summary)}** in ${where}`,
  );
  for (const note of notes(result, code)) lines.push('', `_Note: ${note}._`);

  const of = (cls: ChangeClass) => result.changes.filter((c) => c.class === cls);
  const wider = of('wider');
  const narrower = of('narrower');
  const neutral = of('neutral');

  if (wider.length > 0) {
    lines.push('', '#### Wider', ...wider.slice(0, shown.wider).map(item));
    const more = wider.length - shown.wider;
    if (more > 0) lines.push('', `and ${more} more wider ${plural(more)}: ${ELSEWHERE}`);
  }
  if (narrower.length > 0) {
    lines.push('', '#### Narrower');
    if (shown.narrower) lines.push(...narrower.map(item));
    else lines.push(notShown(narrower.length, 'narrower'));
  }
  if (neutral.length > 0) {
    if (shown.neutral) {
      lines.push(
        '',
        `<details><summary>${neutral.length} neutral ${plural(neutral.length)}</summary>`,
        '',
        ...neutral.map(item),
        '',
        '</details>',
      );
    } else {
      lines.push('', notShown(neutral.length, 'neutral'));
    }
  }
  const rows = shown.sources ? sourceRows(result.changes) : [];
  if (rows.length > 0) {
    lines.push(
      '',
      '<details><summary>Where these come from</summary>',
      '',
      '| Change | File |',
      '|---|---|',
      ...rows,
      '',
      '</details>',
    );
  }
  return `${lines.join('\n')}\n`;
}

function plural(count: number): string {
  return count === 1 ? 'change' : 'changes';
}

function notShown(count: number, cls: ChangeClass): string {
  return `_${count} ${cls} ${plural(count)} not shown, to keep this comment under GitHub's size limit: ${ELSEWHERE}._`;
}

function item(change: Change): string {
  return `- ${inline(change.message)}`;
}

function inline(parts: Part[]): string {
  return parts
    .map((part) =>
      typeof part === 'string'
        ? escape(part)
        : 'strong' in part
          ? `**${escape(part.strong)}**`
          : code(part.code),
    )
    .join('');
}

/**
 * Names come from the site, so Markdown and HTML characters in them are shown as written. A
 * zero-width space after `@` keeps a name like `@org/team` from mentioning anyone in a comment.
 */
function escape(text: string): string {
  return text.replace(/[\\`*_[\]<>|~#]/g, (c) => `\\${c}`).replaceAll('@', '@&#8203;');
}

function code(text: string): string {
  return text.includes('`') ? `\`\` ${text} \`\`` : `\`${text}\``;
}

function sourceRows(changes: Change[]): string[] {
  const rows = changes.flatMap((change) =>
    sourceFiles(change.sources, code).map((file) => `| ${escape(label(change))} | ${file} |`),
  );
  return [...new Set(rows)];
}

/** A short name for a change, for the sources table: `Authenticated Users write contact`. */
function label(change: Change): string {
  if (change.kind.startsWith('grant-') && change.role) {
    return `${change.role.name} ${change.privileges!.join(', ')} ${change.table}`;
  }
  if (change.kind.startsWith('webapi-')) return `Web API ${change.table}`;
  if (change.kind.startsWith('role-')) return `Role "${change.role!.name}"`;
  if (change.setting) return change.setting;
  if (change.page) return `Page ${change.page}`;
  return `"${change.sources[0]?.name ?? ''}"`;
}
