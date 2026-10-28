/**
 * Screen reader announcements through two shared, visually hidden live regions: one polite and one assertive.
 *
 * Every message is added to its region as a new child element instead of replacing the region's text. Messages from
 * different components can't overwrite each other before they are read, and a repeated message is a new addition, so
 * it is announced again. The regions are `role="log"` with `aria-relevant="additions"`: only the new child is read
 * (`aria-atomic` stays false) and removing old messages is silent. `role="status"` and `role="alert"` would make the
 * regions atomic, so every message still in them would be read again.
 *
 * Polite is the default. Assertive is for errors and time-critical messages only: WCAG counts other use as a failure,
 * most Windows screen readers treat it as polite anyway, and VoiceOver interrupts what it is reading.
 *
 * The regions live outside the components on purpose: a live region inside a `<label>` would add its message to the
 * accessible name of the labelled control.
 *
 * Content outside a modal dialog (`showModal()`, `aria-modal="true"`, or a focus trap that makes the rest of the page
 * inert) is hidden from screen readers, live regions included. So messages go into regions inside the open modal: the
 * one around the announcing element, or else the topmost one. Only without an open modal do they go to `document.body`.
 */

// ADAPT: every comment that starts with ADAPT is a decision for the codebase this file is copied into. Make it, then
// delete the comment. Keep the rest of the behavior: announcer.spec.ts tests all of it.

export type Politeness = "polite" | "assertive";

export type AnnounceOptions = {
  /**
   * `polite` waits until the screen reader has finished what it is saying, `assertive` may interrupt it.
   * Assertive is for errors and time-critical messages only
   * @default "polite"
   */
  politeness?: Politeness;
  /**
   * The element the message comes from, usually the component that announces it. While it is inside an open dialog,
   * the message goes to the live regions of that dialog, because everything outside a modal dialog is hidden from
   * screen readers
   */
  from?: Element | null;
  /**
   * Identifies where the message comes from, for example one component instance. A message with the same `id` that is
   * still waiting is replaced by the new one, so a burst only announces the latest, and `cancelAnnouncement(id)` drops
   * it. When it is written, an older message with the same `id` is removed from the live region
   */
  id?: string;
  /**
   * Milliseconds to wait before the message is written (instead of about 100 ms). A newer message with the same `id`
   * starts the wait again, so a quick series (an item moved several times) is announced once, when it stops, with the
   * latest message. Screen readers read every message they receive, so without it each step is read out in turn
   */
  delay?: number;
  /**
   * Milliseconds before the message is removed from the live region, so it isn't found later as stray text when
   * browsing the page
   * @default 7000
   */
  timeout?: number;
};

// ADAPT: prefix with the project's name (data-<project>-announcer). Another copy of the announcer on the same page
// (a library and the app) reuses the pair when both use the same attribute
export const ANNOUNCER_ATTRIBUTE = "data-announcer";

// ADAPT: modals in this codebase that hide the rest of the page without showModal() or aria-modal="true" (a focus trap
// that sets inert or aria-hidden on the page) need their selector here, or aria-modal="true" on their dialog element
const MODAL_SELECTOR = "[aria-modal='true']";

/** Messages are written this long after `announce()`: messages from the same moment can be merged and ordered, and the page can settle first (a dialog that is closing) */
export const QUEUE_DELAY = 100;
/** Time between two messages, so screen readers get each message separately */
export const MESSAGE_INTERVAL = 250;
/** A new pair of regions waits this long before its first message: screen readers can miss a message in a region that was only just added */
export const PRIMING_DELAY = 150;
/** Messages are removed after this long, so they aren't found as stray text when browsing the page */
export const DEFAULT_TIMEOUT = 7000;
/** In development, this many messages written within BURST_WINDOW log a warning: screen readers read every one */
export const BURST_SIZE = 3;
export const BURST_WINDOW = 1000;

declare const process: { env: { NODE_ENV?: string } };

// ADAPT: how the codebase tells development from production. Use its own flag, so a production build removes the
// warning: `import.meta.env.DEV` (Vite), `process.env.NODE_ENV !== "production"` written out like this (webpack,
// Next.js, Rollup or esbuild with a define). The try/catch below works without a bundler too, but stays in the build;
// then drop the `declare const process` above
const isDevelopment = () => {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
};

type QueuedMessage = {
  message: string;
  politeness: Politeness;
  from?: Element | null;
  id?: string;
  timeout: number;
  // The earliest time the message may be written
  notBefore: number;
};

let queue: QueuedMessage[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let lastWrite = Number.NEGATIVE_INFINITY;

// When each pair of regions was created, so the first message in a new pair can wait for it to be registered
const createdAt = new WeakMap<Element, number>();
// The last message written for each id, removed when a newer one with the same id is written
const writtenById = new Map<string, HTMLElement>();
// Development only: the messages written in the last BURST_WINDOW, and whether this burst was already reported
let recentWrites: Array<{ at: number; message: string; id?: string }> = [];
let burstReported = false;

// Inline styles instead of a utility class, so the regions work without the app's CSS. Set through the CSSOM
// (element.style), which a Content Security Policy without 'unsafe-inline' still allows
const visuallyHidden: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: "0"
};

