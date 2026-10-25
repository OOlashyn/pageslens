import { ruleLabel } from '../../graph/pages.js';
import type { Rule } from '../types.js';

export const pageRulesConflict: Rule = {
  id: 'page-rules-conflict',
  defaultSeverity: 'error',
  description: 'A web page has more than one active Restrict Read rule.',
  check: ({ site, pages }) => {
    if (site.layout !== 'classic') return [];
    return pages.pages.flatMap((node) => {
      const own = node.restrictions.filter((r) => r.page?.id === node.page.id);
      if (own.length < 2) return [];
      const names = own.map(({ rule }) => `"${rule.name}"`).join(', ');
      return own.map(({ rule }) => ({
        message: `${ruleLabel(rule)} is one of ${own.length} Restrict Read rules on "${node.url}" (${names}); Power Pages reports this as a conflict and expects one.`,
        source: rule.source,
        recordId: rule.id,
      }));
    });
  },
};
