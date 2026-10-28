import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { onTestFinished } from 'vite-plus/test';
import { run } from '../src/cli.js';
import { diffSites, summarize } from '../src/diff/compare.js';
import { loadSides, type DiffInputs } from '../src/diff/inputs.js';
import type { DiffResult } from '../src/diff/types.js';

/** Runs the command line and collects what it writes. */
export async function cli(...argv: string[]) {
  let out = '';
  let err = '';
  const code = await run(argv, { out: (text) => (out += text), err: (text) => (err += text) });
  return { code, out, err };
}

/** A new temporary folder, removed when the test finishes. */
export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pageslens-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * A temporary folder with the given files, by path relative to it (undefined removes one). With
 * `copyFrom`, it starts as a copy of that folder; with `under`, the paths are inside that subfolder.
 */
export async function tempFiles(
  files: Record<string, string | undefined>,
  options: { copyFrom?: string; under?: string } = {},
): Promise<string> {
  const dir = await tempDir();
  if (options.copyFrom) await cp(options.copyFrom, dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    const path = join(dir, options.under ?? '', file);
    if (content === undefined) {
      await rm(path, { recursive: true, force: true });
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
  }
  return dir;
}

/** Compares two sides as `pageslens diff` does. */
export async function diffResult(inputs: DiffInputs): Promise<DiffResult> {
  const sides = await loadSides(inputs);
  const changes = diffSites(sides.base.site, sides.head.site);
  return { base: sides.base.side, head: sides.head.side, changes, summary: summarize(changes) };
}
