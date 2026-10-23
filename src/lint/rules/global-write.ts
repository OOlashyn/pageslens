import type { WebRole } from '../../model/schema.js';
import type { Rule } from '../types.js';

const WRITE_PRIVILEGES = ['create', 'write', 'delete'] as const;

function globalWriteRule(
  id: string,
  roleLabel: string,
  isBuiltIn: (role: WebRole) => boolean,
): Rule {
  return {
    id,
    defaultSeverity: 'warning',
    description: `Global scope create, write or delete for the ${roleLabel} role.`,
    check: ({ graph }) =>
      graph.permissions.flatMap(({ permission, roles }) => {
        const role = roles.find(isBuiltIn);
        const granted = WRITE_PRIVILEGES.filter((p) => permission.privileges[p]);
        if (permission.scope !== 'global' || !role || granted.length === 0) return [];
        return {
          message: `Table permission "${permission.name}" gives ${role.name} ${granted.join(', ')} on every ${permission.table} record (global scope).`,
          source: permission.source,
          recordId: permission.id,
        };
      }),
  };
}

export const globalWriteAnonymous = globalWriteRule(
  'global-write-anonymous',
  'Anonymous Users',
  (role) => role.anonymous,
);

export const globalWriteAuthenticated = globalWriteRule(
  'global-write-authenticated',
  'Authenticated Users',
  (role) => role.authenticated,
);
