# Spike 0: site download vs unpacked solution (EcoFlux)

Run 2026-10-23 on the EcoFlux demo project (a local folder, not in this repo). It holds a code site (`CodeSite/Enabled = true`, enhanced data model 2.0) downloaded to `site/ecoflux/.powerpages-site/`, and the `EcoFluxPortal` solution unpacked to `solution/EcoFluxPortal/src/`. Comparison done with a throwaway Python script (PyYAML + ElementTree), nothing changed in the folder.

## Result: the solution is fully readable offline, and GUIDs match exactly

| Check                                                                                                   | Result                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Site records with an `id` (YAML, excluding `.portalconfig`)                                             | 143                                                                                                                                |
| Components in `powerpagecomponents/`                                                                    | 142 folders, one `powerpagecomponent.xml` each (+ a `.gitkeep`)                                                                    |
| Matched by GUID (YAML `id` = folder name = `powerpagecomponentid`)                                      | **141 of 141 components**                                                                                                          |
| `website.yml` and `site-languages/English`                                                              | Not components: they're in `Assets/powerpagesites.xml` and `Assets/powerpagesitelanguages.xml`, same GUIDs. So 143 of 143 overall. |
| Field values present on both sides                                                                      | **0 differences**                                                                                                                  |
| Liquid/HTML (template `source`, page `copy`/`summary`, snippet `value`) vs the download's `.html` files | 29 equal, 2 differ **only in line endings** (a stray `\r`)                                                                         |
| Web files (`filecontent/` in the solution vs the file in the download)                                  | 8 of 8 byte-identical                                                                                                              |

### What a component XML looks like

```xml
<powerpagecomponent powerpagecomponentid="01cab0c6-...">
  <content>{ "contentsnippetlanguageid": "...", "display_name": "Header/Search/ToolTip",
             "value": "Search", "websiteid": "8f7bf824-..." }</content>
  <name>Header/Search/ToolTip</name>
  <powerpagecomponenttype>7</powerpagecomponenttype>
  <powerpagesiteid><powerpagesiteid>8f7bf824-...</powerpagesiteid></powerpagesiteid>
  <statecode>0</statecode> <statuscode>1</statuscode>
</powerpagecomponent>
```

`content` is JSON with the same keys as the download's YAML, and the Liquid/HTML inline (the download splits it into `.source.html`, `.copy.html` and so on). `name` sits in the XML element, not in `content`. Web files keep their binary in `filecontent/<filename>`.

### Component type numbers seen (`powerpagecomponenttype` → download folder)

1 publishing-states · 2 web-pages · 3 web-files · 4 and 5 weblink-sets (set and link) · 6 page-templates · 7 content-snippets · 8 web-templates · 9 site-settings · 10 webpage-rules · 11 web-roles · 12 website-accesss · 13 sitemarkers · 18 table-permissions · 27 bot-consumers. Not in this site, so still unknown: Server Logic, basic/multistep forms, lists, column permissions, cloud flow bindings.

### Small differences the parser has to handle

- `content` also has `websiteid` on every record; the download leaves it out.
- Web file YAML has annotation metadata (`annotationid`, `filename`, `mimetype`, `isdocument`, `objectid`, `objecttypecode`) that the solution doesn't. The filename can be taken from `filecontent/`.
- Line endings: normalise `\r\n` and lone `\r` before comparing, or `align` reports noise.
- Table permission scope is the raw option value (`756150002`), and roles are a GUID list (`adx_entitypermission_webrole`), the same on both sides. Enough to build the access graph.
- The solution's `Solution.xml` lists only the four custom tables as root components; site components come in through `powerpagecomponents/` and `Assets/`.

## What this means for the design

1. **`align` can match exactly by GUID.** Open point 5 in alm-story.md is answered: yes.
2. **The simplification works.** Everything the download has (except web file annotation metadata) is in the solution, so the CLI can **generate the readable `.powerpages-site` view from `solution/`**. This is what powerplatform-build-tools #821 asked Microsoft for. For the git-first team process, the repo would then need only `solution/` plus the code site source, and `pac pages download` stays for drift checks against an environment.
3. **One parser, two front ends**: YAML (download) and XML+JSON (solution) map to the same records with the same keys, so the model layer is shared.

## Still open

- Does `pac pages upload` / `upload-code-site` keep the YAML GUIDs when it **creates** new components? (Needs a test: add a web role locally, upload to a dev environment, download again.)
- Type numbers for Server Logic, forms, lists and column permissions: need a site that uses them (a classic sample site).
- Does `pac solution sync` produce stable output (ordering, whitespace) between runs, so PR diffs stay quiet?
