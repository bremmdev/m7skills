---
name: screen-reader-modes
description: Screen reader modes review for any web codebase. Lists every role, control and key handler, predicts whether JAWS, NVDA, Narrator and Orca switch to forms, focus or application mode when focus lands there (VoiceOver and TalkBack have none), tests in a browser which widgets answer their keys, and rates each component's switch as needed, needless, missing or broken. Use when asked about focus mode, forms mode, browse mode, application mode, the virtual cursor, scan mode or role="application"; when reviewing the roles or keyboard support of widgets such as menus, tabs, grids and listboxes; or when arrow keys or shortcuts fail with JAWS or NVDA.
license: MIT
---

# Screen reader modes

On Windows and Linux, screen readers read a page from their own copy of it, in **browse mode** (JAWS: the virtual cursor; Narrator: scan mode). Arrows read, letters jump to headings and links, Enter and Space click, and none of those keys reach the page. When focus lands on certain roles, the screen reader switches to **focus mode** (JAWS: forms mode): keys go to the page, and reading stops. `role="application"` takes browse mode away altogether. The role decides, not the component's look or its key handlers. So a role that switches without need takes reading away (site navigation built as a `menubar`); a component that needs arrow keys without a role that switches never gets them (a carousel or a custom radio group on a focusable `div`); and a role that switches without the keyboard it promises leaves users where nothing responds (a `menu` without arrow keys). VoiceOver and TalkBack have no modes, which is why testing on a Mac hides all of it.

**The role table is fixed; the verdict is per component.** [`references/roles.md`](references/roles.md) says what each screen reader does for each role, from NVDA's and Orca's source code and Freedom Scientific's JAWS documentation, with every undocumented prediction marked `?`. Each component gets one verdict: **Browse**, **Needed**, **Needless**, **Missing** or **Broken**.

For a question rather than a review ("does a tablist put NVDA in focus mode?", "why don't my arrow keys work with JAWS?"), answer from the references and skip the steps.

## References

- [`references/mechanics.md`](references/mechanics.md): the modes of each screen reader, what switches them (Tab, click, script focus, arrows, quick keys, Enter), what users lose in focus mode, what browse mode doesn't show, and the sources. Read before predicting anything.
- [`references/roles.md`](references/roles.md): every role and native control, and what JAWS, NVDA, Narrator and Orca do when focus lands on it; the conditions that change it; the keys each role promises.
- [`references/decisions.md`](references/decisions.md): the five verdicts, the decision order, the patterns behind Needless, Missing and Broken with their fixes, severity, and how to fix.
- [`references/libraries.md`](references/libraries.md): what common component libraries render, and their usual traps.
- [`references/testing.md`](references/testing.md): the static inventory, the browser map (plan, probes, leads), and the manual screen reader script.
- `scripts/`: `find-roles.mjs` (static inventory with predictions), `modes.js` (the rules, and the in-page scanner), `map-modes.mjs` (rendered pages: scan, key probes, screenshot map). `<skill>` below is the folder this `SKILL.md` is in.

## Output

- **One report**: `reports/accessibility/screen-reader-modes-<YYYY-MM-DD>.md` in the root of the repository. When the UI runs, the mode map goes next to it: `reports/accessibility/screen-reader-modes-map-<YYYY-MM-DD>.html` (one self-contained file, screenshots embedded). Plans, screenshots and `result.json` live in the system's temporary directory.
- **Audit first, local by default.** Every fix changes how keyboard and screen reader users operate a component, so fixes are proposals in the report, applied when the user asks. Commit, push, or put the report anywhere online only when the user asks.

## Rules

