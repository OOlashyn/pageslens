import type { AlignResult, AlignSide } from '../types.js';

/** Bump when a field is removed or changes meaning; adding fields doesn't need a bump. */
export const JSON_FORMAT_VERSION = 1;

/** Stable machine-readable output, for agents and the GitHub Action. */
export function formatJson(result: AlignResult): string {
  const output = {
    version: JSON_FORMAT_VERSION,
    site: side(result.site),
    solution: side(result.solution),
    summary: { ...result.counts, matched: result.matched, ignored: result.ignored },
    findings: result.findings.map((f) => ({
      check: f.check,
      severity: f.severity,
      kind: f.kind,
      recordId: f.recordId,
      name: f.name,
      ...(f.inactive && { inactive: true }),
      message: f.message,
      ...(f.siteFile && { siteFile: f.siteFile }),
      ...(f.solutionFile && { solutionFile: f.solutionFile }),
      ...(f.fields && { fields: f.fields }),
    })),
    unusedIgnores: result.unusedIgnores,
  };
  return `${JSON.stringify(output, null, 2)}\n`;
}

function side(s: AlignSide) {
  return {
    path: s.path,
    format: s.format,
    layout: s.layout,
    site: s.site,
    ...(s.solution && { solution: s.solution }),
  };
}
