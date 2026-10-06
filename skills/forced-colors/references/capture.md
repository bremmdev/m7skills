# Capturing screenshots and building the report

Screenshots are the evidence: every gap and every fix is shown in normal mode and in a dark and a light forced palette, before and after. They end up in one place only: the HTML report in the repository (section 5).

## 1. How the UI runs

| Source | Where to look | URL per state |
| --- | --- | --- |
| Storybook | `.storybook/`, `storybook` script | `http://localhost:6006/iframe.html?id=<story-id>&viewMode=story` (the bare story without the Storybook UI; the id is in the sidebar URL) |
| Other component explorers | Ladle, Histoire, Styleguidist, Pattern Lab | Their single-story URL |
| Dev server | `package.json` scripts (`dev`, `start`, `serve`, `preview`), framework config, backend entry points | Routes |
| Static HTML | Built `index.html`, plain HTML | `file://` or `npx serve` |
| Deployed preview | Ask the user | Routes |

When a state has no URL (open menu, hover, validation error), reach it with actions. When it can't be reached at all, a temporary story, demo page or fixture is fine; delete it afterwards. Ask the user for a test account when the UI is behind a login; never type real credentials.

Start the dev server in the background, wait until its URL answers, and stop it when done if you started it.

## 2. Routes, strongest first

| Route | Needs | What you get |
| --- | --- | --- |
| **A. capture.mjs** | Node, and Playwright (`playwright`, `playwright-core`, `@playwright/test`) or Puppeteer (`puppeteer`, `puppeteer-core`) in the project or a temporary folder; a Chromium browser (the library's own, or installed Chrome/Edge) | Everything automatic: all modes and states from one plan file, the scan, the manifest. Repeatable for the after capture |
| **B. Playwright MCP** | The Playwright MCP server's tools (`browser_emulate_media`, `browser_take_screenshot`, `browser_evaluate`) | You emulate forced colors yourself and drive each state by hand; you write the manifest |
| **C. Another CDP client** | Selenium with CDP, chrome-remote-interface, or any client that sends CDP commands | Emulate with `Emulation.setEmulatedMedia({ features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: "dark" }] })`, then as route B |
| **D. Other browser tools** | A browser extension or pane you can drive, without media emulation | The user turns on emulation in DevTools; you screenshot and scan |
| **E. Real Windows theme** | The user on Windows | The user switches the theme and you screenshot (route D), or the user sends screenshots |
| **F. Static review only** | Nothing runs | Gaps from the catalog's grep patterns and code reading, marked as **unverified**, with steps for the user to check |

Prefer A even when B is available: a plan file makes the after capture identical to the before capture, which is what makes the comparison trustworthy. Use B when installing a library isn't possible, or when the UI is only reachable in the MCP browser (its login state, its network).

Installing for route A: `playwright-core` or `puppeteer-core` (neither downloads a browser) in a temporary folder outside the repository is fine: `npm i playwright-core` there, then run capture.mjs with that folder as the working directory. Ask before downloading browsers or adding anything to the project. Existing Playwright browser caches: `%LOCALAPPDATA%\ms-playwright` (Windows), `~/Library/Caches/ms-playwright` (macOS), `~/.cache/ms-playwright` (Linux).

capture.mjs uses Playwright when it finds it, otherwise Puppeteer (`"driver": "puppeteer"` in the plan reverses that). It tries the library's own browser, then installed Chrome, then Edge (Playwright only; for Puppeteer pass Edge's path as `browser.executablePath`). Puppeteer's `page.emulateMediaFeatures` rejects `forced-colors`, so capture.mjs emulates it through CDP `Emulation.setEmulatedMedia`; use the same call in your own Puppeteer code.

## 3. Route A: the plan file