- **Every component gets a verdict**, with a reason from the decision order in `decisions.md`: every role, every native control that switches, every focusable element without a role, every key handler for keys browse mode keeps. Not only the ones that switch.
- **Per screen reader, never "screen readers".** Say what JAWS, NVDA, Narrator and Orca each do, and that VoiceOver and TalkBack have no modes. A prediction marked `?` is said to be undocumented, never presented as fact.
- **The rendered role decides.** Library components, roles from variables and roles set by script are judged by what the browser renders (the map, or the DOM in a browser tool). Static hits are leads.
- **The keyboard follows the role.** A fix that adds or keeps a widget role includes the keys that role promises; a fix that removes one removes its arrow-key handling too and keeps everything reachable with Tab, Enter and Space.
- **Native first.** The HTML element that already has the role and the behavior (`<select>`, radio buttons, `<table>`, `<details>`, links in a `<nav>`) over ARIA. Never `role="application"` to make keys reach a component.
- **Write it the project's way**: its components, naming, file layout and test style.

## Steps

### 1. Survey

Find the framework, the component libraries and their versions, where shared components live, how the UI runs (dev server, Storybook) and what it needs (a database, a login), the test runner, and the docs and agent instruction files.

**Done when** you can name where components live, which library widgets are used, and how to reach each page or story that has a widget.

### 2. Inventory

Run `node <skill>/scripts/find-roles.mjs <repo>` and read every source hit in context. Add what a text search misses: library components (`libraries.md`, and the imports the inventory lists), roles built from variables or set by script, templates in other languages, web components.

**Done when** every component that sets a role, renders a native control that switches, takes focus without a role, or handles arrow, Home/End, Page or letter keys is a row: location, where focus lands and its role, its keyboard, and where the role comes from (own markup, library, variable).

### 3. Map

Read `testing.md`. When the UI runs, write a plan with a page for every row's component, in the state where focus lands in it (menus and dialogs opened with actions), and run `map-modes.mjs` with probes. Read every box and every lead, and match them to the rows: each row gets its rendered role, its predictions and its probe result. When the UI can't run, the predictions come from `roles.md` and the report says the browser check is missing.

**Done when** every row has its rendered role (or "not rendered" with the reason), its predictions per screen reader, and its probe result; and every lead in the map is matched to a row or added as one.

### 4. Decide

Read `mechanics.md`, `roles.md` and `decisions.md`, and give every row a verdict, a reason and, for Needless, Missing and Broken, the fix with what changes for keyboard users. If the user asked for an audit only, write the report and stop here with an offer to apply the fixes.

**Done when** every row has a verdict, a reason and its prediction per screen reader, and every Needless, Missing and Broken row has a fix and a severity.

### 5. Fix (when asked)

Apply the fixes the user chose: in the shared component, not in each use; for a library widget used for the wrong job, the library's component for that job or plain markup. Update the tests that query the old roles.

**Done when** every chosen fix is applied, its keyboard matches its new role, and the tests use the new roles.

### 6. Verify

Run the project's tests, type checks and linters for the changed files. Run `find-roles.mjs` again and compare it with the verdicts. When the UI runs, run the same plan again and check every fixed row: its mode is the intended one, and its probe matches (a Missing fix switches and its key works; a Needless fix stays in browse mode with nothing left that needs arrows; a Broken fix answers its key).

**Done when** tests, types and lint pass (failures that predate the change named as such), the second inventory matches the verdicts, and every fixed row's map entry matches its verdict.

### 7. Report

Write the report with these sections:

- **Summary**: what switches modes in this codebase and what's wrong with it, with the count per verdict.
- **Components**: one row per component: location, the role focus lands on, JAWS, NVDA, Narrator and Orca (VoiceOver and TalkBack: no modes), its keys and the probe result, the verdict, the reason, and the fix or what changed.
- **Fixes**: proposed or applied, each with what changes for keyboard users and for each screen reader.
- **Map**: the path of the HTML map, rebuilt with the verdict table as `--summary`; or why there is none.
- **Manual screen reader test**: the steps and combinations from `testing.md`, for each Needed component and each fix.

Reply with the report's path (and the map's), the count per verdict, the worst findings, and what the predictions can't prove, with the manual steps.

**Done when** the report is written and that summary is in front of the user.
