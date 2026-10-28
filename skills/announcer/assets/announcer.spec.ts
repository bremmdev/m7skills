// Every describe block is a behavior the announcer must keep. Plain DOM, no framework.
// Written for Vitest; for Jest, drop the import and replace `vi` with `jest` (same calls).
// Needs a DOM test environment (jsdom or happy-dom).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANNOUNCER_ATTRIBUTE,
  BURST_WINDOW,
  DEFAULT_TIMEOUT,
  MESSAGE_INTERVAL,
  PRIMING_DELAY,
  QUEUE_DELAY,
  announce,
  cancelAnnouncement,
  clearAnnouncer,
  ensureLiveRegion
} from "./announcer";

type Politeness = "polite" | "assertive";

const getWrappers = (container: Element = document.body) =>
  Array.from(container.children).filter((child) => child.hasAttribute(ANNOUNCER_ATTRIBUTE));

const getRegion = (politeness: Politeness, container: Element = document.body) =>
  getWrappers(container)[0]?.querySelector(`:scope > [aria-live="${politeness}"]`) ?? null;

// The messages currently in a region, in order
const messages = (politeness: Politeness, container: Element = document.body) =>
  Array.from(getRegion(politeness, container)?.children ?? []).map((node) => node.textContent);

const advance = (ms: number) => vi.advanceTimersByTime(ms);

// Creates the pair ahead of time and waits until it can be used, so tests about timing don't include that wait
const prime = (element?: Element | null) => {
  ensureLiveRegion(element);
  advance(PRIMING_DELAY);
};

// Adds markup to the page and returns its first element
const mount = (markup: string) => {
  const host = document.createElement("div");
  host.setAttribute("data-test-host", "");
  host.innerHTML = markup;
  document.body.append(host);
  return host.firstElementChild as HTMLElement;
};

const byText = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((button) => button.textContent === text) as HTMLButtonElement;

// Every message that reaches a region, also ones that are replaced later: screen readers read each of them
const recordAdditions = (region: Element) => {
  const added: string[] = [];
  const collect = (records: MutationRecord[]) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        added.push(node.textContent ?? "");
      }
    }
  };
  const observer = new MutationObserver(collect);
  observer.observe(region, { childList: true });
  return () => {
    // Records not delivered yet (fake timers can hold back the observer's callback)
    collect(observer.takeRecords());
    observer.disconnect();
    return added;
  };
};

// jsdom doesn't implement showModal() or :modal. A dialog with data-modal stands in for one opened with showModal()
const originalMatches = Element.prototype.matches;

// The burst warning in development. Silenced in every test, since several tests send bursts on purpose
let warn: ReturnType<typeof vi.spyOn>;

