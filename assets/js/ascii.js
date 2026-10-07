// Plates: artworks and footage rendered as live type.
// Human ink uses the density ramp in rust; machine type uses 0 and 1 in graphite.
// data-src      density map (grey PNG, white = ink) · or data-video="#id" for footage
// data-cols     characters across
// data-split    0..1: cells left of this x are drawn in machine type (Adam's hand)
// data-spark    "x,y" in 0..1: a pulse between the fingertips
// data-kp       keypoint JSON drawn over footage
(() => {
  const RAMP = " .:-=+*#%@";
  const RUST = "158,80,36", INK = "34,31,27";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const FONT = "'IBM Plex Mono', ui-monospace, monospace";
  const hash = (i) => { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

  class Plate {
    constructor(cv) {
      this.cv = cv; this.g = cv.getContext("2d");
      this.cols = +cv.dataset.cols || 160;
      this.split = cv.dataset.split != null ? +cv.dataset.split : -1;
      this.spark = cv.dataset.spark ? cv.dataset.spark.split(",").map(Number) : null;
      this.video = cv.dataset.video ? document.querySelector(cv.dataset.video) : null;
      this.tone = cv.dataset.tone === "ink" ? INK : RUST;
      this.overlay = "overlay" in cv.dataset;
      this.off = document.createElement("canvas"); this.og = this.off.getContext("2d", { willReadFrequently: true });
      this.ptr = { x: -1e4, y: -1e4, r: 0, tr: 0 };
      this.visible = false; this.revealAt = 0; this.last = 0;
      if (this.video) { this.aspect = 9 / 16; this.ready = true; this.layout(); }
      else {
        const img = new Image(); img.src = cv.dataset.src;
        img.decode().then(() => { this.img = img; this.aspect = img.height / img.width; this.ready = true; this.layout(); }).catch(() => {});
      }
      if (cv.dataset.kp) fetch(cv.dataset.kp).then((r) => r.json()).then((d) => { this.kp = d; }).catch(() => {});
      new IntersectionObserver(([e]) => {
        this.visible = e.isIntersecting;
        if (this.visible && !this.revealAt) this.revealAt = performance.now();
        if (this.video) this.visible ? this.video.play().catch(() => {}) : this.video.pause();
      }, { threshold: 0.12 }).observe(cv);
      if (fine && !reduced) {
        cv.addEventListener("pointermove", (e) => { const r = cv.getBoundingClientRect(); this.ptr.x = e.clientX - r.left; this.ptr.y = e.clientY - r.top; this.ptr.tr = 1; });
        cv.addEventListener("pointerleave", () => { this.ptr.tr = 0; });
      }
      addEventListener("resize", () => this.layout());
    }
    layout() {
      if (!this.ready) return;
      const w = this.cv.clientWidth, dpr = Math.min(2, devicePixelRatio || 1);
      const cols = innerWidth < 640 ? Math.round(this.cols * 0.62) : this.cols;
      this.g.font = `400 100px ${FONT}`;
      const adv = this.g.measureText("M").width / 100;           // advance per px of font size
      this.fs = w / (cols * adv); this.cw = w / cols; this.ch = this.fs * 1.12;
      this.c = cols; this.r = Math.max(1, Math.round((w * this.aspect) / this.ch));
      let h = this.r * this.ch;
      if (this.overlay) { h = w * this.aspect; this.ch = h / this.r; } else this.cv.style.height = h + "px";
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.off.width = this.c; this.off.height = this.r;
      this.dens = new Float32Array(this.c * this.r);
      this.flip = new Float32Array(this.c * this.r);
      this.edge = new Float32Array(this.c * this.r); this.ang = new Float32Array(this.c * this.r);
      this.delay = new Float32Array(this.c * this.r);
      for (let i = 0; i < this.dens.length; i++) { const x = (i % this.c) / this.c; this.delay[i] = x * 1.1 + hash(i) * 0.55 + (Math.floor(i / this.c) / this.r) * 0.15; }
      if (this.img) this.sample(this.img, this.img.width, this.img.height, false);
      this.dirty = true;
    }
    sample(src, sw, sh, isVideo) {
      const o = this.og; o.imageSmoothingQuality = "high";
      if (isVideo) { o.drawImage(src, 0, 0, this.c, this.r); }
      else { o.clearRect(0, 0, this.c, this.r); o.drawImage(src, 0, 0, this.c, this.r); }
      const d = o.getImageData(0, 0, this.c, this.r).data;
      for (let i = 0, j = 0; i < this.dens.length; i++, j += 4) {
        if (isVideo) { const l = (d[j] * .299 + d[j + 1] * .587 + d[j + 2] * .114) / 255; this.dens[i] = Math.pow(Math.min(1, Math.max(0, (l - 0.3) * 1.55)), 1.15); }
        else { this.dens[i] = d[j] / 255; this.edge[i] = d[j + 1] / 255; this.ang[i] = d[j + 2] / 255 * 180; }
      }
    }
    draw(now) {
      if (!this.ready || !this.visible || !this.dens) return;
      const anim = this.video || this.ptr.r > 0.01 || this.ptr.tr > 0 || now - this.revealAt < 3200;
      if (!anim && now - this.last < 70) return;                 // idle shimmer runs at ~14 fps
      this.last = now;
      if (this.video) { if (this.video.readyState < 2) return; this.sample(this.video, 0, 0, true); }
      const g = this.g, c = this.c, cw = this.cw, ch = this.ch, t = (now - this.revealAt) / 1000;
      this.ptr.r += (this.ptr.tr - this.ptr.r) * 0.12;
      const R = 110 * this.ptr.r, px = this.ptr.x, py = this.ptr.y;
      g.clearRect(0, 0, this.cv.width, this.cv.height);
      g.font = `400 ${this.fs}px ${FONT}`; g.textBaseline = "top";
      // bucket cells by colour and weight so fillStyle changes a handful of times per frame
      const B = { h: [[], [], [], []], m: [[], [], [], []], hot: [] };
      const N = this.dens.length, splitCol = this.split >= 0 ? this.split * c : -1;
      // over real footage, type only appears inside the lens: the machine's view of the frame
      if (this.overlay && R > 1) { g.fillStyle = "rgba(243,238,229,.94)"; g.beginPath(); g.arc(px, py, R, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < N; i++) {
        const v = this.dens[i]; if (v < 0.07) continue;
        if (this.overlay) { if (R <= 1) break; const dx = (i % c) * cw + cw / 2 - px, dy = ((i / c) | 0) * ch + ch / 2 - py; if (dx * dx + dy * dy > R * R) continue; }
        const col = i % c, row = (i / c) | 0, x = col * cw, y = row * ch;
        const k = reduced ? 1 : Math.min(1, Math.max(0, (t - this.delay[i]) / 0.35));
        if (k <= 0) continue;
        let machine = splitCol >= 0 && col < splitCol + (hash(row * 7.3) - 0.5) * 2.2;
        let lens = 0;
        if (R > 1) { const dx = x + cw / 2 - px, dy = y + ch / 2 - py, dd = Math.sqrt(dx * dx + dy * dy); if (dd < R) { lens = 1 - dd / R; if (!this.overlay) machine = !machine; } }
        if (!reduced && this.flip[i] < now && hash(i + Math.floor(now / 900) * 13.1) > 0.9965) this.flip[i] = now + 140;
        const flicker = this.flip[i] > now;
        let chr;
        if (k < 1) chr = RAMP[1 + Math.floor(hash(i + now * 0.01) * 9)];
        else if (this.edge[i] > 0.42) { const a = this.ang[i]; chr = a < 22.5 || a >= 157.5 ? "-" : a < 67.5 ? "/" : a < 112.5 ? "|" : "\\"; }
        else if (machine) chr = v < 0.18 ? "." : (hash(i * 3.1 + (flicker ? 1 : 0)) > 0.5 ? "1" : "0");
        else { let q = Math.min(9, Math.max(1, Math.floor(v * 10))); if (flicker) q = Math.max(1, q - 1); chr = RAMP[q]; }
        const w = this.edge[i] > 0.42 ? 3 : Math.min(3, Math.floor(v * 4 * k));
        if (lens > 0.55 && !this.overlay) B.hot.push(chr, x, y); else (machine ? B.m : B.h)[w].push(chr, x, y);
      }
      const A = [0.42, 0.62, 0.82, 1];
      [["h", this.tone], ["m", INK]].forEach(([key, rgb]) => B[key].forEach((arr, w) => {
        if (!arr.length) return; g.fillStyle = `rgba(${rgb},${A[w]})`;
        for (let j = 0; j < arr.length; j += 3) g.fillText(arr[j], arr[j + 1], arr[j + 2]);
      }));
      if (B.hot.length) { g.fillStyle = `rgba(${RUST},1)`; g.font = `500 ${this.fs}px ${FONT}`; for (let j = 0; j < B.hot.length; j += 3) g.fillText(B.hot[j], B.hot[j + 1], B.hot[j + 2]); g.font = `400 ${this.fs}px ${FONT}`; }
      // the spark between the fingertips
      if (this.spark && t > 1.6) {
        const sx = this.spark[0] * c * cw, sy = this.spark[1] * this.r * ch, p = (Math.sin(now / 260) + 1) / 2;
        g.fillStyle = `rgba(${RUST},${0.35 + 0.65 * p})`; g.font = `500 ${this.fs * 1.15}px ${FONT}`;
        g.fillText(["·", "+", "*", "+"][Math.floor(now / 180) % 4], sx - cw / 2, sy - ch / 2);
      }
      // keypoints over footage, set as type
      if (this.kp && this.video) {
        const d = this.kp, f = d.frames[Math.min(d.frames.length - 1, Math.floor(this.video.currentTime * d.fps) % d.frames.length)] || [];
        const W = c * cw, H = this.r * ch; g.font = `600 ${this.fs * 1.35}px ${FONT}`;
        f.forEach((hd) => {
          g.fillStyle = `rgba(${RUST},.9)`;
          BONES.forEach(([a, b]) => { const A1 = hd.p[a], B1 = hd.p[b]; for (let s = 0.25; s < 0.9; s += 0.25) g.fillText("+", (A1[0] + (B1[0] - A1[0]) * s) * W - cw / 2, (A1[1] + (B1[1] - A1[1]) * s) * H - ch / 2); });
          hd.p.forEach((q, j) => {
            const x = q[0] * W - cw / 2, y = q[1] * H - ch / 2;
            g.fillStyle = "rgba(243,238,229,.95)"; g.fillRect(x - 2, y - 1, cw * 1.35 + 4, ch * 1.2);
            g.fillStyle = `rgba(${RUST},1)`; g.fillText([4, 8, 12, 16, 20].includes(j) ? "@" : "o", x, y);
          });
        });
      }
    }
  }
  const plates = [];
  const boot = () => { document.querySelectorAll("canvas.plate").forEach((cv) => plates.push(new Plate(cv))); const loop = (n) => { plates.forEach((p) => p.draw(n)); requestAnimationFrame(loop); }; requestAnimationFrame(loop); };
  (document.fonts ? document.fonts.load(`400 20px 'IBM Plex Mono'`).then(boot, boot) : boot());
})();
