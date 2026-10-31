# The Power Pages ALM white paper, compared with pageslens

Read 2026-10-30: "Power Pages application lifecycle management (ALM): recommended approach", a 61-page recommendation guide. It describes a site built this way and reproduces its automation in full: three GitHub Actions workflows, a composite promotion action and the developer scripts. Companion to [alm-story.md](alm-story.md), which reached most of the same conclusions on 2026-10-23.

## What the paper recommends

One idea: source control is the source of truth, and every environment is rebuilt from it. One rule above the rest: build the artifact once on a tag, then install the same bytes in every environment.

- **One commit carries everything.** The site (`.powerpages-site/`) and the unpacked solution live in one repository and move in the same commit, so one pull request is one reviewable change.
- **Environments.** Integration (shared, unmanaged, seeds the baseline), Dev × N (one per developer, unmanaged, never shared, never the default environment), Test and Prod (managed, changed only by the pipeline; Prod behind an approval).
- **Branches.** GitFlow-style: `feature/*` → `develop` → `main`, releases tagged on `main`, `hotfix/*` merged back into `develop`. Developers branch `dev/<alias>/<topic>` from a shared feature branch.
- **Solution boundaries.** One solution per workload released on its own. Split only for a real difference in release cadence, owner, reuse, size or target environments, and measure import time before splitting for size.
- **Repository layout.** `.powerpages-site/` at the root, `solutions/<Name>/src/` (XML format: `Other/`, `Entities/`, `powerpagecomponents/`), one folder per solution in dependency order, then `docs/` and `.github/`. The solution source is generated and never edited by hand.
- **Pull request gates.** Lint, type check, unit and end-to-end tests, a link scan, packing the solution managed and unmanaged, the solution checker, and "bundle drift": the compiled site committed in `powerpagecomponents/<guid>/filecontent/` must match what the source builds. A pre-push hook runs the same drift check.
- **Environment drift.** A nightly job runs `pac solution sync` against Dev and fails on any `git diff`, uploading the patch. Its comment says why: the change gate can't see someone editing site settings, table permissions, web pages or tables in the maker portal.
- **Release.** A tag on `main` builds the managed solution, the site package, a changelog from the merged pull requests and an SBOM. Test gets it automatically, then smoke tests run; Prod gets the same artifact after approval. Rollback is promoting an earlier tag. Promote with upgrade, not update, so removed components are removed.
- **Configuration.** Environment variable and connection reference definitions travel in the solution; values come from `deployment-settings/<target>.json` at import time.
- **Azure DevOps.** Section 10 maps every GitHub piece to Azure Repos and Azure Pipelines. Notes worth keeping: a YAML `pr:` trigger is silently ignored for Azure Repos (use a build validation branch policy), there is no Releases page (add a retention lease to release runs), and Build Tools has no task for `pac pages upload-code-site` (use a script step).

## Facts the paper adds

- **`pac` 2.9.3**, pinned in every job, because an unpinned `pac` "would report drift caused by a CLI serialisation change rather than a real edit". Its `pac solution sync` writes the XML format into `solutions/<Name>/src/`.
- **New site components aren't added to the solution**, even when the site is a member. Its `sync-site-components.mjs` adds them before each sync, from a live environment: it compares the site's `powerpagecomponent` records with the solution's members and runs `pac solution add-solution-component` for each one missing.
- **`pac solution add-solution-component` needs `--componentType powerpagecomponent`.** A comment in that script says `pac` rejects the numeric types (10433, 10434, 10435) for Power Pages components. Its FetchXML still finds the members with `componenttype` 10433.
- **`pac pages upload-code-site` recreates web files.** An upload that changes the bundle deletes the old web file components and creates new ones with new GUIDs and content-hashed names.
- The examples are a single-page application (code site). Classic sites on the enhanced data model are said to skip only the build steps. The standard data model isn't mentioned.

## How pageslens fits

**The paper's gates don't check site security.** They cover code, tests, links, packing, the generic solution checker and the bundle. Nothing reviews table permissions, web roles, the Web API or site settings, which is what `lint`, `test` and `diff` do. Its own line makes the case: "A rule that nothing checks is not a control."

What already works:

- **The layout.** `pageslens lint .` finds `.powerpages-site/` at the root, and `pageslens align . solutions/<Name>` finds `src/Other/Solution.xml`. A base solution with no site components (its `ContosoCore`) doesn't get in the way: pageslens reads the site's solution only.
- **Missing components.** `align` reports `missing-from-solution` from two folders, offline. The paper's script fixes the same problem against a live environment. Both are useful: the script repairs it in Dev, `align` catches it in a pull request.
- **Taking both snapshots together.** The paper's `sync:solution` uploads the site, then pulls the site and the solution back in one command. That's the "one job, one environment" advice in [alm-story.md](alm-story.md). With web file GUIDs changing on every upload, snapshots taken apart can't align.
- **Pull request diffs.** `diff --merge-base` works the same on `feature/*` → `develop` and on the `develop` → `main` release pull request.

Left out on purpose: bundle drift (each build setup differs, and the paper's script does it), the solution checker, smoke tests, upgrade versus update, and the branching model itself.

## What to change

In order of value.

1. **`--settings <deployment-settings file>`.** pageslens marks a setting backed by an environment variable `unknown`, so `test` fails on it and rules skip it. With the target's settings file, `lint`, `test` and `diff` would check what that stage gets, and `align`'s `variable-no-value` could name the file that lacks a value. [0007](../0007-solution-adapter.md) already leaves room for it. Needs a spec, with open questions: the file's shape for secrets (Key Vault references), one file or several per run, and how the Action passes it.
2. **`align --fix` is partly unblocked.** [0008](../0008-align.md) decision 1 waited on the component type numbers per environment. The printed commands can use `--componentType powerpagecomponent` instead. Still open: whether `pac pages upload` keeps GUIDs for classic sites (the paper answers no for a code site's changed web files).
3. **Docs recipes, no code.** Done: [docs/alm.md](../../docs/alm.md).
   - A pageslens step in a `pr-validation.yml` shaped like the paper's, with its layout (`.` and `solutions/<Name>`). Today's examples use `site/` and `solution/`.
   - In the nightly environment drift job: `pageslens diff HEAD solutions/<Name> --format markdown` into the job summary, so the raw patch comes with the access changes in sentences.
   - At release: `pageslens diff v1.3.0 v1.4.0` as an "access changes in this release" section of the release notes, for the approver.
   - Say plainly in `docs/align.md` that both snapshots must come from one run against one environment.
4. **Azure DevOps sooner.** The paper treats it as a full alternative to GitHub. A documented script step (`npx pageslens`, `##vso[task.uploadsummary]` for the markdown diff) is cheap. JUnit output for `test` matters more there (the Tests tab). The template or Marketplace task can stay later.
5. **Known `pac` versions.** Record the `pac` version of each real fixture pair in `test/fixtures/README.md`, and check a download and a solution from `pac` 2.9.x. `align` must give no findings on real pairs, and the paper shows serialization changes between versions are real.
6. **`align --target`** gets a stronger reason: "downstream is import-only" is the paper's rule, and this command makes an edit in Test or Prod visible. It still needs a sample download from a managed target.

## To verify

- `pac solution add-solution-component --componentType powerpagecomponent` for a site component, and that the numeric types are refused (needs an environment).
- That `pac pages upload-code-site` gives changed web files new GUIDs, and what that does to `diff` (a web file's page access shows as removed and added, not changed).
- A download and a solution from `pac` 2.9.x through all four adapters' tests.
