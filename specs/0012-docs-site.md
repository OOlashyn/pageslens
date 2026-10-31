# 0012: Documentation site

**Status:** built and deployed; the output's links to the site ship in 0.13.0 (see "As built"). Draft 2, every open question decided (see "Decisions").

pageslens's user docs are Markdown files read on GitHub: the README (about 480 lines), five references in `docs/` and twenty rule pages in `rules/`. They work, but they're hard to find and search, and the README carries most of it. This spec designs a documentation site at `pageslens.olashyn.dev`, built with Astro from the same files, so that nothing is written twice.

## What we know

### The maintainer's sites

- `olashyn.dev` is a GitHub Pages user site (the `oolashyn.github.io` repository), with the custom domain set in its Pages settings.
- `olashyn.dev` is a verified domain on the maintainer's GitHub account. Verification covers its subdomains, so no other account can take over `pageslens.olashyn.dev` ([Verifying your custom domain](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)).
- `power-pages-lookup-to-select` has an Astro Starlight site in `docs/`, built by `withastro/action` and deployed with `actions/deploy-pages`. It has no custom domain, so it inherits the user site's and is served at `olashyn.dev/power-pages-lookup-to-select/`, with `base` set in `astro.config.mjs`. It's on Starlight 0.22 and Astro 4.

### A subdomain on GitHub Pages

A project site gets its own domain with a custom domain in the repository's Pages settings and a `CNAME` record at the DNS provider pointing to `<user>.github.io` ([Managing a custom domain](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)):

1. DNS: `pageslens` CNAME `oolashyn.github.io`.
2. The pageslens repository, Settings, Pages: source "GitHub Actions", custom domain `pageslens.olashyn.dev`, then "Enforce HTTPS" once the certificate is issued.
3. No `CNAME` file in the build: a site deployed by a workflow ignores it, and the domain lives in the settings.
4. `olashyn.dev/pageslens/` then redirects to the subdomain.

### Astro and Starlight

