# multiple-authenticated-roles

**Default: error**

More than one web role has `authenticatedusersrole: true`. Each role involved gets a finding.

## Why it matters

The Authenticated Users role is the one Power Pages gives every signed-in user automatically. A site must have exactly one. With two, it's unclear which one applies, and permissions granted to the other may not reach users.

## How to fix

Keep one role flagged as the Authenticated Users role. Move the table permissions, page access rules and website access of the other role onto it, then clear the flag on the other role or delete it.
