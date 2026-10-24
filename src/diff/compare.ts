import { PRIVILEGES, type PermissionNode, type Privilege } from '../graph/access.js';
import { grantSentence, plain, type Part } from '../graph/describe.js';
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
    ...roleChanges(roles),
    ...grantChanges(grants, sides, roles),
    ...permissionRenames(grants, sides),
    ...webApiChanges(sides),
    ...settingChanges(sides),
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

function roleChanges(roles: RoleMatch): Ranked[] {
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
      add('neutral', 'role-removed', base!, `Role "${base!.name}" removed`, [
        source('base', base!),
      ]);
      continue;
    }
    if (!base) {
      add('neutral', 'role-added', head, `Role "${head.name}" added`, [source('head', head)]);
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
      const other = sides[to].permissions.get(fact.node.permission.id);
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
