// Screen reader modes: which mode JAWS, NVDA, Narrator, Orca, VoiceOver and TalkBack use when focus lands on an
// element, and an in-page scanner that predicts it for every focusable element and widget on a page.
//
//   In a page: run this file's contents, then call screenReaderModes("#root") (no argument: the body).
//   map-modes.mjs does that for every page in its plan.
//   In Node: find-roles.mjs runs this file with node:vm and calls predictForRole() for the roles in the source.
//
// The rules follow each screen reader's default settings: NVDA's source (browseMode.py shouldPassThrough), Orca's
// source (document_presenter.py is_focus_mode_widget), Freedom Scientific's JAWS ARIA support notes, and Microsoft's
// Narrator documentation. references/mechanics.md lists the sources. `sure: false` marks a prediction no source
// documents. They are predictions: only a real screen reader proves what happens.

var SCREEN_READERS = [
  { id: "jaws", name: "JAWS", browse: "virtual cursor", focus: "forms mode", application: "virtual cursor off", keep: "keeps its mode" },
  { id: "nvda", name: "NVDA", browse: "browse mode", focus: "focus mode", application: "application (no browse mode)" },
  { id: "narrator", name: "Narrator", browse: "scan mode", focus: "scan mode off" },
  { id: "orca", name: "Orca", browse: "browse mode", focus: "focus mode", application: "focus mode (web application)" },
  { id: "voiceover", name: "VoiceOver", none: "no modes" },
  { id: "talkback", name: "TalkBack", none: "no modes" }
];

// What each role promises the keyboard user, which key the browser probe presses, and what it does to browse mode.
// `child` is the role focus usually lands on inside a container; `parent` the container an item belongs in.
var ROLE_INFO = {
  application: { kind: "application", child: "generic", keys: "any key, as the author defines" },
  document: { kind: "document", keys: "browse mode reading keys" },
  dialog: { kind: "window", child: "button", hides: "NVDA's page view shows a dialog as one object; its content is read once focus is inside" },
  alertdialog: { kind: "window", child: "button", hides: "NVDA's page view shows a dialog as one object; its content is read once focus is inside" },
  textbox: { kind: "entry", keys: "typing; arrows move the caret" },
  searchbox: { kind: "entry", keys: "typing; arrows move the caret" },
  combobox: { kind: "entry", keys: "typing or Down Arrow opens; arrows move through options; Escape closes", probe: "ArrowDown", hides: "browse mode shows a combobox's value, not its options" },
  spinbutton: { kind: "widget", keys: "Up/Down Arrow, Page Up/Down, Home/End, typing", probe: "ArrowUp" },
  slider: { kind: "widget", keys: "arrows, Page Up/Down, Home/End", probe: "ArrowRight" },
  listbox: { kind: "composite", child: "option", keys: "Up/Down Arrow, Home/End, type-ahead", probe: "ArrowDown", hides: "NVDA's browse mode shows only the selected option" },
  option: { kind: "item", parent: "listbox", keys: "Up/Down Arrow, Home/End, type-ahead", probe: "ArrowDown" },
  menu: { kind: "composite", child: "menuitem", keys: "Up/Down Arrow, Escape, Home/End, type-ahead", probe: "ArrowDown" },
  menubar: { kind: "composite", child: "menuitem", keys: "Left/Right Arrow; Down Arrow opens a submenu", probe: "ArrowRight" },
  menuitem: { kind: "item", parent: "menu", keys: "Up/Down Arrow, Escape, Home/End", probe: "ArrowDown" },
  menuitemcheckbox: { kind: "item", parent: "menu", keys: "Up/Down Arrow, Space toggles", probe: "ArrowDown" },
  menuitemradio: { kind: "item", parent: "menu", keys: "Up/Down Arrow, Space checks", probe: "ArrowDown" },
  tablist: { kind: "composite", child: "tab", keys: "Left/Right Arrow (Up/Down when vertical), Home/End", probe: "ArrowRight" },
  tab: { kind: "item", parent: "tablist", keys: "Left/Right Arrow (Up/Down when vertical), Home/End", probe: "ArrowRight" },
  tree: { kind: "composite", child: "treeitem", keys: "Up/Down Arrow, Right opens, Left closes, Home/End, type-ahead", probe: "ArrowDown", hides: "NVDA's browse mode shows only the selected item; JAWS may show one item" },
  treeitem: { kind: "item", parent: "tree", keys: "Up/Down Arrow, Right opens, Left closes", probe: "ArrowDown" },
  grid: { kind: "composite", child: "gridcell", keys: "all arrows, Home/End, Ctrl+Home/End, Page Up/Down", probe: "ArrowRight" },
  treegrid: { kind: "composite", child: "row", keys: "arrows; Right/Left open and close rows", probe: "ArrowDown" },
  row: { kind: "item", parent: "grid", keys: "arrows", probe: "ArrowDown" },
  gridcell: { kind: "item", parent: "grid", keys: "all arrows", probe: "ArrowRight" },
  rowheader: { kind: "item", parent: "grid", keys: "all arrows", probe: "ArrowRight" },
  columnheader: { kind: "item", parent: "grid", keys: "all arrows", probe: "ArrowRight" },
  radiogroup: { kind: "composite", child: "radio", keys: "arrows move and check", probe: "ArrowDown" },
  radio: { kind: "item", parent: "radiogroup", keys: "arrows move and check", probe: "ArrowDown" },
  toolbar: { kind: "composite", child: "button", keys: "Left/Right Arrow between controls; Tab leaves", probe: "ArrowRight" },
  table: { kind: "structure", child: "cell", childFocusable: false, keys: "screen reader table commands" },
  cell: { kind: "structure", parent: "table" },
  list: { kind: "structure", child: "listitem", childFocusable: false },
  listitem: { kind: "structure", parent: "list" },
  separator: { kind: "widget", focusable: false, keys: "arrows resize when focusable", probe: "ArrowRight" },
  scrollbar: { kind: "widget", keys: "arrows scroll", probe: "ArrowDown" },
  button: { kind: "control", keys: "Enter, Space" },
  link: { kind: "control", keys: "Enter" },
  checkbox: { kind: "control", keys: "Space" },
  switch: { kind: "control", keys: "Space" },
  media: { kind: "control", keys: "the player's buttons and sliders", hides: "the native timeline and volume sliders switch to focus mode when focused" }
};

