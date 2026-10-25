# 0006: Page access in `test` and `diff`

**Status:** draft 1, open questions for the maintainer. Planned for 0.7.0.

0.6.0 reads who can open each page of a classic site ([0005](0005-page-access-rules.md)) and shows it in `lint` and `pages.md`. This spec adds pages to the other two commands:

- `test`: a policy can say who may read a page, so a build fails when that changes. For example, the unrestricted "[Admin] Delete-Course" page next to three restricted admin pages becomes a failure, not just a row in the docs.
- `diff`: a pull request shows what it does to who can read pages, as it already does for tables.

Decisions 4 and 7 of 0005 fixed two points: `diff` compares effective readers per branch, not rule records, and `test` names pages by URL path. The semantics `test` and `diff` depend on were checked on a classic site (0005, "Verification results").

## What 0.6.0 already has

`src/graph/pages.ts` gives, for each active root page of a classic site:

- its URL, built from the partial URLs of the page and the pages above it;
- the Restrict Read and Grant Change rules on its path;
- who can read it: **anyone**, **every signed-in user**, a **set of roles** (maybe empty: nobody), or **unknown** when its path up the tree is broken.

This spec builds on that model and doesn't change what it means. Three things are still unknown and stay as they are:

- which rule wins when a page has more than one Restrict Read rule (pageslens lets in anyone who passes one);
- what the Anonymous Users role does on a Grant Change rule (counted as nobody);
- rules tied to a publishing state: downloads leave the link out, so every rule applies in every state.

## Design rules

- **Same vocabulary and meaning as tables.** `anonymous`, `authenticated` and `role "Name"` mean what [docs/policy.md](../docs/policy.md) says. Members of a custom role are signed in, so they pass a rule that lets in every signed-in user.
- **The grammar stays closed** (AGENTS.md): a few fixed sentences, no patterns or expressions. A URL is a literal, not a glob.
- **Classic sites only**, as in 0.6.0 (0005, decision 8). On a code site, a page statement is an error that says why, and `diff` compares no pages.
- **Unknown fails.** A page whose readers are unknown (a missing parent, a loop) fails every statement about it, with the reason. `diff` classifies a change to or from unknown as wider.
- **Evidence points at records.** A failure or a diff line names the rules that decide, with their files, so SARIF alerts and the Action's comment land on the rule (or on the page, when no rule restricts it).

## `test`

### Statements

A new `pages` section, next to `access`, `webapi` and `settings`:

```yaml
pages:
  - anonymous cannot read page "/my-registrations/"
  - authenticated can read page "/profile/"
  - only "C1 ASP" can read page "/delete-course/"
  - only "C1 ASP" can read pages under "/admin/"
  - role "Administrators" can read page "/admin-home/"
  - nobody can read page "/drafts/"
  - only "Administrators" can publish pages under "/"
```

The forms:

```
<who> can read <page>
<who> cannot read <page>
only <who>, <who>, … can read <page>
nobody can read <page>

<who> can publish <page>
<who> cannot publish <page>
only <who>, <who>, … can publish <page>
nobody can publish <page>
```

`<page>` is `page "<url>"` (that page) or `pages under "<url>"` (that page and every page below it: open question 2). `publish` is Grant Change (open question 3).

### Passes when

For one page, with its readers R:

| Statement                     | Passes when                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `anonymous can read P`        | R is anyone                                                                                                                                                  |
| `anonymous cannot read P`     | R isn't anyone                                                                                                                                               |
| `authenticated can read P`    | R is anyone or every signed-in user                                                                                                                          |
| `authenticated cannot read P` | no signed-in user can read P: R is nobody (open question 6)                                                                                                  |
| `role "X" can read P`         | R is anyone, every signed-in user, or a set that has X                                                                                                       |
| `role "X" cannot read P`      | R is a set without X                                                                                                                                         |
| `only X, Y can read P`        | R is a set of roles among X and Y. R is every signed-in user only if the list has `authenticated`, and anyone only if it has `anonymous` and `authenticated` |
| `nobody can read P`           | R is nobody. Grant Change roles count as readers                                                                                                             |

`publish` reads the same table with the Grant Change roles on P's path instead of R. A Grant Change listing the Authenticated Users role counts as every signed-in user.

With `pages under "U"`, the statement passes when it passes for U and every active page below it; a failure lists each page that breaks it. A page added below U later is checked too, which is the point of the form.

