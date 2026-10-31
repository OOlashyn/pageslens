import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { loadSiteFolder } from '../src/adapters/site-folder.js';
import { ExitCode } from '../src/cli.js';
import { settingValue } from '../src/graph/describe.js';
import { lint } from '../src/lint/engine.js';
import {
  applySettings,
  parseSettings,
  readSettingsFile,
  SettingsFileError,
} from '../src/model/deployment-settings.js';
import type { Site } from '../src/model/schema.js';
import { evaluatePolicy } from '../src/policy/evaluate.js';
import { loadPolicy } from '../src/policy/parse.js';
import { cli, tempFiles } from './helpers.js';

// `--settings` (specs/0010): a deployment settings file gives one stage's environment variable
// values. test/fixtures/settings/ has a download whose Web API and registration settings come
// from variables, and a file for two stages.

const FIXTURE = 'test/fixtures/settings';
const site = await loadSiteFolder(FIXTURE);
const stage = async (name: string) =>
  applySettings(site, await readSettingsFile(`${FIXTURE}/${name}.json`, process.cwd()));
const prod = await stage('prod');
const test = await stage('test');

const setting = (s: Site, name: string) => s.siteSettings.find((x) => x.name === name)!;
const noConfig = { rules: {}, ignore: [], align: { checks: {}, ignore: [] } };
const findings = (s: Site) => lint(s, noConfig).findings.map((f) => `${f.ruleId} ${f.recordId}`);

/** The error a file's text is refused with. */
function refusal(text: string): string {
  try {
    parseSettings(text, 'stage.json');
  } catch (error) {
    if (error instanceof SettingsFileError) return error.message;
    throw error;
  }
  return '';
}

