# pageslens M1 plan (archive)

_Frozen on 2026-10-24. This was the working plan for M1 (the MVP). Later work is in the feature specs, and the current state is in [ROADMAP.md](../ROADMAP.md)._

Based on [mvp-spec.md](../research/mvp-spec.md), [alm-story.md](../research/alm-story.md) and [spike-0-findings.md](../research/spike-0-findings.md).

## MVP scope

The MVP is a narrowed milestone **M1**: useful on its own, run offline against a `.powerpages-site/` folder in git.

**In**

- Two input layouts for an **enhanced data model** site: the `.powerpages-site/` folder of a **code site** (`download-code-site`, EcoFlux), and the folder of a **classic site** (`pac pages download`). The plan first assumed classic sites use the same folder; they don't (see Step 8).
- Access graph: web roles → table permissions → tables (privileges, scope, parent chain), plus the Web API surface from site settings.
- `pageslens lint [path]` with the access and Web API rules, a config file, `--format text|json`, exit codes.
- `pageslens docs [path] --out <dir>`: access matrix, Web API surface, Mermaid diagram.
- npm package `pageslens` (`npx pageslens ...`), Node 20+.

**Later**

- Input formats: unpacked solution folder (`powerpagecomponents/<guid>`), solution `.zip`, standard (`adx_`) data model. Spike 0 already showed the solution content uses the same keys as the download, so the model is designed so a second adapter can be added without changing it (see Step 2).
- M2: `test` (policy file), `diff`, SARIF, GitHub Action. `align` waits for the solution adapter.
- M3: agent skills, classic site-structure rules (`page-access-gap`, `broken-reference`, `duplicate-partial-url`), site map docs.
- Server Logic and cloud flows in docs, Proschi export.
- `append-missing` lint rule: needs table relationship metadata the YAML may not carry. Revisit after spike 1.

## Step 0: finish M0 before code (done 2026-10-22)

1. **Spike 1, key names.** Done; see [spike-1-findings.md](../research/spike-1-findings.md). Key names for web roles, table permissions (incl. contact/account/parent relationship keys), site settings, page rules and website access, plus the folder and side-file naming.
2. **Spike 2, fixtures.** Done; see `test/fixtures/README.md` for the expected findings per fixture.
   - `test/fixtures/ecoflux/`: a copy of the EcoFlux demo code site (without the per-environment `.portalconfig` manifest). Realistic smoke test and docs snapshot.
   - `test/fixtures/broken/`: hand-written, one deliberate case per lint rule plus clean records that must not fire.
   - A parent-chain example that works correctly isn't in either fixture yet; add one to `broken/` (or a small `clean/`) while writing the access graph.

## Step 1: project scaffold (done 2026-10-22)

As built: **Vite+** (`vite-plus`, one dev dependency) replaces tsup, ESLint, Prettier, Vitest and tsc. `vp check` runs Oxfmt, Oxlint and type checking (type-aware lint + `typeCheck` via tsgolint), `vp test` runs Vitest, `vp pack` builds `dist/bin.mjs` with tsdown. All config is in `vite.config.ts`. Node `^22.23.4 || ^24.22.1 || >=26.12.1`: the October 2026 Node.js security releases (4 high CVEs, incl. Brotli RCE and TLS hostname bypasses) are the minimum on every line; 20 and 25 are end of life and unpatched. CI fails if the runner's Node is below the patched release. `src/bin.ts` (with shebang) as the bin entry, CLI stub with `lint` and `docs` returning "not implemented", `.gitattributes` keeping fixture bytes exact. CI uses `voidzero-dev/setup-vp` on Node 22 and 24.

- TypeScript, ESM, Vite+ for build, test, lint and format.
- Dependencies kept small: `yaml`, `zod`, `commander`.
- `package.json` `bin: { pageslens: dist/bin.mjs }`, `files: [dist]`.
- CI for the repo itself: GitHub workflow running typecheck, lint, test on Node 20 and 22.
- Keep the internal notes out of the repo (`claude-research/`, git-ignored; committed as `specs/` from 2026-10-24).

