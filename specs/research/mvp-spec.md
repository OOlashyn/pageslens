# pageslens: product spec (MVP, 2026-10-23)

Drafted 2026-10-23, revised the same day. Background: the idea came from comparing Proschi, a load-modelling tool for Power Platform, with what Power Pages teams lack. Name: `pageslens` (chosen by Oleksandr 2026-10-23; free on npm that day).

## Decisions so far (Oleksandr, 2026-10-23)

- Side project first, blog posts only if it works.
- **No traffic or load simulation.** Power Pages capacity scales with purchased licences in a way Microsoft doesn't document, so any traffic check would be a rough guess. The tool focuses on validation, documentation generation, a CLI and agent skills.

## What it is

A deterministic, offline CLI over the site configuration in git, plus agent skills that use it. **ALM story: see [alm-story.md](alm-story.md).** In short, it reads three input formats into one model: the `.powerpages-site/` folder from `pac pages download` (classic) or a code site, an **unpacked solution** (`powerpagecomponents/<guid>`, the track Microsoft pushes), and a solution .zip. The recommended setup keeps the unpacked solution in git as the source of truth and uses the CLI to make it readable and checked.

It does four things:

1. **Lint**: built-in rules with stable IDs, severities and a config file, like ESLint for the site's configuration.
2. **Policy**: rules you write about your own site, such as `anonymous cannot read contact`. These are the Proschi idea of requirements in a text file, applied to access rather than load.
3. **Docs**: a generated, readable description of the site in Markdown with Mermaid diagrams.
4. **Diff**: what changed in access between two versions, in plain language. "This PR gives Authenticated Users write on contact at global scope."

### What's different from existing tools

|             | Microsoft `audit-permissions`                            | Eyedeas `pp-securityreview`                     | This tool                                                    |
| ----------- | -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| Site types  | Code sites only                                          | Classic (enhanced data model) only              | Both, from the same YAML                                     |
| Source      | Site folder + live Dataverse queries                     | Live records ("a download is a stale snapshot") | The folder in git, offline                                   |
| Engine      | LLM finds issues, fixed formula scores them, HTML report | LLM works a checklist, fill-in report           | Deterministic code, same output every run, exit codes, SARIF |
| CI          | No                                                       | No                                              | Yes: GitHub Action, PR comment, code scanning                |
| Docs / diff | No                                                       | No                                              | Yes                                                          |

The positioning: Eyedeas edits live, Microsoft audits through an agent. This tool is for teams that keep the site in source control and want checks and docs that run without an agent or a Dataverse connection. The agent skills use it for facts and explain or fix what it finds.

## Commands

| Command                                        | What it does                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pageslens lint [folder]`                      | Runs the built-in rules. `--format text                                                                                                                                                                                                                                                                                                                     | json | sarif`. Exit 1 on errors. |
| `pageslens test [folder]`                      | Runs the policy file (`pageslens.policy.yaml`). Exit 1 on a failed assertion.                                                                                                                                                                                                                                                                               |
| `pageslens docs [folder] --out docs/site`      | Writes the Markdown docs and Mermaid diagrams.                                                                                                                                                                                                                                                                                                              |
| `pageslens align <site> <solution> [--target]` | Checks that the readable `pac pages download` snapshot and the unpacked solution are the same site: components missing from either side, content that differs, tables/roles/env variables missing from the solution, site settings that should be env variables. `--target` compares a download from test/prod with the solution (drift). See alm-story.md. |
| `pageslens align --fix` / `capture` / `seed`   | Team workflow (alm-story.md, "Bigger teams"): developers change files in git, CI uploads `main` to the integration environment, `align --fix` adds missing components to the solution before `pac solution sync`. `capture` is for maker-led classic sites; `seed` for optional preview environments.                                                       |
| `pageslens diff <base> <head>`                 | Compares two folders or two git refs and lists the access changes. Markdown output for PR comments.                                                                                                                                                                                                                                                         |

## Built-in lint rules (first set)

Access and Web API:

- `webapi-wildcard-fields`: Web API enabled with `*` fields.
- `webapi-no-permission`: Web API enabled on a table that no permission covers, so every call returns 403.
- `permission-no-role`: a table permission with no web role.
- `global-write-authenticated`: global scope create, write or delete for Authenticated Users or Anonymous Users.
- `parent-chain-broken`: a parent-scope permission whose parent is missing or has no role.
- `append-missing`: a permission allows create on a table with lookups but lacks append/appendto on the related side (where the YAML has enough to tell).
- `role-unused`: a web role that no permission, page access rule or form uses.

Site structure (classic sites):

- `page-access-gap`: a page under a restricted parent with no access rule of its own (to confirm how inheritance shows in the YAML).
- `broken-reference`: a page, form, list or snippet that points to a web template, table or form that isn't in the folder.
- `duplicate-partial-url`: two pages with the same partial URL under one parent.

Site settings:

- `open-registration`: open registration on while the policy says invite only.
- `missing-security-headers`, `cors-wildcard`: header and CORS settings (overlaps with Microsoft's `manage-headers`; keep it to detection).

Each rule has a short docs page with why it matters and the fix. That doubles as blog material.

## Policy file (draft)

```yaml
# pageslens.policy.yaml
access:
  - anonymous cannot read contact
  - anonymous cannot read incident
  - nobody has global write on contact
  - "Case Managers" can read incident
