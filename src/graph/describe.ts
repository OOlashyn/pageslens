import type { SiteSetting } from '../model/schema.js';
import type { Grant, Privilege } from './access.js';

// The sentences `test` and `diff` use for grants, so both say the same thing:
//   test: Authenticated Users has write on contact (global scope) from "Contact - Global Write"
//   diff: Authenticated Users gained write on contact (global scope) from "Contact - Global Write"
// A sentence is a list of parts, so Markdown output can bold roles and privileges and put table
// names in code, while text and JSON output join the parts as they are.

export type Part = string | { strong: string } | { code: string };

/** The sentence as plain text. */
export function plain(parts: Part[]): string {
  return parts
    .map((part) => (typeof part === 'string' ? part : 'strong' in part ? part.strong : part.code))
    .join('');
}

/** `<role> <verb> <privileges> on <table> (<scope> scope) from "<permission>", under "<top parent>" (…)` */
export function grantSentence(
  verb: string,
  grant: Pick<Grant, 'table' | 'scope' | 'ancestors'> & {
    role: { name: string };
    permission: { name: string };
  },
  privileges: Privilege[],
): Part[] {
  return [
    { strong: grant.role.name },
    ` ${verb} `,
    { strong: privileges.join(', ') },
    ' on ',
    { code: grant.table },
    ` (${grant.scope} scope) from "${grant.permission.name}"${underParent(grant.ancestors)}`,
  ];
}

/**
 * `, under "<top parent>" (<table>, <scope> scope)` for a parent-scope grant, so the chain it
 * hangs from, and the rows it starts from, are named.
 */
export function underParent(ancestors: Grant['ancestors']): string {
  const top = ancestors.at(-1);
  return top ? `, under "${top.name}" (${top.table}, ${top.scope} scope)` : '';
}

/**
 * Why a setting's value can't be read: `ASP/Pagination/CardsPerPage comes from environment
 * variable dwcrm_CardsPerPage, which a download doesn't include`.
 */
export function unknownValue(setting: SiteSetting): string {
  return `${setting.name} comes from environment variable ${setting.variable ?? ''}, ${unknownReason(setting)}`;
}

/**
 * Why an environment variable's value is unknown: `which a download doesn't include`, and what
 * the deployment settings file has instead, when one was given.
 */
export function unknownReason(setting: SiteSetting): string {
  const reason = "which a download doesn't include";
  if (!setting.settingsFile) return reason;
  return setting.settingsSecret
    ? `${reason}, and it's a secret in ${setting.settingsFile}`
    : `${reason}, and ${setting.settingsFile} gives it no value`;
}

/**
 * A setting's value as written in a message: `"20"`, or `"20" from environment variable
 * dwcrm_CardsPerPage`, or why a solution has none.
 */
export function settingValue(setting: SiteSetting): string {
  if (setting.variable === undefined) return `"${setting.value ?? ''}"`;
  if (setting.unknown) {
    const where = setting.settingsFile ? `the download or ${setting.settingsFile}` : 'the download';
    return `from environment variable ${setting.variable} (not in ${where})`;
  }
  if (setting.value === undefined) {
    return `not set: environment variable ${setting.variable} has no value to read (${setting.noValue ?? ''})`;
  }
  const file = setting.settingsFile ? ` in ${setting.settingsFile}` : '';
  return `"${setting.value}" from environment variable ${setting.variable}${file}`;
}
