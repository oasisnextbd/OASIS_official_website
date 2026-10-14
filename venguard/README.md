# VenGuard website

Bilingual (Bangla default, English) product site, built to the VenGuard Website Brief (v1.0, Oct 2026)
and the project rules in [`../docs/venguard/brand-rules.md`](../docs/venguard/brand-rules.md).

Published at `/VENGuard/` (Bangla) and `/VENGuard/en/` (English).

## Folder layout

```
venguard/
├── site.json              settings: prices, contacts, claims, tracking IDs, gallery, Connected config
├── templates/
│   ├── base.html          <head>, SEO tags, header/footer, cookie bar
│   ├── legal.html         layout for the legal pages
│   ├── pages/*.html       one file per page
│   └── partials/          logo, header, footer, icons and macros, forms, FAQ list, gallery…
├── assets/                published as-is: css/, js/, img/, docs/, video/
├── static/                published as-is at /VENGuard/ (legacy URLs)
├── assets-source/         original renders used to make the web images (not published)
└── tools/
    ├── build.py           renders every page in both languages
    └── make_factsheet.py  regenerates assets/docs/venguard-fact-sheet.pdf
```

## Build and preview

From the repository root:

```bash
pip install -r requirements.txt
python3 scripts/build.py && python3 scripts/check_links.py
python3 -m http.server 8000 -d _site     # http://localhost:8000/VENGuard/
```

GitHub runs the same build on every push to `main` and publishes `_site/`.

## How a page works

Each page in `templates/pages/` extends `base.html`. Copy is written once with both languages:

```jinja
<h2>{{ t("কীভাবে কাজ করে", "How it works") }}</h2>
```

`build.py` renders every page twice (Bangla at `/VENGuard/<page>/`, English at `/VENGuard/en/<page>/`),
with its own title, description, canonical URL and `hreflang` links, and writes `sitemap.xml`.
To add a page: create `templates/pages/<name>.html` and add it to `PAGES` in `tools/build.py`.

## Common edits

| Task | Where |
|---|---|
| Prices, deposit, Connected plan | `site.json → preorder` |
| Turn the Pre-order button off | `site.json → preorder.open: false` |
| A claim is confirmed by testing (CTO only) | `site.json → claims.*_confirmed: true` — "designed to" wording disappears |
| A certification is granted | `site.json → certifications_granted` |
| Status timeline | `site.json → status_timeline` (`done` / `current` / `next`) |
| Contact details | `site.json → contact` — **leave a value empty if it's not known; the site hides it** |
| Customer quote (written permission) | `site.json → testimonials` |
| Product photos / silent clips | `site.json → gallery.items` (see `assets/video/README.md`) |
| Logo | `templates/partials/logo.html` (one file) |
| Analytics | `site.json → tracking` |
| Order database | `site.json → endpoints.leads` (see `../backend/leads-sheet/README.md`) |
| Fact sheet PDF | `python3 tools/make_factsheet.py` after changing claims or prices |

## Built-in rules

- **Claims:** "closes in under 1 second", "no power needed" and "no internet needed" read as
  "designed to … · Testing in progress" until confirmed in `site.json`.
- **Privacy:** analytics load only after consent; names, phones and emails are never sent to analytics
  (`assets/js/analytics.js` strips them as a safety net).
- **Attribution:** `?utm_source=…`, `?dealer=CODE`, `?qr=TAG` are remembered for the visit and saved with the lead.
- **No placeholders:** empty contact values are not rendered.

## Tracking events

`cta_preorder_click` (with `position`), `whatsapp_click`, `call_click`, `email_click`, `factsheet_download`,
`faq_open`, `scroll_depth`, `video_play`, `audience_tab`, `language_switch`, `campaign_landing`,
`funnel_how_it_works`, `form_start`, `form_start_preorder`, `form_error`, `form_abandon`, `lead_submit`,
`lead_submit_error`, `payment_start`, `payment_fail`, `deposit_paid`, `preorder_submitted_unpaid`.
All are pushed to `window.dataLayer`.
