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
| `role-unused` | Unused Role |

`Incident - Case Manager Contact`, its child `Incident Comment - Case Manager Parent` (a working parent chain), and the `incident` Web API settings are clean and must produce no findings.

## `classic/`

A trimmed copy of the PageLensPermissionTestEDM test site (an enhanced data model site), downloaded with `pac pages download` (pac 1.43.6, 2026-10-23). The folder itself is the site root. Kept: `website.yml`, the root lists `webrole.yml`, `sitesetting.yml`, `webpagerule.yml` and `websiteaccess.yml`, the 3 files in `table-permissions/`, and `.portalconfig/manifest.yml` and `portallanguage.yml` (to check `.portalconfig` is skipped). Removed: `.portalconfig/<org>-manifest.yml` (host name and sync checksums), web pages, templates, snippets, forms, web files, link sets, page templates and the other root lists. File bytes are as pac wrote them, CRLF included.

It's the `--modelVersion 1` shape (`adx_enhancedauthorization` in `website.yml`); blank relationship keys (`adx_contactrelationship: `) and omitted ones (Feedback, global scope) both appear. The `--modelVersion 2` keys (`adx_childTablePermissions`, `adx_permissionfetchxml`, blank role lists) are covered by inline cases in `test/adapters/classic-site.test.ts`.

Expected lint findings:

| rule | record |
|---|---|
| `permission-no-role` | Access to Assets Condition Logs (parent scope under Access to the Accounts Assets, no web role of its own) |
| `global-write-anonymous` | Feedback (global create, includes Anonymous Users) |
| `global-write-authenticated` | Feedback (global create, includes Authenticated Users) |

Access to the Accounts Assets (account scope with `adx_accountrelationship`, role Manager) is clean, and every role is used.
