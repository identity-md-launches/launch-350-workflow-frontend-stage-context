# Geomean design system

## Overview

Geomean is a compact price observatory for people comparing two oracle series and managing retained history. The implemented interface is a light, quiet dashboard: dark green text, paper-colored backgrounds, white data panels and a pale green growth action. It emphasizes actual oracle readings, units and recoverable empty states.

The oracle chart leads the page; capacity is adjacent on wide screens. Trading and the explanation follow. A native disclosure holds technical deployment identifiers and recent events. This is one page with section anchors, not a route system. The root DESIGN.md requested in the general criteria is outside the explicitly permitted write paths; this file is its scoped replacement.

## Colors

Source: `web/src/styles.css:2`. Components use semantic tokens referencing a small hex palette. No dark theme or gradients are implemented.

| Semantic token | Value | Purpose |
| --- | --- | --- |
| `--page` | `#f5f7f4` | Page and amount-field background |
| `--surface` | `#ffffff` | Data cards and neutral buttons |
| `--subtle` | `#eef1ed` | Segmented controls, explanations, hover |
| `--border` | `#dce3dc` | Card structure and chart grid |
| `--control-border` | `#89968c` | Editable controls and secondary buttons |
| `--text` | `#1e3329` | Headings, body text, neutral dark action |
| `--muted` | `#5d6c63` | Descriptions, labels, chart axes |
| `--accent` / `--accent-hover` | `#d0e6ad` / `#c2db9b` | Primary growth button |
| `--accent-text` | `#284513` | Text on primary action |
| `--focus` | `#3d6519` | Three-pixel focus perimeter |
| `--standard` | `#197969` | Standard price line and read-status dot |
| `--truncated` | `#b35b29` | Dashed truncated price line |
| `--error` | `#9e3929` | Inline error messages |
| `--warning` | `#fff7e6` | Wallet/RPC warning surface |

Series are also identified by text and solid/dashed strokes. Status uses text as well as color. The growth action owns accent emphasis; trading actions use a neutral dark fill. Browser-measured text contrast is recorded in `docs/frontend/browser-results.json`: muted on white 5.54:1, muted on page 5.14:1, muted on the explanation surface 4.86:1, headings on white 13.46:1 and primary-button text 8.00:1. These apply to the measured opaque pairs, not every possible state.

## Typography

`web/src/styles.css:1` defines local **DM Sans Variable**, Latin, normal style, weight range 100–1000; the exported WOFF2 is about 37 KB. The page uses real variable weights 400–750. UI falls back to sans-serif. Addresses and identifiers use the platform monospace stack. The live browser confirmed the DM Sans font loaded.

- Root: 16px, unitless line-height 1.55. Body copy usually 15px; explanatory copy is 12–14px to support the dashboard's density.
- Page heading: `clamp(2rem, 3.4vw, 2.875rem)`, 500, line-height 1.15, tracking −0.05em.
- Section heading: 19px/600, 1.35, tracking −0.025em; 17px on narrow screens.
- Primary prices: 28px/500, then 24px on mobile; capacity: 48px/500.
- Eyebrows: 11px/650, uppercase presentation and 0.11em tracking. Brand sublabel is intentionally smaller decorative lettering.
- Fields remain at least 16px on mobile. Amount fields use 26px. Changing figures use tabular numerals.
- SVG axis text remains 11 CSS pixels at each viewport through measured chart dimensions. A native data table provides the same values at normal text sizes.

Headings balance their wrapping, descriptions use pretty wrapping, and identifiers wrap anywhere. Valuable addresses are fully available inside the deployment disclosure instead of being irretrievably truncated. Transaction amounts use bigint; display rounding is separate.

## Layout

Source: `web/src/styles.css:35` onwards. The header is bounded at 1440px; main/footer at 1312px including padding. Desktop main content has 32px inline padding, 52px top padding and a 24px grid gap. The main grid is `minmax(0, 1fr) 332px`. Cards use 26px padding; controls within groups use smaller 8–16px gaps.

