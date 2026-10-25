# Test fixtures

`ecoflux/` and `broken/` are `.powerpages-site/` folders (the code site layout). `classic/` is a classic site folder (`pac pages download`, `adx_` keys).

## `ecoflux/`

A copy of the EcoFlux demo code site (`pac pages download-code-site`), unchanged except that `.portalconfig/<org>-manifest.yml` was removed (it holds the source environment's host name and sync checksums, not site configuration). Used as the realistic smoke test and for docs snapshots.

Expected lint findings:

| rule | record |
|---|---|
| `scope-relationship-missing` | the 4 Account-scope (`756150002`) permissions, none of which has `accountrelationship`: Asset / Condition Log / Marketplace Listing - Asset Manager CRUD, and Chain of Custody - Logistics Partner ReadWrite. To confirm in an environment whether these grants work at all. |
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

Access to the Accounts Assets (account scope with `adx_accountrelationship`, role Manager) and its child Access to Assets Condition Logs (parent scope, no web role of its own, so it takes Manager from its parent) are clean, and every role is used.

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

`test/diff/git.test.ts` commits the `grants` and `classic` pairs to a temporary repository to test reading at refs, the working tree, `--merge-base` and a side with no site.
