# Conventions: how Fluent UI and Spectrum style forced colors

Two large design systems ship forced colors styles for every component: Microsoft's **Fluent UI** (React v9 and Web Components) and Adobe's **Spectrum 2** (`@react-spectrum/s2`). Where they agree, that's the convention to follow. Where they differ, the recommendation says which to pick and why. Read the sources when a component isn't covered here:

- Fluent UI React v9: `packages/react-components/react-<name>/library/src/components/<Name>/use<Name>Styles.styles.ts` in [microsoft/fluentui](https://github.com/microsoft/fluentui). Search for `forced-colors`.
- Fluent UI Web Components: [Windows High contrast mode](https://learn.microsoft.com/en-us/fluent-ui/web-components/design-system/high-contrast) (accent button walkthrough, contrast chart).
- Spectrum 2: `packages/@react-spectrum/s2/src/<Name>.tsx` in [adobe/react-spectrum](https://github.com/adobe/react-spectrum). Search for `forcedColors`; the focus ring is in `style/spectrum-theme.ts`.

## Shared principles

Both systems:

1. **Write forced colors styles only for what the browser gets wrong.** Text, borders and native controls are left to the browser. Overrides are for state shown with backgrounds, shapes drawn with backgrounds, and icons.
2. **Selected, checked, on, current = `Highlight`** as the fill, with `HighlightText` for whatever sits on it.
3. **Disabled = `GrayText`** for text, border and icon, with `opacity: 1` (Fluent resets opacity explicitly).
4. **Hover = `Highlight`.** Forced colors removes hover backgrounds, so show hover by turning part of the control `Highlight`. There are two ways to do it:
   - **Color the edge.** Make the border `Highlight`, and the text too if you like. Spectrum colors only the button border. Fluent colors the border and text of subtle buttons and menu items.
   - **Invert the control.** Fill it with `HighlightText` and make the text and border `Highlight`. Fluent does this for buttons, with `forced-color-adjust: none` so the browser keeps the fill.
5. **`forced-color-adjust: none` on the element that sets every color itself**, usually a control's visual part (switch track, checkbox box, slider rail and thumb, an accent button). Fluent also uses it to remove the text backplate inside a filled control.
6. **Control borders = `ButtonBorder`** (Spectrum) or the forced text color (Fluent). Either way, every control keeps a visible edge.
7. **System colors only, never hex values**, so the styles work in every light and dark theme.

## Per pattern

| Pattern | Fluent UI | Spectrum 2 | Recommendation |
| --- | --- | --- | --- |
| **Focus indicator** | Leaves outlines to the browser (forced to the text color); menu items use a `Highlight` outline; buttons add a `ButtonText` border on focus | Every focus ring is `Highlight` | An `outline` (never only `box-shadow`). `Highlight` follows the Windows convention; `CanvasText` is the only color the spec guarantees against the `Canvas` page. Pick one and use it everywhere. |
| **Button** | Text and border forced; hover: `HighlightText` background, `Highlight` border and text, with `none` | Border `ButtonBorder`, hover `Highlight`, disabled `GrayText` | Keep the native button colors. Add a hover border or text in `Highlight` when hover is shown with a background. |
| **Primary / accent button** | `Highlight` background, `HighlightText` text and border, with `none`; hover and active swap them | Filled: `ButtonText` background with `ButtonFace` text, hover `Highlight`; outline variant: `ButtonText` text | A filled button stays filled: `Highlight` + `HighlightText` (Fluent), so it differs from a secondary button. |
| **Disabled button** | `ButtonFace` background, `GrayText` border, text and icon, `opacity: 1` | `GrayText` border, text and fill | `GrayText` everywhere, full opacity. |
| **Link** | Browser's `LinkText`; disabled link explicitly `GrayText` (links have no native disabled state) | `LinkText`, focus `Highlight` | Leave `LinkText` alone; style a disabled link `GrayText`. |
| **Switch** | Track checked: `Highlight` background, thumb `Canvas`; disabled: `GrayText` border and thumb; thumb otherwise `CanvasText` | Track `none`: border `ButtonBorder`, checked `Highlight`, disabled `GrayText` (border, and fill when checked) | Off: `Canvas` track, `CanvasText` (or `ButtonBorder`) border and thumb. On: `Highlight` track, `HighlightText` thumb. Disabled: `GrayText`. |
| **Checkbox / radio** | Disabled: `GrayText` label and indicator | Box with `none`: background `Canvas`, border `ButtonBorder`; checked `Highlight` fill with `HighlightText` check mark; invalid `Mark`; disabled `GrayText` | Native inputs need nothing. Custom ones: Spectrum's pattern. |
| **Tabs** | Subtle selected: `Highlight` border; filled selected: `ButtonText` background with `ButtonFace` text; hover: `Highlight` indicator | Selected indicator `Highlight`, selected text `Highlight`, disabled `GrayText` | The selected indicator (underline or bar) in `Highlight`. It must be a border or an element with a forced-colors background, not a plain background-colored bar. |
| **Menu / list option** | Hover: `Canvas` background, `Highlight` border and text; focus outline `Highlight` | Focused or selected row: `Highlight` background, `HighlightText` text; check mark `Highlight` | Selected or active row: `HighlightText` on `Highlight`. Row dividers `ButtonBorder`. |
| **Progress bar / meter** | Track `CanvasText`, bar `Highlight` | Fill `ButtonText` | Fill `Highlight` on a track with a visible border, or the track in `CanvasText`. The filled part must differ from the empty part. |
| **Slider** | With `none`: rail `CanvasText`, filled part and thumb `Highlight`; disabled all `GrayText`; step marks `HighlightText` | Thumb `ButtonFace` with `ButtonBorder` border; filled track `Highlight`; track `ButtonText`; disabled `GrayText` | Rail `CanvasText`, filled track and thumb `Highlight` (or a bordered `ButtonFace` thumb). |
| **Invalid / error** | — | `Mark` for the invalid checkbox | Never rely on red: add an icon and error text. `Mark` is an option for an error fill. |
| **Icons** | Icon color follows the text color it sits on (`Highlight` on hover, `GrayText` disabled) | `currentColor` | Draw with `currentColor` and let the icon inherit. Override only icons with explicit colors. |
| **Data grids / tables** | — | Borders `ButtonBorder`, selected row `Highlight` with `HighlightText`, drop target `Highlight` | Same as menu options. |

## Safe pairs (Fluent UI contrast chart)

Fluent's chart for the Windows themes (aiming at 10:1). "Always" holds in custom themes too; "default themes" holds only in High Contrast Black and White.

| On this background | Always readable | In the default themes only |
| --- | --- | --- |
| `Canvas` (Background) | `CanvasText`, `LinkText`, `GrayText`, `ButtonText` | `Highlight` |
| `ButtonFace` (Button background) | `CanvasText`, `GrayText`, `ButtonText` | `LinkText`, `Highlight` |
| `Highlight` (Selected background) | `HighlightText` | — |

Mapping to the Windows setting names: `CanvasText` = Text, `LinkText` = Hyperlinks, `GrayText` = Disabled text (Inactive text), `Highlight`/`HighlightText` = Selected text, `ButtonFace`/`ButtonText` = Button text, `Canvas` = Background.

## Testing conventions

- Spectrum's docs simulate forced colors with a `[data-hcm]` attribute next to the media query, so docs can show the mode. That's a docs trick; real styles belong in `@media (forced-colors: active)`.
- Fluent's walkthrough lists what to check per state: rest and hover differ, focus follows the design, disabled isn't too dim, filled controls keep a fill.