describe('reading the file', () => {
  it('reads what pac solution create-settings writes', async () => {
    const settings = await readSettingsFile(
      'test/fixtures/deployment-settings/solution-registration.json',
      process.cwd(),
    );
    expect(settings.path).toBe('test/fixtures/deployment-settings/solution-registration.json');
    expect([...settings.variables]).toEqual([['dwcrm_cardsperpage', { value: '', secret: false }]]);
  });

  it('ignores keys it has no use for, and tells a secret by TypeId', () => {
    const settings = parseSettings(
      JSON.stringify({
        EnvironmentVariables: [
          { SchemaName: 'A_One', Value: 'x', Extra: 1 },
          { SchemaName: 'a_two' },
          { SchemaName: 'a_secret', Value: '/subscriptions/x', TypeId: 100000005 },
        ],
        ConnectionReferences: [{ LogicalName: 'c' }],
        CopilotAgents: [],
        Future: true,
      }),
      'stage.json',
    );
    expect(Object.fromEntries(settings.variables)).toEqual({
      a_one: { value: 'x', secret: false },
      a_two: { value: '', secret: false },
      a_secret: { value: '/subscriptions/x', secret: true },
    });
  });

  it('refuses a file that is not JSON or not a deployment settings file', () => {
    expect(refusal('{')).toMatch(/^stage\.json isn't JSON: /);
    expect(refusal('{}')).toMatch(
      /^stage\.json isn't a deployment settings file at EnvironmentVariables: /,
    );
    expect(refusal('{"EnvironmentVariables": [{"Value": "x"}]}')).toMatch(
      /at EnvironmentVariables\.0\.SchemaName: /,
    );
    expect(refusal('{"EnvironmentVariables": [{"SchemaName": "a", "Value": 1}]}')).toMatch(
      /at EnvironmentVariables\.0\.Value: /,
    );
    expect(refusal('﻿{"EnvironmentVariables": []}')).toBe('');
  });
});

describe('applying the file', () => {
  it('gives a download the values the file has, matching schema names in any case', () => {
    expect(setting(prod, 'Webapi/contact/fields')).toMatchObject({
      value: '*',
      unknown: false,
      settingsFile: `${FIXTURE}/prod.json`,
    });
    expect(settingValue(setting(prod, 'Webapi/contact/enabled'))).toBe(
      `"true" from environment variable dwcrm_ContactApi in ${FIXTURE}/prod.json`,
    );
  });

  it('leaves a secret, an empty value and a missing variable unknown, naming the file', () => {
    expect(setting(prod, 'Authentication/OpenIdConnect/Contoso/ClientSecret')).toMatchObject({
      unknown: true,
      settingsSecret: true,
    });
    expect(setting(test, 'Authentication/Registration/Enabled')).toMatchObject({ unknown: true });
    expect(settingValue(setting(prod, 'Webapi/error/innererror'))).toBe(
      `from environment variable dwcrm_InnerErrors (not in the download or ${FIXTURE}/prod.json)`,
    );
  });

  it('runs the rules on the values a stage gets', () => {
    expect(findings(site)).toEqual([]);
    expect(findings(prod)).toEqual([
      'webapi-wildcard-fields 00000000-0000-0000-0003-000000000002',
      'webapi-no-permission 00000000-0000-0000-0003-000000000003',
    ]);
    expect(findings(test)).toEqual([]);
  });

  it("gives a solution the file's value over its own, and keeps its own without one", async () => {
    const solution = await loadSiteFolder('test/fixtures/solution-registration');
    const cards = (s: Site) => setting(s, 'ASP/Pagination/CardsPerPage');
    const unedited = await readSettingsFile(
      'test/fixtures/deployment-settings/solution-registration.json',
      process.cwd(),
    );
    expect(cards(applySettings(solution, unedited))).toEqual(cards(solution));
    const filled = parseSettings(
      '{"EnvironmentVariables": [{"SchemaName": "dwcrm_CardsPerPage", "Value": "12"}]}',
      'prod.json',
    );
    expect(cards(applySettings(solution, filled))).toMatchObject({ value: '12' });
  });
});

describe('test with a stage', () => {
  it('passes and fails as the fixture comments say for each stage', async () => {
    const file = 'test/fixtures/policies/settings.policy.yaml';
    const policy = await loadPolicy('.', file);
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const [name, s] of [
      ['prod', prod],
      ['test', test],
    ] as const) {
      for (const r of evaluatePolicy(policy, s).results) {
        const expected = new RegExp(`${name}: (pass|fail)`).exec(lines[r.statement.line - 1]!)?.[1];
        expect(r.passed ? 'pass' : 'fail', `${name}: ${r.statement.text}`).toBe(expected);
      }
    }
  });
});

describe('--settings on the command line', () => {
  it('lints and tests the stage', async () => {
    const settings = ['--settings', `${FIXTURE}/prod.json`];
    expect((await cli('lint', FIXTURE)).code).toBe(ExitCode.Ok);
    const linted = await cli('lint', FIXTURE, ...settings);
    expect(linted.code).toBe(ExitCode.Findings);
    expect(linted.out).toContain('webapi-wildcard-fields');
    const tested = await cli(
      'test',
      FIXTURE,
      '--policy',
      'test/fixtures/policies/settings.policy.yaml',
      '--settings',
      `${FIXTURE}/test.json`,
    );
    expect(tested.out).toContain(
      `Authentication/Registration/Enabled comes from environment variable dwcrm_Registration, which a download doesn't include, and ${FIXTURE}/test.json gives it no value`,
    );
  });

  it('exits 2 on a file it cannot use', async () => {
    const dir = await tempFiles({ 'bad.json': '{"EnvironmentVariables": {}}' });
    for (const file of [join(dir, 'none.json'), join(dir, 'bad.json')]) {
      for (const command of ['lint', 'test']) {
        const result = await cli(command, FIXTURE, '--settings', file);
        expect(result.code, `${command} ${file}`).toBe(ExitCode.Usage);
      }
    }
    expect((await cli('lint', FIXTURE, '--settings', 'none.json')).err).toBe(
      "error: there's no deployment settings file none.json\n",
    );
  });
});
