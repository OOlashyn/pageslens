# Known mistakes: `pageslens lint`

`pageslens lint` finds known mistakes in a site's table permissions, web roles, Web API settings, site settings and, on classic sites, page access rules. Each finding has a stable rule id and a severity, so CI can fail on errors.

```
pageslens lint [path] [--format text|json|sarif] [--config <file>] [--settings <file>]
```

`path` is the site folder (see [Getting started](getting-started.md#the-site-folder)). `--settings` reads a stage's [deployment settings file](getting-started.md#deployment-settings).

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

`--format sarif` prints [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) for GitHub code scanning and other tools that read it. See [In CI](ci.md).

## Rules

The [rules](../rules/README.md) page lists every rule with its default severity. Each rule's page says why it matters and how to fix it. `pageslens explain <rule>` prints it in the terminal, for the version you run, and `pageslens explain` lists the rules.

The `page-` rules and `grant-change-overrides-read` check page access rules and run on classic sites only: on a code site, the browser routes pages, so page access rules don't decide who sees them.

## Configuration

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

The same file has an `align` section for [`pageslens align`](align.md#configuration).

The `$schema` comment gives completion and validation in editors with the YAML language server (VS Code's YAML extension, JetBrains IDEs). The schema also ships in the package, at `node_modules/pageslens/pageslens.config.schema.json`.
