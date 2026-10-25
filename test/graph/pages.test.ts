import { describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder } from '../../src/adapters/site-folder.js';
import { buildPageGraph, describeAudience, type Audience } from '../../src/graph/pages.js';

const classicPages = buildPageGraph(await loadSiteFolder('test/fixtures/classic-pages'));
const registration = buildPageGraph(await loadSiteFolder('test/fixtures/registration'));

const readers = (graph: typeof classicPages, url: string) => {
  const node = graph.pages.find((page) => page.url === url);
  return node?.readers && describeAudience(node.readers);
};

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

  it('reads the built-in roles as everyone and every signed-in user', () => {
    expect(readers(classicPages, '/public/')).toBe('anyone, anonymous visitors included');
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
    expect(readers(registration, '/delete-course/')).toBe('anyone, anonymous visitors included');
    expect(readers(registration, '/edit-course/')).toBe('"C1 ASP"');
  });
});
