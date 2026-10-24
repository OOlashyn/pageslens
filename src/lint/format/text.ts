import type { Site } from '../../model/schema.js';
import type { LintResult } from '../engine.js';

/** Findings grouped by file, for people. `sitePath` is how the site folder is shown in the header. */
export function formatText(result: LintResult, site: Site, sitePath: string): string {
  const lines = [`${site.website.name} (${sitePath})`, ''];
  const byFile = Map.groupBy(result.findings, (finding) => finding.source.file);
  const width = Math.max(0, ...result.findings.map((f) => f.severity.length));

  for (const [file, findings] of byFile) {
    lines.push(file);
    for (const finding of findings) {
      lines.push(`  ${finding.severity.padEnd(width)}  ${finding.message}  ${finding.ruleId}`);
    }
    lines.push('');
  }

  const { error, warning, info } = result.counts;
  lines.push(
    result.findings.length === 0
      ? 'No findings.'
      : `${plural(error, 'error')}, ${plural(warning, 'warning')}, ${info} info`,
  );
  return `${lines.join('\n')}\n`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
