# 0007: Solution adapter

**Status:** draft 1, open questions for Oleksandr. Goes out in 0.8.0 with the `webapi-inner-errors` rule and the unused ignore entries.

pageslens reads two download layouts today: a code site's `.powerpages-site/` and a classic site folder. Teams on the solution track keep neither in git. They keep the unpacked solution that gets packed and deployed, where every site component is a folder named by its GUID ([alm-story.md](research/alm-story.md), "The gap between them"). This spec adds a third adapter that reads an unpacked solution into the same model, so `lint`, `test`, `docs` and `diff` work on it unchanged.

It's the first half of M3. `align` (whether a site download and a solution are the same site) builds on it and gets its own spec (0008). Solution `.zip` files are out of scope (roadmap, Later): a `.zip` is one `pac solution unpack` away.

## What we know

### Spike 0 (2026-10-23, EcoFlux)

[spike-0-findings.md](research/spike-0-findings.md) read the EcoFlux solution, unpacked in the XML format, next to its code site download:

- Every component is `powerpagecomponents/<guid>/powerpagecomponent.xml`. The folder name is the record's GUID and equals the download's `id`: 141 of 141 matched.
- The XML has the component's `name`, `powerpagecomponenttype`, `statecode` and `statuscode`, and a `content` element holding JSON with the same keys as the code site download's YAML. Relationship lists keep their names (`adx_entitypermission_webrole`), and scope is the raw option value, as in a download.
- Liquid and HTML are inline in `content` (template `source`, page `copy`), where a download writes side files. Web file binaries are in `filecontent/<filename>` in the component's folder.
- The website and its languages aren't components: they're in `Assets/powerpagesites.xml` and `Assets/powerpagesitelanguages.xml`, with the same GUIDs.
- Field values were equal on both sides, except `websiteid` on every record in the solution, web file annotation metadata only in the download, and stray `\r` line endings in 2 of 31 HTML fields.

### Research (2026-10-25, Microsoft Learn)

