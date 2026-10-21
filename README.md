# sozoware.com

The Sozo marketing site. Plain HTML, CSS and JavaScript with no build step, served by a
Cloudflare Worker. Pushing to `main` deploys it.

```
public/            everything the site serves
  index.html       the landing page
  privacy.html     /privacy
  404.html         shown for any page that doesn't exist
  css/site.css     all styles (color tokens at the top)
  js/site.js       headline word, mascot picker, parade, pilot form
  img/             Sozo wordmark and dog mascot (SVG)
  data/mascots.json  mascot artwork used by the picker and parade
  og-image.png     the preview image for links shared on LinkedIn, Facebook, iMessage, etc.
  robots.txt, sitemap.xml, site.webmanifest, favicons
  _headers         security and caching headers
src/worker.js      handles /api/* (today: the pilot sign-up form, emailed to Chris)
wrangler.jsonc     Cloudflare settings
tools/brand/       source brand sheets and mascot SVGs (not served)
```

## Change the site

Edit the files in `public/`, commit and push to `main`. Cloudflare redeploys in under a minute.
A push to any other branch gets its own preview link, so you can check a change before it goes live.

To run it on your own computer first: `npm install`, then `npm run dev`, then open
http://localhost:8787.

To add a page later, add `public/<name>.html` (it is served at `/<name>`) and add its address to
`public/sitemap.xml`.

## How it's set up in Cloudflare (done October 20, 2026)

- **Worker `sozo-site`** is connected to this repo. Every push to `main` deploys, and other branches
  get preview links.
- **Domains:** `sozoware.com` and `www.sozoware.com` are custom domains on the Worker. A redirect rule
  sends www to the bare domain, keeping the path and query string.
- **Email Routing:** every address @sozoware.com (catch-all) forwards to chris@pipesins.com. In
  Outlook, a rule tags mail sent to sozoware.com with the teal "Sozo" category.

## The pilot form

The form posts to `/api/pilot`. The Worker checks the entry, drops bots caught by the hidden honeypot
field, and emails the sign-up from `pilot@sozoware.com` to chris@pipesins.com (the `PILOT_EMAIL`
binding in `wrangler.jsonc`). Replying to that email goes straight to the person who signed up.

That address must stay a verified destination under Email Routing, or the email can't be sent. To
send sign-ups somewhere else, verify the new address there first, then change `destination_address`
in `wrangler.jsonc` and `MAIL_TO` in `src/worker.js`.

If delivery fails, the visitor sees a message asking them to email hello@sozoware.com, so a sign-up
is never lost silently. Failures also show up in the Worker's Logs tab.

Optional extras:

- **Also send sign-ups to another tool** (Power Automate, Zapier, a CRM). Add a Secret named
  `FORM_WEBHOOK_URL` to the Worker (Settings > Variables and Secrets). Each sign-up is then also
  posted there as JSON with `name`, `agency`, `email`, `team_size`, `source`, `submitted_at` and
  `country`.
- **Spam check (Cloudflare Turnstile)** if bots get past the honeypot. Go to Turnstile > Add widget
  for `sozoware.com`. Add the secret key to the Worker as a Secret named `TURNSTILE_SECRET_KEY`, and
  put the site key on the form in `public/index.html` (`data-turnstile-sitekey="..."`).

## Search engines

After the domain is live:

- Add `sozoware.com` in Google Search Console, verify it with the DNS record option (Cloudflare can
  add it for you), and submit `https://sozoware.com/sitemap.xml`.
- Do the same in Bing Webmaster Tools. It can import the site straight from Search Console.
- Check the link preview with LinkedIn's Post Inspector or opengraph.xyz.
