import { RIGHTS, ruleLabel } from '../../graph/pages.js';
import type { Rule } from '../types.js';

export const pageRuleNoRole: Rule = {
  id: 'page-rule-no-role',
  defaultSeverity: 'error',
  description:
    'A page access rule has no web role: a Restrict Read hides its pages from everyone but Grant Change roles (error), a Grant Change does nothing (info).',
  check: ({ site, pages }) => {
    if (site.layout !== 'classic') return [];
    const inactive = new Map(site.inactive.webRoles.map((role) => [role.id, role.name]));
    return pages.rules.flatMap((node) => {
      const { rule, roles, unknownRoleIds } = node;
      // A rule on no page is page-rule-no-page's
      const page = pages.pageOf(node);
      if (!page || roles.length > 0) return [];
      if (rule.right !== RIGHTS.restrictRead && rule.right !== RIGHTS.grantChange) return [];

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
      const restrict = rule.right === RIGHTS.restrictRead;
      const effect = restrict
        ? `only Grant Change roles can read "${page.url}" and the pages below it`
        : 'it does nothing';
      return {
        message: `${ruleLabel(rule)} on "${page.url}": ${reason}, so ${effect}.`,
        source: rule.source,
        recordId: rule.id,
        ...(!restrict && { severity: 'info' as const }),
      };
    });
  },
};
