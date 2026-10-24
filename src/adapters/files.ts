import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { toPosixPath } from '../model/normalize.js';
import type { BlobReader, TreeFile } from '../util/git.js';

/**
 * The files of one site folder, wherever they are: on disk, or in a git commit. Paths are
 * relative to the site folder, with forward slashes.
 */
export interface FileSource {
  /** Absolute path of the site folder (in the working tree, for a commit). */
  root: string;
  /** How problems name the folder: `.powerpages-site at site`, `portal at origin/main`. */
  label: string;
  list(): Promise<string[]>;
  read(file: string): Promise<string>;
}

export function folderSource(root: string): FileSource {
  return {
    root,
    label: `${basename(root)} at ${dirname(root)}`,
    list: async () => {
      const entries = await readdir(root, { recursive: true, withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => toPosixPath(relative(root, join(entry.parentPath, entry.name))));
    },
    read: (file) => readFile(join(root, file), 'utf8'),
  };
}

/**
 * The files under `prefix` (a folder from the repository root, '' for the root) in a commit's
 * tree, read as committed, so `core.autocrlf` doesn't matter.
 */
export function treeSource(
  root: string,
  label: string,
  prefix: string,
  tree: TreeFile[],
  blobs: BlobReader,
): FileSource {
  const start = prefix ? `${prefix}/` : '';
  const files = new Map(
    tree.filter((f) => f.path.startsWith(start)).map((f) => [f.path.slice(start.length), f.blob]),
  );
  return {
    root,
    label,
    list: () => Promise.resolve([...files.keys()]),
    read: async (file) => {
      const blob = files.get(file);
      if (!blob) throw new Error(`${file} isn't in ${label}`);
      return (await blobs.read(blob)).toString('utf8');
    },
  };
}
