# How forced colors works

Sources: [CSS Color Adjustment 1](https://www.w3.org/TR/css-color-adjust-1/#forced-colors-properties), [CSS Color 4 §6.2](https://www.w3.org/TR/css-color-4/#css-system-colors), [Media Queries 5](https://www.w3.org/TR/mediaqueries-5/#forced-colors), [MDN forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors), [Microsoft Edge blog](https://blogs.windows.com/msedgedev/2020/09/17/styling-for-windows-high-contrast-with-new-standards-for-forced-colors/).

Windows contrast themes (Settings → Accessibility → Contrast themes, or left Alt + left Shift + Print Screen) replace every app's colors with a small user-picked palette. Chromium browsers and Firefox apply it to web pages as **forced colors mode**, detected with `@media (forced-colors: active)`. Safari and macOS have no forced colors; macOS "Increase contrast" is `prefers-contrast: more`.

## Who uses it

People with low vision, light sensitivity, migraines, color vision deficiencies, or who get overstimulated easily. Public numbers are few and old:

- **About 4% of active devices** (Microsoft telemetry). Melanie Richards of Microsoft Edge in her [September 2019 W3C talk](https://www.w3.org/2019/09/Meetup/speaker-melanie.html): *"Last time we checked it was used on four percent of active devices."* [Smashing Magazine](https://www.smashingmagazine.com/2022/06/guide-windows-high-contrast-mode/) cites it from her talk "The tailored web". No published method; it counts devices, not people, and high contrast mode was Windows-only then.
- **Between a third and half of people with low vision.** [WebAIM's Survey of Users with Low Vision #2](https://webaim.org/projects/lowvisionsurvey2/) (September 2018, 248 responses): 30.6% list "high contrast mode or settings" among their assistive technology; 51.4% named a high contrast mode they use, 71.2% of those light text on dark. Not Windows-specific; a small, self-selected sample.

Not in these numbers: macOS "Increase contrast", Firefox's own color override, and color-changing browser extensions.

## What the browser changes

Under the default `forced-color-adjust: auto`:


| Property                                                                                 | In forced colors                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color`                                                                                  | The element's text color (see below), usually `CanvasText`                                                                                                                              |
| `background-color`                                                                       | The pair of that text color, usually `Canvas`. **The alpha is kept**: transparent stays transparent                                                                                     |
| `border-color`, `outline-color`                                                          | The text color. **Transparent borders and outlines become visible**                                                                                                                     |
| `text-decoration-color`, `caret-color`, `column-rule-color`, `stop-color`, `flood-color` | A system color                                                                                                                                                                          |
| `box-shadow`, `text-shadow`                                                              | `none`                                                                                                                                                                                  |
| `accent-color`, `scrollbar-color`                                                        | `auto`                                                                                                                                                                                  |
| `background-image`                                                                       | Gradients become `none`; `url()` images are kept                                                                                                                                        |
| SVG `fill`, `stroke`                                                                     | Browsers give `<svg>` `forced-color-adjust: preserve-parent-color`: explicit colors are **kept**; `currentColor` follows the forced text color, unless the `<svg>` sets its own `color` |
| System colors written by the author                                                      | Kept                                                                                                                                                                                    |
| `opacity`, `mask-image`, `filter`, transforms                                            | Kept (not color properties)                                                                                                                                                             |
| `color-scheme`                                                                           | `light dark`                                                                                                                                                                            |


- **The forced color depends on the element.** Normal text gets `CanvasText` on `Canvas`, links `LinkText`, `<button>` `ButtonText` on `ButtonFace`, inputs `FieldText` on `Field`. ARIA roles don't count: `<div role="button">` gets `CanvasText`, with no button border.
- **Text gets a backplate**: a `Canvas`-colored rectangle behind each line of text, so text over `url()` images stays readable. Authors can't style it; `forced-color-adjust: none` removes it.



## `forced-color-adjust`

Inherited. Values:


| Value                   | Effect                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (default)        | Forced as above                                                                                                                                                       |
| `none`                  | Nothing is forced, **including what** `auto` **removes**: `box-shadow`, `text-shadow` and gradients come back. Every color in the subtree must then be a system color |
| `preserve-parent-color` | For `<svg>`: explicit colors kept, `color` passes through only when inherited                                                                                         |


Use `none` only on the small part of a control that sets every color itself, and only inside `@media (forced-colors: active)`. A large `none` area keeps brand colors that may be unreadable in the user's theme.

## System colors

Keywords for the theme's palette, usable wherever a color goes (`border-color: ButtonBorder`). Outside forced colors they're the browser's defaults for the element's `color-scheme` (white `Canvas`, blue `LinkText`), not the design system's colors, so use them only behind the forced-colors media query.


| System color                                 | Meaning                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Canvas` / `CanvasText`                      | Page background / normal text                                                                            |
| `LinkText` / `VisitedText` / `ActiveText`    | Links                                                                                                    |
| `ButtonFace` / `ButtonText` / `ButtonBorder` | Control background / text / border                                                                       |
| `Field` / `FieldText`                        | Input background / text                                                                                  |
| `Highlight` / `HighlightText`                | Selected or active item background / its text                                                            |
| `SelectedItem` / `SelectedItemText`          | Selected item (newer alternative to `Highlight`)                                                         |
| `Mark` / `MarkText`                          | Marked text, like `<mark>`                                                                               |
| `GrayText`                                   | Disabled                                                                                                 |
| `AccentColor` / `AccentColorText`            | Avoid: takes its value from `accent-color` outside forced colors, and some browsers return a fixed value |


Deprecated keywords (`Window`, `WindowText`, `ButtonHighlight`, `ThreeDFace`, …) map to the ones above; use the current names.

**Pairs.** A theme only guarantees contrast within the pairs the spec lists:


| Background                      | Readable on it                                        |
| ------------------------------- | ----------------------------------------------------- |
| `Canvas`                        | `CanvasText`, `LinkText`, `VisitedText`, `ActiveText` |
| `ButtonFace`                    | `ButtonText`                                          |
| `Field`                         | `FieldText`                                           |
| `Highlight`                     | `HighlightText`                                       |
| `SelectedItem`                  | `SelectedItemText`                                    |
| `Mark`                          | `MarkText`                                            |
| `Canvas`, `ButtonFace`, `Field` | `ButtonBorder` as a border                            |
| Any of the above                | `GrayText`, possibly at lower contrast                |


Anything else is a guess: `HighlightText` on `Canvas` can be invisible.

## Related media features

- `prefers-contrast` also matches in forced colors: `more` or `less` when the theme is clearly high or low contrast, `custom` otherwise. `prefers-color-scheme` matches the theme's palette too. So `prefers-contrast` and `prefers-color-scheme` styles also run under forced colors; make sure they don't fight the forced-colors styles.
- `-ms-high-contrast` and `-ms-high-contrast-adjust` are the old, non-standard Internet Explorer / EdgeHTML versions. [Edge removed them in version 138](https://blogs.windows.com/msedgedev/2025/06/30/removing-ms-high-contrast-and-embracing-standards-based-forced-colors-in-microsoft-edge/). Rewrite them as `forced-colors` and `forced-color-adjust`.



## Browsers and themes

- **Chromium** (Chrome, Edge): DevTools → Rendering → "Emulate CSS media feature forced-colors", combined with `prefers-color-scheme` light or dark for the two emulated palettes. Playwright: `forcedColors: "active"`.
- **Firefox**: Settings → General → Fonts → Colors… → "Override the colors specified by the page".
- **Real Windows themes** (Aquatic, Desert, Dusk, Night sky in Windows 11, plus custom themes) have other colors than the emulated palettes. `Highlight` and `GrayText` in particular vary, so check at least one dark and one light real theme before a release.