// ARIA 1.2 roles and the graphics roles; doc-* (DPUB) roles are accepted too. The first valid token wins.
var VALID_ROLES = new Set(("alert alertdialog application article banner blockquote button caption cell checkbox code " +
  "columnheader combobox comment complementary contentinfo definition deletion dialog directory document emphasis " +
  "feed figure form generic grid gridcell group heading img image insertion link list listbox listitem log main mark " +
  "marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph " +
  "presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator " +
  "slider spinbutton status strong subscript suggestion superscript switch tab table tablist tabpanel term textbox " +
  "time timer toolbar tooltip tree treegrid treeitem graphics-document graphics-object graphics-symbol").split(" "));

function validRole(value) {
  for (const token of String(value || "").trim().toLowerCase().split(/\s+/)) {
    if (VALID_ROLES.has(token) || token.startsWith("doc-")) return token === "image" ? "img" : token;
  }
  return null;
}

// --- The rules -------------------------------------------------------------------------------------------------

// Facts about where focus lands:
//   role          the element's role (or the role of its aria-activedescendant target, as `activeRole`)
//   focusable     it can receive focus (Tab, click or script)
//   editable      text entry: text inputs, textarea, contenteditable, role textbox or searchbox
//   readonly      aria-readonly="true"
//   disabled, expandable (aria-expanded or <summary>), haspopup, pressed (aria-pressed)
//   ancestors     the mode-relevant roles of its ancestors, nearest first
//   parentListFocusable, layoutTable, rootApplication (role=application on <html> or <body>)

function prediction(mode, why, sure) {
  return { mode, why: why || "", sure: sure !== false };
}

function insideApplication(f) {
  if (f.role === "application") return true;
  for (const role of f.ancestors) {
    if (role === "application") return true;
    if (role === "document") return false;
  }
  return false;
}

function inside(f, roles) {
  return f.ancestors.some((role) => roles.includes(role));
}

// NVDA: browseMode.shouldPassThrough for a focus change, with "Automatic focus mode for focus changes" on (default)
var NVDA_ALWAYS = new Set(["combobox", "textbox", "searchbox", "listbox", "option", "slider", "tablist", "menubar",
  "menu", "tree", "treeitem", "spinbutton", "row", "cell", "gridcell", "rowheader", "columnheader"]);
var NVDA_ON_FOCUS = new Set(["radio", "tab", "menuitem", "menuitemradio", "menuitemcheckbox"]);
// Chromium sets the Windows read-only state on these when they aren't editable (ShouldHaveReadonlyStateByDefault);
// NVDA stays in browse mode on read-only objects except text fields, comboboxes and grid parts
var CHROMIUM_READONLY = new Set(["article", "definition", "document", "img", "list", "listitem", "progressbar",
  "term", "timer", "toolbar", "tooltip"]);
