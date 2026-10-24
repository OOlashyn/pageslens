import type { Scope } from '../model/kinds.js';
import { compareText as compare } from '../model/normalize.js';
import type {
  Site,
  TablePermission,
  WebPageRule,
  WebRole,
  WebsiteAccess,
} from '../model/schema.js';

export type Privileges = TablePermission['privileges'];
export type Privilege = keyof Privileges;

export const PRIVILEGES: readonly Privilege[] = [
  'read',
  'write',
  'create',
  'delete',
  'append',
  'appendto',
];

/** Why a parent-scope permission's chain can't be followed up to a non-parent permission. */
export type ChainBreak =
  | { reason: 'no-parent-reference'; at: TablePermission }
  | { reason: 'missing-parent'; at: TablePermission; parentId: string }
  | { reason: 'cycle'; at: TablePermission };

export interface PermissionNode {
  permission: TablePermission;
  roles: WebRole[];
  /** Role GUIDs on the permission that match no web role in the site. */
  unknownRoleIds: string[];
  /** Parent scope only: the parent permissions, nearest first. Empty for other scopes. */
  ancestors: TablePermission[];
  /** Parent scope only: set when the chain stops before a non-parent permission. */
  chainBreak?: ChainBreak;
  /**
   * Whether the permission grants anything: it has a role and, for parent scope, a whole chain
   * whose permissions all have a role. Only effective permissions produce grants.
   */
  effective: boolean;
}

/** One effective permission giving one role privileges on one table. */
export interface Grant {
  role: WebRole;
  table: string;
  scope: Scope;
  privileges: Privileges;
  permission: TablePermission;
  ancestors: TablePermission[];
}

export interface RoleUsage {
  permissions: TablePermission[];
  pageRules: WebPageRule[];
  websiteAccess: WebsiteAccess[];
}

export interface AccessGraph {
  roles: WebRole[];
  permissions: PermissionNode[];
  role(id: string): WebRole | undefined;
  permission(id: string): PermissionNode | undefined;
  /** Every grant to a role, sorted by table, then permission name. */
  grants(roleId: string): Grant[];
  /** Every grant on a table, sorted by role name, then permission name. */
  grantsOn(table: string): Grant[];
  /** Roles that some permission gives `privilege` on `table`, sorted by name. */
  rolesFor(table: string, privilege: Privilege): WebRole[];
  /** Where a role is referenced: permissions, page access rules, website access. */
  usage(roleId: string): RoleUsage;
}

export function buildAccessGraph(site: Site): AccessGraph {
  const rolesById = new Map(site.webRoles.map((role) => [role.id, role]));
  const permissionsById = new Map(site.tablePermissions.map((p) => [p.id, p]));

  const nodes = site.tablePermissions.map((permission): PermissionNode => {
    const roles = permission.roleIds.flatMap((id) => rolesById.get(id) ?? []);
    const node: PermissionNode = {
      permission,
      roles,
      unknownRoleIds: permission.roleIds.filter((id) => !rolesById.has(id)),
      ancestors: [],
      effective: false,
    };
    if (permission.scope === 'parent') {
      const chain = followChain(permission, permissionsById);
      node.ancestors = chain.ancestors;
      if (chain.chainBreak) node.chainBreak = chain.chainBreak;
    }
    return node;
  });
  const nodesById = new Map(nodes.map((node) => [node.permission.id, node]));
  for (const node of nodes) {
    node.effective =
      node.roles.length > 0 &&
      !node.chainBreak &&
      node.ancestors.every((parent) => (nodesById.get(parent.id)?.roles.length ?? 0) > 0);
  }

  const allGrants = nodes
    .filter((node) => node.effective)
    .flatMap((node) =>
      node.roles.map((role): Grant => ({
        role,
        table: node.permission.table,
        scope: node.permission.scope,
        privileges: node.permission.privileges,
        permission: node.permission,
        ancestors: node.ancestors,
      })),
    );
  const byPermissionName = (a: Grant, b: Grant) => compare(a.permission.name, b.permission.name);

  return {
    roles: site.webRoles,
    permissions: nodes,
    role: (id) => rolesById.get(id.toLowerCase()),
    permission: (id) => nodesById.get(id.toLowerCase()),
    grants: (roleId) =>
      allGrants
        .filter((grant) => grant.role.id === roleId.toLowerCase())
        .sort((a, b) => compare(a.table, b.table) || byPermissionName(a, b)),
    grantsOn: (table) =>
      allGrants
        .filter((grant) => grant.table === table)
        .sort((a, b) => compare(a.role.name, b.role.name) || byPermissionName(a, b)),
    rolesFor: (table, privilege) => {
      const roles = new Map<string, WebRole>();
      for (const grant of allGrants) {
        if (grant.table === table && grant.privileges[privilege])
          roles.set(grant.role.id, grant.role);
      }
      return [...roles.values()].sort((a, b) => compare(a.name, b.name));
    },
    usage: (roleId) => {
      const id = roleId.toLowerCase();
      return {
        permissions: site.tablePermissions.filter((p) => p.roleIds.includes(id)),
        pageRules: site.webPageRules.filter((r) => r.roleIds.includes(id)),
        websiteAccess: site.websiteAccess.filter((a) => a.roleIds.includes(id)),
      };
    },
  };
}

function followChain(
  permission: TablePermission,
  permissionsById: Map<string, TablePermission>,
): Pick<PermissionNode, 'ancestors' | 'chainBreak'> {
  const ancestors: TablePermission[] = [];
  const seen = new Set([permission.id]);
  let current = permission;
  while (current.scope === 'parent') {
    if (!current.parentPermissionId) {
      return { ancestors, chainBreak: { reason: 'no-parent-reference', at: current } };
    }
    const parent = permissionsById.get(current.parentPermissionId);
    if (!parent) {
      return {
        ancestors,
        chainBreak: { reason: 'missing-parent', at: current, parentId: current.parentPermissionId },
      };
    }
    if (seen.has(parent.id)) return { ancestors, chainBreak: { reason: 'cycle', at: current } };
    seen.add(parent.id);
    ancestors.push(parent);
    current = parent;
  }
  return { ancestors };
}
