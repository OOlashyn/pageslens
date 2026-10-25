import { ruleLabel } from '../../graph/pages.js';
import type { Rule } from '../types.js';

export const pageRuleAnonymous: Rule = {
  id: 'page-rule-anonymous',
  defaultSeverity: 'warning',
  description:
    'A page access rule lists the Anonymous Users role, which Microsoft says not to assign to pages.',
  check: ({ site, pages }) => {
    if (site.layout !== 'classic') return [];
    return pages.rules.flatMap(({ rule, roles }) => {
      const anonymous = roles.find((role) => role.anonymous);
      if (!anonymous) return [];
      return {
        message: `${ruleLabel(rule)} lists the Anonymous Users role "${anonymous.name}", which Microsoft says not to assign to pages; pageslens reads it as "anyone".`,
        source: rule.source,
        recordId: rule.id,
      };
    });
  },
};
