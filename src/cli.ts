import { Command, CommanderError } from 'commander';
import pkg from '../package.json' with { type: 'json' };

export const ExitCode = {
  Ok: 0,
  Findings: 1,
  Usage: 2,
} as const;

export function buildProgram(): Command {
  const program = new Command()
    .name('pageslens')
    .description(pkg.description)
    .version(pkg.version)
    .exitOverride();

  program
    .command('lint')
    .description('Run the built-in rules against a .powerpages-site folder')
    .argument('[path]', 'site folder, or a folder that contains .powerpages-site', '.')
    .option('--format <format>', 'output format: text or json', 'text')
    .option('--config <file>', 'path to pageslens.config.yaml')
    .action(() => {
      throw new CommanderError(
        ExitCode.Usage,
        'pageslens.notImplemented',
        'lint is not implemented yet',
      );
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

export async function run(argv: string[]): Promise<number> {
  try {
    await buildProgram().parseAsync(argv, { from: 'user' });
    return ExitCode.Ok;
  } catch (error) {
    if (error instanceof CommanderError) {
      // --help and --version exit through here with code 0; commander has already printed them
      if (error.exitCode === 0) return ExitCode.Ok;
      if (error.code === 'pageslens.notImplemented') console.error(`error: ${error.message}`);
      return ExitCode.Usage;
    }
    throw error;
  }
}
