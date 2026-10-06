// Forced colors suspect scanner. Runs inside a page that has forced colors active
// (emulated or a real Windows contrast theme). capture.mjs runs it for every forced
// mode; you can also paste it into any browser console or page-JavaScript tool and
// call forcedColorsScan("#root") yourself.
//
// It reports suspects, not verdicts: confirm each one in a screenshot.
function forcedColorsScan(rootSelector) {
  const root = rootSelector ? document.querySelector(rootSelector) : document.body;
  if (!root) return [{ kind: "error", severity: "error", element: rootSelector, detail: "Root element not found" }];
  if (!matchMedia("(forced-colors: active)").matches) {
    return [{ kind: "error", severity: "error", element: "document", detail: "forced-colors is not active on this page, so nothing was scanned" }];
  }

  // Resolve the theme's system colors. Author-written system colors are never forced,
  // so a probe with color: Highlight computes to the theme's Highlight.
  const SYSTEM = ["Canvas", "CanvasText", "LinkText", "VisitedText", "ActiveText", "ButtonFace", "ButtonText",
    "ButtonBorder", "Field", "FieldText", "Highlight", "HighlightText", "SelectedItem", "SelectedItemText",
    "Mark", "MarkText", "GrayText", "AccentColor", "AccentColorText"];
  const probe = document.createElement("span");
  document.body.append(probe);
  const systemByRgb = new Map();
  for (const name of SYSTEM) {
    probe.style.color = "";
    probe.style.color = name;
    if (!probe.style.color) continue; // keyword not supported by this browser
    const rgb = toRgb(getComputedStyle(probe).color);
    if (rgb && !systemByRgb.has(rgb)) systemByRgb.set(rgb, name);
  }
  probe.remove();

  function parse(c) {
    const m = /rgba?\(([^)]+)\)/.exec(c || "");
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function toRgb(c) {
    const p = parse(c);
    return p ? `${p.r},${p.g},${p.b}` : null;
  }
  function alpha(c) {
    const p = parse(c);
    return p ? p.a : 1;
  }
  function systemName(c) {
    return systemByRgb.get(toRgb(c)) || null;
  }
  function describe(el) {
    const part = (n) => {
      let s = n.tagName.toLowerCase();
      if (n.id) s += "#" + n.id;
      const cls = (n.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      const role = n.getAttribute("role");
      if (role) s += `[role=${role}]`;
      return s;
    };
    const parts = [];
    for (let n = el; n && n !== document.body && parts.length < 3; n = n.parentElement) parts.unshift(part(n));
    return parts.join(" > ");
  }
  function visible(el, cs) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  }
  function hasOwnText(el) {
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  }
  function hasBorder(cs) {
    return ["Top", "Right", "Bottom", "Left"].some(
      (s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== "none" && cs[`border${s}Style`] !== "hidden"
    );
  }
  function hasOutline(cs) {
    return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
  }
  function backgroundBehind(el) {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (alpha(bg) > 0) return bg;
    }
    return getComputedStyle(document.documentElement).backgroundColor;
  }

  const findings = [];
  const add = (kind, severity, el, detail) => findings.push({ kind, severity, element: describe(el), detail });
  const NATIVE = { button: "button", link: "a", checkbox: "input", radio: "input", switch: "input", textbox: "input" };
  const MEDIA = new Set(["img", "svg", "video", "canvas", "picture", "iframe", "input", "select", "textarea", "progress", "meter"]);

  for (const el of [root, ...root.querySelectorAll("*")]) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    const tag = el.tagName.toLowerCase();
    const fca = cs.forcedColorAdjust;
    const parentFca = el.parentElement ? getComputedStyle(el.parentElement).forcedColorAdjust : "auto";
    const isSvgRoot = el instanceof SVGSVGElement;
    const inSvg = el instanceof SVGElement;

    // 1. Opted out of forced colors: every color in the subtree must be a system color.
    if (fca === "none") {
      if (parentFca !== "none") add("opt-out", "info", el, "forced-color-adjust: none starts here; every color below must be a system color");
      const checks = [];
      if (hasOwnText(el)) checks.push(["color", cs.color]);
      if (alpha(cs.backgroundColor) > 0) checks.push(["background-color", cs.backgroundColor]);
      if (hasBorder(cs)) checks.push(["border-color", cs.borderTopColor]);
      if (hasOutline(cs)) checks.push(["outline-color", cs.outlineColor]);
      if (inSvg && !isSvgRoot) {
        if (cs.fill && cs.fill !== "none" && !cs.fill.startsWith("url")) checks.push(["fill", cs.fill]);
        if (cs.stroke && cs.stroke !== "none" && !cs.stroke.startsWith("url")) checks.push(["stroke", cs.stroke]);
      }
      for (const [prop, value] of checks) {
        if (alpha(value) > 0 && !systemName(value)) add("brand-color-under-opt-out", "high", el, `${prop} is ${value}, not a system color, under forced-color-adjust: none`);
      }
      // none also keeps what auto would remove: shadows and gradients.
      if (cs.boxShadow !== "none") add("decoration-under-opt-out", "medium", el, `box-shadow is kept under forced-color-adjust: none (${cs.boxShadow})`);
      if (cs.textShadow !== "none") add("decoration-under-opt-out", "medium", el, "text-shadow is kept under forced-color-adjust: none");
      if (/gradient\(/.test(cs.backgroundImage)) add("decoration-under-opt-out", "medium", el, "a gradient background-image is kept under forced-color-adjust: none");
    }

    // 2. Icons: explicit fill/stroke, or an svg with its own color, keep author colors.
    if (fca === "preserve-parent-color" || (inSvg && fca !== "none")) {
      if (isSvgRoot && el.parentElement && cs.color !== getComputedStyle(el.parentElement).color && !systemName(cs.color)) {
        add("icon-own-color", "medium", el, `svg sets its own color (${cs.color}), so currentColor keeps the author color instead of the forced text color`);
      }
      if (!isSvgRoot && el instanceof SVGGeometryElement) {
        for (const prop of ["fill", "stroke"]) {
          const v = cs[prop];
          if (!v || v === "none" || v.startsWith("url") || alpha(v) === 0) continue;
          if (toRgb(v) !== toRgb(cs.color) && !systemName(v)) add("icon-explicit-color", "medium", el, `${prop} is ${v}, an explicit color that forced colors keeps`);
        }
      }
    }
    if (fca !== "auto") continue;

    // 3. Mask-image icons are painted with background-color, which becomes the background.
    const mask = cs.maskImage || cs.webkitMaskImage;
    if (mask && mask !== "none") {
      add("mask-icon", "high", el, "mask-image is painted with background-color, which forced colors turns into the background: the icon disappears");
    }

    // 4. Background-only shapes (thumbs, dots, bars, dividers) become the background.
    const leaf = el.children.length === 0 && !hasOwnText(el) && !MEDIA.has(tag) && !inSvg;
    if (leaf && alpha(cs.backgroundColor) > 0 && !hasBorder(cs) && !hasOutline(cs) && toRgb(cs.backgroundColor) === toRgb(backgroundBehind(el))) {
      add("invisible-shape", "high", el, "a shape drawn only with background-color now has the same color as what's behind it");
    }
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === "none" || ps.content === "normal") continue;
      if (alpha(ps.backgroundColor) > 0 && !hasBorder(ps) && !hasOutline(ps) && (ps.content === '""' || ps.content === "''")) {
        add("pseudo-shape", "medium", el, `${pseudo} draws an empty shape with background-color only; check it in the screenshot`);
      }
    }

    // 5. Dimmed content: opacity is kept, so GrayText or theme colors get dimmer still.
    // opacity 0 is a deliberately invisible element (for example a native input under a custom visual).
    const opacity = parseFloat(cs.opacity);
    if (opacity > 0 && opacity < 1 && (hasOwnText(el) || el.matches("button, a, input, [role]"))) {
      add("dimmed", "medium", el, `opacity ${cs.opacity} is not forced; disabled content should use GrayText at full opacity`);
    }

    // 6. Disabled without GrayText.
    if (el.matches(':disabled, [aria-disabled="true"]') && hasOwnText(el) && systemName(cs.color) !== "GrayText") {
      add("disabled-not-graytext", "low", el, `disabled but its text is ${systemName(cs.color) || cs.color}, not GrayText`);
    }

    // 7. ARIA widgets on generic elements get CanvasText, not the native control colors.
    const role = el.getAttribute("role");
    if (role && NATIVE[role] && tag !== NATIVE[role] && !hasBorder(cs) && role !== "link") {
      add("aria-widget-unstyled", "medium", el, `role=${role} on a <${tag}> gets plain text colors and no border in forced colors, so it may not look like a control`);
    }

    // 8. Background images are kept as authored and may clash with the theme.
    if (cs.backgroundImage.includes("url(") && hasOwnText(el)) {
      add("url-background", "low", el, "text over a url() background image: it gets a backplate, check the image still makes sense");
    }
  }

  const seen = new Set();
  return findings.filter((f) => {
    const key = f.kind + "|" + f.element;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
