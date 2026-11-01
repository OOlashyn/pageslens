<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo/lockup-dark.svg">
    <img alt="pageslens" src="assets/logo/lockup-light.svg" height="64">
  </picture>
</h1>

Offline lint, policy tests, access diffs and docs for Power Pages site configuration in source control.

**Documentation: [pageslens.olashyn.dev](https://pageslens.olashyn.dev)**

pageslens reads a site downloaded with the Power Platform CLI (the `.powerpages-site` folder that `pac pages download-code-site` writes, or the site folder that `pac pages download` writes) or an unpacked solution that holds the site (`pac solution unpack` or `pac solution clone`), and:

- **lints** it: table permissions, web roles, Web API settings and secrets typed into settings, with stable rule ids, severities and exit codes for CI;
- **tests** it against your own requirements, written as short sentences in a policy file ("anonymous cannot read contact");
- **diffs** two versions of it: what a change does to who can see and change what, for a pull request comment;
- **aligns** a download with the solution that deploys it: components left out of the solution, or different in it, before the import;
- **documents** it: an access matrix (which role can do what on which table), the Web API surface, and a Mermaid diagram, as plain Markdown.

It needs no Dataverse connection and no agent: the same folder gives the same output every run. To use it from a coding agent, see [Using pageslens with an agent](#using-pageslens-with-an-agent).

> **Status: early.** pageslens has been verified on **enhanced data model** sites, both a **code site** (`pac pages download-code-site`) and a **classic site** (`pac pages download`), and on unpacked solutions of both. `pac pages download` writes the same layout with `--modelVersion 1` and `2`, and a standard data model site should download in it too, but neither has been checked against a real site yet.

## Quick start

Requires Node.js 22.23.4+, 24.22.1+ or 26.12.1+.

```bash
npx pageslens lint path/to/site
```

```bash
npx pageslens test path/to/site
```

```bash
npx pageslens diff origin/main HEAD --site path/to/site
```

```bash
npx pageslens align path/to/site path/to/solution
```

```bash
npx pageslens docs path/to/site --out docs/site
```

`path/to/site` is the `.powerpages-site` folder, the folder that contains it, a classic site folder (the one with `website.yml` and `webrole.yml`), or an unpacked solution. [Getting started](docs/getting-started.md) has the details, solutions and deployment settings files.

## Commands

| Command                            | What it does                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| [`pageslens lint`](docs/lint.md)   | Finds known mistakes, with stable [rules](rules/README.md), severities and exit codes for CI |
| [`pageslens test`](docs/policy.md) | Checks the site against the requirements in `pageslens.policy.yaml`                          |
| [`pageslens diff`](docs/diff.md)   | Shows what a change does to access: wider, narrower or neutral, for a pull request comment   |
| [`pageslens align`](docs/align.md) | Checks that a download and an unpacked solution describe the same site                       |
| [`pageslens docs`](docs/docs.md)   | Writes an access matrix, the Web API surface and a Mermaid diagram as Markdown               |
| `pageslens explain [rule]`         | Prints a lint rule's page (why it matters, how to fix it), or lists the rules                |

## In CI

The pageslens action runs `lint` and `test`, uploads the results to code scanning, and posts what a pull request does to access as one comment:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0 # the merge base needs the history of both branches
- uses: OOlashyn/pageslens@v0.13.0
  with:
    path: site
```

The permissions, inputs and outputs, running pageslens without the action, and SARIF: [In CI](docs/ci.md). For a full ALM workflow, see [docs/alm.md](docs/alm.md); for Azure Pipelines, [docs/azure-devops.md](docs/azure-devops.md).

## Using pageslens with an agent

pageslens gives the facts; a coding agent can explain them and propose fixes. [Using pageslens with an agent](docs/agents.md) has the working rules and the steps for reviewing a site, reviewing a pull request's access changes, and writing narrative docs. Point your agent at that page, or paste it into your `AGENTS.md` or `CLAUDE.md`.

## Development

The project uses [Vite+](https://viteplus.dev) (`vp`) for formatting, linting, type checking, tests and the build, instead of ESLint, Prettier, Vitest and tsc. All config is in `vite.config.ts`.

```bash
npm install
```

Format, lint and type check (`vp check --fix` applies the fixes):

```bash
vp check
```

Run the tests (`vp test -u` updates snapshots and `pageslens.config.schema.json` after an intended change):

```bash
vp test
```

Build `dist/bin.mjs`, then try it on a site:

```bash
vp pack
```

```bash
node dist/bin.mjs lint test/fixtures/broken
```

Without Vite+ installed globally, `npx vp …` runs the project's own copy. The `npm run check`, `npm test` and `npm run build` scripts call the same commands.

`test/fixtures/` holds the sites the tests read: downloads (`ecoflux`, a demo code site; `broken`, one deliberate mistake per rule; `classic`, a trimmed classic download; `registration`, a classic site; `classic-pages`, page access rules; `parent-chains`, child permissions for `under` in policies), unpacked solutions (`solution-ecoflux` and `solution-registration`, the same sites as `ecoflux` and `registration`; `solution-broken`, adapter cases), plus `policies/`, policy files for `pageslens test`, and `diff/`, pairs of small sites for `pageslens diff`. `test/fixtures/README.md` lists what each should produce.

### Docs site

`site/` builds the [docs site](https://pageslens.olashyn.dev) from `docs/` and `rules/`, which stay the source: `scripts/sync-docs.ts` copies them in before each build. To preview it, in `site/`:

```bash
npm install
```

```bash
npm run dev
```

The [site workflow](.github/workflows/site.yml) deploys it when a release is published, and on a manual run. It also builds it on pull requests that change the docs.

### Releasing

1. Write the release notes in `specs/releases/<x.y.z>.md` and merge them into `main`. Then, on an up-to-date, clean `main`, prepare the release in one command:

   ```bash
   npm run release -- <x.y.z>
   ```

   It creates `release/<x.y.z>`, runs `npm version <x.y.z> --no-git-tag-version` (`package.json` and `package-lock.json`), points the action examples in the README, `docs/ci.md` and `docs/alm.md` at `v<x.y.z>` (not for a pre-release), commits "Release <x.y.z>" and pushes the branch. It checks everything first and changes nothing when a check fails: the version comes after the current one, the tree is clean, `main` matches `origin/main`, the branch doesn't exist, and the release notes are there. `--dry-run` prints the steps without running them, and `--pr` also opens the pull request with `gh`, with the release notes as its description. Merge the pull request into `main`.

2. Create a GitHub release with the tag `v<x.y.z>` on `main`, with the release notes (the script prints the `gh release create` command). The [release workflow](.github/workflows/release.yml) checks that the tag matches `package.json`, runs the checks and tests, and stages the package on npm through trusted publishing (no npm token in the repo).
3. Approve the staged version with 2FA, on npmjs.com or with `npm stage list pageslens` and `npm stage approve <stage-id>`. It's installable only after approval.

The same tag is the GitHub Action's version: `OOlashyn/pageslens@v<x.y.z>` installs `pageslens@<x.y.z>` from npm, so the action at that tag works once the version is approved.

Pre-release versions (`x.y.z-beta.n`) are staged under the `next` dist-tag instead of `latest`.

## License

[MIT](LICENSE)
