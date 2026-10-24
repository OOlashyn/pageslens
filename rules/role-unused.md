# role-unused

**Default: info**

A web role isn't used by any table permission, page access rule or website access. The built-in Anonymous Users and Authenticated Users roles are skipped.

## Why it matters

An unused role does no harm, but it makes the access model harder to read and may be a leftover from a removed feature, or a role whose permissions were lost.

## How to fix

Delete the role if it's no longer needed, or add the permissions it was meant to have.

pageslens only sees the site configuration, so a role used only to group contacts (with no permissions) is also reported. Set the rule to `off` if that's how your site uses roles.
