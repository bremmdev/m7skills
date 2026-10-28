---
name: announcer
description: Screen reader announcements for any web codebase. Builds one shared, queued, modal-aware announcer (a polite and an assertive live region), then checks every live region, toast and announce call and replaces, keeps, converts or removes each. Use when asked about live regions, aria-live, role="status" or role="alert", WCAG 4.1.3 status messages, or announcements screen readers miss, repeat or don't hear in dialogs.
license: MIT
---

# Announcer

Screen readers only read where the user is. If "Saved", "3 results" or "Moved Apple to position 2 of 4" shows up somewhere else on the page, a screen reader user never hears it unless a live region passes it on (that's WCAG 2.2 SC 4.1.3). Most codebases end up with a live region in every component, and they all break in the same ways: they're added at the same moment as their message, they're hidden, they overwrite each other, they swallow repeats, they read out every step of a quick series, and they go quiet behind any open modal. So the idea is simple: one shared announcer handles every message that only screen readers need, and any live region that's left is visible, correct and there for a good reason.

**The design is fixed; the code is adapted.** [`assets/announcer.ts`](assets/announcer.ts) is the reference: two visually hidden regions per container (polite and assertive, `role="log"`, `aria-relevant="additions"`), one child element per message removed after 7 s, one queue (written 100 ms after the call, 250 ms apart, assertive first), an `id` that replaces a waiting message from the same source, a `delay` that waits until a quick series stops, `cancelAnnouncement(id)` for work that ends with nothing to say (cancelled or aborted), regions inside the topmost open modal picked when the message is written, polite by default, a warning in development for bursts (no cap), and a single `write()`. Names, location and style follow the codebase; every behavior its spec tests stays.

For a question rather than a change ("should this be assertive?", "why isn't my toast read in a dialog?"), answer from the references and skip the steps.

## References

- [`references/mechanics.md`](references/mechanics.md): how a message reaches a screen reader, the three rules, what screen readers do with politeness, modals and `inert`. Read before judging any region.
- [`references/decisions.md`](references/decisions.md): the four verdicts, the decision order, kinds that need a closer look, migrating a Replace, defects to fix in a Keep.
- [`references/design.md`](references/design.md): each part of the announcer and why, its API and options, what it can't do.
- [`references/adapting.md`](references/adapting.md): location and names, framework bindings, modals, server rendering, documentation.
- [`references/testing.md`](references/testing.md): unit tests, the browser recorder and its plan, scenarios, real screen readers.
- `assets/`: `announcer.ts` with `announcer.spec.ts`, and the React binding `use-announce.ts` with `use-announce.spec.tsx`.
- `scripts/`: `find-live-regions.mjs` (static inventory), `record-announcements.mjs` with `recorder.js` (what reaches screen readers in a browser). `<skill>` below is the folder this `SKILL.md` is in.

## Output

- **The code changes**, left uncommitted, and **one report**: `reports/accessibility/announcer-<YYYY-MM-DD>.md` in the root of the repository. Recorder plans and results live in the system's temporary directory.
- **Local by default.** Commit, push, or put the report anywhere online only when the user asks.

## Rules

- **One announcer per codebase.** A dependency that already ships this design (M7KIT's `useAnnounce` from 0.64.0) is used, upgraded if needed, and not copied. Another existing one (the project's own helper, or direct calls to React Aria's `announce`, Angular CDK's `LiveAnnouncer`, `wp.a11y.speak`) is upgraded or wrapped to this design, with its public name and existing calls kept working.
- **Polite by default.** Assertive only for an error that stops the user or a time-critical message. A region that turns polite is listed in the report.
- **Every live region gets a verdict** with a reason, from the decision order in `decisions.md`.
- **Proactive for what screen readers receive; proposals for what everyone sees.** Apply right away what only changes what screen readers get. Moving focus, and adding, removing or rewording visible text or toasts, go in the report as proposals unless the user asked for them.
- **Visible text stays visible.** Errors keep persistent text next to their field (WCAG 3.3.1).
- **Write it the project's way**: its folders, naming, comments, test style and lint rules.

## Steps

### 1. Survey

Find the framework (and how many: islands, several roots, micro-frontends), whether the project is a published library or an app, where shared utilities and hooks live, the dependencies that already ship an announcer (the inventory lists them first), the test runner and DOM environment (or that there is none), how the UI runs (dev server, Storybook) and what it needs (a database, a login), the docs and agent instruction files, and every modal: native `<dialog>`, `aria-modal`, focus traps, `inert` or `aria-hidden` on the page, modal libraries.

**Done when** you can name the announcer's file, exports and framework binding (or the dependency that provides them), and every modal with how it hides the page.

### 2. Inventory

Run `node <skill>/scripts/find-live-regions.mjs <repo>` and read every source hit in context. Add what a text search misses: components that render a region (a toast library, a component library's Alert, `<output>`), roles built from variables, regions created in templates or by other languages.

**Done when** every live region, announce call and toast in the source is a row: location, what it says and when, visible or hidden, politeness, and the container it sits in; and every modal from step 1 is listed.

### 3. Decide

Read `mechanics.md` and `decisions.md`, and give every row a verdict. If the user asked for an audit only, write the report with the verdicts and the planned changes, and stop here with an offer to apply them.

**Done when** every row has a verdict with a one-line reason, and every Replace has its politeness, `id`, `delay` and `from`.

### 4. Build

Read `design.md` and `adapting.md`. When a dependency provides the announcer, upgrade it if needed and import from it; its own tests stand in for the spec. Otherwise copy `assets/announcer.ts` (and the binding: React's, or one in the same shape) to the chosen place, resolve every `ADAPT:` comment, and port the spec to the project's runner (no runner: `testing.md`). Make every modal detected and primed when it opens. Export the announcer from a library's public entry.

**Done when** the announcer comes from the dependency, or the ported spec passes with no `ADAPT:` comment left; and every modal matches `:modal` or `MODAL_SELECTOR` and primes its regions when it opens.

### 5. Migrate

Apply every verdict, following "Migrating a Replace" and "Defects to fix in a Keep" in `decisions.md`; write proposals for changes everyone would see. Update the tests that read the old regions (`testing.md`), and the docs as `adapting.md` describes.

**Done when** every verdict is applied or written up as a proposal with a reason, and the only live regions left outside the announcer are Keep rows.

### 6. Verify

Run the project's tests, type checks and linters for the changed files. Run the inventory again and compare it with the verdicts. When the UI runs, write a recorder plan (`testing.md`): a scenario for every migrated place, including a quick series where it can fire repeatedly, plus the modal scenarios when the app has modals. Run it and read every timeline, focus lines included: a message that repeats the focused element's name is redundant, and one that repeats its description is kept and listed in the report.

**Done when** tests, types and lint pass (failures that predate the change named as such), every expectation passes, every flag is fixed or explained, and the second inventory matches the verdicts. When the UI can't run, the report says the browser check is missing.

### 7. Report

Write the report with these sections:

- **Summary**: what the announcer is, where it lives, how to call it.
- **Inventory**: one row per live region: location, what it announced, verdict, reason, what changed. Behavior changes (assertive to polite, messages removed) are marked.
- **Proposals**: changes everyone would see, each with its reason.
- **Verification**: test, type and lint results, and each recorder scenario with its timeline and flags.
- **Manual screen reader test**: the combinations and scenarios from `testing.md`, for each migrated place.

Reply with the report's path, the inventory in short, the files changed, the proposals, and what the automated checks can't prove with the manual steps.

**Done when** the report is written and that summary is in front of the user.
