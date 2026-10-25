import type { ChainBreak } from '../../graph/access.js';
import type { Rule, RuleFinding } from '../types.js';

export const parentChainBroken: Rule = {
  id: 'parent-chain-broken',
  defaultSeverity: 'error',
  description:
    'A parent-scope table permission whose parent is missing, has no web role, or loops back.',
  check: ({ site, graph }) =>
    graph.permissions.flatMap(({ permission, ancestors, chainBreak }) => {
      if (permission.scope !== 'parent') return [];
      const finding = (detail: string): RuleFinding => ({
        message: `Parent-scope table permission "${permission.name}" grants nothing: ${detail}.`,
        source: permission.source,
        recordId: permission.id,
      });
      const inactive = new Map(site.inactive.tablePermissions.map((p) => [p.id, p.name]));
      const findings = chainBreak
        ? [finding(describeBreak(chainBreak, permission.id, inactive))]
        : [];
      for (const ancestor of ancestors) {
        // An ancestor that inherits its roles is reported through the one it inherits from.
        const node = graph.permission(ancestor.id);
        if (node && node.roles.length === 0 && !node.rolesInherited) {
          findings.push(finding(`its parent "${ancestor.name}" has no web role`));
        }
      }
      return findings;
    }),
};

/** Says "its parent" when the break is on the permission itself, else names the ancestor. */
function describeBreak(
  chainBreak: ChainBreak,
  permissionId: string,
  inactive: Map<string, string>,
): string {
  const self = chainBreak.at.id === permissionId;
  const parentOf = self ? 'its parent' : `the parent of "${chainBreak.at.name}"`;
  switch (chainBreak.reason) {
    case 'missing-parent':
      return inactive.has(chainBreak.parentId)
        ? `${parentOf} "${inactive.get(chainBreak.parentId)}" is inactive`
        : `${parentOf} (${chainBreak.parentId}) doesn't exist in the site`;
    case 'no-parent-reference':
      return `${parentOf} isn't set (parententitypermission is empty)`;
    case 'cycle':
      return `the parent chain loops back at "${chainBreak.at.name}"`;
  }
}
