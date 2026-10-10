#!/usr/bin/env node
// Runs scenarios in a browser and records what the page hands to screen readers: every live region change, every
// ariaNotify() call and every focus change, with whether a screen reader can hear it. Checks expectations and flags
// common mistakes.
//
//   node record-announcements.mjs <plan.json> [--out <result.json>]
//
// Run it from a folder where Playwright (`playwright`, `playwright-core`, `@playwright/test`) or Puppeteer
// (`puppeteer`, `puppeteer-core`) is installed: the project, or a temporary folder. The plan format is described in
// references/testing.md. Exits with 1 when an expectation fails.

import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const planPath = args.find((arg) => !arg.startsWith("--"));
const outIndex = args.indexOf("--out");
const outPath = outIndex > -1 ? args[outIndex + 1] : null;
if (!planPath) {
  console.error("Usage: node record-announcements.mjs <plan.json> [--out <result.json>]");
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

// Both drivers expose the same small surface. Scenarios share one browser context (cookies and storage), so a login
// in one carries over to the next; `isolate: true` gives a scenario a fresh context of its own.
async function playwrightDriver(plan) {
  const mod = await importFirst(["playwright", "playwright-core", "@playwright/test"]);
  const chromium = mod && (mod.chromium ?? mod.default?.chromium);
  if (!chromium) return null;
  const browser = await tryLaunch(launchAttempts(plan.browser), (o) => chromium.launch({ headless: true, ...o }));
  const createContext = async (initScript) => {
    const context = await browser.newContext({ viewport: plan.viewport ?? { width: 1280, height: 800 }, bypassCSP: true });
    await context.addInitScript(initScript);
    return context;
  };
  let shared;
  return {
    name: `Playwright, ${browser.version()}`,
    close: () => browser.close(),
    async newPage(initScript, { isolate = false } = {}) {
      const context = isolate ? await createContext(initScript) : (shared ??= await createContext(initScript));
      const page = await context.newPage();
      const first = (s) => page.locator(s).first();
      return {
        goto: (url) => page.goto(url, { waitUntil: "load" }),
        waitFor: (s) => first(s).waitFor(),
        ready: (expression) => page.waitForFunction(expression),
        click: (s) => first(s).click(),
        hover: (s) => first(s).hover(),
        focus: (s) => first(s).focus(),
        fill: (s, text) => first(s).fill(text),
        type: (s, text, delay) => first(s).pressSequentially(text, { delay }),
        press: (key) => page.keyboard.press(key),
        wait: (ms) => page.waitForTimeout(ms),
        evaluate: (fn, arg) => page.evaluate(fn, arg),
        cdp: () => context.newCDPSession(page),
        close: () => (isolate ? context.close() : page.close()),
      };
    },
  };
}

async function puppeteerDriver(plan) {
  const mod = await importFirst(["puppeteer", "puppeteer-core"]);
  const puppeteer = mod && (mod.default ?? mod);
  if (!puppeteer?.launch) return null;
  const attempts = launchAttempts(plan.browser).filter((o) => o.channel !== "msedge");
  const browser = await tryLaunch(attempts, (o) => puppeteer.launch({ headless: true, ...o }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let shared;
  return {
    name: `Puppeteer, ${await browser.version()}`,
    close: () => browser.close(),
    async newPage(initScript, { isolate = false } = {}) {
      const context = isolate ? await browser.createBrowserContext() : (shared ??= await browser.createBrowserContext());
      const page = await context.newPage();
      await page.setViewport(plan.viewport ?? { width: 1280, height: 800 });
      await page.setBypassCSP(true);
      await page.evaluateOnNewDocument(initScript);
      return {
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
        type: (s, text, delay) => page.type(s, text, { delay }),
        press: (key) => page.keyboard.press(key),
        wait: sleep,
        evaluate: (fn, arg) => page.evaluate(fn, arg),
        cdp: () => page.createCDPSession(),
        close: () => (isolate ? context.close() : page.close()),
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
    else if (a.fill) await page.fill(a.fill, a.text ?? "");
    else if (a.type) await page.type(a.type, a.text ?? "", a.delay ?? 50);
    else if (a.press) {
      for (let i = 0; i < (a.times ?? 1); i++) {
        if (i > 0 && a.interval) await page.wait(a.interval);
        await page.press(a.press);
      }
    } else if (a.waitFor) await page.waitFor(a.waitFor);
    else if (a.wait) await page.wait(a.wait);
    else if (a.eval) await page.evaluate(a.eval);
    else throw new Error(`Unknown action ${JSON.stringify(a)}`);
  }
}

const REGION_SELECTOR = "[aria-live]:not([aria-live=off]),[role=status],[role=alert],[role=log],output";

// Every live region on the page at the end, and whether Chromium exposes it to screen readers
async function regionsInAccessibilityTree(page) {
  const regions = await page.evaluate((selector) => {
    return Array.from(document.querySelectorAll(selector)).map((el) => {
      const attrs = ["role", "aria-live"].filter((n) => el.hasAttribute(n)).map((n) => `[${n}=${el.getAttribute(n)}]`).join("");
      const dialog = el.closest("dialog, [aria-modal='true'], [role=dialog]");
      return {
        region: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${attrs}`,
        container: dialog ? `dialog "${dialog.getAttribute("aria-label") || dialog.id || dialog.tagName.toLowerCase()}"` : "page",
      };
    });
  }, REGION_SELECTOR);
  try {
    const client = await page.cdp();
    const { root } = await client.send("DOM.getDocument", { depth: -1 });
    const { nodeIds } = await client.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: REGION_SELECTOR });
    for (let i = 0; i < nodeIds.length && i < regions.length; i++) {
      const { nodes } = await client.send("Accessibility.getPartialAXTree", { nodeId: nodeIds[i], fetchRelatives: false });
      const node = nodes.find((n) => n.backendDOMNodeId) ?? nodes[0];
      regions[i].exposed = !node?.ignored;
      regions[i].ignoredReasons = (node?.ignoredReasons ?? []).map((reason) => reason.name);
    }
    await client.detach();
  } catch (error) {
    for (const region of regions) region.exposed = `unknown (${String(error.message ?? error).split("\n")[0]})`;
  }
  return regions;
}

// Leads for the agent to check, not verdicts
function flagsFor(log) {
  const flags = [];
  const heard = log.filter((e) => (e.type === "live" || e.type === "ariaNotify") && !e.silent);
  for (const e of log.filter((e) => e.silent)) flags.push(`silent: "${e.text}" can't be heard (${e.silent})`);
  for (const e of log.filter((e) => e.newRegion)) flags.push(`new-region: "${e.text}" arrived together with its region, so it is often missed`);
  for (const e of heard.filter((e) => e.politeness === "assertive" || e.priority === "high")) {
    flags.push(`assertive: "${e.text}" (only for errors and time-critical messages)`);
  }
  for (let i = 0; i < heard.length; i++) {
    const within = heard.filter((e) => e.t >= heard[i].t && e.t - heard[i].t <= 1000);
    if (within.length >= 3) {
      flags.push(`burst: ${within.length} messages within 1 s from ${heard[i].t} ms; screen readers read every one (use an id and a delay)`);
      i += within.length - 1;
    }
  }
  return flags;
}

// Heard: in a region a screen reader can hear, which existed before the message. expectFocus is for messages that
// focus reads out (an error summary that receives focus): the focused element had that text when focus arrived.
function check(log, expect = [], expectNot = [], expectFocus = []) {
  const sent = log.filter((e) => e.type === "live" || e.type === "ariaNotify");
  const heard = sent.filter((e) => !e.silent && !e.newRegion).map((e) => e.text);
  const failures = [];
  let from = 0;
  for (const text of expect) {
    const index = heard.findIndex((h, i) => i >= from && h.includes(text));
    if (index > -1) {
      from = index + 1;
      continue;
    }
    const unreliable = sent.find((e) => e.text.includes(text));
    const why = unreliable ? (unreliable.silent ? ` (${unreliable.silent})` : " (it arrived together with its region)") : "";
    failures.push(`expected "${text}"${from ? " after the previous expectation" : ""}, not heard${why}`);
  }
  for (const text of expectNot) {
    if (heard.some((h) => h.includes(text))) failures.push(`"${text}" was heard, but shouldn't be`);
  }
  const focused = log.filter((e) => e.type === "focus").map((e) => e.text);
  for (const text of expectFocus) {
    if (!focused.some((f) => f.includes(text))) failures.push(`expected focus on an element saying "${text}", not seen`);
  }
  return failures;
}

const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const recorder = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "recorder.js"), "utf8");
const driver = await loadDriver(plan);
const results = [];
let failed = 0;

// Loads a page and waits until it can be used: the selector is there, and the `ready` expression (hydration) is true
async function open(page, url, scenario = {}) {
  await page.goto(url);
  if (scenario.waitFor ?? plan.waitFor) await page.waitFor(scenario.waitFor ?? plan.waitFor);
  if (scenario.ready ?? plan.ready) await page.ready(scenario.ready ?? plan.ready);
}

try {
  // A dev server compiles each page on its first visit, and Vite may then reload it to add new dependencies: that
  // would land in the middle of a scenario. Visit every URL once before recording.
  if (plan.warmup !== 0) {
    const page = await driver.newPage(recorder, { isolate: true });
    for (const url of new Set([plan.url, ...plan.scenarios.map((s) => s.url)].filter(Boolean))) {
      try {
        await page.goto(url);
        await page.wait(plan.warmup ?? 2000);
      } catch {}
    }
    await page.close();
  }

  for (const scenario of plan.scenarios) {
    const page = await driver.newPage(recorder, { isolate: scenario.isolate });
    const result = { name: scenario.name };
    try {
      await open(page, scenario.url ?? plan.url, scenario);
      await page.wait(plan.settle ?? 300);
      // Only what the actions cause: drop what happened while the page loaded
      if (!scenario.includeLoad) await page.evaluate(() => window.__liveRegionLog.splice(0));
      await runActions(page, scenario.actions);
      await page.wait(scenario.settle ?? plan.settleAfter ?? 1500);
      result.log = await page.evaluate(() => window.__liveRegionLog);
      result.lines = await page.evaluate(() => window.liveRegionLog());
      result.regions = await regionsInAccessibilityTree(page);
      result.flags = flagsFor(result.log);
      result.failures = check(result.log, scenario.expect, scenario.expectNot, scenario.expectFocus);
    } catch (error) {
      result.failures = [`error: ${String(error.message ?? error).split("\n")[0]}`];
    }
    await page.close();
    if (result.failures.length) failed++;
    results.push(result);

    console.log(`\n## ${scenario.name}: ${result.failures.length ? "FAIL" : "PASS"}`);
    for (const line of result.lines ?? []) console.log(`  ${line}`);
    if (result.lines && !result.lines.length) console.log("  (nothing reached a live region)");
    for (const failure of result.failures) console.log(`  FAIL  ${failure}`);
    for (const flag of result.flags ?? []) console.log(`  flag  ${flag}`);
    for (const r of result.regions ?? []) {
      const state = r.exposed === true ? "exposed" : r.exposed === false ? `IGNORED (${r.ignoredReasons.join(", ")})` : r.exposed;
      console.log(`  region  ${r.region} in ${r.container}: ${state}`);
    }
  }
} finally {
  await driver.close();
}

if (outPath) await fs.writeFile(outPath, JSON.stringify({ browser: driver.name, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} scenarios passed (${driver.name})`);
process.exit(failed ? 1 : 0);
