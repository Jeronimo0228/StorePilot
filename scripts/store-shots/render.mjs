#!/usr/bin/env node
// StorePilot store-shots — compone capturas de tienda: captura cruda → marco de dispositivo → fondo de marca + titular.
// Uso: node scripts/store-shots/render.mjs <config.json> [--only ios|ipad|android|feature] [--slides 01,02]
// El config define marca (colores, fuentes, logo), textos por idioma y qué captura va en cada diapositiva.
// Salida: PNG RGB sin transparencia (App Store y Play rechazan alfa) en <out>/<target>/<locale>/NN.png
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const cfgPath = path.resolve(args[0] || "");
if (!args[0] || !fs.existsSync(cfgPath)) {
  console.error("Uso: render.mjs <config.json> [--only ios|ipad|android|feature] [--slides 01,02]");
  process.exit(1);
}
const flag = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
const onlyTargets = flag("--only")?.split(",");
const onlySlides = flag("--slides")?.split(",");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const root = path.dirname(cfgPath);
const abs = (p) => (path.isAbsolute(p) ? p : path.join(root, p));
const fileUrl = (p) => "file://" + abs(p);

// Lienzos de tienda (px). iPhone 6.9" e iPad 13" cubren todos los tamaños menores en App Store Connect.
const TARGETS = {
  ios: { w: 1320, h: 2868, device: "iphone", raw: "phone" },
  ipad: { w: 2064, h: 2752, device: "ipad", raw: "tablet" },
  android: { w: 1080, h: 1920, device: "pixel", raw: "phone" },
};

// Geometría de dispositivos relativa al ancho de pantalla visible (screenW).
// statusPt/rawW: alto de la barra de estado respecto al ancho CSS de la captura cruda.
const DEVICES = {
  iphone: { bezel: 0.034, radius: 0.165, screenRadius: 0.13, statusRatio: 62 / 440, frame: "titanium" },
  pixel: { bezel: 0.03, radius: 0.12, screenRadius: 0.095, statusRatio: 40 / 440, frame: "aluminium" },
  ipad: { bezel: 0.036, radius: 0.05, screenRadius: 0.032, statusRatio: 24 / 1032, frame: "space" },
};

const B = cfg.brand;
const FONT_CACHE = path.join(process.env.HOME || "/tmp", ".cache", "storepilot", "fonts");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
// Descarga el CSS de Google Fonts y sus woff2 a la caché; devuelve el CSS con rutas file:// (render determinista).
async function localFontCss(query) {
  fs.mkdirSync(FONT_CACHE, { recursive: true });
  const key = path.join(FONT_CACHE, Buffer.from(query).toString("base64url").slice(0, 80) + ".css");
  if (fs.existsSync(key)) return fs.readFileSync(key, "utf8");
  let css = await (await fetch(`https://fonts.googleapis.com/css2?${query}&display=block`, { headers: { "User-Agent": UA } })).text();
  for (const url of [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])]) {
    const local = path.join(FONT_CACHE, url.split("/").slice(-2).join("-"));
    if (!fs.existsSync(local)) fs.writeFileSync(local, Buffer.from(await (await fetch(url)).arrayBuffer()));
    css = css.split(url).join("file://" + local);
  }
  fs.writeFileSync(key, css);
  return css;
}
const FONT_CSS = [
  await localFontCss(`family=${encodeURIComponent(B.headFont)}${B.headWeight ? `:wght@${B.headWeight}` : ""}`),
  await localFontCss(`family=${encodeURIComponent(B.bodyFont)}:wght@500;600;700;800`),
  await localFontCss("family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,500,1,0"),
].join("\n");
// rgba() desde un color de marca #rrggbb.
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function statusBar(device, dark) {
  const c = dark ? "#fff" : "#0b0b0b";
  const sig = `<svg viewBox="0 0 18 12" width="1.15em" height="0.78em"><g fill="${c}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></g></svg>`;
  const wifi = `<svg viewBox="0 0 16 12" width="1.05em" height="0.8em"><path fill="${c}" d="M8 2.4c2.3 0 4.4.9 6 2.4l1.3-1.4C13.3 1.5 10.8.4 8 .4S2.7 1.5.7 3.4L2 4.8c1.6-1.5 3.7-2.4 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.3-1.4C11.5 4.8 9.8 4 8 4s-3.5.8-4.7 1.9l1.3 1.4C5.5 6.5 6.7 6 8 6zm0 3.6c.6 0 1.1.2 1.5.6L8 11.8 6.5 10.2c.4-.4.9-.6 1.5-.6z"/></svg>`;
  const batt = `<svg viewBox="0 0 27 13" width="1.7em" height="0.82em"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="${c}" stroke-opacity=".4"/><rect x="2" y="2" width="18" height="9" rx="2" fill="${c}"/><rect x="24.6" y="4.2" width="1.6" height="4.6" rx=".8" fill="${c}" fill-opacity=".45"/></svg>`;
  if (device === "pixel") {
    return `<div class="sb sb-android" style="color:${c}"><span>9:30</span><span class="sb-ic">${wifi}${sig}<svg viewBox="0 0 12 20" width=".62em" height="1.05em"><rect x="1" y="2" width="10" height="17" rx="2" fill="${c}"/><rect x="4" y="0" width="4" height="2" rx="1" fill="${c}"/></svg></span></div>`;
  }
  if (device === "ipad") {
    return `<div class="sb sb-ipad" style="color:${c}"><span>9:41&nbsp;&nbsp;${esc(cfg.ipadDate || "Fri Oct 3")}</span><span class="sb-ic">${wifi}<span style="font-size:.85em">100%</span>${batt}</span></div>`;
  }
  return `<div class="sb sb-ios" style="color:${c}"><span class="sb-time">9:41</span><span class="sb-ic">${sig}${wifi}${batt}</span></div>`;
}

