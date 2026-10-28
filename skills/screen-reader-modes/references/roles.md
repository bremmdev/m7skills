# Roles and modes

What each screen reader does when focus lands on an element (Tab, click or `element.focus()`), with default settings, in Chrome or Edge. Why they switch, and what users lose, is in [`mechanics.md`](mechanics.md). `scripts/modes.js` implements this table; keep the two in step.

**B** browse mode (JAWS virtual cursor, NVDA and Orca browse mode, Narrator scan mode) · **F** focus mode (JAWS forms mode, NVDA and Orca focus mode, Narrator scan mode off) · **A** no browse mode (JAWS virtual cursor off, NVDA application, Orca focus mode) · **K** keeps the current mode · **?** no source documents it: test it.

VoiceOver and TalkBack have no modes: every row is "keys and gestures reach the page", so they're left out. Their users still hear the role, so a wrong role still misleads them.

## Typing

| Role or element | JAWS | NVDA | Narrator | Orca | Notes |
| --- | --- | --- | --- | --- | --- |
| `<input>` (no type, `text`, `search`, `email`, `tel`, `url`, `password`), `<textarea>`, `textbox`, `searchbox` | F | F | F | F | JAWS and Narrator also switch when the virtual cursor arrives (not JAWS Semi-Auto). NVDA switches for read-only fields too |
| `contenteditable` (the editing host), rich text and code editors | F | F | F | F | Needed: an editor can't work in browse mode |
| `<input type="number">`, `spinbutton`, `<input type="date">` and the other date and time types | F | F | F | F | Chromium builds date and time inputs from spin fields |
| `<select>`, `<input list>`, `combobox` | F | F | B? | F | JAWS: Alt+Down Arrow opens the list and enters forms mode. Narrator: F when the combobox is a text field. Browse mode shows the value, not the options |

## Choosing

| Role or element | JAWS | NVDA | Narrator | Orca | Notes |
| --- | --- | --- | --- | --- | --- |
| `<select multiple>`, `<select size="2+">`, `listbox`, `option` | F | F | B? | F | NVDA's browse mode shows only the selected option. With `aria-activedescendant` focus stays on the listbox and screen readers follow the active option |
| `<input type="radio">`, `radio` (in a `radiogroup`) | K | F | B? | B | JAWS: arrows check radios in forms mode, Space checks one with the virtual cursor. Orca: once in focus mode, arrowing between radios keeps it |
| `<input type="checkbox">`, `checkbox`, `switch` | B | B | B | B | JAWS leaves forms mode on them. Inside a toolbar: see Toolbars |
| `<input type="range">`, `slider` | F? | F | B? | F | Not in Freedom Scientific's list; JAWS usually uses forms mode |

## Widgets

