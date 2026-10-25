import { compareText as compare } from '../model/normalize.js';
import type { Site, WebPage, WebPageRule, WebRole } from '../model/schema.js';

// Who can read each page, from Microsoft's documented semantics, read conservatively where the
// docs leave a gap (specs/0005-page-access-rules.md):
// - a rule applies to its page and every page below it;
// - with no Restrict Read on the path, anyone can read the page;
// - a user has to pass every Restrict Read on the path (they intersect; to verify), but passing
//   one of several on the same page is enough (Microsoft calls that a conflict and doesn't say);
// - a Grant Change role reads its whole branch, whatever Restrict Read says;
// - a rule listing Anonymous Users is passed by everyone, one listing Authenticated Users by every
//   signed-in user, as are a custom role's members.
// Pages carry access through their root page; content pages (one per language) follow it.

export const RIGHTS = { grantChange: 1, restrictRead: 2 } as const;

/** Rule scope option values; scope only matters for the web files directly under the page. */
export const RULE_SCOPES = { 1: 'All content', 2: 'Exclude direct child web files' } as const;

/** Who passes one rule, or who can read one page. */
export type Audience =
  | { kind: 'anyone' }
  | { kind: 'signed-in' }
  | { kind: 'roles'; roles: WebRole[] };

/** Why a page's path up to the top can't be followed. */
export type PathBreak =
  | { reason: 'missing-parent'; at: WebPage; parentId: string }
  | { reason: 'inactive-parent'; at: WebPage; parent: WebPage }
  /** `at`'s parent is already on the path: `parent` is where the loop closes. */
  | { reason: 'cycle'; at: WebPage; parent: WebPage };

export interface RuleNode {
  rule: WebPageRule;
  /** The root page the rule is on, when it's an active page of the site. */
  page?: WebPage;
  /** The rule's web roles that are in the site, active. */
  roles: WebRole[];
  /** Role GUIDs on the rule that match no active web role in the site. */
  unknownRoleIds: string[];
  /** Who passes the rule: everyone, every signed-in user, or members of its roles. */
  audience: Audience;
}

export interface PageNode {
  page: WebPage;
  /** The URL path, from the chain of partial URLs: `/`, `/courses/edit/`. */
  url: string;
  /** Parent pages, nearest first, as far as the path can be followed. */
  ancestors: WebPage[];
  pathBreak?: PathBreak;
  /** Restrict Read rules on the page and its ancestors, nearest first. */
  restrictions: RuleNode[];
  /** Grant Change rules on the page and its ancestors, nearest first. */
  grantChanges: RuleNode[];
  /**
   * Who can read the page: the intersection of its restrictions plus the Grant Change roles.
   * Undefined when the path is broken: the rules above the break are unknown.
   */
  readers?: Audience;
}

export interface PageGraph {
  /** Active root pages, in URL order. */
  pages: PageNode[];
  rules: RuleNode[];
  page(id: string): PageNode | undefined;
  /** The page node for a rule's page, if it has one. */
  pageOf(rule: RuleNode): PageNode | undefined;
}

export function buildPageGraph(site: Site): PageGraph {
  const rolesById = new Map(site.webRoles.map((role) => [role.id, role]));
  const pagesById = new Map(site.webPages.map((page) => [page.id, page]));
  const inactivePages = new Map(site.inactive.webPages.map((page) => [page.id, page]));
  /** A content page stands for its root page. */
  const rootOf = (page: WebPage | undefined) =>
    page && !page.isRoot && page.rootPageId ? pagesById.get(page.rootPageId) : page;

  const rules = site.webPageRules.map((rule): RuleNode => {
    const roles = rule.roleIds.flatMap((id) => rolesById.get(id) ?? []);
    const page = rootOf(rule.webPageId ? pagesById.get(rule.webPageId) : undefined);
    return {
      rule,
      ...(page && { page }),
      roles,
      unknownRoleIds: rule.roleIds.filter((id) => !rolesById.has(id)),
      audience: audienceOf(roles),
    };
  });
  const rulesOn = Map.groupBy(
    rules.filter((node) => node.page),
    (node) => node.page!.id,
  );

  const nodes = site.webPages
    .filter((page) => page.isRoot)
    .map((page): PageNode => {
      const { ancestors, pathBreak } = followPath(page, pagesById, inactivePages);
      const onPath = [page, ...ancestors].flatMap((p) => rulesOn.get(p.id) ?? []);
      const node: PageNode = {
        page,
        url: urlOf([page, ...ancestors]),
        ancestors,
        restrictions: onPath.filter((r) => r.rule.right === RIGHTS.restrictRead),
        grantChanges: onPath.filter((r) => r.rule.right === RIGHTS.grantChange),
      };
      if (pathBreak) node.pathBreak = pathBreak;
      else node.readers = readersOf(node);
      return node;
    })
    .sort((a, b) => compare(a.url, b.url) || compare(a.page.name, b.page.name));
  const nodesById = new Map(nodes.map((node) => [node.page.id, node]));

  return {
    pages: nodes,
    rules,
    page: (id) => nodesById.get(rootOf(pagesById.get(id.toLowerCase()))?.id ?? ''),
    pageOf: (rule) => (rule.page ? nodesById.get(rule.page.id) : undefined),
  };
}

