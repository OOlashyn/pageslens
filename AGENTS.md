# AGENTS.md

pageslens is an offline CLI (`lint`, `docs`) for Power Pages site configuration in git. TypeScript, ESM, published to npm as `pageslens`. User docs are in `README.md`; this file covers what isn't obvious from the code.

## Commands

The project uses [Vite+](https://viteplus.dev) (`vp`) instead of ESLint, Prettier, Vitest, tsc and tsup. All config is in `vite.config.ts`.

- `vp check`: format, lint and type check (`vp check --fix` to apply fixes)
- `vp test`: tests; `vp test -u` to update docs snapshots after an intended output change
- `vp pack`: build `dist/bin.mjs`; then `node dist/bin.mjs lint <path>` to try it on a site

The `npm run` scripts call the same commands. Node `^22.23.4 || ^24.22.1 || >=26.12.1` (the October 2026 security releases); CI fails below that.

## Input formats

- `pac pages download-code-site` writes a `.powerpages-site/` folder with unprefixed keys (`id`, `name`, `entitylogicalname`) and one file per record. This is the format the MVP reads.
- Classic sites from `pac pages download` use `adx_`-prefixed keys and root-level list files (`webrole.yml`, `sitesetting.yml`, ...), with `--modelVersion 1` and `2` alike. `adx_` keys don't mean a standard data model site.
- Record GUIDs are the identity; file names come from record names and aren't stable.
- A child (Parent scope) table permission with no web role takes its parent's roles, as the design studio creates it.

## Changing a lint rule

A rule touches all of these. The tests check that every rule has a page listed in `rules/README.md` and fires on `broken`; keep the rest in step by hand:

- `src/lint/rules/<id>.ts`, registered in `src/lint/rules/index.ts`
- `rules/<id>.md` (why it matters, how to fix), plus the tables in `rules/README.md` and `README.md`
- a case in `test/fixtures/broken/` whose file starts with a `#` comment naming the rule (or `# clean:` for a record that must not fire)
- the expected findings in `test/fixtures/README.md` and `test/lint/lint.test.ts`
- docs snapshots in `test/docs/__snapshots__/` if the output changes

`test/fixtures/ecoflux/` is a copy of a real demo site: don't edit it to make a test pass. Fixture files are kept byte-exact (`.gitattributes`) and are excluded from formatting.

## Conventions

- Docs output and findings are deterministic: sorted, no timestamps, so regenerated docs give quiet diffs.
- Messages and docs are plain English in short sentences.
- `docs/` and `claude-research/` are internal notes and git-ignored. Don't link to them from tracked files.

## Git

- Work on a feature branch and open a PR into `main`, which is protected. CI runs on every PR and on pushes to `main`.
- Don't bump the version, tag, create releases or publish to npm; the maintainer does releases (see `README.md`).
