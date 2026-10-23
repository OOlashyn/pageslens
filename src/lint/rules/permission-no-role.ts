import type { Rule } from '../types.js';

export const permissionNoRole: Rule = {
  id: 'permission-no-role',
  defaultSeverity: 'warning',
  description: 'A table permission has no web role, so it grants nothing.',
  check: ({ graph }) =>
    graph.permissions.flatMap(({ permission, roles, unknownRoleIds }) => {
      if (roles.length > 0) return [];
      const reason =
        unknownRoleIds.length > 0
          ? `its web role(s) ${unknownRoleIds.join(', ')} don't exist in the site`
          : 'it has no web role';
      return {
        message: `Table permission "${permission.name}" grants nothing: ${reason}.`,
        source: permission.source,
        recordId: permission.id,
      };
    }),
};
