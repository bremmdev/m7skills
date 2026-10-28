// Live region recorder. Logs every change the browser reports to screen readers from a live region, every
// ariaNotify() call and every focus change, with the time and whether a screen reader can hear it.
//
// record-announcements.mjs installs it before the page's own scripts. In any other browser tool, run this file's
// contents in the page (ideally before the page's scripts, so it sees regions being created), then read
// window.__liveRegionLog, or call liveRegionLog() for one line per entry.
//
// It shows what the page hands to the screen reader, not what the screen reader says: speech, its queue and its
// interruptions are up to the screen reader. Entries:
//   { t, type: "live", politeness, text, region, container, silent, newRegion }
//   { t, type: "removal", ... } only for regions with aria-relevant removals or all
//   { t, type: "ariaNotify", text, priority, silent }
//   { t, type: "focus", text, name, description }
//   { t, type: "input", text } a key press, pointer press or value change; not in liveRegionLog()
(() => {
  if (window.__liveRegionLog) return;
  const start = performance.now();
  const log = [];
  window.__liveRegionLog = log;
  const now = () => Math.round(performance.now() - start);
  const clean = (text) => (text || "").replace(/\s+/g, " ").trim();

  const IMPLICIT = { status: ["polite", true], alert: ["assertive", true], log: ["polite", false] };

  // The closest element that makes `node` live, with its settings, or null
  function regionOf(node) {
    for (let el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) {
      const live = el.getAttribute("aria-live");
      const role = (el.getAttribute("role") || "").split(" ")[0];
      const implicit = IMPLICIT[role] || (el.tagName === "OUTPUT" ? ["polite", true] : null);
      if (live || implicit) {
        const politeness = live || implicit[0];
        if (politeness === "off") return null;
        const atomicAttr = el.getAttribute("aria-atomic");
        return {
          el,
          politeness,
          atomic: atomicAttr ? atomicAttr === "true" : Boolean(implicit && implicit[1]),
          relevant: (el.getAttribute("aria-relevant") || "additions text").split(/\s+/)
        };
      }
    }
    return null;
  }

  function isModal(el) {
    if (el.tagName === "DIALOG") {
      try {
        return el.open && el.matches(":modal");
      } catch {
        return false;
      }
    }
    return el.getAttribute("aria-modal") === "true" && (!el.checkVisibility || el.checkVisibility());
  }

  // The modal a screen reader is confined to: the last modal <dialog>, else the last visible aria-modal element
  function topmostModal() {
    const dialogs = Array.from(document.querySelectorAll("dialog[open]")).filter(isModal);
    if (dialogs.length) return dialogs[dialogs.length - 1];
    const ariaModals = Array.from(document.querySelectorAll("[aria-modal='true']")).filter(isModal);
    return ariaModals[ariaModals.length - 1] || null;
  }

  // Why a screen reader can't hear this element right now, or null
  function silentReason(el) {
    if (!el.isConnected) return "not on the page";
    for (let a = el; a; a = a.parentElement) {
      if (a.getAttribute("aria-hidden") === "true") return "inside aria-hidden";
      if (a.hasAttribute("hidden")) return "inside hidden";
      // A modal dialog escapes the inertness of its ancestors
      if (a.tagName === "DIALOG" && isModal(a)) break;
      if (a.hasAttribute("inert")) return "inside inert";
    }
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return "display: none or visibility: hidden";
    const modal = topmostModal();
    if (modal && !modal.contains(el)) return "outside the open modal";
    return null;
  }

  function describe(el) {
    const attrs = ["role", "aria-live", "aria-atomic", "aria-relevant"]
      .filter((name) => el.hasAttribute(name))
      .map((name) => `[${name}=${el.getAttribute(name)}]`)
      .join("");
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${attrs}`;
  }

  function containerOf(el) {
    const dialog = el.closest("dialog, [aria-modal='true'], [role=dialog], [role=alertdialog]");
    if (!dialog) return "page";
    const name = dialog.getAttribute("aria-label") || dialog.id || dialog.tagName.toLowerCase();
    return `dialog "${clean(name).slice(0, 40)}"`;
  }

  const observer = new MutationObserver((records) => {
    const t = now();
    const addedElements = [];
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) addedElements.push(node);
    const isNew = (region) => addedElements.some((node) => node === region || node.contains(region));

    // Group the changes per region: one batch of changes is one report to the screen reader
    const byRegion = new Map();
    for (const record of records) {
      const target = record.type === "characterData" ? record.target.parentElement : record.target;
      if (!target) continue;
      const found = regionOf(target);
      if (!found) {
        // Nodes that are regions themselves, or contain one, added together with their content
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          const inner = [node, ...node.querySelectorAll("[aria-live],[role=status],[role=alert],[role=log],output")];
          for (const el of inner) {
            const region = regionOf(el);
            if (region && region.el === el && clean(el.textContent)) {
              const entry = byRegion.get(el) || { region, added: [], removed: [], changedText: [] };
              entry.added.push(el.textContent);
              byRegion.set(el, entry);
            }
          }
        }
        continue;
      }
      const entry = byRegion.get(found.el) || { region: found, added: [], removed: [], changedText: [] };
      if (record.type === "characterData") entry.changedText.push(record.target.data);
      for (const node of record.addedNodes) entry.added.push(node.textContent);
      for (const node of record.removedNodes) entry.removed.push(node.textContent);
      byRegion.set(found.el, entry);
    }

    for (const [el, { region, added, removed, changedText }] of byRegion) {
      const relevant = (kind) => region.relevant.includes(kind) || region.relevant.includes("all");
      const parts = [...(relevant("additions") ? added : []), ...(relevant("text") ? changedText : [])];
      const base = {
        t,
        politeness: region.politeness,
        region: describe(el),
        container: containerOf(el),
        silent: silentReason(el),
        newRegion: isNew(el)
      };
      if (parts.some((part) => clean(part))) {
        // Atomic regions are read whole; others only the part that changed
        const spoken = region.atomic ? clean(el.textContent) : clean(parts.join(" "));
        if (spoken) log.push({ ...base, type: "live", text: spoken });
      }
      if (relevant("removals") && removed.some((s) => clean(s))) {
        log.push({ ...base, type: "removal", text: clean(removed.join(" ")) });
      }
    }
  });
  observer.observe(document, { subtree: true, childList: true, characterData: true });

  // innerText keeps the breaks between blocks ("Errors. Name is required"), which textContent runs together
  const textOf = (el) => clean(el.innerText || el.textContent);
  const byIds = (el, attribute) =>
    clean(
      (el.getAttribute(attribute) || "")
        .split(/\s+/)
        .map((id) => id && document.getElementById(id))
        .filter(Boolean)
        .map(textOf)
        .join(" ")
    );

  // Close to the accessible name screen readers read on focus: aria-labelledby, aria-label, a <label>, alt, the
  // element's text, title, placeholder
  function nameOf(el) {
    const labels = el.labels ? Array.from(el.labels).map(textOf).join(" ") : "";
    const own = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? "" : textOf(el);
    return (
      byIds(el, "aria-labelledby") ||
      clean(el.getAttribute("aria-label")) ||
      clean(labels) ||
      clean(el.getAttribute("alt")) ||
      own ||
      clean(el.getAttribute("title")) ||
      clean(el.getAttribute("placeholder"))
    ).slice(0, 200);
  }

  // The accessible description, which screen readers read after the name: aria-describedby, aria-description, or a
  // title that isn't the name
  function descriptionOf(el, name) {
    const title = clean(el.getAttribute("title"));
    return (byIds(el, "aria-describedby") || clean(el.getAttribute("aria-description")) || (title !== name ? title : "")).slice(0, 200);
  }

  // Screen readers get the focus event a moment later, after the page has rendered: a focus move in a callback often
  // comes before the framework renders the field's error and aria-describedby. So read again after FOCUS_READ_DELAY,
  // while the element still has focus.
  const FOCUS_READ_DELAY = 50;
  const readFocus = (entry, el) => {
    entry.name = nameOf(el);
    entry.description = descriptionOf(el, entry.name);
    entry.text = `${el.tagName.toLowerCase()} "${entry.name}"`;
  };

  document.addEventListener(
    "focusin",
    (event) => {
      const el = event.target;
      if (!el.getAttribute) return;
      const entry = { t: now(), type: "focus" };
      readFocus(entry, el);
      log.push(entry);
      setTimeout(() => {
        if (document.activeElement === el) readFocus(entry, el);
      }, FOCUS_READ_DELAY);
    },
    true
  );

  // What the user did, so a message after a new action isn't taken for a repeat of what focus read before it
  for (const type of ["keydown", "pointerdown", "input"]) {
    document.addEventListener(type, (event) => log.push({ t: now(), type: "input", text: event.key || type }), true);
  }

  for (const proto of [window.Element && Element.prototype, window.Document && Document.prototype]) {
    if (!proto || typeof proto.ariaNotify !== "function") continue;
    const original = proto.ariaNotify;
    proto.ariaNotify = function (message, options) {
      const el = this.nodeType === 9 ? this.documentElement : this;
      log.push({
        t: now(),
        type: "ariaNotify",
        text: clean(message),
        priority: (options && options.priority) || "normal",
        silent: silentReason(el)
      });
      return original.call(this, message, options);
    };
  }

  window.liveRegionLog = () =>
    log.filter((e) => e.type !== "input").map((e) => {
      const where = e.container ? ` ${e.politeness} in ${e.container}` : e.priority ? ` ${e.priority}` : "";
      const flags = [e.silent && `SILENT: ${e.silent}`, e.newRegion && "NEW REGION"].filter(Boolean).join(", ");
      const text = e.type === "focus" ? `${e.text}${e.description ? ` | "${e.description}"` : ""}` : `"${e.text}"`;
      return `${String(e.t).padStart(6)} ms  ${e.type}${where}  ${text}${flags ? `  (${flags})` : ""}`;
    });
})();
