# Gap catalog

A **gap** is something a user of a contrast theme can't see, can't tell apart, or can't trust. Each entry: what the user sees, why, how it's detected (`flag` from compare.mjs, `scan` kind from scan.js, `grep` pattern), and the fix. Fix colors follow [`conventions.md`](conventions.md); the mechanics are in [`mechanics.md`](mechanics.md).

Severity:

- **Critical**: information or a control is gone (invisible thumb, missing focus, states identical).
- **Serious**: visible but misleading or very hard to read (dark icon on a dark theme, brand colors under `none`).
- **Moderate**: readable, but against convention (disabled shown with opacity, custom button without a border).
- **Minor**: polish (hover not shown, `-ms-high-contrast` leftovers that do nothing).

## Things that disappear

| Gap | Cause | Detect | Fix |
| --- | --- | --- | --- |
| Shape drawn with a background (switch thumb, radio dot, badge dot, progress fill, slider rail, divider) is gone | `background-color` becomes the background behind it | flag `disappears`, scan `invisible-shape`, `pseudo-shape` | Give it a border (a transparent one is enough, it becomes visible), or set system color backgrounds behind `forced-colors`, with `forced-color-adjust: none` on that part |
| Icon drawn with `mask-image` is gone | `mask-image` is painted with `background-color` | scan `mask-icon`, grep `mask-image`, `mask:` | Inside forced colors: `forced-color-adjust: none; background-color: CanvasText` (or the text color it sits on: `ButtonText`, `HighlightText`, `GrayText`). Better: inline SVG with `currentColor` |
| Focus indicator is gone | `box-shadow` focus ring is removed; `outline: none` / `outline-none` | screenshot of the focus state, grep `outline: ?none`, `outline-none`, `box-shadow` near `focus` | `outline: 2px solid` (+ offset). To hide it normally: `outline: 2px solid transparent` (Tailwind `outline-hidden`), which becomes visible in forced colors |
| Card, popover, menu or dialog edge is gone | Edge drawn with `box-shadow` or a background contrast | screenshot: content blends into the page | `border: 1px solid transparent` normally; it becomes visible in forced colors. Or `forced-colors:` border in `CanvasText` |
| Selection or highlight drawn with a gradient is gone | Gradients become `none` | grep `gradient(` | A border or system color background inside forced colors |
| Placeholder, skeleton, chart bars, color swatches gone | Backgrounds forced | screenshot | Swatches and charts that carry meaning: `forced-color-adjust: none` on the swatch (its color is the content), plus a border. Skeletons: a border |

## States that merge

| Gap | Cause | Detect | Fix |
| --- | --- | --- | --- |
| On/off, checked/unchecked, selected/unselected look the same | State shown only with background color | flag `states-merge` | Selected = `Highlight` fill with `HighlightText` content, unselected = `Canvas` with a `CanvasText`/`ButtonBorder` border. Also add a non-color cue where it fits (check mark, underline, position, bold) — that also fixes WCAG 1.4.1 |
| Current page in navigation, active tab, current step not marked | Underline or bar drawn with a background | flag `states-merge`, screenshot | Indicator as a `border-bottom` / `border-inline-start`, or a forced-colors background of `Highlight`. Also `aria-current` / `aria-selected` |
| Hover looks like rest | Hover shown with a background | screenshot of the hover state | `Highlight` border or text on hover (Fluent, Spectrum). Minor unless hover reveals something |
| Error/invalid field looks valid | Red border or background only | screenshot of the invalid state | Error icon and text (needed anyway); optionally a thicker border or `Mark` fill |
| Disabled looks enabled, or too dim to read | Disabled shown with `opacity` (kept) or a gray background (forced) | scan `dimmed`, `disabled-not-graytext` | `GrayText` for text, border and icons, `opacity: 1` inside forced colors |

## Wrong or clashing colors

| Gap | Cause | Detect | Fix |
| --- | --- | --- | --- |
| Icon keeps a dark (or brand) color on a dark theme | Explicit `fill`/`stroke`, or a color class on the `<svg>` itself | scan `icon-explicit-color`, `icon-own-color` | Let the icon inherit `currentColor`; otherwise override its color with the system color of the text it sits on |
| Brand colors inside a control in forced colors | `forced-color-adjust: none` with a non-system color left in the subtree | scan `brand-color-under-opt-out` | System colors for every color under `none`, including the focus outline |
| Brand shadow or gradient comes back | `none` also keeps `box-shadow`, `text-shadow`, gradients | scan `decoration-under-opt-out` | Set them to `none` inside forced colors, or replace with an outline |
| Mixed pairs: `HighlightText` text on `Canvas`, `Highlight` text on `Highlight` | Overrides that don't follow the pairs | screenshot in a real theme; review the overrides | Use the pairs in `mechanics.md` |
| Custom control looks like plain text | ARIA role on a generic element gets `CanvasText`, no border | scan `aria-widget-unstyled` | Use the native element (`<button>`, `<input>`), or add `border: 1px solid ButtonBorder` (or a transparent border normally) |
| Images or logos clash or vanish (dark logo on dark theme) | `url()` images and `<img>` are kept as-is | scan `url-background`, screenshot | Transparent-background images: give them a `Canvas`-colored plate or a light/dark variant via `prefers-color-scheme`; or SVG with `currentColor` |
| Whole region keeps the brand design | Large `forced-color-adjust: none` | scan `opt-out` on a large element | Remove `none` there; opt out only the small parts that need it |

## Code that does nothing or works against forced colors

| Gap | Detect | Fix |
| --- | --- | --- |
| `-ms-high-contrast` / `-ms-high-contrast-adjust` rules | grep `-ms-high-contrast` | Rewrite as `@media (forced-colors: active)` and `forced-color-adjust`; Edge 138 removed the old ones |
| Hex colors inside `@media (forced-colors: active)` | grep the media blocks for `#`, `rgb(`, theme tokens | System colors only |
| `prefers-contrast: more` styles that fight forced colors | grep `prefers-contrast`, `contrast-more:` | They also match in forced colors: check them in the forced screenshots, or exclude with `(prefers-contrast: more) and (forced-colors: none)` |
| Theme toggles that set `color-scheme` or inline colors under forced colors | screenshots of each app theme in forced colors | The forced output should look the same whatever the app theme |

## Static search patterns

Search the styles of the UI in scope (CSS, Sass, CSS-in-JS, Tailwind classes) for:

```
outline: none | outline: 0 | outline-none | focus:outline-none
box-shadow (on :focus, :focus-visible, focus:, focus-visible:, ring-)
mask-image | mask: | -webkit-mask
forced-color-adjust: none | forced-color-adjust-none | forcedColorAdjust
-ms-high-contrast
gradient(
fill="#… | stroke="#… | fill-[ | stroke-[ (and fill-/stroke- color classes)
opacity (on :disabled, [disabled], aria-disabled, disabled:)
prefers-contrast | contrast-more:
```

Tailwind `ring-*` utilities are `box-shadow`: a `focus-visible:ring-2` without an outline is a missing focus indicator in forced colors.
