# How live regions work

A screen reader reads one thing at a time: the focused element, or the spot where the user is reading. A **live region** is an element the browser watches: when its content changes, screen readers speak the change without moving focus. WCAG 2.2 **SC 4.1.3 Status Messages (AA)** requires status messages (the result of an action, a waiting state, progress, an error) to reach assistive technology this way, without focus. The Understanding page allows text that is only meant for assistive technology.

Not status messages: content that receives focus (a dialog), the state of a control (SC 4.1.2: `aria-expanded`, `aria-selected`, …), and new content in general (the results list itself; "18 results" is the status message).

## How an announcement travels

```
code changes the DOM
  → the browser updates the accessibility tree (roles, names, states; screen readers read this, not the DOM)
    → the browser sends an event to the OS accessibility API, with the region's settings
      → the screen reader decides whether, when and how to speak it, using its own speech queue
```

Anything left out of the accessibility tree (`display: none`, `visibility: hidden`, `hidden`, `aria-hidden="true"`, `inert`, outside an open modal) doesn't exist for a screen reader, live regions included. **The page only gives hints; the screen reader owns the queue**: you can't guarantee a message is spoken, in which order, or uncut. Users can also configure how their screen reader handles live regions.

## Building blocks

| Attribute or role                | Meaning                                                                                       | Implicit values                               |
| -------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `aria-live="off"`                | Default. Changes only read when focus is inside                                               |                                               |
| `aria-live="polite"`             | Spoken at the next graceful opportunity, after what is being read                             |                                               |
| `aria-live="assertive"`          | Highest priority, "presented immediately"; the screen reader MAY clear queued polite messages |                                               |
| `role="status"`                  | Advisory information                                                                          | `aria-live="polite"`, `aria-atomic="true"`    |
| `role="alert"`                   | Important, time-sensitive information                                                         | `aria-live="assertive"`, `aria-atomic="true"` |
| `role="log"`                     | Messages added in order, newest last                                                          | `aria-live="polite"`, `aria-atomic="false"`   |
| `<output>`                       | Result of a calculation or user action                                                        | same as `role="status"`                       |
| `role="timer"`, `role="marquee"` | Clocks, tickers                                                                               | `aria-live="off"`; poorly supported           |

| Attribute       | Effect                                                                                     | Default                                           |
| --------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `aria-atomic`   | `true`: every change reads the **whole** region (and its name). `false`: only what changed | `false`; `true` for `status`, `alert`, `<output>` |
| `aria-relevant` | Which changes count: `additions`, `removals`, `text`, `all`                                | `additions text`                                  |
| `aria-busy`     | `true` holds announcements back until it is `false` again                                  | `false`                                           |

Support for `aria-atomic`, `aria-relevant` and `aria-busy` varies; build nothing important on their fine details. An explicit `aria-live` overrides a role's implicit value (React Aria makes a `role="log"` assertive this way). Repeating a role's implicit value ("`role="alert" aria-live="assertive"`, to be safe") brings out browser and screen reader bugs (TetraLogical).

## The three rules

