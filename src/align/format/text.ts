import type { AlignResult } from '../types.js';
import {
  countsLine,
  describeSide,
  groups,
  HEADINGS,
  isAccess,
  recordLabel,
  SYMBOLS,
} from './groups.js';

/**
 * Findings by severity and check, with the files on each side, for a terminal. `configPath` is
 * how the config file is shown when an ignore entry is unused.
 */
export function formatText(result: AlignResult, configPath = 'pageslens.config.yaml'): string {
  const { site, solution } = result;
  const lines = [
    `align ${site.path} (${describeSide(site)}) with ${solution.path} (${describeSide(solution)})`,
    '',
  ];

  for (const group of groups(result)) {
    lines.push(`${SYMBOLS[group.severity]} ${HEADINGS[group.check]}`);
    if (group.check === 'missing-from-solution' || group.check === 'missing-from-download') {
      const labels = group.findings.map(recordLabel);
      const width = Math.max(...labels.map((label) => label.length));
      group.findings.forEach((finding, i) => {
        const file = finding.siteFile ?? finding.solutionFile ?? '';
        lines.push(`    ${labels[i]!.padEnd(width)}  ${file}`);
      });
      continue;
    }
    for (const finding of group.findings) {
      lines.push(
        group.check === 'site-mismatch'
          ? `    ${finding.message}`
          : `    ${recordLabel(finding)}: ${finding.message}`,
      );
      if (finding.siteFile) lines.push(`      ${finding.siteFile}`);
      if (finding.solutionFile) lines.push(`      ${finding.solutionFile}`);
    }
  }
  if (result.findings.length > 0) lines.push('');

  if (result.unusedIgnores.length > 0) {
    lines.push(configPath);
    for (const unused of result.unusedIgnores) {
      lines.push(
        `  warning  align ignore entry ${unused.entry}: record ${unused.value} matches no finding; remove it if what it ignored is fixed.`,
      );
    }
    lines.push('');
  }

  lines.push(countsLine(result));
  if (result.findings.some(isAccess)) {
    lines.push(
      `Access components differ: pageslens diff ${site.path} ${solution.path} shows what the solution changes about who can see what.`,
    );
  }
  return `${lines.join('\n')}\n`;
}
