# Testing modes

Three levels, each proving something the others can't: the static inventory finds every role and key handler in the source; the browser map shows the roles that actually render, where focus lands, and whether each widget answers its keys; only real screen readers prove which mode they use.

`<skill>` is the folder this skill's `SKILL.md` is in.

## 1. The static inventory

```
node <skill>/scripts/find-roles.mjs <repo> [--json]
```

It reads the files git tracks (or walks the folder), and prints:

- **Dependencies that render widgets**, from every `package.json` ([`libraries.md`](libraries.md)).
- **Roles in the source**: each role and variant (a focusable cell, a button with `aria-expanded`), how often it's set explicitly and by native elements, and the predicted mode per screen reader for focus landing there. For a container (`tablist`, `menu`, `grid`, `toolbar`, `application`) the prediction is for focus on an item inside.
- **Lines by section**: `role="application"`; roles that switch JAWS and NVDA; roles that switch only some screen readers; roles that stay in browse mode; roles set from expressions; invalid roles; focusable elements without a role; mode-relevant attributes (`aria-activedescendant`, `aria-haspopup`, `aria-expanded`, `aria-pressed`, `aria-readonly`); library imports; keyboard handling (arrow, Home/End and Page keys, single-key shortcuts, handlers, and roving focus helpers).
- **Leads**: files that handle keys browse mode keeps (arrows, Home/End, Page keys, single-key shortcuts) but set nothing that switches (Missing?), links given widget roles (Needless?), and files with a widget role but no arrow-key handling (Broken?, or the keyboard lives elsewhere).

Each line is a lead: read the code around it. Roles in tests and stories are counted, not listed; tests that query a role you change need updating.

## 2. The browser map

`scripts/map-modes.mjs` opens pages in Chromium, runs actions (open a menu, a dialog), and runs `scripts/modes.js` in the page: it walks every element (open shadow roots included), computes its role (explicit, or implicit from HTML), whether and how it takes focus, its ancestors, `aria-activedescendant`, and the predicted mode per screen reader. Chromium is launched with `element.computedRole`, and any role that disagrees with the scan's is shown.

It then **probes**: for each widget it focuses the element focus lands on (with `focus()`) and presses the key the role promises (Right Arrow for a tablist, Down Arrow for a menu or listbox), or both arrows on a focusable element without a widget role. A key counts as handled when focus moves, the keydown is prevented or stopped, the value changes, or the page changes in a way it didn't without the key. Probes change the page, so the page is reloaded (with its actions) after each one that changed something.

Run it from a folder where Playwright (`playwright`, `playwright-core`, `@playwright/test`) or Puppeteer (`puppeteer`, `puppeteer-core`) is installed: the project, or a temporary folder outside the repository (`npm i playwright-core` there; it uses installed Chrome or Edge). Ask before downloading browsers or adding anything to the project. Start the dev server or Storybook in the background, wait until it answers, and stop it afterwards if you started it. Pages behind a login need a test account from the user; a plan never holds a real password.

```
node <skill>/scripts/map-modes.mjs <plan.json> --out <tmp-dir> \
  --report <repo>/reports/accessibility/screen-reader-modes-map-<YYYY-MM-DD>.html \
  [--title "<scope>"] [--summary <verdicts.html>]
```

```json
{
  "url": "http://localhost:5173/",
  "waitFor": "#root > *",
  "viewport": { "width": 1280, "height": 800 },
  "pages": [
    { "name": "home" },
    { "name": "account-menu-open", "actions": [{ "click": "#account-button" }], "root": "body" },
    { "name": "settings-dialog", "url": "http://localhost:5173/settings", "actions": [{ "click": "#open-settings" }], "root": "[role=dialog]" },
    { "name": "orders-table", "url": "http://localhost:6006/iframe.html?id=orders--default&viewMode=story", "waitFor": "#storybook-root > *" }
  ]
}
```

