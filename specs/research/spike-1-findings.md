# Spike 1: `.powerpages-site/` key names (EcoFlux, code site)

Run 2026-10-22, read-only, on the EcoFlux project's `site/ecoflux/.powerpages-site/` (225 files). Copied into `test/fixtures/ecoflux/` minus `.portalconfig/<org>-manifest.yml`. Parent/contact/account relationship keys confirmed from Microsoft's `create-table-permission.js` (power-pages plugin 2.1.0), since EcoFlux has no parent-scope permissions.

## Layout

- `website.yml` at the root: `id`, `name`, `defaultlanguage`, `headerwebtemplateid`, `footerwebtemplateid`, `defaultbotconsumerid`, `website_language`.
- `.portalconfig/`: `manifest.yml` (`{}`), `English.portallanguage.yml`, `<org-host>-manifest.yml` (per-environment sync state: `adx_<table>` → `RecordId`, `CheckSum`, `IsDeleted`). Not site configuration; the adapter skips `.portalconfig/`.
- One folder per kind. Flat folders: `web-roles/*.webrole.yml`, `table-permissions/*.tablepermission.yml`, `site-settings/*.sitesetting.yml`, `webpage-rules/*.webpagerule.yml`, `website-accesss/*.websiteaccess.yml` (sic, three s), `page-templates`, `publishing-states`, `sitemarkers`, `bot-consumers`, `site-languages`.
- Nested folders: `web-pages/<slug>/` (base page + `content-pages/<lang>/` localized copy), `web-templates/<slug>/`, `content-snippets/<slug>/<lang>/`, `weblink-sets/<slug>/<lang>/`, `web-files/<name>/` (file + `.webfile.yml`).
- Side files: `<Name>.<kind>.<field>.<ext>`, e.g. `Home.webpage.copy.html`, `.summary.html`, `.custom_css.css`, `.custom_javascript.js`, `Header.webtemplate.source.html`, `Footer.contentsnippet.value.html`. The field name is the segment before the extension.
- Fields with no value are omitted from the YAML (e.g. a secret setting has `id` and `name` only).
- File names are derived from the record name and are not stable identifiers; `id` is.

## Records the MVP needs

**Web role**: `id`, `name`, `anonymoususersrole` (bool), `authenticatedusersrole` (bool).

**Table permission**: `id`, `entityname` (the permission's display name), `entitylogicalname` (table), `scope` (int), `read` `write` `create` `delete` `append` `appendto` (bool), `adx_entitypermission_webrole` (GUID list, omitted when empty).

- Scope: 756150000 Global, 756150001 Contact, 756150002 Account, 756150003 Parent, 756150004 Self.
- Contact scope → `contactrelationship`; Account scope → `accountrelationship`; Parent scope → `parententitypermission` (GUID of the immediate parent) + `parentrelationship` (1:N relationship schema name).
- Microsoft's script also requires child roles to be a subset of the parent's roles.

**Site setting**: `id`, `name` (e.g. `Webapi/dwcrm_asset/enabled`), `value` (YAML scalar: `true` is parsed as a boolean, a field list as a string), optional `description`, `source`.

- Web API: `Webapi/<table>/enabled`, `Webapi/<table>/fields` (comma-separated, includes `_x_value` lookup columns), `Webapi/error/innererror`.
- Code site marker: `CodeSite/Enabled = true`.

**Web page rule**: `id`, `name`, `right` (int), `webpageid` (optional), `adx_webpageaccesscontrolrule_webrole` (GUID list, optional).

**Website access**: `id`, `name`, `manage*` / `previewunpublishedentities` flags, `adx_websiteaccess_webrole` (GUID list, optional).

## Findings in EcoFlux worth a rule

- All 4 Account-scope permissions have no `accountrelationship`. Microsoft's script refuses to create that. New rule candidate `scope-relationship-missing`. To confirm in an environment whether such a grant works.
- `Webapi/error/innererror = true`: detailed errors exposed to callers. Rule candidate for later (`webapi-inner-errors`).
- `Authentication/Registration/OpenRegistrationEnabled = true`: relevant to the `open-registration` policy check in M2.

## Still open

- Standard data model detection: assumed to show `adx_`-prefixed keys (e.g. `adx_name`) in `website.yml`. Needs a standard-model download to confirm.
- Classic site download: to compare with this layout once Oleksandr builds the classic sample.
