import type { AccessGraph } from '../graph/access.js';
import { compareText as compare } from '../model/normalize.js';
import { privilegeLetters, roleLabel, scopeLabel } from './markdown.js';

/**
 * Roles → table permissions → tables, for permissions that grant something.
 * A dotted edge goes from a parent-scope permission to its parent.
 */
export function renderAccessDiagram(graph: AccessGraph): string {
  const nodes = graph.permissions
    .filter((n) => n.effective)
    .sort((a, b) => compare(a.permission.name, b.permission.name));
  if (nodes.length === 0) return '';

  const roles = [...new Map(nodes.flatMap((n) => n.roles).map((r) => [r.id, r])).values()].sort(
    (a, b) => compare(a.name, b.name),
  );
  const tables = [...new Set(nodes.map((n) => n.permission.table))].sort(compare);

  const roleId = new Map(roles.map((r, i) => [r.id, `r${i}`]));
  const permissionId = new Map(nodes.map((n, i) => [n.permission.id, `p${i}`]));
  const tableId = new Map(tables.map((t, i) => [t, `t${i}`]));

  const lines = ['```mermaid', 'flowchart LR'];
  lines.push('  subgraph Roles');
  for (const role of roles) lines.push(`    ${roleId.get(role.id)}["${label(roleLabel(role))}"]`);
  lines.push('  end', '  subgraph Permissions');
  for (const { permission } of nodes) {
    const detail = `${privilegeLetters(permission.privileges)} · ${scopeLabel(permission.scope)}`;
    lines.push(
      `    ${permissionId.get(permission.id)}["${label(permission.name)}<br/>${label(detail)}"]`,
    );
  }
  lines.push('  end', '  subgraph Tables');
  for (const t of tables) lines.push(`    ${tableId.get(t)}[("${label(t)}")]`);
  lines.push('  end');

  for (const { permission, roles: permissionRoles } of nodes) {
    const p = permissionId.get(permission.id);
    for (const role of [...permissionRoles].sort((a, b) => compare(a.name, b.name))) {
      lines.push(`  ${roleId.get(role.id)} --> ${p}`);
    }
    lines.push(`  ${p} --> ${tableId.get(permission.table)}`);
    const parent = permission.parentPermissionId && permissionId.get(permission.parentPermissionId);
    if (parent) lines.push(`  ${p} -. parent .-> ${parent}`);
  }

  lines.push('```');
  return `${lines.join('\n')}\n`;
}

/** Mermaid labels are quoted; a quote inside one is written as an entity. */
function label(text: string): string {
  return text.replaceAll('"', '#quot;');
}