/** Who passes a rule with these roles. A rule with no role is passed by nobody. */
export function audienceOf(roles: WebRole[]): Audience {
  if (roles.some((role) => role.anonymous)) return { kind: 'anyone' };
  if (roles.some((role) => role.authenticated)) return { kind: 'signed-in' };
  return { kind: 'roles', roles: sortRoles(roles) };
}

/** Whether a member of `role` passes a rule with this audience. */
export function passes(audience: Audience, role: WebRole): boolean {
  switch (audience.kind) {
    case 'anyone':
      return true;
    case 'signed-in':
      return !role.anonymous;
    case 'roles':
      return audience.roles.some((r) => r.id === role.id);
  }
}

function readersOf(node: PageNode): Audience {
  let readers: Audience = { kind: 'anyone' };
  const byPage = Map.groupBy(node.restrictions, (r) => r.page!.id);
  for (const onPage of byPage.values()) {
    readers = intersect(readers, onPage.map((r) => r.audience).reduce(union));
  }
  for (const grant of node.grantChanges) readers = union(readers, grant.audience);
  return readers;
}

function intersect(a: Audience, b: Audience): Audience {
  if (a.kind === 'anyone') return b;
  if (b.kind === 'anyone') return a;
  if (a.kind === 'signed-in') return b.kind === 'signed-in' ? a : b;
  if (b.kind === 'signed-in') return a;
  return { kind: 'roles', roles: a.roles.filter((role) => passes(b, role)) };
}

function union(a: Audience, b: Audience): Audience {
  if (a.kind === 'anyone' || b.kind === 'anyone') return { kind: 'anyone' };
  if (a.kind === 'signed-in' || b.kind === 'signed-in') return { kind: 'signed-in' };
  const roles = new Map([...a.roles, ...b.roles].map((role) => [role.id, role]));
  return { kind: 'roles', roles: sortRoles([...roles.values()]) };
}

const sortRoles = (roles: WebRole[]) => [...roles].sort((a, b) => compare(a.name, b.name));

function followPath(
  page: WebPage,
  pagesById: Map<string, WebPage>,
  inactivePages: Map<string, WebPage>,
): Pick<PageNode, 'ancestors' | 'pathBreak'> {
  const ancestors: WebPage[] = [];
  const seen = new Set([page.id]);
  let current = page;
  while (current.parentPageId) {
    const parentId = current.parentPageId;
    const parent = pagesById.get(parentId);
    if (!parent) {
      const inactive = inactivePages.get(parentId);
      const pathBreak: PathBreak = inactive
        ? { reason: 'inactive-parent', at: current, parent: inactive }
        : { reason: 'missing-parent', at: current, parentId };
      return { ancestors, pathBreak };
    }
    if (seen.has(parent.id)) {
      return { ancestors, pathBreak: { reason: 'cycle', at: current, parent } };
    }
    seen.add(parent.id);
    ancestors.push(parent);
    current = parent;
  }
  return { ancestors };
}

/** `/` for the top page, then each partial URL below it: `/courses/edit/`. */
function urlOf(path: WebPage[]): string {
  const segments = path
    .toReversed()
    .map((page) => (page.partialUrl ?? '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}

/** "Anyone", "every signed-in user", or the role names: for messages and docs. */
export function describeAudience(audience: Audience): string {
  switch (audience.kind) {
    case 'anyone':
      return 'anyone, anonymous visitors included';
    case 'signed-in':
      return 'every signed-in user';
    case 'roles':
      return audience.roles.length === 0 ? 'nobody' : roleNames(audience.roles);
  }
}

/** `Restrict Read rule "Name"`, `Grant Change rule "Name"` or `Page access rule "Name"`. */
export function ruleLabel(rule: WebPageRule): string {
  const kind =
    rule.right === RIGHTS.restrictRead
      ? 'Restrict Read rule'
      : rule.right === RIGHTS.grantChange
        ? 'Grant Change rule'
        : 'Page access rule';
  return `${kind} "${rule.name}"`;
}

/** Role names in quotes, for messages: `"Administrators", "C1 ASP"`. */
export const roleNames = (roles: WebRole[]) => roles.map((role) => `"${role.name}"`).join(', ');
