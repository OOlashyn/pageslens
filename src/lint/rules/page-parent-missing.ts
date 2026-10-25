import type { Rule } from '../types.js';

export const pageParentMissing: Rule = {
  id: 'page-parent-missing',
  defaultSeverity: 'error',
  description:
    "A web page's parent page isn't in the site or is inactive (warning), or the parent pages loop, so who can read it is unknown.",
  check: ({ site, pages }) => {
    if (site.layout !== 'classic') return [];
    return pages.pages.flatMap(({ page, pathBreak }) => {
      // Pages below the break are shown in the docs, not reported again
      if (!pathBreak) return [];
      const inLoop = pathBreak.reason === 'cycle' && pathBreak.parent.id === page.id;
      if (pathBreak.reason === 'cycle' ? !inLoop : pathBreak.at.id !== page.id) return [];
      const detail =
        pathBreak.reason === 'missing-parent'
          ? `its parent page (${pathBreak.parentId}) doesn't exist in the site`
          : pathBreak.reason === 'inactive-parent'
            ? `its parent page "${pathBreak.parent.name}" is inactive`
            : 'its parent pages loop back to it';
      return {
        message: `Web page "${page.name}" can't be placed in the page tree: ${detail}.`,
        source: page.source,
        recordId: page.id,
        ...(pathBreak.reason === 'inactive-parent' && { severity: 'warning' as const }),
      };
    });
  },
};
