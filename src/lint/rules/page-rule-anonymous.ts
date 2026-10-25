import { ruleLabel } from '../../graph/pages.js';
import type { Rule } from '../types.js';

export const pageRuleAnonymous: Rule = {
  id: 'page-rule-anonymous',
  defaultSeverity: 'error',
  description:
    'A page access rule lists the Anonymous Users role, which lets nobody in, anonymous visitors included.',
  check: ({ site, pages }) => {
    if (site.layout !== 'classic') return [];
    return pages.rules.flatMap(({ rule, roles }) => {
      const anonymous = roles.find((role) => role.anonymous);
      if (!anonymous) return [];
      const effect =
        roles.length === 1 ? 'so nobody passes the rule' : 'so only its other roles pass it';
      return {
        message: `${ruleLabel(rule)} lists the Anonymous Users role "${anonymous.name}", which lets nobody in, anonymous visitors included, ${effect}.`,
        source: rule.source,
        recordId: rule.id,
      };
    });
  },
};