1. **The region exists before its content changes.** A region added together with its message is often missed (NVDA didn't announce an injected `role="status"` at all, nvaccess/nvda#14591), and so is a region that was hidden and shown at the moment of the message. A region created by script waits 100–150 ms before its first message (React Aria 100 ms: "otherwise Safari won't announce the message"; Primer 150 ms).
2. **Only a change is announced.** Content present at page load isn't read. Setting the same text again isn't a change, so a repeated message is silent unless it is a new node or the text differs.
3. **Hide it visually, never from the accessibility tree.** `display: none`, `visibility: hidden`, `hidden` and `aria-hidden` silence it in every screen reader. Use clip-based visually hidden styles (absolute, 1×1 px, `overflow: hidden`, `clip: rect(0 0 0 0)`).

## Politeness in practice

From Adrian Roselli's tests (January 2026):

| Screen reader + browser                                                                          | `assertive`                                         |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| NVDA 2025.3 + Firefox, JAWS 2026 + Chrome, Narrator + Edge, Orca + Firefox, TalkBack 16 + Chrome | Treated as polite                                   |
| VoiceOver + Safari, macOS 26 and iPadOS 26                                                       | Interrupts, and doesn't resume the interrupted text |

`role="alert"`: NVDA says "alert" first, VoiceOver plays a sound, Orca didn't announce it at all; Radix avoids it ("stuttering"), and Atlassian found "with role=alert the message was not reliably read when focus changed". WCAG's 4.1.3 Understanding page lists a failure: "Using `role="alert"` or `aria-live="assertive"` on content which is not important and time-sensitive". The APG Alert pattern adds: frequent interruptions harm users with visual and cognitive disabilities, and alerts must not move focus.

So: **polite by default**; assertive only for an error that stops the user or a time-critical message ("Connection lost. Your changes are not saved.", "Your session ends in 1 minute").

## Modals silence everything outside them

- `dialog.showModal()` makes everything outside the dialog **inert**, and inert nodes are not exposed to accessibility APIs, live regions included. A modal dialog escapes the inertness of its own ancestors, so `inert` on `<body>` plus a modal `<dialog>` in it still works.
- `aria-modal="true"` tells screen readers to ignore everything outside the element; VoiceOver does.
- Focus traps often put `inert` or `aria-hidden="true"` on the rest of the page.

A live region on `<body>` is silent while any of these is open. Fixes in use: a region **inside** the open modal (Primer; this design), `aria-owns` from the modal to the region (Angular CDK; doesn't get past `inert`), leaving the region out of `aria-hidden` (React Aria; doesn't help with `<dialog>` or `inert`), a container prop (Radix Toast `announcerContainer`).

## Focus moving at the same moment

Moving focus makes the screen reader read the newly focused element. A live region message at the same moment competes with it, and one of the two may be cut off. Send polite messages a moment after the focus move, and don't repeat what the focused element already says (a moved item whose name includes its position).

## `ariaNotify()`

`element.ariaNotify(message, { priority: "high" | "normal" })` speaks a string with no live region. Baseline "newly available" since September 2026 (Chromium 141, Firefox 150, Safari 27); WCAG technique ARIA27 since May 2026; Fluent UI uses it when available. Not yet a safe default: in a June 2026 test it worked with NVDA and TalkBack but **failed with VoiceOver on iOS 26.5**; MDN says usually only the latest call is spoken and `aria-live` changes take priority; its behavior with `inert` and modals isn't specified. The announcer keeps one `write()` function so it can switch later.

## Sources

- [WCAG 2.2 Understanding 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) (updated 11 May 2026)
- [WAI-ARIA 1.2 `aria-live`](https://www.w3.org/TR/wai-aria-1.2/#aria-live) and [live region roles](https://www.w3.org/TR/wai-aria-1.2/#live_region_roles)
- [APG Alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/)
- [HTML: `inert` and modal dialogs](https://html.spec.whatwg.org/multipage/interaction.html#the-inert-attribute)
- [Adrian Roselli, Live Region Support (January 2026)](https://adrianroselli.com/2026/01/live-region-support.html)
- [Sara Soueidan, Accessible notifications with ARIA live regions, part 1](https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-1/) and [part 2](https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-2/)
- [TetraLogical, Why are my live regions not working? (2024)](https://tetralogical.com/blog/2024/05/01/why-are-my-live-regions-not-working/)
- [NVDA issue #14591](https://github.com/nvaccess/nvda/issues/14591)
- [MDN `Element.ariaNotify()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/ariaNotify) and [oidaisdes.org, ariaNotify browser support (June 2026)](https://oidaisdes.org/blog/aria-notify-browser-support/)
- [Shopify Polaris PR #10406](https://github.com/Shopify/polaris-react/pull/10406), [W3C ARIA WG minutes, 15 December 2022](https://www.w3.org/2022/12/15-aria-minutes.html)