- **Plan**: `url`, `waitFor`, `ready` (a JavaScript expression waited for after `waitFor`, such as hydration), `viewport`, `root` (the scan's root selector, default `body`), `probe` (default `true`), `maxProbes` per page (default 40), `probeWait` (ms after a key, default 150), `settle` (ms after load, default 300), `settleAfter` (ms after the actions, default 300), `browser` (`{ "channel": "msedge" }` or `{ "executablePath": "…" }`, plus `"args": ["--no-sandbox"]`, which Puppeteer needs when it runs as root), `driver` (`"puppeteer"` to prefer it).
- **Page**: `name`, and optionally `url`, `waitFor`, `ready`, `root`, `actions`, `probe`, `maxProbes`, `probeWait`, `settle`.
- **Actions**: `{ "click" | "hover" | "focus": selector }`, `{ "fill": selector, "text": "…" }`, `{ "press": "Escape", "times": 1 }`, `{ "waitFor": selector }`, `{ "wait": ms }`, `{ "eval": "js" }`. Selectors are CSS (`querySelector`).
- **Pages to cover**: every component in the inventory, in the state where focus lands in it: menus and listboxes open, dialogs open, a tab panel switched, a tree expanded, a grid with rows. A temporary story or page is fine for a component the app can't reach; delete it afterwards.

`<tmp-dir>` gets `result.json` (every element with its facts, predictions, flags and probes) and the screenshots. The report is one self-contained HTML file: the role matrix, then per page the screenshot with numbered boxes (green browse, amber focus or forms mode, red application; dashed where documented predictions differ) and a table with each screen reader's mode and why, the role's keys with the probe result, and the leads. `--summary` takes an HTML fragment you write (in the temporary directory) with the verdict table: a `<h2>`, then a `<table>` with a `<caption>` and header cells.

The terminal prints every element with its modes, probes and leads:

| Lead | Meaning |
| --- | --- |
| `<key> works here, but JAWS and NVDA keep it in browse mode` | Missing: the handler never runs for them |
| `<key> does nothing, and in focus mode it goes to the page` | Broken: the role switches, nothing answers |
| `<key> does nothing inside role=application` | Broken or Needless: no keyboard model where every key goes to the page |
| `role=application around content` | Needless: the content is out of NVDA's browse mode |
| `<n> links inside a <role>` | Needless: navigation turned into a widget |
| `NVDA's browse mode shows only the selected option/item` | Needless or Broken when the items hold content to read |
| `a grid with no controls in its cells` | Needless when the data is only read |
| `focusable <role> with no widget role` | Missing when it handles keys; Browse when Tab and Enter are all it needs |
| `focusable table cell` | NVDA switches here |
| `children with a roving tabindex, but its role is …` | Missing: a composite without its role |
| `aria-activedescendant points to a missing id` | Broken |
| `items switch differently` | A container whose items get different modes (a link in a tree, a check box in a toolbar): read the items |
| `nothing inside takes focus` | Broken: keyboard users can't reach the widget at all |
| `check box in a toolbar`, `aria-pressed` | JAWS differences to note, not fix |
| `role=application in or around a dialog` | Needless: the dialog loses its browse mode |
| `… is not a valid role and is ignored` | The element keeps its own role: judge that one |
| `Chromium: <role>` next to a role | Chromium computed another role than the scan: trust Chromium's, and check why |

**What the map can't see**: closed shadow roots (native date pickers and media controls), cross-origin iframes, content drawn in a canvas, states its actions don't reach, keys other than the probed one (Home, End, type-ahead, Escape), and whether a screen reader really switches. Probes use `focus()`, so a component that only reacts to Tab can look unhandled; check such a result by hand.

**Without Playwright or Puppeteer**, use any browser tool that runs page JavaScript: run the contents of `scripts/modes.js` in the page, then `screenReaderModes("#root")` (in a tool that takes a function: `() => { <contents of modes.js>; return screenReaderModes("#root"); }`). Probe by hand: focus the element, press the key, and compare focus, attributes and value. There is no screenshot map: say so in the report.

**When the UI can't run at all**, the verdicts come from the inventory and [`roles.md`](roles.md), marked as unverified, with the components to check in a browser listed in the report.

## 3. Real screen readers

Predictions come from source code and documentation; screen readers change. The report gives the user a manual script for each Needed component and each fix:

1. **Arrow onto it** from the text before it, in browse mode: is the role announced? Does the mode change (JAWS and Narrator only on edit fields)?
2. **Tab onto it**: does the mode change? NVDA plays a sound (or says "focus mode"), JAWS indicates forms mode, Orca says "focus mode"; with Narrator, check whether keys reach the widget.
3. **Press the keys its role promises**: does each one move, change and announce what it should?
4. **Leave and come back**: Tab out, Shift+Tab in; Escape or Numpad Plus (JAWS), Escape or NVDA+Space (NVDA): can its content still be read in browse mode?
5. **For a fix that removed a role**: Tab through it and use quick navigation (K for links, B for buttons, T for tables): everything reachable, and nothing switches.

| Platform | Combination |
| --- | --- |
| Windows | JAWS + Chrome, JAWS + Edge, NVDA + Chrome, NVDA + Firefox, Narrator + Edge |
| Linux | Orca + Firefox |
| macOS, iOS | VoiceOver + Safari: no modes, but check the role and states are announced |
| Android | TalkBack + Chrome: the same |

With NVDA's "Audio indication of focus and browse modes" off, NVDA says "focus mode" and "browse mode", and its Speech Viewer shows each switch. JAWS's Speech History (Insert+Space, then H) shows what JAWS said.
