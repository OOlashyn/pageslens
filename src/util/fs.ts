import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isDirectory() ?? false;
}

export async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isFile() ?? false;
}

/** The nearest `fileName` in `start` (a folder, or a file's folder) or a folder above it. */
export async function findUp(start: string, fileName: string): Promise<string | undefined> {
  let dir = (await isDirectory(start)) ? start : dirname(start);
  for (;;) {
    const candidate = join(dir, fileName);
    if (await isFile(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