### Pages, URLs and errors

- A URL is matched against the URLs `pages.md` shows. Case doesn't matter, and the slashes at either end are optional (`/admin-home/`, `/admin-home` and `admin-home` are the same page): open question 4.
- A URL that matches no active page is an error (exit 2), with a suggestion when there's a close one, as an unknown role is. A URL that matches only an inactive page is an error that says it's inactive (open question 5).
- Two active pages with the same URL is an error naming both. Power Pages shouldn't allow it, but a download can have it.
- On a code site, any `pages` statement is an error: "Page access rules don't apply to code sites, so pageslens can't check page statements there." The `pages` section can't be skipped silently, as a check that checks nothing mustn't pass.

### Evidence

A failure lists what decides it, in the words `pages.md` uses:

```
✗ only "C1 ASP" can read page "/delete-course/"
    anyone can read /delete-course/: no Restrict Read rule on it or above it
      web-pages/[admin]-delete-course/[Admin]-Delete-Course.webpage.yml
✗ only "C1 ASP" can read page "/v1/v2/"
    "Administrators" isn't in the list: Restrict Read rule "Admin Only" on /v1/v2/
      webpagerule.yml
```

SARIF puts the alert on the rule that lets the audience in, or on the page when no rule restricts it.

## `diff`

### What is compared

For each active root page on both sides (matched by GUID, never by URL or file), the readers and the publishers. Both sides must be classic sites; with any other pair, `diff` compares no pages and says so in the header, as it does for layouts that differ.

The readers are reduced to audiences, so a change says who gained or lost:

- anyone = Anonymous Users, every signed-in user, and every role;
- every signed-in user = every role but Anonymous Users;
- a set of roles = those roles.

`gained` is the audiences in head and not in base, `lost` the reverse. When every signed-in user is gained, the roles in it aren't listed one by one.

### Classification

| Change                                                                                            | Class                                                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| An audience can now read a page                                                                   | wider                                                                   |
| An audience can no longer read a page                                                             | narrower                                                                |
| A new page someone can read                                                                       | wider: its readers gained it (open question 8)                          |
| A new page nobody can read, a removed page                                                        | neutral, narrower                                                       |
| A page's readers become unknown (a broken path), or stop being unknown                            | wider                                                                   |
| A role can now publish a branch (Grant Change)                                                    | wider: it can also read every page in it                                |
| A role can no longer publish a branch                                                             | narrower                                                                |
| Same readers from different rules (a rule renamed, split, moved up the tree with the same effect) | neutral                                                                 |
| A page moved (new parent or partial URL), same readers                                            | neutral                                                                 |
| A rule's scope changed (only web files; open question 9)                                          | Restrict Read 1 → 2 or Grant Change 2 → 1 wider; the other way narrower |

Activating and deactivating pages and rules read as adding and removing them, with `(activated)` and `(deactivated)`, as for table permissions.

### One line per branch

A rule on a page changes every page below it. `diff` reports the topmost page where an audience's access changes and counts the pages below it with the same change:

```
+ Anonymous Users can now read /internal/ (and 4 pages below it): Restrict Read rule "Employees Only" removed
    webpagerule.yml (base)
- C1 ASP can no longer read /v1/v2/: Grant Change rule "Grant Change" on /v1/ deactivated
    webpagerule.yml
```

A page below with a different change (a rule of its own that keeps the audience out) gets its own line. The JSON output lists every page in the branch, so nothing is lost.

### Change kinds

Added to `CHANGE_KINDS` (the JSON `version` stays `1`: kinds are added, none change meaning):

| Kind                               | Class                                          |
| ---------------------------------- | ---------------------------------------------- |
| `page-read-gained`                 | wider                                          |
| `page-read-lost`                   | narrower                                       |
| `page-readers-unknown`             | wider                                          |
| `page-publish-gained`              | wider                                          |
| `page-publish-lost`                | narrower                                       |
| `page-added`, `page-removed`       | neutral (a new page nobody can read), narrower |
| `page-moved`, `page-rules-changed` | neutral                                        |
| `page-rule-scope-changed`          | wider or narrower                              |

### Order and wording

