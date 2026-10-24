import type { Site } from '../../model/schema.js';
import type { StatementResult, TestResult } from '../evaluate.js';
import { SECTIONS } from '../types.js';

/** Every statement by section, failures with their evidence, for people. */
export function formatText(
  result: TestResult,
  site: Site,
  sitePath: string,
  policyPath: string,
): string {
  const lines = [`${site.website.name} (${sitePath}), policy ${policyPath}`, ''];
  const bySection = Map.groupBy(result.results, (r) => r.statement.section);

  for (const section of SECTIONS) {
    const results = bySection.get(section);
    if (!results) continue;
    lines.push(section);
    for (const r of results) lines.push(...statementLines(r));
    lines.push('');
  }

  const { passed, failed } = result.counts;
  lines.push(`${passed} passed, ${failed} failed`);
  return `${lines.join('\n')}\n`;
}

function statementLines(result: StatementResult): string[] {
  const { statement } = result;
  const where = [`line ${statement.line}`, ...(statement.id ? [statement.id] : [])].join(', ');
  const lines = [
    result.passed ? `  pass  ${statement.text}` : `  FAIL  ${statement.text}  (${where})`,
  ];
  if (!result.passed && statement.because) lines.push(`        because: ${statement.because}`);
  for (const evidence of result.evidence) {
    lines.push(`        ${evidence.message}${evidence.file ? `  ${evidence.file}` : ''}`);
  }
  for (const warning of result.warnings) lines.push(`        warning: ${warning}`);
  return lines;
}