var NVDA_READONLY_ALLOWED = new Set(["textbox", "searchbox", "combobox", "row", "cell", "gridcell", "rowheader", "columnheader"]);

function nvda(f) {
  if (insideApplication(f)) {
    return prediction("application", "inside role=application NVDA has no browse mode document: every key goes to the page, and the content isn't in the page's browse mode (NVDA+Space can force browse mode in Chromium)");
  }
  if (f.editable && !f.disabled) return prediction("focus", "editable text");
  const role = f.activeRole || f.role;
  if (!f.focusable && role !== "menu") return prediction("browse", "doesn't take focus");
  if (f.readonly || CHROMIUM_READONLY.has(role)) {
    if (role === "listitem" && f.parentListFocusable) {
      return prediction("focus", "a focused list item in a focusable list (NVDA's rule for message lists)");
    }
    if (!NVDA_READONLY_ALLOWED.has(role)) return prediction("browse", f.readonly ? "aria-readonly keeps browse mode" : "read-only " + role);
  }
  if (NVDA_ALWAYS.has(role)) {
    if (role === "cell" && !inside(f, ["grid", "treegrid"])) return prediction("focus", "a focusable table cell switches, even outside a grid");
    return prediction("focus", role + " switches");
  }
  if (NVDA_ON_FOCUS.has(role)) return prediction("focus", role + " switches when it gets focus");
  if (inside(f, ["toolbar"])) return prediction("focus", "focus is inside a toolbar");
  return prediction("browse", "");
}

// JAWS: Auto Forms Mode (default), per Freedom Scientific's "JAWS ARIA Support Notes"
var JAWS_FORMS = new Set(["combobox", "textbox", "searchbox", "spinbutton", "listbox", "option", "tablist", "tab",
  "menubar", "tree", "treeitem"]);
var JAWS_NAMES = { combobox: "combo box", spinbutton: "spin control", listbox: "list control", option: "list control",
  tablist: "tab control", tab: "tab control", menubar: "menu bar", tree: "tree view", treeitem: "tree view" };

function jaws(f) {
  if (insideApplication(f)) {
    return prediction("application", "inside role=application JAWS turns the virtual cursor off while focus is there (standards-support #640 reports JAWS sometimes keeping it)");
  }
  if (f.editable && !f.disabled) {
    return prediction("focus", "edit field: Tab, click or arrowing onto it switches (Semi-Auto Forms Mode: Tab only)");
  }
  const role = f.activeRole || f.role;
  if (!f.focusable) return prediction("browse", "doesn't take focus");
  if (JAWS_FORMS.has(role)) {
    return prediction("focus", (JAWS_NAMES[role] || role) + ": switches on Tab or click; arrowing onto it keeps the virtual cursor until Enter");
  }
  if (["gridcell", "row", "rowheader", "columnheader", "cell"].includes(role) && inside(f, ["grid", "treegrid"])) {
    return prediction("focus", "grid cell: switches on Tab or click");
  }
  if (["menu", "menuitem", "menuitemcheckbox", "menuitemradio"].includes(role)) {
    const bar = inside(f, ["menubar"]);
    return prediction("focus", bar ? "menu bar: switches" : "menu: documented for menu bars; popup menus switch too in practice", bar);
  }
  if (role === "slider") return prediction("focus", "slider: not in Freedom Scientific's list, usually forms mode", false);
  if (role === "radio") return prediction("keep", "radio buttons keep the current mode: forms mode stays on if it was on, the virtual cursor stays otherwise");
  if (inside(f, ["toolbar"])) {
    return prediction("browse", "not documented for toolbars; standards-support #708 shows forms mode inside a toolbar ending on a check box", false);
  }
  if (["button", "checkbox", "switch", "link"].includes(role)) {
    if (f.pressed) return prediction("browse", "buttons leave forms mode, but aria-pressed has been reported to start it", false);
    return prediction("browse", role + "s leave forms mode");
  }
  if (role === "cell") return prediction("browse", "a focusable cell outside a grid isn't documented", false);
  if (role === "separator" || role === "scrollbar") return prediction("browse", "not documented", false);
  return prediction("browse", "");
}

