# 0008: `pageslens align`

**Status:** built (see "As built"), not yet released. Draft 2, every open question answered (see "Decisions").

Teams on the solution track can keep two snapshots of the same site in git ([alm-story.md](research/alm-story.md), "The dev process"): a `pac pages download` that reviewers can read, and the unpacked solution that gets packed and deployed. `align` answers one question about them: **do the download and the solution describe the same site?**

The main case is the trap Learn warns about: new site components aren't added to a solution automatically ([Use solutions with Power Pages](https://learn.microsoft.com/power-pages/configure/power-pages-solutions)). A web role, a table permission or a page made in dev works in dev, is in the download, and is missing in test because nobody added it to the solution. Today nothing catches that before the import. `align` does, offline, from the two folders in a pull request.

It's the second half of M3. It builds on the solution adapter ([0007](0007-solution-adapter.md)), which reads a solution into the same model as a download, matched by GUID.

## What we know

### The two-snapshot process

From [alm-story.md](research/alm-story.md) (agreed 2026-10-23):

- One capture job takes both snapshots from dev, one after the other: `pac pages download` (or `download-code-site`) into `site/`, `pac solution sync` into `solution/`. Taken together, they should agree; two snapshots taken minutes apart can disagree for reasons that aren't problems.
- The pull request runs `align site/ solution/` with `lint`, `test` and `diff`. `align` errors fail it.
- `site/` is never deployed. What reaches test and prod is the solution.
- The research table lists six findings: in the download and not the solution (error), the reverse (warning), content that differs (error), a table, web role or environment variable the site uses and the solution lacks (error), a secret-like setting with a hardcoded value (error), and a setting that differs per stage without a variable (warning).
- In the git-first process for bigger teams, `site/` is edited in pull requests and is ahead of `solution/` until CI deploys `main` and syncs the solution. There, `align` runs after the deploy (with `--fix` to add what's missing, which is later: decision 1), not on pull requests.

### What the committed pairs show

Two real pairs are in `test/fixtures/`, each a download and a solution of the same environment: `registration/` with `solution-registration/` (a classic site, 477 records), and `ecoflux/` with `solution-ecoflux/` (a code site, 143 records). 0007 checked that they give the same typed model. For this spec, every field of every record was compared on 2026-10-25, with a throwaway script over the adapters' records. Every record matched by GUID, and every difference falls in the list below. **None of them is a real difference.**

The EcoFlux solution also had a web file named `.gitkeep` that the download didn't. It was left over from testing in the environment, not something `pac` does, and was removed from `solution-ecoflux/` (decision 4).

| Difference                                                                                                                                                                                        | Where                                                    | Seen in      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------ |
| Field names: a classic download prefixes keys with `adx_` and names the id `adx_<kind>id` (or an `ID_KEYS` exception); relationship lists keep the prefix in both                                 | every classic record                                     | Registration |
| Empty side files a download writes where the solution has no value or an empty one                                                                                                                | 100 in Registration, 42 in EcoFlux                       | both         |
| Side file names: a page's `customcss` and `customjavascript` are `custom_css` and `custom_javascript`; a form's or list's `registerstartupscript` is `custom_javascript`                          | already mapped by the adapter                            | both         |
| Line endings in inline text (a stray `\r`)                                                                                                                                                        | 2 of 31 HTML fields (spike 0); normalised by the adapter | EcoFlux      |
| JSON-valued form and list fields: compact with `$type` (a full .NET type name) in the solution, pretty-printed with a short `Type` in the download                                                | `settings` on 5 forms and 1 list, `views` on 2 lists     | Registration |
| Localized labels (JSON) written differently but equal as JSON                                                                                                                                     | 5 fields on forms and lists                              | Registration |
| Role lists in another order                                                                                                                                                                       | 1 table permission                                       | Registration |
| `websiteid` in the solution's `content`: dropped by the adapter                                                                                                                                   | every EcoFlux component                                  | EcoFlux      |
| Web file annotation metadata in the download only (`annotationid`, `filename`, `mimetype`, `isdocument`, `objectid`, `objecttypecode`)                                                            | 26 and 8 web files                                       | both         |
| `statuscode` in the download's fields; in the solution it's an XML element the adapter doesn't read (`statecode` matches on both sides)                                                           | 17 inactive records                                      | Registration |
| The record's language: an XML element `powerpagesitelanguageid` in the solution, a field in the download (`contentsnippetlanguageid`, `webpagelanguageid`, `websitelanguageid`)                   | 151 snippets, 22 pages, 6 link sets                      | Registration |
| A site language's language: `portallanguageid` (a GUID) in the download, `systemlanguage` (an LCID) in the solution                                                                               | 1 site language each                                     | both         |
| A table permission's `name` in the solution's fields, from the XML element; the download names it by `entityname`, which is also in both                                                          | 11 and 9 table permissions                               | both         |
| Fields only the solution has: a page access rule's publishing states (`adx_accesscontrolrule_publishingstate`), `displaypagevalidation: false` on web links, an empty `filecontent` on a web link | 1 rule, 4 links, 1 link                                  | both         |
| Fields only the download has: `enhancedauthorization` on the website                                                                                                                              | 1                                                        | Registration |
| A setting backed by an environment variable: the download has the leftover `value`, the solution the variable's value (0007, decision 9)                                                          | 1 setting                                                | Registration |

Two of these are new since 0007: `statuscode`, and the language lookups, which the solution keeps outside `content`. Text in side files and web file content were equal on both sides (0007).

### What a solution has that a download doesn't, and the reverse

- A solution has the environment variables its settings use (`environmentvariabledefinitions/`), and the tables it includes (`RootComponents` of type 1 in `Other/Solution.xml`, and `Entities/`). EcoFlux's solution has its four custom tables; Registration's has none, because its tables come from a Microsoft app (`msdynce_`) and from Dataverse (`contact`).
- A download has neither, and can't say which tables or variables the target environment already has.
- Microsoft's recommendation is a separate solution for the Dataverse tables the site uses, and a site solution with only Power Pages components and environment variables (Oleksandr, 2026-10-26). In that setup the site solution never has the tables, so a table missing from it says nothing (decision 5).

### What can't be known offline

- **Whether the target has a table.** Standard tables (`contact`) and tables from other solutions are in every target that has those solutions; a solution doesn't list them, and nothing offline says which solutions a target has. `MissingDependencies` in `Solution.xml` lists some, but only what Dataverse computed at export time.
- **Component type numbers for `pac solution add-solution-component`.** Learn says to look them up per environment in `solutioncomponentdefinitions` ([PAC CLI solution support](https://learn.microsoft.com/power-pages/configure/power-platform-cli-solution-management)); its own example shows two different numbers for the site. A table is type 1 everywhere; a site component isn't a fixed number.
- **Per-stage values.** Whether a setting should differ between stages depends on the deployment settings files, which are outside both snapshots.

## Design rules

- **Same site, compared by GUID.** Records match by GUID, never by file or name, as in `diff`.
- **Known differences are not findings.** The table above is the list of what two snapshots of one site differ in. `align` on the committed pairs reports nothing. A difference not on the list is reported, so a new `pac` version shows up instead of hiding things.
- **Closed set of checks**, as for `diff`'s change kinds: no user-defined comparisons.
- **The solution is what deploys.** Findings are worded from the target's side: "missing from the solution: won't be in test or prod".
- **Offline.** No Dataverse connection, no `pac`. What needs one (`--fix`, drift against an environment) is a later version (decisions 1 and 2).
- **Findings point at files a reviewer can open**: the download's file when there is one, the solution's component file otherwise.
- **Deterministic output**: sorted, no timestamps.

## Design

### Command line

```
pageslens align <site> <solution> [--format text|json|markdown|sarif] [--config <file>]
```

- `<site>` is found as `lint` finds a path, and must be a download (`code-download` or `classic-download`). `<solution>` must be an unpacked solution (0007). The wrong kind on either side is exit 2, naming what was found: "site/ is an unpacked solution; align compares a download with a solution".
- Both are folders. Comparing snapshots in git commits is `diff`'s job; in CI both are in the checkout.
- A side that can't be read is exit 2, with the adapter's problems, as for `lint`.

| Exit code | Meaning                                                                                      |
| --------- | -------------------------------------------------------------------------------------------- |
| 0         | No error-level findings (warnings and notes may be there)                                    |
| 1         | At least one error-level finding                                                             |
| 2         | A side that isn't the right kind, can't be read, a solution with several sites, a bad config |

### Matching

- The website: `website.yml` against `Assets/powerpagesites.xml`. **Different GUIDs end the comparison** with one error, `site-mismatch`: "site/ is site "Registration" (a7120f29-…), solution/ has site "EcoFlux" (8f7bf824-…)". Reporting 477 missing components would bury the cause.
- Site languages against `Assets/powerpagesitelanguages.xml`, components against `powerpagecomponents/`, by GUID.
- Inactive records take part (both adapters keep them in `records`), so a state change is seen.

### Checks

| Check                   | Severity                              | Reports                                                                                                                                                                                           |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site-mismatch`         | error                                 | The two sides are different sites (above). Nothing else is checked.                                                                                                                               |
| `missing-from-solution` | error; warning for an inactive record | A record in the download that the solution doesn't have. "It works in dev and won't be in test or prod." An inactive one does nothing in the target, but would be missing the day it's activated. |
| `missing-from-download` | warning                               | A component in the solution that the download doesn't have: deleted in dev and still shipped, or taken from a snapshot of a different time.                                                       |
| `state-differs`         | error                                 | Active on one side, inactive on the other.                                                                                                                                                        |
| `content-differs`       | error                                 | A field, a side file's text or a web file's content that differs, after the normalisation below. One finding per record, naming the fields (the first five, then "and N more").                   |
| `field-one-side`        | warning                               | A field with a value on one side only that isn't on the known list. Reported apart from `content-differs` so a new `pac` version doesn't fail every build (decision 3).                           |
| `variable-missing`      | error                                 | A setting backed by an environment variable (`source: 1`) whose variable isn't in the solution. The import needs it. Uses the reason 0007's adapter already records.                              |
| `variable-no-value`     | warning                               | A variable a setting uses that has neither a current value nor a default in the solution, and isn't a secret: the import needs a value from the deployment settings file.                         |

A variable-backed setting is compared on `source` and `envvar_schema`, not on its value: the download has only the leftover value, and the solution's value is what the setting will have. A setting that uses a variable in the download and its own value in the solution (or the reverse) is `content-differs`.

A web role or table permission missing from the solution is `missing-from-solution` like any component; no separate check is needed. A table permission whose role is in neither snapshot is a broken reference, which is `lint`'s job.

Three of the research's findings are left out of `align`:

- **Tables the site uses that the solution doesn't include.** The tables usually live in a solution of their own, so the site solution is expected to lack them (decision 5). `align` doesn't read `RootComponents` or `Entities/`.
- **Hardcoded secret-like settings** (`Authentication/OpenIdConnect/*/ClientSecret`, `.../AppSecret`, `.../ConsumerSecret` with a value) are a problem in a download too, which commits the secret to git just the same. They become a lint rule, `setting-secret-value`, not an alignment check (decision 6).
- **Settings that differ per stage without a variable** need the deployment settings files. A later `--settings <file>` could read them; not in this version.

### What isn't a difference

Before comparing, each record is brought to one form. This is the known-differences table as rules:

1. **Keys.** A classic download's keys lose `adx_` and the id key becomes `id`, as the classic adapter's `modelFields` already does; every list value keeps its name (`adx_adplacement_ad`, `adx_pollplacement_poll` as well as the three in `RELATIONSHIP_KEYS`). The adapter's mapping is reused, not copied.
2. **Empty is absent.** An empty string, an empty list and a missing field are the same; so are an empty side file and no side file.
3. **Text** (side files and inline text) is compared with newlines normalised, which both adapters already do. Web file content is compared as bytes.
4. **JSON-valued fields.** A string field whose value on both sides parses as a JSON object or array is compared as JSON, with keys in any order and the `$type` and `Type` keys left out. `Type` is a short name for `$type` but not one that can be derived from it (`GridMetadata+DeleteModal` is `CrmEntityFormView-GridDeleteModal`), so neither is compared. The cost: a change only to an object's type, with every other key equal, isn't seen.
5. **Lists of GUIDs** are sets.
6. **Ignored fields**, a closed list in code (`ALIGN_IGNORED`): `websiteid`; `statuscode` (`statecode` is compared); web file annotation metadata; the record's language field on the download side, compared instead with the solution's `powerpagesitelanguageid` element (the adapter reads it, a small change to 0007's adapter); a site language's `portallanguageid` and `systemlanguage`; a table permission's `name` field; and the fields only one side writes: `adx_accesscontrolrule_publishingstate`, `displaypagevalidation`, `enhancedauthorization`.
7. **Variable-backed settings** are compared as above.

No record is exempt from matching: a record on one side only is always reported (decision 4).

### Output

Text, grouped by check, errors first, then by kind and name:

```
align site/ (classic site download) with solution/ (PagesLensEDM2Sol 1.0.0.0)

✗ missing from the solution: won't be in test or prod
    web role "Course Admins"                       webrole.yml
    table permission "Course Admins - Courses"     table-permissions/Course-Admins---Courses.tablepermission.yml
✗ content differs
    site setting "Search/Enabled": value is "true" in site/, "false" in solution/
      sitesetting.yml
      powerpagecomponents/9c1e…/powerpagecomponent.xml
⚠ in the solution, not in the download
    web page "Old Promo"                           powerpagecomponents/41aa…/powerpagecomponent.xml

2 errors, 1 warning. 475 records match.
```

When access components (web roles, table permissions, page rules, website access, Web API settings) are missing or differ, the output ends with a pointer: `pageslens diff site/ solution/` shows what the target loses.

- **JSON**: a versioned object (`version`, `site`, `solution`, `summary`, `findings`), each finding with `check`, `severity`, `kind`, `recordId`, `name`, the files on each side, and for `content-differs` the fields with both values (text fields as "differs", not the text).
- **Markdown**: the same groups as a block for the Action's comment, with a heading and counts, collapsed past a size cap as `diff`'s Markdown is.
- **SARIF**: one rule per check, results on the download's file when there is one (the GUID's line, through `recordLines`), with the solution's file as a related location; `missing-from-download` on the solution's file.

### Configuration

Reuse `pageslens.config.yaml` rather than a new file (decision 7):

```yaml
align:
  checks:
    missing-from-download: off
  ignore:
    - records: [3453215b-d450-4073-a12c-88aa8a248b81]
      reason: Test page, kept out of the solution on purpose
```

`ignore` entries take `checks` and `records` (GUIDs) as lint's take `rules` and `records`, with unused entries listed. Files aren't offered: a record has a file on each side. The schema file gets the `align` section.

### How it fits

- **`diff`** compares access between any two snapshots, a download and a solution included. `align` compares every component and its content, not only access, and fails on what's missing. They overlap on purpose: `align` says the web role is missing, `diff site/ solution/` says what that does to who can see what. The note in `docs/diff.md` that a download and a solution "give no changes, unless the solution is missing components" points at `align`.
- **`lint` and `test`** run on either snapshot. In the two-snapshot process, run them on the solution: it's what deploys, and it has the variables' values.
- **The GitHub Action** gets a `solution` input, empty by default. When set, `run` also runs `align <path> <solution>`: its SARIF is uploaded with lint and test (its own category), its Markdown goes into the comment above the access changes, an `align-errors` output is set, and `finish` fails the job on errors. Off by default because only two-snapshot teams have both folders, and in the git-first process `site/` is ahead of `solution/` on every pull request (decision 8).

### Later: `--fix` and `--target`

The research has two extensions. Neither is in the first version (decisions 1 and 2): each needs more investigation, and something an offline check doesn't have. What's known so far, for when they're picked up:

- **`--fix`**: the `pac solution add-solution-component` commands for what's missing. Printing them is offline and safe, but the component type for a site component is a per-environment number (above), so a printed command needs it from the user (`--component-type <n>`, found once with the query Learn gives) or a placeholder. Running them needs `pac`, an auth profile and the dev environment: it's a step for a CI job or an agent skill (`fix-alignment` in the research), not for a check. To investigate: whether the type numbers really differ between environments, and whether `pac pages upload` keeps GUIDs on new components (alm-story.md, open point 7).
- **`--target`**: a download of test or prod against the solution, to show edits made in the target (the unmanaged layer Learn warns about). The comparison is the same; what changes is the reading. A managed target has every solution component, so `missing-from-download` becomes the error and `missing-from-solution` means something created in the target. To investigate, with environments to deploy to: what `pac pages download` writes for a site that came in a managed solution.

## Tests and fixtures

- **The real pairs, read-only.** `registration/` with `solution-registration/`, and `ecoflux/` with `solution-ecoflux/`, give no errors and no warnings, and every known difference in the table above is exercised. If the adapter or `pac` changes and a pair stops aligning, a test fails.
- **Hand-written broken pairs** in `test/fixtures/align/<case>/{site,solution}`, small, each case's first file starting with a comment naming the check (`#` in YAML, an XML comment in a component, as 0007's diff fixtures do):
  - `missing`: a web role and a table permission in the download only (error), an inactive page in the download only (warning), a page in the solution only (warning).
  - `content`: a setting value, a template's text, a web file's bytes, a form's `settings` JSON with a real change next to one that differs only in `$type`/`Type` and formatting (only the first is reported), a role list in another order (not reported), a record active on one side only.
  - `variables`: a setting moved to a variable in the solution only; a variable missing from the solution; one with no value; a secret (not reported).
  - `mismatch`: two different sites.
  - `classic` and `code`: one of each layout, so both key forms are covered.
- **Unit tests** for the normalisation (keys, empty, JSON, sets), the exit codes and the wrong-kind errors, and a text snapshot of each format.
- **The Action**: the `solution` input in `test/action/`, and CI running it on `uses: ./` with the EcoFlux pair.

## Implementation sketch

- `src/align/types.ts` (`CHECKS`, the finding shape), `normalize.ts` (the rules above, with `ALIGN_IGNORED`), `compare.ts` (matching and checks), `format/` (text, JSON, Markdown, SARIF).
- `src/adapters/solution.ts`: read `powerpagesitelanguageid` into the download's language field per kind. `src/adapters/classic-site.ts`: export the key mapping so `align` reuses it.
- `src/cli.ts`: the command. `src/lint/config.ts` and the schema: the `align` section.
- `action.yml` and `action/main.ts`: the `solution` input and output.
- Docs: `docs/align.md` (the user reference: checks, what isn't a difference, exit codes), the README (a section and the Action input), `docs/diff.md` (the pointer).
- The `setting-secret-value` lint rule (decision 6) follows AGENTS.md, "Changing a lint rule". It can ship with `align` or on its own.

## Decisions (Oleksandr, 2026-10-26)

1. **No `--fix` in the first version.** Later, after more investigation (roadmap, Later).
2. **No `--target` in the first version.** It needs environments to deploy to; much later, after more investigation (roadmap, Later).
3. A field on one side only that isn't on the known list is a warning, `field-one-side`, as recommended.
4. **The `.gitkeep` web file isn't a `pac` behaviour.** It was left over from testing in the environment, and was removed from `solution-ecoflux/`. No record is exempt from matching.
5. **No table check.** Microsoft recommends a separate solution for the configuration tables, and a site solution with only Power Pages components and environment variables. Tables missing from the site solution are expected, so `align` doesn't report them.
6. Hardcoded secrets become a lint rule, `setting-secret-value`, as recommended.
7. An `align` section in `pageslens.config.yaml`, with severities and `ignore` by record, as recommended.
8. The Action gets a `solution` input, off by default, as recommended.
9. An inactive record missing from the solution is a warning, as recommended.

## Open questions for Oleksandr (answered, see Decisions)

1. **`--fix` in the first version?** Options: none; print the `pac solution add-solution-component` commands; or run them. Recommended: print them, behind `--fix`, with the component type from `--component-type <n>` and a placeholder without it, and say in the docs how to find the number. Running `pac` breaks the offline rule, needs credentials in the check, and belongs in a CI step or an agent skill that reads the JSON.
2. **`--target` in the first version?** Recommended: not yet. Ship `align` for the two-snapshot pull request first. `--target` needs a sample of a download from an environment where the site came in a managed solution, to know what's normal there; it's a follow-up once one is at hand (roadmap, "Verification in a Dataverse environment").
3. **A field on one side only that isn't on the known list**: an error (`content-differs`), a warning (`field-one-side`), or ignored? Recommended: a warning. The known list covers everything seen in two real pairs, but a new `pac` version will add fields; an error would fail every team's build the day it ships, and ignoring them would hide what 0007 found (publishing states only in the solution).
4. **`.gitkeep` web files.** `download-code-site` left out a web file named `.gitkeep` that the solution has. Not report web files named `.gitkeep` on a code site, or report them as `missing-from-download` like any component? Recommended: don't report them, as a named case. It's a known `pac` behaviour, and a warning on every code site teaches people to ignore the warning. Widen it (files starting with `.`) only when a sample shows another.
5. **Tables.** Which tables does `table-missing` report? Options: none; tables with the solution publisher's prefix (`dwcrm_` from `CustomizationPrefix`) that the solution doesn't include; or every table not in the solution, minus a list in the config. Recommended: the publisher's prefix, as a warning, plus `align.tables` in the config for other custom tables a team wants checked. It catches the common case (a custom table made for the site and never added) without warning on `contact` or on a Microsoft app's tables, which the target has from elsewhere. An error would be wrong whenever the table comes from another solution of the same publisher.
6. **Hardcoded secrets.** Make it a lint rule (`setting-secret-value`, error: a setting whose name ends in `ClientSecret`, `AppSecret` or `ConsumerSecret`, with a value of its own) instead of an `align` check? Recommended: yes, a lint rule, in the same release or the next. A download commits the secret to git too, so every team benefits, not only those running `align`. The name list stays closed and short; an ignore covers a test value.
7. **Configuration.** An `align` section in `pageslens.config.yaml` with severities and `ignore` by record? Recommended: yes, the same file and the same shape as lint's, so a component left out on purpose doesn't fail every build. No file globs: a record has a file on each side.
8. **The Action.** A `solution` input in the first version, off by default? Recommended: yes. The pull request check is where `align` is meant to run, and teams on the two-snapshot process already use the Action. Off by default, since a git-first team's `site/` is ahead of `solution/` on purpose.
9. **Inactive records missing from the solution**: a warning, as above, or an error like active ones? Recommended: a warning. In the target an inactive record does nothing, so the build shouldn't fail on it; the warning still says it'll be missing when someone activates it in dev.

## As built

Built to draft 2 with every decision as recorded; `--fix`, `--target`, the table check and the `setting-secret-value` lint rule are left out. The user reference is [docs/align.md](../docs/align.md). Where the code needed an interpretation the spec doesn't give:

1. **What `field-one-side` means.** "A field on one side only that isn't on the known list" is read as: a field with a value on one side, where no record of that kind on the other side has the field at all, empty or not. That's what a new `pac` field looks like. A value on one side where the other side's format does write the field (a setting value cleared in the solution) is `content-differs`. One-sided fields on a record that also has `content-differs` go into that finding, so a record has one.
2. **`source` defaults to `0`.** A setting with no `source` takes its own value, so a setting moved to a variable on one side only differs in `source`, as the spec asks, rather than having `source` on one side only.
3. **The language element** is read by the solution adapter into the download's field for three kinds: `webpagelanguageid`, `contentsnippetlanguageid`, `websitelanguageid` (web link sets). Those 179 records in Registration compare equal. Another kind with the element would show as `field-one-side`; none was seen.
4. **List keys.** The classic adapter's mapping (`classicModelFields`, exported) now keeps the name of every list-valued key, not only the three in `RELATIONSHIP_KEYS`. The typed schemas don't read the other lists, so nothing else changed.
5. **Values.** GUIDs are lower-cased; a string is compared as JSON only when it's an object or array; booleans and numbers compare as the strings both adapters already give.
6. **Order and wording.** Findings are sorted by severity, then check in the order of `CHECKS` (`site-mismatch`, `missing-from-solution`, `state-differs`, `content-differs`, `variable-missing`, `missing-from-download`, `field-one-side`, `variable-no-value`), then kind and name. Messages say "the download" and "the solution" rather than repeating the paths, which the header gives. "N records match" counts the records on both sides with no difference, before the config; it's left out after `site-mismatch`.
7. **Variable checks** cover active and inactive settings, and point at the download's file when it has the setting, with the component's file next to it.
8. **Config.** The `align` section is read from the config `lint` would use for `<site>`. An `align.ignore` entry needs `records`; `checks: { <check>: off }` is how a whole check is turned off. A record that matches no finding is an unused ignore, as for lint.
9. **JSON.** Each finding has `siteFile` and `solutionFile` (whichever exist), `fields` on `content-differs` and `field-one-side`, and `inactive: true` on an inactive record missing from the solution. `summary` has the counts, `matched` and `ignored`.
10. **Markdown** is capped at 20,000 characters, a third of GitHub's limit, since it shares the comment with the access changes.
11. **The Action.** With `solution` set, `run` runs `align` on pull requests and pushes alike. The comment is the align Markdown above the access changes, under the diff's marker, so it's the same comment with or without `solution`; if both don't fit in 65,000 characters, the access changes are left to the job summary with a note. A comment is created when there are access changes or align findings. The align Markdown also goes to the job summary. CI runs it on the EcoFlux pair and expects `align-errors` to be `0`.
12. **Fixtures.** `test/fixtures/align/` has the six pairs from "Tests and fixtures": `classic` and `code` are clean pairs that go through every rule in "What isn't a difference"; `content` also has a `field-one-side` case.

## Verification owed

1. For `--target`, later: a download of a site deployed by a managed solution, what it writes, and whether anything differs from the solution beyond the known list.
2. Advanced forms, column permissions, Server Logic and cloud flows (0007, verification 3): their own one-sided fields, if any, before `align` claims to compare them cleanly. Until then they're compared like any untyped record, and a difference shows as a finding.
3. A code site's download of a variable-backed setting (0007, verification 2): `source: 1` and `envvar_schema`, as expected.

## Sources

- [alm-story.md](research/alm-story.md): the two-snapshot process, what `align` reports, `--fix` and `--target`.
- [spike-0-findings.md](research/spike-0-findings.md) and [0007: Solution adapter](0007-solution-adapter.md), "Samples" and "As built": the known differences.
- [Use solutions with Power Pages](https://learn.microsoft.com/power-pages/configure/power-pages-solutions): new components aren't added automatically; tables are added by hand; don't edit in the target.
- [Power Platform CLI solution support for Power Pages](https://learn.microsoft.com/power-pages/configure/power-platform-cli-solution-management) and [pac solution](https://learn.microsoft.com/power-platform/developer/cli/reference/solution): `add-solution-component`, and component types looked up per environment.
- [Environment variables for site settings](https://learn.microsoft.com/power-pages/configure/environment-variables-for-site-settings).
