import { describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder } from '../../src/adapters/site-folder.js';
import { table } from '../../src/docs/markdown.js';
import { renderSiteDocs } from '../../src/docs/write.js';

const ecoflux = await loadSiteFolder('test/fixtures/ecoflux');
const broken = await loadSiteFolder('test/fixtures/broken');
const classic = await loadSiteFolder('test/fixtures/classic');
const classicPages = await loadSiteFolder('test/fixtures/classic-pages');
const registration = await loadSiteFolder('test/fixtures/registration');

describe('docs snapshots', () => {
  // Reviewable in PRs: test/docs/__snapshots__/<fixture>/<page>
  for (const [name, site] of [
    ['ecoflux', ecoflux],
    ['broken', broken],
    ['classic', classic],
    ['classic-pages', classicPages],
    ['registration', registration],
  ] as const) {
    for (const [file, content] of renderSiteDocs(site)) {
      it(`${name}/${file}`, async () => {
        await expect(content).toMatchFileSnapshot(`__snapshots__/${name}/${file}`);
      });
    }
  }
});

describe('docs content', () => {
  const ecofluxDocs = renderSiteDocs(ecoflux);
  const brokenDocs = renderSiteDocs(broken);

  it('renders the same bytes every time', () => {
    expect(renderSiteDocs(ecoflux)).toEqual(ecofluxDocs);
  });

  it('puts each role and its privileges per table in the matrix', () => {
    const matrix = ecofluxDocs.get('access-matrix.md')!;
    expect(matrix).toContain(
      '| Asset Manager | RWCDT Account |  | RWCDA Account | RWCDA Account |',
    );
    expect(matrix).toContain(
      '| Authenticated Users (every signed-in user) | R Global | R Global | R Global | R Global |',
    );
  });

  it('shows the parent chain and leaves out permissions that grant nothing', () => {
    const matrix = brokenDocs.get('access-matrix.md')!;
    expect(matrix).toContain(
      '| `adx_portalcomment` | Parent, via "Incident - Case Manager Contact" | RC | Incident Comment - Case Manager Parent |',
    );
    const [granted, ignored] = matrix.split('## Permissions that grant nothing');
    expect(granted).not.toContain('Comment - Missing Parent');
    expect(granted).not.toContain('Note - Parent Without Role');
    expect(ignored).toContain('- Comment - Missing Parent (`adx_portalcomment`)');
    expect(ignored).toContain('- Incident - No Role (`incident`)');
    expect(ignored).toContain('- Note - Parent Without Role (`annotation`)');
  });

  it('marks a wildcard and a table no role can call on the Web API page', () => {
    const webApi = brokenDocs.get('webapi.md')!;
    expect(webApi).toContain('Fields: **all columns** (`*`).');
    expect(webApi).toContain(
      '## dwcrm_invoice\n\nFields (2): `dwcrm_name`, `dwcrm_amount`\n\nNo web role has a table permission on this table, so every call is refused.',
    );
  });

  it('draws roles, permissions, tables and parent edges in the diagram', () => {
    const index = brokenDocs.get('index.md')!;
    expect(index).toContain('```mermaid\nflowchart LR');
    expect(index).toMatch(/r\d --> p\d/);
    expect(index).toMatch(/p\d -\. parent \.-> p\d/);
    expect(index).not.toContain('Comment - Missing Parent');
  });
});

describe('pages docs', () => {
  it('writes pages.md for classic sites only', () => {
    expect([...renderSiteDocs(registration).keys()]).toContain('pages.md');
    expect([...renderSiteDocs(ecoflux).keys()]).not.toContain('pages.md');
    expect(renderSiteDocs(ecoflux).get('index.md')).not.toContain('pages.md');
  });

  it('shows the unrestricted admin page next to the restricted ones', () => {
    const pages = renderSiteDocs(registration).get('pages.md')!;
    expect(pages).toContain('| [Admin] Delete-Course | `/delete-course/` | anyone |');
    expect(pages).toContain(
      '| [Admin] Create Course | `/create-course/` | C1 ASP | Restrict Read on Create Course |',
    );
    expect(pages).toContain(
      '| [Admin] Courses Home | `/admin-home/` | every signed-in user | Restrict Read on C1 Courses Home |',
    );
    // The inactive rules on Home restrict nothing
    expect(pages).toContain('| Home | `/` | anyone |');
    expect(pages).toContain('- Restrict Read rule "Restrict Read on Home"');
    expect(pages).toContain('- Web page "Contact us"');
  });

  it('shows nested rules, the Grant Change override and broken parents', () => {
    const pages = renderSiteDocs(classicPages).get('pages.md')!;
    expect(pages).toContain(
      '| Reports | `/internal/reports/` | Managers | Managers and Partners<br>Employees Only (on `/internal/`) |',
    );
    expect(pages).toContain(
      '| Docs | `/docs/` | Administrators, Employees | Docs Readers | Writers Publish Docs |',
    );
    expect(pages).toContain('| Shared | `/shared/` | Employees, Partners |');
    expect(pages).toContain(
      '| Lost Child | `/lost/child/` | unknown: the parent of "Lost" isn\'t in the site |',
    );
  });
});

describe('markdown table', () => {
  it('escapes pipes and line breaks in cells', () => {
    expect(table(['a'], [['x | y\nz']])).toBe('| a |\n| --- |\n| x \\| y z |');
  });
});
