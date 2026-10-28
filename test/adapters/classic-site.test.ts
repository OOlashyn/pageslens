import { describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder, SiteLoadError } from '../../src/adapters/site-folder.js';
import { tempFiles } from '../helpers.js';

const CLASSIC = 'test/fixtures/classic';

describe('loadSiteFolder: classic', async () => {
  const site = await loadSiteFolder(CLASSIC);

  it('reads the site folder itself, skipping .portalconfig', () => {
    expect(site.root.replaceAll('\\', '/')).toMatch(/test\/fixtures\/classic$/);
    expect(site.website).toEqual({
      id: 'c9a088bc-3409-48a4-9650-f11fe353b5b6',
      name: 'PageLensPermissionTestEDM - site-43a00',
      source: { file: 'website.yml' },
    });
    expect(site.unrecognizedFiles).toEqual([]);
    expect(site.records.some((r) => r.source.file.startsWith('.portalconfig/'))).toBe(false);
  });

  it('reads one record per item of a root list, keeping the downloaded keys', () => {
    expect(site.webRoles.map((r) => [r.name, r.anonymous, r.authenticated, r.source.file])).toEqual(
      [
        ['Administrators', false, false, 'webrole.yml'],
        ['Anonymous Users', true, false, 'webrole.yml'],
        ['Authenticated Users', false, true, 'webrole.yml'],
        ['Manager', false, false, 'webrole.yml'],
      ],
    );
    const manager = site.records.find((r) => r.kind === 'webrole' && r.name === 'Manager');
    expect(manager?.id).toBe('67095ecd-50cf-f111-a05a-70a8a52c89ad');
    expect(manager?.fields.adx_webroleid).toBe('67095ecd-50cf-f111-a05a-70a8a52c89ad');
  });

  it('maps adx_ keys onto table permissions, blank relationships as absent', () => {
    expect(site.tablePermissions.find((p) => p.name === 'Access to the Accounts Assets')).toEqual({
      id: '9b85ab16-81c6-4b85-a0c9-67aad477a306',
      name: 'Access to the Accounts Assets',
      table: 'dwcrm_asset',
      scope: 'account',
      scopeValue: 756150002,
      privileges: {
        read: true,
        write: false,
        create: false,
        delete: false,
        append: false,
        appendto: false,
      },
      roleIds: ['67095ecd-50cf-f111-a05a-70a8a52c89ad'],
      contactRelationship: undefined,
      accountRelationship: 'dwcrm_asset_OwningAccount_account',
      parentPermissionId: undefined,
      parentRelationship: undefined,
      source: { file: 'table-permissions/Access-to-the-Accounts-Assets.tablepermission.yml' },
    });
    expect(
      site.tablePermissions.find((p) => p.name === 'Access to Assets Condition Logs'),
    ).toMatchObject({
      scope: 'parent',
      roleIds: [],
      parentPermissionId: '9b85ab16-81c6-4b85-a0c9-67aad477a306',
      parentRelationship: 'dwcrm_asset_conditionlog',
    });
  });

  it('types site settings, page rules and website access', () => {
    const byName = new Map(site.siteSettings.map((s) => [s.name, s.value]));
    expect(site.siteSettings).toHaveLength(51);
    expect(byName.get('HTTP/X-Frame-Options')).toBe('SAMEORIGIN');
    expect(byName.has('Authentication/OpenAuth/Microsoft/ClientId')).toBe(true);
    expect(byName.get('Authentication/OpenAuth/Microsoft/ClientId')).toBeUndefined();
    expect(site.webPageRules.map((r) => [r.name, r.right, r.webPageId, r.roleIds])).toEqual([
      [
        'Grant Change to Administrators',
        1,
        '0abe08de-6d38-4bcb-b613-7c2452f93c11',
        ['19289dc7-0368-498f-95b3-4db734ba24a3'],
      ],
      ['Grant Change to Content', 1, undefined, []],
    ]);
    expect(site.websiteAccess.map((a) => [a.name, a.roleIds.length])).toEqual([
      ['Administrative permissions for Basic Portal', 1],
      ['Preview permission for Basic Portal', 0],
    ]);
  });
});

