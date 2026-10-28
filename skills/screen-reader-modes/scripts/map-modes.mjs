#!/usr/bin/env node
// Maps the screen reader modes of rendered pages: scans every focusable element and widget with modes.js, presses
// the key each widget promises (arrow keys) to see whether the page handles it, takes a screenshot, and writes a
// self-contained HTML report with the screenshot boxed and numbered by mode.
//
//   node map-modes.mjs <plan.json> --out <dir> [--report <file.html>] [--title <text>] [--summary <fragment.html>]
//
// Run it from a folder where Playwright (`playwright`, `playwright-core`, `@playwright/test`) or Puppeteer
// (`puppeteer`, `puppeteer-core`) is installed: the project, or a temporary folder. <dir> gets result.json and the
// screenshots; keep it outside the repository. The plan format is described in references/testing.md.

import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => (args.indexOf(name) > -1 ? args[args.indexOf(name) + 1] : null);
const planPath = args.find((arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"));
const outDir = option("--out");
const reportPath = option("--report");
if (!planPath || !outDir) {
  console.error("Usage: node map-modes.mjs <plan.json> --out <dir> [--report <file.html>] [--title <text>] [--summary <fragment.html>]");
  process.exit(1);
}

const req = createRequire(path.join(process.cwd(), "noop.js"));
async function importFirst(names) {
  for (const name of names) {
    try {
      return await import(pathToFileURL(req.resolve(name)).href);
    } catch {}
  }
  return null;
}

async function tryLaunch(attempts, launch) {
  let lastError;
  for (const options of attempts) {
    try {
      return await launch(options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function launchAttempts(browser = {}) {
  if (browser.executablePath) return [{ executablePath: browser.executablePath }];
  if (browser.channel) return [{ channel: browser.channel }];
  return [{}, { channel: "chrome" }, { channel: "msedge" }];
}

// Exposes element.computedRole, so the scan can compare its roles with Chromium's. `browser.args` adds more, such as
// --no-sandbox, which Puppeteer needs when it runs as root (in a container)
const browserArgs = (plan) => ["--enable-blink-features=ComputedAccessibilityInfo", ...(plan.browser?.args ?? [])];

async function playwrightDriver(plan) {
  const mod = await importFirst(["playwright", "playwright-core", "@playwright/test"]);
  const chromium = mod && (mod.chromium ?? mod.default?.chromium);
  if (!chromium) return null;
  const browser = await tryLaunch(launchAttempts(plan.browser), (o) => chromium.launch({ headless: true, args: browserArgs(plan), ...o }));
  const context = await browser.newContext({ viewport: plan.viewport ?? { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const first = (s) => page.locator(s).first();
  return {
    name: `Playwright, ${browser.version()}`,
    close: () => browser.close(),
    goto: (url) => page.goto(url, { waitUntil: "load" }),
    waitFor: (s) => first(s).waitFor(),
    ready: (expression) => page.waitForFunction(expression),
    click: (s) => first(s).click(),
    hover: (s) => first(s).hover(),
    focus: (s) => first(s).focus(),
    fill: (s, text) => first(s).fill(text),
    press: (key) => page.keyboard.press(key),
    wait: (ms) => page.waitForTimeout(ms),
    evaluate: (fn, arg) => page.evaluate(fn, arg),
    screenshot: (file) => page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" })
  };
}

async function puppeteerDriver(plan) {
  const mod = await importFirst(["puppeteer", "puppeteer-core"]);
  const puppeteer = mod && (mod.default ?? mod);
  if (!puppeteer?.launch) return null;
  const attempts = launchAttempts(plan.browser).filter((o) => o.channel !== "msedge");
  const browser = await tryLaunch(attempts, (o) => puppeteer.launch({ headless: true, args: browserArgs(plan), ...o }));
  const page = await browser.newPage();
  await page.setViewport(plan.viewport ?? { width: 1280, height: 800 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    name: `Puppeteer, ${await browser.version()}`,
    close: () => browser.close(),
    goto: (url) => page.goto(url, { waitUntil: "load" }),
    waitFor: (s) => page.waitForSelector(s),
    ready: (expression) => page.waitForFunction(expression),
    click: (s) => page.click(s),
    hover: (s) => page.hover(s),
    focus: (s) => page.focus(s),
    fill: (s, text) => page.$eval(s, (el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, text),
    press: (key) => page.keyboard.press(key),
    wait: sleep,
    evaluate: (fn, arg) => page.evaluate(fn, arg),
    screenshot: (file) => page.screenshot({ path: file, fullPage: true })
  };
}

async function loadDriver(plan) {
  const order = plan.driver === "puppeteer" ? [puppeteerDriver, playwrightDriver] : [playwrightDriver, puppeteerDriver];
  for (const make of order) {
    const driver = await make(plan);
    if (driver) return driver;
  }
  throw new Error(`No Playwright or Puppeteer found from ${process.cwd()}`);
}

async function runActions(page, actions = []) {
  for (const a of actions) {
    if (a.click) await page.click(a.click);
    else if (a.hover) await page.hover(a.hover);
    else if (a.focus) await page.focus(a.focus);
    else if (a.fill) await page.fill(a.fill, a.text ?? "");
    else if (a.press) {
      for (let i = 0; i < (a.times ?? 1); i++) await page.press(a.press);
    } else if (a.waitFor) await page.waitFor(a.waitFor);
    else if (a.wait) await page.wait(a.wait);
    else if (a.eval) await page.evaluate(a.eval);
    else throw new Error(`Unknown action ${JSON.stringify(a)}`);
  }
}

// --- Probing keys ---------------------------------------------------------------------------------------------

// Focuses the element and starts watching: whether the key's keydown is prevented or stopped, focus moves, and
// whether the page changes (attributes, text, value) in response.
function startProbe(id) {
  const find = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (el.getAttribute("data-srm") === String(id)) return el;
      const inner = el.shadowRoot && find(el.shadowRoot);
      if (inner) return inner;
    }
    return null;
  };
  const el = find(document);
  if (!el) return { error: "element not found (the page rendered differently after reload)" };
  el.focus();
  const active = () => {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  };
  const start = active();
  if (!start || (start !== el && !el.contains(start))) return { error: "doesn't take focus with focus()" };
  const state = { start, value: "value" in el ? el.value : null, scroll: [scrollX, scrollY], started: false, reached: false, prevented: false, changes: [] };
  state.onCapture = () => (state.started = true);
  state.onBubble = (e) => {
    state.reached = true;
    state.prevented = e.defaultPrevented;
  };
  addEventListener("keydown", state.onCapture, true);
  addEventListener("keydown", state.onBubble, false);
  state.observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes" && r.attributeName === "data-srm") continue;
      state.changes.push(r.type === "attributes" ? r.attributeName : r.type === "childList" ? "content" : "text");
    }
  });
  state.observer.observe(document.body, { attributes: true, childList: true, characterData: true, subtree: true });
  state.active = active;
  window.__srmProbe = state;
  return { ok: true };
}

// Changes that happen without a key press (timers, animations, focus handlers) don't count as handling the key
function markBaseline() {
  const s = window.__srmProbe;
  s.baseline = new Set(s.changes);
  s.changes = [];
}

function endProbe() {
  const s = window.__srmProbe;
  s.observer.disconnect();
  removeEventListener("keydown", s.onCapture, true);
  removeEventListener("keydown", s.onBubble, false);
  const el = s.start;
  const now = s.active();
  const how = [];
  if (now !== s.start) how.push("focus moved");
  if (s.prevented) how.push("keydown prevented");
  if (s.started && !s.reached) how.push("keydown stopped");
  if (s.value !== null && "value" in el && el.value !== s.value) how.push("value changed");
  const changes = [...new Set(s.changes)].filter((c) => !s.baseline.has(c));
  if (changes.length) how.push("changed " + changes.slice(0, 4).join(", "));
  delete window.__srmProbe;
  return { handled: how.length > 0, how, scrolled: scrollX !== s.scroll[0] || scrollY !== s.scroll[1] };
}

const GENERIC_ROLES = new Set(["generic", "group", "region", "img", "figure", "article", "listitem", "paragraph", "none", "navigation", "main"]);

// What to press: the key a widget's role promises, or both arrows on a focusable element without a widget role
function probeKeys(item) {
  if (item.editable && item.role !== "combobox") return [];
  if (item.probe) return [item.probe];
  if (item.kind === "control" && item.focus && GENERIC_ROLES.has(item.role)) return ["ArrowRight", "ArrowDown"];
  if (item.role === "application") return ["ArrowRight", "ArrowDown"];
  return [];
}

function verdictFor(item, result) {
  const windows = item.map;
  if (!result || result.error) return null;
  if (windows === "browse" && result.handled) return `${result.key} works here, but JAWS and NVDA keep it in browse mode: the handler never runs for them`;
  if (windows === "focus" && !result.handled) return `${result.key} does nothing, and in focus mode it goes to the page: the ${item.role} doesn't respond`;
  if (windows === "application" && !result.handled) return `${result.key} does nothing inside role=application, where every key goes to the page`;
  return null;
}

// --- The report -----------------------------------------------------------------------------------------------

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const READERS = [
  ["jaws", "JAWS", { browse: "virtual cursor", focus: "forms mode", application: "virtual cursor off", keep: "keeps its mode" }],
  ["nvda", "NVDA", { browse: "browse mode", focus: "focus mode", application: "application" }],
  ["narrator", "Narrator", { browse: "scan mode", focus: "scan mode off" }],
  ["orca", "Orca", { browse: "browse mode", focus: "focus mode", application: "focus mode (web app)" }]
];
const MAP_LABEL = { browse: "browse", focus: "focus or forms mode", application: "application" };

function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function cell(prediction, labels) {
  const label = labels[prediction.mode] ?? prediction.mode;
  return `<td><span class="mode mode-${prediction.mode}">${escapeHtml(label)}${prediction.sure ? "" : " <abbr title=\"not documented: test it\">?</abbr>"}</span>${prediction.why ? `<span class="why">${escapeHtml(prediction.why)}</span>` : ""}</td>`;
}

function itemRow(item, nested) {
  const p = item.predictions;
  const probes = (item.probes ?? []).map((r) => (r.error ? `${r.key}: ${r.error}` : `${r.key}: ${r.handled ? r.how.join(", ") : "nothing happened"}`));
  const leads = [...item.flags, ...(item.verdicts ?? [])];
  return `<tr${nested ? ' class="nested"' : ""}>
  <th scope="row">${nested ? "" : `<span class="num num-${item.map}">${item.id}</span>`}${nested ? `<span class="sub">${item.id}</span>` : ""}</th>
  <td><strong>${escapeHtml(item.role)}</strong>${item.editable ? " (editable)" : ""}${item.computedRole ? ` <span class="why">Chromium: ${escapeHtml(item.computedRole)}</span>` : ""} ${item.name ? `“${escapeHtml(item.name)}”` : ""}<code>${escapeHtml(item.selector)}</code>${item.children ? `<span class="why">${item.children} focusable inside: ${escapeHtml(Object.entries(item.childRoles).map(([r, n]) => `${n} ${r}`).join(", "))}</span>` : ""}</td>
  ${READERS.map(([id, , labels]) => cell(p[id], labels)).join("\n  ")}
  <td>${escapeHtml(item.keys)}${probes.length ? `<span class="why">Probe: ${escapeHtml(probes.join("; "))}</span>` : ""}</td>
  <td>${leads.length ? `<ul>${leads.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : ""}</td>
</tr>`;
}

function pageSection(page, index) {
  if (page.error) return `<section><h2>${escapeHtml(page.name)}</h2><p class="error">Failed: ${escapeHtml(page.error)}</p></section>`;
  const items = page.scan.items;
  const drawn = items.filter((i) => i.parent === null && i.rect);
  const counts = { browse: 0, focus: 0, application: 0 };
  for (const i of items.filter((i) => i.parent === null)) counts[i.map]++;
  const { width, height } = page.size;
  const boxes = drawn.map((i) => {
    const r = i.rect;
    const labelY = Math.max(0, r.y - 15);
    return `<g class="box box-${i.map}${i.differs ? " differs" : ""}"><rect class="halo" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/><rect class="edge" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/><rect class="tag" x="${r.x}" y="${labelY}" width="${String(i.id).length * 7 + 8}" height="15"/><text x="${r.x + 4}" y="${labelY + 11.5}">${i.id}</text></g>`;
  }).join("");
  // Items inside a container are listed when they differ from it, or have leads or probe results
  const same = (a, b) => READERS.every(([id]) => a.predictions[id].mode === b.predictions[id].mode);
  const rows = items.filter((i) => i.parent === null).map((i) => {
    const inner = items.filter((c) => c.parent === i.id && (!same(c, i) || c.flags.length || c.probes || c.editable));
    return itemRow(i, false) + inner.map((c) => itemRow(c, true)).join("");
  }).join("\n");
  return `<section aria-labelledby="page-${index}">
<h2 id="page-${index}">${escapeHtml(page.name)}</h2>
<p><a href="${escapeHtml(page.url)}">${escapeHtml(page.url)}</a>${page.root !== "body" ? `, inside <code>${escapeHtml(page.root)}</code>` : ""}: ${drawn.length} boxes. ${counts.application} application, ${counts.focus} focus or forms mode, ${counts.browse} browse mode (JAWS or NVDA, the strongest of the two).</p>
${page.scan.flags.length ? `<ul class="flags">${page.scan.flags.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
<figure>
<div class="shot" style="aspect-ratio: ${width} / ${height}">
<img src="data:image/png;base64,${page.png}" alt="Screenshot of ${escapeHtml(page.name)} with ${drawn.length} numbered boxes; the table below lists them by number">
<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${boxes}</svg>
</div>
<figcaption>Colored by the strongest mode of JAWS and NVDA. Dashed: the documented predictions of JAWS, NVDA, Narrator and Orca differ.</figcaption>
</figure>
<div class="table-wrap">
<table>
<caption>What happens when focus lands on each box in ${escapeHtml(page.name)}</caption>
<thead><tr><th scope="col">#</th><th scope="col">Element</th>${READERS.map(([, name]) => `<th scope="col">${name}</th>`).join("")}<th scope="col">Keys</th><th scope="col">Leads</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
</section>`;
}

function roleMatrix(pages) {
  const byRole = new Map();
  for (const page of pages.filter((p) => !p.error)) {
    for (const item of page.scan.items) {
      const key = item.role + (item.editable ? " (editable)" : "");
      if (!byRole.has(key)) byRole.set(key, { item, count: 0 });
      byRole.get(key).count++;
    }
  }
  const rank = { application: 0, focus: 1, browse: 2 };
  const rows = [...byRole.entries()].sort((a, b) => rank[a[1].item.map] - rank[b[1].item.map] || a[0].localeCompare(b[0])).map(([role, { item, count }]) => {
    return `<tr><th scope="row"><span class="mode mode-${item.map}">${escapeHtml(role)}</span></th><td>${count}</td>${READERS.map(([id, , labels]) => `<td>${escapeHtml(labels[item.predictions[id].mode] ?? item.predictions[id].mode)}${item.predictions[id].sure ? "" : "?"}</td>`).join("")}<td>no modes</td></tr>`;
  }).join("\n");
  return `<section aria-labelledby="matrix"><h2 id="matrix">Roles on these pages</h2>
<div class="table-wrap"><table><caption>The mode each role gets on focus (first occurrence; ? means no source documents it)</caption>
<thead><tr><th scope="col">Role</th><th scope="col">Count</th>${READERS.map(([, name]) => `<th scope="col">${name}</th>`).join("")}<th scope="col">VoiceOver, TalkBack</th></tr></thead>
<tbody>${rows}</tbody></table></div></section>`;
}

function report(result, title, summary) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0; --browse: #1a7f37; --focus: #9a6700; --application: #cf222e; --halo: #ffffff; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d; --browse: #3fb950; --focus: #d29922; --application: #ff7b72; --halo: #000000; } }
:root[data-theme="dark"] { --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d; --browse: #3fb950; --focus: #d29922; --application: #ff7b72; --halo: #000000; }
body { margin: 0 auto; padding: 16px; max-width: 1400px; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
h1 { font-size: 1.6rem; } h2 { margin-top: 2.5rem; border-bottom: 1px solid var(--line); }
code { font-size: 0.85em; display: block; color: var(--muted); overflow-wrap: anywhere; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 24px; padding: 0; list-style: none; }
.mode { font-weight: 600; } .mode-browse { color: var(--browse); } .mode-focus, .mode-keep { color: var(--focus); } .mode-application { color: var(--application); } .mode-none { color: var(--muted); }
.why { display: block; color: var(--muted); font-size: 0.85em; }
.shot { position: relative; width: 100%; border: 1px solid var(--line); }
.shot img, .shot svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.box rect.halo { fill: none; stroke: var(--halo); stroke-width: 6; }
.box rect.edge { fill: none; stroke-width: 3; }
.box.differs rect.edge { stroke-dasharray: 10 5; }
.box-browse rect.edge, .box-browse rect.tag { stroke: var(--browse); } .box-browse rect.tag { fill: var(--browse); }
.box-focus rect.edge, .box-focus rect.tag { stroke: var(--focus); } .box-focus rect.tag { fill: var(--focus); }
.box-application rect.edge, .box-application rect.tag { stroke: var(--application); } .box-application rect.tag { fill: var(--application); }
.box text { fill: var(--bg); font: bold 11px system-ui, sans-serif; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.9rem; }
caption { text-align: start; font-weight: 600; padding: 4px 0; }
th, td { border: 1px solid var(--line); padding: 6px 8px; text-align: start; vertical-align: top; }
tr.nested th, tr.nested td { font-size: 0.85rem; }
.num { display: inline-block; min-width: 1.6em; text-align: center; color: var(--bg); border-radius: 3px; font-weight: 700; }
.num-browse { background: var(--browse); } .num-focus { background: var(--focus); } .num-application { background: var(--application); }
.sub { color: var(--muted); }
td ul, .flags { margin: 0; padding-inline-start: 1.2em; }
.error { color: var(--application); }
@media (forced-colors: active) { .num, .box rect.tag { forced-color-adjust: none; background: CanvasText; fill: CanvasText; color: Canvas; } .box text { fill: Canvas; } .box rect.edge { stroke: CanvasText; } }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>What JAWS, NVDA, Narrator and Orca do when focus lands on each element, with default settings. VoiceOver and TalkBack have no modes: keys and gestures reach the page everywhere. Predictions follow NVDA's and Orca's source code and Freedom Scientific's JAWS documentation; only a real screen reader proves them. ${escapeHtml(result.browser)}, ${escapeHtml(result.date)}.</p>
<ul class="legend">
<li><span class="mode mode-browse">Browse mode</span>: the screen reader keeps arrows, letters and Space for reading</li>
<li><span class="mode mode-focus">Focus or forms mode</span>: keys go to the page; reading keys stop</li>
<li><span class="mode mode-application">Application</span>: no browse mode inside; content is out of NVDA's browse mode</li>
<li>? : no source documents this prediction; test it</li>
</ul>
${summary ?? ""}
${roleMatrix(result.pages)}
${result.pages.map(pageSection).join("\n")}
</body>
</html>`;
}

// --- Run ------------------------------------------------------------------------------------------------------

const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const modesSource = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "modes.js"), "utf8");
await fs.mkdir(outDir, { recursive: true });
const driver = await loadDriver(plan);
const result = { browser: driver.name, date: new Date().toISOString().slice(0, 10), pages: [] };
const pages = plan.pages ?? [{ name: "page" }];

async function open(spec) {
  await driver.goto(spec.url ?? plan.url);
  if (spec.waitFor ?? plan.waitFor) await driver.waitFor(spec.waitFor ?? plan.waitFor);
  if (spec.ready ?? plan.ready) await driver.ready(spec.ready ?? plan.ready);
  await driver.wait(plan.settle ?? 300);
  await runActions(driver, spec.actions);
  await driver.wait(spec.settle ?? plan.settleAfter ?? 300);
}

const scan = (root) => driver.evaluate(([source, selector]) => (0, eval)(`${source}\n;screenReaderModes(${JSON.stringify(selector)}, { mark: true })`), [modesSource, root]);

try {
  for (const [index, spec] of pages.entries()) {
    const name = spec.name ?? `page-${index + 1}`;
    const root = spec.root ?? plan.root ?? "body";
    const entry = { name, url: spec.url ?? plan.url, root };
    try {
      await open(spec);
      entry.scan = await scan(root);
      if (entry.scan.error) throw new Error(entry.scan.error);
      entry.url = entry.scan.url;
      const file = path.join(outDir, `${name.replace(/[^\w-]+/g, "-")}.png`);
      await driver.evaluate(() => scrollTo(0, 0));
      await driver.screenshot(file);
      entry.screenshot = file;

      // Probes change the page; reload it (with the actions) before the next one when a probe changed something
      const probing = (spec.probe ?? plan.probe) !== false;
      // Top-level entries only: a container stands for its items
      const targets = probing ? entry.scan.items.filter((i) => i.parent === null && probeKeys(i).length && (i.focus || i.focusItem)).slice(0, spec.maxProbes ?? plan.maxProbes ?? 40) : [];
      let dirty = false;
      for (const item of targets) {
        item.probes = [];
        for (const key of probeKeys(item)) {
          if (dirty) {
            await open(spec);
            await scan(root);
            dirty = false;
          }
          const started = await driver.evaluate(startProbe, item.focus ? item.id : item.focusItem);
          if (started.error) {
            item.probes.push({ key, error: started.error });
            break;
          }
          const wait = spec.probeWait ?? plan.probeWait ?? 150;
          await driver.wait(wait);
          await driver.evaluate(markBaseline);
          await driver.press(key);
          await driver.wait(wait);
          const outcome = { key, ...(await driver.evaluate(endProbe)) };
          item.probes.push(outcome);
          dirty = true;
          if (outcome.handled) break;
        }
        const last = item.probes.find((r) => r.handled) ?? item.probes.at(-1);
        const verdict = verdictFor(item, last);
        if (verdict) item.verdicts = [verdict];
      }
    } catch (error) {
      entry.error = String(error.message ?? error).split("\n")[0];
    }
    result.pages.push(entry);

    console.log(`\n## ${name}: ${entry.error ? `ERROR ${entry.error}` : `${entry.scan.items.length} elements`}`);
    for (const item of entry.scan?.items ?? []) {
      const modes = READERS.map(([id, label]) => `${label} ${item.predictions[id].mode}${item.predictions[id].sure ? "" : "?"}`).join(", ");
      console.log(`  ${String(item.id).padStart(3)}${item.parent ? `  in ${item.parent}` : ""}  ${item.role}${item.name ? ` "${item.name}"` : ""}  ${item.selector}`);
      console.log(`       ${modes}${item.differs ? "  (differs)" : ""}`);
      for (const r of item.probes ?? []) console.log(`       probe ${r.key}: ${r.error ?? (r.handled ? r.how.join(", ") : "nothing happened")}`);
      for (const f of [...item.flags, ...(item.verdicts ?? [])]) console.log(`       lead  ${f}`);
    }
    for (const f of entry.scan?.flags ?? []) console.log(`  page lead  ${f}`);
  }
} finally {
  await driver.close();
}

await fs.writeFile(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
if (reportPath) {
  for (const page of result.pages.filter((p) => p.screenshot)) {
    const buffer = await fs.readFile(page.screenshot);
    page.png = buffer.toString("base64");
    page.size = pngSize(buffer);
  }
  const summaryPath = option("--summary");
  const summary = summaryPath ? await fs.readFile(summaryPath, "utf8") : null;
  await fs.mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
  await fs.writeFile(reportPath, report(result, option("--title") ?? "Screen reader modes", summary));
  console.log(`\nReport: ${path.resolve(reportPath)}`);
}
console.log(`Result: ${path.resolve(outDir, "result.json")} (${driver.name})`);
