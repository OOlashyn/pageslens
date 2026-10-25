import { PRIVILEGES, type PermissionNode, type Privilege } from '../graph/access.js';
import { grantSentence, plain, type Part } from '../graph/describe.js';
import {
  buildPageGraph,
  describeAudience,
  normalizeUrl,
  publishersOf,
  RIGHTS,
  ruleLabel,
  type Audience as PageAudience,
  type PageGraph,
  type PageNode,
  type RuleNode,
} from '../graph/pages.js';
import type { WebApiTable } from '../graph/webapi.js';
import { lint } from '../lint/engine.js';
import type { Scope } from '../model/kinds.js';
import { compareText as compare } from '../model/normalize.js';
import type { Site, SiteSetting, WebRole } from '../model/schema.js';
import { reachDetails, siteFacts, type GrantFact, type Reach, type SiteFacts } from './facts.js';
import {
  CHANGE_CLASSES,
  CHANGE_KINDS,
  type Audience,
  type Change,
  type ChangeClass,
  type ChangeKind,
  type ChangeSource,
} from './types.js';

// Compares the facts of two sides and classifies each difference. Records match by GUID, so
// renamed or moved files aren't changes. The classification is conservative: a change that
// can't be shown to be narrower or neutral is wider.

type Side = 'base' | 'head';

/** Compares head with base: every access change, classified and sorted. */
export function diffSites(base: Site | undefined, head: Site | undefined): Change[] {
  const sides = { base: siteFacts(base), head: siteFacts(head) };
  const roles = matchRoles(sides.base.roles, sides.head.roles);
  const grants = grantItems(sides, roles);
  const ranked = [
    ...roleChanges(roles, sides),
    ...grantChanges(grants, sides, roles),
    ...permissionRenames(grants, sides),
    ...webApiChanges(sides),
    ...settingChanges(sides),
    ...pageChanges(pageSides(base, head), roles, sides),
  ];
  const changes = ranked.sort((a, b) => compareOrder(a.order, b.order)).map((r) => r.change);
  return head ? withLintHints(changes, head) : changes;
}

/**
 * Wider lines whose head records also trip a lint rule say which, since that link is cheap and
 * useful. The rules run at their default severities; a pageslens.config.yaml isn't read.
 */
function withLintHints(changes: Change[], head: Site): Change[] {
  const rules = new Map<string, Set<string>>();
  for (const finding of lint(head).findings) {
    rules.set(finding.recordId, (rules.get(finding.recordId) ?? new Set()).add(finding.ruleId));
  }
  return changes.map((change) => {
    if (change.class !== 'wider') return change;
    const ids = new Set(
      change.sources
        .filter((s) => s.side === 'head')
        .flatMap((s) => [...(rules.get(s.recordId) ?? [])]),
    );
    if (ids.size === 0) return change;
    const hint = [...ids].sort(compare);
    return {
      ...change,
      message: [...change.message, ` (also reported by lint: ${hint.join(', ')})`],
      lint: hint,
    };
  });
}

export function summarize(changes: Change[]): Record<ChangeClass, number> {
  const count = (cls: ChangeClass) => changes.filter((c) => c.class === cls).length;
  return { wider: count('wider'), narrower: count('narrower'), neutral: count('neutral') };
}

/** A change with its sort key: class, audience, role, then what the change is about. */
interface Ranked {
  change: Change;
  order: (string | number)[];
}

const SCOPE_ORDER: Scope[] = ['global', 'account', 'contact', 'parent', 'self', 'unknown'];

function compareOrder(a: (string | number)[], b: (string | number)[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? '';
    const y = b[i] ?? '';
    const d =
      typeof x === 'number' && typeof y === 'number' ? x - y : compare(String(x), String(y));
    if (d !== 0) return d;
  }
  return 0;
}

function audienceOf(role: WebRole): Audience {
  return role.anonymous ? 'anonymous' : role.authenticated ? 'authenticated' : 'role';
}

const AUDIENCE_ORDER: Audience[] = ['anonymous', 'authenticated', 'role'];

/** Most exposed first: Anonymous Users, Authenticated Users, other roles by name, then no role. */
function audienceOrder(role: WebRole | undefined): (string | number)[] {
  return role ? [AUDIENCE_ORDER.indexOf(audienceOf(role)), role.name] : [AUDIENCE_ORDER.length, ''];
}

function rank(change: Change, about: WebRole | undefined, rest: (string | number)[]): Ranked {
  return {
    change,
    order: [
      CHANGE_CLASSES.indexOf(change.class),
      ...audienceOrder(about),
      ...rest,
      plain(change.message),
    ],
  };
}

/** Non-grant changes sort after a role's grants, by kind, then by table or setting. */
function otherOrder(kind: ChangeKind, subject = ''): (string | number)[] {
  return [1, CHANGE_KINDS.indexOf(kind), 0, subject];
}

function roleRef(role: WebRole): NonNullable<Change['role']> {
  return { id: role.id, name: role.name, audience: audienceOf(role) };
}

function source(side: Side, record: { id: string; name: string; source: { file: string } }) {
  return { side, recordId: record.id, name: record.name, file: record.source.file };
}

// --- Roles ---------------------------------------------------------------------------------

