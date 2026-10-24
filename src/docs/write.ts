import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildAccessGraph } from '../graph/access.js';
import { buildWebApiSurface } from '../graph/webapi.js';
import type { Site } from '../model/schema.js';
import { renderAccessMatrix } from './access-matrix.js';
import { GENERATED_NOTE } from './markdown.js';
import { renderAccessDiagram } from './mermaid.js';
import { renderWebApiSurface } from './webapi-surface.js';

export const DOC_FILES = {
  index: 'index.md',
  accessMatrix: 'access-matrix.md',
  webApi: 'webapi.md',
} as const;

/** Every docs page by file name. Same site in, same bytes out: no timestamps, fixed ordering. */
export function renderSiteDocs(site: Site): Map<string, string> {
  const graph = buildAccessGraph(site);
  const webApi = buildWebApiSurface(site, graph);
  const effective = graph.permissions.filter((n) => n.effective);
  const tables = new Set(effective.map((n) => n.permission.table));
  const diagram = renderAccessDiagram(graph);

  const index = [
    `# ${site.website.name}`,
    '',
    GENERATED_NOTE,
    '',
    `- ${site.webRoles.length} web roles, ${site.tablePermissions.length} table permissions ` +
      `(${effective.length} grant access) on ${tables.size} tables`,
    `- Web API enabled on ${webApi.filter((t) => t.enabled).length} tables`,
    '',
    '## Pages',
    '',
    `- [Access matrix](${DOC_FILES.accessMatrix}): which role can do what on which table`,
    `- [Web API surface](${DOC_FILES.webApi}): tables reachable through \`/_api\`, their fields and callers`,
    '',
    '## Roles, permissions and tables',
    '',
    diagram ? diagram : 'No table permission gives any web role access to a table.\n',
  ].join('\n');

  return new Map([
    [DOC_FILES.index, index],
    [DOC_FILES.accessMatrix, renderAccessMatrix(site, graph)],
    [DOC_FILES.webApi, renderWebApiSurface(site, webApi)],
  ]);
}

/** Writes the pages into `outDir`, creating it. Other files in the folder are left alone. */
export async function writeSiteDocs(site: Site, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const docs = renderSiteDocs(site);
  for (const [file, content] of docs) await writeFile(join(outDir, file), content);
  return [...docs.keys()];
}