// Narrator: scan mode turns off in edit fields (Microsoft); no automatic switch is documented for ARIA widgets
var COMPOSITE_PARTS = new Set(["combobox", "listbox", "option", "menu", "menubar", "menuitem", "menuitemcheckbox",
  "menuitemradio", "tablist", "tab", "tree", "treeitem", "grid", "treegrid", "gridcell", "row", "rowheader",
  "columnheader", "radiogroup", "radio", "slider", "spinbutton", "separator", "scrollbar"]);

function narrator(f) {
  if (f.editable && !f.disabled) return prediction("focus", "scan mode turns off in edit fields");
  if (insideApplication(f)) return prediction("browse", "no documented effect of role=application; scan mode stays on", false);
  const role = f.activeRole || f.role;
  if (!f.focusable) return prediction("browse", "doesn't take focus");
  if (COMPOSITE_PARTS.has(role) || inside(f, ["toolbar", "grid", "treegrid"])) {
    return prediction("browse", "no automatic switch documented for widgets: the user turns scan mode off with Narrator+Space", false);
  }
  return prediction("browse", "");
}

// Orca: is_focus_mode_widget and use_focus_mode, with "native navigation triggers focus mode" on (default)
var ORCA_ALWAYS = new Set(["combobox", "textbox", "searchbox", "listbox", "menu", "menuitem", "menuitemcheckbox",
  "menuitemradio", "tab", "progressbar", "slider", "spinbutton", "toolbar", "treeitem", "treegrid", "tree"]);

function orca(f) {
  if (insideApplication(f)) {
    if (f.rootApplication) return prediction("application", "role=application on the page itself: Orca turns on sticky focus mode for the whole page");
    return prediction("application", "entering role=application switches to focus mode, and it stays on inside");
  }
  if (f.editable && !f.disabled) return prediction("focus", "editable");
  const role = f.activeRole || f.role;
  if (!f.focusable) return prediction("browse", "doesn't take focus");
  if (f.expandable && role !== "link") return prediction("focus", "expandable and focusable (aria-expanded or <summary>)");
  if (ORCA_ALWAYS.has(role)) return prediction("focus", role + " switches");
  if (["cell", "gridcell", "table"].includes(role) && f.layoutTable) return prediction("browse", "layout table");
  if (role === "option") return prediction("focus", "listbox item");
  if (role === "button" && f.haspopup) return prediction("focus", "button with a popup");
  if (role === "separator") return prediction("focus", "focusable separator");
  if (role === "grid") return prediction("focus", "grid");
  if (inside(f, ["grid", "treegrid"])) return prediction("focus", "inside a grid");
  if (inside(f, ["menu", "menubar"])) return prediction("focus", "inside a menu");
  if (inside(f, ["toolbar"])) return prediction("focus", "inside a toolbar");
  if (inside(f, ["tree"])) return prediction("focus", "inside a tree");
  return prediction("browse", "");
}

function voiceover(f) {
  const app = insideApplication(f) ? "; role=application changes nothing" : "";
  return prediction("none", "no modes: VoiceOver commands use the VO keys (macOS) or gestures (iOS), so other keys reach the page" + app);
}

function talkback(f) {
  return prediction("none", "no modes: gestures move through everything, and keys reach the page");
}

function normalizeFacts(facts) {
  return Object.assign({ role: "generic", focusable: true, editable: false, readonly: false, disabled: false,
    expandable: false, haspopup: false, pressed: false, ancestors: [], parentListFocusable: false,
    layoutTable: false, rootApplication: false, activeRole: null }, facts);
}

function predictModes(facts) {
  const f = normalizeFacts(facts);
  return { jaws: jaws(f), nvda: nvda(f), narrator: narrator(f), orca: orca(f), voiceover: voiceover(f), talkback: talkback(f) };
}

var FOCUSABLE_KINDS = ["entry", "widget", "composite", "item", "control", "application", "window"];

// For a role found in source code, without a DOM: containers are predicted for focus on their usual child, items
// inside their usual parent, and text entry roles as editable. Widget roles are assumed to take focus, other roles
// only when `attrs.focusable` says so (a tabindex on the line). `attrs` can add facts (expandable, haspopup, pressed).
function predictForRole(role, attrs) {
  const info = ROLE_INFO[role] || {};
  const byDefault = info.focusable !== undefined ? info.focusable : FOCUSABLE_KINDS.includes(info.kind);
  const given = Object.assign({}, attrs);
  if (given.focusable === undefined) delete given.focusable;
  const facts = Object.assign({ role, focusable: byDefault, editable: role === "textbox" || role === "searchbox" }, given);
  if (info.child) {
    Object.assign(facts, { role: info.child, focusable: info.childFocusable !== false, editable: false, ancestors: [role] });
  } else if (info.parent && !(facts.ancestors && facts.ancestors.length)) {
    facts.ancestors = [info.parent];
  }
  return { focusOn: info.child ? "an item inside" : "the element", predictions: predictModes(facts) };
}