webapi:
  - fields are explicit
  - only [contact, incident] are enabled
registration:
  - invite only
```

A small fixed grammar, parsed to the same access graph the lint rules use. It deliberately has no general query language in v1.

## Generated docs (draft)

- **Access matrix**: role × table, with privileges and scope per cell, and where each grant comes from (permission name, parent chain).
- **Web API surface**: enabled tables, fields, and which roles can call each one.
- **Site map** (classic): page tree with access rules and the web template behind each page.
- **Forms and lists**: table, mode, and the roles that can reach the page.
- **Server Logic and cloud flows**: endpoints and their roles.
- **Diagrams**: Mermaid roles → permissions → tables, and pages → forms/lists/Web API → tables.

The output is plain Markdown so it renders on GitHub and in any docs site.

## Agent skills (milestone 3)

- **site-docs**: run `pageslens docs`, then write the narrative parts the tool can't infer (what each role is for, the business purpose of each page), marked as written by the agent.
- **site-review**: run `lint --format json` and `test`, explain the findings in context, and propose fixes as edits to the YAML. Never patches live records.
- **pr-access-review**: run `diff` between the PR and the base branch and write the review comment.

Ships in a plugin marketplace repo or a `plugin/` folder in the tool's repo, like Proschi.

## Tech

TypeScript, Node 20+, published to npm (`npx pageslens ...`). `yaml` for parsing, zod for the internal model, Vitest with fixture folders, SARIF output for GitHub code scanning. A GitHub Action wraps `lint`, `test` and `diff`.

## Spikes before writing code

0. **Solution format (first). Done 2026-10-23, see [spike-0-findings.md](spike-0-findings.md): GUIDs match, solution readable offline.** What `pac solution unpack`/`clone` writes into `powerpagecomponents/<guid>/`, and whether every component type can be read offline. See alm-story.md, open point 1.
1. **Folder format.** Take one classic site download (enhanced data model) and one code site `.powerpages-site/` folder. Confirm the file names, the `mspp_`/`adx_` keys, how table permissions point to roles and parents, and where Web API site settings, page access rules and Server Logic live. Also check whether a standard data model (`adx_`) download is close enough to support later.
2. **Fixtures.** Build a small sample site with known mistakes (wildcard fields, an orphan permission, a broken parent chain) and keep its download as the test fixture. It can also be the demo site for the blog.

## Milestones

1. **M0**: the two spikes, with findings added to this file.
2. **M1**: the `.powerpages-site` and solution adapters, the access graph, `lint` with the access and Web API rules, `docs` with the access matrix and Web API surface. Useful on its own.
3. **M2**: `test` (policy file), `diff`, `align`, the GitHub Action, SARIF.
4. **M3**: the agent skills, the classic site structure rules, the site map docs.
5. **Later**: cloud flows and Server Logic in the docs, the standard data model, a Proschi export of the diagram.

## Blog posts if it works

1. "Testing Power Pages permissions in CI" (M1 and M2).
2. "Reviewing Power Pages access changes in pull requests" (diff + Action).
3. "Documenting a Power Pages site from source control" (docs + skill).
4. A broad-audience angle: "Lint rules for low-code configuration", crediting Proschi and ESLint as the inspiration.

## Open questions for Oleksandr

- Name and repo: answered, `pageslens` at github.com/OOlashyn/pageslens.
- Is there a dev environment for building the sample site in spike 2?

_Frozen as the original product spec. Current state: [ROADMAP.md](../ROADMAP.md)._
