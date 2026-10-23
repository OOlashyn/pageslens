import type { Scope } from '../model/kinds.js';
import { compareText as compare } from '../model/normalize.js';
import type { Site, SiteSetting, WebRole } from '../model/schema.js';
import { PRIVILEGES, type AccessGraph, type Privileges } from './access.js';

/** `Webapi/<table>/enabled` and `Webapi/<table>/fields`; site setting names are case-insensitive. */
const WEBAPI_SETTING = /^webapi\/(?<table>[^/]+)\/(?<key>enabled|fields)$/i;

export interface WebApiCaller {
  role: WebRole;
  /** Union of the privileges every permission gives this role on the table. */
  privileges: Privileges;
  scopes: Scope[];
}

export interface WebApiTable {
  table: string;
  enabled: boolean;
  /** Columns from the fields setting, in the order written; `*` stays as an entry. */
  fields: string[];
  wildcard: boolean;
  enabledSetting?: SiteSetting;
  fieldsSetting?: SiteSetting;
  /** Roles with a table permission on this table, sorted by name. */
  callers: WebApiCaller[];
}

/** Every table with a Web API setting, sorted by table name. */
export function buildWebApiSurface(site: Site, graph: AccessGraph): WebApiTable[] {
  const tables = new Map<string, WebApiTable>();

  for (const setting of site.siteSettings) {
    const match = WEBAPI_SETTING.exec(setting.name);
    if (!match?.groups) continue;
    const name = match.groups.table!.toLowerCase();
    const entry = tables.get(name) ?? {
      table: name,
      enabled: false,
      fields: [],
      wildcard: false,
      callers: [],
    };
    if (match.groups.key!.toLowerCase() === 'enabled') {
      entry.enabled = setting.value?.trim().toLowerCase() === 'true';
      entry.enabledSetting = setting;
    } else {
      entry.fields = (setting.value ?? '')
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean);
      entry.wildcard = entry.fields.includes('*');
      entry.fieldsSetting = setting;
    }
    tables.set(name, entry);
  }

  for (const entry of tables.values()) entry.callers = callersOf(entry.table, graph);
  return [...tables.values()].sort((a, b) => compare(a.table, b.table));
}

function callersOf(table: string, graph: AccessGraph): WebApiCaller[] {
  const callers = new Map<string, WebApiCaller>();
  for (const grant of graph.grantsOn(table)) {
    const caller = callers.get(grant.role.id) ?? {
      role: grant.role,
      privileges: Object.fromEntries(PRIVILEGES.map((p) => [p, false])) as Privileges,
      scopes: [],
    };
    for (const privilege of PRIVILEGES) {
      if (grant.privileges[privilege]) caller.privileges[privilege] = true;
    }
    if (!caller.scopes.includes(grant.scope)) caller.scopes.push(grant.scope);
    callers.set(grant.role.id, caller);
  }
  return [...callers.values()];
}
