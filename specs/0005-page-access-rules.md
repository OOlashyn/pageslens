# 0005: Page access rules

**Status:** lint and `docs` built for 0.6.0 (see "Decisions" and "As built"). The semantics were checked on a classic site (see "Verification results"). `test` and `diff` for pages come in 0.7.0.

Table permissions answer "who can read which records". Page access rules answer "who can open which pages". pageslens already reads page access rules into the model (`webPageRules`: name, right, page, roles), but only `role-unused` looks at them. This spec adds the meaning: who can read each page, which mistakes to lint, and how `docs`, `test` and `diff` show them. It starts with classic sites.

**Why classic sites first.** On a classic site, the server renders each web page, and page access rules decide whether it renders. A code site is a single-page application: "Server-side refresh always returns the site's root page, and the client-side router renders sub-routes". Microsoft's advice for page-level security there is to check the user's web roles in client code. So on a code site, page access rules gate at most the root page and the web files under the pages. The code site part is in "Code sites" below.

## Research: how page access rules work

From Microsoft's docs ("Set page permissions", and the Dataverse reference for `mspp_webpageaccesscontrolrule` and `mspp_webpage`):

| Fact                                                                                                                                                                                                                                                                   | What it means for pageslens                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A rule has a **right**: `1` Grant Change or `2` Restrict Read. A **scope**: `1` All content (default) or `2` Exclude direct child web files. A **web page**, a list of **web roles**, a **website**, and an active or inactive **status**.                             | All but the website are in the download; the status only when inactive. Scope is in classic downloads, but missing from EcoFlux's rules: missing probably means the default.      |
| A rule affects its page **and all child pages**: "the entire branch of the site". A rule on the home page applies to the whole site.                                                                                                                                   | Access is computed down the page tree (`parentpageid`).                                                                                                                           |
| **Restrict Read** limits viewing the page and its children to users with one of the rule's roles.                                                                                                                                                                      | With no Restrict Read on the path to a page, anyone can open it, anonymous visitors included.                                                                                     |
| **Grant Change** lets the rule's roles publish changes to the branch. It "also grant[s] read access that overrides restrict read rules".                                                                                                                               | A Grant Change role can read the whole branch, whatever Restrict Read says.                                                                                                       |
| A Grant Change rule on the home page with scope All content "override[s] restrict read rules site-wide". Microsoft's troubleshooting section lists "Restrict read rule doesn't work for admins".                                                                       | This is a known trap and a lint candidate.                                                                                                                                        |
| A child page with a role "not used for the parent page": "This page and its subpages won't be available to those roles".                                                                                                                                               | Nested Restrict Read rules **narrow**: a user has to pass every Restrict Read above the page. To verify (see "Verification owed").                                                |
| "Anonymous user role should not be assigned directly to web pages". The Portal Management app shows this as an alert.                                                                                                                                                  | A lint candidate. What the rule does at runtime is unknown.                                                                                                                       |
| "Multiple, conflicting access control rules applied to this page. Deactivate the extra rules so there is only one with restricted read-write access." This is an error in the Portal Management app.                                                                   | A lint candidate: more than one active Restrict Read rule on the same page.                                                                                                       |
| A child web file follows its page's access unless the rule's scope is Exclude direct child web files. That scope doesn't exclude the files' descendants. "Apply these permissions to all files" must stay off on the home page, or the CSS under it is restricted too. | Scope only matters for web files (`webfile.parentpageid`).                                                                                                                        |
| A rule can be tied to **publishing states**, through the N:N `mspp_accesscontrolrule_publishingstate`. It then applies only while the page is in one of those states.                                                                                                  | Whether downloads include this link is unknown. Without it, a state-bound rule looks unconditional.                                                                               |
| Pages: `parentpageid`, `isroot`, `rootwebpageid` and `webpagelanguageid` (a root page and one content page per language), plus `partialurl`, `publishingstateid`, `hiddenfromsitemap` and status.                                                                      | Rules point at root pages. A content page follows its root page. The URL is the chain of `partialurl`s.                                                                           |
| The design studio manages only Restrict Read. Grant Change is managed in the Portal Management app.                                                                                                                                                                    | Many sites have a template Grant Change rule nobody looks at. EcoFlux, the classic fixture and the real classic site all have "Grant Change to Content" with no page and no role. |

