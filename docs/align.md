# Download and solution: `pageslens align`

```
pageslens align <site> <solution> [--format text|json|markdown|sarif] [--config <file>]
```

`align` answers one question: **do a site download and the unpacked solution describe the same site?** It's for teams that commit both: a `pac pages download` (or `download-code-site`) that reviewers can read, and the solution that gets packed and deployed.

The main case is a component made in dev and never added to the solution. New site components aren't added to a solution automatically, so a web role, a table permission or a page works in dev, is in the download, and is missing in test and prod. `align` shows it in the pull request, before the import.

- `<site>` is a download, found as `lint` finds a path: the `.powerpages-site` folder, the folder that contains it, or a classic site folder.
- `<solution>` is an unpacked solution in the XML format: the folder with `Other/Solution.xml`, or a `pac solution clone` project.
- Both are folders. To compare two commits, use [`diff`](diff.md).

Records match by GUID, never by file or name. Inactive records take part, so a state change shows.

## Checks

| Check                      | Severity                              | Reports                                                                                                                                                         |
| -------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site-mismatch`            | error                                 | The two sides are different sites. Nothing else is checked.                                                                                                     |
| `missing-from-solution`    | error; warning for an inactive record | A record in the download that the solution doesn't have: it won't be in test or prod. An inactive one does nothing there, but is missing once it's activated.   |
| `state-differs`            | error                                 | Active on one side, inactive on the other.                                                                                                                      |
| `content-differs`          | error                                 | A field, a side file's text or a web file's content that differs. One finding per record, naming the fields.                                                    |
| `variable-missing`         | error                                 | A setting backed by an environment variable that isn't in the solution. The import needs it.                                                                    |
| `missing-from-download`    | warning                               | A component in the solution that the download doesn't have: deleted in dev and still shipped, or a snapshot from another time.                                  |
| `field-one-side`           | warning                               | A field with a value on one side only, where the other side's format doesn't write that field at all.                                                           |
| `variable-no-value`        | warning                               | A variable a setting uses with no current or default value in the solution, and not a secret. The import needs a value from the deployment settings file.       |
| `variable-not-in-settings` | warning                               | With `--settings`: a variable a setting uses that has a value in the solution and none in the deployment settings file. The stage may get the solution's value. |

### `site-mismatch`

The website in `website.yml` and the one in `Assets/powerpagesites.xml` have different GUIDs. Check the paths: one of them is another site, or another environment's copy.

### `missing-from-solution`

Add the component to the solution in dev (Power Pages design studio, or `pac solution add-solution-component`), sync the solution, and commit both snapshots again. If the record is in the download on purpose and shouldn't deploy, ignore it in the config.

### `state-differs`

One snapshot was taken before the record was activated or deactivated. Take both again, one after the other.

### `content-differs`

The two snapshots disagree on a record. Usually one was taken before an edit and the other after; take both again. Text fields and web file content show as `differs`, not the text.

### `variable-missing`

The setting reads its value from an environment variable (`source: 1`, `envvar_schema`), and the variable's definition isn't in the solution. Add the environment variable to the solution.

### `missing-from-download`

The component was deleted in dev but is still in the solution, so the import keeps it in test and prod. Remove it from the solution, or take the download again.

### `field-one-side`

A field has a value on one side, and no record of that kind on the other side has the field at all. That's what a new `pac` version looks like, or a field pageslens doesn't know yet, so it's a warning, not an error. When the other side's format does write the field, a value on one side only is `content-differs`.

### `variable-no-value`

The variable has neither a current value nor a default in the solution. The import asks for one: put it in the deployment settings file. A secret (Azure Key Vault) isn't reported. With `--settings`, a variable the file gives a value isn't reported either, and the finding says when the file has none.

### `variable-not-in-settings`

Only with `--settings <file>`. The solution has a value for the variable (the current value, or else the default), and the deployment settings file doesn't list the variable, or lists it with an empty `Value`. A value in the solution goes with it, so the stage may get dev's value, or the default: what the import does then isn't documented. Put the stage's value in the file, or ignore the finding when the solution's value is right for every stage. `pac solution create-settings` writes every variable with an empty `Value`, so a file nobody has filled in warns on each one. A secret isn't reported, and variables in the file that no setting uses are ignored.

## What isn't a difference

Two snapshots of one site always differ in some ways. Each record is brought to one form first, so these aren't reported:

1. **Keys.** A classic download's keys lose `adx_` and its id key is the record's id. Lists keep their names (`adx_entitypermission_webrole`, `adx_adplacement_ad`).
2. **Empty is absent.** An empty string, an empty list and a missing field are the same; so are an empty side file and no side file.
3. **Text** in side files and inline text is compared with newlines normalised. Web file content is compared byte for byte.
4. **JSON in a field.** A value that is a JSON object or array is compared as JSON: keys in any order, any formatting, and the type keys `$type` (solution) and `Type` (download) left out. A change to an object's type alone isn't seen.
5. **Lists of GUIDs** are sets: the same roles in another order are the same.
6. **Fields left out:** `websiteid`; `statuscode` (`statecode` is compared as active or inactive); a web file's note fields in the download (`annotationid`, `filename`, `mimetype`, `isdocument`, `objectid`, `objecttypecode`); a site language's `portallanguageid` and `systemlanguage`; a table permission's `name` (the download names it by `entityname`); and the fields one side writes and the other doesn't: a page rule's `adx_accesscontrolrule_publishingstate`, a web link's `displaypagevalidation`, the website's `enhancedauthorization`.
7. **The record's language.** The solution keeps it as an element, `powerpagesitelanguageid`; it's compared with the download's field (`webpagelanguageid`, `contentsnippetlanguageid`, `websitelanguageid`).
8. **Settings from environment variables** are compared on `source` and `envvar_schema`, not on `value`: a download has only the leftover value. A setting with no `source` takes its own value, so a setting that uses a variable on one side only is `content-differs`.

Anything else that differs is reported, so a change in what `pac` writes shows up instead of hiding a real difference.

## Configuration

`align` reads the `align` section of `pageslens.config.yaml`, found as `lint` finds it (from `<site>` upwards), or the file given with `--config`:

```yaml
align:
  checks:
    missing-from-download: off
  ignore:
    - records: [3453215b-d450-4073-a12c-88aa8a248b81]
      reason: Test page, kept out of the solution on purpose
    - checks: [content-differs]
      records: [9c1e0a2b-7d4e-4f31-8a6c-2b5d9e0f1a77]
