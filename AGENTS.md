# AGENTS.md

pageslens is an offline CLI (`lint`, `test`, `diff`, `docs`) for Power Pages site configuration in git. TypeScript, ESM, published to npm as `pageslens`. User docs are in `README.md`; this file covers what isn't obvious from the code.

## Commands

The project uses [Vite+](https://viteplus.dev) (`vp`) instead of ESLint, Prettier, Vitest, tsc and tsup. All config is in `vite.config.ts`.

- `vp check`: format, lint and type check (`vp check --fix` to apply fixes)
- `vp test`: tests; `vp test -u` to update docs snapshots after an intended output change
- `vp pack`: build `dist/bin.mjs`; then `node dist/bin.mjs lint <path>` to try it on a site

The `npm run` scripts call the same commands. Node `^22.23.4 || ^24.22.1 || >=26.12.1` (the October 2026 security releases); CI fails below that.

## Input formats

pageslens reads two download layouts and unpacked solutions into the same model (`src/model/schema.ts`). `src/adapters/site-folder.ts` finds the site (`findSiteRoot`) and tells the downloads apart by the keys in `website.yml`. `site.format` says what was read; `site.layout` says whether it's a code site or a classic site, whatever the format.

- `pac pages download-code-site` writes a `.powerpages-site/` folder with unprefixed keys (`id`, `name`, `entitylogicalname`) and one file per record. Read by `src/adapters/site-folder.ts`.
- Classic sites from `pac pages download` use `adx_`-prefixed keys and root-level list files (`webrole.yml`, `sitesetting.yml`, ...), with `--modelVersion 1` and `2` alike. `adx_` keys don't mean a standard data model site. Read by `src/adapters/classic-site.ts`.
- Unpacked solutions (XML format: `Other/Solution.xml`, or a `pac solution clone` project's `src/`) keep each component in `powerpagecomponents/<guid>/powerpagecomponent.xml`, with its fields as JSON in `content`. Read by `src/adapters/solution.ts` (spec 0007). It maps `powerpagecomponenttype` to the downloads' kinds (`KINDS`), moves inline text to the side file names (`TEXT_FIELDS`), turns JSON scalars into strings as the YAML gives them, and reads one site only. `test/adapters/solution.test.ts` checks each real solution against its download; keep it passing when either adapter changes.
- A site setting with `source: 1` takes its value from the environment variable `envvar_schema`. A solution has the variable; a download has only the setting's leftover `value`, so the model marks the value `unknown`. Code that reads a setting's value has to handle `unknown` (and `WebApiTable.unknown`): rules skip it, `test` fails, `diff` counts it as wider.
- `--settings <file>` (spec 0010) reads a stage's deployment settings file (`src/model/deployment-settings.ts`) and `applySettings` puts its values in the model after the adapter, so rules and statements need nothing of their own. Messages about a setting's value go through `settingValue` and `unknownValue` in `src/graph/describe.ts`, which name the file.
- Adapters read through a file source (`src/adapters/files.ts`): a folder on disk, or a folder in a git commit for `diff`. Don't read the file system directly in an adapter.
- Code shared by the adapters is in `src/adapters/common.ts`. The classic adapter strips `adx_` generically; a new kind whose id key isn't `adx_<kind>id` goes in `ID_KEYS`, and a new relationship list in `RELATIONSHIP_KEYS`.
- Record GUIDs are the identity; file names come from record names and aren't stable.
- A child (Parent scope) table permission with no web role takes its parent's roles, as the design studio creates it.
- Page access rules only decide who opens a page on a classic site. The page lint rules and `pages.md` check `site.layout` and do nothing on a code site. Effective page access is in `src/graph/pages.ts` (spec 0005).

## Changing a lint rule

A rule touches all of these. The tests check that every rule has a page listed in `rules/README.md` and fires on `broken` (or on `classic-pages`, for the classic-only page rules); keep the rest in step by hand:

- `src/lint/rules/<id>.ts`, registered in `src/lint/rules/index.ts`
- `rules/<id>.md` (why it matters, how to fix), plus the tables in `rules/README.md` and `README.md`. The pages ship in the npm package: `pageslens explain <id>` prints them, starting with `# <id>`
- a case in `test/fixtures/broken/` whose file starts with a `#` comment naming the rule (or `# clean:` for a record that must not fire); page access rules go in `test/fixtures/classic-pages/`
- the expected findings in `test/fixtures/README.md` and `test/lint/lint.test.ts`
- docs snapshots in `test/docs/__snapshots__/` if the output changes
- `pageslens.config.schema.json`, generated from the rules: `vp test -u` rewrites it, and a test fails while it's out of date

`test/fixtures/ecoflux/` and `test/fixtures/registration/` are copies of real sites: don't edit them to make a test pass. Fixture files are kept byte-exact (`.gitattributes`) and are excluded from formatting.

## Changing the policy grammar

`pageslens test` reads `pageslens.policy.yaml`: one sentence per requirement, from a closed set of forms. Keep it closed: no user-defined statements, patterns or expressions. A new form or a change in meaning touches:

- `src/policy/types.ts` (the `Check` union), `parse.ts` (the grammar) and `evaluate.ts` (what passes)
- `docs/policy.md`, the user reference: the grammar and the "passes when" tables
- `test/fixtures/policies/*.policy.yaml` (a passing and a failing case; each line's comment says which) and `test/policy/policy.test.ts`, plus the text snapshot

`authenticated` means every signed-in user: in `cannot` and `only` it counts every role except Anonymous Users; in `can` it needs the Authenticated Users role itself. Members of a custom role also have the Authenticated Users role's grants.

## Changing diff

`pageslens diff` compares two sides' facts: grants, the Web API, web roles and a closed list of settings (`DIFF_SETTINGS` in `compare.ts`). The change kinds and their classification are closed too, and "wider" is conservative: anything not shown narrower or neutral is wider. A new kind, a new setting or a change in classification touches:

- `src/diff/types.ts` (`CHANGE_KINDS`), `facts.ts` (what a site is reduced to) and `compare.ts` (matching, classification, wording, order)
- `src/diff/format/` when the output changes; the JSON `version` only when a field is removed or changes meaning
- `docs/diff.md`, the user reference: the classification tables and the kinds list
- a case in a `test/fixtures/diff/<case>/{base,head}` pair whose file starts with a `#` comment naming the class and kind, the list in `test/fixtures/README.md`, and `test/diff/diff.test.ts` (`vp test -u` for the snapshots). Ref reading and `--merge-base` are tested on a temporary repository in `test/diff/git.test.ts`.

Grant sentences are shared with `test` in `src/graph/describe.ts`, so both say the same thing. Git runs with argument arrays and `--end-of-options` (`src/util/git.ts`): refs come from pull requests.

## Changing align

`pageslens align` compares a download with a solution of the same site, record by record (spec 0008, user reference `docs/align.md`). The checks are closed (`CHECKS` in `src/align/types.ts`), and so is the list of what isn't a difference (`src/align/normalize.ts`, with `ALIGN_IGNORED`). Both real pairs must give no findings (`test/align/align.test.ts`): when an adapter or a new `pac` makes them differ, find out why before adding a rule. A new check or rule touches `types.ts`, `normalize.ts` or `compare.ts`, `docs/align.md`, a case in `test/fixtures/align/` (listed in `test/fixtures/README.md`), and the snapshots (`vp test -u`; a new check also changes `pageslens.config.schema.json`).

## The GitHub Action

`action.yml` (composite) runs `action/main.ts` in three steps: `run` (lint, test, align with `solution` set, and diff; never fails, writes what failed to a file), `comment` and `finish` (fails the job). Spec: [specs/0004-github-action.md](specs/0004-github-action.md).

- Node.js runs `action/main.ts` directly, without a build: erasable TypeScript only (no enums, no parameter properties), Node built-ins only, no imports from `src/`.
- It installs exactly the `package.json` version from npm, so the tag `v<x.y.z>` runs `pageslens@<x.y.z>`. Don't add a version input.
- CI runs it with `uses: ./` and `PAGESLENS_ACTION_CLI=dist/bin.mjs`, so it tests this commit's build. The helpers are unit-tested in `test/action/`; posting a comment and fork pull requests can only be checked on GitHub.
- Inputs reach the script through `env`, never `${{ }}` inside `run:`.

## Conventions

- Docs output and findings are deterministic: sorted, no timestamps, so regenerated docs give quiet diffs.
- Messages and docs are plain English in short sentences.
- `specs/` holds the design notes: [specs/ROADMAP.md](specs/ROADMAP.md) (status and what's next, read it first), one spec per feature (`specs/NNNN-<feature>.md`), research, release notes and archived plans. A new feature starts as a spec with open questions for the maintainer; when it ships, add an "As built" section and update the roadmap in the same PR. Specs are public: no local paths, environment names or credentials.

## Git

- Work on a feature branch and open a PR into `main`, which is protected. CI runs on every PR and on pushes to `main`.
- Don't bump the version, tag, create releases or publish to npm; the maintainer does releases (see `README.md`). `npm run release` (`scripts/release.ts`) is the maintainer's: don't run it. Release notes go in `specs/releases/<x.y.z>.md` before it.
