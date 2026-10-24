import type { Site } from '../../model/schema.js';
import type { LintResult } from '../engine.js';

/** Bump when a field is removed or changes meaning; adding fields doesn't need a bump. */
export const JSON_FORMAT_VERSION = 1;

/** Stable machine-readable output, for agents and CI. */
export function formatJson(result: LintResult, site: Site, sitePath: string): string {
  const output = {
    version: JSON_FORMAT_VERSION,
    site: { id: site.website.id, name: site.website.name, path: sitePath },
    summary: result.counts,
    ignored: result.ignored,
    findings: result.findings.map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      message: f.message,
      file: f.source.file,
      recordId: f.recordId,
      docs: f.docs,
    })),
  };
  return `${JSON.stringify(output, null, 2)}\n`;
}
