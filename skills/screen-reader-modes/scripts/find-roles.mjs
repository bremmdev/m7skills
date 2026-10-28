#!/usr/bin/env node
// Lists every role and every element in a codebase that decides a screen reader's mode, and predicts what JAWS,
// NVDA, Narrator, Orca, VoiceOver and TalkBack do when focus lands there: explicit roles, native controls, focusable
// elements, mode-relevant ARIA attributes, keyboard handlers, and widget libraries.
//
//   node find-roles.mjs [root] [--json]
//
// root defaults to the current folder. Files come from `git ls-files` (tracked and untracked, ignored files left out),
// or from a walk that skips dependency and build folders when root isn't a git repository. The predictions come from
// modes.js next to this file. Every hit is a lead: read the code around it, and check rendered components (library
// widgets, roles built from variables) in a browser with map-modes.mjs. references/decisions.md says what to decide.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const json = args.includes("--json");
const root = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? ".");

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "modes.js"), "utf8"), context);
const { validRole, predictForRole, summarize } = context.SCREEN_READER_MODES;

const CODE = /\.(m?[jt]sx?|cjs|cts|vue|svelte|astro|html?|hbs|handlebars|ejs|erb|php|twig|liquid|njk|cshtml|razor|jinja2?|j2|py|rb|java|kt|cs|go|elm|clj[sc]?)$/i;
const DOCS = /\.mdx?$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".nuxt", ".svelte-kit", ".output", ".turbo", ".cache", "vendor", "storybook-static", "target", "bin", "obj"]);
const MAX_BYTES = 1_000_000;
const MAX_LINE = 2000; // longer lines are minified or generated