[Starlight](https://starlight.astro.build) is Astro's documentation theme: sidebar, search ([Pagefind](https://pagefind.app), built at build time, no external service), dark mode, code highlighting and edit links. The current versions are Starlight 0.42 and Astro 7. lookup-to-select's config is three major versions behind, so a new site starts from the current template rather than a copy.

Starlight reads pages from a content collection (`src/content/docs/` by default). Each page needs a `title` in its frontmatter, and Starlight shows it as the page's heading, so the page body has no `#` heading of its own.

### What the docs are today

| Source      | Pages                                                                 | Read by                                                                           |
| ----------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `README.md` | Quick start, the six commands, configuration, agents, CI, development | GitHub and npmjs.com                                                              |
| `docs/`     | `policy.md`, `diff.md`, `align.md`, `alm.md`, `azure-devops.md`       | GitHub; linked from the README and from SARIF `helpUri` (`policy.md`, `align.md`) |
| `rules/`    | `README.md` (the table) and one page per rule, starting with `# <id>` | `pageslens explain` (they ship in the npm package); SARIF `helpUri`; GitHub       |

The pages link to each other with relative links (`../docs/diff.md`, `rules/role-unused.md`, `../README.md#in-ci`). The SARIF links point to `blob/main` on GitHub (`RULE_DOCS_BASE` in `src/lint/engine.ts`, `POLICY_DOCS`, `ALIGN_DOCS`), so they show what's on `main`, which can be ahead of the release a user runs.

## Design rules

- **One source.** `rules/`, `docs/` and the README stay where they are and stay the source. The site is built from them. `pageslens explain` and GitHub show the same text as the site.
- **The site matches the release.** It describes the version on npm `latest`, not what's on `main`.
- **Nothing in the npm package changes.** The site has its own dependencies, which never reach users.
- **Deterministic and offline**, like the rest of pageslens: the sync step gives the same output for the same input, and the build needs no service other than npm.
- **Plain English in short sentences**, as the conventions say. The site adds navigation, not new prose, except a short home page.

## Design

### Where it lives

A `site/` folder in this repository: an Astro project with its own `package.json` and lockfile. `docs/` is taken by the references. `site/` is outside `files` in `package.json`, so it doesn't ship. `vite.config.ts` adds `site/**` to the `ignorePatterns`, so `vp check` and `vp test` leave it alone, and the site's own build checks it.

```
site/
  astro.config.mjs      site: 'https://pageslens.olashyn.dev', Starlight, sidebar
  package.json          astro, @astrojs/starlight; scripts: sync, dev, build
  scripts/sync.ts       copies the sources into src/content/docs/ (below)
  src/content.config.ts docsLoader() and docsSchema()
  src/content/docs/
    index.mdx           home page, written by hand
    (generated pages, in .gitignore)
  public/               favicon
```

### The sync step

`site/scripts/sync.ts` runs before `astro dev` and `astro build`. For each source file it:

1. takes the title from the first `# ` line and removes that line;
2. writes the page with frontmatter (`title`, and `description` from the first paragraph);
3. rewrites relative links to the site's URLs, keeping anchors (`../docs/diff.md#kinds` becomes `/reference/diff/#kinds`), and links to files the site doesn't have (`action.yml`, specs) to GitHub;
4. fails on a relative link it can't resolve, so a broken link fails the build.

| Source                                  | Site page                                                       |
| --------------------------------------- | --------------------------------------------------------------- |
| `README.md` sections                    | `/start/`, `/commands/<name>/`, `/ci/`, `/agents/` (decision 2) |
| `docs/policy.md`, `diff.md`, `align.md` | `/reference/<name>/`                                            |
| `docs/alm.md`, `azure-devops.md`        | `/guides/<name>/`                                               |
| `rules/README.md`                       | `/rules/`                                                       |
| `rules/<id>.md`                         | `/rules/<id>/`                                                  |

The sidebar lists Start, Commands, Guides, Reference and Rules. The rules group is generated from the folder, so a new rule appears without touching the config.

### Building and deploying

A workflow, `.github/workflows/site.yml`:

- **Deploy** on `release: published` and on `workflow_dispatch`, from the release tag: `withastro/action` with `path: ./site` and Node 24, then `actions/deploy-pages`. Permissions `pages: write` and `id-token: write`, the `github-pages` environment, actions pinned by commit SHA as in `release.yml`.
- **Build only** on pull requests that touch `site/`, `docs/`, `rules/` or `README.md`, so a broken link or build fails the pull request rather than the release.

`workflow_dispatch` covers a docs fix between releases: it builds from the ref it's given.

When the Pages source is set to GitHub Actions, GitHub creates the `github-pages` environment and lets only the default branch deploy to it. A release runs on its tag, so the environment needs a deployment rule for `v*` tags as well, like the `npm` environment has.

### Versions

One site, for the current release. Older versions aren't kept: before 1.0 the README's notes on what changed are enough. If versions become needed, the `starlight-versions` plugin adds them without moving files.

### What doesn't change

- The commands, their output and the npm package.
- `pageslens explain`: it still prints `rules/<id>.md` from the package.
- The GitHub Action.

## Changes

- `site/`: the Astro project, the sync script and the home page.
- `vite.config.ts`: `site/**` in `ignorePatterns`.
- `.github/workflows/site.yml`.
- `README.md`: a link to the site near the top, and in "Development", how to run the site locally.
- `AGENTS.md`: a short "The docs site" section: the site is generated from `README.md`, `docs/` and `rules/`; don't edit generated pages; a new rule's page appears by itself.
- `package.json`: `homepage` (decision 4).
- SARIF `helpUri` and `pageslens.config.schema.json`'s location, as decisions 5 and 6 say: the SARIF links move to the site, the schema URL stays.
- The repository's Pages settings, the `v*` tag rule on the `github-pages` environment and the DNS record, by the maintainer.

## Decisions

The maintainer took the recommendation on each question (2026-10-31).

1. **Where the site's source lives.** (a) `site/` in this repository; (b) a separate repository; (c) a section of the `olashyn.dev` site. Decided: (a). The docs change in the same pull request as the code, the sync reads the files directly, and the build-only job catches broken links before merge.
2. **What happens to the README.** (a) It stays as it is, and the site splits it into pages; (b) it shrinks to an overview, install, a quick start and a link to the site, and the command sections move to `docs/`; (c) as (b), but the README keeps the commands' one-line summaries. Decided: (c). npmjs.com and GitHub show the README first, so it should still say what pageslens does and how to start, but 480 lines is a lot to keep in step with the site. It also makes the sync simpler: `docs/` files map to pages one to one. It's the biggest change in this spec, so it could come in a second pull request.
3. **When the site deploys.** (a) On a published release, plus `workflow_dispatch`; (b) on every push to `main`; (c) both, with `main` at a `/next/` path. Decided: (a). The site then describes what `npm install pageslens` gives. (c) is versioning by another name.
4. **`homepage` in `package.json`.** (a) The site; (b) the GitHub README, as today. Decided: (a), once the site is live. npmjs.com links it as the homepage; the repository link stays.
5. **SARIF `helpUri` links.** (a) To the site's rule, policy and align pages; (b) to GitHub `blob/main`, as today. Decided: (a). The links then match the release, and the page reads better than raw Markdown in a code scanning alert. It changes the SARIF snapshots, and links in already uploaded results keep pointing to GitHub, which still works.
6. **The config schema's URL.** The README's `$schema` comment points to `raw.githubusercontent.com/.../main/pageslens.config.schema.json`. (a) Also publish it at `pageslens.olashyn.dev/pageslens.config.schema.json` and point to it; (b) leave it. Decided: (b) for now. The raw URL works, and changing it changes every user's config file for no gain. Revisit with versions.
7. **Generated pages in git.** (a) In `.gitignore`, made by the sync on each build; (b) committed, and a test checks they're up to date. Decided: (a). Committed copies invite edits in the wrong place, and the sync is fast.
8. **Look and feel.** (a) Starlight's default theme with the pageslens name and a favicon; (b) styled like `olashyn.dev`. Decided: (a) to start. Styling can come later without changing the structure.

## As built

Built to draft 2 with every decision as recorded, the README split (decision 2) included. Where the build needed an interpretation the spec doesn't give:

1. **The sync script is `scripts/sync-docs.ts`**, not `site/scripts/sync.ts`. It has no dependencies, like `scripts/release.ts`, so `test/scripts/sync-docs.test.ts` runs it in memory: a link to a missing file or heading fails `vp test`, not only the site's build. `site/package.json` runs it before `astro dev` and `astro build`.
2. **Pages and URLs.** With the commands in `docs/`, there's no `/reference/` group: `/getting-started/`, `/commands/<lint|test|diff|align|docs>/`, `/guides/<ci|alm|azure-devops|agents>/`, `/rules/` and `/rules/<id>/`. A file in `docs/` that `DOCS` doesn't place fails the sync. The README isn't a page: the home page (`index.mdx`) is written by hand.
3. **The README split.** New pages: `docs/getting-started.md` (install, the site folder, solutions, deployment settings), `docs/lint.md` (with configuration), `docs/docs.md`, `docs/ci.md` and `docs/agents.md`. The README keeps the intro, the status note, the quick start, a table of the commands, a short action example and the development notes. Its rules table is gone: `rules/README.md` is the one list, and the lint page links to it. The heading "Using pageslens with an agent" stays, with a link to the page, so links to its anchor still land. The `test`, `diff` and `align` references gained `--settings` in their synopses, which only the README had.
4. **Links.** A relative link to a page becomes the page's URL, anchors kept. A link to any other file in the repository, the README included, goes to GitHub at `main`. Anchors are checked against the target's headings with GitHub's slug rules, which Starlight also uses.
5. **Frontmatter.** The title is the `#` line without code marks (`Policies: pageslens test`). The description is the first paragraph of prose, skipping a line in bold only (a rule's `**Default: info**`). Each page's "Edit page" link opens its source file. Command pages have the command as their sidebar label.
6. **Links in the output** (decision 5) go through `DOCS_SITE` in `src/docs-site.ts`. Lint JSON's `docs` field moves with SARIF's `helpUri`, as both come from `RULE_DOCS_BASE`; the JSON `version` stays 1, as the field means the same. A test checks that each rule, the policy page and each align check's heading exist on the site.
7. **The release script** points the action examples in `docs/ci.md` and `docs/alm.md` at the new tag as well as the README's. `docs/alm.md` had stayed at `v0.11.0`.
8. **`homepage`** (decision 4) is set now. npmjs.com shows it from the next release, which is also when the site first deploys.

## Verification

Checked on 2026-10-31, after the first deploy (a manual run of the workflow from `main`):

- `pageslens.olashyn.dev` is served over HTTPS, and plain HTTP redirects to it.
- `olashyn.dev/pageslens/` redirects (301) to the subdomain. `olashyn.dev` and lookup-to-select still work.
- Search finds rule ids (`role-unused`, `wildcard`) and policy keywords (`except under`), with the rule's or the command's page first.