- **Component types.** The Dataverse reference lists every `powerpagecomponenttype` value, so the type numbers spike 0 couldn't see are known: 15 basic form, 16 basic form metadata, 17 list, 19 to 21 advanced forms (form, step, metadata), 24 poll placement, 26 ad placement, 28 column permission profile, 29 column permission, 30 redirect, 31 publishing state transition rule, 32 shortcut, 33 cloud flow, 34 UX component, 35 Server Logic ([powerpagecomponent](https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/powerpagecomponent)).
- **Two unpacked formats.** `pac solution unpack` writes the XML format by default (`Other/Solution.xml`). Dataverse Git integration and `pac solution clone`/`sync` (PAC CLI 2.4.1 and later) write the newer **YAML source control format**: `solutions/<name>/solution.yml` and `solutioncomponents.yml`, `publishers/`, and component folders at the root, shared by every solution in the folder ([YAML format reference](https://learn.microsoft.com/power-platform/alm/solution-source-control-yaml-format)). Its component table doesn't list Power Pages components, so how they're stored in it isn't documented. Learn also contradicts itself: the Git integration FAQ says `clone` and `sync` don't support the YAML format yet. A real sample settles it.
- **Git integration and code sites.** Git integration isn't supported for code sites ([Create code sites](https://learn.microsoft.com/power-pages/configure/create-code-sites)). A classic site on the enhanced data model can be committed by it.
- **Environment variables.** On the enhanced data model a site setting can take its value from an environment variable instead of its own value ([Environment variables for site settings](https://learn.microsoft.com/power-pages/configure/environment-variables-for-site-settings)). In the YAML format, definitions are XML files under `environmentvariabledefinitions/`, and values are in `environment_variable_values.json`. Learn warns that values are exported with the solution, so teams often keep them out of it. How a site setting component points at its variable isn't documented; spike 0's site had none.

## Design rules

- **Same model, same results.** A site read from a solution is the same `Site` as one read from a download of the same environment: same GUIDs, names, fields and inactive records. Rules, policies, docs and diffs don't know which adapter read it. Where the two can differ (inline text, `websiteid`, line endings), the adapter makes them the same.
- **The solution is what deploys.** pageslens reads what's in the solution, not what's in the environment. A component left out of the solution isn't in the model. Finding what's missing is `align`'s job (0008).
- **Read through a file source** (AGENTS.md), so `diff` works on solutions in git commits as it does on downloads.
- **Unknown isn't an error.** A component type pageslens doesn't model is kept as an untyped record, the way the download adapters keep kinds they don't type.
- **Findings point at a file a reviewer can open**, with the GUID on a line SARIF can use.

## Design

### Finding the solution

`path` (for every command) may now be an unpacked solution:

- **XML format:** a folder with `Other/Solution.xml`, or a folder with one `src/` that has it (a `pac solution init` project).
- **YAML format:** a folder with `solutions/<name>/solution.yml` (question 1).

The download layouts keep their detection (`.powerpages-site/` or `website.yml`), and the solution is checked after them. A folder that is neither gets the current error, which now also names the solution layouts.

### Which site

A solution can hold more than one site, and a YAML folder more than one solution. With one site, pageslens reads it. With several, `--site <name or id>` picks one, and without it the command stops with exit code 2 and lists the sites (question 2). A component belongs to the site its `powerpagesiteid` names.

### Reading components

For each `powerpagecomponents/<guid>/powerpagecomponent.xml` of the chosen site:

- **Kind** from `powerpagecomponenttype`, using the kinds the downloads already use (9 → `sitesetting`, 18 → `tablepermission`, 10 → `webpagerule`, ...). A type with no download kind yet gets `component-<number>` and stays untyped.
- **Id** from the folder name and `powerpagecomponentid`. A mismatch is a problem, reported with every other problem, as in the download adapters.
- **Name** from the `name` element. **State** from `statecode`, so inactive components are left out as they are today.
- **Fields** from the `content` JSON, keys as they are (they're already the model's keys), minus `websiteid`. Invalid JSON is a problem in that file.
- **Text fields** that a download writes as side files (`source`, `copy`, `summary`, `value`, ...) go into the record's `text` with newlines normalised, so a solution and a download of the same site give the same record (question 4).
- **Web file content** from `filecontent/`, as the download adapters set `contentFile`.

The website comes from `Assets/powerpagesites.xml`, which also gives the list of sites for `--site`. Site languages from `Assets/powerpagesitelanguages.xml`.

Files the adapter doesn't read (the solution manifest, entities, flows, other component folders) aren't reported as unrecognized: a solution holds far more than a site.

### Code site or classic site

`Site.layout` says two things today: which layout was read, and whether page access rules decide who sees a page (classic) or the browser routes pages (code). A solution can hold either kind of site, so the two have to be told apart. A site setting `CodeSite/Enabled = true` marks a code site (EcoFlux has it); without it, the site is read as classic (question 3).

In code, `layout` stays for the site kind (`code` | `classic`), so the page rules, `pages.md`, page statements and page diffs don't change. A new `format` field (`code-download` | `classic-download` | `solution-xml` | `solution-yaml`) says what was read, for messages and the `diff` header.

### Environment variables

A site setting backed by an environment variable has no value of its own in the solution. pageslens reads it as having the variable's value in the solution: the current value if the solution has one, or else the definition's default. It's shown as coming from that variable: `docs` names it, a `test` failure says "from environment variable X", and `diff` reports a change to the variable's value as a change to the setting (question 5). With no value at all, the setting is treated as not set, and `docs` says so. What Power Pages does then is part of verification 3.

Per-stage values (a deployment settings file) are out of scope here; `align` or a later `--settings` option can take them.

### Commands

- `lint`, `test`, `docs`: unchanged, on the model. Messages name records as today. Findings point at `powerpagecomponents/<guid>/powerpagecomponent.xml`, on the line with the GUID.
- `docs`: the header says the site was read from a solution and names it (unique name and version from the manifest).
- `diff`: both sides can be solutions in git commits, the main use. A solution on one side and a download on the other is allowed and matched by GUID, with the existing note that the sides were read differently (question 6).
- The GitHub Action: no change; `path` can point at a solution folder.

### Dependencies

Node has no XML parser. The files read are small and regular (`powerpagecomponent.xml`, `powerpagesites.xml`, `Solution.xml`, environment variable definitions), but `content` is escaped text inside an element, so entities and CDATA have to be handled correctly. Recommended: add `fast-xml-parser` (no dependencies of its own, widely used), rather than hand-writing a parser (question 7).

## Fixtures

- `test/fixtures/solution-ecoflux/`: the EcoFlux solution, unpacked in the XML format, from the same environment as `ecoflux/`. Read-only like `ecoflux/`. Tests check that it gives the same model, lint findings, docs and policy results as `ecoflux/`.
- `test/fixtures/solution-registration/`: the Registration site in a solution, for a classic site with page rules, and the same check against `registration/`.
- `test/fixtures/solution-broken/`: hand-written, small: two sites, a site setting backed by an environment variable (with and without a value), an inactive component, an unknown component type, a component whose folder name and id differ, invalid `content` JSON.
- A YAML-format copy of one of the real ones, if question 1 brings YAML in.
- `test/fixtures/diff/solution/{base,head}`: a solution-to-solution case, and one solution-to-download case.

The real copies leave out anything that names the environment, as `ecoflux/` and `registration/` do.

## Open questions for Oleksandr

1. **Formats.** Read the XML format only in 0.8.0, or the YAML source control format too? Recommended: decide from a sample. Run `pac solution clone` (PAC CLI 2.4.1 or later) on the EcoFlux solution, and commit a classic site's solution with Git integration if you have it set up. If Power Pages components keep their `powerpagecomponents/<guid>/` folders in the YAML format, both formats share the component reader and only the manifest differs, so do both. If they're stored differently, ship XML first and YAML in a later release.
2. **Several sites.** `--site <name or id>`, with an error that lists the sites when a solution has more than one and none is given? Recommended: yes. Picking the first one silently would check the wrong site.
3. **Code site or classic.** Tell them apart by `CodeSite/Enabled = true`? Recommended: yes, and check a classic site's solution to confirm it has no such setting, or `false`. If something more reliable shows up in the solution (a site field), use that.
4. **Inline text.** Move inline text fields into the record's `text`, so solution and download records are the same? Recommended: yes. Nothing reads them today, but `align` compares them, and a model that differs by adapter would make every rule that reads them later need two code paths.
5. **Environment variables.** Read a variable-backed setting as the solution's value (current, else default), named as coming from the variable? Recommended: yes. Reading it as not set would make `webapi-no-permission` and the Web API surface wrong for any site that uses variables for `Webapi/<table>/enabled`, and the value in the solution is what a stage gets unless its deployment settings say otherwise.
6. **Mixed `diff`.** Allow a solution on one side and a download on the other? Recommended: yes, with the note. GUIDs match, so it works, and it's a quick look at drift before `align` exists. It's noisy when the solution is missing components, which is what `align` will explain.
7. **XML parser.** Add `fast-xml-parser` as a fourth dependency? Recommended: yes. A hand-written parser for escaped JSON inside XML is the kind of code that breaks on the one site with a `]]>` in a snippet.
8. **Fixtures.** Can you provide the EcoFlux and Registration solutions, unpacked, from the environments the download fixtures came from? Recommended: yes, both, unpacked with `pac solution unpack --packagetype Unmanaged`. Without real copies the adapter is tested only against what we expect the format to be.

## Verification owed (needs a sample or an environment)

1. The YAML source control format: what a Power Pages component looks like in it, from `pac solution clone` and from Git integration (question 1).
2. A classic site in a solution: `CodeSite/Enabled` (question 3), and the component types spike 0 didn't have (forms, lists, column permissions, Server Logic), to check that `content` keeps the download's keys for them too.
3. A site setting backed by an environment variable: how the component points at it, and where the definition and value are in each format (question 5).
4. `pac solution unpack --packagetype Both`: whether components are written once or twice (managed and unmanaged).
5. A solution with two sites: how `powerpagesites.xml` lists them.
6. Carried over from spike 0: whether `pac solution sync` writes stable output between runs, so `diff` and pull request diffs stay quiet.

## Sources

- [spike-0-findings.md](research/spike-0-findings.md): the XML format, read offline, matched by GUID.
- [alm-story.md](research/alm-story.md): the solution track, the two-snapshot process and `align`.
- [Site Component (powerpagecomponent) table reference](https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/powerpagecomponent): component type values.
- [Solution YAML source control format reference](https://learn.microsoft.com/power-platform/alm/solution-source-control-yaml-format) and [pac solution](https://learn.microsoft.com/power-platform/developer/cli/reference/solution): the two unpacked formats.
- [Git integration FAQ](https://learn.microsoft.com/power-platform/alm/git-integration/faqs): `clone` and `sync` and the YAML format.
- [Create code sites](https://learn.microsoft.com/power-pages/configure/create-code-sites): no Git integration for code sites.
- [Environment variables for site settings](https://learn.microsoft.com/power-pages/configure/environment-variables-for-site-settings).