// Explicit roles. Each pattern captures the attribute's value; the first valid token is the role.
const ROLE_PATTERNS = [
  /\brole\s*=\s*\{?\s*["'`]([^"'`{}$]+)["'`]/g, // role="x", role='x', role={"x"}
  /(?:\[attr\.role\]|:role|v-bind:role)\s*=\s*"\s*'([^']+)'\s*"/g, // Angular [attr.role]="'x'", Vue :role="'x'"
  /setAttribute\(\s*["']role["']\s*,\s*["'`]([^"'`]+)["'`]/g,
  /\brole\s*:\s*["'`]([^"'`]+)["'`]/g, // { role: "x" } in props, h(), lit, attribute maps: valid roles only
  /\.role\s*=\s*["'`]([^"'`]+)["'`]/g // element.role = "x" (ARIA reflection): valid roles only
];
// A role set from an expression: read it
const DYNAMIC_ROLE = /\brole\s*=\s*\{(?!\s*["'`][^"'`]*["'`]\s*\})|(?:\[attr\.role\]|\[role\]|:role|v-bind:role)\s*=\s*"(?!\s*')|\brole\s*=\s*"\s*\{\{|setAttribute\(\s*["']role["']\s*,\s*(?!["'`])/;

// Native elements that decide a mode, and attributes that change what a role does
// Lowercase tags only: <Input> and <Dialog> are components, found through their library or their own file
const NATIVE = [
  { kind: "input", re: /<input\b/ },
  { kind: "textarea", re: /<textarea\b/ },
  { kind: "select", re: /<select\b/ },
  { kind: "contenteditable", re: /\bcontent[eE]ditable\b(?!\s*[=:]\s*\{?\s*["'`]?false)/ },
  { kind: "summary", re: /<summary\b/ },
  { kind: "dialog", re: /<dialog\b/ },
  { kind: "media", re: /<(video|audio)\b[^>]*\bcontrols\b/ },
  { kind: "canvas", re: /<canvas\b/ },
  { kind: "focusable-cell", re: /<(td|th)\b[^>]*\btab[iI]ndex/ },
  { kind: "focusable-element", re: /<(div|span|section|article|li|p|img|svg|figure|main|ul|ol|table|tr)\b[^>]*\btab[iI]ndex\s*=\s*\{?\s*["'`]?(0|-1)\b/ }
];
const ATTRIBUTES = /aria-activedescendant|ariaActiveDescendant|aria-haspopup|ariaHasPopup|aria-expanded|ariaExpanded|aria-pressed|ariaPressed|aria-readonly|ariaReadOnly/;

// Keyboard handling: the keys browse mode keeps to itself, and helpers that implement them
const KEY_HANDLER = /onKey(Down|Up|Press)\b|@key(down|up|press)\b|v-on:key(down|up)|\(key(down|up|press)[.)]|on:key(down|up)|addEventListener\(\s*["']key(down|up|press)["']|onkey(down|up|press)\s*=|HostListener\(\s*["']keydown|\bkeydown\s*:/;
// Key names in key contexts only: an icon called ArrowRight or a link called "Home" isn't key handling
const KEY_NAMES = new RegExp([
  /["'`]Arrow(Up|Down|Left|Right)["'`]/.source,
  /\b(key|code|keyName)\s*={2,3}\s*["'`](Up|Down|Left|Right|Home|End|PageUp|PageDown)["'`]/.source,
  /\bcase\s*["'`](Up|Down|Left|Right|Home|End|PageUp|PageDown)["'`]/.source,
  /\b(Keys?|KeyCodes?|KEYS?|keys|Keyboard\w*)\.(Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown)\b/.source,
  /\b(UP|DOWN|LEFT|RIGHT)_ARROW\b|\bPAGE_(UP|DOWN)\b|\bKEY_(UP|DOWN|LEFT|RIGHT)\b/.source,
  /\b(key[Cc]ode|which)\s*={2,3}\s*(3[3-9]|40)\b/.source
].join("|"));
// Angular (keydown.arrowDown) and Vue @keydown.down key filters
const KEY_FILTERS = /\(key(down|up)\.(arrow)?(up|down|left|right|home|end|pageup|pagedown)\)|@key(down|up)\.(arrow-?)?(up|down|left|right|home|end|page-up|page-down)\b/i;
// Single-key shortcuts: letters are quick navigation keys in browse mode
const SHORTCUTS = /\b(key|code)\s*={2,3}\s*["'`][a-zA-Z0-9?/]["'`]|\b(useHotkeys|hotkeys|tinykeys|useKeyboardShortcut|registerShortcut)\s*\(|\bMousetrap\.bind\s*\(/;
const KEYS = { test: (line) => KEY_NAMES.test(line) || KEY_FILTERS.test(line) || SHORTCUTS.test(line) };
const KEY_HELPERS = /useRovingFocus|RovingFocusGroup|rovingTabindex|roving-tabindex|useFocusZone|\bFocusZone\b|useArrowNavigationGroup|useFocusableGroup|useListNavigation|useTypeahead|FocusKeyManager|ListKeyManager|ActiveDescendantKeyManager|useCompositeStore|\bCompositeItem\b|\btabster\b|useSelectableList|useSelectableCollection|useGridCell|useKeyboardDelegate|useArrowKeyNavigation|useKeyboardNavigation/;

// Dependencies whose components render widget roles. references/libraries.md says what each one renders and where
// the usual traps are; check the rendered DOM with map-modes.mjs, since versions change their markup.
const LIBRARIES = {
  "@radix-ui/react-dropdown-menu": "DropdownMenu: menu", "@radix-ui/react-context-menu": "ContextMenu: menu",
  "@radix-ui/react-menubar": "Menubar: menubar", "@radix-ui/react-navigation-menu": "NavigationMenu: links and disclosure buttons (browse mode)",
  "@radix-ui/react-tabs": "Tabs: tablist", "@radix-ui/react-toolbar": "Toolbar: toolbar", "@radix-ui/react-radio-group": "RadioGroup: radiogroup",
  "@radix-ui/react-toggle-group": "ToggleGroup: group with a roving tabindex", "@radix-ui/react-select": "Select: combobox and listbox",
  "@radix-ui/react-slider": "Slider: slider", "@radix-ui/react-accordion": "Accordion: buttons with aria-expanded",
  "radix-ui": "Radix primitives: menu, menubar, tablist, toolbar, radiogroup, listbox, slider", "reka-ui": "Radix for Vue: menu, tablist, toolbar, listbox, tree",
  "radix-vue": "Radix for Vue: menu, tablist, toolbar, listbox, tree", "bits-ui": "Svelte: menu, tablist, toolbar, listbox, radiogroup",
  "@headlessui/react": "Menu (menu), Listbox, Combobox, RadioGroup, Tab (tablist), Switch", "@headlessui/vue": "Menu (menu), Listbox, Combobox, RadioGroup, Tab (tablist), Switch",
  "react-aria-components": "Menu, ListBox, GridList (grid), Table (grid), TagGroup (grid), Tree (treegrid), Tabs, RadioGroup, Toolbar, Calendar (grid), DateField (spinbuttons)",
  "react-aria": "hooks for menu, listbox, grid (useTable, useGridList), treegrid, tablist, toolbar, radiogroup", "@adobe/react-spectrum": "react-aria widgets: TableView and ListView are grids",
  "@heroui/react": "react-aria widgets: Table is a grid", "@nextui-org/react": "react-aria widgets: Table is a grid",
  "@mui/material": "Menu (menu), Tabs (tablist), Select (combobox and listbox), Autocomplete, Rating (radios), Slider, ToggleButtonGroup",
  "@mui/x-data-grid": "DataGrid: grid", "@mui/x-data-grid-pro": "DataGrid: grid, treegrid with tree data", "@mui/x-data-grid-premium": "DataGrid: grid, treegrid with tree data",
  "@mui/x-tree-view": "SimpleTreeView, RichTreeView: tree", "@mui/x-date-pickers": "date fields; calendars are grids",
  antd: "Menu: menu, also for site navigation; Tabs (tablist), Tree (tree), Select (combobox and listbox)",
  "@angular/material": "mat-menu (menu), mat-tab-group (tablist), mat-select, mat-tree (tree), mat-chip-grid (grid), mat-chip-listbox (listbox), mat-button-toggle-group, mat-stepper",
  "@angular/cdk": "CdkMenu (menu, menubar), CdkListbox (listbox), CdkTree (tree), arrow-key managers",
  "@fluentui/react-components": "Menu, TabList, Toolbar, Tree, DataGrid (grid), Listbox, Combobox, RadioGroup", "@fluentui/react": "ContextualMenu (menu), Pivot (tablist), DetailsList (grid), FocusZone (arrow keys)",
  "@ariakit/react": "Menu, Select, Combobox, Toolbar, Tab, Radio, Composite (arrow keys, role is yours)", "@primer/react": "ActionMenu (menu), ActionList, TreeView (tree), SelectPanel (listbox)",
  "@carbon/react": "OverflowMenu (menu), Tabs and ContentSwitcher (tablist), TreeView (tree)", "carbon-components-react": "OverflowMenu (menu), Tabs (tablist), TreeView (tree)",
  primereact: "Menu, Menubar, TieredMenu, TabView (tablist), Tree, TreeTable, Listbox", primevue: "Menu, Menubar, TieredMenu, Tabs (tablist), Tree, TreeTable, Listbox",
  primeng: "Menu, Menubar, TieredMenu, Tabs (tablist), Tree, TreeTable, Listbox", vuetify: "VTabs (tablist), VList, VMenu, VTreeview, VSelect",
  "@shoelace-style/shoelace": "sl-menu (menu), sl-tree (tree), sl-tab-group (tablist), sl-select, sl-radio-group", "@awesome.me/webawesome": "wa-tree (tree), wa-tab-group (tablist), wa-select, wa-radio-group",
  "@chakra-ui/react": "Menu (menu), Tabs (tablist), RadioGroup, Slider, Select", "@mantine/core": "Menu (menu), Tabs (tablist), Combobox, Select",
  "@kobalte/core": "Solid: menu, tablist, listbox, radiogroup", "@zag-js/menu": "menu", "@zag-js/tabs": "tablist", "@zag-js/tree-view": "tree",
  "ag-grid-community": "grid or treegrid", "ag-grid-enterprise": "grid or treegrid", "ag-grid-react": "grid or treegrid", "ag-grid-angular": "grid or treegrid", "ag-grid-vue3": "grid or treegrid",
  handsontable: "spreadsheet grid", "@glideapps/glide-data-grid": "canvas grid", downshift: "combobox and listbox", "react-select": "combobox and listbox",
  "@dnd-kit/core": "draggables: role=button, Space and arrow keys (keys browse mode keeps)", "@hello-pangea/dnd": "drag handles: Space and arrow keys (keys browse mode keeps)",
  "react-beautiful-dnd": "drag handles: Space and arrow keys (keys browse mode keeps)", leaflet: "map container: focusable, arrow keys pan, no widget role",
  "maplibre-gl": "map: focusable region, arrow keys pan", "mapbox-gl": "map: focusable region, arrow keys pan", swiper: "carousel: arrow keys when its keyboard module is on",
  "@splidejs/splide": "carousel: arrow keys", "embla-carousel": "carousel: your own keys", "slick-carousel": "carousel: arrow keys", "keen-slider": "carousel: your own keys",
  bootstrap: "Dropdown (arrow keys, no menu role), Tabs (roles you add), Carousel (arrow keys on the carousel)",
  "@tiptap/core": "editor: contenteditable", "prosemirror-view": "editor: contenteditable", lexical: "editor: contenteditable", "slate-react": "editor: contenteditable",
  quill: "editor: contenteditable", tinymce: "editor: iframe with contenteditable", "@ckeditor/ckeditor5-build-classic": "editor: contenteditable", ckeditor5: "editor: contenteditable",
  "@codemirror/view": "code editor: contenteditable", "monaco-editor": "code editor: textarea", "@monaco-editor/react": "code editor: textarea", "draft-js": "editor: contenteditable"
};
const LIBRARY_IMPORT = new RegExp(`(?:from\\s*|require\\(\\s*|import\\(\\s*|import\\s+)["'](${Object.keys(LIBRARIES).map((n) => n.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})(?:/[^"']*)?["']`);

// Comment-only lines describe roles rather than set them, and so do the lines inside a block comment
const COMMENT = /^\s*(\/\/|\/\*|\*|#|<!--|\{\/\*)/;
const BLOCK_COMMENTS = [
  [/^\s*\{?\/\*/, /\*\//],
  [/^\s*<!--/, /-->/]
];

const isTest = (file) => /(\.|_)(spec|test)\.|__tests__|(^|\/)(tests?|e2e|cypress|playwright)\//i.test(file);
const isStory = (file) => /\.stories\.|\.story\./i.test(file);

function listFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    return out.toString("utf8").split("\0").filter(Boolean);
  } catch {
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(path.posix.join(dir, entry.name));
        } else if (entry.isFile()) {
          files.push(path.posix.join(dir, entry.name));
        }
      }
    };
    walk("");
    return files;
  }
}

// The role an <input>, <select> or other native element has, from what's on its line
function nativeRole(kind, line) {
  if (kind === "input") {
    const type = (line.match(/\btype\s*=\s*\{?\s*["'`]([\w-]+)["'`]/i) || [])[1]?.toLowerCase();
    if (type === "hidden") return null;
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "range") return "slider";
    if (["number", "date", "time", "datetime-local", "month", "week"].includes(type)) return "spinbutton";
    if (["button", "submit", "reset", "image", "color", "file"].includes(type)) return "button";
    if (/\blist\s*=/.test(line)) return "combobox";
    return type === "search" ? "searchbox" : "textbox";
  }
  if (kind === "textarea") return "textbox";
  if (kind === "select") return /\bmultiple\b|\bsize\s*=\s*\{?\s*["'`]?([2-9]|\d\d)/.test(line) ? "listbox" : "combobox";
  if (kind === "contenteditable") return "textbox";
  if (kind === "summary") return "button";
  if (kind === "dialog") return "dialog";
  if (kind === "media") return "media";
  if (kind === "focusable-cell") return "cell";
  return null;
}

function factsFromLine(line, role) {
  return {
    expandable: /aria-expanded|ariaExpanded|<summary\b/.test(line),
    haspopup: /aria-haspopup|ariaHasPopup/.test(line) && !/aria-haspopup\s*=\s*\{?\s*["'`]?false/.test(line),
    pressed: /aria-pressed|ariaPressed/.test(line),
    editable: role === "textbox" || role === "searchbox" || (role === "combobox" && /<input\b/i.test(line)) || role === "spinbutton",
    focusable: /tab[iI]ndex/.test(line) ? true : undefined
  };
}

const MODE_SHORT = {
  jaws: { browse: "virtual cursor", focus: "forms mode", application: "VC off", keep: "keeps mode" },
  nvda: { browse: "browse", focus: "focus", application: "application" },
  narrator: { browse: "scan", focus: "scan off" },
  orca: { browse: "browse", focus: "focus", application: "focus (app)" }
};
const shortMode = (id, p) => (MODE_SHORT[id][p.mode] ?? p.mode) + (p.sure ? "" : "?");

const files = listFiles();
const hits = [];
const docs = [];
const dependencies = [];
const roles = new Map(); // role -> { explicit, native, files, attrs }
const perFile = new Map(); // file -> { switching: Set<role>, composite: Set<role>, keys: [lines], helpers: [lines] }

for (const file of files.filter((f) => path.posix.basename(f) === "package.json" && !f.includes("node_modules/"))) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  } catch {
    continue;
  }
  const declared = { ...manifest.peerDependencies, ...manifest.devDependencies, ...manifest.dependencies };
  for (const [name, range] of Object.entries(declared)) {
    if (LIBRARIES[name]) dependencies.push({ file, name, range, renders: LIBRARIES[name] });
  }
}

const LINK_ROLES = new Set(["menuitem", "option", "treeitem", "tab", "gridcell", "row"]);
const leads = { missing: [], broken: [], links: [] };
const COMPOSITE = new Set(["menu", "menubar", "listbox", "tablist", "tree", "treegrid", "grid", "radiogroup", "toolbar", "slider", "spinbutton"]);

// The summary keeps variants apart where the facts change the prediction: a focusable cell, an expandable button
function record(role, source, file, facts) {
  const variants = [
    facts.expandable && role !== "link" && "aria-expanded",
    facts.haspopup && role === "button" && "aria-haspopup",
    facts.pressed && "aria-pressed",
    role === "cell" && facts.focusable && "focusable"
  ].filter(Boolean);
  const key = role + (variants.length ? ` (${variants.join(", ")})` : "");
  if (!roles.has(key)) roles.set(key, { role, facts, explicit: 0, native: 0, files: new Set() });
  const entry = roles.get(key);
  entry[source]++;
  entry.files.add(file);
}

for (const file of files) {
  const isCode = CODE.test(file);
  if (!isCode && !DOCS.test(file)) continue;
  if (/\.min\.|(^|\/)(package-lock|yarn|pnpm-lock)/.test(file)) continue;
  const full = path.join(root, file);
  let text;
  try {
    if (fs.statSync(full).size > MAX_BYTES) continue;
    text = fs.readFileSync(full, "utf8");
  } catch {
    continue;
  }
  if (!isCode) {
    const count = text.split(/\r?\n/).filter((line) => /\brole\s*=\s*["']|focus mode|forms mode|browse mode|virtual cursor/i.test(line)).length;
    if (count) docs.push({ file, count });
    continue;
  }

  const area = isTest(file) ? "tests" : isStory(file) ? "stories" : "source";
  const fileInfo = { switching: new Set(), composite: new Set(), keys: [], helpers: [], handlers: [] };
  let closing = null;
  text.split(/\r?\n/).forEach((line, index) => {
    if (closing) {
      if (closing.test(line)) closing = null;
      return;
    }
    const opened = BLOCK_COMMENTS.find(([open, close]) => {
      const start = line.match(open);
      return start && !close.test(line.slice(start[0].length));
    });
    if (opened) closing = opened[1];
    if (line.length > MAX_LINE || COMMENT.test(line)) return;
    const at = { file, line: index + 1, area, text: line.trim().slice(0, 160) };

    // Explicit roles: the HTML-attribute forms report invalid roles too, the object and property forms only valid ones
    const found = [];
    ROLE_PATTERNS.forEach((pattern, i) => {
      for (const match of line.matchAll(pattern)) {
        const value = match[1].trim();
        const role = validRole(value);
        if (role) found.push({ role, value });
        // Invalid values only on HTML elements (role="nav"), not on component props (<Badge role="admin">)
        else if ((i === 1 || i === 2 || /<[a-z][\w-]*\b[^<]*\brole\s*=/.test(line)) && value.trim()) found.push({ role: null, value });
      }
    });
    for (const { role, value } of found) {
      if (!role) {
        hits.push({ ...at, kind: "invalid-role", role: value });
        continue;
      }
      const facts = factsFromLine(line, role);
      const { focusOn, predictions } = predictForRole(role, facts);
      hits.push({ ...at, kind: "role", role, value, focusOn, predictions, ...summarize(predictions) });
      if (LINK_ROLES.has(role) && /<a\b[^>]*\bhref|<(Link|NavLink|RouterLink|router-link|NuxtLink)\b/.test(line) && area === "source") {
        leads.links.push({ file, line: index + 1, role });
      }
      if (area === "source") {
        record(role, "explicit", file, facts);
        if (summarize(predictions).map !== "browse") fileInfo.switching.add(role);
        if (COMPOSITE.has(role)) fileInfo.composite.add(role);
      }
    }
    if (DYNAMIC_ROLE.test(line)) hits.push({ ...at, kind: "dynamic-role" });

    for (const { kind, re } of NATIVE) {
      if (!re.test(line) || (kind === "focusable-element" && found.length)) continue;
      const role = nativeRole(kind, line);
      if (kind === "input" && role === null) continue;
      const hit = { ...at, kind, role };
      if (role) {
        const { focusOn, predictions } = predictForRole(role, factsFromLine(line, role));
        Object.assign(hit, { focusOn, predictions, ...summarize(predictions) });
        if (area === "source") {
          record(role, "native", file, factsFromLine(line, role));
          if (summarize(predictions).map !== "browse") fileInfo.switching.add(role);
        }
      }
      hits.push(hit);
    }
    if (ATTRIBUTES.test(line) && !found.length) hits.push({ ...at, kind: "attribute", role: line.match(ATTRIBUTES)[0] });
    if (LIBRARY_IMPORT.test(line)) hits.push({ ...at, kind: "library", role: line.match(LIBRARY_IMPORT)[1] });
    if (KEY_HELPERS.test(line)) {
      hits.push({ ...at, kind: "key-helper" });
      fileInfo.helpers.push(index + 1);
    }
    if (KEYS.test(line) || KEY_HANDLER.test(line)) {
      const kind = KEYS.test(line) ? "keys" : "key-handler";
      hits.push({ ...at, kind });
      if (kind === "keys") fileInfo.keys.push(index + 1);
      else fileInfo.handlers.push(index + 1);
    }
  });
  if (area === "source") perFile.set(file, fileInfo);
}

// File-level leads for the verdicts in references/decisions.md
for (const [file, info] of perFile) {
  const arrows = info.keys.length || info.helpers.length;
  if (info.keys.length && !info.switching.size && !info.helpers.length) {
    leads.missing.push({ file, lines: info.keys.slice(0, 8), note: "handles arrow, Home/End, Page or letter keys, but no role or control in this file switches modes" });
  }
  if (info.composite.size && !arrows) {
    leads.broken.push({ file, roles: [...info.composite], note: "widget role without arrow-key handling in this file: check where its keyboard is handled" });
  }
}

const summary = [...roles.entries()]
  .map(([key, entry]) => {
    const { focusOn, predictions } = predictForRole(entry.role, entry.facts);
    return { role: key, explicit: entry.explicit, native: entry.native, files: entry.files.size, focusOn, predictions, ...summarize(predictions) };
  })
  .sort((a, b) => ["application", "focus", "browse"].indexOf(a.map) - ["application", "focus", "browse"].indexOf(b.map) || Number(b.differs) - Number(a.differs) || a.role.localeCompare(b.role));

if (json) {
  console.log(JSON.stringify({ root, dependencies, roles: summary, hits, leads, docs }, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const print = (list) => {
  let current;
  for (const hit of list) {
    if (hit.file !== current) {
      current = hit.file;
      console.log(`\n  ${hit.file}`);
    }
    const tag = hit.kind === "role" ? hit.role : hit.role && hit.kind !== hit.role ? `${hit.kind} → ${hit.role}` : hit.kind;
    console.log(`    ${String(hit.line).padStart(5)}  [${tag}]  ${hit.text}`);
  }
};

console.log(`Screen reader modes inventory of ${root}`);
console.log(`\n## Dependencies that render widgets: ${dependencies.length}`);
for (const d of dependencies) console.log(`  ${d.name} ${d.range} in ${d.file}: ${d.renders}`);

console.log(`\n## Roles in the source, and the mode on focus (? = no source documents it)`);
const width = Math.max(18, ...summary.map((r) => r.role.length + 2));
console.log(`  ${pad("role", width)}${pad("role=", 7)}${pad("native", 8)}${pad("files", 7)}${pad("JAWS", 17)}${pad("NVDA", 13)}${pad("Narrator", 11)}${pad("Orca", 13)}VoiceOver, TalkBack`);
for (const r of summary) {
  const p = r.predictions;
  console.log(`  ${pad(r.role, width)}${pad(r.explicit, 7)}${pad(r.native, 8)}${pad(r.files, 7)}${pad(shortMode("jaws", p.jaws), 17)}${pad(shortMode("nvda", p.nvda), 13)}${pad(shortMode("narrator", p.narrator), 11)}${pad(shortMode("orca", p.orca), 13)}no modes${r.focusOn === "an item inside" ? "  (focus on an item inside)" : ""}`);
}

const source = hits.filter((h) => h.area === "source");
const SECTIONS = [
  ["role=application: no virtual cursor or browse mode inside", (h) => h.map === "application" || h.role === "document"],
  ["Switches to forms mode (JAWS) and focus mode (NVDA)", (h) => h.predictions && h.map === "focus" && h.predictions.jaws.mode === "focus" && h.predictions.nvda.mode === "focus"],
  ["Switches in some screen readers only", (h) => h.predictions && h.map !== "application" && h.differs && !(h.predictions.jaws.mode === "focus" && h.predictions.nvda.mode === "focus")],
  ["Stays in browse mode", (h) => h.predictions && h.map === "browse" && !h.differs],
  ["Roles set from expressions (read them; check them in the browser)", (h) => h.kind === "dynamic-role"],
  ["Invalid roles (ignored by browsers)", (h) => h.kind === "invalid-role"],
  ["Focusable elements without a role, and canvases", (h) => (h.kind === "focusable-element" || h.kind === "canvas")],
  ["Attributes that change modes: aria-activedescendant, aria-haspopup, aria-expanded, aria-pressed, aria-readonly", (h) => h.kind === "attribute"],
  ["Imports of widget libraries", (h) => h.kind === "library"],
  ["Keyboard handling: keys browse mode keeps (arrows, Home/End, Page keys, single-key shortcuts), handlers and helpers", (h) => h.kind === "keys" || h.kind === "key-helper" || h.kind === "key-handler"]
];
for (const [title, test] of SECTIONS) {
  const list = source.filter(test);
  console.log(`\n## ${title}: ${list.length} lines in ${new Set(list.map((h) => h.file)).size} files`);
  print(list);
}

console.log(`\n## Leads`);
console.log(`\n  Keys browse mode keeps are handled, but nothing in the file switches modes (Missing?): ${leads.missing.length}`);
for (const l of leads.missing) console.log(`    ${l.file} (lines ${l.lines.join(", ")})`);
console.log(`\n  Links given widget roles: navigation turned into a widget (Needless?): ${leads.links.length}`);
for (const l of leads.links) console.log(`    ${l.file}:${l.line} (${l.role})`);
console.log(`\n  Widget roles without arrow-key handling in the file (Broken?): ${leads.broken.length}`);
for (const l of leads.broken) console.log(`    ${l.file}: ${l.roles.join(", ")}`);

for (const area of ["tests", "stories"]) {
  const list = hits.filter((h) => h.area === area && (h.kind === "role" || h.kind === "dynamic-role"));
  console.log(`\n## Roles in ${area}: ${list.length} lines in ${new Set(list.map((h) => h.file)).size} files`);
}
if (docs.length) {
  console.log(`\n## Docs that mention roles or modes`);
  for (const { file, count } of docs) console.log(`  ${file} (${count})`);
}
console.log(`\nPredictions are for focus landing on the element with default settings. Library components and roles built`);
console.log(`from variables only show their roles in the browser: run map-modes.mjs.`);
