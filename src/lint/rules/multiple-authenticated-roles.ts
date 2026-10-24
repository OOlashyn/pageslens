import type { Rule } from '../types.js';

export const multipleAuthenticatedRoles: Rule = {
  id: 'multiple-authenticated-roles',
  defaultSeverity: 'error',
  description: 'More than one web role is flagged as the Authenticated Users role.',
  check: ({ site }) => {
    const roles = site.webRoles.filter((role) => role.authenticated);
    if (roles.length < 2) return [];
    const names = roles.map((role) => `"${role.name}"`).join(', ');
    return roles.map((role) => ({
      message: `${roles.length} web roles are flagged as the Authenticated Users role (${names}); a site must have exactly one.`,
      source: role.source,
      recordId: role.id,
    }));
  },
};
