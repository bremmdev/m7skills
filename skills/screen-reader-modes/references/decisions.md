# Verdicts: what each component gets

Every row of the inventory gets one **verdict**, a one-line reason, and the prediction per screen reader from [`roles.md`](roles.md). The mechanics behind the reasons are in [`mechanics.md`](mechanics.md).

| Verdict | Meaning | What to do |
| --- | --- | --- |
| **Browse** | Stays in browse mode, and should: links, buttons, check boxes, disclosures, dialogs, tables, lists, landmarks | Nothing |
| **Needed** | Switches to focus or forms mode, and needs to: text entry, selects, comboboxes, listboxes, sliders, spin buttons, tabs, action menus, trees, interactive grids, radio groups, editors | Check its keyboard is complete and that what users must hear is in the focused element's name, states or description |
| **Needless** | Switches, or takes browse mode away, without need: its content is to read, or Tab, Enter and Space are enough | Give it the role or element that stays in browse mode, and drop the arrow-key handling with the role |
| **Missing** | Needs keys browse mode keeps (arrows, Home/End, Page Up/Down, letters, Space as a key), but nothing switches the mode | Give it the widget role that matches its keyboard, or make it work with Tab, Enter and Space |
| **Broken** | Switches, but doesn't answer the keys its role promises, or hides what users need inside it | Add the keyboard the role promises, or change to a role that doesn't switch |

Per-screen-reader differences are part of the reason, not a verdict: JAWS keeping its mode on radio buttons, Orca switching on disclosure buttons, Narrator not switching for widgets. Note them; don't fix them.

## Decision order

Walk the questions in order; the first that matches gives the verdict.