// Marco del dispositivo con la captura dentro. width = ancho total del cuerpo en px del lienzo.
function deviceHtml(kind, rawFile, width, screenDark) {
  const g = DEVICES[kind];
  const bez = Math.round(width * g.bezel);
  const screenW = width - 2 * bez;
  const statusH = Math.round(screenW * g.statusRatio);
  const ratio = cfg.rawAspect?.[kind === "ipad" ? "tablet" : "phone"]; // alto/ancho de la captura cruda
  const appH = Math.round(screenW * ratio);
  const screenH = statusH + appH;
  const height = screenH + 2 * bez;
  const R = Math.round(width * g.radius), SR = Math.round(width * g.screenRadius);
  const frames = {
    titanium: "linear-gradient(135deg,#6d6a66 0%,#2b2a28 18%,#8d8984 38%,#3a3936 62%,#a39f99 82%,#45433f 100%)",
    aluminium: "linear-gradient(160deg,#3c3f44 0%,#16181b 30%,#5a5e64 55%,#1c1e21 80%,#4a4e53 100%)",
    space: "linear-gradient(135deg,#5b5e63 0%,#202225 25%,#6c7076 55%,#24262a 80%,#55595e 100%)",
  };
  const island = kind === "iphone"
    ? `<div class="island" style="width:${Math.round(screenW * 0.286)}px;height:${Math.round(screenW * 0.084)}px;top:${Math.round(screenW * 0.026)}px"></div>` : "";
  const hole = kind === "pixel"
    ? `<div class="hole" style="width:${Math.round(screenW * 0.036)}px;height:${Math.round(screenW * 0.036)}px;top:${Math.round(statusH / 2 - screenW * 0.018)}px"></div>` : "";
  const sideBtns = kind === "iphone"
    ? `<i class="btn" style="left:-${Math.round(width * 0.008)}px;top:${Math.round(height * 0.18)}px;height:${Math.round(height * 0.035)}px"></i><i class="btn" style="left:-${Math.round(width * 0.008)}px;top:${Math.round(height * 0.24)}px;height:${Math.round(height * 0.065)}px"></i><i class="btn" style="left:-${Math.round(width * 0.008)}px;top:${Math.round(height * 0.32)}px;height:${Math.round(height * 0.065)}px"></i><i class="btn" style="right:-${Math.round(width * 0.008)}px;top:${Math.round(height * 0.27)}px;height:${Math.round(height * 0.1)}px"></i>`
    : kind === "pixel"
      ? `<i class="btn" style="right:-${Math.round(width * 0.007)}px;top:${Math.round(height * 0.2)}px;height:${Math.round(height * 0.06)}px"></i><i class="btn" style="right:-${Math.round(width * 0.007)}px;top:${Math.round(height * 0.3)}px;height:${Math.round(height * 0.11)}px"></i>` : "";
  const fs_ = Math.round(statusH * (kind === "ipad" ? 0.55 : 0.36));
  const statusBg = screenDark ? cfg.screenBg?.dark || "#000" : cfg.screenBg?.light || "#fff";
  return {
    width, height,
    html: `<div class="device ${kind}" style="width:${width}px;height:${height}px;border-radius:${R}px;background:${frames[g.frame]};padding:${bez}px">
      ${sideBtns}
      <div class="inner" style="border-radius:${R - Math.round(bez * 0.35)}px;inset:${Math.round(bez * 0.35)}px"></div>
      <div class="screen" style="width:${screenW}px;height:${screenH}px;border-radius:${SR}px;background:${statusBg}">
        <div class="sbwrap" style="height:${statusH}px;font-size:${fs_}px">${statusBar(kind, screenDark)}</div>
        <img src="${fileUrl(rawFile)}" style="width:${screenW}px;height:${appH}px;margin-top:${statusH}px">
        ${island}${hole}
        ${kind === "iphone" || kind === "ipad" ? `<div class="homebar" style="width:${Math.round(screenW * (kind === "ipad" ? 0.2 : 0.34))}px;height:${Math.max(6, Math.round(screenW * 0.012))}px;background:${screenDark ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.8)"}"></div>` : `<div class="homebar" style="width:${Math.round(screenW * 0.26)}px;height:${Math.max(5, Math.round(screenW * 0.01))}px;background:${screenDark ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.6)"}"></div>`}
        <div class="glare" style="border-radius:${SR}px"></div>
      </div>
    </div>`,
  };
}

