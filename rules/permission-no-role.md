# permission-no-role

**Default: warning**

A table permission has no web role, or only references web roles that don't exist in the site.

## Why it matters

A table permission only grants access to the web roles it is associated with. Without one it does nothing, which usually means a role assignment was lost.

## How to fix

Associate the permission with the intended web roles (`adx_entitypermission_webrole`), or delete the permission if it's no longer needed.