### What the downloads contain

Checked on EcoFlux (a code site) and on a real classic site: a Registration template site on the enhanced data model, downloaded with `pac pages download`, with eight page access rules.

- **Rules.**
  - A classic site has a root-level `webpagerule.yml` list. It has `adx_right`, `adx_scope` (both `1` and `2` appear), `adx_webpageid` and `adx_webpageaccesscontrolrule_webrole`.
  - A code site has `webpage-rules/*.webpagerule.yml`, with the same fields unprefixed. EcoFlux's rules have no `scope`.
  - Rules point at **root** pages.
- **Pages.** Both layouts use the same folders: `web-pages/<slug>/<Name>.webpage.yml` for the root page (`isroot: true`) and its content pages.
  - Classic content pages are `content-pages/<Name>.<lang>.webpage.yml`. Code sites put them in `content-pages/<lang>/`.
  - A content page has `rootwebpageid` pointing to its root page.
  - `parentpageid` points to the parent's **root** page in both cases.
  - The home page has `partialurl: /` and no parent.
  - The folder slug comes from the page's name (`[admin]-delete-course`), not its URL.
- **Inactive records are in the download.** An inactive record has `statecode: 1` and `statuscode: 2`, and an active one has no `statecode` key.
  - In the classic site, two rules, a page (with its content page), a table permission, a basic form and a web link are inactive.
  - Whether code sites write `statecode` the same way isn't known yet. EcoFlux has no inactive records.
- **Web files**: `web-files/<file>` plus `<file>.webfile.yml`, with `adx_parentpageid`. All 26 in the classic site are under the home page.
- **Publishing states**: `publishingstate.yml` lists them. No rule in the classic site is tied to a state, so whether the download would write that link is **still unknown**.

### Comparable models

- **NTFS and SharePoint** inherit permissions down a tree, and a "check effective access" view answers "who can open this item". SharePoint reports "unique permissions" (broken inheritance) because that's where mistakes hide. pageslens can do the same offline: effective readers per page, and the pages whose rules differ from their parent's.
- **Allow overrides deny**, as Grant Change over Restrict Read, is the less common precedence (NTFS has deny win). It deserves its own explanation in the output, since it's what surprises people.

## A real classic site

The real classic site has 18 root pages, all directly under Home, and eight rules:

| Rule                              | Right, scope                                      | Page                     | Roles                                           | Status       |
| --------------------------------- | ------------------------------------------------- | ------------------------ | ----------------------------------------------- | ------------ |
| Grant Change to Content           | Grant Change, all                                 | (none)                   | (none)                                          | active       |
| Restrict Read on Home             | Restrict Read, **exclude direct child web files** | Home                     | Administrators, C1 ASP                          | **inactive** |
| Grant Change to Administrators    | Grant Change, all                                 | Home                     | Administrators                                  | **inactive** |
| Restrict Read on C1 Courses Home  | Restrict Read, all                                | [Admin] Courses Home     | **Authenticated Users**, Administrators, C1 ASP | active       |
| Restrict Read on Create Course    | Restrict Read, all                                | [Admin] Create Course    | C1 ASP                                          | active       |
| Restrict Read on Duplicate Course | Restrict Read, all                                | [Admin] Duplicate Course | C1 ASP                                          | active       |
| Restrict Read on Edit Course      | Restrict Read, all                                | [Admin] Edit Course      | C1 ASP                                          | active       |
| Restrict Read on My Registrations | Restrict Read, all                                | My Registrations         | Authenticated Users                             | active       |

What it teaches:

