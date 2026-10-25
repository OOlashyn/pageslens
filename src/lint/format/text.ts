import type { Site } from '../../model/schema.js';
import type { LintResult } from '../engine.js';

/**
 * Findings grouped by file, for people, then the config's unused ignores. `sitePath` is how the
 * site folder is shown in the header, and `configPath` how the config file is shown.
 */
export function formatText(
  result: LintResult,
  site: Site,
  sitePath: string,
  configPath = 'pageslens.config.yaml',
): string {
  const lines = [`${site.website.name} (${sitePath})`, ''];
  const byFile = Map.groupBy(result.findings, (finding) => finding.source.file);
  const width = Math.max(
    result.unusedIgnores.length > 0 ? 'warning'.length : 0,
    ...result.findings.map((f) => f.severity.length),
  );

  for (const [file, findings] of byFile) {
    lines.push(file);
    for (const finding of findings) {
      lines.push(`  ${finding.severity.padEnd(width)}  ${finding.message}  ${finding.ruleId}`);
    }
    lines.push('');
  }

  if (result.unusedIgnores.length > 0) {
    lines.push(configPath);
    for (const unused of result.unusedIgnores) {
      const pattern =
        unused.field === 'files' ? `file "${unused.value}"` : `record ${unused.value}`;
      lines.push(
        `  ${'warning'.padEnd(width)}  Ignore entry ${unused.entry}: ${pattern} matches no finding; remove it if what it ignored is fixed.`,
      );
    }
    lines.push('');
  }

  const { error, warning, info } = result.counts;
  const notes = [
    result.ignored > 0 ? `${result.ignored} ignored` : '',
    result.unusedIgnores.length > 0 ? plural(result.unusedIgnores.length, 'unused ignore') : '',
  ].filter(Boolean);
  lines.push(
    result.findings.length === 0
      ? notes.length > 0
        ? `No findings (${notes.join(', ')}).`
        : 'No findings.'
      : [`${plural(error, 'error')}, ${plural(warning, 'warning')}, ${info} info`, ...notes].join(
          ', ',
        ),
  );
  return `${lines.join('\n')}\n`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
