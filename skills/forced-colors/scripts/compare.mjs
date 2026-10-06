#!/usr/bin/env node
// Build the forced colors report: one self-contained HTML file with every screenshot
// embedded, before and after side by side, plus the automatic flags and scan suspects.
//
//   node compare.mjs <out-dir> <report.html> [--title "Switch"] [--summary gaps.html] [--json]
//
// <out-dir> holds <label>/<mode>/<shot>.png for the labels "before" and (optionally) "after".
// <label>/manifest.json is written by capture.mjs; for screenshots taken another way, write
// it by hand (see references/capture.md) or leave it out: modes and shots are then read from
// the folders, without groups or scan results.
// --summary inserts an HTML fragment (the gap table) at the top of the report.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const title = option("--title");
const summaryFile = option("--summary");
const json = args.includes("--json");
const [outRoot, reportFile] = args.filter((a) => a !== "--json");
if (!outRoot || !reportFile) {
  console.error('Usage: node compare.mjs <out-dir> <report.html> [--title "…"] [--summary gaps.html] [--json]');
  process.exit(1);
}

// Minimal PNG decoder (8-bit grayscale, RGB, gray+alpha or RGBA, not interlaced): enough
// for browser screenshots, and no dependencies. Returns null for other PNGs.
function pngStats(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  let pos = 8, width, height, depth, colorType, interlace;
  const idat = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") [width, height, depth, colorType, interlace] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9], data[12]];
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (depth !== 8 || !channels || interlace) return { width, height };
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride), p = 0;
  const counts = new Map();
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0, b = prev[x], c = x >= channels ? prev[x - channels] : 0;
      let v = raw[p++];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    for (let i = 0; i < stride; i += channels) {
      const key = channels >= 3 ? (cur[i] << 16) | (cur[i + 1] << 8) | cur[i + 2] : cur[i] * 0x10101;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, distinctColors: counts.size };
}

async function exists(p) {
  return fs.stat(p).then(() => true, () => false);
}

// A manifest from capture.mjs, a hand-written one, or one read from the folders.
async function loadLabel(label) {
  const dir = path.join(outRoot, label);
  if (!(await exists(dir))) return null;
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
  } catch {
    const modeNames = (await fs.readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    modeNames.sort((a, b) => /forced/.test(a) - /forced/.test(b) || a.localeCompare(b));
    const shots = [];
    for (const mode of modeNames) {
      for (const f of (await fs.readdir(path.join(dir, mode))).filter((f) => f.endsWith(".png"))) {
        shots.push({ name: f.slice(0, -4), group: null, mode, file: `${label}/${mode}/${f}` });
      }
    }
    manifest = { label, modes: modeNames.map((name) => ({ name, forcedColors: /forced/.test(name) ? "active" : "none" })), shots };
  }
  manifest.modes ??= [...new Set(manifest.shots.map((s) => s.mode))].map((name) => ({ name, forcedColors: /forced/.test(name) ? "active" : "none" }));
  for (const shot of manifest.shots) {
    if (shot.error || !shot.file) continue;
    try {
      const buffer = await fs.readFile(path.join(outRoot, shot.file));
      shot.hash = crypto.createHash("sha1").update(buffer).digest("hex");
      shot.image = pngStats(buffer);
      shot.dataUri = `data:image/png;base64,${buffer.toString("base64")}`;
    } catch (error) {
      shot.error = `Screenshot file missing: ${shot.file}`;
    }
  }
  return manifest;
}

const manifests = {};
for (const label of ["before", "after"]) {
  const m = await loadLabel(label);
  if (m) manifests[label] = m;
}
const labels = Object.keys(manifests);
if (!labels.length) {
  console.error(`No screenshots under ${outRoot}/before or ${outRoot}/after`);
  process.exit(1);
}

const base = manifests[labels[0]];
const modes = base.modes;
const forcedModes = modes.filter((m) => m.forcedColors === "active").map((m) => m.name);
const normalMode = modes.find((m) => m.forcedColors !== "active")?.name;
const shotNames = [...new Set(base.shots.map((s) => s.name))];
const get = (label, mode, name) => manifests[label]?.shots.find((s) => s.mode === mode && s.name === name);

// Flags per label: shots that vanish, and states that merge, in forced colors.
const flags = [];
for (const label of labels) {
  for (const mode of forcedModes) {
    for (const name of shotNames) {
      const forced = get(label, mode, name);
      const normal = normalMode && get(label, normalMode, name);
      if (forced?.error) flags.push({ label, mode, shot: name, kind: "error", detail: forced.error });
      if (forced?.image?.distinctColors === 1 && normal?.image?.distinctColors > 1) {
        flags.push({ label, mode, shot: name, kind: "disappears", detail: "Only one color is left: nothing in this shot is visible" });
      }
    }
    const groups = new Map();
    for (const s of manifests[label].shots.filter((s) => s.mode === mode && s.group)) {
      groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
    }
    for (const [group, shots] of groups) {
      for (let i = 0; i < shots.length; i++) {
        for (let j = i + 1; j < shots.length; j++) {
          const a = shots[i], b = shots[j];
          const na = normalMode && get(label, normalMode, a.name), nb = normalMode && get(label, normalMode, b.name);
          if (a.hash && a.hash === b.hash && (!na || !nb || na.hash !== nb.hash)) {
            flags.push({ label, mode, shot: `${a.name} = ${b.name}`, group, kind: "states-merge", detail: `"${a.name}" and "${b.name}" are pixel-identical` });
          }
        }
      }
    }
  }
}
// Fixes for forced colors must not change normal mode.
if (manifests.before && manifests.after && normalMode) {
  for (const name of shotNames) {
    const b = get("before", normalMode, name), a = get("after", normalMode, name);
    if (b?.hash && a?.hash && b.hash !== a.hash) {
      flags.push({ label: "after", mode: normalMode, shot: name, kind: "normal-changed", detail: "Normal mode looks different after the fix: check it's intended" });
    }
  }
}

