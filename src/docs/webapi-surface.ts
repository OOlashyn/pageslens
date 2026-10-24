import type { WebApiTable } from '../graph/webapi.js';
import type { Site } from '../model/schema.js';
import {
  code,
  GENERATED_NOTE,
  PRIVILEGE_LEGEND,
  privilegeLetters,
  roleLabel,
  scopeLabel,
  table,
} from './markdown.js';

export function renderWebApiSurface(site: Site, webApi: WebApiTable[]): string {
  const lines = [
    `# Web API surface: ${site.website.name}`,
    '',
    GENERATED_NOTE,
    '',
    'Tables the Power Pages Web API (`/_api`) can reach, from the `Webapi/<table>/enabled` and `Webapi/<table>/fields` site settings, ' +
      'and the web roles whose table permissions let them call it.',
    '',
  ];

  if (webApi.length === 0) {
    lines.push('No table has Web API site settings.');
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    table(
      ['Table', 'Enabled', 'Fields', 'Roles'],
      webApi.map((t) => [
        code(t.table),
        t.enabled ? 'yes' : 'no',
        t.wildcard ? 'all (`*`)' : String(t.fields.length),
        t.callers.length === 0 ? 'none' : t.callers.map((c) => roleLabel(c.role)).join(', '),
      ]),
    ),
    '',
    `Privileges: ${PRIVILEGE_LEGEND}.`,
    '',
  );

  for (const t of webApi) {
    lines.push(`## ${t.table}`, '');
    if (!t.enabled) lines.push('Web API is **not enabled** for this table.', '');
    if (t.wildcard) {
      lines.push('Fields: **all columns** (`*`).', '');
    } else if (t.fields.length === 0) {
      lines.push('Fields: none listed.', '');
    } else {
      lines.push(`Fields (${t.fields.length}): ${t.fields.map(code).join(', ')}`, '');
    }
    if (t.callers.length === 0) {
      lines.push('No web role has a table permission on this table, so every call is refused.', '');
    } else {
      lines.push(
        table(
          ['Role', 'Privileges', 'Scope'],
          t.callers.map((c) => [
            roleLabel(c.role),
            privilegeLetters(c.privileges) || '—',
            c.scopes.map(scopeLabel).join(', '),
          ]),
        ),
        '',
      );
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