interface RolePair {
  /** The key grants are compared under: the base id, for a role both sides have. */
  key: string;
  base?: WebRole;
  head?: WebRole;
}

interface RoleMatch {
  keyOf(side: Side, role: WebRole): string;
  pair(key: string): RolePair;
  pairs: RolePair[];
}

/**
 * Pairs base and head roles: by GUID; then the Anonymous Users and Authenticated Users roles by
 * their flag; then by name, when exactly one removed and one added role share it.
 */
function matchRoles(base: WebRole[], head: WebRole[]): RoleMatch {
  const baseIds = new Set(base.map((r) => r.id));
  const headIds = new Set(head.map((r) => r.id));
  const headToBase = new Map<string, string>();
  let unmatchedBase = base.filter((r) => !headIds.has(r.id));
  let unmatchedHead = head.filter((r) => !baseIds.has(r.id));
  const pairUp = (b: WebRole, h: WebRole) => {
    headToBase.set(h.id, b.id);
    unmatchedBase = unmatchedBase.filter((r) => r !== b);
    unmatchedHead = unmatchedHead.filter((r) => r !== h);
  };
  for (const flag of ['anonymous', 'authenticated'] as const) {
    const b = unmatchedBase.filter((r) => r[flag]);
    const h = unmatchedHead.filter((r) => r[flag]);
    if (b.length === 1 && h.length === 1) pairUp(b[0]!, h[0]!);
  }
  // Iterates the list as it was: pairing replaces unmatchedBase with a new array
  for (const b of unmatchedBase) {
    const sameBase = unmatchedBase.filter((r) => r.name === b.name);
    const sameHead = unmatchedHead.filter((r) => r.name === b.name);
    if (sameBase.length === 1 && sameHead.length === 1) pairUp(b, sameHead[0]!);
  }

  const keyOf = (side: Side, role: WebRole) =>
    side === 'base' ? role.id : (headToBase.get(role.id) ?? role.id);
  const pairs = new Map<string, RolePair>(base.map((r) => [r.id, { key: r.id, base: r }]));
  for (const role of head) {
    const key = keyOf('head', role);
    pairs.set(key, { key, ...pairs.get(key), head: role });
  }
  return { keyOf, pair: (key) => pairs.get(key)!, pairs: [...pairs.values()] };
}

function roleChanges(roles: RoleMatch, sides: Sides): Ranked[] {
  const changes: Ranked[] = [];
  const add = (
    cls: ChangeClass,
    kind: ChangeKind,
    role: WebRole,
    message: string,
    sources: ChangeSource[],
  ) => {
    const change: Change = { class: cls, kind, message: [message], role: roleRef(role), sources };
    changes.push(rank(change, role, otherOrder(kind)));
  };

  for (const { base, head } of roles.pairs) {
    if (!head) {
      const how = sides.head.inactive.has(base!.id) ? 'deactivated' : 'removed';
      add('neutral', 'role-removed', base!, `Role "${base!.name}" ${how}`, [source('base', base!)]);
      continue;
    }
    if (!base) {
      const how = sides.base.inactive.has(head.id) ? 'activated' : 'added';
      add('neutral', 'role-added', head, `Role "${head.name}" ${how}`, [source('head', head)]);
      continue;
    }
    const sources = [source('head', head)];
    if (base.id !== head.id) {
      const as = base.name === head.name ? '' : ` as "${head.name}"`;
      add(
        'neutral',
        'role-recreated',
        head,
        `Role "${base.name}" recreated with a new id${as}`,
        sources,
      );
    } else if (base.name !== head.name) {
      add(
        'neutral',
        'role-renamed',
        head,
        `Role "${base.name}" renamed to "${head.name}"`,
        sources,
      );
    }
    const flags = [
      ['anonymous', 'the Anonymous Users role', 'every visitor'],
      ['authenticated', 'the Authenticated Users role', 'every signed-in user'],
    ] as const;
    for (const [flag, label, who] of flags) {
      if (!base[flag] && head[flag]) {
        add(
          'wider',
          'role-audience-changed',
          head,
          `"${head.name}" is now ${label}: its grants now apply to ${who}`,
          sources,
        );
      } else if (base[flag] && !head[flag]) {
        add(
          'narrower',
          'role-audience-changed',
          head,
          `"${head.name}" is no longer ${label}: its grants no longer apply to ${who}`,
          sources,
        );
      }
    }
  }
  return changes;
}

// --- Grants --------------------------------------------------------------------------------

/** One (role, table, scope, privilege) that differs, before privileges are joined into lines. */
interface GrantItem {
  kind: 'gained' | 'lost' | 'rows' | 'source' | 'scope';
  class: ChangeClass;
  roleKey: string;
  table: string;
  scope: Scope;
  fromScope?: Scope;
  privilege: Privilege;
  base: GrantFact[];
  head: GrantFact[];
  /** Why it was gained or lost, or why it's neutral. */
  notes: string[];
}

type Sides = Record<Side, SiteFacts>;

const keyOf = (roleKey: string, table: string, scope: Scope, privilege: Privilege) =>
  [roleKey, table, scope, privilege].join('\0');

const ids = (facts: GrantFact[]) =>
  [...new Set(facts.map((f) => f.node.permission.id))].sort(compare).join(',');

