import { buildAccessGraph, type Grant, type Privilege } from '../graph/access.js';
import { buildPageGraph, type PageGraph } from '../graph/pages.js';
import { grantSentence, plain, settingValue, unknownValue } from '../graph/describe.js';
import { buildWebApiSurface, type WebApiTable } from '../graph/webapi.js';
import type { Site, SiteSetting, WebRole } from '../model/schema.js';
import { closest } from '../util/closest.js';
import { PolicyError } from './parse.js';
import { checkPage, pageError } from './pages.js';
import type { ChainRef, Check, Policy, Statement, TableRef, Who } from './types.js';

/** Something in the site that makes a statement fail, and where it is. */
export interface Evidence {
  message: string;
  /** Site file, relative to the site folder; absent for a setting that isn't there. */
  file?: string;
  recordId?: string;
  /** Background, not a cause: what a role does have, when a `can` statement fails. */
  context?: boolean;
}

export interface StatementResult {
  statement: Statement;
  passed: boolean;
  /** Why it failed; empty when it passed. */
  evidence: Evidence[];
  /** Doesn't change the result, e.g. a table nothing in the site mentions. */
  warnings: string[];
}

export interface TestResult {
  results: StatementResult[];
  counts: { passed: number; failed: number };
}

/** The part of an access statement that picks grants. */
interface GrantFilter {
  privileges: Privilege[];
  table: TableRef;
  scope?: string;
  under?: ChainRef;
  except?: ChainRef;
}

const REGISTRATION = {
  enabled: { name: 'Authentication/Registration/Enabled', default: 'true' },
  open: { name: 'Authentication/Registration/OpenRegistrationEnabled', default: 'true' },
  invitation: { name: 'Authentication/Registration/RequiresInvitation', default: 'false' },
};

/**
 * Checks every statement against the site. Role names that don't match exactly one web role
 * are a `PolicyError`, so a typo can't pass.
 */
export function evaluatePolicy(policy: Policy, site: Site): TestResult {
  const graph = buildAccessGraph(site);
  const webApi = buildWebApiSurface(site, graph);
  const pages = buildPageGraph(site);
  const context = new Context(
    site,
    graph.roles.flatMap((role) => graph.grants(role.id)),
    webApi,
    pages,
  );

  const problems = policy.statements.flatMap((statement) => {
    const at = `${policy.path}:${statement.line}`;
    const errors = whoOf(statement.check).flatMap((who) => {
      const error = who.kind === 'role' ? context.roleError(who.name) : undefined;
      return error ? [`${at}: ${error}: ${statement.text}`] : [];
    });
    const { check } = statement;
    const pageProblem = check.kind === 'page' ? pageError(site, pages, check.page) : undefined;
    return pageProblem ? [...errors, `${at}: ${pageProblem}: ${statement.text}`] : errors;
  });
  if (problems.length > 0) throw new PolicyError(problems);

  const results = policy.statements.map((statement): StatementResult => {
    const evidence = context.check(statement.check);
    return {
      statement,
      passed: evidence.length === 0,
      evidence,
      warnings: context.warnings(statement.check),
    };
  });
  const failed = results.filter((r) => !r.passed).length;
  return { results, counts: { passed: results.length - failed, failed } };
}

function whoOf(check: Check): Who[] {
  if (check.kind === 'can' || check.kind === 'cannot' || check.kind === 'call') return [check.who];
  if (check.kind === 'only' || check.kind === 'page') return check.who;
  return [];
}

class Context {
  private readonly roles: WebRole[];
  private readonly settings = new Map<string, SiteSetting>();
  private readonly usedTables: Set<string>;

  constructor(
    site: Site,
    private readonly grants: Grant[],
    private readonly webApi: WebApiTable[],
    private readonly pages: PageGraph,
  ) {
    this.roles = site.webRoles;
    for (const setting of site.siteSettings) {
      const key = setting.name.toLowerCase();
      if (!this.settings.has(key)) this.settings.set(key, setting);
    }
    this.usedTables = new Set([
      ...site.tablePermissions.map((p) => p.table),
      ...webApi.map((t) => t.table),
    ]);
  }

