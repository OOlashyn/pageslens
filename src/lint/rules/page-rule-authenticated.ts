import { roleNames, ruleLabel } from '../../graph/pages.js';
import type { Rule } from '../types.js';

export const pageRuleAuthenticated: Rule = {
  id: 'page-rule-authenticated',
  defaultSeverity: 'warning',
  description:
    'A Restrict Read rule lists the Authenticated Users role with other roles, so every signed-in user passes it and the other roles add nothing.',
  check: ({ site, pages }) => {
    if (site.layout !== 'classic') return [];
    return pages.pages.flatMap((node) =>
      node.restrictions
        .filter((r) => r.page?.id === node.page.id)
        .flatMap(({ rule, roles, audience }) => {
          if (audience.kind !== 'signed-in') return [];
          const authenticated = roles.find((role) => role.authenticated)!;
          const others = roles.filter((role) => !role.authenticated);
          if (others.length === 0) return [];
          return {
            message: `${ruleLabel(rule)} on "${node.url}" lists the Authenticated Users role "${authenticated.name}" with ${roleNames(others)}, so every signed-in user can read the page and the other roles add nothing.`,
            source: rule.source,
            recordId: rule.id,
          };
        }),
    );
  },
};
