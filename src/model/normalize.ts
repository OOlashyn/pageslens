/** `\r\n` and lone `\r` to `\n`, so content compares equal across Windows and pac versions. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Forward slashes, so source paths in findings and docs are the same on every OS. */
export function toPosixPath(path: string): string {
  return path.replaceAll('\\', '/');
}
