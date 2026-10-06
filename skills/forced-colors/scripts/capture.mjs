#!/usr/bin/env node
// Capture every shot of a plan in normal and forced colors modes, and record what changed.
//
//   node capture.mjs <plan.json> <out-dir> [label]
//
// Run it from a folder where Playwright (`playwright`, `playwright-core`, `@playwright/test`)
// or Puppeteer (`puppeteer`, `puppeteer-core`) is installed: the project, or a temporary folder.
// label defaults to "before"; use "after" once fixes are in. Output:
// <out-dir>/<label>/<mode>/<shot>.png and <out-dir>/<label>/manifest.json; compare.mjs turns them into a report.
// The plan format is described in references/capture.md.

import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";

const [planPath, outRoot, label = "before"] = process.argv.slice(2);
if (!planPath || !outRoot) {
  console.error("Usage: node capture.mjs <plan.json> <out-dir> [label]");
  process.exit(1);
}

const DEFAULT_MODES = [
  { name: "normal", forcedColors: "none", colorScheme: "light" },
  { name: "forced-dark", forcedColors: "active", colorScheme: "dark" },
  { name: "forced-light", forcedColors: "active", colorScheme: "light" },
];

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

// Both drivers expose the same small surface: newPage(mode) returns a page with the actions below.
async function playwrightDriver(plan) {
  const mod = await importFirst(["playwright", "playwright-core", "@playwright/test"]);
  const chromium = mod && (mod.chromium ?? mod.default?.chromium);
  if (!chromium) return null;
  const browser = await tryLaunch(launchAttempts(plan.browser), (o) => chromium.launch({ headless: true, ...o }));
  return {
    name: `Playwright, ${browser.version()}`,
    close: () => browser.close(),
    async newPage(mode) {
      const context = await browser.newContext({
        viewport: plan.viewport ?? { width: 1024, height: 768 },
        deviceScaleFactor: plan.deviceScaleFactor ?? 2,
        forcedColors: mode.forcedColors ?? "none",
        colorScheme: mode.colorScheme ?? "light",
        reducedMotion: "reduce",
        bypassCSP: true,
      });
      if (mode.initScript) await context.addInitScript(mode.initScript);
      const page = await context.newPage();
      const first = (s) => page.locator(s).first();
      return {
        goto: (url) => page.goto(url, { waitUntil: "load" }),
        waitFor: (s) => first(s).waitFor(),
        click: (s) => first(s).click(),
        hover: (s) => first(s).hover(),
        focus: (s) => first(s).focus(),
        check: (s) => first(s).check(),
        press: (key) => page.keyboard.press(key),
        wait: (ms) => page.waitForTimeout(ms),
        evaluate: (fn, arg) => page.evaluate(fn, arg),
        screenshot: (options) => page.screenshot({ ...options, animations: "disabled", caret: "hide" }),
        close: () => context.close(),
      };
    },
  };
}

