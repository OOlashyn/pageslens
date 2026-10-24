import type { Rule } from '../types.js';

export const roleUnused: Rule = {
  id: 'role-unused',
  defaultSeverity: 'info',
  description:
    'A web role that no table permission, page access rule or website access uses (built-in roles are skipped).',
  check: ({ site, graph }) =>
    site.webRoles.flatMap((role) => {
      if (role.anonymous || role.authenticated) return [];
      const usage = graph.usage(role.id);
      if (usage.permissions.length + usage.pageRules.length + usage.websiteAccess.length > 0) {
        return [];
      }
      return {
        message: `Web role "${role.name}" isn't used by any table permission, page access rule or website access.`,
        source: role.source,
        recordId: role.id,
      };
    }),
};
