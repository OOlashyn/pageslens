import {
  RIGHTS,
  RULE_SCOPES,
  type Audience,
  type PageGraph,
  type PageNode,
  type RuleNode,
} from '../graph/pages.js';
import { compareText as compare } from '../model/normalize.js';
import type { Site, WebPageRule } from '../model/schema.js';
import { code, GENERATED_NOTE, table } from './markdown.js';

const RIGHT_LABELS: Record<number, string> = {
  [RIGHTS.grantChange]: 'Grant Change',
  [RIGHTS.restrictRead]: 'Restrict Read',
};

/** Who can read each root page of a classic site, and the rules that decide it. */
export function renderPages(site: Site, pages: PageGraph): string {
  const lines = [
    `# Pages: ${site.website.name}`,
    '',
    GENERATED_NOTE,
    '',
    'Who can read each page, from the page access rules. A rule applies to its page and every page below it. ' +
      'With no Restrict Read rule on the way down, anyone can open a page. ' +
      'A user needs one role of every Restrict Read rule on the way down: pageslens assumes nested rules narrow access, which is still to be checked in an environment. ' +
      'A Grant Change role can read its whole branch, whatever Restrict Read says. ' +
      'Each page stands for all its language versions.',
    '',
  ];

  if (pages.pages.length === 0) {
    lines.push('The site has no active web pages.', '');
  } else {
    lines.push(
      table(
        ['Page', 'URL', 'Who can read', 'Restrict Read', 'Grant Change', 'Site map'],
        pages.pages.map((node) => [
          node.page.name,
          code(node.url),
          readersLabel(node),
          rulesLabel(pages, node, node.restrictions),
          rulesLabel(
            pages,
            node,
            node.grantChanges.filter((r) => r.roles.length > 0),
          ),
          node.page.hiddenFromSitemap ? 'hidden' : '',
        ]),
      ),
      '',
    );
  }

  const grants = pages.rules.filter(
    (r) => r.rule.right === RIGHTS.grantChange && r.page && r.roles.length > 0,
  );
  if (grants.length > 0) {
    lines.push(
      '## Grant Change',
      '',
      'These roles can publish changes to, and read, the page and every page below it.',
      '',
      table(
        ['Rule', 'Page', 'Roles'],
        grants.map((r) => [r.rule.name, code(pages.pageOf(r)!.url), roleList(r)]),
      ),
      '',
    );
  }

  if (pages.rules.length > 0) {
    lines.push(
      '## Page access rules',
      '',
      'Scope only matters for the web files directly under the page: "Exclude direct child web files" leaves them out of the rule.',
      '',
      table(
        ['Rule', 'Right', 'Page', 'Roles', 'Scope'],
        [...pages.rules]
          .sort((a, b) => compare(a.rule.name, b.rule.name) || compare(a.rule.id, b.rule.id))
          .map((r) => [
            r.rule.name,
            rightLabel(r.rule),
            r.page ? code(pages.pageOf(r)!.url) : 'none (applies to nothing)',
            roleList(r),
            scopeLabel(r.rule),
          ]),
      ),
      '',
    );
  }

  const inactivePages = site.inactive.webPages.filter((page) => page.isRoot);
  const inactiveRules = site.inactive.webPageRules;
  if (inactivePages.length + inactiveRules.length > 0) {
    lines.push(
      '## Inactive',
      '',
      "These are left out above: an inactive rule restricts and grants nothing, and an inactive page can't be opened.",
      '',
      ...inactivePages.map((page) => `- Web page "${page.name}"`),
      ...inactiveRules.map((rule) => `- ${rightLabel(rule)} rule "${rule.name}"`),
      '',
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function readersLabel(node: PageNode): string {
  const at = node.pathBreak?.at.name;
  switch (node.pathBreak?.reason) {
    case 'missing-parent':
      return `unknown: the parent of "${at}" isn't in the site`;
    case 'inactive-parent':
      return `nobody: "${node.pathBreak.parent.name}" above it is inactive`;
    case 'cycle':
      return `unknown: the parent pages loop at "${at}"`;
  }
  return audienceLabel(node.readers!);
}

function audienceLabel(audience: Audience): string {
  switch (audience.kind) {
    case 'anyone':
      return 'anyone';
    case 'signed-in':
      return 'every signed-in user';
    case 'roles':
      return audience.roles.length === 0
        ? 'nobody'
        : audience.roles.map((role) => role.name).join(', ');
  }
}

/** Rule names; a rule on a page above says where it is. */
function rulesLabel(pages: PageGraph, node: PageNode, rules: RuleNode[]): string {
  return rules
    .map((r) =>
      r.page?.id === node.page.id
        ? r.rule.name
        : `${r.rule.name} (on ${code(pages.pageOf(r)!.url)})`,
    )
    .join('<br>');
}

function roleList(rule: RuleNode): string {
  const names = rule.roles.map((role) => role.name).sort(compare);
  return names.length > 0 ? names.join(', ') : 'none';
}

function rightLabel(rule: WebPageRule): string {
  return (rule.right !== undefined && RIGHT_LABELS[rule.right]) || `right ${rule.right ?? 'unset'}`;
}

function scopeLabel(rule: WebPageRule): string {
  if (rule.scope === undefined) return '';
  return RULE_SCOPES[rule.scope as keyof typeof RULE_SCOPES] ?? `scope ${rule.scope}`;
}
