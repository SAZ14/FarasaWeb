// farasa — earthrise. Scenes and widgets are ascii.rest pieces (MIT, github.com/bas3line/ascii);
// the scramble headline, layout and reveals are ours.
import { mount } from "../vendor/ascii-rest/mount.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const whenVisible = (fn) => {
  if (!document.hidden) return fn();
  document.addEventListener("visibilitychange", function once() { if (!document.hidden) { document.removeEventListener("visibilitychange", once); fn(); } });
};

// ── hero: earthrise, scaled to cover, the earth kept on screen ──────────
const sky = $(".sky"), er = $("#earthrise");
if (sky && er) {
  import("../vendor/ascii-rest/pieces/earthrise.js").then((piece) => {
    const place = () => {
      const vw = sky.clientWidth, vh = sky.clientHeight;
      const wide = vw / vh > 1;
      const W = Math.max(vw * 1.05, vh * (wide ? 2.2 : 1.5)), H = W / 2;
      // the earth sits about 3/4 across; keep it near the right edge on desktop, centred on a phone
      const left = wide ? vw - W * 0.86 : vw / 2 - W * 0.745;
      const top = vh * (wide ? 0.6 : 0.84) - H * 0.37;  // the horizon is ~37% down the scene
      Object.assign(er.style, { width: `${W}px`, left: `${left}px`, top: `${top}px` });
    };
    place(); addEventListener("resize", place);
    mount(er, piece);
  });
}

// ── scramble: each line settles out of glyph noise, left to right ──────
const GLYPHS = "!<>-_\\/[]{}=+*^?#%&$@0123456789abcdefxyz";
function scramble(el, delay = 0) {
  const lines = el.innerHTML.split(/<br\s*\/?>/i).map((l) => l.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"));
  el.setAttribute("aria-label", lines.join(" "));
  el.innerHTML = lines.map(() => '<span class="ln" aria-hidden="true"></span>').join("");
  const spans = $$(".ln", el);
  if (reduced) { spans.forEach((s, i) => (s.textContent = lines[i])); return; }
  const t0 = performance.now() + delay;
  const STEP = 55, NOISE = 380; // ms per settled character, ms of noise before the first settles
  let offset = 0;
  const starts = lines.map((l) => { const s = offset; offset += l.length * STEP * 0.7; return s; });
  const tick = (now) => {
    const t = now - t0;
    let done = true;
    spans.forEach((sp, i) => {
      const line = lines[i], lt = t - starts[i];
      if (lt < 0) { sp.textContent = ""; done = false; return; }
      let out = "";
      for (let k = 0; k < line.length; k++) {
        const settle = NOISE + k * STEP;
        if (line[k] === " ") out += " ";
        else if (lt >= settle) out += line[k];
        else if (lt >= k * 18) { out += GLYPHS[(Math.random() * GLYPHS.length) | 0]; done = false; }
        else { done = false; }
      }
      sp.textContent = out;
    });
    if (!done) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ── widgets: each <pre data-piece> plays its piece once it is near view ──
const OPTIONS = {
  typewriter: { prefix: "> we record ", phrases: ["how people work.", "what their hands do.", "what people touch.", "the physical world, labelled.", "custom datasets, built to spec."] },
  sparkline: { series: [{ label: "position", unit: " mm", lo: 0, hi: 600 }, { label: "load", unit: " n", lo: 0, hi: 90 }, { label: "speed", unit: " rpm", lo: 0, hi: 3000 }], range: false, rate: 30 },
};
const OURS = new Set(["hands", "labels"]);
const DATA = { hands: () => fetch("assets/data/hands.json").then((r) => r.json()) };
function fit(el, meta) { // size a piece to fill its box in both directions
  const lh = parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize) || 1.2;
  const box = el.parentElement.getBoundingClientRect();
  const sign = document.querySelector(".essay .sign"); // on the about page the rocket stands on the sign-off rule
  const h = box.height - (sign && innerWidth > 860 ? sign.offsetHeight : 0);
  el.style.fontSize = Math.min((box.width * 1.16) / (meta.cols * 0.6), h / (meta.rows * lh)) + "px"; // the scene's edges are open sky, so it may run a little past its column
}
// about page: the rocket's ground sits on the rule above the sign-off
function alignAbout(el, meta) {
  const fig = el.closest(".about-art"), sign = document.querySelector(".essay .sign");
  if (!fig || !sign || innerWidth <= 860) { el.style.bottom = ""; return; }
  // layout positions, not on-screen ones: the entrance animation nudges things while it runs
  const y = (n) => { let t = 0; for (; n; n = n.offsetParent) t += n.offsetTop; return t; };
  const fb = y(fig) + fig.offsetHeight, rule = y(sign);
  const lh = el.offsetHeight / meta.rows;
  el.style.bottom = `${Math.round(fb - (rule + lh / 2))}px`;
}
function play(el, name) {
  const src = OURS.has(name) ? `./pieces/${name}.js` : `../vendor/ascii-rest/pieces/${name}.js`;
  Promise.all([import(src), DATA[name] ? DATA[name]() : null]).then(([piece, data]) => {
    el.style.setProperty("--cols", piece.meta.cols);
    if ("fit" in el.dataset) { const f = () => { fit(el, piece.meta); alignAbout(el, piece.meta); }; f(); addEventListener("resize", f); document.fonts && document.fonts.ready.then(f); }
    mount(el, piece, { ...(OPTIONS[name] || {}), ...(data ? { data } : {}) });
  });
}

// ── page ready: entrance, then the headline, then everything else ──────
whenVisible(() => {
  requestAnimationFrame(() => document.body.classList.add("ready"));
  $$("[data-scramble]").forEach((el, i) => scramble(el, 350 + i * 200));
  const tw = $("#typewriter"); if (tw) setTimeout(() => play(tw, "typewriter"), reduced ? 0 : 1700);
});
const lazy = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  lazy.unobserve(e.target); play(e.target, e.target.dataset.piece);
}), { rootMargin: "200px" });
$$("pre[data-piece]").forEach((el) => lazy.observe(el));

// scroll reveals
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -10% 0px" });
$$(".reveal").forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 90}ms`; io.observe(el); });

// premise: words light up as you read down
const prem = $("[data-words]");
if (prem) {
  const wrap = (node) => [...node.childNodes].forEach((c) => {
    if (c.nodeType === 3) {
      const f = document.createDocumentFragment();
      c.textContent.split(/(\s+)/).forEach((p) => { if (!p) return; if (/^\s+$/.test(p)) f.appendChild(document.createTextNode(p)); else { const s = document.createElement("span"); s.className = "w"; s.textContent = p; f.appendChild(s); } });
      node.replaceChild(f, c);
    } else if (c.nodeType === 1) wrap(c);
  });
  wrap(prem);
  const words = $$(".w", prem);
  const light = () => { const r = prem.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.3))); const n = Math.round(p * words.length); words.forEach((w, i) => w.classList.toggle("on", i < n)); };
  addEventListener("scroll", light, { passive: true }); light();
}

// nav turns solid off the hero; a live utc clock in the status line
const nav = $(".nav"), home = document.body.classList.contains("home");
const navState = () => nav && home && nav.classList.toggle("solid", scrollY > innerHeight * 0.6);
addEventListener("scroll", navState, { passive: true }); navState();
const clock = $("[data-clock]");
if (clock) { const set = () => (clock.textContent = new Date().toISOString().slice(11, 19)); set(); setInterval(set, 1000); }
