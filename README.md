# pageslens

Offline lint, policy tests, access diffs and docs for Power Pages site configuration in source control.

pageslens reads a site downloaded with the Power Platform CLI (the `.powerpages-site` folder that `pac pages download-code-site` writes, or the site folder that `pac pages download` writes) or an unpacked solution that holds the site (`pac solution unpack` or `pac solution clone`), and:

- **lints** it: table permissions, web roles, Web API settings and secrets typed into settings, with stable rule ids, severities and exit codes for CI;
- **tests** it against your own requirements, written as short sentences in a policy file ("anonymous cannot read contact");
- **diffs** two versions of it: what a change does to who can see and change what, for a pull request comment;
- **aligns** a download with the solution that deploys it: components left out of the solution, or different in it, before the import;
- **documents** it: an access matrix (which role can do what on which table), the Web API surface, and a Mermaid diagram, as plain Markdown.

It needs no Dataverse connection and no agent: the same folder gives the same output every run. To use it from a coding agent, see [Using pageslens with an agent](#using-pageslens-with-an-agent).

Records that are inactive in Dataverse (`statecode: 1` in the download) are left out everywhere, as Power Pages ignores them: an inactive table permission grants nothing, and an inactive role or setting counts for nothing. `docs` says how many were left out.

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

`path/to/site` is the `.powerpages-site` folder, the folder that contains it, a classic site folder (the one with `website.yml` and `webrole.yml`), or an unpacked solution. pageslens tells the two download layouts apart by the keys in `website.yml`.

### Solutions

An unpacked solution is the folder with `Other/Solution.xml` that `pac solution unpack` writes, or the project `pac solution clone` writes (pageslens looks in its `src/`). Each site component is `powerpagecomponents/<guid>/powerpagecomponent.xml`, and pageslens reads them into the same records as a download of the same site, matched by GUID, so `lint`, `test`, `diff` and `docs` give the same results. Findings point at the component's file.

- A solution with more than one site isn't read yet, nor is the YAML source control format that Dataverse Git integration writes, nor a solution `.zip` (unpack it first).
- A component that isn't in the solution isn't checked: pageslens reads what deploys.
- To check that a download and a solution describe the same site, use [`align`](#pageslens-align).
- A site setting can take its value from an environment variable. pageslens reads the variable's value from the solution (the current value, or else the default). A download doesn't include the variable, so there the value is unknown: rules that need it skip the setting, `test` statements that need it fail and say why, and `diff` counts a move to a variable as wider. To check the values a stage gets, give its [deployment settings file](#deployment-settings).

### Deployment settings

The values of environment variables differ per stage, and the import takes each stage's values from a deployment settings file: the JSON `pac solution create-settings` writes and `pac solution import --settings-file` reads, usually kept in the repository as `deployment-settings/<stage>.json`. Give one to `lint`, `test`, `diff` or `align` with `--settings <file>` to check what that stage gets:

```
pageslens lint site --settings deployment-settings/prod.json
pageslens test site --settings deployment-settings/prod.json
```

- A setting backed by a variable takes the file's `Value` for it, matched by schema name, ignoring case, and messages name the file: `"true" from environment variable dwcrm_ContactApi in deployment-settings/prod.json`. This works on a download and on a solution alike.
- A variable the file doesn't have, or has with an empty `Value` (as `create-settings` writes every variable), keeps what it had: unknown in a download, the solution's value in a solution. So does a secret (`TypeId` 100000005): its value is in Azure Key Vault. pageslens doesn't guess what the import does then.
- Only `EnvironmentVariables` is read; `ConnectionReferences` and other keys are ignored, and so are variables no setting uses and `DefaultValue`.
- One stage per run: check several stages with several runs. `docs` doesn't take the file, so committed docs stay the same for every stage.
- In `diff`, the file is read on each side: from the folder, or at the same path in each commit, so a pull request that only changes a stage's file shows what it does to access. A side without the file reads it as empty.
- In `align`, a variable the file gives a value isn't reported as having none, and a variable the file gives no value is a warning (`variable-not-in-settings`) when the solution has a value: the stage may get dev's.

A file that can't be read, isn't JSON, or has no `EnvironmentVariables` list of entries with a `SchemaName` is exit code `2`.

## `pageslens lint`

```
pageslens lint [path] [--format text|json|sarif] [--config <file>] [--settings <file>]
```

Example output:

```
EcoFlux (site/.powerpages-site)

table-permissions/Asset---Asset-Manager-CRUD.tablepermission.yml
  error  Table permission "Asset - Asset Manager CRUD" has account scope but no accountrelationship, so Power Pages can't tell which dwcrm_asset records it covers.  scope-relationship-missing

1 error, 0 warnings, 0 info
Run pageslens explain <rule> for why it matters and how to fix it.
```

| Exit code | Meaning                                                            |
| --------- | ------------------------------------------------------------------ |
| 0         | No errors (warnings and info don't fail the run)                   |
| 1         | At least one error                                                 |
| 2         | The site or config couldn't be read, or the command was used wrong |

`--format json` prints a versioned object (`version`, `site`, `summary`, `ignored`, `findings`, `unusedIgnores`) for scripts and agents. Each finding has `ruleId`, `severity`, `message`, `file` (relative to the site folder), `recordId` and a `docs` link.

`--format sarif` prints [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) for GitHub code scanning and other tools that read it. See [In CI](#in-ci).

### Rules

| Rule                                                                    | Default | Catches                                                                |
| ----------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| [`webapi-wildcard-fields`](rules/webapi-wildcard-fields.md)             | error   | Web API enabled with `*` as the fields list                            |
| [`webapi-no-permission`](rules/webapi-no-permission.md)                 | warning | Web API enabled on a table no table permission covers                  |
| [`webapi-inner-errors`](rules/webapi-inner-errors.md)                   | warning | Web API errors that include the inner error                            |
| [`setting-secret-value`](rules/setting-secret-value.md)                 | error   | Secret site setting (`ClientSecret`, ...) with a value of its own      |
| [`permission-no-role`](rules/permission-no-role.md)                     | warning | Table permission with no web role                                      |
| [`global-write-anonymous`](rules/global-write-anonymous.md)             | warning | Global create, write or delete for Anonymous Users                     |
| [`global-write-authenticated`](rules/global-write-authenticated.md)     | warning | Global create, write or delete for Authenticated Users                 |
| [`parent-chain-broken`](rules/parent-chain-broken.md)                   | error   | Parent-scope permission whose parent is missing, has no role, or loops |
| [`scope-relationship-missing`](rules/scope-relationship-missing.md)     | error   | Contact, Account or Parent scope without its relationship              |
| [`multiple-authenticated-roles`](rules/multiple-authenticated-roles.md) | error   | More than one role flagged as Authenticated Users                      |
| [`role-unused`](rules/role-unused.md)                                   | info    | Web role nothing uses                                                  |
| [`page-rule-no-page`](rules/page-rule-no-page.md)                       | warning | Page access rule with no page, or a missing or inactive one            |
| [`page-rule-no-role`](rules/page-rule-no-role.md)                       | error   | Page access rule with no web role                                      |
| [`page-rule-anonymous`](rules/page-rule-anonymous.md)                   | error   | Page access rule listing Anonymous Users, which lets nobody in         |
| [`page-rules-conflict`](rules/page-rules-conflict.md)                   | error   | More than one Restrict Read rule on a page                             |
| [`page-roles-not-subset`](rules/page-roles-not-subset.md)               | warning | Restrict Read role that a rule above keeps out                         |
| [`grant-change-overrides-read`](rules/grant-change-overrides-read.md)   | warning | Grant Change role that reads past a Restrict Read                      |
| [`page-rule-authenticated`](rules/page-rule-authenticated.md)           | warning | Restrict Read listing Authenticated Users with other roles             |
| [`page-parent-missing`](rules/page-parent-missing.md)                   | error   | Web page whose parent is missing or inactive, or loops                 |

Each rule's page says why it matters and how to fix it. `pageslens explain <rule>` prints it in the terminal, for the version you run, and `pageslens explain` lists the rules. The `page-` rules and `grant-change-overrides-read` check page access rules and run on classic sites only: on a code site, the browser routes pages, so page access rules don't decide who sees them.

### Configuration

Put a `pageslens.config.yaml` in the site folder or any folder above it (or pass `--config <file>`) to change severities, turn rules off, or ignore findings you've accepted:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/OOlashyn/pageslens/main/pageslens.config.schema.json
rules:
  global-write-anonymous: error # never allow it on this site
  role-unused: off

ignore:
  - rules: [global-write-anonymous, global-write-authenticated]
    records: [3453215b-d450-4073-a12c-88aa8a248b81]
    reason: Public contact form creates feedback records
  - files: ['web-roles/Legacy-*.webrole.yml']
```

Severities are `error`, `warning`, `info` and `off`. An unknown rule id is an error, so typos don't silently do nothing.

An `ignore` entry leaves out findings on any of its `files` or `records`, from the listed `rules` only (every rule when `rules` is left out); `reason` is for reviewers. `files` are globs over the paths lint prints, relative to the site folder (`*` within a folder, `**` across folders). `records` are the GUIDs in the JSON output's `recordId`. Prefer `records` on a classic site, where many records share one file, and anywhere a file name may change: pac derives file names from record names. Ignored findings are counted in the summary (`ignored` in JSON) so they don't disappear unnoticed. A file glob or record in an entry that leaves out no finding is listed as an unused ignore under the config file's name (`unusedIgnores` in JSON), so an entry for something since fixed doesn't hide the next finding there. It doesn't fail the run. An entry that lists a rule that's turned off isn't checked.

The same file has an `align` section for [`pageslens align`](#pageslens-align).

The `$schema` comment gives completion and validation in editors with the YAML language server (VS Code's YAML extension, JetBrains IDEs). The schema also ships in the package, at `node_modules/pageslens/pageslens.config.schema.json`.

## `pageslens test`

```
pageslens test [path] [--policy <file>] [--format text|json|sarif] [--settings <file>]
```

Checks the site against the requirements in `pageslens.policy.yaml` (in the site folder or any folder above it, or `--policy <file>`). Each requirement is one sentence in a fixed form:

```yaml
access:
  - anonymous cannot create, write, delete any table
  - role "Case Manager" can read, write incident at contact scope
  - only "Case Manager", "Administrators" can write incident
  - authenticated cannot read task except under incident at contact scope
webapi:
  - fields are explicit
  - only contact, incident are enabled
settings:
  - registration is invite only
pages: # classic sites
  - only "C1 ASP" can read pages under "/admin/"
```

Exit codes: `0` every statement passes, `1` at least one fails, `2` no policy file, an unreadable statement, or an unknown role or page. A failure lists the grants or settings that break it, with their files. `--format json` gives a versioned object (`version`, `site`, `policy`, `summary`, `results`), and `--format sarif` gives SARIF for code scanning.

The full grammar, what each statement means and how to write a good policy: [docs/policy.md](docs/policy.md).

## `pageslens diff`

```
pageslens diff <base> <head> [--site <path>] [--merge-base] [--format text|markdown|json] [--fail-on wider|any] [--settings <file>]
```

Shows what a change does to access: grants gained and lost (including child permissions that take their parent's roles), the Web API (tables, fields, who can call them), web roles, a few settings such as open registration, and on classic sites who can read and publish each page. It compares effective access, not files, and matches records by GUID (so a download and a solution can be compared too), so a renamed file or a permission split in two with the same result isn't an access change.

Each side is a folder or a git ref: two downloads (`diff before after`), two commits (`diff origin/main HEAD --site site`), or a commit and the working tree (`diff origin/main site`, to see uncommitted edits). `--merge-base` compares with the merge base, as a pull request does.

```
Access changes in site/.powerpages-site, origin/main (a1b2c3d) → HEAD (e4f5a6b): 1 wider, 1 narrower, 0 neutral

Wider
  + Customers: write on incident changed from contact scope to global scope in "Incident - Customers"
      table-permissions/Incident-Customers.tablepermission.yml
Narrower
  - Anonymous Users lost read on knowledgearticle (global scope) from "Articles - Anonymous Read" (removed)
      table-permissions/Articles-Anonymous-Read.tablepermission.yml (base)
```

Every change is **wider** (may give someone access they didn't have), **narrower** or **neutral**, and anything pageslens can't show to be narrower or neutral counts as wider. `--format markdown` writes a pull request comment (summary first, details folded, capped under GitHub's size limit) and `--format json` a versioned object. The exit code is `0` whatever changed, `1` with `--fail-on wider` when something is wider (or `--fail-on any` when anything changed), and `2` when an argument or a site can't be read.

What each change means and how it's classified: [docs/diff.md](docs/diff.md).

## `pageslens align`

```
pageslens align <site> <solution> [--format text|json|markdown|sarif] [--config <file>] [--settings <file>]
```

Checks that a download and an unpacked solution describe the same site, for teams that commit both: the readable download, and the solution that deploys. New site components aren't added to a solution automatically, so a web role, a table permission or a page made in dev can work there, be in the download, and be missing in test and prod. `align` shows it in the pull request, before the import.

```
align site (classic site download) with solution/src (PagesLensEDM2Sol 1.0.0.0)

✗ missing from the solution: won't be in test or prod
    web role "Course Admins"  webrole.yml
✗ content differs
    site setting "Search/Enabled": value is "true" in the download, "false" in the solution
      sitesetting.yml
      powerpagecomponents/9c1e0a2b-7d4e-4f31-8a6c-2b5d9e0f1a77/powerpagecomponent.xml

2 errors, 0 warnings. 475 records match.
```

Records match by GUID. It reports records on one side only, records active on one side only, fields and text that differ, and environment variables the import needs. What two snapshots of one site always differ in (the keys a classic download prefixes, empty side files, JSON formatting, role order, and a few fields only one side writes) isn't reported. Tables aren't checked: they usually live in a solution of their own. Exit codes are `0` without errors, `1` with errors, and `2` when a side is the wrong kind or can't be read. Severities and ignores go in the `align` section of `pageslens.config.yaml`.

The checks, what isn't a difference, and the output formats: [docs/align.md](docs/align.md).

## `pageslens docs`

```
pageslens docs [path] --out <dir>
```

Writes three pages into `<dir>`, four for a classic site (other files there are left alone):

| Page               | Contents                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.md`         | Counts, links, and a Mermaid diagram: roles → table permissions → tables, with parent chains                                                                                                   |
| `access-matrix.md` | Role × table matrix with privileges and scope, grants by role (including parent chains), and permissions that grant nothing                                                                    |
| `webapi.md`        | Tables reachable through `/_api`, their fields, and which roles can call them                                                                                                                  |
| `pages.md`         | Classic sites only: who can read each page, from the page access rules (Restrict Read down the page tree, Grant Change overrides), every rule with its scope, and the inactive pages and rules |

The output has no timestamps and a fixed order, so regenerating it for an unchanged site gives an empty diff. Commit it next to the site to review access changes in pull requests.

## Using pageslens with an agent

pageslens gives the facts; a coding agent can explain them and propose fixes. Point your agent at this section, or paste it into your `AGENTS.md` or `CLAUDE.md`. So that an agent knows pageslens is there at all, one line in `AGENTS.md` is enough:

```markdown
The Power Pages site is in `site/`. Check it with pageslens (`npx pageslens`): see https://github.com/OOlashyn/pageslens#using-pageslens-with-an-agent
```

### Running pageslens

- Run `npx pageslens` when the project has `pageslens` in its dependencies, so the agent runs the version CI runs. Otherwise run `npx -y pageslens@<version>`, with the version CI uses.
- Read `--format json` (`lint`, `test`, `diff`, `align`), not the text output, and check that `version` is `1`.
- `pageslens explain <rule>` prints why a lint rule matters and how to fix it. `pageslens explain` lists the rules.

### Working rules

- pageslens decides. Whether something is a finding, whether a change is wider, whether a statement passes: that's in its output, so don't reclassify it. Say why a change may be intended and what a reviewer should check.
- Work offline, from the files in git. Don't connect to Dataverse, run `pac`, upload, post, commit or push.
- Find records by GUID (`recordId`), not by file name. Don't change a record's own id. Pointing a record at another one (a permission's parent, its web roles) is a fix like any other: say what it does to access.
- A value marked `unknown` comes from an environment variable, which a download doesn't have. Say it can't be known offline; don't guess. If the repository has deployment settings files, run again with `--settings` for the stage in question.
- Check every fix: run `lint` (and `test`, with a policy file) again, and `diff HEAD <site>` to see what the edits do to access. Undo a fix that adds an error or a warning. A fix can leave an info finding behind as its expected result (a role nothing uses any more): say so.

### Review a site

1. Run `lint --format json`, `test --format json` when there's a `pageslens.policy.yaml`, and `align <site> <solution> --format json` when you're given a solution folder.
2. Group the findings by rule, errors first. Run `explain` for each rule and open the files the findings point at.
3. Explain each group in the site's terms: which role, which table, who could do what.
4. Propose fixes one rule at a time, as edits to the site's YAML. Where the fix is a choice (narrow the access, or keep it with an `ignore` entry and a `reason` in `pageslens.config.yaml`), offer both.
5. Apply a rule's fixes when the user says yes. A fix that `diff` shows as wider needs its own yes, even when the user asked for every error to be fixed. Then run `lint` again and show what's left. Don't edit the solution folder: fix the site in dev, then take both snapshots again.

### Review a pull request's access changes

1. Run `diff <base> HEAD --site <path> --merge-base --format json`, with the pull request's base branch as `<base>`.
2. If there are no changes, say so and stop.
3. For each wider change, open its `sources` on both sides (`git show <commit>:<file>`) and the commits that touched them. Say what the author likely meant and what a reviewer should check, and say when the change is also a lint finding (`lint`).
4. Give narrower and neutral changes one line each.
5. Write the review in the chat. Don't post it: the GitHub Action already posts the access changes.

### Write narrative docs

1. Run `docs <path> --out <dir>`.
2. Read the generated pages, the site's pages and templates, and the git log, to work out what each web role, table and page is for.
3. Write `about.md` in `<dir>`. Start it with a line saying an agent wrote it and a person should check it. Give each record's kind, GUID and name in an HTML comment (`<!-- webrole <guid> Asset Manager -->`), so a later run finds new, renamed and removed records and keeps what a person wrote.
4. Don't edit the generated pages: `docs` rewrites them on every run.

## In CI

For a full ALM workflow (the site and its solution in one repository, a check per stage, nightly drift against Dev, access changes in release notes), see [docs/alm.md](docs/alm.md). For Azure Pipelines with Azure Repos, see [docs/azure-devops.md](docs/azure-devops.md).

### GitHub Action

The pageslens action does it all in one step: it runs `lint` and `test`, uploads the results to code scanning, and posts what a pull request does to access as one comment, which it edits on each run.

```yaml
# .github/workflows/pageslens.yml
name: pageslens
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
  security-events: write # upload results to code scanning
  pull-requests: write # the access-changes comment
jobs:
  pageslens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the merge base needs the history of both branches
      - uses: OOlashyn/pageslens@v0.12.0
        with:
          path: site
```

- **On a pull request** it runs `lint`, `test` (when it finds a `pageslens.policy.yaml`) and `diff --merge-base`, which compares the pull request's head commit with where it branched from the base branch, as GitHub's own diff does. The access changes go to the run's summary page and to the comment. With no access changes it doesn't add a comment; it edits an earlier one to say so.
- **On a push** to `main` it runs `lint` and `test` only. Code scanning compares a pull request's alerts with the last analysis of `main`, so run the action on both.
- **With `solution`** it also runs `align <path> <solution>`: its results go to code scanning, its findings to the comment above the access changes, and errors fail the job. It's off by default: set it when you commit both a download and the solution taken from dev together.
- **With `settings`** every command gets `--settings <file>`, so the checks are for that stage. To check several stages, run the action once per stage (a matrix); each run edits the same comment, so turn `comment` off on all but one.
- **The job fails** when lint finds errors, a policy statement fails, align finds errors, or `fail-on` matches, after all the steps have run, so the results are uploaded and the comment is posted either way.
- **Pull requests from forks** get a read-only token, so there the results go to the run's summary page only, with a notice.
- **Permissions:** without `security-events: write`, or with code scanning not available for the repository, the upload is skipped with a notice. Without `pull-requests: write`, the comment is.
- **Version:** `v0.12.0` runs exactly pageslens 0.12.0. Dependabot (`package-ecosystem: github-actions`) keeps the tag up to date.

| Input          | Default                 | What                                                                                                    |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `path`         | `.`                     | The site folder. For several sites, use the action once per site; each gets its own comment.            |
| `policy`       | nearest one             | The policy file. With none, `test` is skipped with a notice.                                            |
| `solution`     |                         | The unpacked solution to compare `path` with (`align`). Empty skips `align`.                            |
| `settings`     |                         | One stage's deployment settings file, given to every command as `--settings`.                           |
| `lint`         | `true`                  | Run `lint`.                                                                                             |
| `test`         | `true`                  | Run `test`.                                                                                             |
| `diff`         | `true`                  | Run `diff` on pull requests.                                                                            |
| `sarif`        | `true`                  | Upload the results to code scanning.                                                                    |
| `comment`      | `true`                  | Post the access changes as a comment.                                                                   |
| `fail-on`      |                         | `wider` or `any`: fail when the diff has wider changes, or any change. By default the diff never fails. |
| `base`         | the pull request's base | The ref to compare with. `origin/` is added to a branch name.                                           |
| `node-version` | `24`                    | Node.js for pageslens.                                                                                  |
| `token`        | `github.token`          | The token for the comment.                                                                              |

Outputs: `wider`, `narrower`, `neutral`, `lint-errors`, `policy-failures`, `align-errors` and `comment-url`, for example to add a label when anything is wider.

### Without the action

```yaml
# .github/workflows/pages.yml
name: Power Pages checks
on: pull_request
jobs:
  pageslens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npx pageslens@0 lint site
      - run: npx pageslens@0 test site
```

To see findings and failed policy statements as annotations on the pull request and in the repository's **Security** tab, write SARIF and upload it with GitHub's `upload-sarif` action (code scanning needs to be available for the repository):

```yaml
# .github/workflows/pages.yml
name: Power Pages checks
on: pull_request
permissions:
  contents: read
  security-events: write
jobs:
  pageslens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: mkdir -p sarif
      - run: npx pageslens@0 lint site --format sarif > sarif/lint.sarif
      - run: npx pageslens@0 test site --format sarif > sarif/test.sarif
        if: ${{ !cancelled() }}
      - uses: github/codeql-action/upload-sarif@v4
        if: ${{ !cancelled() }}
        with:
          sarif_file: sarif
```

The exit codes stay the same with `--format sarif`, so the job still fails on lint errors and failed statements. The `if` lines make the later steps run anyway, so the results reach code scanning.

To show a pull request's access changes on the run's summary page, compare with the merge base, as the pull request's own diff does. That needs the history of both branches, so check out with `fetch-depth: 0`:

```yaml
# .github/workflows/access-changes.yml
name: Access changes
on: pull_request
jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npx pageslens@0 diff --merge-base --format markdown "origin/$BASE" HEAD --site site >> "$GITHUB_STEP_SUMMARY"
        env:
          BASE: ${{ github.base_ref }}
```

What the SARIF contains:

- **Two runs, kept apart.** `lint` and `test` each get their own category (`pageslens/lint/`, `pageslens/test/`), so uploading both doesn't replace one with the other.
- **Rules.** Every lint rule, with its page as help. For `test`, one rule per statement, named `policy/<id>`, or a slug of the statement's text when it has no `id`. Give statements an `id` if you want their alerts to survive a rewording.
- **Locations.** A finding points at its record's file and the line of the record's GUID, so findings in shared files like `webrole.yml` land on the right record. A failed statement points at each table permission or setting that breaks it, with the statement's line in the policy as a related location. A failure with nothing in the site to point at, such as a missing setting or a privilege a role lacks, points at the statement itself.
- **Levels.** `error`, `warning` and `info` become `error`, `warning` and `note`, with GitHub security severities high, medium and low. Every failed statement is an `error`.
- **Paths** are relative to the folder pageslens runs in, so run it from the repository root.

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

### Releasing

1. Write the release notes in `specs/releases/<x.y.z>.md` and merge them into `main`. Then, on an up-to-date, clean `main`, prepare the release in one command:

   ```bash
   npm run release -- <x.y.z>
   ```

   It creates `release/<x.y.z>`, runs `npm version <x.y.z> --no-git-tag-version` (`package.json` and `package-lock.json`), points the README's action examples at `v<x.y.z>` (not for a pre-release), commits "Release <x.y.z>" and pushes the branch. It checks everything first and changes nothing when a check fails: the version comes after the current one, the tree is clean, `main` matches `origin/main`, the branch doesn't exist, and the release notes are there. `--dry-run` prints the steps without running them, and `--pr` also opens the pull request with `gh`, with the release notes as its description. Merge the pull request into `main`.

2. Create a GitHub release with the tag `v<x.y.z>` on `main`, with the release notes (the script prints the `gh release create` command). The [release workflow](.github/workflows/release.yml) checks that the tag matches `package.json`, runs the checks and tests, and stages the package on npm through trusted publishing (no npm token in the repo).
3. Approve the staged version with 2FA, on npmjs.com or with `npm stage list pageslens` and `npm stage approve <stage-id>`. It's installable only after approval.

The same tag is the GitHub Action's version: `OOlashyn/pageslens@v<x.y.z>` installs `pageslens@<x.y.z>` from npm, so the action at that tag works once the version is approved.

Pre-release versions (`x.y.z-beta.n`) are staged under the `next` dist-tag instead of `latest`.

## License

[MIT](LICENSE)
