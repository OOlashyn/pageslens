import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { ExitCode, run } from '../src/cli.js';
import pkg from '../package.json' with { type: 'json' };

async function cli(...argv: string[]) {
  let out = '';
  let err = '';
  const code = await run(argv, { out: (text) => (out += text), err: (text) => (err += text) });
  return { code, out, err };
}

describe('cli', () => {
  it('prints the version', async () => {
    expect(await cli('--version')).toEqual({ code: ExitCode.Ok, out: `${pkg.version}\n`, err: '' });
  });

  it('returns the usage exit code for an unknown command', async () => {
    expect((await cli('nope')).code).toBe(ExitCode.Usage);
  });

  it('reports docs as not implemented yet', async () => {
    const result = await cli('docs', 'test/fixtures/ecoflux', '--out', 'out');
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toBe('error: docs is not implemented yet\n');
  });
});

describe('cli lint', () => {
  it('exits 1 when there are errors', async () => {
    const result = await cli('lint', 'test/fixtures/broken');
    expect(result.code).toBe(ExitCode.Findings);
    expect(result.out).toContain('6 errors, 4 warnings, 1 info');
  });

  it('exits 0 when only warnings and info are left', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'pageslens-'));
    try {
      const config = join(temp, 'pageslens.config.yaml');
      await writeFile(config, 'rules:\n  scope-relationship-missing: warning\n');
      const result = await cli('lint', 'test/fixtures/ecoflux', '--config', config);
      expect(result.code).toBe(ExitCode.Ok);
      expect(result.out).toContain('0 errors, 4 warnings, 0 info');
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it('writes JSON with --format json', async () => {
    const result = await cli('lint', 'test/fixtures/ecoflux', '--format', 'json');
    const output = JSON.parse(result.out);
    expect(output.site.path).toBe('test/fixtures/ecoflux/.powerpages-site');
    expect(output.findings).toHaveLength(4);
  });

  it('rejects an unknown format', async () => {
    const result = await cli('lint', 'test/fixtures/ecoflux', '--format', 'xml');
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toMatch(/Allowed choices are text, json/);
  });

  it('exits 2 with the problems when the site can not be read', async () => {
    const result = await cli('lint', 'test/fixtures');
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toMatch(/^error: No \.powerpages-site folder found/);
  });

  it('exits 2 on a bad config', async () => {
    const result = await cli('lint', 'test/fixtures/ecoflux', '--config', 'missing.yaml');
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toMatch(/^error: Can't read config file/);
  });
});
