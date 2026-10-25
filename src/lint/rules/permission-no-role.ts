import type { Rule } from '../types.js';

export const permissionNoRole: Rule = {
  id: 'permission-no-role',
  defaultSeverity: 'warning',
  description: 'A table permission has no web role, so it grants nothing.',
  check: ({ site, graph }) =>
    graph.permissions.flatMap(({ permission, roles, rolesInherited, unknownRoleIds }) => {
      // A child permission without roles of its own takes its parent's; parent-chain-broken
      // reports when the chain gives it none.
      if (roles.length > 0 || rolesInherited) return [];
      // A role that isn't in the model is either inactive (named) or not in the site at all
      const inactive = new Map(site.inactive.webRoles.map((role) => [role.id, role.name]));
      const off = unknownRoleIds.filter((id) => inactive.has(id));
      const missing = unknownRoleIds.filter((id) => !inactive.has(id));
      const reasons = [];
      if (off.length > 0) {
        const names = off.map((id) => `"${inactive.get(id)}"`).join(', ');
        reasons.push(
          off.length === 1
            ? `its web role ${names} is inactive`
            : `its web roles ${names} are inactive`,
        );
      }
      if (missing.length > 0) {
        reasons.push(`its web role(s) ${missing.join(', ')} don't exist in the site`);
      }
      const reason = reasons.join(', and ') || 'it has no web role';
      return {
        message: `Table permission "${permission.name}" grants nothing: ${reason}.`,
        source: permission.source,
        recordId: permission.id,
      };
    }),
};