const findWrapper = (container: Element) =>
  Array.from(container.children).find((child) => child.hasAttribute(ANNOUNCER_ATTRIBUTE)) as HTMLElement | undefined;

const createRegion = (politeness: Politeness) => {
  const region = document.createElement("div");
  region.setAttribute("role", "log");
  region.setAttribute("aria-live", politeness);
  region.setAttribute("aria-relevant", "additions");
  return region;
};

const getOrCreateWrapper = (container: Element) => {
  const existing = findWrapper(container);
  if (existing) {
    return existing;
  }

  const wrapper = document.createElement("div");
  wrapper.setAttribute(ANNOUNCER_ATTRIBUTE, "");
  Object.assign(wrapper.style, visuallyHidden);
  wrapper.append(createRegion("polite"), createRegion("assertive"));
  createdAt.set(wrapper, Date.now());

  // ADAPT: in a dialog the wrapper becomes a sibling of the dialog's content, so it counts for :first-child,
  // :last-child and sibling selectors (it takes no space: it is absolutely positioned). Prepending suits styles that
  // skip the last child (Tailwind v4 space-* and divide-*), appending suits styles that skip the first child
  // (Tailwind v3 space-*, * + * selectors). Check the dialogs' styles
  if (container === document.body) {
    container.append(wrapper);
  } else {
    container.prepend(wrapper);
  }

  return wrapper;
};

const isRendered = (element: Element) =>
  !element.closest("[hidden], dialog:not([open])") &&
  (typeof element.checkVisibility === "function" ? element.checkVisibility() : true);

// A dialog opened with showModal(), or a visible element that matches MODAL_SELECTOR
const isOpenModal = (element: Element) => {
  if (element instanceof HTMLDialogElement) {
    if (!element.open) {
      return false;
    }

    // :modal tells showModal() from show(). Without support (jsdom), an open dialog counts as modal: a region inside
    // an open dialog can always be heard, so that's the safe side
    try {
      return element.matches(":modal");
    } catch {
      return true;
    }
  }

  return element.matches(MODAL_SELECTOR) && isRendered(element);
};

// The last open modal in document order. Nested modals are usually rendered after the one they were opened from
const getTopmostModal = () =>
  Array.from(document.querySelectorAll(`dialog[open], ${MODAL_SELECTOR}`)).filter(isOpenModal).at(-1) ?? null;

// The open dialog around the element, modal or not
const getOwnDialog = (element: Element) => {
  const dialog = element.closest(`dialog, ${MODAL_SELECTOR}`);
  if (dialog instanceof HTMLDialogElement) {
    return dialog.open ? dialog : null;
  }
  return dialog && isOpenModal(dialog) ? dialog : null;
};

// Where a message can be heard right now
const getContainer = (from?: Element | null): Element => {
  const topmost = getTopmostModal();
  const own = from?.isConnected ? getOwnDialog(from) : null;

  // The element's own dialog, unless another modal is open on top of it: that one makes the rest of the page inert
  if (own && (!topmost || topmost === own || topmost.contains(own))) {
    return own;
  }

  return topmost ?? document.body;
};

// The only place that puts messages on the page, so it can switch to `ariaNotify()` once screen readers support it well
const write = (wrapper: Element, { message, politeness, id, timeout }: QueuedMessage) => {
  const region = Array.from(wrapper.children).find((child) => child.getAttribute("aria-live") === politeness);
  if (!region) {
    return;
  }

  const node = document.createElement("div");
  node.textContent = message;
  region.append(node);

  if (id !== undefined) {
    // An older message from the same source is out of date. Removals aren't announced (aria-relevant="additions")
    writtenById.get(id)?.remove();
    writtenById.set(id, node);
  }

  setTimeout(() => {
    node.remove();
    if (id !== undefined && writtenById.get(id) === node) {
      writtenById.delete(id);
    }
  }, timeout);
};

// Warns once per burst instead of capping the queue: a cap would have to drop messages it can't rank (an error is no
// more important to it than "Saved"), and the fix belongs in the source that sends them
const reportBurst = ({ message, id }: QueuedMessage, now: number) => {
  recentWrites = recentWrites.filter((write) => now - write.at <= BURST_WINDOW);
  if (recentWrites.length === 0) {
    burstReported = false;
  }
  recentWrites.push({ at: now, message, id });

  if (recentWrites.length >= BURST_SIZE && !burstReported) {
    burstReported = true;
    const list = recentWrites.map((write) => `"${write.message}"${write.id === undefined ? "" : ` (id ${write.id})`}`);
    console.warn(
      `announcer: ${recentWrites.length} messages within ${BURST_WINDOW} ms, and screen readers read every one. ` +
        `Merge them into one message, or give a source that repeats an id, and a delay for a quick series: ${list.join(", ")}`
    );
  }
};

