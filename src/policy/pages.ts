import {
  describeAudience,
  normalizeUrl,
  passes,
  publishersOf,
  ruleLabel,
  type Audience,
  type PageGraph,
  type PageNode,
  type RuleNode,
} from '../graph/pages.js';
import type { Site, WebRole } from '../model/schema.js';
import { closest } from '../util/closest.js';
import type { Evidence } from './evaluate.js';
import type { Check, PageRef, Who } from './types.js';

// Page statements (specs/0006-page-access-test-diff.md), read with the same words as table
// statements: `authenticated` in `cannot` and `only` means any signed-in user, and in `can` the
// Authenticated Users role itself; a custom role's members are signed in.

type PageCheck = Extract<Check, { kind: 'page' }>;

/** Who can read (or publish) a page, as one thing to name in a message. */
type Reader = { kind: 'anyone' } | { kind: 'signed-in' } | { kind: 'role'; role: WebRole };

/** Why a page statement can't be checked at all; undefined when it can. */
export function pageError(site: Site, pages: PageGraph, ref: PageRef): string | undefined {
  if (site.layout !== 'classic') {
    return "page access rules don't apply to code sites, so pageslens can't check page statements there";
  }
  const found = pages.atUrl(ref.url);
  if (found.length === 1) return undefined;
  const url = normalizeUrl(ref.url);
  if (found.length > 1) {
    const names = found.map((node) => `"${node.page.name}"`).join(', ');
    return `${found.length} active web pages have the URL ${url} (${names})`;
  }
  const inactive = pages.inactive.find((p) => normalizeUrl(p.url) === url);
  if (inactive) return `the web page at ${url} ("${inactive.page.name}") is inactive`;
  const suggestion = closest(
    url,
    pages.pages.map((node) => node.url),
  );
  return `no web page has the URL ${url}${suggestion ? ` (did you mean "${suggestion}"?)` : ''}`;
}

/** The pages a statement is about: one page, or a page and every page below it. */
function pagesOf(pages: PageGraph, ref: PageRef): PageNode[] {
  const [top] = pages.atUrl(ref.url);
  if (!top || ref.kind === 'page') return top ? [top] : [];
  return pages.pages.filter((node) => node.url.toLowerCase().startsWith(top.url.toLowerCase()));
}

export function checkPage(
  check: PageCheck,
  pages: PageGraph,
  role: (name: string) => WebRole,
): Evidence[] {
  return pagesOf(pages, check.page).flatMap((node) => checkOne(check, node, pages, role));
}

function checkOne(
  check: PageCheck,
  node: PageNode,
  pages: PageGraph,
  role: (name: string) => WebRole,
): Evidence[] {
  const audience = check.action === 'read' ? node.readers : publishersOf(node);
  const verb = check.action;
  if (!audience) {
    const at = node.pathBreak!.at;
    return [
      {
        message: `who can ${verb} ${node.url} is unknown: the page tree above "${at.name}" is broken`,
        file: at.source.file,
        recordId: at.id,
      },
    ];
  }

  switch (check.form) {
    case 'can': {
      const who = check.who[0]!;
      if (canAct(audience, who, role)) return [];
      return [cantEvidence(node, who, role, check.action, pages)];
    }
    case 'cannot': {
      const offenders = readersOf(audience).filter((r) => offends(r, check.who[0]!, role));
      return offenders.map((r) => whyEvidence(node, r, check.action, pages));
    }
    case 'only': {
      const offenders = readersOf(audience).filter((r) => !allowedBy(check.who, r, role));
      return offenders.map((r) => whyEvidence(node, r, check.action, pages));
    }
    case 'nobody':
      return readersOf(audience).map((r) => whyEvidence(node, r, check.action, pages));
  }
}

/** `anonymous`: anyone. `authenticated`: the Authenticated Users role itself. A role: its members. */
function canAct(audience: Audience, who: Who, role: (name: string) => WebRole): boolean {
  switch (who.kind) {
    case 'anonymous':
      return audience.kind === 'anyone';
    case 'authenticated':
      return audience.kind !== 'roles';
    case 'role':
      return passes(audience, role(who.name));
  }
}

/** The audiences that can act, broadest first: anyone, every signed-in user, or each role. */
function readersOf(audience: Audience): Reader[] {
  if (audience.kind !== 'roles') return [audience];
  return audience.roles.map((role) => ({ kind: 'role', role }));
}

