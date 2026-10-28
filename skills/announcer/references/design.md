# The announcer's design

Two live regions with one child per message (the structure React Aria uses), delivered as an imperative singleton with optional framework bindings, routed into open modals (as Primer does), polite by default. [`../assets/announcer.ts`](../assets/announcer.ts) implements it and [`../assets/announcer.spec.ts`](../assets/announcer.spec.ts) tests every behavior below.

## The DOM it creates

Without an open modal, at the end of `<body>`:

```text
div[data-<project>-announcer]   visually hidden with inline styles (absolute, 1×1 px, overflow hidden, clip)
├── div role="log" aria-live="polite"    aria-relevant="additions"
│   └── div "Saved"                       one child per message, removed after 7 s
└── div role="log" aria-live="assertive" aria-relevant="additions"
```

While a modal is open, the same pair is created inside it, as its first child:

```text
dialog (open, modal)
├── div[data-<project>-announcer] → the same two regions
└── the dialog's content
```

## What `announce("Saved")` does

1. **Queue.** The message is queued with `notBefore = now + max(100 ms, delay)`. A waiting message with the same `id` is replaced in place, and its wait starts again.
2. **Space.** One message is written at a time, at least 250 ms apart. Of the messages that are ready, assertive goes first.
3. **Pick the container, now** (when writing, not when `announce()` was called):
   1. the open dialog or modal around `from`, unless another modal is open on top of it;
   2. otherwise the topmost open modal (the last `dialog[open]` that matches `:modal`, or the last visible `[aria-modal="true"]`), also for a message from the page behind it;
   3. otherwise `<body>`.
4. **Prime.** The container's pair is created if it's missing; a pair younger than 150 ms makes the message wait for it.
5. **Append** a new `<div>` with the text to the region of the message's politeness. With an `id`, the older written message with that `id` is removed (silently: only additions are relevant).
6. **Clean up.** The child is removed after `timeout` (7 s).

## API

| Export | Purpose |
| --- | --- |
| `announce(message, options?)` | Queue a message. Ignores empty text and runs nowhere without a `document` (SSR) |
| `cancelAnnouncement(id)` | Drop the waiting message with this `id`, for work that ends with nothing to say: the user cancels a search, a request is aborted, the component is removed, so the delayed "Loading results" must go without a replacement. Other sources keep their messages; a message already written stays until its timeout |
| `clearAnnouncer(politeness?)` | Cancel waiting messages and empty the regions, for one politeness or both; without an argument it also resets spacing and ids (tests use it between cases) |
| `ensureLiveRegion(element?)` | Create the pair for the element's dialog (open or not) or `<body>` ahead of time. For modals when they open; internal for a library |
| A binding per framework | Primes on mount and returns `announce` with `from` set to the component's element (React: [`../assets/use-announce.ts`](../assets/use-announce.ts)) |

| Option | Default | Use |
| --- | --- | --- |
| `politeness` | `"polite"` | `"assertive"` only for errors that stop the user and time-critical messages |
| `from` | none | The announcing element. Picks the regions of its dialog; without it, the topmost modal or `<body>` |
| `id` | none | One per source (a component instance). A waiting message with the same `id` is replaced; a written one is removed when the next is written |
| `delay` | ~100 ms | Wait longer before writing; a newer message with the same `id` restarts the wait. For a series spread over time (key presses, typing, a slider) |
| `timeout` | 7000 | Milliseconds until the message is removed |

## Why each part

