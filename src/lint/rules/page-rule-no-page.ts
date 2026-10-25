import { ruleLabel } from '../../graph/pages.js';
import type { Rule } from '../types.js';

export const pageRuleNoPage: Rule = {
  id: 'page-rule-no-page',
  defaultSeverity: 'warning',
  description:
    'A page access rule has no web page, or its page is missing or inactive, so it applies to nothing (info when it has no web role either).',
  check: ({ site, pages }) => {
    if (site.layout !== 'classic') return [];
    const inactive = new Map(site.inactive.webPages.map((page) => [page.id, page.name]));
    return pages.rules.flatMap(({ rule, page }) => {
      if (page) return [];
      const pageId = rule.webPageId;
      const reason = !pageId
        ? 'it has no web page'
        : inactive.has(pageId)
          ? `its web page "${inactive.get(pageId)}" is inactive`
          : `its web page (${pageId}) doesn't exist in the site`;
      return {
        message: `${ruleLabel(rule)} applies to nothing: ${reason}.`,
        source: rule.source,
        recordId: rule.id,
        // The template's "Grant Change to Content" has neither: harmless, but worth knowing
        ...(rule.roleIds.length === 0 && { severity: 'info' as const }),
      };
    });
  },
};
