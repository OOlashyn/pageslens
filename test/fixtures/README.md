# Test fixtures

`ecoflux/` and `broken/` are `.powerpages-site/` folders (the code site layout). `classic/`, `registration/` and `classic-pages/` are classic site folders (`pac pages download`, `adx_` keys). `solution-ecoflux/`, `solution-registration/` and `solution-broken/` are unpacked solutions (XML format, spec 0007).

## `ecoflux/`

A copy of the EcoFlux demo code site (`pac pages download-code-site`), unchanged except that `.portalconfig/<org>-manifest.yml` was removed (it holds the source environment's host name and sync checksums, not site configuration). Used as the realistic smoke test and for docs snapshots.

Expected lint findings:

| rule | record |
|---|---|
| `scope-relationship-missing` | the 4 Account-scope (`756150002`) permissions, none of which has `accountrelationship`: Asset / Condition Log / Marketplace Listing - Asset Manager CRUD, and Chain of Custody - Logistics Partner ReadWrite. To confirm in an environment whether these grants work at all. |
| `webapi-inner-errors` | `Webapi/error/innererror` = `true` |
| `role-unused` | none: roles flagged as Anonymous or Authenticated Users are built-in and skipped; Administrators is used by a page rule and website access |

No Web API wildcard fields, no permissions without a role, no global write.

## `broken/`

Hand-written, one deliberate case per rule. Each file with a case starts with a `#` comment naming the rule.

| rule | record |
|---|---|
| `global-write-anonymous` | Feedback - Anonymous Users Global Create |
| `global-write-authenticated` | Contact - Authenticated Users Global Write |
| `multiple-authenticated-roles` | Authenticated Users and Signed-in Users (one finding on each) |
| `permission-no-role` | Incident - No Role |
| `parent-chain-broken` | Comment - Missing Parent (parent id doesn't exist) |
| `parent-chain-broken` | Note - Parent Without Role (parent has no web role) |
| `scope-relationship-missing` | Contract - Case Manager Account |
| `webapi-wildcard-fields` | `Webapi/contact/fields` = `*` |
| `webapi-no-permission` | `Webapi/dwcrm_invoice/enabled` |
| `webapi-inner-errors` | `Webapi/error/innererror` = `True` |
| `permission-no-role` | Order - Inactive Role (its only role, Retired Role, is inactive) |
| `parent-chain-broken` | Survey Answer - Inactive Parent (parent is inactive) |
| `role-unused` | Unused Role |

`Incident - Case Manager Contact`, its children `Incident Comment - Case Manager Parent` (a working parent chain with the parent's role) and `Incident Task - Inherited Roles` (no web role of its own, as the design studio makes child permissions, so it takes the parent's), and the `incident` Web API settings are clean and must produce no findings.

`Survey - Inactive Anonymous Create` (global anonymous create) and the `Retired Role` web role are inactive (`statecode: 1`): they're left out of the model, so `global-write-anonymous` and `role-unused` must not fire on them.

## `classic/`

A trimmed copy of the PageLensPermissionTestEDM test site (an enhanced data model site), downloaded with `pac pages download` (pac 1.43.6, 2026-10-23). The folder itself is the site root. Kept: `website.yml`, the root lists `webrole.yml`, `sitesetting.yml`, `webpagerule.yml` and `websiteaccess.yml`, the 3 files in `table-permissions/`, and `.portalconfig/manifest.yml` and `portallanguage.yml` (to check `.portalconfig` is skipped). Removed: `.portalconfig/<org>-manifest.yml` (host name and sync checksums), web pages, templates, snippets, forms, web files, link sets, page templates and the other root lists. File bytes are as pac wrote them, CRLF included.

It's the `--modelVersion 1` shape (`adx_enhancedauthorization` in `website.yml`); blank relationship keys (`adx_contactrelationship: `) and omitted ones (Feedback, global scope) both appear. The `--modelVersion 2` keys (`adx_childTablePermissions`, `adx_permissionfetchxml`, blank role lists) are covered by inline cases in `test/adapters/classic-site.test.ts`.

Expected lint findings:

| rule | record |
|---|---|
| `global-write-anonymous` | Feedback (global create, includes Anonymous Users) |
| `global-write-authenticated` | Feedback (global create, includes Authenticated Users) |
| `page-rule-no-page` | Grant Change to Administrators (its page isn't in this trimmed copy) |
| `page-rule-no-page` (info) | Grant Change to Content (no page, no role) |

Access to the Accounts Assets (account scope with `adx_accountrelationship`, role Manager) and its child Access to Assets Condition Logs (parent scope, no web role of its own, so it takes Manager from its parent) are clean, and every role is used.

## `registration/`

A copy of the PagesLensEDM2 site, a Registration template site on the enhanced data model, downloaded with `pac pages download` (2026-10-24) after the spec 0005 checks were run on it, unchanged except that `.portalconfig/` was removed (it names the source environment). Web file contents are kept. Read-only like `ecoflux/`: don't edit it to make a test pass. Used for page access rules (spec 0005), docs snapshots, and as the download `solution-registration/` is checked against. `sitesetting.yml` is from a second download on 2026-10-25, after `ASP/Pagination/CardsPerPage` was moved to an environment variable (spec 0007); every other file was the same in both downloads.

What it has: 21 root pages, each with one `en-US` content page, all directly under Home except V2 and V3 under V1; 13 page access rules, two of them inactive (on Home); an inactive page (Contact us) and an inactive table permission (Feedback); rule scope `2` on the inactive "Restrict Read on Home"; "[Admin] Delete-Course" with no rule next to three admin pages restricted to C1 ASP. The V pages are the checks from spec 0005's "Verification results": `/v1/` restricted to C1 ASP with a Grant Change for C1 ASP, `/v1/v2/` restricted to Administrators, `/v1/v3/` to Authenticated Users, and `/vAnon/` to Anonymous Users.

Expected lint findings:

| rule | record |
|---|---|
| `page-rule-authenticated` | Restrict Read on C1 Courses Home (Authenticated Users with Administrators and C1 ASP) |
| `page-rule-no-page` (info) | Grant Change to Content (no page, no role) |
| `page-roles-not-subset` | Admin Only (`/v1/v2/`) and Allow Auth (`/v1/v3/`): their roles can't get past Restrict Read on v1 |
| `grant-change-overrides-read` | Admin Only (the Grant Change on `/v1/` lets C1 ASP in) |
| `page-rule-anonymous` | Allow Anon Only (`/vAnon/`) |
| `global-write-authenticated` | ASP C2 Course, ASP C2 Registration, ASP Contacts |
| `webapi-no-permission` | `Webapi/adx_webrole_contact/enabled` |
| `webapi-inner-errors` | `Webapi/error/innererror` = `true` |

## `classic-pages/`

Hand-written in the classic layout, for the page access cases the real site doesn't have: a nested branch (`/internal/`, `/internal/reports/`, `/internal/team/`), a Grant Change override (`/docs/`), two Restrict Reads on one page (`/shared/`), the Anonymous Users role (`/public/`), a missing parent (`/lost/` and its child) and a parent loop (Loop A and Loop B). Each page file with a case, and each rule in `webpagerule.yml`, has a `#` comment naming the lint rule (or `clean:`).

| rule | record |
|---|---|
| `page-rule-no-page` (info) | Grant Change to Content (no page, no role) |
| `page-rule-no-page` | Orphan Rule (its page isn't in the site) |
| `page-rule-no-role` | Locked Without Role (Restrict Read) |
| `page-rule-no-role` (info) | Grant Change Without Role (on Home) |
| `page-rule-anonymous` | Public Visitors |
| `page-rules-conflict` | Shared A and Shared B (one finding on each) |
| `page-roles-not-subset` | Managers and Partners (Partners can't get past Employees Only) |
| `grant-change-overrides-read` | Docs Readers (Writers Publish Docs lets Administrators in) |
| `page-rule-authenticated` | Members and Admins |
| `page-parent-missing` | Lost (missing parent), Loop A and Loop B (a loop) |

Employees Only, Managers Only, Writers Publish Docs and Signed-in Only are clean, as are Lost Child (below the break, not reported again) and Home's content page.

## `solution-registration/`

The PagesLensEDM2 solution, the same site as `registration/`, synced with `pac solution sync` into a `pac solution clone` project on 2026-10-25, the day of `registration/`'s `sitesetting.yml`. Read-only. It leaves out `primarydomainname` in `Assets/powerpagesites.xml` and the publisher's e-mail address in `Other/Solution.xml`.

It reads into the same records, model, side files and lint findings as `registration/` (`test/adapters/solution.test.ts`), apart from `ASP/Pagination/CardsPerPage`. That setting takes its value from the environment variable `dwcrm_CardsPerPage` (current value 20, default 18): the solution has the variable, and the download has only the setting's leftover `adx_value: 18`, so its value is unknown there.

## `solution-ecoflux/`

The EcoFlux solution, a `pac solution clone` project (`EcoFluxPortal.cdsproj`, `src/`) from the same environment as `ecoflux/`, without `primarydomainname` and the publisher's e-mail address. Read-only. It reads into the same model, side files, lint findings and docs as `ecoflux/` (the docs index adds the solution's name), with the same records. The export also had a web file named `.gitkeep`, left over from testing in the environment and not in the download; it was removed from the copy (2026-10-26).

## `solution-broken/`

Hand-written, small, and loadable: each component file starts with an XML comment saying what it tests. Expected lint findings: `global-write-anonymous` (Feedback - Anonymous Create), `webapi-no-permission` (`Webapi/contact/enabled`, from a variable's default), `webapi-inner-errors` (`Webapi/error/innererror`, from a variable's current value over its default). Variable-backed settings whose variable is missing, a secret, or has no value are read as not set. `Search/Enabled` is inactive, `Hello` (type 35, Server Logic) stays untyped, and `Layout`'s inline Liquid becomes text with its CRLF line endings normalised. The errors (two sites, a component of another site, an id that isn't its folder name, invalid `content` JSON, no `Assets/powerpagesites.xml`, the YAML format) are tested on copies in a temporary folder.

## `policies/`

Policies for `pageslens test`, each with every statement's expected result in a comment: `broken.policy.yaml` and `ecoflux.policy.yaml` for tables, the Web API and settings, and `registration.policy.yaml` for page statements against `registration/`.

## `diff/`

Pairs of small hand-written sites for `pageslens diff`, each `<case>/base` and `<case>/head`. Records match by GUID, so the pairs share GUIDs and the files that differ start with a `#` comment naming the class and kind they cause (or `clean:` for a difference that must cause nothing). Expected output is in `test/diff/diff.test.ts`, with text and Markdown snapshots in `test/diff/__snapshots__/`.

| case | layout | changes |
|---|---|---|
| `grants` | code | 8 wider, 4 narrower, 7 neutral: a new permission, scope changes (contact → global, contact → account, global → account), a contact relationship change, a parent chain fixed, a role added to a permission and inherited by its child, a removed permission, a privilege turned off, a removed role, a permission replaced by another with the same access, a grant global scope already covers, a role renamed, added, removed and recreated with a new id, a permission renamed. `contact` has the Web API enabled on both sides |
| `webapi` | code | 3 wider, 3 narrower: enabled on `account`, disabled on `incident`, a field added and one removed on `contact`, `*` on `dwcrm_invoice`, `*` replaced on `dwcrm_order`; a field change on `task`, which has the Web API off, must cause nothing |
| `roles` | code | 1 wider, 1 narrower: the Authenticated Users flag moves from Authenticated Users to Members |
| `settings` | code | 4 wider, 2 narrower: `Authentication/Registration/Enabled` removed on head (`false` → default `true`), `OpenRegistrationEnabled` added as `false`, `RequiresInvitation` turned off, `Webapi/error/innererror` turned on, an origin added to and one removed from `HTTP/Access-Control-Allow-Origin`; `Search/Enabled` must cause nothing |
| `neutral` | code | 4 neutral, nothing else: a role renamed and its file moved, a permission renamed and moved, a permission file renamed, a second permission with the same access, a grant global scope already covers |
| `layouts` | classic base, code head | 1 wider (write added to Assets - Manager); every other record is the same in the other layout and must cause nothing |
| `classic` | classic | 1 wider, 1 narrower, 1 neutral: the Web API enabled in `sitesetting.yml`, Anonymous Users taken off Feedback, a role renamed in `webrole.yml` |
| `inactive` | code | 1 wider, 1 narrower, 1 neutral: a permission activated (wider, `(activated)`), one deactivated (narrower, `(deactivated)`), a role deactivated (neutral) |
| `solution` | solution (XML) | 1 wider, 1 narrower, only environment variable values change: `dwcrm_InnerErrors` turns `Webapi/error/innererror` on, `dwcrm_ContactApi` turns the Web API off on `contact`. The comments are in the head's `environmentvariabledefinition.xml` files |
| `variables` | code | 2 wider: head moves `Webapi/contact/enabled` and `Webapi/error/innererror` to environment variables, whose values a download doesn't include. The other way round, both are narrower |
| `pages` | classic | 8 wider, 2 narrower, 3 neutral, page access only. Base is `classic-pages/` without its comments, plus an Archive page under `/internal/`. Head removes Employees Only (anyone can now read `/internal/` and the Archive page below it, one line; Partners can now read `/internal/reports/`; `/internal/team/` has the same readers from other rules), adds Partners to Docs Readers, takes Authenticated Users off Members and Admins, adds a Grant Change for Managers on `/members/`, adds a public News page, removes Locked, moves Account to `/my-account/`, renames Signed-in Only, sets Shared A's scope to exclude web files, and fixes Lost's parent (readers known again for Lost and Lost Child) |

`test/diff/git.test.ts` commits the `grants`, `classic` and `solution` pairs (the last as a `pac solution clone` project's `src/`) to a temporary repository to test reading at refs, the working tree, `--merge-base` and a side with no site.
