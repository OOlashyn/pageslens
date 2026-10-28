import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { ExitCode } from '../src/cli.js';
import { RULES } from '../src/lint/rules/index.js';
import pkg from '../package.json' with { type: 'json' };
import { cli, tempDir } from './helpers.js';

describe('cli', () => {
  it('prints the version', async () => {
    expect(await cli('--version')).toEqual({ code: ExitCode.Ok, out: `${pkg.version}\n`, err: '' });
  });

  it('returns the usage exit code for an unknown command', async () => {
    expect((await cli('nope')).code).toBe(ExitCode.Usage);
  });
});

describe('cli docs', () => {
  it('creates the folder, writes the pages and says where', async () => {
    const out = join(await tempDir(), 'docs', 'site');
    const result = await cli('docs', 'test/fixtures/ecoflux', '--out', out);
    expect(result.code).toBe(ExitCode.Ok);
    expect(result.out).toMatch(/^Wrote 3 pages to .*: index\.md, access-matrix\.md, webapi\.md\n$/);
    expect(await readFile(join(out, 'index.md'), 'utf8')).toMatch(/^# EcoFlux\n/);
  });

  it('requires --out', async () => {
    const result = await cli('docs', 'test/fixtures/ecoflux');
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toMatch(/required option '--out <dir>'/);
  });
});

describe('cli lint', () => {
  it('exits 1 when there are errors', async () => {
    const result = await cli('lint', 'test/fixtures/broken');
    expect(result.code).toBe(ExitCode.Findings);
    expect(result.out).toContain('8 errors, 6 warnings, 1 info');
  });

  it('exits 0 when only warnings are left, naming the config file for an unused ignore', async () => {
    const config = join(await tempDir(), 'pageslens.config.yaml');
    await writeFile(
      config,
      'rules:\n  scope-relationship-missing: warning\nignore:\n  - files: [gone.yml]\n',
    );
    const result = await cli('lint', 'test/fixtures/ecoflux', '--config', config);
    expect(result.code).toBe(ExitCode.Ok);
    const shown = relative(process.cwd(), config).replaceAll('\\', '/');
    expect(result.out).toContain(`${shown}\n  warning  Ignore entry 1: file "gone.yml"`);
    expect(result.out).toContain('0 errors, 5 warnings, 0 info, 1 unused ignore');
  });

  it('writes JSON with --format json', async () => {
    const result = await cli('lint', 'test/fixtures/ecoflux', '--format', 'json');
    const output = JSON.parse(result.out);
    expect(output.site.path).toBe('test/fixtures/ecoflux/.powerpages-site');
    expect(output.findings).toHaveLength(5);
  });

  it('rejects an unknown format', async () => {
    const result = await cli('lint', 'test/fixtures/ecoflux', '--format', 'xml');
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toMatch(/Allowed choices are text, json/);
  });

  it('exits 2 with the problems when the site can not be read', async () => {
    const result = await cli('lint', 'test/fixtures');
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toMatch(
      /^error: No \.powerpages-site folder, website\.yml or unpacked solution/,
    );
  });

  it('exits 2 on a bad config', async () => {
    const result = await cli('lint', 'test/fixtures/ecoflux', '--config', 'missing.yaml');
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toMatch(/^error: Can't read config file/);
  });
});

describe('cli test', () => {
  const policy = (name: string) => `test/fixtures/policies/${name}.policy.yaml`;

  it('exits 0 when every statement passes', async () => {
    const result = await cli('test', 'test/fixtures/ecoflux', '--policy', policy('ecoflux'));
    expect(result.code).toBe(ExitCode.Ok);
    expect(result.out).toContain('12 passed, 0 failed');
  });

  it('exits 1 when a statement fails, and writes JSON with --format json', async () => {
    const result = await cli(
      'test',
      'test/fixtures/broken',
      '--policy',
      policy('broken'),
      '--format',
      'json',
    );
    expect(result.code).toBe(ExitCode.Findings);
    expect(JSON.parse(result.out).summary).toEqual({ passed: 12, failed: 12 });
  });

  it('exits 2 without a policy file, and on a policy error', async () => {
    const missing = await cli('test', 'test/fixtures/broken');
    expect(missing.code).toBe(ExitCode.Usage);
    expect(missing.err).toMatch(/^error: the policy can't be used\n {2}No pageslens\.policy\.yaml/);

    const file = join(await tempDir(), 'pageslens.policy.yaml');
    await writeFile(file, 'access:\n  - role "Nobody Here" can read contact\n');
    const result = await cli('test', 'test/fixtures/broken', '--policy', file);
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toMatch(/unknown role "Nobody Here"/);
  });
});

describe('cli explain', () => {
  it('prints the page of every rule from the folder the package ships', async () => {
    for (const { id } of RULES) {
      const result = await cli('explain', id);
      expect(result, id).toEqual({
        code: ExitCode.Ok,
        out: await readFile(`rules/${id}.md`, 'utf8'),
        err: '',
      });
      expect(result.out.startsWith(`# ${id}\n`), id).toBe(true);
    }
    expect(pkg.files).toContain('rules');
  });

  it('lists every rule, sorted, with its default severity and what it catches', async () => {
    const result = await cli('explain');
    expect(result.code).toBe(ExitCode.Ok);
    const lines = result.out.split('\n');
    const ids = lines.slice(0, RULES.length).map((line) => line.split(' ')[0]);
    expect(ids).toEqual(RULES.map((rule) => rule.id).sort());
    expect(lines[0]).toMatch(/^global-write-anonymous +warning +Global scope create/);
    expect(
      result.out.endsWith(
        '\n\nRun pageslens explain <rule> for why it matters and how to fix it.\n',
      ),
    ).toBe(true);
  });

  it('exits 2 for an unknown rule, with the closest one', async () => {
    const result = await cli('explain', 'role-unusd');
    expect(result).toEqual({
      code: ExitCode.Usage,
      out: '',
      err: 'error: unknown rule "role-unusd" (did you mean "role-unused"?); run pageslens explain for the list\n',
    });
    expect((await cli('explain', 'nothing-like-it')).err).toBe(
      'error: unknown rule "nothing-like-it"; run pageslens explain for the list\n',
    );
  });
});
