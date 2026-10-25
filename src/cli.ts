import { relative, resolve } from 'node:path';
import { Command, CommanderError, Option } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { loadSiteFolder, SiteLoadError } from './adapters/site-folder.js';
import { diffSites, summarize } from './diff/compare.js';
import { formatJson as formatDiffJson } from './diff/format/json.js';
import { formatMarkdown as formatDiffMarkdown } from './diff/format/markdown.js';
import { formatText as formatDiffText } from './diff/format/text.js';
import { DiffInputError, loadSides } from './diff/inputs.js';
import type { DiffResult } from './diff/types.js';
import { writeSiteDocs } from './docs/write.js';
import { ConfigError, loadConfig } from './lint/config.js';
import { lint } from './lint/engine.js';
import { formatJson } from './lint/format/json.js';
import { formatSarif } from './lint/format/sarif.js';
import { formatText } from './lint/format/text.js';
import { RULES } from './lint/rules/index.js';
import { toPosixPath } from './model/normalize.js';
import { evaluatePolicy } from './policy/evaluate.js';
import { formatJson as formatTestJson } from './policy/format/json.js';
import { formatSarif as formatTestSarif } from './policy/format/sarif.js';
import { formatText as formatTestText } from './policy/format/text.js';
import { loadPolicy, PolicyError, POLICY_FILE } from './policy/parse.js';
import { recordLines } from './sarif.js';
import { GitError } from './util/git.js';

export const ExitCode = {
  Ok: 0,
  Findings: 1,
  Usage: 2,
} as const;

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

const processIo: Io = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

type Format = 'text' | 'json' | 'sarif';

const FORMATS: Format[] = ['text', 'json', 'sarif'];

interface LintOptions {
  format: Format;
  config?: string;
}

interface TestOptions {
  format: Format;
  policy?: string;
}

type DiffFormat = 'text' | 'markdown' | 'json';

interface DiffOptions {
  format: DiffFormat;
  mergeBase?: boolean;
  failOn?: 'wider' | 'any';
}

const DIFF_FORMATS = {
  text: formatDiffText,
  markdown: formatDiffMarkdown,
  json: formatDiffJson,
} satisfies Record<DiffFormat, (result: DiffResult) => string>;

