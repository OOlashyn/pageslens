# ALM story for the Power Pages checker (`pageslens`)

Researched 2026-10-23 from Microsoft Learn, Microsoft's power-platform-skills repo (main that day), and community posts. Companion to [mvp-spec.md](mvp-spec.md).

## What Microsoft's docs say

Two ALM tracks are documented, and Learn never explains how they relate.

**Track 1: solutions (the one Microsoft pushes).**

- [Use solutions with Power Pages](https://learn.microsoft.com/en-us/power-pages/configure/power-pages-solutions) (updated 2026-01-29): enhanced data model only. Add the site with _Add existing > Site_; choose all objects or pick site components. **New site components are not added automatically**, and the Dataverse tables the site uses have to be added by hand. Import, reactivate the site the first time (or bind the website record in the admin center), restart. **Don't edit site configuration in the target environment**, because it creates an unmanaged layer that blocks later updates.
- [Pipelines with Power Pages](https://learn.microsoft.com/en-us/power-pages/configure/power-pages-pipelines) (updated 2023-10-04): enhanced data model sites in every environment, deploy from the solution's Pipelines pane, then clear the cache on the target.
- [Environment variables for site settings](https://learn.microsoft.com/en-us/power-pages/configure/environment-variables-for-site-settings): per-stage values for site settings, the solution-track replacement for deployment profiles.
- [PAC CLI solution support](https://learn.microsoft.com/en-us/power-pages/configure/power-platform-cli-solution-management) (updated 2024-10-03, preview): `pac solution init`, `add-solution-component` with the site component type, `sync` / `export`. Nothing about source control.
- Microsoft's own agent skills follow this track: `plan-alm` → `setup-solution` (re-run in "sync mode" to adopt components added since) → `setup-pipeline`/`deploy-pipeline` or `export-solution`/`import-solution`. Site settings are sorted into "keep", "env variable" and "secret" buckets. The dev environment is where authoring happens; the solution is how changes move.

**Track 2: `pac pages download` / `upload`.**

- [Power Pages ALM overview](https://learn.microsoft.com/en-us/power-pages/configure/portals-alm) (updated 2024-02-17): download the site metadata, commit it to source control, upload it to other environments with deployment profiles, via Azure DevOps or GitHub Actions. Works for the standard and the enhanced data model, and for code sites (`download-code-site`/`upload-code-site`).
- Current PAC writes both classic and code sites to a `.powerpages-site/` folder of readable YAML (per Microsoft's skills).

**The gap between them.** A solution exported and unpacked (`pac solution unpack`/`clone`) stores site components **by GUID in `powerpagecomponents/`**, which you can't review in a diff. A 2024 idea on [powerplatform-build-tools #821](https://github.com/microsoft/powerplatform-build-tools/discussions/821) asks for the solution to unpack into the same readable layout as `pac pages download`. It has no reply. The [solution YAML source control format](https://learn.microsoft.com/en-us/power-platform/alm/solution-source-control-yaml-format) (used by Dataverse Git integration, updated 2026-04-10) doesn't list Power Pages components at all. So teams that follow Microsoft's track end up with source control they can't read, and teams that use Track 2 are off the path Microsoft is investing in.

## Where the CLI fits

This turns into the tool's main reason to exist: **read any of the three formats, turn them into one readable model, and check it.**

```
                 ┌── .powerpages-site/ (pac pages download, classic or code site)
 input adapters ─┼── unpacked solution folder (powerpagecomponents/<guid>/…)
                 └── solution .zip (unpacked in memory)
                          │
                    one site model
                          │
        lint · test (policy) · docs · diff · alm checks
```

New: **ALM checks** that only make sense on the solution track and that nobody runs offline today:

- `solution-missing-component`: a component that exists in the site (from a `pac pages download` of dev) but isn't in the solution. This is the "new components aren't added automatically" trap. Microsoft's `setup-solution` sync mode finds it live through an agent; this does it in CI from two folders.
- `solution-missing-table`: a table used by a permission, form, list or Web API setting that isn't in the solution (or a dependency solution the config names).
- `site-setting-should-be-env-var`: auth or credential-style site settings with a hardcoded value in the solution (same buckets as Microsoft's classifier, but as a lint rule).
- `permission-role-not-in-solution`: a table permission whose web role is missing from the solution.
- `managed-target-drift`: compare a `pac pages download` of test or prod with the solution to show unmanaged edits in the target. This is the "don't edit in the target" rule from Learn, made visible.

## The dev process (enterprise: solutions deployed by GitHub Actions or Azure DevOps)

Agreed direction (Oleksandr, 2026-10-23): commit **both** snapshots. The readable `pac pages download` is for visibility and traceability. The unpacked solution from `pac solution sync` is what gets deployed. The CLI checks that the two agree.

### Repo layout

```
site/                     # readable snapshot, review only
  .powerpages-site/       #   classic: pac pages download --modelVersion 2
                          #   code site: the SPA project; .powerpages-site/ from download-code-site
solution/                 # pac solution clone (first time) / sync, the deployable source
deployment-settings/      # test.json, prod.json: env variable and connection reference values
pageslens.policy.yaml
.github/workflows/        # capture.yml, pr.yml, release.yml
```

For a code site, the SPA source in `site/src/` is the real source. Its built output reaches dev with `upload-code-site` and the solution from there.

### The loop

1. **Build in dev.** Classic: studio, or local edits pushed with `pac pages upload` to **dev only**. Code site: local dev, then `pac pages upload-code-site` to dev. Add new components to the solution in dev (maker portal, Microsoft's `setup-solution` sync mode, or `pac solution add-solution-component`).
2. **Capture** (`capture.yml`, manual trigger, or a script for local use). In **one job**, against the same environment, one after the other:
   - `pac pages download` / `download-code-site` → `site/`
   - `pac solution sync` → `solution/`
   - `pageslens docs` → `docs/site/`

   Commit everything to a feature branch and open a PR. Taking both snapshots in one run matters: two snapshots taken minutes apart can disagree for reasons that aren't real problems.

3. **PR checks** (`pr.yml`, no Dataverse connection needed):
   - `pageslens align site/ solution/`: are the two snapshots the same site? (see below)
   - `pageslens lint` and `pageslens test` on the model.
   - `pageslens diff origin/main HEAD`: the access summary as a PR comment ("Authenticated Users gained write on contact, global scope"). Reviewers read the plain git diff of `site/` for content, and the summary for security.
   - Fail the PR on `align` errors and lint errors; warnings go in the comment.
4. **Release** (`release.yml`, on merge or tag): `pac solution pack --packagetype Managed` from `solution/` → artifact → `pac solution import --settings-file deployment-settings/<stage>.json` per environment, with GitHub environments or DevOps approvals between stages. Then restart the site or clear its cache (`pac power-pages restart-website`, see the GitHub Actions 2026 outline).
5. **After deploy (optional):** `pac pages download` from the target, then `pageslens align --target` against `solution/` to catch edits made directly in test or prod (the unmanaged layer Learn warns about).

**Rule:** `site/` is never uploaded to test or prod. It's evidence for reviewers. Everything that reaches test or prod goes through the solution.

### What `pageslens align` reports

Both formats should carry the record GUID: the download's YAML has an `id` per record, and the solution names each `powerpagecomponents/` folder by GUID (to verify, spike 0). That makes matching exact rather than by name.

| Finding                                                                  | Meaning                                                                                                                                    | Severity |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| In `site/`, not in `solution/`                                           | Added in dev, never added to the solution. The "new components aren't added automatically" trap. It works in dev, then is missing in test. | error    |
| In `solution/`, not in `site/`                                           | Deleted in dev but still shipped, or the solution belongs to another site.                                                                 | warning  |
| In both, content differs                                                 | The snapshots were taken at different times, or the solution layer differs from the live record.                                           | error    |
| Table, web role or env variable used by the site but not in the solution | Import fails or permissions break in the target.                                                                                           | error    |
| Site setting with a hardcoded secret-like value in the solution          | Should be an environment variable (Secret type).                                                                                           | error    |
| Site setting that differs per stage but has no env variable              | The value from dev will reach prod.                                                                                                        | warning  |

Output: text for people, JSON for agents, a Markdown block for the PR comment, SARIF for code scanning.

### Where agent skills help

- **capture**: run the capture steps locally when there's no CI yet, then explain what `align` found ("you created web page X in dev; add it to the solution with ...").
- **fix-alignment**: for each `align` error, propose the `pac solution add-solution-component` command or the solution change, and never touch test or prod.

**Teams still on Track 2** (standard data model, or `pac pages upload` with deployment profiles) point the CLI at `.powerpages-site/` and get lint, test, docs and diff without `align`.

## Bigger teams: several developers on one site

The single-capture loop above assumes one person changes dev at a time. With several developers on a shared dev environment, `pac pages download` and `pac solution sync` pick up everyone's half-finished work, and the PR mixes features (Oleksandr, 2026-10-23). A solution or an environment per developer doesn't solve it well either, especially for code sites: `upload-code-site` replaces the site's whole compiled output, so features can't be split into separate solutions, and per-developer environments cost setup (auth, integrations) for every person (Oleksandr, 2026-10-23).

### Recommended: git first, and only CI writes to the integration environment

Turn the direction around. Developers don't build in Dataverse and capture back; they change **files in git**, and CI is the only thing that writes to the shared environment. This follows the ALM principle Learn states: source control is "the single source of truth" and managed solutions "should be generated by a build server" ([ALM basics](https://learn.microsoft.com/en-us/power-platform/alm/basics-alm)).

```
 dev branch ──PR──► main ──CI──► integration env ──CI──► solution/ (bot commit) ──► managed build ──► test ──► prod
  (files)    lint, test,      pac pages upload /    add new components,
             diff, align      upload-code-site      pac solution sync
```

1. **Author in files.** Code site: SPA source plus the `.powerpages-site/` YAML (web roles, table permissions, site settings, Server Logic). Microsoft's own skills already work this way: `create-webroles` and `audit-permissions` read and write `.powerpages-site/` locally. Classic site: the `pac pages download` folder (web templates, pages, snippets, Liquid, JS, CSS are files; Eyedeas-style skills can edit YAML records too). Normal branches, PRs and git merges, no per-developer solution.
2. **PR checks**, no environment needed: `lint`, `test`, `diff` on `.powerpages-site/`.
3. **Merge to `main` → CI deploys to the integration environment**: build the SPA, then `pac pages upload-code-site` or `pac pages upload`. Nobody edits that environment by hand; it always equals `main`.
4. **CI completes the solution**: `pageslens align --fix` compares the site with the solution and adds what's missing (the "new components aren't added automatically" trap) via `pac solution add-solution-component`, then `pac solution sync` → `solution/`, committed by a bot. Because the environment only ever holds `main`, nothing half-finished can be captured.
5. **Release**: pack the managed solution from `solution/` and import it per stage with the deployment settings file, as in the single-team loop.
6. **Drift**: `align --target` on the integration environment after each deploy catches studio edits someone made anyway, and the same check on test or prod catches unmanaged layers.

**Why not upload a code site straight to every environment?** (checked 2026-10-23) `pac pages upload-code-site` takes only `--rootPath`, `--compiledPath` and `--siteName`: no `--deploymentProfile` and no `--environment`, unlike `pac pages upload` ([PAC CLI pages reference](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/pages), updated 2026-04-02). You could switch auth profiles per environment, but there is no supported way to give site settings different values per stage, and every upload would leave an unmanaged layer in test and prod. So for code sites, direct upload goes to the integration environment only. Test and prod get the managed solution, with per-stage values from [environment variables for site settings](https://learn.microsoft.com/en-us/power-pages/configure/environment-variables-for-site-settings) in the deployment settings file. `lint` should flag a site setting that has to differ per stage but isn't backed by an environment variable. (A home-made per-stage override of the YAML before upload is possible, but it's off Microsoft's path; not planned.)

**Testing before merge**, without a personal environment:

- Code sites: local dev server. Calls to `/_api`, Server Logic and flows need mocks or a proxy to a shared dev environment, read-only. A local dev server for Power Pages code sites is a separate idea; the two would connect here.
- Optional **preview environment** per PR for larger changes: seed a short-lived environment from `main`'s unmanaged solution and upload the branch. Opt-in, not required for every developer.

**Where this is weaker:** classic sites built mostly in the studio by makers who won't edit files. For them, the studio edits happen in a dedicated "maker" dev environment and are captured with `pageslens capture` into a PR, as in the single-team loop, owned by one person or merged carefully. State this honestly in the README.

### What this changes in the CLI

- `align --fix`: print or run the `pac solution add-solution-component` calls for components (and tables, web roles, env variables) missing from the solution.
- `align --target`: drift on the integration environment, not only on test and prod.
- `capture` stays for maker-led classic sites; `seed` is only for optional preview environments.
- Dropped: feature-solution filtering and `align --team`.

### Possible simplification, depending on spike 0

If the CLI can turn `powerpagecomponents/<guid>` into the readable `.powerpages-site` layout by itself (what powerplatform-build-tools #821 asked Microsoft for), the bot no longer has to commit `solution/` next to `site/`: one is generated from the other, and `align` is needed only for drift.

## Open points to verify (adds to the spikes in mvp-spec.md)

1. **[Answered 2026-10-23, see spike-0-findings.md: readable XML + JSON, all data present.]** What's inside `powerpagecomponents/<guid>/` after `pac solution unpack` / `clone`: an XML or YAML record with `powerpagecomponenttype` and the `content` JSON? Is the component name there? Can every type (web role, table permission, site setting, page, web template, Server Logic) be read without Dataverse? **This decides whether the solution adapter is feasible; do it first.**
2. Whether Dataverse Git integration supports site components, and in what format.
3. Whether Power Platform Pipelines extensions (pre-deployment step / gated approvals) can call an external CI check, so `pageslens` can block a pipeline deployment, not only a PR.
4. Whether `pac solution sync` round-trips cleanly (no GUID-order noise in diffs), since the PR diff depends on it.
5. **[Answered: yes, 141/141 on EcoFlux.]** Whether `pac pages download` YAML ids equal the `powerpagecomponents/` folder GUIDs, so `align` can match exactly.
6. Whether a code site's compiled assets in the solution can be compared with `site/` at all, or `align` should skip web files for code sites.
7. Does `pac pages upload` / `upload-code-site` keep the record GUIDs from the YAML when it creates new components? `align --fix` and the matching depend on it.
   7b. Seeding a short-lived preview environment from an unmanaged solution: reactivation vs website record binding, how long it takes, and whether `pac power-pages` can script it.
8. **[Answered: yes, feasible from the data.]** Can a solution-only `site/` view be generated from `powerpagecomponents/` (the simplification above)?
