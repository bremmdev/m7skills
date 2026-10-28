# Testing announcements

Three levels, each proving something the others can't: unit tests prove the announcer's behavior and each component's messages; the browser recorder proves what reaches the accessibility tree and whether a screen reader can hear it; only real screen readers prove what is spoken.

## 1. Unit tests

**The announcer.** Port [`../assets/announcer.spec.ts`](../assets/announcer.spec.ts) (and [`use-announce.spec.tsx`](../assets/use-announce.spec.tsx) for React) to the project's runner and style. Every `describe` is a behavior to keep; a ported spec that skips one needs a reason in the report. Vitest and Jest share the calls (`vi` ↔ `jest`; Jest has no `stubEnv`, so set and restore `process.env.NODE_ENV`). The burst warning logs in tests too: the spec silences `console.warn`, and a project whose tests fail on console output does the same where its tests send bursts on purpose. Vitest without `globals` doesn't unmount Testing Library renders between tests, so call `cleanup()` in `afterEach`.

- **A project without a test runner:** don't add one unasked. Run the spec against the adapted file in a temporary folder outside the repository (`npm i -D vitest jsdom` there), and propose a runner in the report.
- **An announcer from a dependency:** it is tested there; there is nothing to port.

The DOM environment matters:

- jsdom has no `showModal()` and no `:modal`. The spec stands in a `<dialog open data-modal>` for a modal dialog by mocking `Element.prototype.matches` for `:modal`. Components that call `showModal()` need it mocked (`HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); }`), plus `data-modal` or the same `matches` mock.
- jsdom has no accessibility tree and no `checkVisibility()`; the announcer guards for it.
- Check whether the environment supports `showModal()` and `:modal` before relying on them (happy-dom and newer jsdom versions differ).

**Components that announce.** After the migration, their tests read the announcer's regions:

```ts
// The announcer is a singleton: reset it between tests
afterEach(() => {
  clearAnnouncer();
  document.querySelectorAll(`[${ANNOUNCER_ATTRIBUTE}]`).forEach((wrapper) => wrapper.remove());
});

const politeMessages = (container: Element = document.body) =>
  Array.from(
    container.querySelector(`:scope > [${ANNOUNCER_ATTRIBUTE}] > [aria-live="polite"]`)?.children ?? []
  ).map((node) => node.textContent);

// With fake timers: messages are written 100 ms after announce(), a new pair waits 150 ms first
vi.useFakeTimers();
act(() => button.click());
act(() => vi.advanceTimersByTime(QUEUE_DELAY + PRIMING_DELAY));
expect(politeMessages()).toEqual(["Saved"]);
```

With user-event and fake timers, create it with `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`. Under Vitest, Testing Library only advances fake timers it recognizes as Jest's, so its clicks hang until the test times out: set `globalThis.jest = vi` in the setup file.

| Old assertion | New assertion |
| --- | --- |
| `getByRole("status")` / `getByRole("alert")` has the text | The polite or assertive region of the right container has a child with the text, after advancing the timers |
| `[aria-live='assertive']` has the text | The **polite** region, when the verdict made it polite |
| The text is replaced on the next message | Only the latest message with that `id` is in the region |
| The region is inside the component | The pair is in the component's dialog (`:scope > [attr]`), or at the end of `<body>` |

