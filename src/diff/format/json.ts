import { plain } from '../../graph/describe.js';
import type { DiffResult, DiffSide } from '../types.js';

/** Bump when a field is removed or changes meaning; adding fields doesn't need a bump. */
export const JSON_FORMAT_VERSION = 1;

/** Stable machine-readable output, for agents and the GitHub Action. */
export function formatJson(result: DiffResult): string {
  const output = {
    version: JSON_FORMAT_VERSION,
    base: side(result.base),
    head: side(result.head),
    summary: result.summary,
    changes: result.changes.map((c) => ({
      class: c.class,
      kind: c.kind,
      message: plain(c.message),
      ...(c.role && { role: c.role }),
      ...(c.table && { table: c.table }),
      ...(c.scope && { scope: c.scope }),
      ...(c.fromScope && { fromScope: c.fromScope }),
      ...(c.privileges && { privileges: c.privileges }),
      ...(c.webApiEnabled !== undefined && { webApiEnabled: c.webApiEnabled }),
      ...(c.fields && { fields: c.fields }),
      ...(c.setting && { setting: c.setting }),
      ...(c.lint && { lint: c.lint }),
      sources: c.sources,
    })),
  };
  return `${JSON.stringify(output, null, 2)}\n`;
}

function side(s: DiffSide) {
  return {
    ...(s.ref && { ref: s.ref }),
    ...(s.commit && { commit: s.commit }),
    ...(s.mergeBase && { mergeBase: true }),
    path: s.path,
    ...(s.layout && { layout: s.layout }),
    ...(s.site && { site: s.site }),
  };
}
