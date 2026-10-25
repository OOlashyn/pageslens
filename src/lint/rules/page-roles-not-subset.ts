import { passes, roleNames, ruleLabel, type RuleNode } from '../../graph/pages.js';
import type { WebRole } from '../../model/schema.js';
import type { Rule } from '../types.js';

export const pageRolesNotSubset: Rule = {
  id: 'page-roles-not-subset',
  defaultSeverity: 'warning',
  description:
    "A Restrict Read rule lists a web role that a Restrict Read on a page above doesn't let in, so the role can't reach the page.",
  check: ({ site, pages }) => {
    if (site.layout !== 'classic') return [];
    return pages.pages.flatMap((node) =>
      node.restrictions
        .filter((r) => r.page?.id === node.page.id)
        .flatMap(({ rule, roles }) => {
          // The nearest rule above that keeps each role out, unless a Grant Change lets it in
          const blocked = new Map<RuleNode, WebRole[]>();
          for (const role of roles) {
            if (role.anonymous) continue;
            if (node.grantChanges.some((grant) => passes(grant.audience, role))) continue;
            const above = node.restrictions.find(
              (r) => r.page?.id !== node.page.id && !passes(r.audience, role),
            );
            if (above) blocked.set(above, [...(blocked.get(above) ?? []), role]);
          }
          return [...blocked].map(([above, blockedRoles]) => {
            const one = blockedRoles.length === 1;
            return {
              message: `${ruleLabel(rule)} on "${node.url}" lists ${roleNames(blockedRoles)}, but ${ruleLabel(above.rule)} on "${pages.pageOf(above)!.url}" doesn't let ${one ? 'it' : 'them'} in, so ${one ? 'it' : 'they'} can't reach "${node.url}".`,
              source: rule.source,
              recordId: rule.id,
            };
          });
        }),
    );
  },
};