function grantItems(sides: Sides, roles: RoleMatch): GrantItem[] {
  const index = (side: Side) => {
    const map = new Map<string, GrantFact[]>();
    for (const fact of sides[side].grants) {
      const key = keyOf(roles.keyOf(side, fact.role), fact.table, fact.scope, fact.privilege);
      map.set(key, [...(map.get(key) ?? []), fact]);
    }
    return map;
  };
  const base = index('base');
  const head = index('head');
  const keys = [...new Set([...base.keys(), ...head.keys()])].sort(compare);

  const items: GrantItem[] = [];
  for (const key of keys) {
    const [roleKey, table, scope, privilege] = key.split('\0') as [
      string,
      string,
      Scope,
      Privilege,
    ];
    const b = base.get(key) ?? [];
    const h = head.get(key) ?? [];
    const item = { roleKey, table, scope, privilege, base: b, head: h, notes: [] };
    const global = keyOf(roleKey, table, 'global', privilege);
    if (b.length > 0 && h.length > 0) {
      const reach = (facts: GrantFact[]) => [...new Set(facts.map((f) => f.reach))].sort().join();
      if (reach(b) !== reach(h)) items.push({ ...item, kind: 'rows', class: 'wider' });
      else if (ids(b) !== ids(h)) items.push({ ...item, kind: 'source', class: 'neutral' });
    } else if (h.length > 0) {
      const covered = scope !== 'global' && base.has(global);
      items.push({
        ...item,
        kind: 'gained',
        class: covered ? 'neutral' : 'wider',
        notes: covered ? ['already has it at global scope'] : [],
      });
    } else {
      const covered = scope !== 'global' && head.has(global);
      items.push({
        ...item,
        kind: 'lost',
        class: covered ? 'neutral' : 'narrower',
        notes: covered ? ['still has it at global scope'] : [],
      });
    }
  }
  return pairScopeChanges(items, sides, roles);
}

/**
 * A permission whose scope changed loses its grants at the old scope and gains them at the new
 * one: shown as one line, wider when the gain is wider, narrower when the loss is narrower.
 */
function pairScopeChanges(items: GrantItem[], sides: Sides, roles: RoleMatch): GrantItem[] {
  const paired = new Set<GrantItem>();
  const result: GrantItem[] = [];
  const gained = items.filter((i) => i.kind === 'gained');
  for (const lost of items.filter((i) => i.kind === 'lost')) {
    const permissions = new Set(lost.base.map((f) => f.node.permission.id));
    const match = gained.find(
      (g) =>
        !paired.has(g) &&
        g.roleKey === lost.roleKey &&
        g.table === lost.table &&
        g.privilege === lost.privilege &&
        g.head.some((f) => permissions.has(f.node.permission.id)),
    );
    if (!match) continue;
    paired.add(match).add(lost);
    result.push({
      ...match,
      kind: 'scope',
      class: match.class === 'wider' ? 'wider' : lost.class === 'narrower' ? 'narrower' : 'neutral',
      fromScope: lost.scope,
      base: lost.base,
      notes: [],
    });
  }
  for (const item of items) {
    if (paired.has(item)) continue;
    if (item.kind === 'gained' || item.kind === 'lost') {
      const cause = causeOf(item, sides, roles);
      if (cause) item.notes.unshift(cause);
    }
    result.push(item);
  }
  return result;
}

/** Why a grant was gained or lost, when its permissions all tell the same story. */
function causeOf(item: GrantItem, sides: Sides, roles: RoleMatch): string | undefined {
  const [from, to]: [Side, Side] = item.kind === 'lost' ? ['base', 'head'] : ['head', 'base'];
  const otherRole = roles.pair(item.roleKey)[to];
  const causes = new Set(
    item[from].map((fact) => {
      const id = fact.node.permission.id;
      const other = sides[to].permissions.get(id);
      if (!other && sides[to].inactive.has(id)) {
        return item.kind === 'lost' ? 'deactivated' : 'activated';
      }
      return item.kind === 'lost'
        ? lostCause(item, other, otherRole)
        : gainedCause(item, fact.node, other, otherRole);
    }),
  );
  return causes.size === 1 ? [...causes][0] : undefined;
}

function lostCause(
  item: GrantItem,
  now: PermissionNode | undefined,
  role: WebRole | undefined,
): string | undefined {
  if (!now) return 'removed';
  if (!role) return 'the role was removed';
  if (!now.effective) {
    return now.roles.length === 0
      ? 'the permission has no web role now'
      : 'the parent chain is broken now';
  }
  if (now.permission.table !== item.table)
    return `the permission is now on ${now.permission.table}`;
  if (!now.roles.some((r) => r.id === role.id)) {
    return now.rolesInherited
      ? 'the parent permission no longer has the role'
      : 'the role was taken off the permission';
  }
  if (!now.permission.privileges[item.privilege]) return 'the privilege was turned off';
  if (now.permission.scope !== item.scope) {
    return `the permission is now at ${now.permission.scope} scope`;
  }
  return undefined;
}

