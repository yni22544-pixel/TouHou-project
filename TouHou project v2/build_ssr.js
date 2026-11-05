// build_ssr.js —— 把各页内容预渲染进 東方Project.html（构建期 SSR）
// 用法：NODE_PATH=<装有 jsdom 的 node_modules> node build_ssr.js
// 数据（NAV/CHARACTERS/WINDOWS_WORKS…）改动后重新跑一次即可。
const fs = require("fs");
const path = require("path");

let JSDOM;
try {
  JSDOM = require("jsdom").JSDOM;
} catch (e) {
  JSDOM = require("C:/Users/ASUS/Documents/deepseek-harness/default-workspace/node_modules/jsdom").JSDOM;
}

const FILE = path.join(__dirname, "東方Project.html");
const PAGES = ["home", "origin", "characters", "story", "works", "videos", "culture"];
const MARK = "<!-- 预渲染：由 build_ssr.js 生成，改内容请改数据后重跑脚本 -->";

// jsdom 缺少的浏览器 API：给个够用的空实现，只要渲染逻辑不报错
function beforeParse(window) {
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
    unobserve() {} disconnect() {} takeRecords() { return []; }
  };
  window.scrollTo = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (typeof k === "string" ? () => ({}) : undefined)),
    set: (t, k, v) => (t[k] = v, true),
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return ctx; };
  window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = function () {};
  window.HTMLMediaElement.prototype.load = function () {};
}

function clean(html) {
  return html
    .replace(/<!--\s*预渲染：[\s\S]*?-->\s*/g, "")   // 上一轮留下的标记，否则每跑一次就多一份
    .replace(/\s*data-bound="1"/g, "")     // 运行时接线痕迹，不能固化进 HTML
    .replace(/\s*class="([^"]*)\bis-visible\b([^"]*)"/g, (m, a, b) => {
      const cls = (a + " " + b).replace(/\s+/g, " ").trim();
      return cls ? ` class="${cls}"` : "";
    })
    .trim();
}

(async () => {
  const src = fs.readFileSync(FILE, "utf8");
  const dom = new JSDOM(src, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "file:///" + FILE.replace(/\\/g, "/"),
    beforeParse,
  });
  const win = dom.window;
  const doc = win.document;
  await new Promise((r) => (doc.readyState === "complete" ? r() : win.addEventListener("load", r)));

  const out = {};
  for (const page of PAGES) {
    win.location.hash = "#" + page;
    win.eval("route()");
    const box = doc.getElementById("zunBlock");
    if (box) {                       // 布局交给 CSS + JS 运行时决定，别把桌面端列宽焊死
      box.style.gridTemplateColumns = "";
      box.style.gap = "";
      box.style.alignItems = "";
    }
    const sec = doc.getElementById("page-" + page);
    out[page] = clean(sec.innerHTML);
    sec.classList.remove("active", "is-visible");
    console.log(`  ${page.padEnd(11)} ${String(out[page].length).padStart(6)} 字符`);
  }

  let html = src;
  for (const page of PAGES) {
    const re = new RegExp(`(<section class="page" id="page-${page}"[^>]*>)([\\s\\S]*?)(</section>)`);
    html = html.replace(re, (m0, open, inner, close) => open.replace(/\s+data-ssr="1"/, "") + close);
  }
  for (const page of PAGES) {
    const re = new RegExp(`(<section class="page" id="page-${page}"[^>]*>)([\\s\\S]*?)(</section>)`);
    html = html.replace(re, (m0, open, inner, close) => {
      const tag = open.replace(/\s+data-ssr="1"/, "").replace(/>$/, ' data-ssr="1">');
      return `${tag}\n${MARK}\n${out[page]}\n${close}`;
    });
  }

  fs.writeFileSync(FILE, html, "utf8");
  console.log(`[DONE] ${path.basename(FILE)}: ${Buffer.byteLength(html, "utf8")} 字节`);
  dom.window.close();
})().catch((e) => { console.error("[ERROR]", e && e.stack || e); process.exit(1); });
