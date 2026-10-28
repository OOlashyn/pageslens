import { describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder } from '../../src/adapters/site-folder.js';
import { buildPageGraph, describeAudience, type Audience } from '../../src/graph/pages.js';

const classicPages = buildPageGraph(await loadSiteFolder('test/fixtures/classic-pages'));
const registrationSite = await loadSiteFolder('test/fixtures/registration');
const registration = buildPageGraph(registrationSite);

const readers = (graph: typeof classicPages, url: string) => {
  const node = graph.pages.find((page) => page.url === url);
  return node?.readers && describeAudience(node.readers);
};

describe('pages in the real classic download', () => {
  it('reads the layout, root and content pages', () => {
    expect(registrationSite.layout).toBe('classic');
    const roots = registrationSite.webPages.filter((page) => page.isRoot);
    expect(roots).toHaveLength(21);
    expect(registrationSite.webPages).toHaveLength(42);
    expect(roots.find((page) => page.name === '[Admin] Delete-Course')).toMatchObject({
      parentPageId: '58120917-5fcf-f111-a05a-70a8a52c89ad',
      partialUrl: 'delete-course',
      hiddenFromSitemap: false,
    });
    const content = registrationSite.webPages.find(
      (page) => !page.isRoot && page.name === '[Admin] Delete-Course',
    );
    expect(content?.rootPageId).toBe('27120917-5fcf-f111-a05a-70a8a52c89ad');
    expect(registrationSite.inactive.webPages.map((page) => page.name)).toEqual([
      'Contact us',
      'Contact us',
    ]);
    expect(
      registrationSite.webPageRules.find((r) => r.name === 'Restrict Read on Create Course')?.scope,
    ).toBe(1);
  });
});

describe('page graph', () => {
  it('builds URLs from the partial URLs, in URL order, root pages only', () => {
    expect(classicPages.pages.map((node) => node.url)).toEqual([
      '/',
      '/account/',
      '/docs/',
      '/internal/',
      '/internal/reports/',
      '/internal/team/',
      '/locked/',
      '/loop-a/loop-b/',
      '/loop-b/loop-a/',
      '/lost/',
      '/lost/child/',
      '/members/',
      '/public/',
      '/shared/',
    ]);
  });

  it('intersects Restrict Read rules down the tree', () => {
    expect(readers(classicPages, '/internal/')).toBe('"Employees", "Managers"');
    expect(readers(classicPages, '/internal/reports/')).toBe('"Managers"');
    expect(readers(classicPages, '/internal/team/')).toBe('"Managers"');
  });

  it('unites Restrict Read rules on the same page', () => {
    expect(readers(classicPages, '/shared/')).toBe('"Employees", "Partners"');
  });

  it('adds Grant Change roles to the readers', () => {
    expect(readers(classicPages, '/docs/')).toBe('"Administrators", "Employees"');
  });

  it('reads Authenticated Users as every signed-in user and Anonymous Users as nobody', () => {
    expect(readers(classicPages, '/public/')).toBe('nobody');
    expect(readers(classicPages, '/members/')).toBe('every signed-in user');
    expect(readers(classicPages, '/account/')).toBe('every signed-in user');
    expect(readers(classicPages, '/locked/')).toBe('nobody');
    expect(readers(classicPages, '/')).toBe('anyone, anonymous visitors included');
  });

  it('leaves readers unknown below a broken parent', () => {
    const lost = classicPages.pages.find((page) => page.url === '/lost/child/')!;
    expect(lost.readers).toBeUndefined();
    expect(lost.pathBreak).toMatchObject({ reason: 'missing-parent', at: { name: 'Lost' } });
  });

  it('maps a content page to its root page', () => {
    expect(classicPages.page('00000000-0000-0000-0005-000000000221')?.url).toBe('/');
  });

  it('skips the inactive rules on the real site', () => {
    const kinds = registration.pages.map((node) => (node.readers as Audience).kind);
    expect(kinds.filter((kind) => kind === 'anyone')).toHaveLength(12);
    expect(readers(registration, '/')).toBe('anyone, anonymous visitors included');
    expect(readers(registration, '/delete-course/')).toBe('anyone, anonymous visitors included');
    expect(readers(registration, '/edit-course/')).toBe('"C1 ASP"');
  });

  it('matches what was checked on the real site', () => {
    // 1: Authenticated Users on /v1/v3/ doesn't get past C1 ASP on /v1/
    expect(readers(registration, '/v1/v3/')).toBe('"C1 ASP"');
    // 2a and 2b: the Grant Change on /v1/ lets C1 ASP past Administrators on /v1/v2/
    expect(readers(registration, '/v1/v2/')).toBe('"C1 ASP"');
    // 3: the Anonymous Users role lets nobody in
    expect(readers(registration, '/vAnon/')).toBe('nobody');
  });
});