- **Inactive records must be skipped, everywhere.**
  - The two rules on Home are inactive. With them applied, the whole site would look restricted to Administrators and C1 ASP. In fact it's public, apart from five pages.
  - The same goes beyond pages. The site's "Feedback" table permission is inactive, but pageslens 0.5.0 reports it: `global-write-anonymous` and `global-write-authenticated` fire on it, and the access matrix shows its grants.
  - Today's model ignores `statecode` for every kind. That was a bug in the released lint, `docs`, `test` and `diff`. It's fixed on `main` (PR #25): inactive records go to `site.inactive` and take part in nothing.
- **"[Admin] Delete Course" has no rule.** Its three sibling admin pages are restricted to C1 ASP, but anyone can open this one, anonymous visitors included. No rule is broken, so lint can't know it's a mistake. The `pages.md` docs make it visible, a policy statement (`only "C1 ASP" can read page "/delete-course/"`) makes it a failure, and `diff` would have shown it as wider when the page was added (open question 11).
- **A Restrict Read that lists Authenticated Users lets every signed-in user in.** On "[Admin] Courses Home", that makes Administrators and C1 ASP redundant, and the admin page is open to any signed-in user. That's probably not what was meant. It's a new lint candidate, `page-rule-authenticated`.
- **Scope 2 on the home page** ("Restrict Read on Home") would leave the 26 web files under Home public. That's what Microsoft's note describes, and it's correct for CSS and images. pageslens should show the scope, not flag it.
- **The tree is flat**, so this site can't answer the nesting questions (verification 1 and 2). A test needs a branch at least two levels deep, with Restrict Read on both levels.

## Design rules

- **Model Microsoft's documented semantics, conservatively.** Where the docs leave a gap, assume the reading that gives more access, and list it under "Verification owed". This is the same rule as `diff`'s "wider".
- **Root pages carry access.** Content pages (one per language) are reported under their root page, not repeated per language.
- **Inactive records grant and restrict nothing.** A record with `statecode: 1` is skipped by every command, for every kind (table permissions, rules, pages, settings). `docs` lists inactive rules and pages separately, so nothing is hidden.
- **Say what's conditional.** A rule tied to a publishing state, or a page that isn't active, is shown as such. It isn't silently applied or dropped.
- **Same vocabulary as table permissions.** The audiences are Anonymous Users, Authenticated Users and named roles. Members of a custom role also have the Authenticated Users role's grants (AGENTS.md).

## Effective page access

For each root page P, the path is P and its ancestors up to the home page.

- **No Restrict Read on the path:** anyone can read P, anonymous visitors included.
- **Otherwise:** a user can read P if, for **every** Restrict Read rule on the path, they hold one of its roles. Or if they hold a role of **any** Grant Change rule on the path (the override).
- A Restrict Read listing the **Authenticated Users** role is passed by every signed-in user. One listing the **Anonymous Users** role is passed by everyone (conservative; open question 6).
- **Web files** directly under P follow P, except that a rule on P with scope `2` doesn't apply to them. Rules higher up still do.
- **Inactive rules** are ignored. An **inactive page** can't be opened at all. Its branch is reported as inactive, not public. **State-bound rules**, if downloads turn out to include the link, are applied and marked "only while the page is <state>".
- A **broken path** (a parent page that isn't in the site, or a loop) is a lint error, and access below it is "unknown", not "public".

The result per page is a set of audiences: anyone, every signed-in user, or a set of roles. Each audience comes with the rules that produce it, as table grants carry their permissions.

## Lint rules

Each rule follows "Changing a lint rule" in AGENTS.md: a page in `rules/`, a case in `broken`, and the tables.

| Rule                          | Severity                                       | Fires when                                                                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page-rule-no-page`           | warning                                        | A rule has no web page, or its page isn't in the site, so it applies to nothing. EcoFlux and the classic fixture both have one (the template's "Grant Change to Content"), so this is a warning, not an error.                                                                    |
| `page-rule-no-role`           | error for Restrict Read, info for Grant Change | Restrict Read with no role hides the branch from everyone except Grant Change roles. Grant Change with no role does nothing.                                                                                                                                                      |
| `page-rule-anonymous`         | warning                                        | A rule lists the Anonymous Users role, which Microsoft warns against.                                                                                                                                                                                                             |
| `page-rules-conflict`         | error                                          | More than one active Restrict Read rule on the same page (Microsoft's error).                                                                                                                                                                                                     |
| `page-roles-not-subset`       | warning                                        | A Restrict Read lists a role that a Restrict Read above it doesn't have. That role can't reach the page. This is the documented "won't be available to those roles" case.                                                                                                         |
| `grant-change-overrides-read` | warning                                        | A role with Grant Change on an ancestor isn't in a Restrict Read below it. It can read the restricted branch anyway ("Restrict read doesn't work for admins").                                                                                                                    |
| `page-rule-authenticated`     | warning                                        | A Restrict Read lists the Authenticated Users role together with other roles. Every signed-in user passes it, so the other roles add nothing (as on the real classic site's "[Admin] Courses Home"). A rule with only Authenticated Users is fine: that's "signed-in users only". |
| `page-parent-missing`         | error                                          | A page's parent isn't in the site, or the parent chain loops.                                                                                                                                                                                                                     |

Every page rule skips inactive rules and pages.

`page-access-gap` from the MVP spec ("a page under a restricted parent with no access rule of its own") is dropped: inheriting is the default and usually right. The real mistakes are the narrowing and the override above.

## `docs`

A new page, `pages.md`, has the page tree in URL order. For each root page it shows:

- who can read it, and the rules that decide that;
- whether it's hidden from the site map;
- whether it's inactive or tied to a publishing state.

The Grant Change roles get their own short table ("can publish changes to, and read, these branches"). The home page's index links to it, as it links to the access matrix.

## `test`

New closed forms, in the existing grammar's style:

```yaml
access:
  - anonymous cannot read page "/account/"
  - only "Employees", "Administrators" can read page "/internal/"
  - "Customers" can read page "/support/"
  - nobody can publish page "/"             # Grant Change
```

`page "<url>"` names a root page by its full URL path, built from the `partialurl` chain. A page that doesn't exist is an error, as an unknown role is. `can read page` passes when the effective access includes the audience. `cannot` and `only` follow the table forms (AGENTS.md: `authenticated` means every signed-in user).

## `diff`

Two levels are possible:

- **Rule-level**, as already planned in [0003](0003-diff.md): a Restrict Read removed is wider, a role added to one is wider, and so on. Cheap, but a rule change on `/` is one line even if it opens every page.
- **Effective, per branch**: compare the effective readers of each root page between base and head. Report the topmost page where they change, with the pages below it counted: "Anonymous Users can now read /internal/ (and 4 pages below it), as the Restrict Read rule "Employees only" was removed". It's classified like grants: anything not shown narrower is wider.

## Code sites

The same model is read, and the rules that don't depend on page rendering run on code sites too: `page-rule-no-page`, `page-rule-no-role`, `page-rule-anonymous`, `page-rule-authenticated` and `page-rules-conflict`. Effective page access, the `pages.md` docs, `test` page statements and the effective `diff` are classic-only in 0.6.0. On a code site, `docs` says why, and a `page "…"` statement is an error that says so. A Restrict Read on a code site's home page may still block the whole application. That's for verification, not assumption.

## Fixtures

- **The real classic site**, copied read-only like EcoFlux into `test/fixtures/registration/`, minus `.portalconfig/` (it names the environment). It covers the flat tree, inactive rules, a page and a permission, scope `2`, an unrestricted admin page and the Authenticated Users rule (open question 1).
- **`test/fixtures/classic-pages/`**, written by hand in the same shapes, for what the real site doesn't have: a nested branch, a Grant Change override, two Restrict Reads on one page, the Anonymous Users role and a missing parent.
- `test/fixtures/diff/pages/{base,head}` for the effective diff.

## Verification owed (needs a Dataverse environment)

Checked on 2026-10-24; the answers are in "Verification results" below.

1. Nested Restrict Read: does a user need a role from every rule on the path (intersection), or does the nearest rule win?
2. Grant Change on a parent with scope `2`: does it still override Restrict Read for the child pages?
3. A rule listing the Anonymous Users role: what happens at runtime?
4. A code site's home page with a Restrict Read rule: is the whole application blocked?
5. Does `pac pages download` include the rule–publishing-state links? (Inactive records: yes, as `statecode: 1`.)
6. Does `download-code-site` write `statecode` for inactive records the same way?

### How to check it

Run these on a classic test site (the Registration site works), in the Portal Management app. Each check needs:

- **One private browser window per user.** Use three test contacts:
  - A has only the Authenticated Users role;
  - B has C1 ASP;
  - C has Administrators.
    Use a fourth window for anonymous visits.
- **The site's cache cleared after each change.** Use **Sync** in the design studio, or restart the site.

Create a small branch under Home first: **V1** (`/v1/`), with two children, **V2** (`/v1/v2/`) and **V3** (`/v1/v3/`).

| #   | Set up                                                                                                                                | Check                                               | Read the result                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Restrict Read on V1: C1 ASP. Restrict Read on V3: Authenticated Users (the Portal Management app allows it; the design studio warns). | A opens `/v1/v3/`.                                  | Denied: rules on the path **intersect** (the design). Allowed: the **nearest rule wins**.         |
| 2a  | Keep 1. Restrict Read on V2: Administrators. Grant Change on V1: C1 ASP, scope All content.                                           | B opens `/v1/v2/`.                                  | Allowed: Grant Change overrides Restrict Read below it, as documented.                            |
| 2b  | Change that Grant Change's scope to Exclude direct child web files.                                                                   | B opens `/v1/v2/`.                                  | Still allowed: scope only affects web files (the design). Denied: scope also limits the override. |
| 3   | A new page **V4** (`/v4/`) under Home, with one Restrict Read whose only role is Anonymous Users.                                     | Anonymous opens `/v4/`, then A.                     | Who gets in decides how pageslens reads that role. The design assumes everyone.                   |
| 4   | On "Restrict Read on Create Course", add the **Published** publishing state (the rule's Publishing States tab).                       | Run `pac pages download` again.                     | Any new key in `webpagerule.yml` (or a new file) is the rule–state link.                          |
| 5   | On a code site, add a Restrict Read on the home page for Administrators only.                                                         | Anonymous opens the site's root and a client route. | Blocked: page rules gate the whole application. Served: they don't apply to code sites.           |
| 6   | On a code site, deactivate one table permission.                                                                                      | Run `pac pages download-code-site`.                 | Whether `statecode: 1` appears in its `.tablepermission.yml`.                                     |

After checks 1–4, one more `pac pages download` of the classic site gives the page tree for the hand-written fixture (`classic-pages`), with real shapes.

## Verification results (Oleksandr, 2026-10-24)

Run on the Registration test site as "How to check it" describes, and a new `pac pages download` afterwards. The design studio wouldn't create the rules for checks 1 and 3, so they were made in the Power Pages Management app; the design studio then showed a warning on them.

| #   | Result                                                                                                                                                                                          | What it means for pageslens                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | A user with only Authenticated Users couldn't open `/v1/v3/` (Restrict Read on V1: C1 ASP, on V3: Authenticated Users).                                                                         | Rules on the path **intersect**, as designed.                                     |
| 2a  | A C1 ASP user could open `/v1/v2/` (Restrict Read on V2: Administrators, Grant Change on V1: C1 ASP).                                                                                           | Grant Change overrides Restrict Read below it, as documented.                     |
| 2b  | Still allowed with the Grant Change's scope set to Exclude direct child web files.                                                                                                              | Scope only affects web files, as designed.                                        |
| 3   | On a page (`/vAnon/`) whose Restrict Read lists only Anonymous Users, both an anonymous visitor and a signed-in user got "Access Restricted".                                                   | **Not as designed:** the Anonymous Users role lets nobody in. See decision 12.    |
| 4   | The Published state was added to "Restrict Read on Create Course" before the new download. That rule is unchanged in `webpagerule.yml`, and there's no new file for a rule's publishing states. | Downloads don't carry the rule–publishing-state link, so pageslens can't show it. |
| 5   | A Restrict Read on a code site's home page doesn't affect the site.                                                                                                                             | Page access rules don't apply to code sites: decision 8 holds.                    |
| 6   | `download-code-site` writes `statecode: 1` (with `statuscode: 2`) on a deactivated table permission, as a classic download does.                                                                | Inactive records are skipped on code sites too (PR #25); nothing to change.       |

## Decisions (Oleksandr, 2026-10-24)

Every recommendation is adopted except question 8:

1. The real classic site becomes `test/fixtures/registration/`, without `.portalconfig/`, read-only like EcoFlux, web file contents included.
2. Lint and `docs` in 0.6.0. `test` and `diff` for pages wait for 0.7.0, after the semantics are checked in a Dataverse environment.
3. Nested Restrict Read rules intersect until verified, and the docs say so.
4. When `diff` gets pages, it compares effective readers per branch.
5. `page-rule-no-page` is info for a rule with neither a page nor a role, and a warning for a rule with roles but no page.
6. A rule listing the Anonymous Users role counts as "everyone" until verified, and `page-rule-anonymous` warns about it. Replaced by decision 12.
7. `test` names pages by URL path.
8. **Not as recommended:** page access rules are classic-only in 0.6.0. No page lint rule runs on a code site, and `docs` doesn't write `pages.md` for one. (`role-unused` still counts a role used by a page rule, as before.)
9. Pages only. `docs` shows each rule's scope; web files get their own section later.
10. Answered before: inactive records are left out of the model (PR #25).
11. No heuristic lint rule for an unrestricted page among restricted siblings. `pages.md` shows it now, and `test` and `diff` will catch it in 0.7.0.
12. After verification 3: a rule listing the Anonymous Users role is an **error**, and the role counts as letting nobody in. This replaces decision 6.

The checks in "How to check it" were run on 2026-10-24: see "Verification results".

## Open questions for Oleksandr (answered, see Decisions)

1. **The real classic site as a fixture.** Copy it into `test/fixtures/registration/` (without `.portalconfig/`), read-only like EcoFlux? It's public once committed: its names, GUIDs, page content and 26 web files. Recommended: yes, keeping the web file contents too, since they're small and `docs` will list them.
2. **Scope of 0.6.0.** All of lint, `docs`, `test` and `diff` for pages, or lint and `docs` first, with `test` and `diff` in a later release? Recommended: lint and `docs` in 0.6.0, `test` and `diff` in 0.7.0. The semantics should be checked against a real environment (verification 1–3) before a policy can depend on them.
3. **Nested Restrict Read.** Build on intersection (the documented "won't be available to those roles") until verified? Recommended: yes, and say so in the docs.
4. **Diff level.** Rule-level as in 0003, or effective per branch? Recommended: effective per branch, when `diff` gets pages. It's what the reviewer needs, and it's the same "decisions, not text" rule as grants.
5. **The template Grant Change rule.** `page-rule-no-page` fires on "Grant Change to Content" in all three sites we have. Warning, info, or skip rules that have neither a page nor a role? Recommended: info when there's neither a page nor a role (it does nothing, but is harmless), warning when there are roles but no page (someone meant something).
6. **Anonymous Users role in a rule.** Treat it as "everyone" (conservative) until verified? Recommended: yes, plus the `page-rule-anonymous` warning.
7. **Page names in `test`.** Identify pages by URL path (`page "/internal/"`), by name, or both? Recommended: URL path. Names repeat across branches, and the URL is what people talk about.
8. **Code sites.** Run only the rule-record lint rules on code sites in 0.6.0, as above? Recommended: yes.
9. **Web files.** Include web files in effective access (who can download them) in 0.6.0, or pages only? Recommended: pages only, with the scope shown in `docs`. Web files come with their own docs section later.
10. **Inactive records.** Answered: fixed in PR #25, merged. Fix first, as its own PR in 0.6.0: skip records with `statecode: 1` in the model, so lint, `docs`, `test` and `diff` stop reporting inactive table permissions and settings? And in `diff`, is activating a record wider and deactivating it narrower? Recommended: yes to both. It's a bug in every release so far, and the page work depends on it.
11. **Unrestricted pages next to restricted ones.** Leave "[Admin] Delete Course" to `docs`, `test` and `diff`, or add a heuristic lint rule (an unrestricted page whose siblings are all restricted)? Recommended: no heuristic rule. It would guess at intent, and the policy statement says it exactly.

## As built

Design: this document (draft 2, questions 1–11 answered; question 8 not as recommended). User reference: `rules/` for the eight rules and the README's `pageslens docs` section for `pages.md`.

- The model reads web pages (`webPages`: root and content pages, with parent, root page, partial URL and site map flag), a rule's `scope`, and the site's `layout`. Effective access is in `src/graph/pages.ts`: per root page, its URL, ancestors, the Restrict Read and Grant Change rules on its path, and who can read it.
- The eight lint rules of "Lint rules" are built as designed, classic sites only (decision 8). They skip inactive rules and pages, since those aren't in the model (PR #25).
- `docs` writes `pages.md` for a classic site: a table of root pages in URL order (who can read, the Restrict Read and Grant Change rules that decide it, hidden from the site map), the Grant Change rules with roles, every rule with its right, page, roles and scope, and the inactive pages and rules. The index links it and counts pages, open pages and rules. Nothing changes for code sites.
- Fixtures: `test/fixtures/registration/` (the real classic download, without `.portalconfig/`, decision 1) and `test/fixtures/classic-pages/` (hand-written). The trimmed `test/fixtures/classic/` has no pages, so its "Grant Change to Administrators" now reports `page-rule-no-page`.
- Interpretations made while building:
  - **Several Restrict Read rules on one page unite**: a user who passes any of them passes that page's level. Microsoft only calls it a conflict; uniting is the reading that gives more access (design rule 1), and `page-rules-conflict` reports it. Levels still intersect.
  - A finding can carry its own severity (`RuleFinding.severity`), for the rules whose severity depends on the case: `page-rule-no-page` (info with no role), `page-rule-no-role` (info for Grant Change) and `page-parent-missing` (warning when the parent is inactive). A severity set in the config applies to every finding of the rule.
  - `page-rule-no-role` skips a rule with no page; `page-rule-no-page` reports it. So the template "Grant Change to Content" gets one info finding, not two.
  - An active page under an inactive page is reported by `page-parent-missing` as a warning, and `pages.md` shows it as "nobody". Pages below a missing parent or a loop are shown as "unknown" and aren't reported again.
  - `page-roles-not-subset` doesn't report a role that a Grant Change on the path lets in. `grant-change-overrides-read` counts a Grant Change on the page itself as well as above it, as Microsoft's "Restrict read doesn't work for admins" case is a rule on the home page.
  - A rule that points at a content page is read as being on its root page.
  - URLs are built from the partial URLs of the page and its ancestors. A page in a loop gets the URL of the path followed until the loop.
  - Downloads don't include the rule–publishing-state link (verification 5), so pageslens applies every rule in every state. A Restrict Read tied to a state can make a page look more restricted than it is while the page is in another state, and a Grant Change tied to one can make it look more open. A page's own publishing state isn't shown.
- Tested: `test/graph/pages.test.ts` (URLs, intersection, same-page union, Grant Change, built-in roles, broken paths, both fixtures); every rule's case in `classic-pages` and the real site's findings in `test/lint/lint.test.ts`; docs snapshots for `registration` and `classic-pages`.
- After "Verification results": the Anonymous Users role in a rule lets nobody in (`audienceOf` leaves it out), and `page-rule-anonymous` is an error (decision 12). The docs no longer call the intersection an assumption. `test/fixtures/registration/` was replaced by the new download, which adds the V pages: the real site now has a case for `page-roles-not-subset` (`/v1/v2/`, `/v1/v3/`), `grant-change-overrides-read` (`/v1/v2/`) and `page-rule-anonymous` (`/vAnon/`).
- **Still unknown:** which rule wins when a page has several Restrict Read rules (pageslens unites them; `page-rules-conflict` reports it), and what an Anonymous Users role does on a Grant Change rule (pageslens counts it as nobody, as on Restrict Read).

## Sources

- Set page permissions (Power Pages): https://learn.microsoft.com/power-pages/security/page-security
- Web page access control rule, Dataverse reference (right, scope, status, the publishing state and web role N:N): https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/mspp_webpageaccesscontrolrule
- Web page, Dataverse reference (parent, root, language, partial URL, publishing state): https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/mspp_webpage
- Publishing states, state-based control rules: https://learn.microsoft.com/power-pages/configure/publishing-states#state-based-control-rules
- Single-page applications in Power Pages (server returns the root page; page-level security in client code): https://learn.microsoft.com/power-pages/configure/create-code-sites

Not verified this pass: the NTFS and SharePoint comparisons are from general knowledge, not a source read for this spec; and whether page access rules interact with the site's `Authentication/Registration` settings (they shouldn't).