  roleError(name: string): string | undefined {
    const matches = this.roles.filter((r) => r.name.toLowerCase() === name.toLowerCase());
    if (matches.length === 1) return undefined;
    if (matches.length > 1) return `role "${name}" matches ${matches.length} web roles`;
    const suggestion = closest(
      name,
      this.roles.map((r) => r.name),
    );
    return `unknown role "${name}"${suggestion ? ` (did you mean "${suggestion}"?)` : ''}`;
  }

  private role(name: string): WebRole {
    return this.roles.find((r) => r.name.toLowerCase() === name.toLowerCase())!;
  }

  /**
   * The roles whose grants a user described by `who` has. Members of a custom role are signed
   * in, so they also have the Authenticated Users role. `all` is for "cannot" and "only":
   * `authenticated` then means any signed-in user, so every role but Anonymous Users counts.
   */
  private rolesOf(who: Who, all: boolean): WebRole[] {
    const authenticatedRoles = this.roles.filter((r) => r.authenticated);
    switch (who.kind) {
      case 'anonymous':
        return this.roles.filter((r) => r.anonymous);
      case 'authenticated':
        return all ? this.roles.filter((r) => !r.anonymous) : authenticatedRoles;
      case 'role': {
        const role = this.role(who.name);
        return role.anonymous || role.authenticated ? [role] : [role, ...authenticatedRoles];
      }
    }
  }

  /** The roles an `only` list allows: exactly the roles named, with `authenticated` as every role but Anonymous Users. */
  private allowedBy(who: Who[]): Set<string> {
    return new Set(
      who
        .flatMap((w) => (w.kind === 'role' ? [this.role(w.name)] : this.rolesOf(w, true)))
        .map((r) => r.id),
    );
  }

  private matching(roles: WebRole[] | undefined, check: GrantFilter): Grant[] {
    const ids = roles && new Set(roles.map((r) => r.id));
    return this.grants.filter(
      (g) =>
        (!ids || ids.has(g.role.id)) &&
        (check.table.kind === 'any' || g.table === check.table.name) &&
        (!check.scope || g.scope === check.scope) &&
        (!check.under || throughChain(g, check.under)) &&
        (!check.except || !throughChain(g, check.except)) &&
        check.privileges.some((p) => g.privileges[p]),
    );
  }

  check(check: Check): Evidence[] {
    switch (check.kind) {
      case 'can':
        return this.can(check.who, check);
      case 'cannot':
        return this.matching(this.rolesOf(check.who, true), check).map((g) =>
          grantEvidence(g, check.privileges),
        );
      case 'only': {
        const allowed = this.allowedBy(check.who);
        return this.matching(undefined, check)
          .filter((g) => !allowed.has(g.role.id))
          .map((g) => grantEvidence(g, check.privileges));
      }
      case 'nobody':
        return this.matching(undefined, check).map((g) => grantEvidence(g, check.privileges));
      case 'fields-explicit':
        return this.webApi.filter(mayBeEnabled).flatMap((t) => {
          if (t.unknown.fields) return [unknownEvidence(t.fieldsSetting)];
          if (!t.wildcard) return [];
          if (!t.enabled) return [unknownEvidence(t.enabledSetting)];
          return [
            {
              message: `Web API on ${t.table} exposes every column (fields = *)`,
              ...settingRef(t.fieldsSetting),
            },
          ];
        });
      case 'only-enabled':
        return this.webApi
          .filter((t) => mayBeEnabled(t) && !check.tables.includes(t.table))
          .map(enabledEvidence);
      case 'not-enabled':
        return this.webApi
          .filter(
            (t) => mayBeEnabled(t) && (check.table.kind === 'any' || t.table === check.table.name),
          )
          .map(enabledEvidence);
      case 'call':
        return this.call(check.who, check.negated, check.table);
      case 'registration-invite-only':
        return this.registration();
      case 'setting':
        return this.setting(check);
      case 'page':
        return checkPage(check, this.pages, (name) => this.role(name));
    }
  }

