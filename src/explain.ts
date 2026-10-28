import { readFile } from 'node:fs/promises';
import { RULES } from './lint/rules/index.js';
import { compareText } from './model/normalize.js';
import { closest } from './util/closest.js';

// The rule pages ship in the package (`files` in package.json). This module sits one folder below
// the package root both as source (src/) and bundled (dist/bin.mjs), so `../rules/` finds them.
const RULES_FOLDER = new URL('../rules/', import.meta.url);

/** `explain` was given a rule that doesn't exist: exit code 2, like a usage error. */
export class UnknownRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownRuleError';
  }
}

/** A rule's page, as Markdown: why it matters and how to fix it. */
export async function explainRule(id: string): Promise<string> {
  if (!RULES.some((rule) => rule.id === id)) {
    const suggestion = closest(
      id,
      RULES.map((rule) => rule.id),
    );
    throw new UnknownRuleError(
      `unknown rule "${id}"${suggestion ? ` (did you mean "${suggestion}"?)` : ''}; run pageslens explain for the list`,
    );
  }
  return readFile(new URL(`${id}.md`, RULES_FOLDER), 'utf8');
}

/** Every rule with its default severity and what it catches, sorted by id. */
export function listRules(): string {
  const rules = RULES.toSorted((a, b) => compareText(a.id, b.id));
  const idWidth = Math.max(...rules.map((rule) => rule.id.length));
  const severityWidth = Math.max(...rules.map((rule) => rule.defaultSeverity.length));
  const lines = rules.map(
    (rule) =>
      `${rule.id.padEnd(idWidth)}  ${rule.defaultSeverity.padEnd(severityWidth)}  ${rule.description}`,
  );
  return `${lines.join('\n')}\n\nRun pageslens explain <rule> for why it matters and how to fix it.\n`;
}
