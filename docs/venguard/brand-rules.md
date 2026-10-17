# VenGuard project rules

Set by the VenGuard founders. Source of truth for the visual identity: the **Orange theme · logo suite**
boards (October 2026). These replace the earlier Deep Carbon / Hazard Orange palette and the navy/teal
palette in the website brief. Every page, component and asset must follow them.

## Identity

VenGuard is an **industrial-grade, offline IoT gas safety device** — not a generic smart-home gadget.
Tone: calm, competent, honest. No cute illustrations, no stock photography, no claims ahead of testing.

The product is a **4-stage system** (pitch deck, Team Dibyo Drishty):

1. **24/7 smart tracking**: the detector ("the brain") watches the air continuously.
2. **Automatic isolation**: the smart solenoid valve cuts off the gas by itself.
3. **Forced ventilation**: the Active Ventilation Relay switches on the exhaust fan to purge the gas.
   The fan needs mains power; the shut-off does not.
4. **Live IoT telemetry** (optional Connected plan): dashboard and alerts.

## Logo

Source of truth: **`docs/venguard/VenGuard_Logo_Guidelines.docx`** (Brand Identity Guidelines, Logo
Usage Standards v1.0, October 2026). It replaces the earlier wave-and-bar logo.

- The logo is a **navy shield with two Signal Orange guard stripes forming a "V"**, then the wordmark
  "VenGuard" (artwork, never typed, always in English, no Bangla inside the lockup, no tagline attached).
- Logo colours: Guardian Navy `#0C2F4E` (shield, wordmark), Signal Orange `#FA5806` (stripes),
  Deep Navy `#07192C` (dark backgrounds).
- Versions: **primary** on white and light; **reversed** (white shield and wordmark, orange stripes) on
  Deep Navy, dark mode and the footer; **symbol only** for app icons, favicons and avatars (reversed symbol
  on Deep Navy); one-colour versions for print and devices (see the guide).
- Website header: primary, top-left, 36–40 px tall (31 px on phones, never under 120 px wide).
  Clear space at least 1x (x = logo width ÷ 9).
- Files: `venguard/assets/img/logo/` (named as in guide §14), `favicon.svg`, `favicon-32.png`,
  `apple-touch-icon.png`, `og-image.jpg`. Markup: `venguard/templates/partials/logo.html`.
  These SVGs are traced from the high-resolution artwork in the guide. **When the designer delivers the
  vector master (guide §14), replace the files and keep the names**; nothing else needs to change.
- **On the device the logo is one colour only** (navy or white). Orange never sits next to a status light.

## Colour palette

| Token | Name | Hex | Use |
|---|---|---|---|
| `--orange` | VenGuard Orange | `#E85D0C` | Wave, icons, large display type, packaging |
| `--orange-deep` | Deep Orange | `#B8460A` | Orange **text** on white/sand |
| `--navy` | Guard Navy | `#0B2A4A` | Bar, wordmark, headings, brand panels |
| `--sand` | Sand | `#FBF1EA` | Warm backgrounds |

Device status colours (never orange, so the logo can't be mistaken for a status):

| Token | State | Hex |
|---|---|---|
| `--safe` | Safe | `#1E9E5A` |
| `--caution` | Caution | `#F5C400` (ISO yellow) |
| `--gas-off` | Gas off | `#D7263D` |

Accessibility: white text on `#E85D0C` is only 3.5:1, so buttons use `--btn` `#C94E0A` (4.6:1) with
white text. Small orange text uses Deep Orange on light, `#FF8A4C` on navy.

## Themes

The website has a **Day** theme (default: white / sand surfaces, navy text) and a **Night** theme (deep navy).
Visitors switch in the header; with no choice saved, the site follows the device setting. Navy brand panels
(pricing, evidence, call-to-action, footer) look the same in both themes. All colours are semantic tokens
in `venguard/assets/css/venguard.css`; components never use raw hex values.

## Coding standards

- Semantic HTML5: one `<h1>` per page, landmarks (`header`, `nav`, `main`, `footer`), real `<button>`s and `<a>`s,
  lists for lists, `<table>` for tables, labels for every form field.
- Clean CSS: design tokens as custom properties, no inline styles in templates, no `!important` except
  for reduced-motion overrides.
- **Never use placeholder text for pricing or contact details.** If a value is not known, the element is
  not shown at all (`venguard/site.json` leaves it empty; templates hide empty values).

## Confirmed figures (source: VenGuard HCD Submission v4)

| Item | Value |
|---|---|
| Retail price, VenGuard Home kit | BDT 3,500 |
| Wholesale (dealer) price | BDT 2,800 (dealer keeps BDT 700) |
| Pre-order deposit | BDT 500, refundable |
| Connected plan | BDT 550 per year |
