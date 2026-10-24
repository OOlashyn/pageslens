# parent-chain-broken

**Default: error**

A Parent scope table permission can't be followed up to a permission that grants access, because:

- its parent permission (`parententitypermission`) doesn't exist in the site, or isn't set;
- a permission in the chain has no web role (a child permission with no role of its own takes its parent's, so only the permission the roles should come from is named); or
- the chain loops back on itself.

## Why it matters

A Parent scope permission only grants access to child records through its parent permission. If the chain is broken, the child permission grants nothing, and pages or Web API calls that read the child table fail.

## How to fix

Point `parententitypermission` at the right parent permission, make sure the permissions in the chain have web roles (a child either has none of its own and takes its parent's, or the same roles as its parent), and remove any loop.