  private can(who: Who, check: GrantFilter): Evidence[] {
    const label = whoLabel(who);
    const roles = this.rolesOf(who, false);
    const held = new Map<string, Set<Privilege>>();
    for (const grant of this.matching(roles, check)) {
      const privileges = held.get(grant.table) ?? new Set();
      for (const p of check.privileges) if (grant.privileges[p]) privileges.add(p);
      held.set(grant.table, privileges);
    }
    const scope =
      (check.scope ? ` at ${check.scope} scope` : '') +
      (check.under ? ` under ${chainText(check.under)}` : '');
    if (check.table.kind === 'any') {
      const complete = [...held.values()].some((p) => p.size === check.privileges.length);
      return complete
        ? []
        : [
            {
              message: `${label} doesn't have ${check.privileges.join(', ')} on any table${scope}`,
            },
          ];
    }
    const has = held.get(check.table.name) ?? new Set();
    const missing = check.privileges.filter((p) => !has.has(p));
    if (missing.length === 0) return [];
    const evidence: Evidence[] = [
      { message: `${label} doesn't have ${missing.join(', ')} on ${check.table.name}${scope}` },
    ];
    for (const grant of this.matching(roles, { ...check, privileges: [...has] })) {
      const found = grantEvidence(grant, [...has]);
      evidence.push({ ...found, message: `has: ${found.message}`, context: true });
    }
    return evidence;
  }

  private call(who: Who, negated: boolean, table: TableRef): Evidence[] {
    const tables = this.webApi.filter((t) => table.kind === 'any' || t.table === table.name);
    const enabled = tables.filter((t) => t.enabled);
    const label = whoLabel(who);
    if (negated) {
      const ids = new Set(this.rolesOf(who, true).map((r) => r.id));
      return tables.filter(mayBeEnabled).flatMap((t) =>
        t.callers
          .filter((c) => ids.has(c.role.id))
          .map((c) => ({
            message: `${c.role.name} can call the Web API on ${t.table} (${privilegeList(c.privileges)})${t.enabled ? '' : ` if it's enabled: ${unknownValue(t.enabledSetting!)}`}`,
            ...settingRef(t.enabledSetting),
          })),
      );
    }
    const ids = new Set(this.rolesOf(who, false).map((r) => r.id));
    if (enabled.some((t) => t.callers.some((c) => ids.has(c.role.id)))) return [];
    const unknown = tables.filter(
      (t) => t.unknown.enabled && t.callers.some((c) => ids.has(c.role.id)),
    );
    if (unknown.length > 0) return unknown.map((t) => unknownEvidence(t.enabledSetting));
    if (table.kind === 'table' && enabled.length === 0) {
      return [{ message: `the Web API isn't enabled on ${table.name}` }];
    }
    const where = table.kind === 'any' ? 'any table' : table.name;
    return [{ message: `${label} has no table permission on ${where} with the Web API enabled` }];
  }

  private value(name: string): { setting?: SiteSetting; value?: string } {
    const setting = this.settings.get(name.toLowerCase());
    return setting ? { setting, value: setting.value?.trim() ?? '' } : {};
  }

  private registration(): Evidence[] {
    const effective = (key: keyof typeof REGISTRATION) => {
      const { setting, value } = this.value(REGISTRATION[key].name);
      return { setting, value: (value ?? REGISTRATION[key].default).toLowerCase() };
    };
    const enabled = effective('enabled');
    const open = effective('open');
    const invitation = effective('invitation');
    if (enabled.value === 'false' || open.value === 'false' || invitation.value === 'true')
      return [];
    const unknown = [enabled, open, invitation].filter((found) => found.setting?.unknown);
    if (unknown.length > 0) return unknown.map((found) => unknownEvidence(found.setting));
    const describe = (
      key: keyof typeof REGISTRATION,
      found: { setting: SiteSetting | undefined; value: string },
    ) =>
      found.setting
        ? {
            message: `${REGISTRATION[key].name} is ${settingValue(found.setting)}`,
            ...settingRef(found.setting),
          }
        : {
            message: `${REGISTRATION[key].name} isn't set (defaults to ${REGISTRATION[key].default})`,
          };
    return [
      { message: 'open registration is on: any visitor can sign up without an invitation' },
      describe('open', open),
      describe('invitation', invitation),
    ];
  }