function gainedCause(
  item: GrantItem,
  node: PermissionNode,
  before: PermissionNode | undefined,
  role: WebRole | undefined,
): string | undefined {
  if (!before || !role) return undefined;
  if (!before.effective) {
    if (before.roles.length === 0) return 'the permission had no web role';
    const top = node.ancestors.at(-1);
    return top
      ? `the chain under "${top.name}" is now complete`
      : 'the parent chain is now complete';
  }
  if (before.permission.table !== item.table) {
    return `the permission was on ${before.permission.table}`;
  }
  if (!before.roles.some((r) => r.id === role.id)) {
    return before.rolesInherited || node.rolesInherited
      ? 'the parent permission now has the role'
      : 'the role was added to the permission';
  }
  if (!before.permission.privileges[item.privilege]) return 'the privilege was turned on';
  if (before.permission.scope !== item.scope) {
    return `the permission was at ${before.permission.scope} scope`;
  }
  return undefined;
}

function grantChanges(items: GrantItem[], sides: Sides, roles: RoleMatch): Ranked[] {
  const groups = Map.groupBy(items, (item) =>
    [
      item.kind,
      item.class,
      item.roleKey,
      item.table,
      item.scope,
      item.fromScope ?? '',
      ids(item.base),
      ids(item.head),
      item.notes.join('\0'),
    ].join('\0'),
  );
  return [...groups.values()].map((group) => grantLine(group, sides, roles));
}

const KIND_OF: Record<GrantItem['kind'], (cls: ChangeClass) => ChangeKind> = {
  gained: () => 'grant-gained',
  lost: () => 'grant-lost',
  rows: () => 'grant-rows-changed',
  source: () => 'grant-source-changed',
  scope: (cls) =>
    cls === 'wider' ? 'grant-gained' : cls === 'narrower' ? 'grant-lost' : 'grant-source-changed',
};

function grantLine(group: GrantItem[], sides: Sides, roles: RoleMatch): Ranked {
  const item = group[0]!;
  const privileges = PRIVILEGES.filter((p) => group.some((i) => i.privilege === p));
  const pair = roles.pair(item.roleKey);
  const role = (pair.head ?? pair.base)!;
  const webApiEnabled = sides.head.webApi.get(item.table)?.enabled ?? false;
  const facts = item.kind === 'lost' ? item.base : item.head;

  const names = (list: GrantFact[]) =>
    [...new Set(list.map((f) => f.node.permission.name))].sort(compare).join('", "');
  const sentence = (verb: string, list: GrantFact[]) =>
    grantSentence(
      verb,
      {
        role,
        table: item.table,
        scope: item.scope,
        permission: { name: names(list) },
        ancestors: list[0]!.node.ancestors,
      },
      privileges,
    );
  const subject: Part[] = [
    { strong: role.name },
    ': ',
    { strong: privileges.join(', ') },
    ' on ',
    { code: item.table },
  ];

  let message: Part[];
  switch (item.kind) {
    case 'gained':
      message = sentence('gained', item.head);
      break;
    case 'lost':
      message = sentence('lost', item.base);
      break;
    case 'source':
      message = [...sentence('has', item.head), ` instead of "${names(item.base)}"`];
      item.notes.push('same access');
      break;
    case 'scope':
      message = [
        ...subject,
        ` changed from ${item.fromScope} scope to ${item.scope} scope in "${names(item.head)}"`,
      ];
      break;
    case 'rows':
      message = [
        ...subject,
        ` (${item.scope} scope) may reach other rows, as ${reachChange(item)} in "${names(item.head)}"`,
      ];
      break;
  }
  const inherited = inheritedFrom(facts[0]!.node);
  if (inherited && item.kind !== 'scope') message.push(` (inherits roles from "${inherited}")`);
  for (const note of item.notes) message.push(` (${note})`);
  if (webApiEnabled) message.push(' (Web API enabled)');

  const sources = [
    ...(item.kind === 'gained' ? [] : sourcesOf('base', item.base)),
    ...(item.kind === 'lost' ? [] : sourcesOf('head', item.head)),
  ];
  const change: Change = {
    class: item.class,
    kind: KIND_OF[item.kind](item.class),
    message,
    role: roleRef(role),
    table: item.table,
    scope: item.scope,
    ...(item.fromScope && { fromScope: item.fromScope }),
    privileges,
    webApiEnabled,
    sources,
  };
  return rank(change, role, [
    0,
    0,
    SCOPE_ORDER.indexOf(item.scope),
    item.table,
    PRIVILEGES.indexOf(privileges[0]!),
    facts[0]!.node.permission.name,
  ]);
}

function sourcesOf(side: Side, facts: GrantFact[]): ChangeSource[] {
  const seen = new Map<string, ChangeSource>();
  for (const fact of facts) seen.set(fact.node.permission.id, source(side, fact.node.permission));
  return [...seen.values()].sort((a, b) => compare(a.name, b.name) || compare(a.file, b.file));
}

/** The parent a child permission without roles takes its roles from. */
function inheritedFrom(node: PermissionNode): string | undefined {
  if (!node.rolesInherited) return undefined;
  return node.ancestors.find((a) => a.roleIds.length > 0)?.name;
}

