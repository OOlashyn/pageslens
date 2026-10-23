import { relative } from 'node:path';
import { Command, CommanderError, Option } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { loadSiteFolder, SiteLoadError } from './adapters/site-folder.js';
import { ConfigError, loadConfig } from './lint/config.js';
import { lint } from './lint/engine.js';
import { formatJson } from './lint/format/json.js';
import { formatText } from './lint/format/text.js';
import { RULES } from './lint/rules/index.js';
import { toPosixPath } from './model/normalize.js';

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

interface LintOptions {
  format: 'text' | 'json';
  config?: string;
}

export function buildProgram(io: Io, setExitCode: (code: number) => void): Command {
  const program = new Command()
    .name('pageslens')
    .description(pkg.description)
    .version(pkg.version)
    .configureOutput({ writeOut: io.out, writeErr: io.err })
    .exitOverride();

  program
    .command('lint')
    .description('Run the built-in rules against a .powerpages-site folder')
    .argument('[path]', 'site folder, or a folder that contains .powerpages-site', '.')
    .addOption(
      new Option('--format <format>', 'output format').choices(['text', 'json']).default('text'),
    )
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
      const format = options.format === 'json' ? formatJson : formatText;
      io.out(format(result, site, sitePath));
      setExitCode(result.counts.error > 0 ? ExitCode.Findings : ExitCode.Ok);
    });

  program
    .command('docs')
    .description('Write Markdown docs for a .powerpages-site folder')
    .argument('[path]', 'site folder, or a folder that contains .powerpages-site', '.')
    .requiredOption('--out <dir>', 'output folder')
    .action(() => {
      throw new CommanderError(
        ExitCode.Usage,
        'pageslens.notImplemented',
        'docs is not implemented yet',
      );
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
      if (error.exitCode === 0) return ExitCode.Ok;
      if (error.code === 'pageslens.notImplemented') io.err(`error: ${error.message}\n`);
      return ExitCode.Usage;
    }
    if (error instanceof SiteLoadError) {
      const problems = error.problems.map((p) => `  ${p.file ? `${p.file}: ` : ''}${p.message}\n`);
      io.err(`error: ${error.message}\n${problems.join('')}`);
      return ExitCode.Usage;
    }
    if (error instanceof ConfigError) {
      io.err(`error: ${error.message}\n`);
      return ExitCode.Usage;
    }
    throw error;
  }
}
