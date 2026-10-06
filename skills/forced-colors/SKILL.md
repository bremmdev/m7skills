---
name: forced-colors
description: Forced colors (Windows high contrast) review and fix for any web UI. Captures normal and forced-colors screenshots, finds what disappears or loses its state, fixes it with system colors following Fluent UI and Spectrum conventions, and shows before/after screenshots. Use when asked about high contrast mode, forced colors, Windows contrast themes, system colors or forced-color-adjust.
license: MIT
---

# Forced colors

People with low vision, light sensitivity or migraines use Windows contrast themes, and the browser then replaces the page's colors with the user's palette. Anything drawn with a background color, a shadow or a gradient can vanish. States that differ only in color also become indistinguishable: a selected tab with a blue background and an unselected tab with a gray background both get the same system color, so the user can't tell which one is selected. The goal: in every contrast theme, every control, every state and the focus are visible and distinct, in colors the user's theme guarantees.

**Evidence is a screenshot.** Every gap and every fix is shown in three modes (normal, forced-dark, forced-light), before and after. Code reading only produces suspects.

For a question rather than a review ("how should a selected tab look in high contrast?"), answer from the references and skip the steps.

## References

- [`references/mechanics.md`](references/mechanics.md): what the browser forces, `forced-color-adjust`, system colors and their pairs. Read before judging any screenshot.
- [`references/gaps.md`](references/gaps.md): the gap catalog (symptom, cause, detection, fix) and static search patterns.
- [`references/conventions.md`](references/conventions.md): how Fluent UI and Spectrum style each pattern in forced colors.
- [`references/capture.md`](references/capture.md): running the UI, the capture routes, the plan file, building and showing the report.
- `scripts/capture.mjs` (screenshots in every mode), `scripts/scan.js` (in-page suspect scanner), `scripts/compare.mjs` (flags and the HTML report), next to this file and described in `capture.md`.

## Output

- **One report per run**: a self-contained HTML file, with every screenshot embedded, at `reports/accessibility/forced-colors-<scope>-<YYYY-MM-DD>.html` in the root of the repository the skill runs in. That file and the fixes are the only changes in the repository; raw screenshots live in the system's temporary directory.
- **Local by default.** Leave everything uncommitted. Put the report or screenshots in a pull request, an issue or anywhere online only when the user explicitly asks.

## Rules for fixes

- **Fix only inside forced colors.** Every change sits behind `@media (forced-colors: active)` (or the stack's equivalent: Tailwind `forced-colors:`, a CSS-in-JS media key, a Sass mixin). Normal mode stays pixel-identical; compare.mjs flags it when it doesn't.
- **Smallest fix that works.** Text, borders and native controls already work. Prefer a border (transparent normally) over an opt-out; opt out with `forced-color-adjust: none` only on the small part that sets all its colors, and then use system colors for every color in it, focus outline included.
- **System colors in their pairs.** Selected is `HighlightText` on `Highlight`, disabled is `GrayText` at full opacity, focus is an `outline`. Follow `conventions.md`; where Fluent and Spectrum differ, follow its recommendation and stay consistent across the codebase.
- **Write it the project's way**: its styling approach, naming and file layout, and its existing forced-colors helpers or tokens if it has any.

## Steps

### 1. Inventory

Name what's in scope (a component, a page, a whole library) and list every element whose drawing depends on color, with every state it has: rest, hover, focus-visible, pressed, selected / checked / on / current / expanded, indeterminate, disabled, read-only, invalid, loading and progress values (empty, partial, full), plus each app theme and size that changes how it's drawn. Group the states of one element: those groups are what must stay distinct.

**Done when** every element × state is listed with how to reach it (a URL, or actions from a URL), and states that must look different are grouped.

### 2. Route and plan

Read `capture.md`. Find how the UI runs, pick the strongest capture route, and write the plan: one shot per element × state. Capture a single shot in all modes first.

**Done when** the plan covers the whole inventory and you've looked at that first forced-dark screenshot and confirmed it shows the forced palette (near-black background), not normal mode.

### 3. Before

Capture everything with the label `before` and build the report. Look at every forced screenshot yourself, next to its normal one: most gaps (a dim icon, a faint focus ring, a selected tab that's only bold) are not flagged. View a screenshot by reading the PNG with a tool that shows you images, or by opening the report in a browser tool and taking a screenshot of it. Also run the static search patterns from `gaps.md` over the styles in scope.

**Done when** every shot × mode has been viewed.

### 4. Gaps

Read `mechanics.md` and `gaps.md`. For every element × state decide: fine, or one or more gaps. For each gap record the element and state, the modes it occurs in, what the user sees, the cause, the severity and the screenshot that shows it. Every flag and every scan suspect that isn't `info` either becomes a gap or is dismissed with a reason.

**Done when** every shot has a verdict, and no flag or suspect is left unexplained.

### 5. Fix

Read `conventions.md`. For each gap choose the fix and the convention behind it, then show the user the gap list and the planned fixes in a short table. Apply them right away so the after screenshots can show the result, unless the user asked for a review only: then stop here and offer to fix. A gap that needs a design decision (a new indicator, a different icon) gets a proposal instead of a change.

**Done when** every gap has a fix applied or a written reason why not.

### 6. After

Let the UI rebuild, capture with the label `after`, rebuild the report, and look at every after screenshot. Repeat 5–6 until the after capture has no `disappears`, `states-merge` or `error` flags, no unexplained `normal-changed`, no unexplained scan suspects, and every gap is visibly solved in both forced palettes. Then run the project's tests, type checks and linters for the changed files.

**Done when** all of that holds, or what's left is listed with a reason.

### 7. Show

Write the gap table (element and state, before, after, fix and convention) as the report's `--summary` fragment, build the final report, and open it for the user (see `capture.md`). Reply with:

- The report's path, and the gap table in short.
- The files changed.
- What screenshots can't prove, with steps for the user: a real Windows contrast theme (one dark, one light, since `Highlight` and `GrayText` differ from the emulation), Firefox, and anything the capture route couldn't reach.

**Done when** the report is in `reports/accessibility/`, open for the user, and the summary is in front of them.
