# webapi-inner-errors

**Default: warning**

The site setting `Webapi/error/innererror` is `true`.

## Why it matters

With the setting on, a failed Web API call also returns the inner error: the server-side error behind the response, which can include the exception's type and stack trace. That helps while building the site, and Microsoft's Web API walkthrough turns it on. On a live site it tells anyone who calls the API more about how the site works than they need, which makes probing it easier.

The default is `false`, so a site that never set it doesn't fire.

## How to fix

Set `Webapi/error/innererror` to `false`, or remove the setting, on every site that isn't a development site. If the development site is downloaded into the same repository, ignore the finding for that site in its `pageslens.config.yaml`.

See [Site settings for the Web API](https://learn.microsoft.com/power-pages/configure/web-api-overview#site-settings-for-the-web-api).
