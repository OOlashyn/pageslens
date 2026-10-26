import { isAbsolute, relative, resolve } from 'node:path';
import { folderSource, treeSource } from '../adapters/files.js';
import {
  findSiteRoot,
  loadSite,
  noSiteMessage,
  resolveSiteRoot,
  SiteLoadError,
} from '../adapters/site-folder.js';
import type { Site } from '../model/schema.js';
import { toPosixPath } from '../model/normalize.js';
import { isDirectory } from '../util/fs.js';
import {
  BlobReader,
  fullRefName,
  listTree,
  mergeBase,
  repositoryRoot,
  resolveCommit,
} from '../util/git.js';
import type { DiffSide } from './types.js';

// Each side of `diff` is a folder or a git ref. Two folders are read as they are; two refs read
// the site folder `[path]` at each commit; a ref and a folder read the folder's own path at the
// ref, so uncommitted edits show. Commits are read with git (no checkout or worktree).

/** The arguments can't be used: exit code 2, like a usage error. */
export class DiffInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiffInputError';
  }
}

export interface LoadedSide {
  side: DiffSide;
  /** Absent when there's no site at the path on this side (it's read as an empty site). */
  site?: Site;
}

export interface DiffInputs {
  base: string;
  head: string;
  path?: string;
  mergeBase?: boolean;
  /** Where relative paths and git run from. */
  cwd: string;
}

type Arg = { kind: 'folder'; path: string } | { kind: 'ref'; ref: string; commit: string };

export async function loadSides(
  inputs: DiffInputs,
): Promise<{ base: LoadedSide; head: LoadedSide }> {
  const { cwd } = inputs;
  const [base, head] = [await classify(inputs.base, cwd), await classify(inputs.head, cwd)];
  const refs = base.kind === 'ref' && head.kind === 'ref';
  if (inputs.path !== undefined && !refs) {
    throw new DiffInputError('[path] can only be given with two git refs');
  }
  if (inputs.mergeBase && !refs) {
    throw new DiffInputError('--merge-base needs a git ref for both base and head');
  }
  if (base.kind === 'folder' && head.kind === 'folder') {
    return { base: await loadFolder(base.path, cwd), head: await loadFolder(head.path, cwd) };
  }

  const folder = base.kind === 'folder' ? base : head.kind === 'folder' ? head : undefined;
  const top = await repositoryRoot(cwd);
  if (!top) throw new DiffInputError(`${cwd} isn't in a git repository`);
  const sitePath = resolve(cwd, folder?.path ?? inputs.path ?? '.');
  const repoPath = toPosixPath(relative(top, sitePath));
  if (repoPath.startsWith('..') || isAbsolute(repoPath)) {
    throw new DiffInputError(
      `${folder?.path ?? inputs.path} isn't inside the repository at ${top}`,
    );
  }

  let baseCommit = base.kind === 'ref' ? base.commit : undefined;
  if (inputs.mergeBase && base.kind === 'ref' && head.kind === 'ref') {
    baseCommit = await mergeBase(top, base.commit, head.commit);
  }
  const blobs = new BlobReader(top);
  try {
    const read = async (arg: Arg, commit: string | undefined) =>
      arg.kind === 'folder'
        ? loadFolder(arg.path, cwd)
        : loadAtCommit({ ...arg, commit: commit ?? arg.commit }, repoPath, top, cwd, blobs);
    const result = { base: await read(base, baseCommit), head: await read(head, undefined) };
    if (inputs.mergeBase) result.base.side.mergeBase = true;
    return result;
  } finally {
    blobs.close();
  }
}

/** A folder when it's an existing directory, a ref when git resolves it to a commit; not both. */
async function classify(arg: string, cwd: string): Promise<Arg> {
  const folder = await isDirectory(resolve(cwd, arg));
  const commit = await resolveCommit(cwd, arg);
  if (folder && commit) {
    const full = await fullRefName(cwd, arg);
    throw new DiffInputError(
      `"${arg}" is both a folder and a git ref: write ./${arg} for the folder, or ${full ?? 'a full ref'} for the ref`,
    );
  }
  if (folder) return { kind: 'folder', path: arg };
  if (commit) return { kind: 'ref', ref: arg, commit };
  throw new DiffInputError(`"${arg}" is neither a folder nor a git commit`);
}

async function loadFolder(path: string, cwd: string): Promise<LoadedSide> {
  const { root } = await resolveSiteRoot(resolve(cwd, path));
  const site = await loadSite(folderSource(root));
  return { side: { path: displayPath(root, cwd), ...sideKind(site), site: siteRef(site) }, site };
}

async function loadAtCommit(
  arg: Extract<Arg, { kind: 'ref' }>,
  repoPath: string,
  top: string,
  cwd: string,
  blobs: BlobReader,
): Promise<LoadedSide> {
  const tree = await listTree(top, arg.commit, repoPath);
  const join = (...parts: string[]) => parts.filter(Boolean).join('/');
  const side: DiffSide = {
    ref: arg.ref,
    commit: arg.commit,
    path: displayPath(resolve(top, repoPath), cwd),
  };
  if (tree.length === 0) return { side };

  const paths = new Set(tree.map((f) => f.path));
  const found = await findSiteRoot((file) => Promise.resolve(paths.has(join(repoPath, file))));
  if (found === undefined) {
    const yaml = tree.some((f) => f.path.startsWith(join(repoPath, 'solutions/')));
    throw new SiteLoadError(noSiteMessage(`${repoPath || '.'} in ${arg.ref}`, yaml));
  }
  const prefix = join(repoPath, found);
  const root = resolve(top, prefix);
  const label = `${prefix || '.'} at ${arg.ref}`;
  const site = await loadSite(treeSource(root, label, prefix, tree, blobs));
  return {
    side: { ...side, path: displayPath(root, cwd), ...sideKind(site), site: siteRef(site) },
    site,
  };
}

function displayPath(path: string, cwd: string): string {
  return toPosixPath(relative(cwd, path)) || '.';
}

function sideKind(site: Site): Pick<DiffSide, 'layout' | 'format'> {
  return { layout: site.layout, format: site.format };
}

function siteRef(site: Site): NonNullable<DiffSide['site']> {
  return { id: site.website.id, name: site.website.name };
}
