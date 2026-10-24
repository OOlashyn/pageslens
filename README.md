# pageslens

Offline lint and docs for Power Pages site configuration in source control.

pageslens reads a site downloaded with the Power Platform CLI, either the `.powerpages-site` folder that `pac pages download-code-site` writes or the site folder that `pac pages download` writes, and:

- **lints** it: table permissions, web roles and Web API settings, with stable rule ids, severities and exit codes for CI;
- **documents** it: an access matrix (which role can do what on which table), the Web API surface, and a Mermaid diagram, as plain Markdown.

It needs no Dataverse connection and no agent: the same folder gives the same output every run.

> **Status: early.** pageslens has been verified on **enhanced data model** sites, both a **code site** (`pac pages download-code-site`) and a **classic site** (`pac pages download`). `pac pages download` writes the same layout with `--modelVersion 1` and `2`, and a standard data model site should download in it too, but neither has been checked against a real site yet. Unpacked solutions and solution `.zip` files are planned.

## Quick start

Requires Node.js 22.23.4+, 24.22.1+ or 26.12.1+.

```bash
npx pageslens lint path/to/site
```

```bash
npx pageslens docs path/to/site --out docs/site
```

`path/to/site` is the `.powerpages-site` folder, the folder that contains it, or a classic site folder (the one with `website.yml` and `webrole.yml`). pageslens tells the two layouts apart by the keys in `website.yml`.

## `pageslens lint`

```
pageslens lint [path] [--format text|json] [--config <file>]
```

Example output:

```
EcoFlux (site/.powerpages-site)

table-permissions/Asset---Asset-Manager-CRUD.tablepermission.yml
  error  Table permission "Asset - Asset Manager CRUD" has account scope but no accountrelationship, so Power Pages can't tell which dwcrm_asset records it covers.  scope-relationship-missing

1 error, 0 warnings, 0 info
```

| Exit code | Meaning                                                            |
| --------- | ------------------------------------------------------------------ |
| 0         | No errors (warnings and info don't fail the run)                   |
| 1         | At least one error                                                 |
| 2         | The site or config couldn't be read, or the command was used wrong |

`--format json` prints a versioned object (`version`, `site`, `summary`, `findings`) for scripts and agents. Each finding has `ruleId`, `severity`, `message`, `file` (relative to the site folder), `recordId` and a `docs` link.

### Rules

| Rule                                                                    | Default | Catches                                                                |
| ----------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| [`webapi-wildcard-fields`](rules/webapi-wildcard-fields.md)             | error   | Web API enabled with `*` as the fields list                            |
| [`webapi-no-permission`](rules/webapi-no-permission.md)                 | warning | Web API enabled on a table no table permission covers                  |
| [`permission-no-role`](rules/permission-no-role.md)                     | warning | Table permission with no web role                                      |
| [`global-write-anonymous`](rules/global-write-anonymous.md)             | warning | Global create, write or delete for Anonymous Users                     |
| [`global-write-authenticated`](rules/global-write-authenticated.md)     | warning | Global create, write or delete for Authenticated Users                 |
| [`parent-chain-broken`](rules/parent-chain-broken.md)                   | error   | Parent-scope permission whose parent is missing, has no role, or loops |
| [`scope-relationship-missing`](rules/scope-relationship-missing.md)     | error   | Contact, Account or Parent scope without its relationship              |
| [`multiple-authenticated-roles`](rules/multiple-authenticated-roles.md) | error   | More than one role flagged as Authenticated Users                      |
| [`role-unused`](rules/role-unused.md)                                   | info    | Web role nothing uses                                                  |

Each rule's page says why it matters and how to fix it.

### Configuration

Put a `pageslens.config.yaml` in the site folder or any folder above it (or pass `--config <file>`) to change severities or turn rules off:

```yaml
rules:
  global-write-anonymous: error # never allow it on this site
  role-unused: off
```

Severities are `error`, `warning`, `info` and `off`. An unknown rule id is an error, so typos don't silently do nothing.

## `pageslens docs`

```
pageslens docs [path] --out <dir>
```

Writes three pages into `<dir>` (other files there are left alone):

| Page               | Contents                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `index.md`         | Counts, links, and a Mermaid diagram: roles → table permissions → tables, with parent chains                                |
| `access-matrix.md` | Role × table matrix with privileges and scope, grants by role (including parent chains), and permissions that grant nothing |
| `webapi.md`        | Tables reachable through `/_api`, their fields, and which roles can call them                                               |

The output has no timestamps and a fixed order, so regenerating it for an unchanged site gives an empty diff. Commit it next to the site to review access changes in pull requests.

## In CI

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
```

## Development

The project uses [Vite+](https://viteplus.dev) for formatting, linting, type checking, tests and the build.

```bash
npm install
```

```bash
npm run check
```

```bash
npm test
```

```bash
npm run build
```

`test/fixtures/` holds three sites: `ecoflux` (a demo code site), `broken` (one deliberate mistake per rule) and `classic` (a trimmed classic download). `test/fixtures/README.md` lists the findings each should produce.

### Releasing

1. Bump the version on a branch with `npm version <x.y.z> --no-git-tag-version -m "Release %s"` and merge it into `main` through a pull request.
2. Create a GitHub release with the tag `v<x.y.z>` on `main`. The [release workflow](.github/workflows/release.yml) checks that the tag matches `package.json`, runs the checks and tests, and stages the package on npm through trusted publishing (no npm token in the repo).
3. Approve the staged version with 2FA, on npmjs.com or with `npm stage list pageslens` and `npm stage approve <stage-id>`. It's installable only after approval.

Pre-release versions (`x.y.z-beta.n`) are staged under the `next` dist-tag instead of `latest`.

## License

[MIT](LICENSE)