/** What changed in the relationships behind a grant, in a few words. */
function reachChange(item: GrantItem): string {
  if (ids(item.base) !== ids(item.head) || item.base.length > 1 || item.head.length > 1) {
    return 'the relationships of its permissions changed';
  }
  const before = reachDetails(item.base[0]!.node);
  const after = reachDetails(item.head[0]!.node);
  const quote = (value: string | undefined) => (value ? `"${value}"` : 'none');
  const changes: string[] = [];
  for (const [key, label] of [
    ['contactRelationship', 'contact'],
    ['accountRelationship', 'account'],
    ['parentRelationship', 'parent'],
  ] as const) {
    if (before[key] !== after[key]) {
      changes.push(
        `the ${label} relationship changed from ${quote(before[key])} to ${quote(after[key])}`,
      );
    }
  }
  if (JSON.stringify(parentsOf(before)) !== JSON.stringify(parentsOf(after))) {
    const [b, a] = [before.parents[0]?.name, after.parents[0]?.name];
    changes.push(
      b !== a
        ? `the parent permission changed from ${quote(b)} to ${quote(a)}`
        : "a parent permission's scope or relationship changed",
    );
  }
  return changes.join(' and ') || 'its relationships changed';
}

const parentsOf = (reach: Reach) => reach.parents.map((p) => [p.table, p.scope, p.reach]);

/** A table permission that kept its GUID but has a new name. */
function permissionRenames(items: GrantItem[], sides: Sides): Ranked[] {
  const touched = new Set(
    items.flatMap((i) => [...i.base, ...i.head].map((f) => f.node.permission.id)),
  );
  const changes: Ranked[] = [];
  for (const [id, now] of sides.head.permissions) {
    const before = sides.base.permissions.get(id);
    if (!before || before.permission.name === now.permission.name) continue;
    const same = touched.has(id) ? '' : ' (same access)';
    const change: Change = {
      class: 'neutral',
      kind: 'grant-source-changed',
      message: [`"${before.permission.name}" renamed to "${now.permission.name}"${same}`],
      table: now.permission.table,
      sources: [source('head', now.permission)],
    };
    changes.push(rank(change, undefined, otherOrder(change.kind, now.permission.table)));
  }
  return changes;
}

// --- Web API -------------------------------------------------------------------------------

function webApiChanges(sides: Sides): Ranked[] {
  const tables = [...new Set([...sides.base.webApi.keys(), ...sides.head.webApi.keys()])];
  const changes: Ranked[] = [];
  for (const table of tables) {
    const before = sides.base.webApi.get(table);
    const after = sides.head.webApi.get(table);
    const add = (
      cls: ChangeClass,
      kind: ChangeKind,
      message: Part[],
      about: WebApiTable,
      setting: SiteSetting | undefined,
      extra: Partial<Change> = {},
    ) => {
      const side: Side = about === after ? 'head' : 'base';
      const change: Change = {
        class: cls,
        kind,
        message,
        table,
        ...extra,
        sources: setting ? [source(side, setting)] : [],
      };
      changes.push(rank(change, mostExposed(about), otherOrder(kind, table)));
    };

    if (!before?.enabled && after?.enabled) {
      add(
        'wider',
        'webapi-enabled',
        ['the Web API is now enabled on ', { code: table }, fieldsNote(after), callersNote(after)],
        after,
        after.enabledSetting,
      );
    } else if (before?.enabled && !after?.enabled) {
      add(
        'narrower',
        'webapi-disabled',
        ['the Web API is no longer enabled on ', { code: table }],
        before,
        before.enabledSetting,
      );
    } else if (before?.enabled && after?.enabled) {
      const setting = after.fieldsSetting ?? before.fieldsSetting;
      const on: Part[] = ['the Web API on ', { code: table }];
      if (!before.wildcard && after.wildcard) {
        add(
          'wider',
          'webapi-fields-wider',
          [...on, ' now exposes every column (fields = *)'],
          after,
          setting,
        );
      } else if (before.wildcard && !after.wildcard) {
        const now = after.fields.length > 0 ? after.fields.join(', ') : 'none';
        add(
          'narrower',
          'webapi-fields-narrower',
          [...on, ` no longer exposes every column: fields are now ${now}`],
          after,
          setting,
        );
      } else if (!after.wildcard) {
        const lower = (fields: string[]) => fields.map((f) => f.toLowerCase());
        const added = lower(after.fields).filter((f) => !lower(before.fields).includes(f));
        const removed = lower(before.fields).filter((f) => !lower(after.fields).includes(f));
        if (added.length > 0) {
          add(
            'wider',
            'webapi-fields-wider',
            [...on, ` now also exposes ${added.join(', ')}`],
            after,
            setting,
            { fields: added },
          );
        }
        if (removed.length > 0) {
          add(
            'narrower',
            'webapi-fields-narrower',
            [...on, ` no longer exposes ${removed.join(', ')}`],
            after,
            setting,
            { fields: removed },
          );
        }
      }
    }
  }
  return changes;
}

function fieldsNote(table: WebApiTable): string {
  return table.wildcard ? ' for every column (fields = *)' : '';
}

function callersNote(table: WebApiTable): string {
  if (table.callers.length === 0) return '; no role has a table permission on it';
  const callers = [...table.callers].sort((a, b) =>
    compareOrder(audienceOrder(a.role), audienceOrder(b.role)),
  );
  const list = callers.map(
    (c) => `${c.role.name} (${PRIVILEGES.filter((p) => c.privileges[p]).join(', ')})`,
  );
  return `; callers: ${list.join(', ')}`;
}

