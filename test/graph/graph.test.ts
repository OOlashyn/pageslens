import { describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder } from '../../src/adapters/site-folder.js';
import { buildAccessGraph } from '../../src/graph/access.js';
import { buildWebApiSurface } from '../../src/graph/webapi.js';
import type { Site, TablePermission } from '../../src/model/schema.js';

const ecoflux = await loadSiteFolder('test/fixtures/ecoflux');
const broken = await loadSiteFolder('test/fixtures/broken');

const roleId = (site: Site, name: string) => site.webRoles.find((r) => r.name === name)!.id;
const names = (items: { name: string }[]) => items.map((item) => item.name);

describe('access graph: ecoflux', () => {
  const graph = buildAccessGraph(ecoflux);

  it('lists the grants of a role by table', () => {
    const grants = graph.grants(roleId(ecoflux, 'Asset Manager'));
    expect(grants.map((g) => [g.table, g.scope, g.permission.name])).toEqual([
      ['dwcrm_asset', 'account', 'Asset - Asset Manager CRUD'],
      ['dwcrm_conditionlog', 'account', 'Condition Log - Asset Manager CRUD'],
      ['dwcrm_marketplacelisting', 'account', 'Marketplace Listing - Asset Manager CRUD'],
    ]);
  });

  it('gives Authenticated Users global read on four tables', () => {
    const grants = graph.grants(roleId(ecoflux, 'Authenticated Users'));
    expect(grants.map((g) => g.table)).toEqual([
      'dwcrm_asset',
      'dwcrm_chainofcustody',
      'dwcrm_conditionlog',
      'dwcrm_marketplacelisting',
    ]);
    expect(grants.every((g) => g.scope === 'global' && g.privileges.read)).toBe(true);
    expect(grants.some((g) => g.privileges.write || g.privileges.create)).toBe(false);
  });

  it('finds the roles with a privilege on a table', () => {
    expect(names(graph.rolesFor('dwcrm_asset', 'read'))).toEqual([
      'Asset Manager',
      'Authenticated Users',
      'Logistics Partner',
    ]);
    expect(names(graph.rolesFor('dwcrm_asset', 'write'))).toEqual(['Asset Manager']);
    expect(graph.rolesFor('contact', 'read')).toEqual([]);
  });

  it('records where each role is used', () => {
    const admins = graph.usage(roleId(ecoflux, 'Administrators'));
    expect(admins.permissions).toEqual([]);
    expect(names(admins.pageRules)).toEqual(['Grant Change to Administrators']);
    expect(names(admins.websiteAccess)).toEqual(['Administrative permissions for Blank Template']);

    const anonymous = graph.usage(roleId(ecoflux, 'Anonymous Users'));
    expect([anonymous.permissions, anonymous.pageRules, anonymous.websiteAccess]).toEqual([
      [],
      [],
      [],
    ]);
  });

  it('looks up roles and permissions by GUID in any case', () => {
    expect(graph.role('8D3EE430-C7BB-4F7F-A78D-0DFA33902898')?.name).toBe('Authenticated Users');
    expect(
      graph.permission('08AA7EB7-F93F-40AB-B07D-1118581767D8')?.roles.map((r) => r.name),
    ).toEqual(['Asset Manager']);
  });
});

