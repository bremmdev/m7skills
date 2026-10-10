# Verdicts: what happens to each live region

Every row of the inventory gets one **verdict** and a one-line reason. Mechanics behind the reasons are in [`mechanics.md`](mechanics.md).

| Verdict | Meaning |
| --- | --- |
| **Replace** | The announcer delivers the message. The local region goes, with its state, timers and repeat tricks |
| **Keep** | The region stays where it is. Fix its defects (table below) |
| **Convert** | The message belongs to another mechanism: an ARIA state on the control, a focus move, or persistent visible text. The live behavior goes; that mechanism is put in place |
| **Remove** | The live behavior does harm and nothing needs to take its place |

## Decision order

Walk the questions in order; the first that matches gives the verdict.

1. **Owned by code the project can't change** (a component library's internal region, a framework's route announcer)? **Keep**, and note it. When the library takes the message text through a callback that may return nothing, or lets you turn its region off, use that to **Replace** it.
2. **Does it announce a control's state** (expanded, collapsed, selected, checked, pressed, current page, sort order, "menu opened")? **Convert** to the ARIA state on the control (`aria-expanded`, `aria-selected`, `aria-checked`, `aria-pressed`, `aria-current`, `aria-sort`); **Remove** when the state is already there. Screen readers announce the state; a message as well is heard twice.
3. **Does focus move to what it announces, or does the focused element already say it** ("Dialog opened" while focus goes into the dialog; a position that's in the moved item's name)? **Remove**. Keep only the part focus doesn't say. Check that focus really carries it:
   - **The target holds the message when focus lands.** Frameworks render state changes after the event handler, so `setErrors(…); summary.focus()` focuses the old, often empty, element; the live region was what actually spoke. **Convert**: render first (React `flushSync(() => …)`, Vue `await nextTick()`, Svelte `await tick()`, Angular `detectChanges()`), then focus. The recorder's `expectFocus` proves it.
   - **Focus actually moves.** Focusing the element that already has focus reads nothing: a form submitted with Enter from the field it then focuses. Then focus can't carry the message: **Replace**.
4. **Does it change continuously** (a clock, a countdown, an animated counter, progress every percent)? **Remove** the live behavior; **Replace** for the moments that matter (the end, "1 minute left"). An auto-rotating carousel follows the APG carousel pattern (`aria-live="off"` while rotating, `polite` when the user moves it): **Keep**.
5. **Is the message visible text that stays on screen** (a result count, "Last saved 10:42", a form's result banner, an error summary, a chat log, a calculated `<output>`)? **Keep**, and fix its defects. Three exceptions:
   - It is rendered together with its message (`{saved && <output>…}`) and can't be rendered empty without changing the layout (a gap in a `space-y-*` or `gap` stack, a bordered box): the text stays visible without its live role, and the delivery is **Replace**d.
   - It updates in a quick series (every keystroke, every slider step): make the visible text not live and **Replace** with an `id` and a `delay`, so only the settled value is announced.
   - It mirrors the value of the focused control (an `<output>` next to a slider): **Remove** (`aria-live="off"`); the control announces its own value.
6. **Everything else is Replace**: text only for screen readers (visually hidden), visible text that disappears (toasts, "Copied", a "Saved" that fades), regions created together with their message, regions inside a `<label>` or control, the project's own announce helpers, and the project's calls to third-party announcers.

## Kinds that need a closer look

- **The project's own announcer.** Upgrade it in place to the design: keep its exported name and keep existing calls working (map old arguments to options, e.g. `announce(message, element)` → `announce(message, { from: element })`), or migrate the call sites when there are few. Never leave two announcers.
- **Third-party announce calls in the project's code** (React Aria `announce`, Angular CDK `LiveAnnouncer.announce`, `wp.a11y.speak`, Primer `announce`): **Replace** the calls, so one queue spaces every message and modals are handled. The library's own components keep using theirs (verdict 1).
- **Form errors.** The visible error text next to the field stays (WCAG 3.3.1), linked with `aria-describedby` (or `aria-errormessage`) and `aria-invalid` (**Convert** where missing). A `role="alert"` on each field error fires several alerts at once on submit, each created with its message: **Replace** them with one assertive message per submit ("2 errors: Email is required. Password is too short."), or **Remove** them when the form already moves focus to the first invalid field or an error summary, after the checks in question 3. Validation while typing is never announced per keystroke: rely on the description read on focus, or **Replace** with an `id`, polite, and a `delay`.
- **Toasts and snackbars.** The project's own toast component: **Replace** its live behavior. The toast stays visible without `role="status"`/`aria-live`, and showing it calls `announce(text)` (assertive only for error toasts that need it). A toast library: **Keep**, unless it lets you turn its live region off, then **Replace**. Either way the report notes that a library region on `<body>` is silent while a modal is open, and a toast with an action button gets a proposal: the action needs another way in (a screen reader hears the text, not the button, and the toast may be gone before it's reached).
- **Loading states.** A "Loading…" `role="status"` rendered while loading is created with its message: **Replace** with `announce("Loading results", { id, delay: 1000 })` when loading starts and `announce("18 results", { id })` when it ends. A load under a second then only announces the result, because the waiting loading message is replaced. `aria-busy` on a container isn't a live region by itself: **Keep**.
- **Route changes in a single-page app.** A framework's route announcer (Next.js, Gatsby, SvelteKit): **Keep**. A custom one: **Remove** when focus moves to the new page's heading; otherwise **Replace** with `announce(document.title)` (polite) and propose moving focus to the heading.
- **Messages on the next page** (a flash message after a redirect): content present at load isn't announced. The text stays visible; **Replace** the delivery with one `announce(text)` after load, or propose moving focus to the message.
- **`aria-live` on a large container** (a whole list, a form, `<main>`): **Remove** the live behavior and **Replace** with a summary ("18 results", "Item added").