// Sets the timer for the next message that can be written: when its wait is over, and 250 ms after the last message
const schedule = () => {
  clearTimeout(timer);
  timer = undefined;

  if (queue.length === 0) {
    return;
  }

  const earliest = Math.min(...queue.map((item) => item.notBefore));
  const at = Math.max(earliest, lastWrite + MESSAGE_INTERVAL);
  timer = setTimeout(flush, Math.max(at - Date.now(), 0));
};

// Writes the next message whose wait is over (assertive first), one at a time
const flush = () => {
  timer = undefined;

  const now = Date.now();
  const ready = queue.filter((item) => item.notBefore <= now);
  const next = ready.find((item) => item.politeness === "assertive") ?? ready[0];
  if (!next || now < lastWrite + MESSAGE_INTERVAL) {
    schedule();
    return;
  }

  // The container is picked now, not when announce() was called: a message sent while a dialog closes must not end up
  // in that dialog, which is hidden by now
  const wrapper = getOrCreateWrapper(getContainer(next.from));
  const age = now - (createdAt.get(wrapper) ?? Number.NEGATIVE_INFINITY);
  if (age < PRIMING_DELAY) {
    timer = setTimeout(flush, PRIMING_DELAY - age);
    return;
  }

  queue.splice(queue.indexOf(next), 1);
  write(wrapper, next);
  lastWrite = now;
  if (isDevelopment()) {
    reportBurst(next, now);
  }
  schedule();
};

/**
 * Creates the live regions for the given element's container (its dialog, or `document.body`) if they don't exist yet.
 * Call this ahead of the first announcement (on mount, or when a dialog opens): screen readers can miss a message in a
 * region that was only just added to the page.
 */
export const ensureLiveRegion = (element?: Element | null) => {
  if (typeof document === "undefined") {
    return null;
  }

  // Any dialog, open or not: content is often mounted while its dialog is still closed
  return getOrCreateWrapper(element?.closest(`dialog, ${MODAL_SELECTOR}`) ?? document.body);
};

/**
 * Announces a message to screen readers without moving focus (WCAG 2.2 SC 4.1.3 Status Messages).
 *
 * The message is queued and written about 100 ms later (or after `delay`), one message at a time, 250 ms apart, with
 * assertive messages first. It is added to a visually hidden live region as a new element, and removed again after
 * `timeout`.
 *
 * @example
 * announce("Profile saved");
 * announce("Connection lost. Your changes are not saved.", { politeness: "assertive" });
 */
export const announce = (message: string, options: AnnounceOptions = {}) => {
  if (typeof document === "undefined" || !message.trim()) {
    return;
  }

  const { politeness = "polite", from, id, delay = 0, timeout = DEFAULT_TIMEOUT } = options;
  const notBefore = Date.now() + Math.max(QUEUE_DELAY, delay);
  const queued: QueuedMessage = { message, politeness, from, id, timeout, notBefore };

  // A waiting message with the same id is replaced, and its wait starts again
  const waiting = id === undefined ? -1 : queue.findIndex((item) => item.id === id);
  if (waiting === -1) {
    queue.push(queued);
  } else {
    queue[waiting] = queued;
  }

  schedule();
};

/**
 * Cancels the waiting message with this `id`, for work that ends with nothing to say: the user cancels it, the request
 * is aborted, or the component that announced is removed. Work that ends with a result or an error announces that
 * with the same `id` instead, which replaces the waiting message. Messages from other sources stay queued. A message
 * that is already written stays until its timeout: the screen reader already has it, and removing it is silent.
 *
 * @example
 * announce("Loading results", { id: "search", delay: 1000 });
 * // The user cancels the search before it finishes
 * cancelAnnouncement("search");
 */
export const cancelAnnouncement = (id: string) => {
  queue = queue.filter((item) => item.id !== id);
  schedule();
};

/**
 * Cancels waiting messages and empties the live regions, for one politeness or both.
 */
export const clearAnnouncer = (politeness?: Politeness) => {
  queue = politeness ? queue.filter((item) => item.politeness !== politeness) : [];

  if (!politeness) {
    lastWrite = Number.NEGATIVE_INFINITY;
    writtenById.clear();
    recentWrites = [];
    burstReported = false;
  }

  schedule();

  if (typeof document === "undefined") {
    return;
  }

  const regions = document.querySelectorAll(
    `[${ANNOUNCER_ATTRIBUTE}] > [aria-live${politeness ? `="${politeness}"` : ""}]`
  );
  for (const region of regions) {
    region.replaceChildren();
  }
};
