# 0010: Deployment settings (`--settings`)

**Status:** draft 1, open questions for Oleksandr.

A site setting can take its value from an environment variable (`source: 1`). The value differs per stage: the solution carries the variable's definition, and the import gets the stage's value from a **deployment settings file**, one per target, kept in the repository (`deployment-settings/<target>.json`). The ALM white paper does exactly this ([alm-white-paper.md](research/alm-white-paper.md), "What to change" 1), and so does the process in [alm-story.md](research/alm-story.md).

Today pageslens can't see those values:

- In a download, a variable-backed setting is `unknown` ([0007](0007-solution-adapter.md), "Variable-backed settings in a download"). `lint` rules skip it, `test` fails on it, and `diff` counts a change to or from it as wider.
- In a solution, the value is the variable's current or default value: what dev has, not what test or prod will get.

So the settings that matter most per stage (`Webapi/<table>/enabled`, `Webapi/<table>/fields`, `Authentication/Registration/Enabled`) are the ones pageslens can't check where it counts. This spec adds `--settings <file>`: read one stage's deployment settings file, and use its values.

## What we know

### The file

`pac solution create-settings` writes it from a solution (`--solution-zip` or `--solution-folder`), and `pac solution import --settings-file` and the Build Tools and GitHub Actions import steps read it. From memory, to verify against Learn ([Pre-populate connection references and environment variables](https://learn.microsoft.com/power-platform/alm/conn-ref-env-variables-build-tools)), which this session couldn't reach:

```json
{
  "EnvironmentVariables": [{ "SchemaName": "dwcrm_CardsPerPage", "Value": "20" }],
  "ConnectionReferences": [
    {
      "LogicalName": "dwcrm_sharedcommondataserviceforapps_1a2b3",
      "ConnectionId": "",
      "ConnectorId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps"
    }
  ]
}
```

- `create-settings` writes every variable and connection reference in the solution, with empty values for the team to fill in.
- A Secret variable's `Value` is a Key Vault reference: `/subscriptions/<id>/resourceGroups/<group>/providers/Microsoft.KeyVault/vaults/<vault>/secrets/<name>`.
- Values are strings, as site settings are.
- Not known yet: what the import does with an empty `Value`, or with a variable that isn't in the file (keep the target's current value, fall back to the default, or fail). The white paper's promotion step imports "solution defaults" when there's no file at all.

### What a site uses it for

Only `EnvironmentVariables`. A connection reference is for cloud flows, not site settings, and the site model has nothing to use it on.

### Where the value comes from at runtime

In the target, a variable-backed setting's value is, as far as is known: the value the import set from the settings file; else a current value already in the target; else the definition's default. pageslens can't know the target's current values offline, so it takes the file's value, and otherwise what it has today.

## Design rules

- **Offline.** One file on disk, or in a commit for `diff`. No environment, no Key Vault.
- **One stage per run.** `--settings prod.json` answers "what will prod get?". Checking several stages is several runs (a CI matrix).
- **Nothing new to learn.** A value from the file is a setting's value like any other: the same rules, policy statements and diff kinds. Messages say where it came from.
- **Unknown stays unknown.** A secret, or a variable the file doesn't have, keeps today's behaviour. Never guess.

## Design

### Command line

`--settings <file>` on `lint`, `test`, `diff` and `align`:

```
pageslens lint . --settings deployment-settings/prod.json
pageslens test . --settings deployment-settings/prod.json
pageslens diff origin/main HEAD --settings deployment-settings/prod.json
pageslens align . solutions/Portal --settings deployment-settings/prod.json
```

- The path is relative to the current folder, as `--config` and `--policy` are.
- A file that can't be read, isn't JSON, or has no `EnvironmentVariables` array of `{ SchemaName, Value }` is exit 2, like a bad config. Other keys are ignored.
- `docs` doesn't take it (question 4).

### Applying the file

After the adapter has read the site, and before anything else, each setting with a `variable` is looked up in the file by schema name, ignoring case (the solution adapter already matches this way):

| In the file                          | The setting's value                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| A non-empty `Value`                  | That value. No longer `unknown`.                                             |
| A Key Vault reference (a secret)     | Unchanged: unknown in a download, "no value to read" in a solution, as today |
| An empty `Value`, or not in the file | Unchanged (question 2)                                                       |

The setting records where the value came from, so messages can name it: `"true" from environment variable dwcrm_ContactApi in deployment-settings/prod.json`. `settingValue` and `unknownValue` in `src/graph/describe.ts` gain the case; nothing else in `lint` or `test` changes, since they read the model.

It's a function on the model (`applySettings(site, settings)`), not part of an adapter: the three adapters stay as they are, and a download and a solution get the same treatment.

### `lint` and `test`

Unchanged apart from the values. The rules that skip an unknown setting (`webapi-*`) now check it; `test` statements that failed with "comes from environment variable …, which a download doesn't include" now pass or fail on the value.

### `diff`

The file is read on each side: from the folder, or from the commit at the same path for a ref. A pull request that only changes `deployment-settings/prod.json` (say `dwcrm_ContactApi` from `false` to `true`) then shows as a wider change to `Webapi/contact/enabled`, with no new change kind. A file missing on one side is read as empty on that side (a new stage's file appears in a pull request).

### `align`

`variable-no-value` reports a variable with no value in the solution, saying "the import needs one from the deployment settings". With `--settings`, it can say whether the file gives one:

- Not reported when the file has a non-empty value or a Key Vault reference.
- Reported, naming the file, when the file has an empty value or doesn't have the variable.
- A new check, `variable-not-in-settings` (warning): a variable the solution's settings use that the file doesn't list, even though the solution has a default. The import would quietly use the default, which is usually dev's value. Question 3.

### The Action

A `settings` input, passed to every command it runs (question 5).

## Tests and fixtures

- A settings file next to `test/fixtures/solution-registration/` from `pac solution create-settings`, unchanged, then a filled-in copy. Owed: needs `pac`.
- `test/fixtures/settings/`: a small download with variable-backed `Webapi/*` and registration settings, and files for two stages: one where the rules fire, one where they don't, one with a secret, one missing a variable. JSON can't hold a `#` comment, so the cases are listed in `test/fixtures/README.md`.
- A `test/fixtures/diff/settings/` pair where only the settings file changes.
- Policy cases for the same site under each stage, and `align` cases for the two checks.

## Open questions for Oleksandr

1. **The name.** `--settings`, as `pac solution import --settings-file` and the roadmap call it, or `--deployment-settings`, which can't be mistaken for site settings or `pageslens.config.yaml`? Recommended: `--settings`. It's shorter, matches `pac`, and the help text says "deployment settings file".
2. **An empty `Value`, or a variable missing from the file.** Keep today's behaviour (unknown in a download; the solution's current or default value in a solution), or treat the setting as not set? Recommended: keep today's behaviour until the import's behaviour is checked in an environment, and let `align` warn about it (question 3). Guessing "not set" could pass a check that prod fails.
3. **`variable-not-in-settings` in `align`**: a warning, as above, or nothing? Recommended: a warning. It's the case where a missing line in a stage's file gives prod dev's value, and it's cheap to fix or ignore. A new check changes `pageslens.config.schema.json`.
4. **`docs`.** Take `--settings`, or not? Recommended: not. Docs are committed and meant to give quiet diffs; per-stage docs would mean one folder per stage. Today's "from environment variable X" says where to look.
5. **The Action with several stages.** One `settings` input (a matrix runs the Action once per stage), or a list of files in one run? Recommended: one input. Several runs would each post the pull request comment, so the comment only shows with `settings` empty or on one chosen stage; say so in the docs. A list in one run would mean every report gains a stage column.
6. **Values that aren't in any setting.** Variables in the file that no setting uses (a flow's variables, or a typo): ignore, or warn in `align`? Recommended: ignore. Solutions often hold variables for flows and apps, and the file lists them all.

## Verification owed

- The file's shape and the secret's format against Learn (`conn-ref-env-variables-build-tools`, the `pac solution` reference), and a file from `pac solution create-settings` on a real solution.
- What the import does with an empty `Value` and with a variable missing from the file (needs an environment).

## Sources

- [alm-white-paper.md](research/alm-white-paper.md), [alm-story.md](research/alm-story.md)
- [0007](0007-solution-adapter.md), "Environment variables" and "Variable-backed settings in a download"
- [0008](0008-align.md), the `variable-*` checks
- Learn: [Pre-populate connection references and environment variables](https://learn.microsoft.com/power-platform/alm/conn-ref-env-variables-build-tools), [Environment variables for site settings](https://learn.microsoft.com/power-pages/configure/environment-variables-for-site-settings) (not re-read for this draft)
