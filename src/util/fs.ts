import { stat } from 'node:fs/promises';

export async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isDirectory() ?? false;
}

export async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isFile() ?? false;
}
