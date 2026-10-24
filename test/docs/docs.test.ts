import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder } from '../../src/adapters/site-folder.js';
import { table } from '../../src/docs/markdown.js';
import { renderSiteDocs, writeSiteDocs } from '../../src/docs/write.js';

const ecoflux = await loadSiteFolder('test/fixtures/ecoflux');
const broken = await loadSiteFolder('test/fixtures/broken');
const classic = await loadSiteFolder('test/fixtures/classic');

describe('docs snapshots', () => {
  // Reviewable in PRs: test/docs/__snapshots__/<fixture>/<page>
  for (const [name, site] of [
    ['ecoflux', ecoflux],
    ['broken', broken],
    ['classic', classic],
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

describe('markdown table', () => {
  it('escapes pipes and line breaks in cells', () => {
    expect(table(['a'], [['x | y\nz']])).toBe('| a |\n| --- |\n| x \\| y z |');
  });
});

describe('writeSiteDocs', () => {
  it('creates the folder and writes every page', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'pageslens-'));
    try {
      const out = join(temp, 'docs', 'site');
      expect(await writeSiteDocs(ecoflux, out)).toEqual([
        'index.md',
        'access-matrix.md',
        'webapi.md',
      ]);
      expect(await readFile(join(out, 'webapi.md'), 'utf8')).toBe(
        renderSiteDocs(ecoflux).get('webapi.md'),
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
