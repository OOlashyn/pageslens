import { plain } from '../../graph/describe.js';
import { CHANGE_CLASSES, type ChangeClass, type DiffResult } from '../types.js';
import { comparison, counts, notes, sourceFiles } from './sides.js';

const HEADINGS: Record<ChangeClass, string> = {
  wider: 'Wider',
  narrower: 'Narrower',
  neutral: 'Neutral',
};

/** The Terraform and what-if symbols: `+` wider, `-` narrower, `~` neutral. */
const SYMBOLS: Record<ChangeClass, string> = { wider: '+', narrower: '-', neutral: '~' };

/** Every change by class, with the files behind it, for a terminal. */
export function formatText(result: DiffResult): string {
  const asIs = (text: string) => text;
  const where = comparison(result, asIs);
  const lines =
    result.changes.length === 0
      ? [`No access changes in ${where}.`]
      : [`Access changes in ${where}: ${counts(result.summary)}`];
  for (const note of notes(result, asIs)) lines.push(`Note: ${note}.`);
  if (result.changes.length > 0) lines.push('');

  for (const cls of CHANGE_CLASSES) {
    const changes = result.changes.filter((c) => c.class === cls);
    if (changes.length === 0) continue;
    lines.push(HEADINGS[cls]);
    for (const change of changes) {
      lines.push(`  ${SYMBOLS[cls]} ${plain(change.message)}`);
      for (const file of sourceFiles(change.sources, asIs)) lines.push(`      ${file}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
