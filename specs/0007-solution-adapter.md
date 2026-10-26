# 0007: Solution adapter

**Status:** draft 2, decisions recorded (see "Decisions"); ready to build. Goes out in 0.8.0 with the `webapi-inner-errors` rule and the unused ignore entries.

pageslens reads two download layouts today: a code site's `.powerpages-site/` and a classic site folder. Teams on the solution track keep neither in git. They keep the unpacked solution that gets packed and deployed, where every site component is a folder named by its GUID ([alm-story.md](research/alm-story.md), "The gap between them"). This spec adds a third adapter that reads an unpacked solution into the same model, so `lint`, `test`, `docs` and `diff` work on it unchanged.

It's the first half of M3. `align` (whether a site download and a solution are the same site) builds on it and gets its own spec (0008). Solution `.zip` files are out of scope (roadmap, Later): a `.zip` is one `pac solution unpack` away. So is the YAML source control format, for now (decision 1).

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
- **Two unpacked formats.** `pac solution unpack` writes the XML format (`Other/Solution.xml`). Learn says Dataverse Git integration, and `pac solution clone` and `sync` from PAC CLI 2.4.1, write a newer **YAML source control format**: `solutions/<name>/solution.yml`, `publishers/`, and component folders at the root ([YAML format reference](https://learn.microsoft.com/power-platform/alm/solution-source-control-yaml-format)). It doesn't say how Power Pages components are stored in it, and the Git integration FAQ says `clone` and `sync` don't support it yet.
- **Git integration and code sites.** Git integration isn't supported for code sites ([Create code sites](https://learn.microsoft.com/power-pages/configure/create-code-sites)). A classic site on the enhanced data model can be committed by it.
- **Environment variables.** On the enhanced data model a site setting can take its value from an environment variable instead of its own value ([Environment variables for site settings](https://learn.microsoft.com/power-pages/configure/environment-variables-for-site-settings)). Learn warns that values are exported with the solution, so teams often keep them out of it. How a site setting component points at its variable isn't documented.

### Samples (2026-10-25)

Oleksandr exported two solutions, and they were compared offline with a throwaway script, as in spike 0:

- **PagesLensEDM2**, a classic Registration site on the enhanced data model: `pac solution unpack` and `pac solution clone`, with a `pac pages download` of the same site.
- **EcoFlux**, the code site: `pac solution clone`.

Results:

- **`clone` writes the XML format too**: a `pac solution init` project (`<name>.cdsproj`, `src/Other/Solution.xml`). Getting the YAML format out of `pac` didn't work.
- **`clone` and `unpack` give the same components.** The two PagesLensEDM2 folders differ only in `Solution.xml` (`<Managed>2</Managed>` from `clone`, `0` from `unpack`). Components are written once.
- **PagesLensEDM2 matches its download by GUID: 475 of 475 components**, plus the website and the site language in `Assets/`. Every `statecode` matches, 17 components are inactive on both sides, and all 255 inline text fields equal the download's side files byte for byte (template `source`, page `copy`, `summary`, `customcss` and `customjavascript`, snippet `value`, form and list `registerstartupscript`).
- **The `content` keys are the classic download's keys without `adx_`.** Relationship lists keep their prefixed names, as in a download. A table permission's name is its `name` element, where the classic download has `adx_entityname`.
- **What the download leaves out or rewrites:**
  - A page access rule's publishing states (`adx_accesscontrolrule_publishingstate`) are in the solution: "Restrict Read on Create Course" lists one. The download leaves them out, which is why spec 0005 applies every rule in every state.
  - `displaypagevalidation: false` on web links is in the solution and not in the download.
  - JSON-valued fields on forms and lists (`settings`, `views`, localized labels) are compact JSON with `$type` in the solution, and pretty-printed with `Type` in the download. The model doesn't read them; `align` will have to compare them as JSON.
- **Types in the classic site:** 1 to 13, 15, 16, 17, 18, 24, 26 and 27. Still unseen: advanced forms, column permissions, Server Logic, cloud flows.
- **Code site or classic.** EcoFlux has `CodeSite/Enabled = true`. PagesLensEDM2 has no `CodeSite/Enabled` setting.
- **`websiteid` in `content`** is on every EcoFlux component and on none of PagesLensEDM2's.
- **`source` on site settings.** EcoFlux's `CodeSite/Enabled` has `"source": 0` in the solution and `source: 0` in its download: the setting's own value.
- **A setting backed by an environment variable.** Oleksandr then created the variable `dwcrm_CardsPerPage` in PagesLensEDM2, pointed `ASP/Pagination/CardsPerPage` at it, and ran `pac solution sync` into the `clone` folder:
  - The setting's `content` became `{"value": "18", "source": 1, "envvar_schema": "dwcrm_CardsPerPage"}`. `source: 1` means the value comes from the variable named by `envvar_schema`. The setting keeps its own old `value`.
  - The variable is `environmentvariabledefinitions/dwcrm_CardsPerPage/environmentvariabledefinition.xml` (`schemaname`, `defaultvalue` 18, `type` 100000001, `secretstore` 0), with its current value, 20, in `environmentvariablevalues.json` next to it.
  - `Solution.xml` doesn't list the variable, as it doesn't list site components: the folder being there is what puts it in the solution.
  - Nothing else changed: the sync rewrote only that setting and added the variable's folder. Some components' `content` is pretty-printed JSON (21 of 475) and the rest compact, before and after, so the adapter parses it and never compares it as text.
- **What a public fixture must leave out:** `primarydomainname` in `Assets/powerpagesites.xml` (the site's host name) and the publisher's e-mail address in `Other/Solution.xml`.

## Design rules

- **Same model, same results.** A site read from a solution is the same `Site` as one read from a download of the same environment: same GUIDs, names, fields and inactive records. Rules, policies, docs and diffs don't know which adapter read it. Where the two can differ (inline text, `websiteid`, line endings), the adapter makes them the same.
- **The solution is what deploys.** pageslens reads what's in the solution, not what's in the environment. A component left out of the solution isn't in the model. Finding what's missing is `align`'s job (0008).
- **Read through a file source** (AGENTS.md), so `diff` works on solutions in git commits as it does on downloads.
- **Unknown isn't an error.** A component type pageslens doesn't model is kept as an untyped record, the way the download adapters keep kinds they don't type.
- **Findings point at a file a reviewer can open**, with the GUID on a line SARIF can use.

## Design

### Finding the solution

`path` (for every command) may now be an unpacked solution in the XML format: a folder with `Other/Solution.xml`, or a `pac solution init` project, whose `src/` has it (what `pac solution clone` writes).

The download layouts keep their detection (`.powerpages-site/` or `website.yml`), and the solution is checked after them. A folder that is none of these gets the current error, which now also names the solution layout. A folder with `solutions/*/solution.yml` (the YAML format) gets an error that says the format isn't read yet.

### One site

A solution can hold more than one site. pageslens reads a solution with exactly one site in `Assets/powerpagesites.xml`. With several, the command stops with exit code 2 and says so, naming the sites (decision 2). A component of another site (by `powerpagesiteid`) is a problem, since it can only be there with that site.

### Reading components

For each `powerpagecomponents/<guid>/powerpagecomponent.xml`:

- **Kind** from `powerpagecomponenttype`, using the kinds the downloads already use (9 → `sitesetting`, 18 → `tablepermission`, 10 → `webpagerule`, ...). A type with no download kind yet gets `component-<number>` and stays untyped.
- **Id** from the folder name and `powerpagecomponentid`. A mismatch is a problem, reported with every other problem, as in the download adapters.
- **Name** from the `name` element. **State** from `statecode`, so inactive components are left out as they are today.
- **Fields** from the `content` JSON, keys as they are (they're already the model's keys), minus `websiteid`. Invalid JSON is a problem in that file.
- **Text fields** that a download writes as side files go into the record's `text` with newlines normalised, so a solution and a download of the same site give the same record (decision 4). The fields are the ones seen above: `source`, `copy`, `summary`, `customcss`, `customjavascript`, `value`, `registerstartupscript`.
- **Web file content** from `filecontent/`, as the download adapters set `contentFile`.

The website comes from `Assets/powerpagesites.xml`, and site languages from `Assets/powerpagesitelanguages.xml`.

Files the adapter doesn't read (the solution manifest, `Entities/`, the `dv*` search folders, other component folders) aren't reported as unrecognized: a solution holds far more than a site.

### Code site or classic site

`Site.layout` says two things today: which layout was read, and whether page access rules decide who sees a page (classic) or the browser routes pages (code). A solution can hold either kind of site, so the two have to be told apart. A site setting `CodeSite/Enabled = true` marks a code site; without it, the site is read as classic (decision 3).

In code, `layout` stays for the site kind (`code` | `classic`), so the page rules, `pages.md`, page statements and page diffs don't change. A new `format` field (`code-download` | `classic-download` | `solution`) says what was read, for messages and the `diff` header.

### Publishing states

A page access rule read from a solution has its publishing states. The model keeps them, but effective page access doesn't use them yet: every rule still applies in every state, the same for a solution and a download, so the two give the same results. Using them is a later change to 0005's model, and it needs the semantics checked first.

### Environment variables

A site setting with `source: 1` takes its value from the variable named by `envvar_schema`, not from its own `value`, which is left over from before (decision 5). pageslens reads the variable from `environmentvariabledefinitions/<schema>/`:

- its current value from `environmentvariablevalues.json`, if there is one;
- or else the definition's `defaultvalue`.

That value becomes the setting's value in the model, and the setting records the variable's schema name. `docs` names the variable next to the value, a `test` failure says "from environment variable dwcrm_CardsPerPage", and `diff` reports a change to the variable's value, or a setting switched to or from a variable, as a change to the setting.

When there's no value to read, the setting is treated as not set, and `docs` says why:

- the variable's folder isn't in the solution (`align` will report that as an error: the import needs it);
- the definition has neither a current value nor a default;
- it's a secret (`secretstore` 1, or the Secret type), whose value is in Azure Key Vault, not in the solution.

Per-stage values (a deployment settings file) are out of scope here; `align` or a later `--settings` option can take them.

### Commands

- `lint`, `test`, `docs`: unchanged, on the model. Messages name records as today. Findings point at `powerpagecomponents/<guid>/powerpagecomponent.xml`, on the line with the GUID.
- `docs`: the header says the site was read from a solution and names it (unique name and version from the manifest).
- `diff`: both sides can be solutions in git commits, the main use. A solution on one side and a download on the other is allowed and matched by GUID, with the existing note that the sides were read differently (decision 6).
- The GitHub Action: no change; `path` can point at a solution folder.

### Dependencies

`fast-xml-parser` (no dependencies of its own) reads the XML files (decision 7).

## Fixtures

Copies of real sites are read-only, like `ecoflux/` and `registration/`. Each leaves out `primarydomainname` and the publisher's e-mail address, and nothing else.

- `test/fixtures/solution-ecoflux/`: the EcoFlux `clone` project (`EcoFluxPortal.cdsproj`, `src/`), from the same environment as `ecoflux/`. Tests check that it gives the same model, lint findings, docs and policy results as `ecoflux/`, and that a `pac solution init` project is found through `src/`.
- `test/fixtures/solution-pageslensedm2/`: the PagesLensEDM2 `clone` project after the sync, a classic site with page rules, forms, lists and the `dwcrm_CardsPerPage` variable. The download predates the variable, so the comparison with it leaves that one setting out, until the site is downloaded again (verification 2).
- `test/fixtures/pageslensedm2/`: the `pac pages download` of the same site, without `.portalconfig/`, so the classic site gets the same check against its solution. `registration/` is a different site and can't be used for that.
- `test/fixtures/solution-broken/`: hand-written, small: two sites, a component of another site, an inactive component, an unknown component type, a component whose folder name and id differ, invalid `content` JSON, and variable-backed settings whose variable is missing, has only a default, has no value, or is a secret.
- `test/fixtures/diff/solution/{base,head}`: a solution-to-solution case, and one solution-to-download case.

## Decisions (Oleksandr, 2026-10-25)

1. **XML format only.** Getting the YAML format out of `pac` didn't work. The YAML format is logged to investigate later (roadmap, Later).
2. **One site per solution for now.** A solution with several sites is an error that names them. No `--site` option yet.
3. Code sites are told apart by `CodeSite/Enabled = true`, as recommended. The samples agree: EcoFlux has it, PagesLensEDM2 doesn't.
4. Inline text goes into the record's `text`, as recommended.
5. A variable-backed setting is read as the solution's value (current, else default) and named as coming from the variable, as recommended.
6. `diff` allows a solution on one side and a download on the other, with the note, as recommended.
7. `fast-xml-parser` is added as a dependency, as recommended.
8. Fixtures from the samples above. No standard `unpack` of EcoFlux is needed: PagesLensEDM2 shows that `clone` and `unpack` give the same components.

## Open questions for Oleksandr (answered, see Decisions)

1. **Formats.** Read the XML format only in 0.8.0, or the YAML source control format too? Recommended: decide from a sample. If Power Pages components keep their `powerpagecomponents/<guid>/` folders in the YAML format, both formats share the component reader, so do both. If they're stored differently, ship XML first and YAML in a later release.
2. **Several sites.** `--site <name or id>`, with an error that lists the sites when a solution has more than one and none is given? Recommended: yes. Picking the first one silently would check the wrong site.
3. **Code site or classic.** Tell them apart by `CodeSite/Enabled = true`? Recommended: yes, and check a classic site's solution to confirm it has no such setting, or `false`.
4. **Inline text.** Move inline text fields into the record's `text`, so solution and download records are the same? Recommended: yes. Nothing reads them today, but `align` compares them, and a model that differs by adapter would make every rule that reads them later need two code paths.
5. **Environment variables.** Read a variable-backed setting as the solution's value (current, else default), named as coming from the variable? Recommended: yes. Reading it as not set would make `webapi-no-permission` and the Web API surface wrong for any site that uses variables for `Webapi/<table>/enabled`.
6. **Mixed `diff`.** Allow a solution on one side and a download on the other? Recommended: yes, with the note. GUIDs match, so it works, and it's a quick look at drift before `align` exists.
7. **XML parser.** Add `fast-xml-parser` as a fourth dependency? Recommended: yes. A hand-written parser for escaped JSON inside XML is the kind of code that breaks on the one site with a `]]>` in a snippet.
8. **Fixtures.** Can you provide the EcoFlux and Registration solutions, unpacked? Recommended: yes, both. Without real copies the adapter is tested only against what we expect the format to be.

## Verification owed (needs a sample or an environment)

1. **The YAML source control format** (later, decision 1): what a Power Pages component looks like in it, from a `pac` that writes it and from Git integration.
2. **A variable-backed setting at runtime and in a download.** That the site uses the variable's current value (20), not the default (18) or the setting's own leftover `value` (18): set `ASP/Pagination/CardsPerPage` somewhere visible, or read it with Liquid (`{{ settings['ASP/Pagination/CardsPerPage'] }}`). And what `pac pages download` writes for the setting now (`source`, `envvar_schema`, which value), so a download and a solution of the same site give the same model.
3. Advanced forms, column permissions, Server Logic and cloud flows in a solution: that `content` keeps the download's keys for them too. Nothing typed reads them yet, so this doesn't block 0.8.0.

Answered by the samples: whether `--packagetype Both` (what `clone` exports) writes components twice (no); `CodeSite/Enabled` on a classic site (absent); how a setting points at its variable, and where the definition and value are (above); and whether `pac solution sync` writes stable output (yes: one change rewrote only what changed).

## Sources

- [spike-0-findings.md](research/spike-0-findings.md): the XML format, read offline, matched by GUID.
- [alm-story.md](research/alm-story.md): the solution track, the two-snapshot process and `align`.
- [Site Component (powerpagecomponent) table reference](https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/powerpagecomponent): component type values.
- [Solution YAML source control format reference](https://learn.microsoft.com/power-platform/alm/solution-source-control-yaml-format) and [pac solution](https://learn.microsoft.com/power-platform/developer/cli/reference/solution): the two unpacked formats.
- [Git integration FAQ](https://learn.microsoft.com/power-platform/alm/git-integration/faqs): `clone` and `sync` and the YAML format.
- [Create code sites](https://learn.microsoft.com/power-pages/configure/create-code-sites): no Git integration for code sites.
- [Environment variables for site settings](https://learn.microsoft.com/power-pages/configure/environment-variables-for-site-settings).
