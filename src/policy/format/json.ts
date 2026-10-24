import type { Site } from '../../model/schema.js';
import type { TestResult } from '../evaluate.js';

/** Bump when a field is removed or changes meaning; adding fields doesn't need a bump. */
export const JSON_FORMAT_VERSION = 1;

/** Stable machine-readable output, for agents and CI. */
export function formatJson(
  result: TestResult,
  site: Site,
  sitePath: string,
  policyPath: string,
): string {
  const output = {
    version: JSON_FORMAT_VERSION,
    site: { id: site.website.id, name: site.website.name, path: sitePath },
    policy: policyPath,
    summary: result.counts,
    results: result.results.map(({ statement, passed, evidence, warnings }) => ({
      ...(statement.id && { id: statement.id }),
      section: statement.section,
      statement: statement.text,
      line: statement.line,
      ...(statement.because && { because: statement.because }),
      status: passed ? 'pass' : 'fail',
      evidence: evidence.map((e) => ({
        message: e.message,
        ...(e.file && { file: e.file }),
        ...(e.recordId && { recordId: e.recordId }),
        ...(e.context && { context: true }),
      })),
      warnings,
    })),
  };
  return `${JSON.stringify(output, null, 2)}\n`;
}
