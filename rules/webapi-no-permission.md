# webapi-no-permission

**Default: warning**

Web API is enabled on a table, but no table permission with a web role covers that table.

## Why it matters

Every Web API call to the table is refused, so the page that uses it fails at runtime. Often the permission was created in one environment and never captured, or its role was removed.

## How to fix

Add a table permission for the table with the web roles that should call it, or disable Web API on the table if nothing uses it.
