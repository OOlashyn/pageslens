import type { ChangeClass, ChangeSource, DiffResult, DiffSide } from '../types.js';

// What every format says about the two sides: which site, compared how, and anything a reader
// should know before the changes (a side with no site, different layouts).

type Code = (text: string) => string;

const LAYOUTS = {
  code: 'code site (.powerpages-site)',
  classic: 'classic site (pac pages download)',
};

/** The site folder the comparison is about: head's, unless head has no site. */
export function sitePath(result: DiffResult): string {
  return !result.head.site && result.base.site ? result.base.path : result.head.path;
}

/** `` `site`, `origin/main` (a1b2c3d) → `HEAD` (e4f5a6b) ``, or `` `before` → `after` `` for two folders. */
export function comparison(result: DiffResult, code: Code): string {
  const { base, head } = result;
  if (!base.ref && !head.ref) return `${code(base.path)} → ${code(head.path)}`;
  return `${code(sitePath(result))}, ${sideLabel(base, code)} → ${sideLabel(head, code)}`;
}

function sideLabel(side: DiffSide, code: Code): string {
  if (!side.ref) return 'the working tree';
  const commit = side.commit!.slice(0, 7);
  return `${code(side.ref)} (${side.mergeBase ? `merge base ${commit}` : commit})`;
}

export function counts(summary: Record<ChangeClass, number>): string {
  return `${summary.wider} wider, ${summary.narrower} narrower, ${summary.neutral} neutral`;
}

export function notes(result: DiffResult, code: Code): string[] {
  const { base, head } = result;
  const lines: string[] = [];
  if (!base.site) lines.push(`base has no site at ${code(base.path)}; everything is new`);
  if (!head.site) lines.push(`head has no site at ${code(head.path)}; everything is removed`);
  if (base.layout && head.layout && base.layout !== head.layout) {
    lines.push(
      `the layouts differ: base is a ${LAYOUTS[base.layout]}, head is a ${LAYOUTS[head.layout]}`,
    );
  }
  return lines;
}

/** Each file once; a base file that head doesn't have under the same path is marked `(base)`. */
export function sourceFiles(sources: ChangeSource[], code: Code): string[] {
  const headFiles = new Set(sources.filter((s) => s.side === 'head').map((s) => s.file));
  const files = sources.map((s) =>
    s.side === 'base' && !headFiles.has(s.file) ? `${code(s.file)} (base)` : code(s.file),
  );
  return [...new Set(files)];
}
