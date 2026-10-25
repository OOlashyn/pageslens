# page-rule-no-page

**Default: warning (info when the rule has no web role either)**

A page access rule has no web page, or its web page isn't in the site or is inactive.

Classic sites only (`pac pages download`). On a code site, the browser routes pages, so page access rules aren't checked.

## Why it matters

A rule applies to its page and the pages below it. Without a page it applies to nothing. Sites made from a template often have a Grant Change rule called "Grant Change to Content" with no page and no role: that one is reported as info, since it's harmless. A rule with roles but no page usually means someone meant to protect a page and the link was lost.

## How to fix

Set the rule's web page (`adx_webpageid`), activate the page if it was deactivated by mistake, or deactivate or delete the rule.
