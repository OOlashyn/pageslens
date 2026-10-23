import { describe, expect, it, vi } from 'vite-plus/test';
import { ExitCode, run } from '../src/cli.js';
import pkg from '../package.json' with { type: 'json' };

describe('cli', () => {
  it('prints the version', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect(await run(['--version'])).toBe(ExitCode.Ok);
    expect(write).toHaveBeenCalledWith(`${pkg.version}\n`);
    write.mockRestore();
  });

  it('returns the usage exit code for an unknown command', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(await run(['nope'])).toBe(ExitCode.Usage);
    write.mockRestore();
  });

  it('reports lint as not implemented yet', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run(['lint', 'test/fixtures/ecoflux'])).toBe(ExitCode.Usage);
    expect(error).toHaveBeenCalledWith('error: lint is not implemented yet');
    error.mockRestore();
  });
});
