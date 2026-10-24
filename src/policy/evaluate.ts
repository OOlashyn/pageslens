import { buildAccessGraph, type Grant, type Privilege } from '../graph/access.js';
import { buildWebApiSurface, type WebApiTable } from '../graph/webapi.js';
import type { Site, SiteSetting, WebRole } from '../model/schema.js';
import { PolicyError } from './parse.js';
import type { Check, Policy, Statement, TableRef, Who } from './types.js';

/** Something in the site that makes a statement fail, and where it is. */
export interface Evidence {
  message: string;
  /** Site file, relative to the site folder; absent for a setting that isn't there. */
  file?: string;
  recordId?: string;
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
  const context = new Context(
    site,
    graph.roles.flatMap((role) => graph.grants(role.id)),
    webApi,
  );

  const problems = policy.statements.flatMap((statement) =>
    whoOf(statement.check).flatMap((who) => {
      const error = who.kind === 'role' ? context.roleError(who.name) : undefined;
      return error ? [`${policy.path}:${statement.line}: ${error}: ${statement.text}`] : [];
    }),
  );
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
  if (check.kind === 'only') return check.who;
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

  private matching(
    roles: WebRole[] | undefined,
    check: { privileges: Privilege[]; table: TableRef; scope?: string },
  ): Grant[] {
    const ids = roles && new Set(roles.map((r) => r.id));
    return this.grants.filter(
      (g) =>
        (!ids || ids.has(g.role.id)) &&
        (check.table.kind === 'any' || g.table === check.table.name) &&
        (!check.scope || g.scope === check.scope) &&
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
        return this.webApi
          .filter((t) => t.enabled && t.wildcard)
          .map((t) => ({
            message: `Web API on ${t.table} exposes every column (fields = *)`,
            ...settingRef(t.fieldsSetting),
          }));
      case 'only-enabled':
        return this.webApi
          .filter((t) => t.enabled && !check.tables.includes(t.table))
          .map(enabledEvidence);
      case 'not-enabled':
        return this.webApi
          .filter((t) => t.enabled && (check.table.kind === 'any' || t.table === check.table.name))
          .map(enabledEvidence);
      case 'call':
        return this.call(check.who, check.negated, check.table);
      case 'registration-invite-only':
        return this.registration();
      case 'setting':
        return this.setting(check);
    }
  }

  private can(
    who: Who,
    check: { privileges: Privilege[]; table: TableRef; scope?: string },
  ): Evidence[] {
    const label = whoLabel(who);
    const roles = this.rolesOf(who, false);
    const held = new Map<string, Set<Privilege>>();
    for (const grant of this.matching(roles, check)) {
      const privileges = held.get(grant.table) ?? new Set();
      for (const p of check.privileges) if (grant.privileges[p]) privileges.add(p);
      held.set(grant.table, privileges);
    }
    const scope = check.scope ? ` at ${check.scope} scope` : '';
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
      evidence.push({ ...found, message: `has: ${found.message}` });
    }
    return evidence;
  }

  private call(who: Who, negated: boolean, table: TableRef): Evidence[] {
    const enabled = this.webApi.filter(
      (t) => t.enabled && (table.kind === 'any' || t.table === table.name),
    );
    const label = whoLabel(who);
    if (negated) {
      const ids = new Set(this.rolesOf(who, true).map((r) => r.id));
      return enabled.flatMap((t) =>
        t.callers
          .filter((c) => ids.has(c.role.id))
          .map((c) => ({
            message: `${c.role.name} can call the Web API on ${t.table} (${privilegeList(c.privileges)})`,
            ...settingRef(t.enabledSetting),
          })),
      );
    }
    const ids = new Set(this.rolesOf(who, false).map((r) => r.id));
    if (enabled.some((t) => t.callers.some((c) => ids.has(c.role.id)))) return [];
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
    const describe = (
      key: keyof typeof REGISTRATION,
      found: { setting: SiteSetting | undefined; value: string },
    ) =>
      found.setting
        ? {
            message: `${REGISTRATION[key].name} is "${found.setting.value ?? ''}"`,
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
    switch (check.op) {
      case 'is-set':
        return present ? [] : fail(`${check.name} isn't set`);
      case 'is-not-set':
        return present ? fail(`${check.name} is set to "${setting.value ?? ''}"`) : [];
      case 'is':
        if (!present) return fail(`${check.name} isn't set`);
        return sameValue(value!, check.value!)
          ? []
          : fail(`${check.name} is "${setting.value ?? ''}"`);
      case 'is-not':
        return present && sameValue(value!, check.value!)
          ? fail(`${check.name} is "${setting.value ?? ''}"`)
          : [];
    }
  }

  warnings(check: Check): string[] {
    const tables: string[] = [];
    if ('table' in check && check.table.kind === 'table') tables.push(check.table.name);
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

function grantEvidence(grant: Grant, privileges: Privilege[]): Evidence {
  const granted = privileges.filter((p) => grant.privileges[p]);
  const via = grant.ancestors.length > 0 ? `, under "${grant.ancestors.at(-1)!.name}"` : '';
  return {
    message: `${grant.role.name} has ${granted.join(', ')} on ${grant.table} (${grant.scope} scope) from "${grant.permission.name}"${via}`,
    file: grant.permission.source.file,
    recordId: grant.permission.id,
  };
}

function enabledEvidence(table: WebApiTable): Evidence {
  return {
    message: `the Web API is enabled on ${table.table}`,
    ...settingRef(table.enabledSetting),
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

/** The candidate within two edits of `name` (ignoring case), if there's exactly one best. */
function closest(name: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of candidates) {
    const d = distance(name.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}
