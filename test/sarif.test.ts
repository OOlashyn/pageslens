import { describe, expect, it } from 'vite-plus/test';
import pkg from '../package.json' with { type: 'json' };
import { loadSiteFolder } from '../src/adapters/site-folder.js';
import { ExitCode } from '../src/cli.js';
import { lint } from '../src/lint/engine.js';
import { formatSarif as formatLintSarif } from '../src/lint/format/sarif.js';
import { RULES } from '../src/lint/rules/index.js';
import { evaluatePolicy } from '../src/policy/evaluate.js';
import { formatSarif as formatTestSarif } from '../src/policy/format/sarif.js';
import { loadPolicy, parsePolicy } from '../src/policy/parse.js';
import { recordLines } from '../src/sarif.js';
import { cli } from './helpers.js';

const broken = await loadSiteFolder('test/fixtures/broken');
const classic = await loadSiteFolder('test/fixtures/classic');
const brokenPolicy = await loadPolicy('.', 'test/fixtures/policies/broken.policy.yaml');
const lineOne = () => 1;

/** The single run of a SARIF log, with loose typing for assertions. */
// oxlint-disable-next-line typescript/no-explicit-any
const runOf = (text: string): any => JSON.parse(text).runs[0];

describe('recordLines', () => {
  it('finds a record by its GUID in a file that holds many records', async () => {
    const lineOf = await recordLines(classic.root, ['webrole.yml']);
    expect(lineOf('webrole.yml', '67095ECD-50CF-F111-A05A-70A8A52C89AD')).toBe(12);
    expect(lineOf('webrole.yml', '00000000-0000-0000-0000-000000000000')).toBe(1);
    expect(lineOf('webrole.yml')).toBe(1);
  });
});

describe('lint SARIF', () => {
  const sarif = runOf(formatLintSarif(lint(broken), 'site', RULES, lineOne));

  it('describes the tool and every rule the way code scanning needs', () => {
    expect(sarif.tool.driver).toMatchObject({ name: 'pageslens', semanticVersion: pkg.version });
    expect(sarif.automationDetails).toEqual({ id: 'pageslens/lint/' });
    expect(sarif.tool.driver.rules.map((r: { id: string }) => r.id)).toEqual(
      RULES.map((r) => r.id),
    );
    expect(sarif.tool.driver.rules[0]).toMatchObject({
      id: 'webapi-wildcard-fields',
      shortDescription: { text: expect.any(String) },
      fullDescription: { text: expect.any(String) },
      help: { text: expect.stringContaining('rules/webapi-wildcard-fields.md') },
      defaultConfiguration: { level: 'error' },
      properties: { tags: ['security', 'power-pages'], 'security-severity': '7.5' },
    });
  });

  it('gives each finding its level, file and rule index', () => {
    const roleUnused = sarif.results.find((r: { ruleId: string }) => r.ruleId === 'role-unused');
    expect(roleUnused).toMatchObject({
      level: 'note',
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: 'site/web-roles/Unused-Role.webrole.yml' },
            region: { startLine: 1 },
          },
        },
      ],
    });
    expect(sarif.tool.driver.rules[roleUnused.ruleIndex].id).toBe('role-unused');
    expect(sarif.results).toHaveLength(lint(broken).findings.length);
  });

  it('keeps fingerprints the same between runs and different between findings', () => {
    const again = runOf(formatLintSarif(lint(broken), 'elsewhere', RULES, lineOne));
    const prints = (r: { results: { partialFingerprints: Record<string, string> }[] }) =>
      r.results.map((x) => x.partialFingerprints['pageslens/v1']);
    expect(prints(again)).toEqual(prints(sarif));
    expect(new Set(prints(sarif)).size).toBe(sarif.results.length);
  });
});

describe('test SARIF', () => {
  const sarif = runOf(
    formatTestSarif(evaluatePolicy(brokenPolicy, broken), 'site', 'policy.yaml', lineOne),
  );
  const resultsFor = (ruleId: string) =>
    sarif.results.filter((r: { ruleId: string }) => r.ruleId === ruleId);

  it('has one rule per statement, named by id or by its text', () => {
    expect(sarif.automationDetails).toEqual({ id: 'pageslens/test/' });
    const ids = sarif.tool.driver.rules.map((r: { id: string }) => r.id);
    expect(ids).toHaveLength(brokenPolicy.statements.length);
    expect(ids).toContain('policy/comments-case-managers');
    expect(ids[0]).toBe('policy/anonymous-cannot-create-write-delete-any-table');
  });

  it('reports a broken grant on its permission file, with the requirement as related', () => {
    expect(resultsFor('policy/authenticated-cannot-write-contact-at-global-scope')).toEqual([
      expect.objectContaining({
        level: 'error',
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: 'site/table-permissions/Contact---Authenticated-Users-Global-Write.tablepermission.yml',
              },
              region: { startLine: 1 },
            },
          },
        ],
        relatedLocations: [
          expect.objectContaining({
            physicalLocation: {
              artifactLocation: { uri: 'policy.yaml' },
              region: { startLine: 5 },
            },
          }),
        ],
      }),
    ]);
  });

  it('reports a missing privilege on the policy line, with what the role does have as related', () => {
    const [result, ...rest] = resultsFor(
      'policy/role-case-manager-can-read-write-incident-at-contact-scope',
    );
    expect(rest).toEqual([]);
    expect(result.locations[0].physicalLocation).toEqual({
      artifactLocation: { uri: 'policy.yaml' },
      region: { startLine: 8 },
    });
    expect(result.message.text).toMatch(/doesn't have write on incident/);
    expect(result.relatedLocations[0].message.text).toMatch(/^has: Case Manager has read/);
  });

  it('reports nothing for passing statements', () => {
    expect(resultsFor('policy/role-case-manager-can-read-incident')).toEqual([]);
  });

  it('keeps repeated and long statements apart', () => {
    const long = `nobody can read ${'x'.repeat(90)}`;
    const policy = parsePolicy(
      `access:\n  - nobody can read contact\n  - nobody can read contact\n  - ${long}\n`,
      'p.yaml',
    );
    const ids = runOf(
      formatTestSarif(evaluatePolicy(policy, broken), 'site', 'p.yaml', lineOne),
    ).tool.driver.rules.map((r: { id: string }) => r.id);
    expect(ids.slice(0, 2)).toEqual([
      'policy/nobody-can-read-contact',
      'policy/nobody-can-read-contact-2',
    ]);
    expect(ids[2]).toMatch(/^policy\/nobody-can-read-x+-[0-9a-f]{8}$/);
    expect(ids[2].length).toBe('policy/'.length + 80);
  });
});

describe('cli --format sarif', () => {
  it('writes SARIF for lint, with lines found from record GUIDs', async () => {
    const result = await cli('lint', 'test/fixtures/classic', '--format', 'sarif');
    expect(result.code).toBe(ExitCode.Ok);
    const sarif = runOf(result.out);
    expect(sarif.results[0].locations[0].physicalLocation).toEqual({
      artifactLocation: {
        uri: 'test/fixtures/classic/table-permissions/Feedback.tablepermission.yml',
      },
      region: { startLine: 11 },
    });
  });

  it('writes SARIF for test and keeps the exit code', async () => {
    const result = await cli(
      'test',
      'test/fixtures/broken',
      '--policy',
      'test/fixtures/policies/broken.policy.yaml',
      '--format',
      'sarif',
    );
    expect(result.code).toBe(ExitCode.Findings);
    expect(JSON.parse(result.out)).toMatchObject({ version: '2.1.0' });
  });
});
