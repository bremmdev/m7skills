# Component libraries

Most widget roles in a codebase come from a library, so a text search for `role=` misses them. `find-roles.mjs` lists the dependencies below and their imports; the browser map shows what they actually render. **The rendered DOM decides**: libraries change their markup between versions, and this page is a guide to where to look, not a verdict.

## What they render

| Library | Components that switch to focus mode | Usual traps |
| --- | --- | --- |
| Radix UI (`@radix-ui/react-*`, `radix-ui`), Reka UI / Radix Vue, Bits UI | DropdownMenu, ContextMenu (`menu`), Menubar, Tabs, Toolbar, RadioGroup, Select (`combobox`, `listbox`), Slider | NavigationMenu is the one for site navigation (links and disclosure buttons, browse mode). DropdownMenu with links inside is a menu of links |
| Headless UI | Menu (`menu`), Listbox, Combobox, RadioGroup, Tab (`tablist`) | Menu used as a site navigation dropdown; Popover or Disclosure is the browse mode choice |
| React Aria Components, React Aria hooks, React Spectrum, HeroUI | Menu, ListBox, GridList (`grid`), Table (`grid`), TagGroup (`grid`), Tree (`treegrid`), Tabs, RadioGroup, Toolbar, Calendar (`grid`), DateField (spin buttons) | Table and ListView are grids: focus mode on every cell. Fine for interactive rows; a plain `<table>` for data that's only read |
| MUI (`@mui/material`) | Menu (`menu`), Tabs, Select (`combobox` and `listbox`), Autocomplete, Rating (radios), Slider | Menu as site navigation; Tabs as page navigation (use links and `aria-current`) |
| MUI X | DataGrid (`grid`; `treegrid` with tree data), SimpleTreeView and RichTreeView (`tree`), date pickers (calendars are grids) | DataGrid for read-only data |
| Ant Design (`antd`) | Menu (`menu` and `menuitem`, in every mode, also horizontal and inline navigation), Tabs, Tree, Select, Cascader | Menu is the documented way to build site navigation, so every nav link becomes a menu item: Needless |
| Angular Material and CDK | `mat-menu`, CDK Menu (`menu`, `menubar`), `mat-tab-group`, `mat-select`, `mat-autocomplete`, `mat-tree` (`tree`), `mat-chip-listbox` (`listbox`), `mat-chip-grid` (`grid`), `mat-button-toggle-group`, `mat-stepper` | `mat-tree` for navigation; `mat-nav-list` is the browse mode choice. The CDK key managers implement the arrow keys for your own widgets |
| Fluent UI v9 (`@fluentui/react-components`) | Menu, TabList, Toolbar, Tree, DataGrid (`grid`), Listbox, Combobox, Dropdown, RadioGroup | DataGrid for read-only data (Table is the browse mode one) |
| Fluent UI v8 (`@fluentui/react`) | ContextualMenu (`menu`), Pivot (`tablist`), DetailsList (`grid`) | `FocusZone` adds arrow keys to any container, without a role: Missing |
| Ariakit | Menu, Select, Combobox, Toolbar, Tab, Radio | `Composite` adds arrow keys; you choose the role, so check it has one |
| Primer (`@primer/react`) | ActionMenu (`menu`), TreeView (`tree`), SelectPanel (`listbox`); ActionList's role depends on where it's used | TreeView for file or page navigation |
| Carbon (`@carbon/react`) | OverflowMenu (`menu`), Tabs and ContentSwitcher (`tablist`), TreeView (`tree`) | |
| PrimeReact, PrimeVue, PrimeNG | Menu, Menubar, TieredMenu (`menu`, `menubar`), TabView or Tabs, Tree, TreeTable, Listbox, Select | Menubar as site navigation |
| Vuetify | VTabs (`tablist`), VTreeview, VSelect; VList and VMenu depending on version and props | Check VList's rendered role in navigation drawers |
| Shoelace / Web Awesome | `sl-menu` (`menu`), `sl-tree` and `wa-tree` (`tree`), tab groups, selects, radio groups | Roles live in shadow DOM: the map's scan walks open shadow roots |
| Chakra UI, Mantine, Kobalte, Zag | Menu (`menu`), Tabs, Select or Combobox, RadioGroup, Slider | Menu as site navigation |
| AG Grid, Handsontable, Glide Data Grid | `grid` or `treegrid` | Read-only reports in a data grid |
| TanStack Table | Nothing: it's headless, the roles are the markup you write | |
| Downshift, react-select | `combobox` with a `listbox` | |
| dnd-kit, @hello-pangea/dnd, react-beautiful-dnd | Nothing: draggables are buttons | Keyboard dragging uses Space and arrows, which browse mode keeps: Missing without move buttons or a menu |
| Pragmatic drag and drop | Nothing | Recommends an action menu for moving, which works in browse mode |
| Leaflet, MapLibre GL, Mapbox GL | Nothing | The map takes focus and pans with arrow keys, with no widget role: Missing |
| Swiper, Splide, Slick, Embla, Keen Slider | Nothing | Arrow keys on a focused carousel (when keyboard control is on): Missing unless there are buttons |
| Bootstrap | Nothing by default | Dropdown items move with arrow keys but have no menu role; Carousel listens to arrow keys on the carousel element |
| TipTap, ProseMirror, Lexical, Slate, Quill, CKEditor, TinyMCE, Draft.js, CodeMirror, Monaco | The editor (`contenteditable` or a `textarea`) | Needed. Toolbars around them are `toolbar`s: NVDA and Orca switch there too |

## Checking a library component

1. Find where it's used (the inventory's imports) and what for: navigation, commands, choosing a value, data to read.
2. Render it, in the state where focus lands in it (opened menus, a selected tab), and read its role in the map or the DOM.
3. Decide as for your own markup ([`decisions.md`](decisions.md)). A library widget used for the right job is usually Needed and its keyboard is done; check it in the probe anyway.
4. A library widget used for the wrong job (a menu for navigation, a grid for a read-only report) is fixed by using the library's component for that job, or plain markup, not by overriding its roles: its keyboard handling stays behind.