/** The caller whose grants reach the most people, so the change sorts with that audience. */
function mostExposed(table: WebApiTable): WebRole | undefined {
  return table.callers
    .map((c) => c.role)
    .sort((a, b) => compareOrder(audienceOrder(a), audienceOrder(b)))[0];
}

// --- Settings ------------------------------------------------------------------------------

type SettingRule =
  | { name: string; type: 'flag'; widerWhen: 'on' | 'off'; default: boolean }
  | { name: string; type: 'origins' };

/** The settings diff reads, each with the direction that widens access. */
export const DIFF_SETTINGS: SettingRule[] = [
  { name: 'Authentication/Registration/Enabled', type: 'flag', widerWhen: 'on', default: true },
  {
    name: 'Authentication/Registration/OpenRegistrationEnabled',
    type: 'flag',
    widerWhen: 'on',
    default: true,
  },
  {
    name: 'Authentication/Registration/RequiresInvitation',
    type: 'flag',
    widerWhen: 'off',
    default: false,
  },
  { name: 'Webapi/error/innererror', type: 'flag', widerWhen: 'on', default: false },
  { name: 'HTTP/Access-Control-Allow-Origin', type: 'origins' },
];

function settingChanges(sides: Sides): Ranked[] {
  const changes: Ranked[] = [];
  for (const rule of DIFF_SETTINGS) {
    const before = sides.base.settings.get(rule.name.toLowerCase());
    const after = sides.head.settings.get(rule.name.toLowerCase());
    const add = (cls: ChangeClass, message: string) => {
      const kind = cls === 'wider' ? 'setting-wider' : 'setting-narrower';
      const sources = after ? [source('head', after)] : before ? [source('base', before)] : [];
      const change: Change = { class: cls, kind, message: [message], setting: rule.name, sources };
      changes.push(rank(change, undefined, otherOrder(kind, rule.name)));
    };

    if (rule.type === 'flag') {
      const on = (setting: SiteSetting | undefined) => {
        const value = (
          setting ? (setting.value?.trim() ?? '') : String(rule.default)
        ).toLowerCase();
        return rule.default ? value !== 'false' : value === 'true';
      };
      if (on(before) === on(after)) continue;
      const describe = (setting: SiteSetting | undefined) =>
        setting ? `"${setting.value ?? ''}"` : `not set (defaults to ${rule.default})`;
      const turned = on(after) ? 'on' : 'off';
      add(
        turned === rule.widerWhen ? 'wider' : 'narrower',
        `${rule.name} turned ${turned}: was ${describe(before)}, now ${describe(after)}`,
      );
    } else {
      const origins = (setting: SiteSetting | undefined) =>
        (setting?.value ?? '')
          .split(',')
          .map((o) => o.trim().toLowerCase())
          .filter(Boolean);
      const b = origins(before);
      const a = origins(after);
      if (!b.includes('*') && a.includes('*')) {
        add('wider', `${rule.name} now allows any origin (*)`);
      } else if (b.includes('*') && !a.includes('*')) {
        add('narrower', `${rule.name} no longer allows any origin: now ${a.join(', ') || 'none'}`);
      } else if (!a.includes('*')) {
        const added = a.filter((o) => !b.includes(o));
        const removed = b.filter((o) => !a.includes(o));
        if (added.length > 0) add('wider', `${rule.name} now also allows ${added.join(', ')}`);
        if (removed.length > 0)
          add('narrower', `${rule.name} no longer allows ${removed.join(', ')}`);
      }
    }
  }
  return changes;
}

// --- Pages ---------------------------------------------------------------------------------
// Who can read and publish each root page of a classic site (specs/0006), matched by GUID.
// Readers are compared as levels (anyone, every signed-in user, a set of roles), so a change
// says who gained or lost; a change shared by a page and the pages below it is one line, on
// the topmost page.

/** The page graphs to compare: none unless every side that has a site is classic. */
function pageSides(
  base: Site | undefined,
  head: Site | undefined,
): Record<Side, PageGraph | undefined> | undefined {
  const present = [base, head].filter((site) => site !== undefined);
  if (present.length === 0 || present.some((site) => site.layout !== 'classic')) return undefined;
  return {
    base: base && buildPageGraph(base),
    head: head && buildPageGraph(head),
  };
}

/** 2: anyone, 1: every signed-in user, 0: a set of roles. */
function level(audience: PageAudience): number {
  return audience.kind === 'anyone' ? 2 : audience.kind === 'signed-in' ? 1 : 0;
}

/** One page's line before collapsing: what changed for whom, and on which page. */
interface PageItem {
  kind: ChangeKind;
  class: ChangeClass;
  /** Who the line is about: a role key, `anyone` or `signed-in`; empty for page-level lines. */
  who: string;
  /** The role to sort by and name. */
  about?: WebRole;
  page: { id: string; url: string; parentId?: string };
  /** The sentence after the URL. */
  tail: string;
  /** Sentence before the URL. */
  head: string;
  sources: ChangeSource[];
}