1. **Judge what renders.** A library component, a role from a variable, a role set by script: use the rendered role (the map's scan, or the DOM in a browser tool). A role the browser ignores (invalid, or `none` on a focusable element) is judged by the role that's left. Code the project can't change keeps its verdict, with the fix through the library's props or a replacement.
2. **`role="application"`?** **Needed** only for a surface with its own complete keyboard model that no widget role covers (a drawing canvas, a game board, a slide or diagram editor, a map with its own keys), where everything users must know reaches them from focus (names, descriptions, live regions), the keys are documented in the UI, and any part meant for reading is wrapped in `role="document"`. Anything else is **Needless**: around content or a whole page, on a dialog, around a form, or around a widget that has its own role (the widget role already switches).
3. **Does it switch** (F or A for JAWS or NVDA)? Then: does the component need typing, or arrows to choose one of many, adjust a value or move in two dimensions?
   - **No: Needless.** The usual cases are below, under "Needless patterns".
   - **Yes:** go to 4.
4. **Does it answer the keys its role promises?** (The probe in the map, or the code: `keys` in roles.md.)
   - **Yes: Needed,** unless one of the "Broken patterns" below applies.
   - **No: Broken.** Add the keys, or change the role (a component that doesn't need them is Needless).
5. **It stays in browse mode, but handles keys browse mode keeps** (the inventory's keyboard leads, a probe that says "works here, but JAWS and NVDA keep it"): **Missing.** The usual cases are under "Missing patterns".
6. **Everything else is Browse.**

## Needless patterns

| Pattern | Why it hurts | Fix |
| --- | --- | --- |
| Site navigation as `menubar`/`menu` with `menuitem` links | Focus mode on every link; quick navigation (K for links) and reading stop; users expect a menu of commands | `<nav>` with a list of links; submenus behind disclosure buttons (`aria-expanded`), as in the APG disclosure navigation example; `aria-current="page"` |
| A `tree` for navigation or a table of contents | NVDA shows only the selected item in browse mode: the links can't be read | Nested lists of links, with disclosure buttons for the branches |
| A `tablist` whose tabs load other pages | Focus mode for what are links | `<nav>` with links and `aria-current="page"` |
| A `listbox` of links, cards or rich results | NVDA shows only the selected option; links and buttons inside options can't be reached in focus mode | A list of links or buttons; a listbox only for choosing a value, with short option text |
| A `grid` for data that's only read (a sortable table) | Focus mode on every cell, table reading commands stop, and the grid's own arrow keys must stand in for them | A `<table>` with headers; sort buttons inside the `<th>` and `aria-sort`; keep a grid only for cells users edit or a 2D widget (a spreadsheet, a calendar) |
| A `toolbar` around buttons with no arrow-key navigation | NVDA and Orca switch for every button in it | No role, or `group` with a label |
| A focusable table cell (`<td tabindex>`, a clickable row) | NVDA switches on it, and table commands stop | The button or link inside the cell gets focus; remove the `tabindex` |
| Focusable list items in a focusable list (not a message list with arrow keys) | NVDA switches on them | Remove the `tabindex` from the list and items; links or buttons inside take focus |
| `role="application"` around content, a page, a dialog or a widget | NVDA's browse mode can't read the content; JAWS turns the virtual cursor off; Orca turns on sticky focus mode on a page | Remove it; the widget roles inside switch where needed |
| A dialog that focuses a text field when the dialog's text matters | Focus mode right away: users hear the field, not the message | Focus the dialog, its heading or the first control after the text; or link the text with `aria-describedby` |

## Missing patterns

| Pattern | Fix |
| --- | --- |
| A roving tabindex group without a composite role: a custom radio group, a segmented control, tabs or chips built from buttons | The composite role that matches its keyboard (`radiogroup` and `radio`, `tablist` and `tab`, `toolbar`, `listbox` and `option`), with the states (`aria-checked`, `aria-selected`); or native radio buttons |
| A carousel or slideshow that moves with arrow keys on a focused container | Previous and next buttons, and buttons for the slides; the arrow keys stay as an extra. Not `role="application"` |
| Drag and drop with Space and arrow keys (dnd-kit, @hello-pangea/dnd) | A way that works in browse mode: move up and down buttons, or an action menu ("Move to…"). In browse mode Space reaches the page as a click, and arrows never do |
| A map, chart or canvas that pans or moves a selection with arrow keys | Buttons for pan and zoom, and the content as a list or table; `role="application"` only under question 2 |
| A custom slider or spin control without its role | `role="slider"` or `"spinbutton"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`; or `<input type="range">`, `<input type="number">` |
| Single-key shortcuts (letters) | Letters are quick navigation in browse mode: shortcuts with a modifier, or a way to turn them off (WCAG 2.1.4) |
| Activation on `keydown` for Space or Enter | Act on `click`: in browse mode Enter and Space arrive as a click |

## Broken patterns

| Pattern | Fix |
| --- | --- |
| A widget role without the keys it promises (a `menu` without arrows, a `grid` without cell navigation, a `listbox` without arrows, a `tablist` without arrows) | The APG keyboard for the role (roles.md lists it), or a role that doesn't switch |
| `aria-activedescendant` pointing to an id that doesn't exist, isn't rendered, or isn't the item users see as active | Point it at the rendered active item, and update it with every move |
| Links or buttons inside an `option`, `treeitem`, `menuitem` or `tab` | Nested controls can't be reached in focus mode: one action per item, or a grid with real cells if the items need several |
| Text users need between the items of a widget, or only in its visual layout | Put it in the item's name or `aria-describedby`, or outside the widget |
| A listbox or tree whose content users must read | NVDA shows only the selected item: a list, or a table |
| Focus mode without a way back: `role="application"` with no documented keys, Escape swallowed | Remove the role, or document the keys and keep Escape and Tab working |

## Severity

- **Critical**: content users need is out of browse mode (`role="application"` around content or on the page, a listbox or tree holding text to read); or a widget switches and nothing answers its keys.
- **Serious**: navigation turned into a widget (menus, trees, tablists of links); a Missing component whose only way to work is the keys browse mode keeps (a carousel without buttons, drag and drop without buttons).
- **Moderate**: a widget missing some of its keys (Home, End, type-ahead); a needless toolbar; focusable table cells; a Missing component that also has buttons.
- **Minor**: differences between screen readers, invalid roles that change nothing, a toggle button's `aria-pressed` in JAWS.

## Fixing

- **Removing a widget role** removes its keyboard with it: the arrow-key handlers, the roving `tabindex`, `aria-selected` and the like. Every item becomes reachable with Tab (links or buttons), and nothing visible changes.
- **Adding a widget role** adds the keyboard it promises, the focus management (one item in the Tab order), the states, and an accessible name for the widget and each item. Prefer the native element when one exists.
- **Never add `role="application"` to make keys reach a component.** Use the widget role that matches, or buttons.
- **Fix the shared component once**, not each use. For a library widget used for the wrong job (a library menu as site navigation), use the library's navigation component or plain markup.
- **Tests** that query the old roles change with them (`getByRole("menuitem")` → `getByRole("link")`).
- **Every fix is a proposal** in the report, with what changes for keyboard users and for each screen reader. Apply it when the user asks: it changes how people operate the component.