// Suspects found in several forced modes count once.
const suspects = (label, name) => {
  const all = forcedModes.flatMap((mode) => get(label, mode, name)?.scan ?? []);
  return [...new Map(all.map((f) => [`${f.kind}|${f.element}`, f])).values()];
};
const scanCount = (label, name) => suspects(label, name).filter((f) => f.severity !== "info" && f.kind !== "error").length;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function cell(label, mode, name) {
  const s = get(label, mode, name);
  if (!s) return "<td>Not captured</td>";
  if (s.error) return `<td><strong>Error:</strong> ${esc(s.error)}</td>`;
  const scale = manifests[label].deviceScaleFactor ?? 1;
  const width = s.image?.width ? ` width="${Math.round(s.image.width / scale)}"` : "";
  return `<td><img src="${s.dataUri}"${width} alt="${esc(`${name}, ${mode}, ${label}`)}"></td>`;
}

function scanList(label, name) {
  const items = suspects(label, name);
  if (!items.length) return "";
  return `<details><summary>Scan suspects, ${esc(label)} (${items.length})</summary><ul>${items
    .map((f) => `<li><strong>${esc(f.severity)}</strong> ${esc(f.kind)}: <code>${esc(f.element)}</code>. ${esc(f.detail)}</li>`)
    .join("")}</ul></details>`;
}

const sections = shotNames
  .map((name, index) => {
    const group = base.shots.find((s) => s.name === name)?.group;
    const shotFlags = flags.filter((f) => f.shot === name || f.shot.split(" = ").includes(name));
    return `<section aria-labelledby="shot-${index}">
  <h3 id="shot-${index}">${esc(name)}${group ? ` <span class="group">(${esc(group)})</span>` : ""}</h3>
  <table>
    <caption>${esc(name)} per mode${labels.length > 1 ? ", before and after" : ""}</caption>
    <thead><tr><th scope="col">Mode</th>${labels.map((l) => `<th scope="col">${esc(l)}</th>`).join("")}</tr></thead>
    <tbody>${modes.map((m) => `<tr><th scope="row">${esc(m.name)}</th>${labels.map((l) => cell(l, m.name, name)).join("")}</tr>`).join("")}</tbody>
  </table>
  ${shotFlags.length ? `<ul>${shotFlags.map((f) => `<li><strong>${esc(f.label)}, ${esc(f.mode)}:</strong> ${esc(f.kind)}. ${esc(f.detail)}</li>`).join("")}</ul>` : ""}
  ${labels.map((l) => scanList(l, name)).join("")}
</section>`;
  })
  .join("\n");

const counts = labels
  .map((l) => `<tr><th scope="row">${esc(l)}</th><td>${flags.filter((f) => f.label === l && f.kind !== "normal-changed").length}</td><td>${shotNames.reduce((n, s) => n + scanCount(l, s), 0)}</td></tr>`)
  .join("");
const changedNormal = flags.filter((f) => f.kind === "normal-changed").map((f) => esc(f.shot));
const summary = summaryFile ? await fs.readFile(summaryFile, "utf8") : "";
const heading = `Forced colors report${title ? `: ${title}` : ""}`;
const date = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(heading)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; padding: 16px; max-width: 1400px; background: Canvas; color: CanvasText; }
  table { border-collapse: collapse; margin-block: 8px 16px; }
  caption { text-align: start; font-weight: 600; padding-block: 4px; }
  th, td { border: 1px solid GrayText; padding: 8px; text-align: start; vertical-align: top; }
  td img { max-width: 100%; height: auto; display: block; outline: 1px dashed GrayText; outline-offset: 2px; }
  .group { font-weight: normal; }
  section { border-top: 1px solid GrayText; margin-top: 24px; overflow-x: auto; }
</style>
</head>
<body>
<main>
<h1>${esc(heading)}</h1>
<p>${date}. Captured with ${esc(base.browser ?? "an unrecorded browser")}. Modes: ${modes.map((m) => esc(m.name)).join(", ")}. Emulated palettes differ from real Windows contrast themes.</p>
${summary}
<h2>Automatic checks</h2>
<table>
  <caption>Flags and scan suspects per capture</caption>
  <thead><tr><th scope="col">Capture</th><th scope="col">Flags</th><th scope="col">Scan suspects (not info)</th></tr></thead>
  <tbody>${counts}</tbody>
</table>
${changedNormal.length ? `<p><strong>Normal mode changed</strong> in: ${changedNormal.join(", ")}.</p>` : ""}
<h2>Screenshots</h2>
${sections}
</main>
</body>
</html>
`;

await fs.mkdir(path.dirname(path.resolve(reportFile)), { recursive: true });
await fs.writeFile(reportFile, html);

if (json) console.log(JSON.stringify(flags, null, 2));
else {
  for (const f of flags) console.log(`[${f.label}] ${f.mode} ${f.shot}: ${f.kind}. ${f.detail}`);
  for (const l of labels) {
    for (const name of shotNames) {
      const n = scanCount(l, name);
      if (n) console.log(`[${l}] ${name}: ${n} scan suspect(s), listed in the report`);
    }
  }
  console.log(`Wrote ${reportFile} (${Math.round(html.length / 1024)} KB)`);
}
