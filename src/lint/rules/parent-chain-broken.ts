import type { ChainBreak } from '../../graph/access.js';
import type { Rule, RuleFinding } from '../types.js';

export const parentChainBroken: Rule = {
  id: 'parent-chain-broken',
  defaultSeverity: 'error',
  description:
    'A parent-scope table permission whose parent is missing, has no web role, or loops back.',
  check: ({ graph }) =>
    graph.permissions.flatMap(({ permission, ancestors, chainBreak }) => {
      if (permission.scope !== 'parent') return [];
      const finding = (detail: string): RuleFinding => ({
        message: `Parent-scope table permission "${permission.name}" grants nothing: ${detail}.`,
        source: permission.source,
        recordId: permission.id,
      });
      const findings = chainBreak ? [finding(describeBreak(chainBreak, permission.id))] : [];
      for (const ancestor of ancestors) {
        if (graph.permission(ancestor.id)?.roles.length === 0) {
          findings.push(finding(`its parent "${ancestor.name}" has no web role`));
        }
      }
      return findings;
    }),
};

/** Says "its parent" when the break is on the permission itself, else names the ancestor. */
function describeBreak(chainBreak: ChainBreak, permissionId: string): string {
  const self = chainBreak.at.id === permissionId;
  const parentOf = self ? 'its parent' : `the parent of "${chainBreak.at.name}"`;
  switch (chainBreak.reason) {
    case 'missing-parent':
      return `${parentOf} (${chainBreak.parentId}) doesn't exist in the site`;
    case 'no-parent-reference':
      return `${parentOf} isn't set (parententitypermission is empty)`;
    case 'cycle':
      return `the parent chain loops back at "${chainBreak.at.name}"`;
  }
}