At 70rem, the sidebar narrows to 300px, card padding becomes 22px and the swap's internal columns stack. At 55rem, the page becomes one column, navigation wraps under the header, and the wide single-column buffer can use two internal columns. At 38rem, main margins become 16px, card padding 20px/16px, the swap and buffer fully stack, and the price-unit selector wraps when it cannot display its full text. The sequence stays chart → capacity → trading → explanation.

`Chart` uses `ResizeObserver` to keep SVG coordinate width equal to rendered width; narrow charts show three x-axis labels instead of five. No offscreen horizontal chart is required. The optional table scrolls vertically. Native disclosures indicate hidden information.

Rendered reflow was tested at 1440, 880, 768, 390 and 320 CSS pixels, with no page overflow. Root text enlargement to 200% at 880px also passed. These are not claims of browser-native zoom, physical phone testing or RTL/localization testing.

## Elevation & Depth

The interface is predominantly flat. One-pixel borders divide surfaces and states. Only the selected time-window button has a restrained `0 1px 3px #1e332914` shadow. There are no overlays, fixed dialogs, image layers or sticky actions. Loading/error feedback stays in document flow.

## Shapes

Cards use an 18px radius (14px on small screens); controls use 9px; nested segmented buttons use 5px within an 8px container with 4px padding. The brand mark is 44px with a 13px radius. Pair badges are circular. The observation visualization uses 32 small rounded bars; it is decorative and is hidden from assistive technology because the numerical capacity is the authoritative value.

## Components

| Pattern/component | Source | Behavior and reuse |
| --- | --- | --- |
| App shell and cards | `web/src/App.tsx` | Header, section landmarks, 30-second read refresh, errors, deployment disclosure |
| Buttons | `.button`, `.primary`, `.dark`, `.full`, `.icon-button` | Native controls, visible focus, native disabled, explicit action names; only growth gets accent fill |
| Time selector | `.segmented` | Three native toggle buttons with `aria-pressed`; keyboard Tab then Space/Enter |
| Chart | `web/src/Chart.tsx` | `history`, `inverse`, `loading`, `hours` props; two distinguishable lines, full-window summary, table, history/error/loading states |
| Buffer panel | `web/src/App.tsx:113` | Live state, capacity field, permissionless growth; bound validation message and exact action before wallet confirmation |
| Swap | `web/src/Swap.tsx` | Quotes, decimal/slippage validation, explicit approval stages, expiration, minimum output and simulated transactions |
| Notices | `.notice`, `.warning`, `.transaction` | Persistent errors and live transaction status; no auto-dismissed toast carrying essential information |
| Native details | `Chart` and deployment disclosure | Keyboard-operable expansion with visible cue, no custom focus traps |

Native labels name fields; linked field errors focus the offending input. The first focusable element is a skip link. Interactive focus uses an offset 3px perimeter; forced-colors mode uses `Highlight`. The only motion is a 120ms button background/press transition (scale 0.96), enabled only when reduced motion is not requested. No page-load animations exist.

## Do's and Don'ts

- Start another section with `.card` and `.card-heading`, preserving heading order and the shared spacing.
- Reuse semantic color roles; keep series strokes and labels in agreement. Keep the accent on growth unless the primary task changes.
- Render unavailable live values as unavailable. Never insert invented history to fill the chart.
- Keep all contract configuration in the runtime manifest and all deployed ABI use bound to its exports.
- Use native controls and normal document flow. Expand meaningful technical identifiers in the existing disclosure pattern.
- Preserve reduced-motion behavior and visible focus; verify narrow chart text after changing chart dimensions.

Design review used Jakub Krehel's Better Interface (MIT), pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation follows the method adapted from Paul Bakaus's Impeccable (Apache-2.0), commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. See the attribution record in `docs/frontend/THIRD_PARTY.md`.