export function buildProgram(io: Io, setExitCode: (code: number) => void): Command {
  const program = new Command()
    .name('pageslens')
    .description(pkg.description)
    .version(pkg.version)
    .configureOutput({ writeOut: io.out, writeErr: io.err })
    .exitOverride();

  program
    .command('lint')
    .description('Run the built-in rules against a downloaded site')
    .argument(
      '[path]',
      '.powerpages-site folder, a folder that contains one, or a classic site folder',
      '.',
    )
    .addOption(new Option('--format <format>', 'output format').choices(FORMATS).default('text'))
    .option('--config <file>', `path to pageslens.config.yaml (default: nearest one found)`)
    .action(async (path: string, options: LintOptions) => {
      const config = await loadConfig(
        path,
        RULES.map((rule) => rule.id),
        options.config,
      );
      const site = await loadSiteFolder(path);
      const result = lint(site, config);
      const sitePath = toPosixPath(relative(process.cwd(), site.root)) || '.';
      if (options.format === 'sarif') {
        const lineOf = await recordLines(
          site.root,
          result.findings.map((f) => f.source.file),
        );
        io.out(formatSarif(result, sitePath, RULES, lineOf));
      } else {
        const configPath = config.path && toPosixPath(relative(process.cwd(), config.path));
        io.out(
          options.format === 'json'
            ? formatJson(result, site, sitePath)
            : formatText(result, site, sitePath, configPath),
        );
      }
      setExitCode(result.counts.error > 0 ? ExitCode.Findings : ExitCode.Ok);
    });

  program
    .command('test')
    .description(`Check the site against your requirements in ${POLICY_FILE}`)
    .argument(
      '[path]',
      '.powerpages-site folder, a folder that contains one, or a classic site folder',
      '.',
    )
    .addOption(new Option('--format <format>', 'output format').choices(FORMATS).default('text'))
    .option('--policy <file>', `path to ${POLICY_FILE} (default: nearest one found)`)
    .action(async (path: string, options: TestOptions) => {
      const policy = await loadPolicy(path, options.policy);
      const site = await loadSiteFolder(path);
      const result = evaluatePolicy(policy, site);
      const sitePath = toPosixPath(relative(process.cwd(), site.root)) || '.';
      const policyPath = toPosixPath(relative(process.cwd(), policy.path));
      if (options.format === 'sarif') {
        const evidence = result.results.flatMap((r) => r.evidence);
        const lineOf = await recordLines(
          site.root,
          evidence.flatMap((e) => (e.file ? [e.file] : [])),
        );
        io.out(formatTestSarif(result, sitePath, policyPath, lineOf));
      } else {
        const format = options.format === 'json' ? formatTestJson : formatTestText;
        io.out(format(result, site, sitePath, policyPath));
      }
      setExitCode(result.counts.failed > 0 ? ExitCode.Findings : ExitCode.Ok);
    });

  program
    .command('diff')
    .description('Show what a change does to access: grants, Web API, web roles and key settings')
    .argument('<base>', 'folder or git ref to compare from')
    .argument('<head>', 'folder or git ref to compare with base')
    .argument(
      '[path]',
      'with two refs: the site folder, relative to the current folder (default: .)',
    )
    .option(
      '--merge-base',
      'compare head with the merge base of base and head, as a pull request does',
    )
    .addOption(
      new Option('--format <format>', 'output format')
        .choices(Object.keys(DIFF_FORMATS))
        .default('text'),
    )
    .addOption(
      new Option(
        '--fail-on <class>',
        'exit 1 when anything is wider, or when anything changed',
      ).choices(['wider', 'any']),
    )
    .action(async (base: string, head: string, path: string | undefined, options: DiffOptions) => {
      const sides = await loadSides({
        base,
        head,
        ...(path !== undefined && { path }),
        mergeBase: options.mergeBase ?? false,
        cwd: process.cwd(),
      });
      const changes = diffSites(sides.base.site, sides.head.site);
      const result: DiffResult = {
        base: sides.base.side,
        head: sides.head.side,
        changes,
        summary: summarize(changes),
      };
      io.out(DIFF_FORMATS[options.format](result));
      const fail =
        (options.failOn === 'wider' && result.summary.wider > 0) ||
        (options.failOn === 'any' && changes.length > 0);
      setExitCode(fail ? ExitCode.Findings : ExitCode.Ok);
    });

  program
    .command('docs')
    .description('Write Markdown docs for a downloaded site')
    .argument(
      '[path]',
      '.powerpages-site folder, a folder that contains one, or a classic site folder',
      '.',
    )
    .requiredOption('--out <dir>', 'output folder')
    .action(async (path: string, options: { out: string }) => {
      const site = await loadSiteFolder(path);
      const files = await writeSiteDocs(site, options.out);
      const outPath = toPosixPath(relative(process.cwd(), resolve(options.out))) || '.';
      io.out(`Wrote ${files.length} pages to ${outPath}: ${files.join(', ')}\n`);
    });

  return program;
}

export async function run(argv: string[], io: Io = processIo): Promise<number> {
  let exitCode: number = ExitCode.Ok;
  try {
    await buildProgram(io, (code) => (exitCode = code)).parseAsync(argv, { from: 'user' });
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      // --help and --version exit through here with code 0; commander has already printed them
      return error.exitCode === 0 ? ExitCode.Ok : ExitCode.Usage;
    }
    if (error instanceof SiteLoadError) {
      const problems = error.problems.map((p) => `  ${p.file ? `${p.file}: ` : ''}${p.message}\n`);
      io.err(`error: ${error.message}\n${problems.join('')}`);
      return ExitCode.Usage;
    }
    if (error instanceof PolicyError) {
      const problems = error.problems.map((p) => `  ${p}\n`);
      io.err(`error: the policy can't be used\n${problems.join('')}`);
      return ExitCode.Usage;
    }
    if (error instanceof DiffInputError || error instanceof GitError) {
      io.err(`error: ${error.message}
`);
      return ExitCode.Usage;
    }
    if (error instanceof ConfigError) {
      io.err(`error: ${error.message}\n`);
      return ExitCode.Usage;
    }
    throw error;
  }
}