function pageChanges(
  graphs: Record<Side, PageGraph | undefined> | undefined,
  roles: RoleMatch,
  sides: Sides,
): Ranked[] {
  if (!graphs) return [];
  const empty: PageNode[] = [];
  const nodes = {
    base: new Map((graphs.base?.pages ?? empty).map((n) => [n.page.id, n])),
    head: new Map((graphs.head?.pages ?? empty).map((n) => [n.page.id, n])),
  };
  const inactive = {
    base: new Set(graphs.base?.inactive.map((p) => p.page.id)),
    head: new Set(graphs.head?.inactive.map((p) => p.page.id)),
  };
  const builtIn = (flag: 'anonymous' | 'authenticated') =>
    sides.head.roles.find((r) => r[flag]) ?? sides.base.roles.find((r) => r[flag]);

  const items: PageItem[] = [];
  const ids = new Set([...nodes.base.keys(), ...nodes.head.keys()]);
  for (const id of ids) {
    const before = nodes.base.get(id);
    const after = nodes.head.get(id);
    const node = (after ?? before)!;
    const side: Side = after ? 'head' : 'base';
    const page = {
      id,
      url: node.url,
      ...(node.ancestors[0] && { parentId: node.ancestors[0].id }),
    };
    const pageSource = source(side, node.page);

    if (!after) {
      const how = inactive.head.has(id) ? 'deactivated' : 'removed';
      items.push({
        kind: 'page-removed',
        class: 'narrower',
        who: '',
        page,
        head: 'Page ',
        tail: ` ${how}`,
        sources: [pageSource],
      });
      continue;
    }
    if (before && normalizeUrl(before.url) !== normalizeUrl(after.url)) {
      items.push({
        kind: 'page-moved',
        class: 'neutral',
        who: '',
        page,
        head: `Page "${after.page.name}" moved from ${before.url} to `,
        tail: '',
        sources: [pageSource],
      });
    }

    const causes = before
      ? ruleCauses(before, after)
      : { text: inactive.base.has(id) ? 'page activated' : 'new page', sources: [] };
    const why = causes.text;
    const causeSources = causes.sources.length > 0 ? causes.sources : [pageSource];

    // Readers that become, or stop being, unknown
    if (!after.readers || (before && !before.readers)) {
      if (before && !before.readers && !after.readers) continue;
      items.push({
        kind: 'page-readers-unknown',
        class: 'wider',
        who: '',
        page,
        head: 'Who can read ',
        tail: after.readers
          ? ` is known again: ${describeAudience(after.readers)}`
          : ` is now unknown: the page tree above "${after.pathBreak!.at.name}" is broken`,
        sources: [source('head', after.pathBreak?.at ?? after.page)],
      });
      continue;
    }

    const nobody: PageAudience = { kind: 'roles', roles: [] };
    for (const [verb, of] of [
      ['read', (n: PageNode) => n.readers!],
      ['publish', (n: PageNode) => publishersOf(n)!],
    ] as const) {
      const was = before ? of(before) : nobody;
      const now = of(after);
      const gained = verb === 'read' ? 'page-read-gained' : 'page-publish-gained';
      const lost = verb === 'read' ? 'page-read-lost' : 'page-publish-lost';
      const push = (kind: ChangeKind, who: string, about: WebRole | undefined, name: string) => {
        const wider = kind === gained;
        items.push({
          kind,
          class: wider ? 'wider' : 'narrower',
          who,
          ...(about && { about }),
          page,
          head: `${name} can ${wider ? 'now' : 'no longer'} ${verb} `,
          tail: `: ${why}`,
          sources: causeSources,
        });
      };
      const named = (lvl: number) =>
        lvl === 2
          ? { who: 'anyone', role: builtIn('anonymous'), name: 'Anyone' }
          : { who: 'signed-in', role: builtIn('authenticated'), name: 'Every signed-in user' };
      if (level(now) > level(was)) {
        const n = named(level(now));
        push(gained, n.who, n.role, n.name);
      } else if (level(now) < level(was)) {
        const n = named(level(was));
        push(lost, n.who, n.role, n.name);
      }
      if (now.kind === 'roles' && was.kind === 'roles') {
        const key = (s: Side, r: WebRole) => roles.keyOf(s, r);
        const wasKeys = new Set(was.roles.map((r) => key('base', r)));
        const nowKeys = new Set(now.roles.map((r) => key('head', r)));
        for (const r of now.roles) {
          if (!wasKeys.has(key('head', r))) push(gained, key('head', r), r, `"${r.name}"`);
        }
        for (const r of was.roles) {
          if (!nowKeys.has(key('base', r))) push(lost, key('base', r), r, `"${r.name}"`);
        }
      }
    }

    if (!before) {
      if (after.readers.kind === 'roles' && after.readers.roles.length === 0) {
        items.push({
          kind: 'page-added',
          class: 'neutral',
          who: '',
          page,
          head: 'Page ',
          tail: ` ${inactive.base.has(id) ? 'activated' : 'added'}: nobody can read it`,
          sources: [pageSource],
        });
      }
      continue;
    }

    // Same readers and publishers, from other rules
    const rulesKey = (n: PageNode) =>
      [...n.restrictions, ...n.grantChanges]
        .map((r) => `${r.rule.id}:${r.rule.name}:${roleSet(r)}`)
        .sort()
        .join(',');
    const sameAccess = !items.some((i) => i.page.id === id && i.kind !== 'page-moved');
    if (sameAccess && rulesKey(before) !== rulesKey(after)) {
      items.push({
        kind: 'page-rules-changed',
        class: 'neutral',
        who: '',
        page,
        head: 'Same access to ',
        tail: ` from other rules: ${why}`,
        sources: causeSources,
      });
    }
  }

  return [...collapse(items), ...ruleScopeChanges(graphs)];
}

