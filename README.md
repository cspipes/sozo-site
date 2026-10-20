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
src/worker.js      handles /api/* (today: the pilot sign-up form)
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

## One-time Cloudflare setup

1. **Connect the repo.** In the Cloudflare dashboard, go to Workers & Pages > Create > Import a
   repository. Pick `cspipes/sozo-site` (authorize the Cloudflare GitHub app for just this repo). Keep
   the project name `sozo-site`. The build command can stay empty and the deploy command is
   `npx wrangler deploy`. Save and deploy.
2. **Add the domain.** In the new `sozo-site` Worker, go to Settings > Domains & Routes > Add > Custom
   domain. Add `sozoware.com`, then add `www.sozoware.com` too.
3. **Send www to the bare domain.** Go to the sozoware.com zone > Rules > Redirect Rules. Use the
   "Redirect from WWW to root" template (301, keep the path and query string).
4. **Email.** Go to the sozoware.com zone > Email > Email Routing. Turn it on and route
   `hello@sozoware.com` to your inbox. The site lists that address as the contact.

## Turn on the pilot form

The form posts to `/api/pilot`, which checks the entry and forwards it as JSON to a webhook you
choose. Until a webhook is set, the form shows people an error asking them to email
hello@sozoware.com, so no sign-up is lost silently.

1. **Make the webhook.** In Power Automate, create an instant cloud flow with the trigger "When an
   HTTP request is received". Use this request body schema:

   ```json
   {
     "type": "object",
     "properties": {
       "name": { "type": "string" },
       "agency": { "type": "string" },
       "email": { "type": "string" },
       "team_size": { "type": "string" },
       "source": { "type": "string" },
       "submitted_at": { "type": "string" },
       "country": { "type": "string" }
     }
   }
   ```

   Add the steps you want (for example, add a row to a SharePoint list and send yourself an email).
   Save the flow and copy the HTTP POST URL it gives you. Zapier, Make or a Slack incoming webhook
   work the same way.
2. **Give the URL to Cloudflare.** In the `sozo-site` Worker, go to Settings > Variables and Secrets >
   Add. Choose type Secret, name `FORM_WEBHOOK_URL` and paste the URL. Deploy.
3. **Optional spam check (Cloudflare Turnstile).** In the dashboard, go to Turnstile > Add widget for
   `sozoware.com`. Add the secret key to the Worker as a Secret named `TURNSTILE_SECRET_KEY`. Put the
   site key in `public/index.html` on the form: `data-turnstile-sitekey="..."`. Commit and push.

The form already has a hidden honeypot field that quietly drops most bots.

## Search engines

After the domain is live:

- Add `sozoware.com` in Google Search Console, verify it with the DNS record option (Cloudflare can
  add it for you), and submit `https://sozoware.com/sitemap.xml`.
- Do the same in Bing Webmaster Tools. It can import the site straight from Search Console.
- Check the link preview with LinkedIn's Post Inspector or opengraph.xyz.
