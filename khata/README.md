# Khata and paper website

Bilingual (Bangla default, English) site for the khata and paper venture: khatas printed in a school's
name, A4 paper for copy shops, and 200-page ring khatas for students. Built the same way as the
Rod Bondhu site (`../rodbondhu/`).

Published at `/Khata/` (Bangla) and `/Khata/en/` (English). **Not launched yet:** while
`site.json → launched` is `false` the pages carry `noindex`, are left out of the sitemap and are not
linked from the OASIS home page.

```
khata/
├── site.json          brand name, contacts, every price and offer
├── templates/         base.html, partials/, pages/home.html  ({{ t("বাংলা", "English") }})
├── assets/            css/khata.css, js/khata.js, fonts/, img/ (published as-is)
└── tools/build.py     renders the page in both languages and copies assets
```

Build and preview from the repository root:

```bash
python3 scripts/build.py && python3 scripts/check_links.py
python3 -m http.server 8000 -d _site     # http://localhost:8000/Khata/
```

## Common edits

| Task | Where |
|---|---|
| Brand name (now a working title) | `site.json → brand` |
| Phone, WhatsApp, Facebook, delivery area | `site.json → contact` (empty = not shown; a WhatsApp number turns on "Send on WhatsApp" in the memo) |
| Any price, minimum order or discount | `site.json → school`, `a4`, `ring` (the calculators and the rate sheet both read them) |
| Hide every price | `site.json → show_prices: false` (the builders then only make a quote request) |
| Offers: free cover design, free delivery, cash on delivery | `site.json → school.free_design_from`, `ring.free_delivery_pack`, `ring.cod` |
| Go live | `site.json → launched: true`, then add a card to `oasis-site/index.html` if wanted |

## Rules

- **Real values only.** No placeholder prices or contact details: leave a value empty and it is not shown.
- **Only claims we can stand behind.** No paper-quality claims (brightness, "jam-free", machine brands) and no
  "mill" or "factory" wording until there is a test or a document for them.
- **Drawn, not photographed.** The khatas, ream and memo are drawn in CSS so that what a visitor sees is their
  own order, not a stock picture. Add photographs only of our real products.
- The price rules live twice: `assets/js/khata.js` (calculators) and `rate_ranges()` in `tools/build.py`
  (rate sheet). Change them together.
- Colours are tokens at the top of `assets/css/khata.css`; templates carry no inline styles.