| Role or element | JAWS | NVDA | Narrator | Orca | Notes |
| --- | --- | --- | --- | --- | --- |
| `tablist`, `tab` | F | F | B? | F | NVDA: in browse mode, Enter or Space on a tab activates it instead of switching. The `tabpanel` is ordinary content |
| `menubar`, its `menuitem`s | F | F | B? | F | |
| `menu`, `menuitem`, `menuitemcheckbox`, `menuitemradio` | F? | F | B? | F | Freedom Scientific documents menu bars; popup menus switch too in practice. NVDA passes Escape to the menu |
| `tree`, `treeitem` | F | F | B? | F | NVDA's browse mode shows only the selected item; JAWS may show one item. A tree hides its content from reading |
| `grid`, `treegrid` and their `gridcell`, `row`, `rowheader`, `columnheader` | F | F | B? | F | Switches when a cell, row or header gets focus, read-only grids too. Unfocused, the grid reads as a table in browse mode. NVDA passes Escape to the grid. Focus on the grid element itself, with no active descendant, keeps NVDA in browse mode |
| `toolbar` | B? | F | B? | F | NVDA and Orca switch for anything focused inside, buttons included. JAWS: not documented (standards-support #708 shows forms mode inside a toolbar, ending on a check box) |
| `separator` that takes focus (a splitter) | B? | B | B? | F | NVDA keeps browse mode, so its arrow keys don't reach the page there |
| `scrollbar` that takes focus | B? | B | B? | B | |
| `application`, and everything inside | A | A | B? | A | NVDA: the content isn't in browse mode at all; NVDA+Space forces browse mode inside. JAWS: virtual cursor off (standards-support #640: not always). Orca: on `<html>` or `<body>`, sticky focus mode for the whole page |
| `document` inside an `application` | B | B | B | B | Gives browse mode back for a part meant to be read |

## Buttons, links and disclosures

| Role or element | JAWS | NVDA | Narrator | Orca | Notes |
| --- | --- | --- | --- | --- | --- |
| `<a href>`, `link` | B | B | B | B | Orca never switches on links |
| `<button>`, `button`, `<input type="button">` and `submit`, `reset`, `image`, `color`, `file` | B | B | B | B | |
| A button with `aria-expanded` (a disclosure), `<summary>` | B | B | B | F | Orca: expandable and focusable |
| A button with `aria-haspopup` (a menu button) | B | B | B | F | Orca: a button with a popup. The others switch when focus moves into the menu |
| A toggle button with `aria-pressed` | B? | B | B | B | JAWS has been reported to start forms mode on it |

## Structure

| Role or element | JAWS | NVDA | Narrator | Orca | Notes |
| --- | --- | --- | --- | --- | --- |
| `<table>`, `table`, `cell`, `<td>`, `<th>` | B | B | B | B | Table reading commands work in browse mode. Nothing here takes focus |
| A focusable cell: `<td tabindex>`, `cell` with `tabindex` | B? | F | B | B | NVDA switches on any focusable table cell, outside a grid too, and table commands stop. Put a button or link in the cell instead |
| `<ul>`, `<ol>`, `list`, `listitem` with `tabindex` | B | B | B | B | NVDA keeps browse mode on read-only lists, except a focused item in a focusable list (a message list): F |
| `dialog`, `alertdialog`, `<dialog>` | B | B | B | B | The dialog has its own browse mode; the mode is whatever focus lands on inside. A dialog that focuses a text field starts in focus mode. Inside an application there is no browse mode |
| `article` in a `feed` | B | B | B | B | The feed pattern is built for browse mode |
| `progressbar`, `meter`, `timer` | B | B | B | B | Orca switches if one takes focus |
| `<video controls>`, `<audio controls>` | B | B | B | B | The native timeline and volume sliders switch (F) when they get focus |
| `<iframe>` | B | B | B | B | Its own document, with its own modes |
| `generic`, `group`, `region`, `img`, `figure`, `<canvas>` or any element with `tabindex` and no widget role | B | B | B | B | In browse mode its key handlers only ever see Tab, and Enter or Space as a click |

## Conditions that change a row

- **`aria-activedescendant`**: the active descendant's role decides, not the focused element's. An id that doesn't exist: nothing is announced when the arrows move.
- **`aria-readonly="true"`**: NVDA keeps browse mode, except on text fields, comboboxes and grid parts.
- **`disabled`** removes focus, so nothing switches. **`aria-disabled="true"`** keeps focus and switches like the enabled element.
- **Inside a `toolbar`**: NVDA and Orca switch for anything focused inside.
- **Inside a `grid`, `treegrid`, `menu`, `menubar` or `tree`**: Orca switches for anything focused inside.
- **Inside `role="application"`**: A for every element, until a `role="document"` sits between.
- **`role="none"` or `"presentation"` on a focusable element** is ignored: the element keeps its own role. **An invalid role** is ignored; the first valid token of a list wins (`role="switch checkbox"`).
- **Firefox**: NVDA reads the states Firefox exposes, and a few rows can differ (read-only lists and grids). Test it.

## Keys each role promises

From the ARIA Authoring Practices Guide. A role that switches (F) promises these keys: without them, focus mode leaves users with nothing that responds. A component that needs them must have a role that switches.

| Role | Keys |
| --- | --- |
| `tablist` | Left/Right Arrow (Up/Down when vertical), Home, End |
| `menu`, `menubar` | Up/Down Arrow (Left/Right in a menu bar), Escape, Home, End, type-ahead; Enter or Space activates |
| `listbox` | Up/Down Arrow, Home, End, type-ahead; Space selects in multi-select |
| `tree` | Up/Down Arrow, Right opens or moves in, Left closes or moves out, Home, End, type-ahead |
| `grid`, `treegrid` | all arrows, Home, End, Ctrl+Home, Ctrl+End, Page Up, Page Down; Enter or F2 into a cell's controls |
| `radiogroup` | arrows move and check |
| `toolbar` | Left/Right Arrow between controls, Home, End; Tab leaves |
| `slider` | arrows, Page Up, Page Down, Home, End |
| `spinbutton` | Up/Down Arrow, Page Up, Page Down, Home, End, typing |
| `combobox` | typing or Down Arrow opens; arrows through options; Enter accepts; Escape closes |
| `application` | whatever the author defines; all of it documented to the user |