describe('loadSiteFolder: classic layout details', () => {
  const site = (files: Record<string, string>) => tempFiles(files);

  const website = 'adx_name: Test\nadx_websiteid: c9a088bc-3409-48a4-9650-f11fe353b5b6\n';

  it('reads --modelVersion 2 permissions with blank role lists and extra keys', async () => {
    const path = await site({
      'website.yml': website,
      'table-permissions/A.tablepermission.yml': [
        'adx_childTablePermissions: ',
        'adx_entitylogicalname: contact',
        'adx_entityname: A',
        'adx_entitypermission_webrole: ',
        'adx_entitypermissionid: 3453215B-D450-4073-A12C-88AA8A248B81',
        'adx_permissionfetchxml: ',
        'adx_read: true',
        'adx_scope: 756150000',
        '',
      ].join('\n'),
    });
    const loaded = await loadSiteFolder(path);
    expect(loaded.tablePermissions).toMatchObject([
      { id: '3453215b-d450-4073-a12c-88aa8a248b81', name: 'A', scope: 'global', roleIds: [] },
    ]);
  });

  it('keeps inactive records (statecode 1) out of the model, in their own lists', async () => {
    const path = await site({
      'website.yml': website,
      'webrole.yml': [
        '- adx_name: Active',
        '  adx_webroleid: 00000000-0000-0000-0001-000000000001',
        '- adx_name: Retired',
        '  adx_webroleid: 00000000-0000-0000-0001-000000000002',
        '  statecode: 1',
        '  statuscode: 2',
        '',
      ].join('\n'),
      'webpagerule.yml': [
        '- adx_name: Restrict Read on Home',
        '  adx_right: 2',
        '  adx_scope: 2',
        '  adx_webpageaccesscontrolruleid: 00000000-0000-0000-0004-000000000001',
        '  statecode: 1',
        '  statuscode: 2',
        '',
      ].join('\n'),
    });
    const loaded = await loadSiteFolder(path);
    expect(loaded.webRoles.map((r) => r.name)).toEqual(['Active']);
    expect(loaded.webPageRules).toEqual([]);
    expect(loaded.inactive.webRoles.map((r) => r.name)).toEqual(['Retired']);
    expect(loaded.inactive.webPageRules.map((r) => r.name)).toEqual(['Restrict Read on Home']);
    expect(loaded.inactive.webPageRules[0]!.scope).toBe(2);
    expect(loaded.records.filter((r) => r.kind === 'webrole')).toHaveLength(2);
  });

  it('reads child record lists in folders and web files in one flat folder', async () => {
    const path = await site({
      'website.yml': website,
      'webrole.yml': '',
      'weblink-sets/default/Default.en-US.weblinkset.yml':
        'adx_name: Default\nadx_weblinksetid: 1fb27c8a-bb7f-4351-9582-a17f2f5126b7\n',
      'weblink-sets/default/Default.en-US.weblinkset.weblink.yml':
        '- adx_name: Home\n  adx_weblinkid: 19289dc7-0368-498f-95b3-4db734ba24a3\n' +
        '- adx_name: Blog\n  adx_weblinkid: a299e8b6-2046-4d10-87dc-bcb2206ff0fb\n',
      'web-files/Logo.png': 'png',
      'web-files/Logo.png.webfile.yml': 'adx_name: Logo.png\n',
      'web-files/theme.css': 'css',
      'web-files/theme.css.webfile.yml': 'adx_name: theme.css\n',
    });
    const loaded = await loadSiteFolder(path);
    expect(loaded.webRoles).toEqual([]);
    expect(loaded.unrecognizedFiles).toEqual([]);
    expect(loaded.records.filter((r) => r.kind === 'weblink').map((r) => r.name)).toEqual([
      'Home',
      'Blog',
    ]);
    expect(
      loaded.records.filter((r) => r.kind === 'webfile').map((r) => [r.name, r.contentFile]),
    ).toEqual([
      ['Logo.png', 'web-files/Logo.png'],
      ['theme.css', 'web-files/theme.css'],
    ]);
  });

  it('reports an item that is not a mapping with its position', async () => {
    const path = await site({
      'website.yml': website,
      'webrole.yml': '- adx_name: A\n- just text\n',
    });
    const error = await loadSiteFolder(path).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SiteLoadError);
    expect((error as SiteLoadError).problems).toEqual([
      {
        file: 'webrole.yml',
        message: 'adx_webroleid: Invalid input: expected string, received undefined',
      },
      { file: 'webrole.yml', message: 'item 2: expected a YAML mapping of fields' },
    ]);
  });
});
