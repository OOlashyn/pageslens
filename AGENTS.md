# AGENTS.md

pageslens is an offline CLI (`lint`, `test`, `diff`, `docs`) for Power Pages site configuration in git. TypeScript, ESM, published to npm as `pageslens`. User docs are in `README.md`; this file covers what isn't obvious from the code.

## Commands

The project uses [Vite+](https://viteplus.dev) (`vp`) instead of ESLint, Prettier, Vitest, tsc and tsup. All config is in `vite.config.ts`.

- `vp check`: format, lint and type check (`vp check --fix` to apply fixes)
- `vp test`: tests; `vp test -u` to update docs snapshots after an intended output change
- `vp pack`: build `dist/bin.mjs`; then `node dist/bin.mjs lint <path>` to try it on a site

The `npm run` scripts call the same commands. Node `^22.23.4 || ^24.22.1 || >=26.12.1` (the October 2026 security releases); CI fails below that.

## Input formats

pageslens reads two download layouts into the same model (`src/model/schema.ts`); `src/adapters/site-folder.ts` tells them apart by the keys in `website.yml`.

- `pac pages download-code-site` writes a `.powerpages-site/` folder with unprefixed keys (`id`, `name`, `entitylogicalname`) and one file per record. Read by `src/adapters/site-folder.ts`.
- Classic sites from `pac pages download` use `adx_`-prefixed keys and root-level list files (`webrole.yml`, `sitesetting.yml`, ...), with `--modelVersion 1` and `2` alike. `adx_` keys don't mean a standard data model site. Read by `src/adapters/classic-site.ts`.
- Adapters read through a file source (`src/adapters/files.ts`): a folder on disk, or a folder in a git commit for `diff`. Don't read the file system directly in an adapter.
- Code shared by both adapters is in `src/adapters/common.ts`. The classic adapter strips `adx_` generically; a new kind whose id key isn't `adx_<kind>id` goes in `ID_KEYS`, and a new relationship list in `RELATIONSHIP_KEYS`.
- Record GUIDs are the identity; file names come from record names and aren't stable.
- A child (Parent scope) table permission with no web role takes its parent's roles, as the design studio creates it.

## Changing a lint rule

A rule touches all of these. The tests check that every rule has a page listed in `rules/README.md` and fires on `broken`; keep the rest in step by hand:

- `src/lint/rules/<id>.ts`, registered in `src/lint/rules/index.ts`
- `rules/<id>.md` (why it matters, how to fix), plus the tables in `rules/README.md` and `README.md`
- a case in `test/fixtures/broken/` whose file starts with a `#` comment naming the rule (or `# clean:` for a record that must not fire)
- the expected findings in `test/fixtures/README.md` and `test/lint/lint.test.ts`
- docs snapshots in `test/docs/__snapshots__/` if the output changes
- `pageslens.config.schema.json`, generated from the rules: `vp test -u` rewrites it, and a test fails while it's out of date

`test/fixtures/ecoflux/` is a copy of a real demo site: don't edit it to make a test pass. Fixture files are kept byte-exact (`.gitattributes`) and are excluded from formatting.

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

## Conventions

- Docs output and findings are deterministic: sorted, no timestamps, so regenerated docs give quiet diffs.
- Messages and docs are plain English in short sentences.
- `claude-research/` holds internal notes (spec, plan, spike findings) and is git-ignored. Don't link to it from tracked files.

## Git

- Work on a feature branch and open a PR into `main`, which is protected. CI runs on every PR and on pushes to `main`.
- Don't bump the version, tag, create releases or publish to npm; the maintainer does releases (see `README.md`).
