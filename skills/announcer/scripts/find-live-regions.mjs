#!/usr/bin/env node
// Lists every line in a codebase that makes, uses or affects a live region: aria-live and live roles, announcer
// libraries and helpers, toasts, and modals (which silence live regions outside them).
//
//   node find-live-regions.mjs [root] [--json]
//
// root defaults to the current folder. Files come from `git ls-files` (tracked and untracked, ignored files left out),
// or from a walk that skips dependency and build folders when root isn't a git repository. Every hit is a lead, not a
// verdict: read the code around it. references/decisions.md says what to decide for each kind.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const json = args.includes("--json");
const root = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? ".");

const CODE = /\.(m?[jt]sx?|cjs|cts|vue|svelte|astro|html?|hbs|handlebars|ejs|erb|php|twig|liquid|njk|cshtml|razor|jinja2?|j2|py|rb|java|kt|cs|go|elm|clj[sc]?)$/i;
const DOCS = /\.mdx?$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".nuxt", ".svelte-kit", ".output", ".turbo", ".cache", "vendor", "storybook-static", "target", "bin", "obj"]);
const MAX_BYTES = 1_000_000;
const MAX_LINE = 2000; // longer lines are minified or generated

// Kinds, most specific first. A line can have several.
const KINDS = [
  // Live regions
  { kind: "aria-live", group: "live", re: /aria-live|ariaLive|\[attr\.aria-live\]/ },
  { kind: "role-alert", group: "live", re: /\brole\s*[=:]\s*\{?\s*["'`]alert["'`]|setAttribute\(\s*["']role["']\s*,\s*["']alert["']/ },
  { kind: "role-status", group: "live", re: /\brole\s*[=:]\s*\{?\s*["'`]status["'`]|setAttribute\(\s*["']role["']\s*,\s*["']status["']/ },
  { kind: "role-log", group: "live", re: /\brole\s*[=:]\s*\{?\s*["'`]log["'`]|setAttribute\(\s*["']role["']\s*,\s*["']log["']/ },
  { kind: "role-timer-marquee", group: "live", re: /\brole\s*[=:]\s*\{?\s*["'`](timer|marquee)["'`]/ },
  { kind: "output", group: "live", re: /<output[\s>]/ },
  { kind: "live-attribute", group: "live", re: /aria-(atomic|relevant|busy)|aria(Atomic|Relevant|Busy)\b/ },
  { kind: "ariaNotify", group: "live", re: /\bariaNotify\b/ },
  // Announcers: libraries (by package, or an announce function imported from any package), then the codebase's own
  // helpers by name: declared, called, assigned, or rendered, not every mention
  {
    kind: "announcer-library",
    group: "announcer",
    re: /@react-aria\/live-announcer|\bLiveAnnouncer\b|cdkAriaLive|@wordpress\/a11y|wp\.a11y\.speak|@primer\/live-region-element|<live-region[\s>]|pragmatic-drag-and-drop-live-region|@zag-js\/live-region|react-aria-live|\bLiveMessage\b|react-a11y-announcer|@reach\/alert|vue-announcer|@vue-a11y\/announcer|\$announcer\b|screenReaderInstructions|\bannouncements\s*[:=]|import\s*\{[^}]*\w*[Aa]nnounc\w*[^}]*\}\s*from\s*["'](?![./#~]|@\/)/
  },
  {
    kind: "announce-name",
    group: "announcer",
    re: /<\w*(Announc|LiveRegion)\w*|\b\w*(announc|live_?region|liveRegion|LiveRegion|screenReader(Message|Text)|srMessage|a11yMessage)\w*\s*(\(|\.|:|=(?!=))/i
  },
  // Visible notifications that often carry their own live region
  { kind: "toast", group: "toast", re: /\btoast(s|er|ify)?\b|\buseToast\b|\bToaster\b|snackbar|notistack|\bsonner\b|ngx-toastr|vue-toastification|\bflash(Message|_message)?\b/i },
  // Modals: everything outside them is hidden from screen readers, live regions included
  {
    kind: "modal",
    group: "modal",
    re: /showModal\s*\(|aria-modal|ariaModal|\binert\b|hideOthers|ariaHideOutside|focus-trap|FocusTrap|focus-lock|FocusLock|cdkTrapFocus|react-remove-scroll|<dialog[\s>]|\brole\s*[=:]\s*\{?\s*["'`](dialog|alertdialog)["'`]|@radix-ui\/react-(dialog|alert-dialog)|@headlessui\/|MatDialog|@ark-ui\/.*dialog|@ariakit\/|react-modal|\bModal\b/
  }
];
// Only reported on a line that also has a live-region kind
const HIDDEN = /sr-only|visually-?hidden|VisuallyHidden|screen-reader-text|\bclip\s*:\s*rect/i;

// Comment-only lines describe live regions rather than make them, and so do the lines inside a block comment
const COMMENT = /^\s*(\/\/|\/\*|\*|#|<!--|\{\/\*)/;
// Only a comment that starts the line opens a block: "/*" also appears in code and strings ("src/**/*.ts")
const BLOCK_COMMENTS = [
  [/^\s*\{?\/\*/, /\*\//],
  [/^\s*<!--/, /-->/]
];

// Dependencies that ship an announcer. When its design matches (M7KIT from 0.64 is this design), the codebase uses
// it rather than a copy; otherwise its calls are migrated (references/decisions.md)
const ANNOUNCER_PACKAGES = {
  "@bremmdev/m7kit": "announce, useAnnounce from 0.64.0: this design (no cancelAnnouncement up to 0.66.0)",
  "react-aria": "announce (@react-aria/live-announcer)",
  "react-aria-components": "announce via react-aria",
  "@react-aria/live-announcer": "announce",
  "@adobe/react-spectrum": "announce via react-aria",
  "@angular/cdk": "LiveAnnouncer",
  "@wordpress/a11y": "speak",
  "@primer/live-region-element": "announce, <live-region>",
  "@primer/react": "announce via @primer/live-region-element",
  "@fluentui/react-components": "useAnnounce, AriaLiveAnnouncer",
  "@zag-js/live-region": "createLiveRegion",
  "@atlaskit/pragmatic-drag-and-drop-live-region": "announce",
  "react-aria-live": "LiveAnnouncer, LiveMessage",
  "@vue-a11y/announcer": "$announcer",
  "vue-announcer": "$announcer"
};

const isTest = (file) => /(\.|_)(spec|test)\.|__tests__|(^|\/)(tests?|e2e|cypress|playwright)\//i.test(file);
const isStory = (file) => /\.stories\.|\.story\./i.test(file);

function listFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
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

const hits = [];
const docs = [];
const dependencies = [];
const files = listFiles();

for (const file of files.filter((f) => path.posix.basename(f) === "package.json")) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  } catch {
    continue;
  }
  const declared = { ...manifest.peerDependencies, ...manifest.devDependencies, ...manifest.dependencies };
  for (const [name, range] of Object.entries(declared)) {
    if (!ANNOUNCER_PACKAGES[name]) continue;
    let installed;
    try {
      const dir = path.join(root, path.posix.dirname(file), "node_modules", name, "package.json");
      installed = JSON.parse(fs.readFileSync(dir, "utf8")).version;
    } catch {}
    dependencies.push({ file, name, range, installed, provides: ANNOUNCER_PACKAGES[name] });
  }
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
    const count = text.split(/\r?\n/).filter((line) => KINDS.slice(0, 10).some(({ re }) => re.test(line))).length;
    if (count) docs.push({ file, count });
    continue;
  }

  const area = isTest(file) ? "tests" : isStory(file) ? "stories" : "source";
  let closing = null; // the end of the block comment the current line is in
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
    const kinds = KINDS.filter(({ re }) => re.test(line));
    if (!kinds.length) return;
    const names = kinds.map(({ kind }) => kind);
    if (kinds.some(({ group }) => group === "live") && HIDDEN.test(line)) names.push("visually-hidden");
    hits.push({ file, line: index + 1, area, group: kinds[0].group, kinds: names, text: line.trim().slice(0, 160) });
  });
}

if (json) {
  console.log(JSON.stringify({ root, dependencies, hits, docs }, null, 2));
  process.exit(0);
}

const SECTIONS = [
  ["source", "live", "Live regions"],
  ["source", "announcer", "Announcers and announce helpers"],
  ["source", "toast", "Toasts, snackbars and flash messages"],
  ["source", "modal", "Modals (live regions outside an open modal are silent)"],
  ["tests", null, "Tests (update them with the migration)"],
  ["stories", null, "Stories and demos"]
];

const print = (list) => {
  let current;
  for (const hit of list) {
    if (hit.file !== current) {
      current = hit.file;
      console.log(`\n  ${hit.file}`);
    }
    console.log(`    ${String(hit.line).padStart(5)}  [${hit.kinds.join(", ")}]  ${hit.text}`);
  }
};

console.log(`Live region inventory of ${root}`);
console.log(`\n## Dependencies that ship an announcer: ${dependencies.length}`);
for (const d of dependencies) {
  console.log(`  ${d.name} ${d.range}${d.installed ? ` (installed ${d.installed})` : ""} in ${d.file}: ${d.provides}`);
}
for (const [area, group, title] of SECTIONS) {
  const list = hits.filter((hit) => hit.area === area && (group === null || hit.group === group));
  const files = new Set(list.map((hit) => hit.file)).size;
  console.log(`\n## ${title}: ${list.length} lines in ${files} files`);
  print(list);
}
if (docs.length) {
  console.log(`\n## Docs that mention live regions or announcers`);
  for (const { file, count } of docs) console.log(`  ${file} (${count})`);
}
console.log(
  `\nannounce-name and toast match by name, so many hits are false leads; aria-live, role-* and output never are.`
);
