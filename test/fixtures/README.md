# Test fixtures

Each fixture is a `.powerpages-site/` folder in the enhanced data model layout.

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

`Incident - Case Manager Contact`, its children `Incident Comment - Case Manager Parent` (a working parent chain with the parent's role) and `Incident Task - Inherited Roles` (no web role of its own, as the design studio makes child permissions, so it takes the parent's), and the `incident` Web API settings are clean and must produce no findings.