Page changes sort with table grants: by audience exposure first (Anonymous Users, Authenticated Users, other roles by name), then grants before pages, then pages by URL. Sentences use the words `test` evidence uses ("can read", "can no longer read"). A wider line whose rule also trips a lint rule ends with `(also reported by lint: <rule>)`, as for grants.

## How it fits

- **The Action** needs no change: `test` failures go to SARIF and `diff` lines to the comment through the existing outputs.
- **`docs`** stays as it is. `pages.md` is the full picture; the policy is the part a build should fail on.
- **Lint** keeps reporting rule mistakes. `page-roles-not-subset` and `grant-change-overrides-read` are about rules; a policy is about intent. They overlap on purpose.

## Implementation sketch

- `src/policy/types.ts`: `pages` in `SECTIONS`; `Check` gets `page-read` and `page-publish` variants (who, only, nobody; page or branch).
- `src/policy/parse.ts`: the forms above. `src/policy/evaluate.ts`: build the page graph once, resolve URLs, evaluate against `readers` and the Grant Change rules.
- `src/graph/pages.ts`: an `audiences(readers)` helper shared by `test` and `diff`, and a URL lookup.
- `src/diff/facts.ts`: per page, readers and publishers with the rules behind them; `compare.ts`: matching by GUID, the classification above, branch collapsing; `types.ts`: the new kinds.
- Docs: `docs/policy.md` (the `pages` section and its table), `docs/diff.md` (the page tables and kinds), README.
- Fixtures: `test/fixtures/policies/pages.policy.yaml` (passing and failing lines against `registration` and `classic-pages`); `test/fixtures/diff/pages/{base,head}` (classic): a Restrict Read removed above a branch, a role added to a rule, a Grant Change added, a new public page, a page moved, a rule renamed.

## Open questions for Oleksandr

1. **Section.** A new `pages:` section, or page statements inside `access:`? Recommended: `pages:`. It keeps `access` about tables, and a code site's error can point at one section.
2. **Branches.** Add `pages under "<url>"` (the page and every page below it), or only single pages? Recommended: add it. It's how a team says "everything under /admin/ is for admins", and it catches pages added later. It's a literal URL prefix, not a pattern.
3. **Publish statements.** Include `can publish` (Grant Change) in 0.7.0? Recommended: yes. Grant Change also gives read access, so "only Administrators can publish pages under /" is the requirement that catches a Grant Change rule nobody looks at.
4. **URL matching.** Ignore case and the slashes at either end? Recommended: yes. Power Pages matches partial URLs without case, as far as known; to confirm in an environment (one more check: open `/Admin-Home/`).
5. **Inactive pages.** A statement about a page that's inactive: an error, or pass `cannot` and fail `can` (nobody can open it)? Recommended: an error that says it's inactive. A policy about a page that's off is probably out of date.
6. **`authenticated cannot read`.** Strict, as for tables (fails if any signed-in user can read the page, through any role), or only when every signed-in user can? Recommended: strict, the same as tables (AGENTS.md). "Some signed-in user can read it" is what the sentence denies.
7. **One line per branch in `diff`.** Report the topmost changed page with a count, or every page? Recommended: topmost with a count in text and Markdown, every page in JSON. Otherwise a rule removed on `/` writes one line per page of the site.
8. **New pages.** Is a new page anyone can read a wider change? Recommended: yes. It's how "[Admin] Delete-Course" would have shown up. Teams that add many public content pages will see one wider line per page; that's honest, and `--fail-on wider` is opt-in.
9. **Rule scope in `diff`.** Scope only decides the web files directly under the page, and pages-only was decision 9 of 0005. Show a scope change as a rule-level line classified as above, or leave it out until web files are covered? Recommended: show it. A Restrict Read on Home turned to "Exclude direct child web files" makes files public, and the conservative rule says to show it.

## Verification owed

- Whether partial URLs match without case (question 4).
- The two unknowns carried over from 0005: several Restrict Read rules on one page, and the Anonymous Users role on a Grant Change rule. `test` and `diff` inherit pageslens's reading of both until they're checked.

## Sources

- [0005: Page access rules](0005-page-access-rules.md): the model, the lint rules and the verification results.
- [0001: Policies](0001-policies.md) and [docs/policy.md](../docs/policy.md): the grammar's rules and `authenticated`.
- [0003: Access diffs](0003-diff.md) and [docs/diff.md](../docs/diff.md): classification, kinds, ordering and the JSON contract.
