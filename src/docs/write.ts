import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildAccessGraph } from '../graph/access.js';
import { buildPageGraph, type PageGraph } from '../graph/pages.js';
import { buildWebApiSurface } from '../graph/webapi.js';
import type { Site } from '../model/schema.js';
import { renderAccessMatrix } from './access-matrix.js';
import { GENERATED_NOTE } from './markdown.js';
import { renderAccessDiagram } from './mermaid.js';
import { renderPages } from './pages.js';
import { renderWebApiSurface } from './webapi-surface.js';

export const DOC_FILES = {
  index: 'index.md',
  accessMatrix: 'access-matrix.md',
  webApi: 'webapi.md',
  pages: 'pages.md',
} as const;

/** Every docs page by file name. Same site in, same bytes out: no timestamps, fixed ordering. */
export function renderSiteDocs(site: Site): Map<string, string> {
  const graph = buildAccessGraph(site);
  const webApi = buildWebApiSurface(site, graph);
  const effective = graph.permissions.filter((n) => n.effective);
  const tables = new Set(effective.map((n) => n.permission.table));
  const diagram = renderAccessDiagram(graph);
  // Page access rules decide who opens a page on a classic site only (specs/0005)
  const pages = site.layout === 'classic' ? buildPageGraph(site) : undefined;

  const index = [
    `# ${site.website.name}`,
    '',
    GENERATED_NOTE,
    '',
    ...(site.solution
      ? [`- Read from the solution \`${site.solution.name}\` ${site.solution.version}`]
      : []),
    `- ${site.webRoles.length} web roles, ${site.tablePermissions.length} table permissions ` +
      `(${effective.length} grant access) on ${tables.size} tables`,
    `- Web API enabled on ${webApi.filter((t) => t.enabled).length} tables`,
    ...(pages ? [pagesLine(pages)] : []),
    ...inactiveLine(site),
    '',
    '## Pages',
    '',
    `- [Access matrix](${DOC_FILES.accessMatrix}): which role can do what on which table`,
    `- [Web API surface](${DOC_FILES.webApi}): tables reachable through \`/_api\`, their fields and callers`,
    ...(pages
      ? [`- [Pages](${DOC_FILES.pages}): who can read each page, from the page access rules`]
      : []),
    '',
    '## Roles, permissions and tables',
    '',
    diagram ? diagram : 'No table permission gives any web role access to a table.\n',
  ].join('\n');

  return new Map([
    [DOC_FILES.index, index],
    [DOC_FILES.accessMatrix, renderAccessMatrix(site, graph)],
    [DOC_FILES.webApi, renderWebApiSurface(site, webApi)],
    ...(pages ? [[DOC_FILES.pages, renderPages(site, pages)] as const] : []),
  ]);
}

/** How many pages anyone can open, and how many are restricted. */
function pagesLine(pages: PageGraph): string {
  const open = pages.pages.filter((node) => node.readers?.kind === 'anyone').length;
  return `- ${pages.pages.length} web pages, ${open} open to anyone, ${pages.rules.length} page access rules`;
}

/** Inactive records take part in nothing on these pages; say how many were left out. */
function inactiveLine(site: Site): string[] {
  const { webRoles, tablePermissions, siteSettings, webPageRules, webPages, websiteAccess } =
    site.inactive;
  const parts = [
    [webRoles.length, 'web role', 'web roles'],
    [tablePermissions.length, 'table permission', 'table permissions'],
    [siteSettings.length, 'site setting', 'site settings'],
    [webPageRules.length, 'page access rule', 'page access rules'],
    [webPages.filter((page) => page.isRoot).length, 'web page', 'web pages'],
    [websiteAccess.length, 'website access record', 'website access records'],
  ] as const;
  const counted = parts
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
  return counted.length > 0 ? [`- Left out as inactive: ${counted.join(', ')}`] : [];
}

/** Writes the pages into `outDir`, creating it. Other files in the folder are left alone. */
export async function writeSiteDocs(site: Site, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const docs = renderSiteDocs(site);
  for (const [file, content] of docs) await writeFile(join(outDir, file), content);
  return [...docs.keys()];
}