function background(variant, W, H) {
  const g = B.primary, dark = B.dark || "#050505";
  const grid = `background-image:linear-gradient(${B.gridColor || hexA(B.primary, 0.07)} 1px,transparent 1px),linear-gradient(90deg,${B.gridColor || hexA(B.primary, 0.07)} 1px,transparent 1px);background-size:${Math.round(W / 12)}px ${Math.round(W / 12)}px;`;
  if (variant === "primary") {
    return `<div class="bg" style="background:radial-gradient(120% 70% at 85% 10%,${B.primaryLight || g} 0%,${g} 38%,${B.primaryDeep || g} 100%)"></div>
      <div class="bg" style="${grid}opacity:.35;mask-image:linear-gradient(to bottom,#000,transparent 70%)"></div>
      <div class="orb" style="width:${W * 0.9}px;height:${W * 0.9}px;left:${-W * 0.35}px;top:${H * 0.55}px;background:rgba(0,0,0,.28)"></div>`;
  }
  if (variant === "light") {
    return `<div class="bg" style="background:linear-gradient(180deg,${(B.lightBg || ["#ffffff", "#f1f7f0", "#e3f3e1"]).map((c, i, a) => `${c} ${Math.round((i / (a.length - 1)) * 100)}%`).join(",")})"></div>
      <div class="bg" style="${grid.split(B.gridColor || hexA(B.primary, 0.07)).join(hexA(B.primaryText || B.primary, 0.08))}mask-image:linear-gradient(to bottom,#000,transparent 75%)"></div>
      <div class="orb" style="width:${W * 1.1}px;height:${W * 1.1}px;right:${-W * 0.45}px;top:${H * 0.3}px;background:radial-gradient(circle,${g}55,transparent 65%)"></div>`;
  }
  // dark (por defecto): negro con resplandores de marca y retícula que se desvanece
  return `<div class="bg" style="background:${dark}"></div>
    <div class="orb" style="width:${W * 1.25}px;height:${W * 1.25}px;left:${-W * 0.55}px;top:${-W * 0.5}px;background:radial-gradient(circle,${g}40,transparent 62%)"></div>
    <div class="orb" style="width:${W * 1.4}px;height:${W * 1.4}px;right:${-W * 0.6}px;top:${H * 0.42}px;background:radial-gradient(circle,${g}38,transparent 60%)"></div>
    <div class="bg" style="${grid}mask-image:radial-gradient(ellipse at 50% 30%,#000 10%,transparent 70%)"></div>
    <div class="streak" style="width:${W * 2}px;height:${Math.round(W * 0.16)}px;left:${-W * 0.5}px;top:${H * 0.62}px;background:linear-gradient(90deg,transparent,${g}22,transparent)"></div>`;
}