For a series, assert what was **ever written**, not what is in the region at the end: screen readers read every message that was written, even one that is removed later. Use `recordAdditions()` from the spec (a `MutationObserver` on the region plus `takeRecords()`, since fake timers can hold the observer's callback back), drive the series with the real gaps (three arrow presses 200 ms apart), and expect only the final message. Check that such a test fails without the `delay`, so it really reproduces the bug. A cancelled message is tested the same way: drive time past its `delay` and expect it never to have been written.

**What focus and the announcer say together.** Assertions on the regions alone can't show that a message repeats what focus reads, or that a stale message follows an error. Log everything a screen reader would speak: the announcer's messages, and the name and description of each element that receives focus. Then expect each message from the announcer (never rely on the description alone, decisions.md question 3), nothing the focused element's name already says, and no stale message after the outcome. A text spoken twice because it is also a description is expected; the report lists it. `dom-accessibility-api` comes with `@testing-library/jest-dom`:

```ts
import { computeAccessibleDescription, computeAccessibleName } from "dom-accessibility-api";

const recordSpoken = () => {
  const spoken: string[] = [];
  const collect = (records: MutationRecord[]) => {
    for (const record of records) {
      if (!(record.target as Element).closest?.(`[${ANNOUNCER_ATTRIBUTE}]`)) continue;
      for (const node of record.addedNodes) spoken.push(`LIVE ${node.textContent}`);
    }
  };
  const observer = new MutationObserver(collect);
  observer.observe(document.body, { childList: true, subtree: true });
  // Read focus a moment later, after the framework has rendered, as a screen reader does
  const onFocus = (event: FocusEvent) => {
    const element = event.target as Element;
    setTimeout(() => {
      if (document.activeElement !== element) return;
      collect(observer.takeRecords());
      spoken.push(`FOCUS ${computeAccessibleName(element)} | ${computeAccessibleDescription(element)}`);
    }, 0);
  };
  document.addEventListener("focusin", onFocus);
  return () => {
    collect(observer.takeRecords());
    observer.disconnect();
    document.removeEventListener("focusin", onFocus);
    return spoken;
  };
};

const timesSpoken = (spoken: string[], text: string) => spoken.filter((line) => line.includes(text)).length;

const stop = recordSpoken();
await user.click(screen.getByRole("button", { name: "Use my location" }));
act(() => vi.advanceTimersByTime(200)); // the permission callback runs and moves focus; React renders when act() ends
act(() => vi.advanceTimersByTime(LOCATING_DELAY + MESSAGE_INTERVAL));
const spoken = stop();
// Announced, though the field also describes it: descriptions can be switched off
expect(spoken).toContain(`LIVE ${PERMISSION_ERROR}`);
expect(timesSpoken(spoken, "Getting your location")).toBe(0);
```

Two traps make the log miss what focus reads, so a repeat of the name goes unseen and a double isn't listed:

- **Reading focus in `focusin` itself.** A focus move in a callback comes before the framework renders the error and `aria-describedby`, so the description reads empty.
- **One `act()` over the focus move and the read.** React renders when `act()` ends, so the read timer fires before the render. End an `act()` at the moment the callback runs (`advance(200)` for a callback after 200 ms), then advance the rest.

## 2. The browser recorder

`scripts/record-announcements.mjs` opens pages in Chromium, runs actions, and logs what the page hands to screen readers: each live region change (with politeness, container, and the text a screen reader gets: the whole region when atomic, otherwise only the change), each `ariaNotify()` call and each focus change. For each message it says whether a screen reader can hear it, and at the end it asks Chromium's accessibility tree (CDP `Accessibility.getPartialAXTree`) whether every region is exposed or ignored.

Run it from a folder where Playwright (`playwright`, `playwright-core`, `@playwright/test`) or Puppeteer (`puppeteer`, `puppeteer-core`) is installed: the project, or a temporary folder outside the repository (`npm i playwright-core` there; it uses installed Chrome or Edge). Ask before downloading browsers or adding anything to the project. Start the dev server or Storybook in the background, wait until it answers, and stop it afterwards if you started it.

Scenarios that log in, save or just visit pages write data (sessions, analytics, the records they save). Point the server at a copy of the database and give it throwaway secrets through its environment, usually the variables `.env` sets, which an existing environment variable overrides. Check that the real database is untouched afterwards. A plan never holds a real password.

```
node <skill>/scripts/record-announcements.mjs <plan.json> [--out <result.json>]
```

```json
{
  "url": "http://localhost:6006/iframe.html?id=sortablelist--default&viewMode=story",
  "waitFor": "#storybook-root > *",
  "scenarios": [
    {
      "name": "Quick moves announce the final position once",
      "actions": [
        { "click": "button[aria-label^='Enter edit mode']" },
        { "focus": "button[aria-label^='Reorder Apple']" },
        { "press": "ArrowDown", "times": 3, "interval": 200 }
      ],
      "expect": ["Moved Apple to position 4 of 4"],
      "expectNot": ["position 2 of 4", "position 3 of 4"]
    },
    {
      "name": "Saving inside the settings dialog",
      "url": "http://localhost:5173/settings",
      "actions": [{ "click": "#open-settings" }, { "click": "#save" }],
      "expect": ["Settings saved"]
    }
  ]
}
```

- **Plan**:
  - `url` and `waitFor`, plus `ready`: a JavaScript expression waited for after `waitFor`. A server-rendered page shows its elements before it hydrates; actions before hydration hit server HTML, and a form then submits natively and reloads. For React: `"(() => { const f = document.querySelector('form'); return !!f && Object.keys(f).some((k) => k.startsWith('__reactProps')); })()"`.
  - `warmup`: ms to wait on each URL in a first, unrecorded visit; default 2000, `0` skips it. A dev server compiles a page on its first visit, and Vite reloads it after optimizing new dependencies (always after a dependency changed), which would land in the middle of a scenario.
  - Optional: `viewport`, `browser` (`{ "channel": "msedge" }` or `{ "executablePath": "…" }`), `driver` (`"puppeteer"` to prefer it), `settle` (ms after load, default 300), `settleAfter` (ms after the actions, default 1500).
- **Scenario**: `name`, optional `url`, `waitFor` and `ready`, `actions`, and these checks:
  - `expect`: texts that must be heard, in this order; substrings ("result for amo" doesn't match "2 results for amo").
  - `expectNot`: texts that must not be heard.
  - `expectFocus`: texts the focused element's name or description must contain when focus lands. Use it for messages that focus reads out, such as an error summary, or a field's error in its `aria-describedby`.
  - Optional: `settle` (ms after the actions), `includeLoad: true` to keep what happened while the page loaded, `isolate: true` for a fresh browser context.

  Scenarios share one browser context and run in order, so a scenario that logs in leaves the next ones logged in.
- **Actions**: `{ "click" | "hover" | "focus": selector }`, `{ "fill": selector, "text": "…" }`, `{ "type": selector, "text": "…", "delay": 50 }` (key by key, for typing-driven messages), `{ "press": "ArrowDown", "times": 3, "interval": 200 }`, `{ "waitFor": selector }`, `{ "wait": ms }`, `{ "eval": "js" }`. Selectors are CSS (`querySelector`).
- **Heard** means: in a region a screen reader can hear at that moment, and the region existed before the message. A message that arrives together with its region doesn't count, because screen readers often miss it.

Flags are leads to fix or explain:

| Flag | Meaning |
| --- | --- |
| `silent` | Written where a screen reader can't hear it: outside the open modal, inside `inert`, `hidden` or `aria-hidden`, or not rendered |
| `new-region` | The region was added together with its message |
| `assertive` | An assertive message or high-priority `ariaNotify()`: check it is an error or time-critical |
| `burst` | Three or more messages within a second; screen readers read every one. The announcer warns in the console for the same in development |
| `focus-duplicate` | The message repeats what focus read less than 2 s before, with no key press, click or input in between. In the **name**: redundant, leave it out of the message. In the **description** (or the description is in the message): expected, since descriptions can be switched off; list it in the report |
| `region … IGNORED (reason)` | Chromium leaves that region out of the accessibility tree at the end (`activeModalDialog`, `inertElement`, `notRendered`, `ariaHiddenElement`) |

The timeline also shows focus changes, with the focused element's name and, after `|`, its description (`input "Email" | "Enter a valid email address"`). Both are read 50 ms after the focus change, when the page has rendered: a screen reader gets the focus event about then, and a focus move in a callback often comes before the framework renders the field's error (even `setTimeout(…, 0)` is too early for React in Chromium). A message right after a focus change competes with what focus reads; when it says the same thing, the recorder flags `focus-duplicate`.

The region list at the end includes regions the project doesn't own. Dev-only tools add their own, such as TanStack Devtools' hidden `p[aria-live]`. Name them in the report rather than migrating them.

**Without Playwright or Puppeteer**, use any browser tool that runs page JavaScript: run the contents of `scripts/recorder.js` in the page before the actions (after a reload, run it again), do the actions, then read `liveRegionLog()`. Installed after load, it can't tell which regions were created together with their message before it ran, and there is no accessibility tree check: say so in the report.

**Scenarios to cover**: every migrated place (its normal message, plus a quick series where it can fire repeatedly), and, when the app has modals, these:

1. the same message twice;
2. a burst of messages;
3. a polite and an assertive message at the same moment;
4. a message from inside an open modal;
5. a message from the page while a modal is open (a timer or a background task);
6. a message sent while a modal closes ("Save and close");
7. a message right after focus moves.

Where a form or a callback moves focus to a field in error, or a delayed message can wait, also:

8. the same error reached both ways: submitted from the button (focus moves to the field) and with Enter in the field already in error (focus stays); `expect` the error both times;
9. an error from a callback outside the framework that moves focus (a denied permission, a timer); `expect` the error;
10. work that ends while its delayed message waits: with an error (`expect` the error, `expectNot` the loading message), and with nothing to say, such as the user cancelling (`expectNot` the loading message).

A temporary demo page or story is fine for scenarios the app can't reach; delete it afterwards. The same goes for temporary switches that make a quick path slow enough to hear (a browser that blocks geolocation fails within milliseconds, before the delayed "Getting your location" is written): keep them off in tests, and remove them before finishing.

## 3. Real screen readers

Live region support changes between versions, so the report gives the user a manual test script: the scenarios above for each migrated place, on

| Platform | Combination |
| --- | --- |
| Windows | NVDA + Firefox, NVDA + Chrome, JAWS + Chrome, Narrator + Edge |
| macOS | VoiceOver + Safari |
| iOS | VoiceOver + Safari |
| Android | TalkBack + Chrome |

Live region monitors show which announcements fire, which separates a code bug from a screen reader quirk: NerdeRegion (browser extension) and [ARIA-testify](https://github.com/stevefaulkner/ARIA-testify) (also logs `ariaNotify()`).

## What the automated checks can't prove

That a message is spoken, in which order, whether VoiceOver cuts it off or drops it, how a screen reader's own settings change it, and what Firefox and Safari expose (the recorder's tree check is Chromium only). The report says this, with the manual script.