Layout:

```
src/
  cli.ts                  # commander wiring, exit codes
  model/
    schema.ts             # zod: Site, WebRole, TablePermission, SiteSetting, WebPage, WebTemplate, ...
    kinds.ts              # download folder <-> record kind (type numbers from spike 0 kept for later)
    normalize.ts          # line endings, web file annotation fields
  adapters/
    site-folder.ts        # .powerpages-site YAML (+ .html side files) -> Site
  graph/
    access.ts             # role -> permission -> table, effective privileges per scope
    webapi.ts             # enabled tables, fields, which roles can call them
  lint/
    engine.ts             # run rules, apply config, sort findings
    config.ts             # pageslens.config.yaml: rule severities, ignores
    rules/*.ts            # one file per rule, stable id, docs link
    format/{text,json}.ts
  docs/
    access-matrix.ts
    webapi-surface.ts
    mermaid.ts
    write.ts
test/  fixtures/  rules/
```

## Step 2: site model (done 2026-10-22)

As built: `src/model/schema.ts` (zod schemas for website, web role, table permission, site setting, page rule, website access; `SiteRecord` for every record incl. untyped ones), `src/model/kinds.ts` (scope values), `src/model/normalize.ts`. YAML is parsed with the failsafe schema, so site setting values stay verbatim and the zod schemas do all typing. GUIDs are lower-cased.

- One record type per component kind the MVP reads: web role, table permission, site setting, website, web page, web template, content snippet, page rule, website access. Records of other folders are kept as raw records (`kind: "unknown"`, folder name) so nothing is silently dropped and later rules can use them.
- Records use the download's field keys and keep their GUID (`id`), so the solution adapter added later maps onto the same model.
- Every record keeps a **source location** (file path) so findings point at a file.

## Step 3: `.powerpages-site` adapter (done 2026-10-22)

As built: `src/adapters/site-folder.ts`. Loads EcoFlux as 143 records (same count as spike 0), skips `.portalconfig/`, attaches side files and web file content, collects every problem into one `SiteLoadError` instead of stopping at the first. 20 tests.

- Find the folder: the path itself, or a `.powerpages-site/` under it. Clear error otherwise.
- Walk the type folders, parse YAML, attach `.source.html` / `.copy.html` / `.summary.html` / snippet value files back onto the record.
- Reject a standard data model download with a clear message ("standard data model is not supported yet").
- Normalise `\r\n` and lone `\r` to `\n`; ignore web file annotation metadata.
- Tests: fixtures parse to the expected model; malformed YAML gives a parse error with the file path.

## Step 4: access graph (done 2026-10-22)

As built: `src/graph/access.ts` (`buildAccessGraph`: permission nodes with resolved roles, unknown role GUIDs, ancestors and a `chainBreak` of `missing-parent` / `no-parent-reference` / `cycle`; `grants`, `grantsOn`, `rolesFor`, `usage`) and `src/graph/webapi.ts` (`buildWebApiSurface`: per table enabled, fields, wildcard, the settings, and callers with combined privileges and scopes). A parent with no role is not a chain break; the lint rule checks that. Built-in roles aren't expanded: a grant to Authenticated Users is listed under that role only.

- Resolve role GUIDs on each permission; mark Anonymous and Authenticated roles by their flags.
- Resolve parent permissions into chains; record broken links instead of throwing.
- Expose: `grants(role) → [{table, privileges, scope, via: [permission names]}]` and `rolesFor(table, privilege)`.
- Web API: parse `Webapi/<table>/enabled` and `Webapi/<table>/fields`, join with the graph to list callable roles per table.

## Step 5: `lint` (done 2026-10-23)