| Choice | Why | Instead of |
| --- | --- | --- |
| Two regions, polite and assertive | Each message keeps its own politeness; one pair per page and per open modal, never one per component | One region whose `aria-live` changes per message (Angular CDK): the change hits messages still waiting |
| One child per message | Components can't overwrite each other's message before it's read, and a repeat is a new node, so it's announced again with no tricks | Replacing the text, which needs a queue plus a clear-and-wait or non-breaking-space trick for repeats |
| `role="log"` + `aria-relevant="additions"`, no `aria-atomic` | Only the new child is read; removing old children is silent | `role="status"`/`"alert"`: atomic, so every message still in the region is read again; `alert` has side effects |
| Explicit `aria-live` on each log | Makes the second log assertive (as React Aria does) | |
| Polite by default | WCAG lists needless assertive as a failure; most screen readers treat it as polite anyway | React Aria's assertive default |
| Inside the topmost open modal, picked at write time | Everything outside a modal is inert or ignored. Picking late keeps a message sent while a modal closes out of the hidden modal | `aria-owns` (CDK), which doesn't get past `inert` |
| Prepended inside a modal | Absolutely positioned, so it takes no space, but it still counts for `:first-child`/`:last-child`; prepending keeps the content's last child last. Flip to append when the project's styles skip the first child instead (see adapting.md) | |
| Imperative function plus a binding, no provider | Nothing to forget, so no silent failure; works from any handler, any framework, any root | A provider (Fluent UI) whose hook does nothing without it, a 4.1.3 failure |
| Queue: 100 ms, then 250 ms apart | Messages from one moment are merged and ordered, the page settles (a closing dialog, a focus move), and screen readers get each message separately | Primer 150 ms, Fluent 500 ms |
| `id` merges waiting messages | Holding an arrow key only announces the final position | Announcing every step |
| `delay` debounces per `id` | A written message is already in the screen reader's queue, and removing it doesn't take it back; only not writing the in-between steps helps | A shorter interval, which only writes faster |
| `cancelAnnouncement(id)` drops only what waits | `id` and `delay` leave messages waiting, and some outcomes need none: replacing isn't possible, so the waiting one is withdrawn. A written one is already with the screen reader, and removing it is silent | `announce("")` (empty messages are ignored on purpose); `clearAnnouncer()`, which drops every source's messages |
| A warning in development for 3 messages written within a second, not a cap | Screen readers read every message, so a burst is a bug in its source; the warning names the messages, so the source gets an `id` and a `delay` or one merged message. It warns once per burst and is off in production | A maximum number of messages, which has to drop messages it can't rank (an error is no more important to it than "Saved") and hides the bug |
| Priming: 150 ms for a new pair | Rule 1 in mechanics.md | |
| Removed after 7 s | No stale messages when browsing; long enough to be read | Leaving them |
| One `write()` | The transport can switch to `ariaNotify()` without changing the API | |

## Constants

`QUEUE_DELAY` 100, `MESSAGE_INTERVAL` 250, `PRIMING_DELAY` 150, `DEFAULT_TIMEOUT` 7000, `BURST_SIZE` 3 within `BURST_WINDOW` 1000 (the recorder's `burst` flag uses the same). Keep them unless screen reader testing in the project shows a reason; a `delay` of 500 ms suited arrow-key reordering, and a typing-driven message should wait at least as long as the search's own debounce.

## What it can't do

It can't control the screen reader's queue. VoiceOver can cut a polite message off with an assertive one and drop polite messages that were waiting; a burst can still be read partly; a message the user missed can't be replayed; `cancelAnnouncement` can't take back a message that was already written. So messages stay short, few and polite, and anything the user needs later stays visible on the page.

It can't mark languages. A message is one string, written as text and read in the page's language, the same limit as `aria-label`: a Latin or French word in the old region's `<span lang>` is read with the page's voice. Visible text keeps its `lang`; a project that marks languages gets that change in its report.

Every copy of the announcer module has its own queue. Two copies on one page (a library and an app each bundling one, micro-frontends) share the regions when they use the same attribute, but not the spacing or `id` merging; keep one module per page where possible (adapting.md).

## How other libraries compare

Checked in their published source, October 2026.

| | React Aria | Fluent UI v9 | Angular CDK | Primer | This design |
| --- | --- | --- | --- | --- | --- |
| Delivery | Function | Provider + hook (no-op without provider) | Service | Custom element + function | Function + binding |
| Regions | 2, `role="log"` | `ariaNotify()`, else 1 assertive | 1, politeness switched per message | 2 | 2, `role="log"`, per container |
| Message | Appended, removed after 7 s | Queued, text replaced every 500 ms | Text replaced after 100 ms | Queued, replaced, 150 ms apart | Appended, 250 ms apart, removed after 7 s |
| Default | Assertive | Normal | Polite | Polite | Polite |
| Modals | Left out of its own `aria-hidden` | None | `aria-owns` from each modal | Region inside the open `<dialog>` | Regions inside the topmost open modal |

Sources: [React Aria `LiveAnnouncer.tsx`](https://github.com/adobe/react-spectrum/blob/main/packages/react-aria/src/live-announcer/LiveAnnouncer.tsx), [Fluent UI `AriaLiveAnnouncer`](https://github.com/microsoft/fluentui/tree/master/packages/react-components/react-aria/library/src/AriaLiveAnnouncer), [Angular CDK `live-announcer.ts`](https://github.com/angular/components/blob/main/src/cdk/a11y/live-announcer/live-announcer.ts), [Primer `live-region-element`](https://github.com/primer/live-region-element), [`@wordpress/a11y`](https://github.com/WordPress/gutenberg/tree/trunk/packages/a11y), [Radix `announce.tsx`](https://github.com/radix-ui/primitives/blob/main/packages/react/announce/src/announce.tsx), [Atlassian live region](https://github.com/atlassian/pragmatic-drag-and-drop/tree/main/packages/live-region), [dnd-kit `LiveRegion`](https://github.com/clauderic/dnd-kit/blob/master/packages/accessibility/src/components/LiveRegion/LiveRegion.tsx).