async function puppeteerDriver(plan) {
  const mod = await importFirst(["puppeteer", "puppeteer-core"]);
  const puppeteer = mod && (mod.default ?? mod);
  if (!puppeteer?.launch) return null;
  // Puppeteer has no msedge channel; pass Edge as browser.executablePath instead.
  const attempts = launchAttempts(plan.browser).filter((o) => o.channel !== "msedge");
  const browser = await tryLaunch(attempts, (o) => puppeteer.launch({ headless: true, ...o }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    name: `Puppeteer, ${await browser.version()}`,
    close: () => browser.close(),
    async newPage(mode) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      const viewport = plan.viewport ?? { width: 1024, height: 768 };
      await page.setViewport({ ...viewport, deviceScaleFactor: plan.deviceScaleFactor ?? 2 });
      await page.setBypassCSP(true);
      // page.emulateMediaFeatures rejects forced-colors, so emulate through CDP.
      const cdp = await page.createCDPSession();
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [
          { name: "forced-colors", value: mode.forcedColors ?? "none" },
          { name: "prefers-color-scheme", value: mode.colorScheme ?? "light" },
          { name: "prefers-reduced-motion", value: "reduce" },
        ],
      });
      if (mode.initScript) await page.evaluateOnNewDocument(mode.initScript);
      return {
        goto: (url) => page.goto(url, { waitUntil: "load" }),
        waitFor: (s) => page.waitForSelector(s),
        click: (s) => page.click(s),
        hover: (s) => page.hover(s),
        focus: (s) => page.focus(s),
        check: (s) => page.$eval(s, (el) => el.checked || el.click()),
        press: (key) => page.keyboard.press(key),
        wait: sleep,
        evaluate: (fn, arg) => page.evaluate(fn, arg),
        async screenshot(options) {
          // Puppeteer has no animations option: stop transitions and hide the caret.
          await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" });
          const { path: file, clip, fullPage } = options;
          const buffer = await page.screenshot({ path: file, ...(clip ? { clip, captureBeyondViewport: true } : { fullPage: !!fullPage }) });
          return Buffer.from(buffer);
        },
        close: () => context.close(),
      };
    },
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
    else if (a.check) await page.check(a.check);
    else if (a.press) await page.press(a.press);
    else if (a.waitFor) await page.waitFor(a.waitFor);
    else if (a.wait) await page.wait(a.wait);
    else if (a.eval) await page.evaluate(a.eval);
    else throw new Error(`Unknown action ${JSON.stringify(a)}`);
  }
}

// Clip in document coordinates, with padding so outlines and focus rings are included.
async function clipFor(page, selector, padding) {
  await page.waitFor(selector);
  const box = await page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  }, selector);
  if (!box.width || !box.height) throw new Error(`${selector} has no size`);
  const x = Math.max(0, Math.floor(box.x - padding));
  const y = Math.max(0, Math.floor(box.y - padding));
  return { x, y, width: Math.ceil(box.x + box.width + padding) - x, height: Math.ceil(box.y + box.height + padding) - y };
}

const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const modes = plan.modes ?? DEFAULT_MODES;
const scanSource = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "scan.js"), "utf8");
const outDir = path.join(outRoot, label);

const driver = await loadDriver(plan);
const manifest = {
  label,
  createdAt: new Date().toISOString(),
  browser: driver.name,
  deviceScaleFactor: plan.deviceScaleFactor ?? 2,
  modes,
  shots: [],
};

try {
  for (const mode of modes) {
    await fs.mkdir(path.join(outDir, mode.name), { recursive: true });
    const page = await driver.newPage(mode);

    for (const shot of plan.shots) {
      const entry = { name: shot.name, group: shot.group ?? null, mode: mode.name };
      try {
        await page.goto(shot.url ?? plan.url);
        if (plan.waitFor) await page.waitFor(plan.waitFor);
        await runActions(page, [...(mode.actions ?? []), ...(shot.actions ?? [])]);
        await page.wait(shot.settle ?? plan.settle ?? 300);
        const file = path.join(outDir, mode.name, `${shot.name}.png`);
        const options = { path: file };
        if (shot.selector) Object.assign(options, { fullPage: true, clip: await clipFor(page, shot.selector, shot.padding ?? 16) });
        await page.screenshot(options);
        entry.file = path.relative(outRoot, file).split(path.sep).join("/");
        if (mode.forcedColors === "active" && shot.scan !== false) {
          entry.scan = await page.evaluate(
            ([src, selector]) => (0, eval)(`${src}\n;forcedColorsScan`)(selector),
            [scanSource, shot.scanRoot ?? shot.selector ?? null]
          );
        }
      } catch (error) {
        entry.error = String(error.message ?? error).split("\n")[0];
      }
      manifest.shots.push(entry);
      console.log(`${label} ${mode.name} ${shot.name}${entry.error ? ` ERROR ${entry.error}` : ""}`);
    }
    await page.close();
  }
} finally {
  await driver.close();
}

await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${path.join(outDir, "manifest.json")} (${driver.name})`);