As built: `src/lint/` (types, engine, config loader, 9 rules in `rules/*.ts`, text and JSON formatters), `lint` wired into the CLI with exit codes 0/1/2, rule pages in `rules/*.md` with an index. `broken` gives 6 errors, 4 warnings, 1 info; `ecoflux` gives the 4 `scope-relationship-missing` errors. 56 tests. Not done yet: the JSON Schema for `pageslens.config.yaml`, and per-file ignores in the config (only rule severities for now).

Rules in the MVP:

| id                             | default | catches                                                                                                                                                 |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webapi-wildcard-fields`       | error   | Web API enabled with `fields = *`                                                                                                                       |
| `webapi-no-permission`         | warning | Web API enabled on a table no permission covers                                                                                                         |
| `permission-no-role`           | warning | table permission with no web role                                                                                                                       |
| `global-write-anonymous`       | warning | Global create/write/delete for the Anonymous Users role (any role with `anonymoususersrole: true`)                                                      |
| `global-write-authenticated`   | warning | Global create/write/delete for the Authenticated Users role (any role with `authenticatedusersrole: true`)                                              |
| `parent-chain-broken`          | error   | parent-scope permission with missing parent, or a parent with no role                                                                                   |
| `scope-relationship-missing`   | error   | Contact, Account or Parent scope without its relationship field (`contactrelationship`, `accountrelationship`, `parentrelationship`). Found in EcoFlux. |
| `multiple-authenticated-roles` | error   | more than one web role has `authenticatedusersrole: true`; a site must have exactly one Authenticated Users role. One finding on each such role.        |
| `role-unused`                  | info    | web role used by no permission, page rule or website access (built-in Anonymous and Authenticated Users roles are skipped)                              |

Candidates noted for later: `parent-roles-not-subset` (child permission roles not a subset of the parent's, which Microsoft's own script refuses), `webapi-inner-errors` (`Webapi/error/innererror = true`).

- Each rule: id, default severity, description, `check(model, graph) → findings`, and a page in `rules/<id>.md` at the repo root (why it matters, how to fix).
- Config: one dedicated file, `pageslens.config.yaml`, with `rules: { <id>: off|info|warning|error }`, found by walking up from the target path; `--config` to override. No `package.json` key: classic site repos often have no `package.json`, and dedicated config files are where current tools are heading. Publish a JSON Schema so editors autocomplete it via `# yaml-language-server: $schema=...`.
- Output: text (grouped by file) and JSON (stable, versioned schema for agents and M2's SARIF). Findings sorted deterministically.
- Exit codes: 0 clean or warnings only, 1 errors, 2 usage/parse failure.
- The two global-write rules are separate so a team can turn one off without the other, and they default to warning because there are real cases for them (e.g. a public submission form that creates records). One finding per permission, listing the privileges (create, write, delete) it grants. Teams that never want them set them to `error` in `pageslens.config.yaml`.
- Fixture change: `broken/` gets an Anonymous Users global create case for `global-write-anonymous` and a second role flagged as Authenticated Users for `multiple-authenticated-roles`, and `test/fixtures/README.md` is updated.
- Tests: every rule fires exactly on its `broken` fixture cases and nowhere else; `ecoflux` gives exactly the findings listed in `test/fixtures/README.md`.

## Step 6: `docs` (done 2026-10-23)

As built: `src/docs/` writes `index.md` (summary, links, Mermaid diagram roles → permissions → tables with dotted parent edges), `access-matrix.md` (role × table matrix with privilege letters and scope, grants by role with parent chains, permissions that grant nothing) and `webapi.md` (tables, fields, callers). The access graph now marks each permission `effective`; only effective permissions produce grants, so docs, Web API callers and lint agree. Output is snapshot-tested in `test/docs/__snapshots__/`. 71 tests. `.gitignore` entries for the internal folders are now anchored to the repo root (`/docs/`), since `docs/` also matched `src/docs/`.

- `access-matrix.md`: role × table, privileges and scope per cell, with the permission names (and parent chain) each grant comes from.
- `webapi-surface.md`: enabled tables, fields, roles that can call each.
- `index.md` with a Mermaid diagram roles → permissions → tables, and links to the two pages.
- Plain GitHub-flavoured Markdown, deterministic ordering, no timestamps, so regenerated docs give quiet diffs.
- Snapshot tests on both fixtures.

## Step 7: release (done 2026-10-23)

As built: README (status, quick start, lint with exit codes, JSON shape, rules, config, docs pages, CI example, development), npm metadata (`homepage`, `repository`, `bugs`). `npm pack` gives 5 files, 36 kB packed. The tarball installed in a clean folder runs `lint` and `docs` on both fixtures and on the original EcoFlux download; its docs output is byte-identical to the snapshots. `pageslens` is still free on npm (checked 2026-10-23). `0.1.0` is published (`latest`), and `0.1.1-rc.0` is on `next`.

- README: what it is, supported input (`.powerpages-site/`, enhanced data model) and what's coming, `lint` and `docs` usage, rule list, the positioning table from the spec.
- `npm pack` dry run, try `npx` against the fixtures and EcoFlux.
- Publish `0.1.0` to npm when Oleksandr decides. Done.
- Next release: `0.2.0`, with classic sites (PR #6), inherited child roles (PR #5), config ignores and the JSON Schema (PR #8).

## Step 8: classic sample site (done 2026-10-23)

Oleksandr built a classic EDM site with roles, an Account-scope permission, a studio-made child permission and a global Feedback create (a test site in his own environment; a trimmed copy is `test/fixtures/classic/`). Findings:

- `pac pages download` (pac 1.43.6) writes the site folder itself, no `.powerpages-site/`, with `adx_`-prefixed keys, ids under `adx_<entity>id`, and root list files for roles, site settings, page rules, website access and a few more. `--modelVersion 1` and `2` give the same layout; v2 adds `adx_childTablePermissions` and `adx_permissionfetchxml`, v1 has `adx_enhancedauthorization`. So `adx_` keys don't mean a standard data model, which answers spike 1's open point the other way. Read by `src/adapters/classic-site.ts` (PR #6), fixture `test/fixtures/classic/`.
- A child permission made in the design studio has no web role; Microsoft's docs say its roles are inherited from the parent. The access graph now inherits them (`rolesInherited`) and `permission-no-role` skips such children (PR #5).
- The design studio requires a relationship for Contact and Account scope, so `scope-relationship-missing` only fires on records made by scripts or the Portal Management app. Open question 1 is still open.

## Step 9: config ignores and JSON Schema (done 2026-10-23, PR #8)

- `ignore` entries in `pageslens.config.yaml`: by file glob (paths as lint prints them) and/or record GUID, optionally for some rules only, with a `reason`. GUIDs matter for classic sites, where many records share one file. Ignored findings are counted, not shown.
- `pageslens.config.schema.json` at the repo root, generated from the rules (a test keeps it in step) and shipped in the npm package.
- AGENTS.md: says which adapter reads which layout.
- This plan moved out of `docs/` (later into `specs/archive/`), and `/docs/` left `.gitignore`: `docs` already meant the `pageslens docs` command, `src/docs/` and `test/docs/`.

## Done when (M1)

- `npx pageslens lint` and `npx pageslens docs` work on a `.powerpages-site/` folder of an enhanced data model site.
- EcoFlux runs without crashes and with no findings that can't be explained.
- Tests and CI green.

## Decisions (Oleksandr, 2026-10-22)

- MVP input: `.powerpages-site/`, enhanced data model, verified on a code site first. Classic sample site comes later.
- 2026-10-23: classic sites are in M1 too (PR #6), after the classic sample showed a different layout.
- EcoFlux (conference demo site) may be used as a reference and copied into fixtures.
- Config: `pageslens.config.yaml` only.