  private setting(check: Extract<Check, { kind: 'setting' }>): Evidence[] {
    const { setting, value } = this.value(check.name);
    const present = setting !== undefined;
    const fail = (message: string): Evidence[] => [{ message, ...settingRef(setting) }];
    if (setting?.unknown && (check.op === 'is' || check.op === 'is-not')) {
      return fail(unknownValue(setting));
    }
    switch (check.op) {
      case 'is-set':
        return present ? [] : fail(`${check.name} isn't set`);
      case 'is-not-set':
        return present ? fail(`${check.name} is set to ${settingValue(setting)}`) : [];
      case 'is':
        if (!present) return fail(`${check.name} isn't set`);
        return sameValue(value!, check.value!)
          ? []
          : fail(`${check.name} is ${settingValue(setting)}`);
      case 'is-not':
        return present && sameValue(value!, check.value!)
          ? fail(`${check.name} is ${settingValue(setting)}`)
          : [];
    }
  }

  warnings(check: Check): string[] {
    const tables: string[] = [];
    if ('table' in check && check.table.kind === 'table') tables.push(check.table.name);
    if ('under' in check && check.under) tables.push(check.under.table);
    if ('except' in check && check.except) tables.push(check.except.table);
    if (check.kind === 'only-enabled') tables.push(...check.tables);
    return tables
      .filter((t) => !this.usedTables.has(t))
      .map((t) => `${t} isn't used by any table permission or Web API setting in the site`);
  }
}

function whoLabel(who: Who): string {
  if (who.kind === 'anonymous') return 'anonymous';
  if (who.kind === 'authenticated') return 'authenticated';
  return `"${who.name}"`;
}

/**
 * Whether the grant's parent chain has a permission on the chain's table. The nearest one counts,
 * and it must be at the chain's scope when one is given.
 */
function throughChain(grant: Grant, chain: ChainRef): boolean {
  const parent = grant.ancestors.find((p) => p.table === chain.table);
  return parent !== undefined && (!chain.scope || parent.scope === chain.scope);
}

function chainText(chain: ChainRef): string {
  return chain.scope ? `${chain.table} at ${chain.scope} scope` : chain.table;
}

function grantEvidence(grant: Grant, privileges: Privilege[]): Evidence {
  const granted = privileges.filter((p) => grant.privileges[p]);
  return {
    message: plain(grantSentence('has', grant, granted)),
    file: grant.permission.source.file,
    recordId: grant.permission.id,
  };
}

function enabledEvidence(table: WebApiTable): Evidence {
  if (!table.enabled) return unknownEvidence(table.enabledSetting);
  return {
    message: `the Web API is enabled on ${table.table}`,
    ...settingRef(table.enabledSetting),
  };
}

/** Enabled, or enabled by an environment variable whose value a download doesn't include. */
function mayBeEnabled(table: WebApiTable): boolean {
  return table.enabled || table.unknown.enabled;
}

function unknownEvidence(setting: SiteSetting | undefined): Evidence {
  return {
    message: setting ? unknownValue(setting) : 'a setting is unknown',
    ...settingRef(setting),
  };
}

function settingRef(setting: SiteSetting | undefined): Pick<Evidence, 'file' | 'recordId'> {
  return setting ? { file: setting.source.file, recordId: setting.id } : {};
}

function privilegeList(privileges: Record<Privilege, boolean>): string {
  return (Object.keys(privileges) as Privilege[]).filter((p) => privileges[p]).join(', ');
}

/** Compares setting values as text; `true`/`false` ignore case. */
function sameValue(actual: string, expected: string): boolean {
  const a = actual.trim();
  const b = expected.trim();
  const isBool = (v: string) => /^(true|false)$/i.test(v);
  return isBool(a) && isBool(b) ? a.toLowerCase() === b.toLowerCase() : a === b;
}