```

- `checks`: a severity per check (`error`, `warning`, `info` or `off`).
- `ignore`: findings on any of `records` (GUIDs, as the JSON output's `recordId`), from `checks` only when it's given. An entry's record that matches no finding is listed as an unused ignore: remove it once what it ignored is fixed.

## Exit codes

| Code | Meaning                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | No error-level findings (warnings and notes may be there)                                                                                        |
| `1`  | At least one error-level finding                                                                                                                 |
| `2`  | A side that isn't the right kind or can't be read, a solution with several sites, a config in error, or a deployment settings file it can't read |

## Output

### Text

Grouped by severity and check, errors first, then by kind and name, with the files on each side:

```
align site (classic site download) with solution/src (PagesLensEDM2Sol 1.0.0.0)

✗ missing from the solution: won't be in test or prod
    table permission "Course Admins - Courses"  table-permissions/Course-Admins---Courses.tablepermission.yml
    web role "Course Admins"                    webrole.yml
✗ content differs
    site setting "Search/Enabled": value is "true" in the download, "false" in the solution
      sitesetting.yml
      powerpagecomponents/9c1e0a2b-7d4e-4f31-8a6c-2b5d9e0f1a77/powerpagecomponent.xml
⚠ in the solution, not in the download
    web page "Old Promo"  powerpagecomponents/41aa7c1d-0b3e-4a55-9d21-6f8e2c4b7a90/powerpagecomponent.xml

3 errors, 1 warning. 475 records match.
Access components differ: pageslens diff site solution/src shows what the solution changes about who can see what.
```

When web roles, table permissions, page access rules, website access or Web API settings are missing or differ, the last line points at [`diff`](diff.md), which shows what that does to access.

### Markdown

For the GitHub Action's comment, above the access changes: a heading, the counts, errors listed, warnings and notes folded. It's capped at 20,000 characters, so the access changes keep most of GitHub's comment limit; past the cap the folded groups go first, then error lines from the end. The counts line is always exact.

### JSON

A versioned object for agents and scripts:

```json
{
  "version": 1,
  "site": {
    "path": "site",
    "format": "classic-download",
    "layout": "classic",
    "site": { "id": "…", "name": "…" }
  },
  "solution": {
    "path": "solution/src",
    "format": "solution",
    "layout": "classic",
    "site": { "id": "…", "name": "…" },
    "solution": { "name": "PagesLensEDM2Sol", "version": "1.0.0.0" }
  },
  "summary": { "error": 3, "warning": 1, "info": 0, "matched": 475, "ignored": 0 },
  "findings": [
    {
      "check": "content-differs",
      "severity": "error",
      "kind": "sitesetting",
      "recordId": "9c1e0a2b-7d4e-4f31-8a6c-2b5d9e0f1a77",
      "name": "Search/Enabled",
      "message": "value is \"true\" in the download, \"false\" in the solution",
      "siteFile": "sitesetting.yml",
      "solutionFile": "powerpagecomponents/9c1e0a2b-7d4e-4f31-8a6c-2b5d9e0f1a77/powerpagecomponent.xml",
      "fields": [{ "field": "value", "site": "true", "solution": "false" }]
    }
  ],
  "unusedIgnores": []
}
```

`siteFile` and `solutionFile` are relative to each side's folder; a record on one side only has one of them. `fields` (on `content-differs` and `field-one-side`) gives each field's value on each side, leaving out the side without one; text and web file content show as `differs`. `inactive: true` marks an inactive record missing from the solution. `version` changes only when a field is removed or changes meaning.

### SARIF

One rule per check, for GitHub code scanning (category `pageslens/align/`). A result is on the download's file at the record's GUID line, with the solution's file as a related location; a component in the solution only is on the solution's file.

## How it fits

- **`diff`** compares access between any two snapshots, a download and a solution included. `align` compares every component and its content and fails on what's missing; `diff site solution` says what a missing web role does to who can see what.
- **`lint` and `test`** run on either snapshot. With both committed, run them on the solution: it's what deploys, and it has the environment variables' values.
- **The GitHub Action** runs `align` when its `solution` input is set: the results go to code scanning, the comment and the job summary, and errors fail the job. It's off by default. Where `site/` is edited in pull requests and the solution is synced after the deploy, `site/` is ahead of the solution on every pull request, so leave it off there.
- Tables aren't checked: they usually live in a solution of their own, so a site solution without them is expected.

Design notes: [specs/0008-align.md](../specs/0008-align.md).
