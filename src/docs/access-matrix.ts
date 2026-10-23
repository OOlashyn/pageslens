import type { AccessGraph, Grant } from '../graph/access.js';
import { compareText as compare } from '../model/normalize.js';
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

export function renderAccessMatrix(site: Site, graph: AccessGraph): string {
  const roles = [...graph.roles].sort((a, b) => compare(a.name, b.name));
  const tables = [
    ...new Set(graph.permissions.filter((n) => n.effective).map((n) => n.permission.table)),
  ].sort(compare);

  const lines = [
    `# Access matrix: ${site.website.name}`,
    '',
    GENERATED_NOTE,
    '',
    'Which web role can do what on which table, from the table permissions in the site. ' +
      'The roles marked "every visitor" and "every signed-in user" are given automatically, ' +
      'so a signed-in user has the grants of their own roles plus those of the signed-in role.',
    '',
    `Privileges: ${PRIVILEGE_LEGEND}.`,
    '',
  ];

  if (tables.length === 0) {
    lines.push('No table permission gives any web role access to a table.', '');
  } else {
    const rows = roles.map((role) => {
      const grants = graph.grants(role.id);
      return [
        roleLabel(role),
        ...tables.map((t) =>
          grants
            .filter((g) => g.table === t)
            .map((g) => `${privilegeLetters(g.privileges)} ${scopeLabel(g.scope)}`)
            .join('<br>'),
        ),
      ];
    });
    lines.push(table(['Role', ...tables.map(code)], rows), '');
  }

  lines.push('## Grants by role', '');
  for (const role of roles) {
    lines.push(`### ${roleLabel(role)}`, '');
    const grants = graph.grants(role.id);
    if (grants.length === 0) {
      lines.push('No table permissions.', '');
      continue;
    }
    lines.push(
      table(
        ['Table', 'Scope', 'Privileges', 'Permission'],
        grants.map((g) => [code(g.table), scopeDetail(g), privilegeLetters(g.privileges) || '—', g.permission.name]),
      ),
      '',
    );
  }

  const ineffective = graph.permissions.filter((n) => !n.effective);
  if (ineffective.length > 0) {
    lines.push(
      '## Permissions that grant nothing',
      '',
      'These have no web role, or a parent chain that is broken or reaches a permission with no web role, so they are left out above. Run `pageslens lint` for details.',
      '',
      ...ineffective
        .map((n) => n.permission)
        .sort((a, b) => compare(a.name, b.name))
        .map((p) => `- ${p.name} (${code(p.table)})`),
      '',
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/** `Parent, via "Incident" → "Case"` for parent scope; the scope name otherwise. */
function scopeDetail(grant: Grant): string {
  if (grant.scope !== 'parent' || grant.ancestors.length === 0) return scopeLabel(grant.scope);
  return `Parent, via ${grant.ancestors.map((p) => `"${p.name}"`).join(' → ')}`;
}
