/** `\r\n` and lone `\r` to `\n`, so content compares equal across Windows and pac versions. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Locale-independent ordering, so output is the same on every machine. Missing sorts first. */
export function compareText(a: string | undefined, b: string | undefined): number {
  const left = a ?? '';
  const right = b ?? '';
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Forward slashes, so source paths in findings and docs are the same on every OS. */
export function toPosixPath(path: string): string {
  return path.replaceAll('\\', '/');
}