describe("announcer", () => {
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
      if (selector === ":modal") {
        return this instanceof HTMLDialogElement && this.open && this.hasAttribute("data-modal");
      }
      return originalMatches.call(this, selector);
    });
  });

  afterEach(() => {
    // The announcer is a singleton: reset its state and remove its regions between tests
    clearAnnouncer();
    for (const element of document.querySelectorAll(`[${ANNOUNCER_ATTRIBUTE}], [data-test-host]`)) {
      element.remove();
    }
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("regions", () => {
    it("creates one polite and one assertive region that only announce additions", () => {
      ensureLiveRegion();
      const [wrapper] = getWrappers();
      const [polite, assertive] = Array.from(wrapper.children);

      expect(getWrappers()).toHaveLength(1);
      expect(polite.getAttribute("role")).toBe("log");
      expect(polite.getAttribute("aria-live")).toBe("polite");
      expect(polite.getAttribute("aria-relevant")).toBe("additions");
      expect(assertive.getAttribute("role")).toBe("log");
      expect(assertive.getAttribute("aria-live")).toBe("assertive");
      expect(assertive.getAttribute("aria-relevant")).toBe("additions");
    });

    // aria-atomic="true" (also implied by role="status" and role="alert") would read every message in the region again
    it("doesn't make the regions atomic", () => {
      ensureLiveRegion();
      for (const region of getWrappers()[0].children) {
        expect(region.hasAttribute("aria-atomic")).toBe(false);
        expect(["status", "alert"]).not.toContain(region.getAttribute("role"));
      }
    });

    // Hidden with display:none, hidden or aria-hidden, a live region is never announced
    it("is visually hidden without hiding it from screen readers", () => {
      ensureLiveRegion();
      const [wrapper] = getWrappers() as HTMLElement[];

      expect(wrapper.style.position).toBe("absolute");
      expect(wrapper.style.width).toBe("1px");
      expect(wrapper.style.height).toBe("1px");
      expect(wrapper.style.overflow).toBe("hidden");
      expect(wrapper.style.display).not.toBe("none");
      expect(wrapper.hasAttribute("hidden")).toBe(false);
      expect(wrapper.hasAttribute("aria-hidden")).toBe(false);
    });

    it("creates only one pair per container", () => {
      ensureLiveRegion();
      ensureLiveRegion(document.body);
      prime();
      announce("Saved");
      advance(QUEUE_DELAY);

      expect(document.querySelectorAll(`[${ANNOUNCER_ATTRIBUTE}]`)).toHaveLength(1);
    });

    it("adds the pair at the end of body", () => {
      mount("<p>Page content</p>");
      ensureLiveRegion();
      expect(document.body.lastElementChild?.hasAttribute(ANNOUNCER_ATTRIBUTE)).toBe(true);
    });
  });

  describe("writing messages", () => {
    it("adds a message to the polite region by default, about 100 ms after announce()", () => {
      prime();
      announce("Saved");

      advance(QUEUE_DELAY - 1);
      expect(messages("polite")).toEqual([]);

      advance(1);
      expect(messages("polite")).toEqual(["Saved"]);
      expect(messages("assertive")).toEqual([]);
    });

    it("adds an assertive message to the assertive region", () => {
      prime();
      announce("Connection lost", { politeness: "assertive" });
      advance(QUEUE_DELAY);

      expect(messages("assertive")).toEqual(["Connection lost"]);
      expect(messages("polite")).toEqual([]);
    });

    it("adds each message as a new element instead of replacing the text", () => {
      prime();
      announce("First");
      advance(QUEUE_DELAY);
      const first = getRegion("polite")?.firstElementChild;

      announce("Second");
      advance(MESSAGE_INTERVAL);

      expect(messages("polite")).toEqual(["First", "Second"]);
      expect(getRegion("polite")?.firstElementChild).toBe(first);
    });

    it("ignores empty messages", () => {
      prime();
      announce("");
      announce("   ");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL);

      expect(messages("polite")).toEqual([]);
    });

    it("removes a message after 7 seconds", () => {
      prime();
      announce("Saved");
      advance(QUEUE_DELAY);

      advance(DEFAULT_TIMEOUT - 1);
      expect(messages("polite")).toEqual(["Saved"]);

      advance(1);
      expect(messages("polite")).toEqual([]);
    });

    it("removes a message after a custom timeout", () => {
      prime();
      announce("Saved", { timeout: 1000 });
      advance(QUEUE_DELAY + 1000);

      expect(messages("polite")).toEqual([]);
    });

    it("only removes the message whose time is up", () => {
      prime();
      announce("First", { timeout: 1000 });
      announce("Second");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL);
      expect(messages("polite")).toEqual(["First", "Second"]);

      advance(1000);
      expect(messages("polite")).toEqual(["Second"]);
    });
  });

  describe("the same message twice", () => {
    it("adds both, as separate elements, so the repeat is announced again", () => {
      prime();
      announce("Saved");
      announce("Saved");

      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["Saved"]);

      advance(MESSAGE_INTERVAL);
      expect(messages("polite")).toEqual(["Saved", "Saved"]);

      const [first, second] = Array.from(getRegion("polite")?.children ?? []);
      expect(first).not.toBe(second);
    });

    it("announces a repeat that comes after the first was written", () => {
      prime();
      announce("Read only");
      advance(QUEUE_DELAY);

      advance(2000);
      announce("Read only");
      advance(QUEUE_DELAY);

      expect(messages("polite")).toEqual(["Read only", "Read only"]);
    });

    it("replaces the earlier one when both have the same id", () => {
      prime();
      announce("Read only", { id: "switch" });
      advance(QUEUE_DELAY);
      const first = getRegion("polite")?.firstElementChild;

      advance(2000);
      announce("Read only", { id: "switch" });
      advance(QUEUE_DELAY);

      // The repeat is a new element, so it is announced again, and the old one is gone from the region
      expect(messages("polite")).toEqual(["Read only"]);
      expect(getRegion("polite")?.firstElementChild).not.toBe(first);
    });
  });

  describe("a burst of messages", () => {
    it("writes the messages one at a time, 250 ms apart, in order", () => {
      prime();
      announce("One");
      announce("Two");
      announce("Three");

      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["One"]);

      advance(MESSAGE_INTERVAL - 1);
      expect(messages("polite")).toEqual(["One"]);

      advance(1);
      expect(messages("polite")).toEqual(["One", "Two"]);

      advance(MESSAGE_INTERVAL);
      expect(messages("polite")).toEqual(["One", "Two", "Three"]);
    });

    it("keeps 250 ms after the last written message for a message that comes shortly after", () => {
      prime();
      announce("One");
      advance(QUEUE_DELAY);

      advance(50);
      announce("Two");

      // QUEUE_DELAY alone would write it 150 ms after "One"; spacing keeps it at 250 ms
      advance(MESSAGE_INTERVAL - 50 - 1);
      expect(messages("polite")).toEqual(["One"]);

      advance(1);
      expect(messages("polite")).toEqual(["One", "Two"]);
    });

    it("only announces the latest of a burst with the same id", () => {
      prime();
      for (const volume of [10, 20, 30, 40, 50]) {
        announce(`Volume ${volume}%`, { id: "volume" });
      }

      advance(QUEUE_DELAY + MESSAGE_INTERVAL * 5);
      expect(messages("polite")).toEqual(["Volume 50%"]);
    });

    it("keeps the waiting message's turn when it is replaced", () => {
      prime();
      announce("A");
      announce("Position 1", { id: "list" });
      announce("B");
      announce("Position 2", { id: "list" });

      advance(QUEUE_DELAY + MESSAGE_INTERVAL * 2);
      expect(messages("polite")).toEqual(["A", "Position 2", "B"]);
    });

    it("doesn't merge messages with different ids or without an id", () => {
      prime();
      announce("A", { id: "one" });
      announce("B", { id: "two" });
      announce("C");
      announce("D");

      advance(QUEUE_DELAY + MESSAGE_INTERVAL * 3);
      expect(messages("polite")).toEqual(["A", "B", "C", "D"]);
    });
  });

  describe("a quick series from one source, waiting until it stops (delay)", () => {
    it("waits for the delay before writing", () => {
      prime();
      announce("Moved Apple to position 2 of 4", { delay: 500 });

      advance(499);
      expect(messages("polite")).toEqual([]);

      advance(1);
      expect(messages("polite")).toEqual(["Moved Apple to position 2 of 4"]);
    });

    it("only writes the last message when messages with the same id come quicker than the delay", () => {
      prime();
      const stop = recordAdditions(getRegion("polite") as Element);

      // Moves 200 ms apart: each one starts the wait again
      announce("Moved Apple to position 2 of 4", { id: "list", delay: 500 });
      advance(200);
      announce("Moved Apple to position 3 of 4", { id: "list", delay: 500 });
      advance(200);
      announce("Moved Apple to position 4 of 4", { id: "list", delay: 500 });

      advance(499);
      expect(messages("polite")).toEqual([]);
      advance(1);

      expect(stop()).toEqual(["Moved Apple to position 4 of 4"]);
    });

    it("announces each message when they come slower than the delay", () => {
      prime();
      const stop = recordAdditions(getRegion("polite") as Element);

      announce("Moved Apple to position 2 of 4", { id: "list", delay: 500 });
      advance(600);
      announce("Moved Apple to position 3 of 4", { id: "list", delay: 500 });
      advance(500);

      expect(stop()).toEqual(["Moved Apple to position 2 of 4", "Moved Apple to position 3 of 4"]);
      // The older one is removed from the region once the newer one is written
      expect(messages("polite")).toEqual(["Moved Apple to position 3 of 4"]);
    });

    it("doesn't hold up other messages while a delayed message waits", () => {
      prime();
      announce("Moved Apple to position 2 of 4", { id: "list", delay: 500 });
      announce("Saved");

      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["Saved"]);

      advance(500 - QUEUE_DELAY);
      expect(messages("polite")).toEqual(["Saved", "Moved Apple to position 2 of 4"]);
    });

    it("still keeps 250 ms after the last message", () => {
      prime();
      announce("Saved");
      announce("Moved Apple to position 2 of 4", { delay: 150 });

      // The delayed message is ready at 150 ms, but "Saved" was written at 100 ms
      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["Saved"]);

      advance(MESSAGE_INTERVAL - 1);
      expect(messages("polite")).toEqual(["Saved"]);

      advance(1);
      expect(messages("polite")).toEqual(["Saved", "Moved Apple to position 2 of 4"]);
    });
  });

  describe("a polite and an assertive message at the same moment", () => {
    it("writes the assertive message first, then the polite one", () => {
      prime();
      announce("Draft saved");
      announce("Connection lost", { politeness: "assertive" });

      advance(QUEUE_DELAY);
      expect(messages("assertive")).toEqual(["Connection lost"]);
      expect(messages("polite")).toEqual([]);

      advance(MESSAGE_INTERVAL);
      expect(messages("polite")).toEqual(["Draft saved"]);
    });

    it("lets an assertive message go ahead of polite messages that are still waiting", () => {
      prime();
      announce("One");
      announce("Two");
      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["One"]);

      announce("Error", { politeness: "assertive" });
      advance(MESSAGE_INTERVAL);
      expect(messages("assertive")).toEqual(["Error"]);
      expect(messages("polite")).toEqual(["One"]);

      advance(MESSAGE_INTERVAL);
      expect(messages("polite")).toEqual(["One", "Two"]);
    });
  });

  describe("new regions", () => {
    it("waits 150 ms before the first message in a pair that was only just created", () => {
      announce("Saved");

      // The pair is created when the message is written, at 100 ms, and used 150 ms later
      advance(QUEUE_DELAY);
      expect(getWrappers()).toHaveLength(1);
      expect(messages("polite")).toEqual([]);

      advance(PRIMING_DELAY - 1);
      expect(messages("polite")).toEqual([]);

      advance(1);
      expect(messages("polite")).toEqual(["Saved"]);
    });

    it("doesn't wait when the pair was created ahead of time", () => {
      ensureLiveRegion();
      advance(500);

      announce("Saved");
      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["Saved"]);
    });

    // A pair rendered in the server's HTML, or created by another copy of the announcer on the same page
    it("uses a pair it didn't create without waiting", () => {
      const wrapper = document.createElement("div");
      wrapper.setAttribute(ANNOUNCER_ATTRIBUTE, "");
      wrapper.innerHTML = `<div role="log" aria-live="polite"></div><div role="log" aria-live="assertive"></div>`;
      document.body.append(wrapper);

      announce("Saved");
      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["Saved"]);
    });
  });

  describe("dialogs", () => {
    it("puts the pair inside the dialog of the element, as its first child", () => {
      const dialog = mount(`<dialog open><button type="button">Save</button><p id="last">Last</p></dialog>`);
      prime(byText("Save"));

      expect(dialog.firstElementChild?.hasAttribute(ANNOUNCER_ATTRIBUTE)).toBe(true);
      // As the last child it would change the dialog's :last-child (Tailwind v4 space-y and divide-y)
      expect(dialog.lastElementChild?.id).toBe("last");
    });

    it("creates the pair inside a dialog that is still closed", () => {
      const dialog = mount(`<dialog><button type="button">Save</button></dialog>`);
      ensureLiveRegion(byText("Save"));

      expect(getWrappers(dialog)).toHaveLength(1);
      expect(getWrappers()).toHaveLength(0);
    });

    it("announces inside an open non-modal dialog around the element", () => {
      const dialog = mount(`<dialog open><button type="button">Save</button></dialog>`);
      prime(byText("Save"));

      announce("Saved", { from: byText("Save") });
      advance(QUEUE_DELAY);
      expect(messages("polite", dialog)).toEqual(["Saved"]);
    });

    it("announces inside an aria-modal container around the element", () => {
      const modal = mount(
        `<div role="dialog" aria-modal="true" aria-label="Settings"><button type="button">Save</button></div>`
      );
      prime(byText("Save"));

      announce("Saved", { from: byText("Save") });
      advance(QUEUE_DELAY);
      expect(messages("polite", modal)).toEqual(["Saved"]);
      expect(getWrappers()).toHaveLength(0);
    });

    it("announces on the page when only a non-modal dialog is open", () => {
      const host = mount(`<div><button type="button">Outside</button><dialog open>Not modal</dialog></div>`);
      prime();

      announce("Saved", { from: byText("Outside") });
      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["Saved"]);
      expect(getWrappers(host.querySelector("dialog") as Element)).toHaveLength(0);
    });

    it("announces on the page when an aria-modal element is hidden", () => {
      mount(`<div role="dialog" aria-modal="true" aria-label="Settings" hidden>Closed</div>`);
      prime();

      announce("Saved");
      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["Saved"]);
    });

    it("announces on the page when the element is no longer on the page", () => {
      const dialog = mount(`<dialog open><button type="button">Save</button></dialog>`);
      const button = byText("Save");
      prime();

      announce("Saved", { from: button });
      dialog.remove();
      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["Saved"]);
    });

    it("announces in the topmost modal when modals are nested", () => {
      const host = mount(
        `<div>
          <dialog open data-modal id="first"><button type="button">In the first modal</button></dialog>
          <dialog open data-modal id="second"><button type="button">In the second modal</button></dialog>
        </div>`
      );
      const second = host.querySelector("#second") as Element;
      prime(second);

      // The first modal is inert behind the second one, so its own regions can't be heard
      announce("From the first", { from: byText("In the first modal") });
      announce("From the second", { from: byText("In the second modal") });
      advance(QUEUE_DELAY + MESSAGE_INTERVAL);

      expect(messages("polite", second)).toEqual(["From the first", "From the second"]);
      expect(getWrappers(host.querySelector("#first") as Element)).toHaveLength(0);
    });
  });

  describe("a message from inside an open modal", () => {
    it("announces inside the modal dialog, not on the inert page", () => {
      const modal = mount(`<dialog open data-modal><button type="button">Save</button></dialog>`);
      prime(modal);

      announce("Settings saved", { from: byText("Save") });
      advance(QUEUE_DELAY);

      expect(messages("polite", modal)).toEqual(["Settings saved"]);
      expect(getWrappers()).toHaveLength(0);
    });
  });

  describe("a message from outside while a modal is open", () => {
    const mountPageWithOpenModal = () => {
      const host = mount(
        `<div><button type="button">On the page</button><dialog open data-modal>Modal content</dialog></div>`
      );
      return host.querySelector("dialog") as Element;
    };

    it("announces inside the open modal, because the page is inert", () => {
      const modal = mountPageWithOpenModal();
      prime(modal);

      announce("Upload finished", { from: byText("On the page") });
      advance(QUEUE_DELAY);

      expect(messages("polite", modal)).toEqual(["Upload finished"]);
      expect(getWrappers()).toHaveLength(0);
    });

    it("announces inside the open modal when no element is given", () => {
      const modal = mountPageWithOpenModal();
      prime(modal);

      announce("Upload finished");
      advance(QUEUE_DELAY);

      expect(messages("polite", modal)).toEqual(["Upload finished"]);
    });
  });

  describe("a message sent while a modal closes", () => {
    it("announces on the page, because the container is picked when the message is written", () => {
      const modal = mount(`<dialog open data-modal><button type="button">Save and close</button></dialog>`);
      prime(modal);
      prime();

      announce("Settings saved", { from: byText("Save and close") });
      // The modal closes in the same click handler
      modal.removeAttribute("open");
      advance(QUEUE_DELAY);

      expect(messages("polite")).toEqual(["Settings saved"]);
      expect(messages("polite", modal)).toEqual([]);
    });

    it("announces on the page when the modal closes before a waiting message is written", () => {
      const modal = mount(`<dialog open data-modal><button type="button">Save</button></dialog>`);
      prime(modal);
      prime();

      announce("First", { from: byText("Save") });
      announce("Second", { from: byText("Save") });
      advance(QUEUE_DELAY);
      expect(messages("polite", modal)).toEqual(["First"]);

      modal.removeAttribute("open");
      advance(MESSAGE_INTERVAL);
      expect(messages("polite")).toEqual(["Second"]);
    });
  });

  describe("a message right after focus moves", () => {
    it("doesn't move focus, and writes the message after focus has moved", () => {
      const host = mount(`<div><button type="button">Next</button><h2 tabindex="-1">Step 2 of 3</h2></div>`);
      prime();
      const heading = host.querySelector("h2") as HTMLElement;

      // As in a click handler: move focus, then announce
      heading.focus();
      announce("Step 2 of 3: shipping address");
      expect(messages("polite")).toEqual([]);

      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["Step 2 of 3: shipping address"]);
      expect(document.activeElement).toBe(heading);
    });
  });

  describe("cancelAnnouncement", () => {
    it("drops the waiting message with the id, and other messages are still written", () => {
      prime();
      const stop = recordAdditions(getRegion("polite") as Element);
      announce("Loading results", { id: "search" });
      announce("Map updated", { id: "map" });
      announce("Saved");

      cancelAnnouncement("search");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL * 3);

      expect(stop()).toEqual(["Map updated", "Saved"]);
    });

    // A delayed loading message that is no longer true: the user cancelled the search
    it("drops a delayed message before its wait is over", () => {
      prime();
      const stop = recordAdditions(getRegion("polite") as Element);
      announce("Loading results", { id: "search", delay: 1000 });
      advance(400);

      cancelAnnouncement("search");
      advance(2000);

      expect(stop()).toEqual([]);
    });

    it("keeps the other messages on time", () => {
      prime();
      announce("Loading results", { id: "search" });
      announce("Saved");

      cancelAnnouncement("search");
      advance(QUEUE_DELAY);

      expect(messages("polite")).toEqual(["Saved"]);
    });

    it("drops an assertive message too", () => {
      prime();
      announce("Connection lost", { politeness: "assertive", id: "connection" });

      cancelAnnouncement("connection");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL);

      expect(messages("assertive")).toEqual([]);
    });

    // Removing it would be silent (aria-relevant="additions"): the screen reader already has it
    it("leaves a message that is already written until its timeout", () => {
      prime();
      announce("Loading results", { id: "search" });
      advance(QUEUE_DELAY);

      cancelAnnouncement("search");
      expect(messages("polite")).toEqual(["Loading results"]);

      advance(DEFAULT_TIMEOUT);
      expect(messages("polite")).toEqual([]);
    });

    it("lets the id announce again afterwards, replacing its written message", () => {
      prime();
      announce("Loading results", { id: "search" });
      advance(QUEUE_DELAY);
      announce("Still loading", { id: "search" });
      cancelAnnouncement("search");
      advance(MESSAGE_INTERVAL);
      expect(messages("polite")).toEqual(["Loading results"]);

      announce("18 results", { id: "search" });
      advance(QUEUE_DELAY);
      expect(messages("polite")).toEqual(["18 results"]);
    });

    it("drops a message that waits for a new pair of regions", () => {
      announce("Loading results", { id: "search" });
      // Written at 100 ms into a pair created then, which waits 150 ms
      advance(QUEUE_DELAY);
      expect(getWrappers()).toHaveLength(1);

      cancelAnnouncement("search");
      advance(PRIMING_DELAY + MESSAGE_INTERVAL);

      expect(messages("polite")).toEqual([]);
    });

    it("does nothing for an id without a waiting message", () => {
      prime();
      announce("Saved");

      cancelAnnouncement("search");
      advance(QUEUE_DELAY);

      expect(messages("polite")).toEqual(["Saved"]);
    });
  });

  // A warning instead of a maximum number of messages: a cap would have to drop messages it can't rank
  describe("a burst in development", () => {
    it("warns when three messages are written within a second, naming them", () => {
      prime();
      announce("One");
      announce("Two", { id: "list" });
      announce("Three");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL * 2);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(`"One", "Two" (id list), "Three"`);
    });

    it("doesn't warn for two messages, or for three spread over more than a second", () => {
      prime();
      announce("One");
      announce("Two");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL);
      advance(BURST_WINDOW);
      announce("Three");
      advance(QUEUE_DELAY);

      expect(messages("polite")).toEqual(["One", "Two", "Three"]);
      expect(warn).not.toHaveBeenCalled();
    });

    it("warns once for a steady stream", () => {
      prime();
      for (let i = 1; i <= 10; i++) {
        announce(`Message ${i}`);
      }
      advance(QUEUE_DELAY + MESSAGE_INTERVAL * 10);

      expect(messages("polite")).toHaveLength(10);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("warns again for a burst after a quiet second", () => {
      prime();
      announce("One");
      announce("Two");
      announce("Three");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL * 2);
      advance(BURST_WINDOW + 1);

      announce("Four");
      announce("Five");
      announce("Six");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL * 2);

      expect(warn).toHaveBeenCalledTimes(2);
    });

    // The fix the warning points to
    it("doesn't warn for a quick series from one source with an id and a delay", () => {
      prime();
      for (let position = 2; position <= 6; position++) {
        announce(`Moved Apple to position ${position} of 6`, { id: "list", delay: 500 });
        advance(200);
      }
      advance(500);

      expect(messages("polite")).toEqual(["Moved Apple to position 6 of 6"]);
      expect(warn).not.toHaveBeenCalled();
    });

    it("doesn't count cancelled messages", () => {
      prime();
      announce("Loading", { id: "search" });
      announce("One");
      announce("Two");
      cancelAnnouncement("search");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL * 2);

      expect(warn).not.toHaveBeenCalled();
    });

    // ADAPT: stub the flag the copied file checks (Jest: set process.env.NODE_ENV and restore it afterwards)
    it("doesn't warn in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      prime();
      announce("One");
      announce("Two");
      announce("Three");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL * 2);

      expect(messages("polite")).toEqual(["One", "Two", "Three"]);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("clearAnnouncer", () => {
    it("cancels waiting messages and empties both regions", () => {
      prime();
      announce("Written");
      announce("Error", { politeness: "assertive" });
      advance(QUEUE_DELAY + MESSAGE_INTERVAL);
      announce("Waiting");

      clearAnnouncer();
      advance(QUEUE_DELAY + MESSAGE_INTERVAL);

      expect(messages("polite")).toEqual([]);
      expect(messages("assertive")).toEqual([]);
    });

    it("only clears the given politeness", () => {
      prime();
      announce("Error", { politeness: "assertive" });
      announce("Written");
      advance(QUEUE_DELAY + MESSAGE_INTERVAL);
      announce("Waiting");
      announce("Another error", { politeness: "assertive" });

      clearAnnouncer("assertive");
      expect(messages("assertive")).toEqual([]);

      advance(MESSAGE_INTERVAL * 2);
      expect(messages("polite")).toEqual(["Written", "Waiting"]);
      expect(messages("assertive")).toEqual([]);
    });
  });
});