/** What changed in the rules on a page's path, and the rule records behind it. */
function ruleCauses(before: PageNode, after: PageNode): { text: string; sources: ChangeSource[] } {
  const rulesOf = (n: PageNode) =>
    new Map([...n.restrictions, ...n.grantChanges].map((r) => [r.rule.id, r]));
  const was = rulesOf(before);
  const now = rulesOf(after);
  const causes: string[] = [];
  const sources: ChangeSource[] = [];
  for (const [id, r] of now) {
    const old = was.get(id);
    const cause = !old
      ? `${ruleLabel(r.rule)} added`
      : roleSet(old) !== roleSet(r)
        ? `the roles of ${ruleLabel(r.rule)} changed`
        : old.rule.name !== r.rule.name
          ? `${ruleLabel(old.rule)} renamed to "${r.rule.name}"`
          : undefined;
    if (!cause) continue;
    causes.push(cause);
    sources.push(source('head', r.rule));
  }
  for (const [id, r] of was) {
    if (now.has(id)) continue;
    causes.push(`${ruleLabel(r.rule)} removed`);
    sources.push(source('base', r.rule));
  }
  return { text: causes.join('; ') || 'the page moved', sources };
}

const roleSet = (r: RuleNode) =>
  r.roles
    .map((role) => role.id)
    .sort()
    .join(',');

function dedupeSources(sources: ChangeSource[]): ChangeSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.side}:${s.recordId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * One line per branch: an item whose parent page has the same kind, audience and cause is
 * folded into the parent's line, which counts the pages below it and lists them (`pages`).
 */
function collapse(items: PageItem[]): Ranked[] {
  const keyOf = (item: PageItem, pageId: string) =>
    [item.kind, item.who, item.tail, pageId].join('\0');
  const byKey = new Map(items.map((item) => [keyOf(item, item.page.id), item]));
  const topOf = (item: PageItem): PageItem => {
    let top = item;
    for (;;) {
      const parent = top.page.parentId && byKey.get(keyOf(item, top.page.parentId));
      // Page-level lines (added, removed, moved) are about one page each
      if (!parent || !item.who) return top;
      top = parent;
    }
  };
  const below = new Map<PageItem, PageItem[]>();
  for (const item of items) {
    const top = topOf(item);
    if (top !== item) below.set(top, [...(below.get(top) ?? []), item]);
  }
  const folded = new Set([...below.values()].flat());

  return items
    .filter((item) => !folded.has(item))
    .map((item) => {
      const rest = (below.get(item) ?? []).sort((a, b) => compare(a.page.url, b.page.url));
      const count =
        rest.length === 0
          ? ''
          : ` (and ${rest.length} ${rest.length === 1 ? 'page' : 'pages'} below it)`;
      const change: Change = {
        class: item.class,
        kind: item.kind,
        message: [item.head, { code: item.page.url }, count, item.tail],
        ...(item.about && { role: roleRef(item.about) }),
        page: item.page.url,
        ...(rest.length > 0 && { pages: [item.page.url, ...rest.map((r) => r.page.url)] }),
        sources: dedupeSources([...item.sources, ...rest.flatMap((r) => r.sources)]),
      };
      return rank(change, item.about, otherOrder(item.kind, item.page.url));
    });
}

/**
 * A rule's scope decides only the web files directly under its page: Restrict Read set to
 * exclude them, or Grant Change set to include them, is wider.
 */
function ruleScopeChanges(graphs: Record<Side, PageGraph | undefined>): Ranked[] {
  if (!graphs.base || !graphs.head) return [];
  const before = new Map(graphs.base.rules.map((r) => [r.rule.id, r]));
  const changes: Ranked[] = [];
  for (const now of graphs.head.rules) {
    const was = before.get(now.rule.id);
    const page = graphs.head.pageOf(now);
    if (!was || !page) continue;
    const scope = (r: RuleNode) => r.rule.scope ?? 1;
    if (scope(was) === scope(now)) continue;
    const excludes = scope(now) === 2;
    const restrict = now.rule.right === RIGHTS.restrictRead;
    const kind: ChangeKind = 'page-rule-scope-changed';
    const change: Change = {
      class: restrict === excludes ? 'wider' : 'narrower',
      kind,
      message: [
        `${ruleLabel(now.rule)} on `,
        { code: page.url },
        excludes
          ? ' no longer covers the web files directly under the page'
          : ' now covers the web files directly under the page',
      ],
      page: page.url,
      sources: [source('head', now.rule)],
    };
    changes.push(rank(change, undefined, otherOrder(kind, page.url)));
  }
  return changes;
}