describe('access graph: parent chains', () => {
  const graph = buildAccessGraph(broken);
  const node = (name: string) => graph.permissions.find((n) => n.permission.name === name)!;

  it('follows a working chain to its root', () => {
    const child = node('Incident Comment - Case Manager Parent');
    expect(names(child.ancestors)).toEqual(['Incident - Case Manager Contact']);
    expect(child.chainBreak).toBeUndefined();
  });

  it('reports a parent that does not exist', () => {
    expect(node('Comment - Missing Parent').chainBreak).toMatchObject({
      reason: 'missing-parent',
      parentId: '00000000-0000-0000-0002-0000000000ff',
    });
  });

  it('follows a chain to a parent with no role without calling it broken', () => {
    const child = node('Note - Parent Without Role');
    expect(names(child.ancestors)).toEqual(['Incident - No Role']);
    expect(child.chainBreak).toBeUndefined();
    expect(node('Incident - No Role').roles).toEqual([]);
  });

  it('marks only permissions that grant something as effective, and only those produce grants', () => {
    expect(
      graph.permissions
        .filter((n) => !n.effective)
        .map((n) => n.permission.name)
        .sort(),
    ).toEqual(['Comment - Missing Parent', 'Incident - No Role', 'Note - Parent Without Role']);
    const caseManager = graph.grants(roleId(broken, 'Case Manager')).map((g) => g.permission.name);
    expect(caseManager).not.toContain('Comment - Missing Parent');
    expect(caseManager).not.toContain('Note - Parent Without Role');
  });

  it('carries the chain onto grants', () => {
    const grant = graph
      .grants(roleId(broken, 'Case Manager'))
      .find((g) => g.permission.name === 'Incident Comment - Case Manager Parent');
    expect(names(grant!.ancestors)).toEqual(['Incident - Case Manager Contact']);
  });

  it('stops on a cycle and on a parent-scope permission with no parent reference', () => {
    const base = broken.tablePermissions[0]!;
    const permission = (id: string, parentPermissionId?: string): TablePermission => ({
      ...base,
      id,
      name: id,
      scope: 'parent',
      scopeValue: 756150003,
      parentPermissionId,
    });
    const site: Site = {
      ...broken,
      tablePermissions: [
        permission('a', 'b'),
        permission('b', 'a'),
        permission('orphan', undefined),
      ],
    };
    const cyclic = buildAccessGraph(site);
    expect(cyclic.permission('a')?.chainBreak?.reason).toBe('cycle');
    expect(names(cyclic.permission('a')!.ancestors)).toEqual(['b']);
    expect(cyclic.permission('orphan')?.chainBreak?.reason).toBe('no-parent-reference');
  });

  it('keeps role GUIDs that match no role', () => {
    const site: Site = {
      ...broken,
      tablePermissions: [
        { ...broken.tablePermissions[0]!, roleIds: ['00000000-0000-0000-0001-0000000000ff'] },
      ],
    };
    const only = buildAccessGraph(site).permissions[0]!;
    expect(only.roles).toEqual([]);
    expect(only.unknownRoleIds).toEqual(['00000000-0000-0000-0001-0000000000ff']);
  });
});

describe('web api surface', () => {
  it('lists the ecoflux tables with explicit fields and their callers', () => {
    const surface = buildWebApiSurface(ecoflux, buildAccessGraph(ecoflux));
    expect(surface.map((t) => [t.table, t.enabled, t.wildcard])).toEqual([
      ['dwcrm_asset', true, false],
      ['dwcrm_chainofcustody', true, false],
      ['dwcrm_conditionlog', true, false],
      ['dwcrm_marketplacelisting', true, false],
    ]);
    const asset = surface[0]!;
    expect(asset.fields).toContain('dwcrm_assetname');
    expect(asset.callers.map((c) => [c.role.name, c.scopes, c.privileges.write])).toEqual([
      ['Asset Manager', ['account'], true],
      ['Authenticated Users', ['global'], false],
      ['Logistics Partner', ['global'], false],
    ]);
  });

  it('ignores Webapi settings that are not per-table enabled or fields', () => {
    const surface = buildWebApiSurface(ecoflux, buildAccessGraph(ecoflux));
    expect(surface.some((t) => t.table === 'error')).toBe(false);
  });

  it('flags a wildcard and shows a table no permission covers', () => {
    const surface = buildWebApiSurface(broken, buildAccessGraph(broken));
    const byTable = new Map(surface.map((t) => [t.table, t]));
    expect(byTable.get('contact')).toMatchObject({ enabled: true, wildcard: true, fields: ['*'] });
    expect(byTable.get('dwcrm_invoice')).toMatchObject({ enabled: true, callers: [] });
    expect(byTable.get('incident')?.callers.map((c) => c.role.name)).toEqual(['Case Manager']);
  });
});