// The strongest mode JAWS or NVDA uses, which the map colors by, and whether the documented predictions of the
// Windows and Linux readers disagree (an undocumented one, such as Narrator on most widgets, doesn't count)
function summarize(predictions) {
  const rank = { browse: 0, keep: 1, focus: 2, application: 3 };
  const windows = [predictions.jaws.mode, predictions.nvda.mode];
  const strongest = windows.sort((a, b) => rank[b] - rank[a])[0];
  const modes = new Set(["jaws", "nvda", "narrator", "orca"].filter((id) => predictions[id].sure).map((id) => predictions[id].mode));
  return { map: strongest === "keep" ? "browse" : strongest, differs: modes.size > 1 };
}

function modeLabel(id, mode) {
  const reader = SCREEN_READERS.find((r) => r.id === id);
  return (reader && (reader[mode] || reader.none)) || mode;
}

// --- The in-page scanner ---------------------------------------------------------------------------------------

function screenReaderModes(rootSelector, options) {
  const opts = Object.assign({ mark: false, maxText: 60 }, options);
  const root = rootSelector ? document.querySelector(rootSelector) : document.body;
  if (!root) return { error: "Root element " + rootSelector + " not found", items: [], flags: [] };

  const TEXT_TYPES = new Set(["text", "search", "email", "tel", "url", "password", ""]);
  const DATE_TYPES = new Set(["date", "time", "datetime-local", "month", "week"]);
  const BUTTON_TYPES = new Set(["button", "submit", "reset", "image", "color", "file"]);
  const ANCESTOR_ROLES = new Set(["application", "document", "dialog", "alertdialog", "toolbar", "grid", "treegrid",
    "tree", "menu", "menubar", "listbox", "tablist", "radiogroup", "table", "list", "combobox"]);
  const CONTAINERS = new Set(["application", "dialog", "alertdialog", "toolbar", "grid", "treegrid", "tree", "menu",
    "menubar", "listbox", "tablist", "radiogroup"]);
  // Containers whose items the map draws as one box
  const AGGREGATE = new Set(["application", "toolbar", "grid", "treegrid", "tree", "menu", "menubar", "listbox", "tablist", "radiogroup"]);
  const COMPOSITE_SELECTOR = [...AGGREGATE].map((r) => "[role~=" + r + "]").join(",");
  const computedRoles = typeof root.computedRole === "string";

  // The composed tree: slotted elements belong to their slot, shadow roots to their host
  const parentOf = (el) => el.assignedSlot || el.parentElement || (el.getRootNode() instanceof ShadowRoot ? el.getRootNode().host : null);
  const composedContains = (container, el) => {
    for (let n = el; n; n = parentOf(n)) if (n === container) return true;
    return false;
  };
  const inertOrHidden = (el) => {
    for (let n = el; n; n = parentOf(n)) if (n.getAttribute("aria-hidden") === "true" || n.hasAttribute("inert")) return true;
    return false;
  };

  function implicitRole(el) {
    const tag = el.localName;
    const type = (el.getAttribute("type") || "").toLowerCase();
    switch (tag) {
      case "a":
      case "area":
        return el.hasAttribute("href") ? "link" : "generic";
      case "button":
        return "button";
      case "input":
        if (type === "hidden") return null;
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        if (type === "range") return "slider";
        if (type === "number" || DATE_TYPES.has(type)) return "spinbutton";
        if (BUTTON_TYPES.has(type)) return "button";
        if (el.hasAttribute("list")) return "combobox";
        return type === "search" ? "searchbox" : "textbox";
      case "textarea":
        return "textbox";
      case "select":
        return el.multiple || el.size > 1 ? "listbox" : "combobox";
      case "option":
        return "option";
      case "summary":
        return "button";
      case "details":
      case "fieldset":
      case "optgroup":
        return "group";
      case "dialog":
        return "dialog";
      case "table":
        return "table";
      case "tr":
        return "row";
      case "td":
        return el.closest("[role=grid],[role=treegrid]") ? "gridcell" : "cell";
      case "th":
        return el.getAttribute("scope") === "row" ? "rowheader" : "columnheader";
      case "ul":
      case "ol":
      case "menu":
        return "list";
      case "li":
        return "listitem";
      case "hr":
        return "separator";
      case "progress":
        return "progressbar";
      case "img":
        return el.getAttribute("alt") === "" ? "none" : "img";
      case "iframe":
        return "document";
      case "video":
      case "audio":
        return el.hasAttribute("controls") ? "media" : "generic";
      case "nav":
        return "navigation";
      case "main":
        return "main";
      case "form":
        return "form";
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return "heading";
      default:
        return "generic";
    }
  }

  function focusability(el) {
    if (el.matches(":disabled") || inertOrHidden(el)) return null;
    if (el.tabIndex >= 0 && (el.hasAttribute("tabindex") || el.matches("a[href],area[href],button,input:not([type=hidden]),select,textarea,summary,iframe,[contenteditable]:not([contenteditable=false]),audio[controls],video[controls]"))) return "tab";
    if (el.hasAttribute("tabindex")) return "script";
    return null;
  }

  function roleOf(el) {
    const explicit = validRole(el.getAttribute("role"));
    // A focusable element ignores role=none/presentation
    if (explicit && !((explicit === "none" || explicit === "presentation") && focusability(el))) return explicit;
    return implicitRole(el);
  }

  function editableOf(el, role) {
    if (el.localName === "input") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      return TEXT_TYPES.has(type) || type === "number" || DATE_TYPES.has(type) || !el.hasAttribute("type");
    }
    if (el.localName === "textarea") return true;
    const parent = parentOf(el);
    if (el.isContentEditable && !(parent && parent.isContentEditable)) return true;
    return (role === "textbox" || role === "searchbox") && el.isContentEditable;
  }

  function rendered(el) {
    if (inertOrHidden(el)) return false;
    if (typeof el.checkVisibility === "function") return el.checkVisibility({ visibilityProperty: true });
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function nameOf(el) {
    const clip = (text) => {
      const t = String(text || "").replace(/\s+/g, " ").trim();
      return t.length > opts.maxText ? t.slice(0, opts.maxText - 1) + "…" : t;
    };
    const rootNode = el.getRootNode();
    const byId = (id) => (rootNode.getElementById ? rootNode.getElementById(id) : null) || document.getElementById(id);
    const labelledby = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).map(byId).filter(Boolean);
    if (labelledby.length) return clip(labelledby.map((n) => n.textContent).join(" "));
    if (el.getAttribute("aria-label")) return clip(el.getAttribute("aria-label"));
    if (el.labels && el.labels.length) return clip([...el.labels].map((l) => l.textContent).join(" "));
    if (el.getAttribute("alt")) return clip(el.getAttribute("alt"));
    if (el.localName === "input" || el.localName === "textarea") return clip(el.getAttribute("placeholder") || el.getAttribute("title"));
    if (el.localName === "select") return clip(el.getAttribute("title"));
    // Inside a shadow root, text often comes from the host through a slot
    const host = rootNode instanceof ShadowRoot ? rootNode.host : null;
    return clip(el.innerText || el.textContent || el.getAttribute("title") || (host && (host.getAttribute("aria-label") || host.innerText)));
  }

  function describe(el) {
    const part = (n) => {
      let s = n.localName;
      if (n.id) return s + "#" + CSS.escape(n.id);
      const cls = (n.getAttribute("class") || "").trim().split(/\s+/).filter((c) => c && !/[:[\]/]/.test(c)).slice(0, 2);
      if (cls.length) s += "." + cls.map((c) => CSS.escape(c)).join(".");
      if (n.getAttribute("role")) s += "[role=" + n.getAttribute("role").split(/\s+/)[0] + "]";
      return s;
    };
    const parts = [];
    for (let n = el; n && n !== document.documentElement && parts.length < 3; n = parentOf(n)) {
      parts.unshift(part(n));
      if (n.id) break;
    }
    return parts.join(" > ");
  }

  function walk(node, out) {
    for (const child of node.children) {
      out.push(child);
      if (child.shadowRoot) walk(child.shadowRoot, out);
      walk(child, out);
    }
    return out;
  }

  const elements = [root, ...(root.shadowRoot ? walk(root.shadowRoot, []) : []), ...walk(root, [])];
  const htmlRole = validRole(document.documentElement.getAttribute("role"));
  const bodyRole = validRole(document.body.getAttribute("role"));
  const rootApplication = htmlRole === "application" || bodyRole === "application";
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const items = [];
  const byElement = new Map();
  const elementOf = new Map();
  const flags = [];

  for (const el of elements) {
    if (!(el instanceof HTMLElement || el instanceof SVGElement) || !rendered(el)) continue;
    const role = roleOf(el);
    if (!role) continue;
    const focus = focusability(el);
    const editable = editableOf(el, role);
    const isContainer = CONTAINERS.has(role);
    // Script-only focus targets with plain roles (a heading focused after navigation) don't change modes: skip them.
    // Script-only items with widget roles are the roving items of a composite.
    if (!isContainer && !editable && focus !== "tab" && !(focus === "script" && ROLE_INFO[role])) continue;

    const ancestors = [];
    let layoutTable = false;
    let parentListFocusable = false;
    let container = null;
    for (let n = parentOf(el); n && n !== document.documentElement; n = parentOf(n)) {
      const r = roleOf(n);
      if (r && ANCESTOR_ROLES.has(r)) ancestors.push(r);
      if (!container && byElement.has(n) && AGGREGATE.has(byElement.get(n).role)) container = byElement.get(n);
      if (r === "table" && n.localName === "table" && !n.querySelector("th, caption, [role=columnheader], [role=rowheader]")) layoutTable = true;
      if (n === parentOf(el) && r === "list" && focusability(n)) parentListFocusable = true;
    }
    if (bodyRole === "application" && !ancestors.includes("application")) ancestors.push("application");
    if (htmlRole === "application" && !ancestors.includes("application")) ancestors.push("application");

    const activeId = el.getAttribute("aria-activedescendant");
    const rootNode = el.getRootNode();
    const active = activeId ? (rootNode.getElementById ? rootNode.getElementById(activeId) : null) || document.getElementById(activeId) : null;
    const facts = {
      role,
      focusable: !!focus,
      editable,
      readonly: el.getAttribute("aria-readonly") === "true",
      disabled: el.matches(":disabled") || el.getAttribute("aria-disabled") === "true",
      expandable: el.hasAttribute("aria-expanded") || el.localName === "summary",
      haspopup: !!el.getAttribute("aria-haspopup") && el.getAttribute("aria-haspopup") !== "false",
      pressed: el.hasAttribute("aria-pressed"),
      ancestors,
      parentListFocusable,
      layoutTable,
      rootApplication,
      activeRole: active ? roleOf(active) : null
    };
    const box = el.getBoundingClientRect();
    const item = {
      id: items.length + 1,
      kind: isContainer ? "container" : "control",
      parent: container ? container.id : null,
      tag: el.localName,
      role,
      name: nameOf(el),
      selector: describe(el),
      focus,
      editable,
      ancestors,
      rect: box.width && box.height ? { x: Math.round(box.x + scrollX), y: Math.round(box.y + scrollY), width: Math.round(box.width), height: Math.round(box.height) } : null,
      keys: (ROLE_INFO[facts.activeRole || role] || {}).keys || "",
      probe: (ROLE_INFO[facts.activeRole || role] || {}).probe || null,
      flags: []
    };
    if (computedRoles && el.computedRole && el.computedRole !== role && !["generic", "none", ""].includes(el.computedRole)) item.computedRole = el.computedRole;
    if (activeId && !active) item.flags.push("aria-activedescendant points to a missing id: screen readers hear nothing when arrows move");
    if (el.getAttribute("role") && !validRole(el.getAttribute("role"))) item.flags.push("role=\"" + el.getAttribute("role") + "\" is not a valid role and is ignored");
    item.facts = facts;
    item.predictions = predictModes(facts);
    Object.assign(item, summarize(item.predictions));
    if (opts.mark) el.setAttribute("data-srm", String(item.id));
    items.push(item);
    byElement.set(el, item);
    elementOf.set(item, el);
  }

  // Containers: predicted for focus on their items. A container nothing inside can focus is predicted for itself.
  for (const item of items.filter((i) => i.kind === "container")) {
    const box = elementOf.get(item);
    const inner = items.filter((i) => i !== item && i.focus && composedContains(box, elementOf.get(i)));
    const roles = {};
    for (const i of inner) roles[i.role] = (roles[i.role] || 0) + 1;
    item.children = inner.length;
    item.childRoles = roles;
    const first = inner.find((i) => i.focus === "tab") || inner[0];
    if (first) {
      item.focusItem = first.id;
      item.probe = item.probe || first.probe;
      item.predictions = first.predictions;
      Object.assign(item, summarize(item.predictions));
      const maps = new Set(inner.map((i) => i.map));
      if (maps.size > 1) item.flags.push("items switch differently: " + [...maps].join(", ") + " (see the items in the table)");
    } else if (!item.focus) {
      item.flags.push("nothing inside takes focus: keyboard users can't reach this " + item.role);
    }
  }

  // Leads the agent checks against references/decisions.md
  for (const item of items) {
    const el = elementOf.get(item);
    const text = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (item.role === "application") {
      const viewportArea = innerWidth * innerHeight;
      const big = item.rect && item.rect.width * item.rect.height > viewportArea * 0.4;
      if (el === document.body || el === root || big || text.length > 200 || el.querySelector("h1,h2,h3,h4,h5,h6,p,table,a[href]")) {
        item.flags.push("role=application around content (" + text.length + " characters" + (el.querySelector("a[href]") ? ", links" : "") + "): NVDA's browse mode can't read it and JAWS turns the virtual cursor off in it");
      }
    }
    if (["menu", "menubar", "listbox", "tree", "tablist", "grid", "treegrid"].includes(item.role)) {
      const links = el.querySelectorAll("a[href]").length;
      if (links) item.flags.push(links + " link" + (links > 1 ? "s" : "") + " inside a " + item.role + ": navigation usually belongs in browse mode (a nav with a list of links)");
    }
    if ((item.role === "listbox" || item.role === "tree") && el.querySelectorAll("[role=option],[role=treeitem],option").length > 1) {
      item.flags.push(ROLE_INFO[item.role].hides);
    }
    if ((item.role === "grid" || item.role === "treegrid") && !el.querySelector("input,button,select,textarea,a[href],[contenteditable],[aria-haspopup],[aria-expanded]")) {
      item.flags.push("a " + item.role + " with no controls in its cells: if the data is only to read, a table keeps table reading in browse mode");
    }
    if (item.kind === "control" && item.focus === "tab" && ["generic", "group", "region", "img", "figure", "article", "listitem", "paragraph", "none"].includes(item.role) && !item.editable) {
      item.flags.push("focusable " + item.role + " with no widget role: in browse mode JAWS, NVDA and Narrator keep arrows, letters and Space to themselves, so key handlers here only see Tab and Enter");
    }
    if (item.role === "cell" && item.focus) item.flags.push("focusable table cell: NVDA switches to focus mode here, and table reading commands stop");
    if (item.role === "checkbox" && item.ancestors.includes("toolbar")) item.flags.push("check box in a toolbar: JAWS leaves forms mode here (standards-support #708)");
    if (item.facts.pressed && item.predictions.jaws.mode === "browse") item.flags.push("aria-pressed: JAWS has been reported to start forms mode on toggle buttons");
    if (item.role === "dialog" || item.role === "alertdialog") {
      const app = el.closest("[role=application]") || el.querySelector("[role=application]");
      if (app) item.flags.push("role=application in or around a dialog: the dialog loses browse mode");
    }
  }
  // A roving tabindex group (one of several alike children in the Tab order, the others focused by script) without
  // a composite role. Children that have item roles (tab, option, radio) belong to a composite, maybe in a shadow root.
  for (const el of elements) {
    if (!(el instanceof HTMLElement) || byElement.has(el) || !rendered(el)) continue;
    if (el.closest(COMPOSITE_SELECTOR)) continue;
    const kids = [...el.children].filter((c) => c.hasAttribute("tabindex"));
    const zero = kids.filter((c) => c.tabIndex === 0).length;
    const minus = kids.filter((c) => c.tabIndex < 0).length;
    const alike = kids.every((c) => c.localName === kids[0].localName && roleOf(c) === roleOf(kids[0]));
    const items = kids.some((c) => (ROLE_INFO[roleOf(c)] || {}).kind === "item");
    if (zero === 1 && minus >= 1 && alike && !items && !CONTAINERS.has(roleOf(el))) {
      flags.push(describe(el) + ": " + kids.length + " children with a roving tabindex, but its role is " + roleOf(el) + ": in browse mode the arrow keys that move between them don't reach the page");
    }
  }
  if (rootApplication) flags.push("role=application on <" + (htmlRole === "application" ? "html" : "body") + ">: the whole page is out of browse mode for NVDA and JAWS, and Orca turns on sticky focus mode");

  return {
    url: location.href,
    title: document.title,
    root: rootSelector || "body",
    computedRoles,
    viewport: { width: innerWidth, height: innerHeight },
    page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    items,
    flags
  };
}

var SCREEN_READER_MODES = { SCREEN_READERS, ROLE_INFO, VALID_ROLES, validRole, predictModes, predictForRole, summarize, modeLabel };
