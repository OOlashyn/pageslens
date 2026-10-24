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

/** `<role> <verb> <privileges> on <table> (<scope> scope) from "<permission>", under "<top parent>"` */
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

/** `, under "<top parent>"` for a parent-scope grant, so the chain it hangs from is named. */
export function underParent(ancestors: Grant['ancestors']): string {
  return ancestors.length > 0 ? `, under "${ancestors.at(-1)!.name}"` : '';
}
