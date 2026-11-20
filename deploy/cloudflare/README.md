# venguard.tech on Cloudflare

`venguard-tech-worker.js` is a Cloudflare Worker (free plan, 100,000 requests a day) that serves the VenGuard
website at the root of **venguard.tech** and the team dashboard at **venguard.tech/team/**, from the site this
repository publishes. Visitors keep `venguard.tech` in the address bar; `www.venguard.tech` redirects to it.
`ORIGIN` at the top of the file is where the built site is published (GitHub Pages now; a Cloudflare Pages
address if the repository is made private, because GitHub's free plan serves Pages only from public repositories).

Tests: `node --test deploy/cloudflare/`

## Set up (once, in the Cloudflare account that holds venguard.tech)

1. **Workers & Pages → Create → Worker**, name it `venguard-tech`, **Deploy**, then **Edit code**: replace the
   code with this file's contents and **Deploy**.
2. The Worker → **Settings → Domains & Routes → Add → Custom domain**: `venguard.tech`. Again for `www.venguard.tech`.
   Cloudflare creates the DNS records and the certificate by itself.
3. Firebase console → Authentication → Settings → **Authorized domains → Add domain**: `venguard.tech`
   (Google sign-in on venguard.tech/team/).
4. Open https://venguard.tech/ and https://venguard.tech/team/. Then tell the developer, who switches the site's
   own address (`venguard/site.json` → `base_url`, dealer links) so search engines and QR codes use venguard.tech.

Email: **Email → Email Routing** (free) can forward e.g. `info@venguard.tech` to the company Gmail.