## Migrating a Replace

- **`politeness`**: polite, unless the message is an error that stops the user or time-critical. An old `role="alert"` or `aria-live="assertive"` that turns polite is a behavior change: list it in the report.
- **`id`**: one per source instance (React `useId()`, a module counter, a stable key), when the source can fire again before its last message is read: moves, repeated clicks on a read-only control, counts. Independent messages get no `id`.
- **`delay`**: when the source fires in a series faster than about half a second: 500 ms for arrow-key reordering, at least the search's own debounce for typing, 1000 ms for a loading message.
- **`from`**: the component's root or the element that triggered it, so the message reaches the component's dialog. Inside a component, use the framework binding.
- **When**: where the message used to appear. A region that rendered its message from state (a banner shown for a `status`, a count rendered from props) becomes an announcement when that state *changes*, not on mount: content present at load was never read, so a page loaded (or server-rendered) with a result announces nothing. In React, an effect on the state value that skips the value it mounted with.
- **Text**: short, the change first, with enough context to stand alone ("Moved Apple to position 2 of 4", not "Moved"); translated like the rest of the UI; no "Alert:" prefixes, emoji or symbols; nothing the focused element already says. A message is one string read in the page's language: words the old region marked with `lang` lose it, which the report lists as a behavior change.
- **Remove** the region element, its message state, clear-then-set timers, `key` changes and non-breaking-space tricks used for repeats, and `aria-live`/live roles left on visible elements.
- **Tests** that read the old region now read the announcer's regions ([`testing.md`](testing.md)).

## Defects to fix in a Keep

| Defect | How to spot it | Fix |
| --- | --- | --- |
| Created together with its message | `{message && <div role="status">…}`, a `key` that changes, `innerHTML` that adds the region; recorder flag `new-region` | Render the region always and change only its content. Rendered empty, it must not change the layout (margins, gaps); when it would, Replace (question 5) |
| Hidden from the accessibility tree | `display: none`, `visibility: hidden`, `hidden`, `aria-hidden`, a closed `<details>` or dialog around it; recorder `silent` | Visible, or visually hidden with clip |
| Inside a `<label>`, button or link | The region's ancestors | It becomes part of that element's accessible name: move it out, or Replace |
| Atomic while it grows | `role="status"`/`role="alert"` or `aria-atomic="true"` around a list that gets new items | Every addition rereads everything: `role="log"` without `aria-atomic`, or Replace |
| Repeats a role's implicit value | `role="alert" aria-live="assertive"`, `role="status" aria-live="polite"` | Drop the `aria-live` |
| Assertive without need | `role="alert"` or `aria-live="assertive"` on a non-urgent message; recorder `assertive` | Polite: `role="status"` or `aria-live="polite"` |
| A repeated message is silent | The same text set twice; clear-and-wait timers | Replace when repeats matter |
| Silent while a modal is open | A region on the page that gets messages while a modal can be open; recorder `silent: outside the open modal` | Replace |
| Too chatty | Recorder `burst`; every keystroke or step announced | Replace with an `id` and a `delay` |

## Proactive or proposal

Apply a verdict right away when it only changes what screen readers receive: announcer calls, live attributes, ARIA states, visually hidden regions, and *when* focus lands (rendering before an existing focus move). Write it up as a **proposal** in the report instead when sighted or keyboard users would notice: moving focus somewhere new, adding, removing or rewording visible text, changing or removing a toast. Apply proposals only when the user asks.

Upgrading a dependency to get its announcer is applied when its changelog lists no breaking changes up to that version; the report lists what else the upgrade brings. With breaking changes, it is a proposal, and the announcer is copied meanwhile.
