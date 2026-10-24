import {
  buildAccessGraph,
  PRIVILEGES,
  type PermissionNode,
  type Privilege,
} from '../graph/access.js';
import { buildWebApiSurface, type WebApiTable } from '../graph/webapi.js';
import type { Scope } from '../model/kinds.js';
import type { Site, SiteSetting, TablePermission, WebRole } from '../model/schema.js';

// A site reduced to the facts diff compares: effective grants one privilege at a time, the Web
// API surface, roles and site settings. A side with no site has no facts.

/** One privilege an effective permission gives one role on one table. */
export interface GrantFact {
  role: WebRole;
  table: string;
  scope: Scope;
  privilege: Privilege;
  node: PermissionNode;
  /** Which rows it reaches beyond table and scope: the relationships its scope uses. */
  reach: string;
}

export interface SiteFacts {
  roles: WebRole[];
  permissions: Map<string, PermissionNode>;
  grants: GrantFact[];
  webApi: Map<string, WebApiTable>;
  /** By lower-cased name; the first of duplicate names, as `test` reads them. */
  settings: Map<string, SiteSetting>;
}

export function siteFacts(site: Site | undefined): SiteFacts {
  const facts: SiteFacts = {
    roles: [],
    permissions: new Map(),
    grants: [],
    webApi: new Map(),
    settings: new Map(),
  };
  if (!site) return facts;

  const graph = buildAccessGraph(site);
  facts.roles = site.webRoles;
  for (const node of graph.permissions) facts.permissions.set(node.permission.id, node);
  for (const node of graph.permissions) {
    if (!node.effective) continue;
    const reach = reachOf(node);
    for (const role of node.roles) {
      for (const privilege of PRIVILEGES) {
        if (!node.permission.privileges[privilege]) continue;
        const { table, scope } = node.permission;
        facts.grants.push({ role, table, scope, privilege, node, reach });
      }
    }
  }
  for (const table of buildWebApiSurface(site, graph)) facts.webApi.set(table.table, table);
  for (const setting of site.siteSettings) {
    const key = setting.name.toLowerCase();
    if (!facts.settings.has(key)) facts.settings.set(key, setting);
  }
  return facts;
}

/** The relationships a permission's scope uses, and for parent scope, its whole chain's. */
export interface Reach {
  contactRelationship?: string | undefined;
  accountRelationship?: string | undefined;
  parentRelationship?: string | undefined;
  parents: { name: string; table: string; scope: Scope; reach: Omit<Reach, 'parents'> }[];
}

export function reachDetails(node: PermissionNode): Reach {
  return {
    ...ownReach(node.permission),
    parents: node.ancestors.map((parent) => ({
      name: parent.name,
      table: parent.table,
      scope: parent.scope,
      reach: ownReach(parent),
    })),
  };
}

function ownReach(permission: TablePermission): Omit<Reach, 'parents'> {
  switch (permission.scope) {
    case 'contact':
      return { contactRelationship: permission.contactRelationship };
    case 'account':
      return { accountRelationship: permission.accountRelationship };
    case 'parent':
      return { parentRelationship: permission.parentRelationship };
    default:
      return {};
  }
}

function reachOf(node: PermissionNode): string {
  const { parents, ...own } = reachDetails(node);
  return JSON.stringify([own, parents.map(({ table, scope, reach }) => [table, scope, reach])]);
}
