# VenGuard project rules

Set by the VenGuard founders. These override earlier brand notes (including the navy/teal palette in
the October 2026 website brief). Every page, component and asset must follow them.

## Identity

VenGuard is an **industrial-grade, offline IoT gas safety device** — not a generic smart-home gadget.
Visual language: engineered, precise, calm under pressure. Think safety equipment and instrument panels,
not lifestyle tech. No cute illustrations, no gradients for decoration, no stock photography.

## Colour palette

| Token | Name | Hex | Use |
|---|---|---|---|
| `--carbon` | Deep Carbon | `#0B0F17` | Primary base: header, footer, dark sections, headings on light |
| `--paper` | Clean Off-White | `#F8FAFC` | Secondary surface: page background, cards on dark |
| `--hazard` | Hazard Orange | `#F97316` | Safety accent and **actions** (primary buttons, key links, focus) |
| `--safe` | Safe Green | `#10B981` | System normal / safe states only |
| `--warning` | Warning Yellow | `#FACC15` | Status indicators (attention, testing in progress) |

Derived neutrals (greys) are allowed for text and lines. Do not introduce other hues.
Orange text on white is only for large/bold text (contrast); body links use Deep Carbon with an orange underline.

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
