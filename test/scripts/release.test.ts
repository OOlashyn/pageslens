import { describe, expect, it } from 'vite-plus/test';
import {
  bumpReadme,
  isNewer,
  isPrerelease,
  parseArgs,
  ReleaseError,
} from '../../scripts/release.js';

// The pure parts of scripts/release.ts; the git and npm steps are run by the maintainer.

describe('release script', () => {
  it('reads the version and options', () => {
    expect(parseArgs(['0.11.0'])).toEqual({ version: '0.11.0', dryRun: false, pr: false });
    expect(parseArgs(['v0.11.0-beta.1', '--dry-run', '--pr'])).toEqual({
      version: '0.11.0-beta.1',
      dryRun: true,
      pr: true,
    });
    expect(() => parseArgs([])).toThrow(ReleaseError);
    expect(() => parseArgs(['0.11'])).toThrow("isn't a version");
    expect(() => parseArgs(['0.11.0', '--force'])).toThrow('unknown option --force');
  });

  it('only goes forward', () => {
    expect(isNewer('0.11.0', '0.10.0')).toBe(true);
    expect(isNewer('1.0.0', '0.10.9')).toBe(true);
    expect(isNewer('0.10.0', '0.10.0')).toBe(false);
    expect(isNewer('0.9.9', '0.10.0')).toBe(false);
    expect(isNewer('0.11.0-beta.1', '0.10.0')).toBe(true);
    expect(isNewer('0.11.0', '0.11.0-beta.2')).toBe(true);
    expect(isNewer('0.11.0-beta.2', '0.11.0-beta.1')).toBe(true);
    expect(isNewer('0.11.0-beta.1', '0.11.0')).toBe(false);
    expect(isPrerelease('0.11.0-beta.1')).toBe(true);
    expect(isPrerelease('0.11.0')).toBe(false);
  });

  it("points the README's action examples and version note at the new tag", () => {
    const readme = [
      '- uses: OOlashyn/pageslens@v0.10.0',
      '- **Version:** `v0.10.0` runs exactly pageslens 0.10.0. Dependabot keeps the tag up to date.',
      'npm install pageslens@0.10.0 stays as it is',
    ].join('\n');
    expect(bumpReadme(readme, '0.10.0', '0.11.0')).toBe(
      [
        '- uses: OOlashyn/pageslens@v0.11.0',
        '- **Version:** `v0.11.0` runs exactly pageslens 0.11.0. Dependabot keeps the tag up to date.',
        'npm install pageslens@0.10.0 stays as it is',
      ].join('\n'),
    );
  });
});
