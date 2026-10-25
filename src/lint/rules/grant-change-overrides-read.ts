import { passes, roleNames, ruleLabel } from '../../graph/pages.js';
import type { Rule } from '../types.js';

export const grantChangeOverridesRead: Rule = {
  id: 'grant-change-overrides-read',
  defaultSeverity: 'warning',
  description:
    "A Grant Change rule lets a web role read pages that a Restrict Read on or below its page doesn't list.",
  check: ({ site, pages }) => {
    if (site.layout !== 'classic') return [];
    return pages.pages.flatMap((node) =>
      node.restrictions
        .filter((r) => r.page?.id === node.page.id)
        .flatMap((restriction) =>
          node.grantChanges.flatMap((grant) => {
            const roles = grant.roles.filter((role) => !passes(restriction.audience, role));
            if (roles.length === 0) return [];
            return {
              message: `${ruleLabel(grant.rule)} on "${pages.pageOf(grant)!.url}" lets ${roleNames(roles)} read "${node.url}", though ${ruleLabel(restriction.rule)} doesn't list ${roles.length === 1 ? 'it' : 'them'}: Grant Change overrides Restrict Read.`,
              source: restriction.rule.source,
              recordId: restriction.rule.id,
            };
          }),
        ),
    );
  },
};