function slideHtml(target, slide, locale) {
  const T = TARGETS[target];
  const W = T.w, H = T.h;
  const tablet = target === "ipad";
  const variant = slide.variant || "dark";
  const onDark = variant === "dark";
  const text = slide.text[locale] || slide.text[cfg.locales[0]];
  const rawFile = `${cfg.raw}/${T.raw}-${cfg.rawLocale?.[locale] || locale}-${slide.raw}.png`;
  const layout = tablet ? "tablet" : slide.layout || "rise";
  const devW = Math.round(W * (tablet ? 0.8 : layout === "tilt" ? 0.74 : 0.8));
  const dev = deviceHtml(T.device, rawFile, devW, slide.screen !== "light");
  const capTop = Math.round(H * (tablet ? 0.06 : 0.065));
  const devTop = Math.round(H * (tablet ? 0.27 : target === "android" ? 0.3 : 0.29));
  const left = Math.round((W - devW) / 2) + (layout === "tilt" ? Math.round(W * (slide.tiltSide === "left" ? -0.04 : 0.04)) : 0);
  const rot = layout === "tilt" ? (slide.tiltSide === "left" ? 5 : -5) : 0;
  const headSize = Math.round(W * (tablet ? 0.058 : target === "android" ? 0.082 : 0.083));
  const ink = onDark ? "#ffffff" : variant === "primary" ? B.primaryInk || "#0b0d0b" : "#0b0d0b";
  const kickerColor = variant === "primary" ? B.primaryKicker || "#062b06" : variant === "light" ? B.primaryText || B.primary : B.primaryOnDark || B.primary;
  const subColor = onDark ? "rgba(255,255,255,.72)" : variant === "primary" ? (B.primaryInk === "#ffffff" ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.72)") : B.lightSub || "#3f463f";
  const badge = slide.badge ? (slide.badge[locale] || slide.badge[cfg.locales[0]]) : null;
  const bw = Math.round(W * (tablet ? 0.26 : 0.46));
  const badgeHtml = badge ? `<div class="badge" style="font-size:${Math.round(W * (tablet ? 0.017 : 0.032))}px;${slide.badgeSide === "left" ? `left:${Math.round(W * 0.05)}px` : `right:${Math.round(W * 0.05)}px`};top:${Math.round(devTop + dev.height * (slide.badgeY || 0.42))}px;max-width:${bw}px">
      <span class="material-symbols-rounded" style="color:${B.primary}">${esc(slide.badgeIcon || "check_circle")}</span><span>${esc(badge)}</span></div>` : "";
  const logo = cfg.logo?.[onDark ? "onDark" : "onLight"];
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${FONT_CSS}</style>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}
.stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:'${B.bodyFont}',system-ui,sans-serif}
.bg{position:absolute;inset:0}
.orb{position:absolute;border-radius:50%;filter:blur(${Math.round(W * 0.02)}px)}
.streak{position:absolute;transform:rotate(-14deg);filter:blur(${Math.round(W * 0.03)}px)}
.cap{position:absolute;left:${Math.round(W * 0.07)}px;right:${Math.round(W * 0.07)}px;top:${capTop}px;text-align:center;z-index:5}
.kicker{display:inline-flex;align-items:center;gap:.5em;font-weight:800;letter-spacing:.18em;text-transform:uppercase;font-size:${Math.round(W * (tablet ? 0.014 : 0.026))}px;color:${kickerColor};padding:.55em 1.1em;border-radius:999px;border:2px solid ${variant === "dark" ? B.primary + "66" : "rgba(0,0,0,.18)"};background:${variant === "dark" ? hexA(B.primary, 0.08) : "rgba(255,255,255,.35)"}}
.kicker img{height:1.5em}
h1{font-family:'${B.headFont}',sans-serif;font-weight:${B.headWeight || 400};color:${ink};font-size:${headSize}px;line-height:1.04;margin-top:${Math.round(headSize * 0.32)}px;letter-spacing:-.01em;text-wrap:balance}
h1 em{font-style:normal;color:${variant === "dark" ? B.primaryOnDark || B.primary : variant === "light" ? B.primaryText || B.primary : B.primaryEm || "#000"}}
.sub{margin-top:${Math.round(headSize * 0.3)}px;font-size:${Math.round(W * (tablet ? 0.021 : 0.037))}px;font-weight:600;color:${subColor};line-height:1.3;text-wrap:balance}
.devwrap{position:absolute;left:${left}px;top:${devTop}px;transform:rotate(${rot}deg);transform-origin:50% 30%;z-index:3;filter:drop-shadow(0 ${Math.round(W * 0.04)}px ${Math.round(W * 0.06)}px rgba(0,0,0,${onDark ? 0.65 : 0.35}))}
.device{position:relative}
.device .inner{position:absolute;background:#050505}
.device .btn{position:absolute;width:${Math.max(4, Math.round(devW * 0.012))}px;border-radius:3px;background:linear-gradient(90deg,#4a4845,#8d8984,#3a3936)}
.screen{position:relative;overflow:hidden;z-index:1}
.screen img{display:block}
.sbwrap{position:absolute;inset:0 0 auto 0;z-index:2}
.sb{height:100%;display:flex;align-items:center;justify-content:space-between;font-family:-apple-system,'SF Pro Text','${B.bodyFont}',sans-serif;font-weight:700}
.sb-ios{padding:0 8.5% 0 11%}.sb-ios .sb-time{font-size:1.05em}
.sb-android{padding:0 6%;font-weight:600}.sb-ipad{padding:0 3%;font-weight:600}
.sb-ic{display:flex;align-items:center;gap:.35em}
.island{position:absolute;left:50%;transform:translateX(-50%);background:#000;border-radius:999px;z-index:3}
.hole{position:absolute;left:50%;transform:translateX(-50%);background:#000;border-radius:50%;z-index:3;box-shadow:0 0 0 2px #111}
.homebar{position:absolute;left:50%;bottom:${Math.round(devW * 0.014)}px;transform:translateX(-50%);border-radius:999px;z-index:3}
.glare{position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.07) 0%,rgba(255,255,255,0) 32%);pointer-events:none;z-index:4}
.badge{position:absolute;z-index:6;display:flex;align-items:center;gap:.55em;padding:.75em 1.05em;border-radius:${Math.round(W * 0.03)}px;background:${onDark ? B.badgeDark || "rgba(18,22,18,.86)" : "rgba(255,255,255,.92)"};color:${onDark ? "#fff" : "#0b0d0b"};font-weight:800;line-height:1.15;border:2px solid ${onDark ? hexA(B.primary, 0.45) : hexA(B.primaryText || B.primary, 0.25)};box-shadow:0 ${Math.round(W * 0.02)}px ${Math.round(W * 0.05)}px rgba(0,0,0,.45);backdrop-filter:blur(10px)}
.badge .material-symbols-rounded{font-size:1.55em}
</style></head><body><div class="stage">
${background(variant, W, H)}
<div class="cap">
  ${text.kicker ? `<div class="kicker">${logo ? `<img src="${fileUrl(logo)}">` : ""}${esc(text.kicker)}</div>` : ""}
  <h1>${esc(text.title).replace(/\*(.+?)\*/g, "<em>$1</em>")}</h1>
  ${text.sub ? `<p class="sub">${esc(text.sub)}</p>` : ""}
</div>
<div class="devwrap">${dev.html}</div>
${badgeHtml}
</div></body></html>`;
}

function featureHtml(locale) {
  const W = 1024, H = 500, f = cfg.feature;
  const text = f.text[locale] || f.text[cfg.locales[0]];
  const d1 = deviceHtml("pixel", `${cfg.raw}/phone-${cfg.rawLocale?.[locale] || locale}-${f.raws[0]}.png`, 230, true);
  const d2 = deviceHtml("pixel", `${cfg.raw}/phone-${cfg.rawLocale?.[locale] || locale}-${f.raws[1]}.png`, 230, true);
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${FONT_CSS}</style>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden}
.stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:'${B.bodyFont}',sans-serif}
.bg{position:absolute;inset:0}.orb{position:absolute;border-radius:50%;filter:blur(20px)}.streak{position:absolute;transform:rotate(-14deg);filter:blur(30px)}
.copy{position:absolute;left:64px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center;gap:18px;z-index:5}
.copy img{height:64px;width:auto;align-self:flex-start}
h1{font-family:'${B.headFont}',sans-serif;font-weight:${B.headWeight || 400};color:#fff;font-size:54px;line-height:1.02}h1 em{font-style:normal;color:${B.primary}}
p{color:rgba(255,255,255,.75);font-size:21px;font-weight:600;line-height:1.3}
.d{position:absolute;filter:drop-shadow(0 20px 30px rgba(0,0,0,.6))}
.device{position:relative}.device .inner{position:absolute;background:#050505}.device .btn{position:absolute;width:3px;border-radius:2px;background:#666}
.screen{position:relative;overflow:hidden;z-index:1}.screen img{display:block}.sbwrap{position:absolute;inset:0 0 auto 0;z-index:2}
.sb{height:100%;display:flex;align-items:center;justify-content:space-between;font-weight:700}.sb-android{padding:0 6%}.sb-ic{display:flex;gap:.3em;align-items:center}
.hole{position:absolute;left:50%;transform:translateX(-50%);background:#000;border-radius:50%;z-index:3}.homebar{position:absolute;left:50%;bottom:3px;transform:translateX(-50%);border-radius:999px;z-index:3}.glare{position:absolute;inset:0;z-index:4;background:linear-gradient(115deg,rgba(255,255,255,.07),transparent 32%)}
</style></head><body><div class="stage">${background("dark", W, H)}
<div class="copy">${cfg.logo?.onDark ? `<img src="${fileUrl(cfg.logo.onDark)}">` : ""}<h1>${esc(text.title).replace(/\*(.+?)\*/g, "<em>$1</em>")}</h1><p>${esc(text.sub)}</p></div>
<div class="d" style="left:600px;top:70px;transform:rotate(-8deg)">${d1.html}</div>
<div class="d" style="left:790px;top:40px;transform:rotate(6deg)">${d2.html}</div>
</div></body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome" });
const out = abs(cfg.out || "out");
let n = 0;
async function render(html, W, H, file) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // Como archivo (no setContent): así la página puede cargar las capturas y logos locales (file://).
  const htmlFile = file.replace(/\.png$/, ".html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(htmlFile, html);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto("file://" + htmlFile, { waitUntil: "networkidle" });
    const ok = await page.evaluate(async ([head, body, hw]) => {
      await Promise.all([`${hw} 40px "${head}"`, `600 40px "${body}"`, `800 40px "${body}"`, '24px "Material Symbols Rounded"'].map((f) => document.fonts.load(f, "AaÁá check_circle")));
      await document.fonts.ready;
      await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
      const fams = new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")));
      return fams.has(head) && fams.has(body) && [...document.images].every((im) => im.naturalWidth > 0);
    }, [B.headFont, B.bodyFont, B.headWeight || 400]);
    if (ok) break;
    if (attempt === 3) throw new Error(`Fuentes o imágenes sin cargar en ${file}`);
  }
  await page.waitForTimeout(200);
  fs.unlinkSync(htmlFile);
  await page.screenshot({ path: file, type: "png", omitBackground: false });
  await page.close();
  // Sin canal alfa: App Store Connect y Play rechazan imágenes con transparencia.
  execFileSync("python3", ["-c", "import sys;from PIL import Image;f=sys.argv[1];Image.open(f).convert('RGB').save(f,optimize=True)", file]);
  n++;
}
for (const target of Object.keys(TARGETS)) {
  if (onlyTargets && !onlyTargets.includes(target)) continue;
  const order = cfg.targets[target];
  if (!order) continue;
  for (const locale of cfg.locales) {
    for (const [i, id] of order.entries()) {
      if (onlySlides && !onlySlides.includes(id)) continue;
      const slide = cfg.slides.find((s) => s.id === id);
      const file = path.join(out, target, locale, `${String(i + 1).padStart(2, "0")}-${id}.png`);
      await render(slideHtml(target, slide, locale), TARGETS[target].w, TARGETS[target].h, file);
    }
  }
}
if (cfg.feature && (!onlyTargets || onlyTargets.includes("feature"))) {
  for (const locale of cfg.locales) await render(featureHtml(locale), 1024, 500, path.join(out, "feature", `${locale}.png`));
}
await browser.close();
console.log(`store-shots: ${n} imágenes en ${out}`);