/** Whether `reader` breaks `who cannot …`. Strict: any signed-in user counts for `authenticated`. */
function offends(reader: Reader, who: Who, role: (name: string) => WebRole): boolean {
  switch (who.kind) {
    case 'anonymous':
      return reader.kind === 'anyone';
    case 'authenticated':
      return true;
    case 'role': {
      const named = role(who.name);
      if (reader.kind === 'role') return reader.role.id === named.id;
      return reader.kind === 'anyone' || !named.anonymous;
    }
  }
}

/** Whether an `only` list allows `reader`. Anyone needs both `anonymous` and `authenticated`. */
function allowedBy(list: Who[], reader: Reader, role: (name: string) => WebRole): boolean {
  // A built-in role named in the list stands for its word
  const kinds = new Set(
    list.map((who) => {
      if (who.kind !== 'role') return who.kind;
      const named = role(who.name);
      return named.anonymous ? 'anonymous' : named.authenticated ? 'authenticated' : 'role';
    }),
  );
  switch (reader.kind) {
    case 'anyone':
      return kinds.has('anonymous') && kinds.has('authenticated');
    case 'signed-in':
      return kinds.has('authenticated');
    case 'role':
      return (
        kinds.has('authenticated') ||
        list.some((who) => who.kind === 'role' && role(who.name).id === reader.role.id)
      );
  }
}

function label(reader: Reader): string {
  if (reader.kind === 'anyone') return 'anyone';
  if (reader.kind === 'signed-in') return 'every signed-in user';
  return `"${reader.role.name}"`;
}

/** Why `reader` can act on the page: the rule that lets it in, or the page when none restricts it. */
function whyEvidence(
  node: PageNode,
  reader: Reader,
  action: PageCheck['action'],
  pages: PageGraph,
): Evidence {
  const verb = action;
  const passer = (rule: RuleNode) =>
    reader.kind === 'role'
      ? passes(rule.audience, reader.role)
      : reader.kind === 'signed-in'
        ? rule.audience.kind !== 'roles'
        : rule.audience.kind === 'anyone';
  const grant = node.grantChanges.find(passer);
  if (grant) {
    return ruleEvidence(
      `${label(reader)} can ${verb} ${node.url} through ${ruleLabel(grant.rule)} on ${pages.pageOf(grant)!.url}`,
      grant,
    );
  }
  const restriction = node.restrictions.find(passer);
  if (restriction) {
    return ruleEvidence(
      `${label(reader)} can ${verb} ${node.url}: ${ruleLabel(restriction.rule)} on ${pages.pageOf(restriction)!.url} lets ${reader.kind === 'role' ? 'it' : 'them'} in`,
      restriction,
    );
  }
  return {
    message: `${label(reader)} can ${verb} ${node.url}: no Restrict Read rule on it or above it`,
    file: node.page.source.file,
    recordId: node.page.id,
  };
}

/** Why `who` can't act on the page: the rule that keeps it out, or no Grant Change for publish. */
function cantEvidence(
  node: PageNode,
  who: Who,
  role: (name: string) => WebRole,
  action: PageCheck['action'],
  pages: PageGraph,
): Evidence {
  const name = who.kind === 'role' ? `"${who.name}"` : who.kind;
  if (action === 'publish') {
    return {
      message: `${name} can't publish ${node.url}: no Grant Change rule on it or above it lets ${who.kind === 'role' ? 'it' : 'them'} in`,
      file: node.page.source.file,
      recordId: node.page.id,
    };
  }
  const blocks = (rule: RuleNode) =>
    who.kind === 'anonymous'
      ? true
      : who.kind === 'authenticated'
        ? rule.audience.kind === 'roles'
        : !passes(rule.audience, role(who.name));
  const blocker = node.restrictions.find(blocks)!;
  return ruleEvidence(
    `${name} can't read ${node.url}: ${ruleLabel(blocker.rule)} on ${pages.pageOf(blocker)!.url} lets in ${describeAudience(blocker.audience)}`,
    blocker,
  );
}

function ruleEvidence(message: string, rule: RuleNode): Evidence {
  return { message, file: rule.rule.source.file, recordId: rule.rule.id };
}