```json
{
  "url": "http://localhost:6006/iframe.html?id=switch--default&viewMode=story",
  "waitFor": "#storybook-root > *",
  "viewport": { "width": 1024, "height": 768 },
  "shots": [
    { "name": "switch-off", "group": "switch", "selector": "label:has([role=switch])" },
    { "name": "switch-on", "group": "switch", "selector": "label:has([role=switch])", "actions": [{ "click": "[role=switch]" }] },
    { "name": "switch-focus", "selector": "label:has([role=switch])", "actions": [{ "press": "Tab" }] },
    { "name": "switch-disabled", "group": "switch", "url": "http://localhost:6006/iframe.html?id=switch--disabled&viewMode=story", "selector": "label" }
  ]
}
```

- **Selectors** are plain CSS (`document.querySelector`), so the plan works with both drivers; Playwright-only syntax like `text=` or `:has-text()` isn't supported.
- **Shot**: `name` (file name, unique), `url` (defaults to the plan's), `selector` (clip to this element plus `padding`, default 16; without it, the viewport), `actions`, `settle` (ms, default 300), `scanRoot` (scan scope; defaults to `selector`), `scan: false` to skip the scan.
- **`group`**: shots of the *same element in different states*. Two shots in a group that differ in normal mode but are pixel-identical in a forced mode are flagged `states-merge`. Only group shots with the same size and position; focus and hover shots usually go in their own groups.
- **Actions**: `{ "click" | "hover" | "focus" | "check": selector }`, `{ "press": "Tab" }`, `{ "waitFor": selector }`, `{ "wait": ms }`, `{ "eval": "js" }`. Use `press: "Tab"` for keyboard focus: `:focus-visible` needs it.
- **`modes`** (optional): defaults to `normal` (light), `forced-dark`, `forced-light`. Each mode: `name`, `forcedColors` (`"active"`/`"none"`), `colorScheme`, optional `initScript` (runs before page scripts) and `actions` (run before every shot). For an app theme switched by a class or attribute instead of `prefers-color-scheme`, add a mode such as `{ "name": "normal-dark", "forcedColors": "none", "colorScheme": "dark", "initScript": "localStorage.setItem('theme','dark')" }` or an `eval` action that sets the attribute. Forced output should not depend on the app theme; capture forced modes with each app theme when there's doubt.
- **`browser`** (optional): `{ "channel": "msedge" }` or `{ "executablePath": "…" }`.

Run from the folder with Playwright or Puppeteer, with `<shots>` a new folder in the system's temporary directory (never inside the repository):

```
node <skill>/scripts/capture.mjs plan.json <shots> before
# … apply fixes, let the dev server rebuild …
node <skill>/scripts/capture.mjs plan.json <shots> after
```

`<skill>` is the folder this skill's `SKILL.md` is in. Capture uses `deviceScaleFactor: 2`, `reducedMotion: "reduce"` and disabled animations, so screenshots are sharp and stable.

## 4. Routes B–E: screenshots by hand

The report builder only needs this folder layout: `<shots>/<label>/<mode>/<shot>.png`, with `label` `before` or `after` and modes named `normal`, `forced-dark`, `forced-light` (any name containing `forced` counts as forced). Save every screenshot there as PNG, under the same name in every mode and label. Then write `<shots>/<label>/manifest.json` by hand so groups and scan results reach the report:

```json
{
  "browser": "Playwright MCP, Chromium",
  "deviceScaleFactor": 2,
  "modes": [
    { "name": "normal", "forcedColors": "none" },
    { "name": "forced-dark", "forcedColors": "active" },
    { "name": "forced-light", "forcedColors": "active" }
  ],
  "shots": [
    { "name": "switch-off", "group": "switch", "mode": "forced-dark", "file": "before/forced-dark/switch-off.png", "scan": [] }
  ]
}
```

One entry per shot × mode; `scan` is the array `forcedColorsScan` returned in that mode; `deviceScaleFactor` is the screenshot's pixel ratio (1 for CSS-pixel screenshots). Without a manifest the report still works, but without groups (no `states-merge` flag) and without scan results.

The scanner: run the contents of `scripts/scan.js` in the page, then `forcedColorsScan("<root selector>")`. In a tool that takes a function, wrap it: `() => { <contents of scan.js>; return forcedColorsScan("#root"); }`. Without forced colors it returns an error entry instead of results.

For focus, press Tab with the tool's key action and confirm `document.activeElement` and `:focus-visible` before the screenshot: right after a navigation the first Tab can land on the page instead of the first control.

### Route B: Playwright MCP

1. `browser_navigate` to the state's URL. Take the `normal` screenshot first.
2. `browser_emulate_media` with `forcedColors: "active"` and `colorScheme: "dark"`. The emulation stays on for the page across navigations; check it with `browser_evaluate`: `() => matchMedia('(forced-colors: active)').matches`.
3. `browser_take_screenshot` with `filename` set to the absolute path in the layout above, `type: "png"` and `scale: "device"`. To clip to an element, pass `target`; element screenshots stop at the element's box, so target a wrapper that includes the focus outline (or take the viewport). The tool also shows you the image, so you can judge it right away.
4. Run the scanner with `browser_evaluate`.
5. Repeat 3–4 for every state, then `colorScheme: "light"` for `forced-light`. Clear with `forcedColors: null` before the next normal shot.
6. After the fixes, the same shots with the label `after`.

If the server doesn't offer `browser_emulate_media`, it's an old version: ask the user to update it, or use route D.

### Route D: browser tools without emulation

1. Open the UI in a new tab and take the `normal` screenshots. Save them in the layout above (copy them there when the tool saves elsewhere).
2. Ask the user, in that tab: open DevTools → ⋮ → More tools → Rendering, set "Emulate CSS media feature forced-colors" to `forced-colors: active` and `prefers-color-scheme` to `dark`, and keep DevTools open (closing it ends the emulation). The emulation survives navigations in that tab, so before and after pages can be captured without asking again.
3. Check it took effect: `matchMedia('(forced-colors: active)').matches` and `matchMedia('(prefers-color-scheme: dark)').matches` in page JavaScript.
4. Scan and screenshot every state, then ask the user to switch `prefers-color-scheme` to `light` and repeat.

The viewport is the user's window, made narrower by docked DevTools. If a screenshot times out once, retry once; after that, stop and ask.

## 5. The report

```
node <skill>/scripts/compare.mjs <shots> <repo>/reports/accessibility/forced-colors-<scope>-<YYYY-MM-DD>.html --title "<scope>" --summary <gaps.html>
```

- `<repo>` is the root of the repository the skill runs in (`git rev-parse --show-toplevel`; without git, the project root). `<scope>` is a short kebab-case name of what was reviewed (`switch`, `checkout-page`). The folder is created when missing.
- The report is **one self-contained HTML file**: every screenshot is embedded, so it's the only file that lands in the repository. Leave `<shots>` in the temporary directory and delete it when you're done.
- `--summary` takes an HTML fragment you write (in the temporary directory): a `<h2>Gaps and fixes</h2>` heading and a table with a `<caption>` and header cells: element and state, what the user saw before, what they see now, the fix and its convention. Keep it accessible like the rest of the report.
- Run it after the before capture too: the report with only "before" is the gap overview, and its flags are printed in the terminal.

What the automatic checks mean:

- `disappears`: the forced shot is a single color while the normal one isn't. Nothing in it is visible.
- `states-merge`: two shots in a group are identical in a forced mode but differ in normal mode.
- `normal-changed`: normal mode differs between before and after. Forced-colors fixes should leave normal mode untouched; anything else needs a reason.
- `error`: the shot failed (selector not found, timeout, file missing).
- Scan suspects: see the kinds in `gaps.md`.

Flags and suspects are leads. The screenshots decide, because most gaps (a dim icon, a faint focus ring, a selected tab that's only bold) aren't flagged. **Check the emulation worked** on the first capture: a forced-dark shot must have a black or near-black background. If it looks like normal mode, the browser ignored the emulation (wrong browser engine, or a page that sets `forced-color-adjust: none` on the root).

## 6. Showing the result

- Open the report for the user: `start "" <file>` (Windows), `open <file>` (macOS), `xdg-open <file>` (Linux), or in a browser tool.
- The report stays local and uncommitted. Put screenshots or the report anywhere else (a pull request, an issue, a chat, a hosted page) only when the user explicitly asks for it.
