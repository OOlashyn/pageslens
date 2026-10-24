# webapi-wildcard-fields

**Default: error**

Web API is enabled on a table (`Webapi/<table>/enabled = true`) and its fields setting is `*`.

## Why it matters

`*` exposes every column of the table to every role that has a table permission on it, including columns added later. Microsoft is retiring wildcard support in Web API fields settings, so sites that rely on it will also stop working.

## How to fix

Replace `*` in `Webapi/<table>/fields` with the comma-separated logical names of the columns the site reads or writes. Include `_<lookup>_value` for lookups the site reads.
