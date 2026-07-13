// Farasa — interactions: reveals, nav, counters, spotlight, magnetic
// buttons, and the hero trajectory player.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Reveal sections on scroll (with per-child stagger) ----------
document.querySelectorAll(".reveal-stagger").forEach((group) => {
  Array.from(group.children).forEach((child, i) => {
    child.style.setProperty("--sd", `${i * 90}ms`);
  });
});

const revealables = document.querySelectorAll(".reveal, .reveal-stagger");

if ("IntersectionObserver" in window && !reduceMotion) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  revealables.forEach((el) => observer.observe(el));
} else {
  revealables.forEach((el) => el.classList.add("visible"));
}

// ---------- Header border on scroll ----------
const header = document.querySelector(".site-header");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// ---------- Active section highlighting in nav ----------
const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const sectionsByNav = navLinks
  .map((a) => document.querySelector(a.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window && sectionsByNav.length) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = `#${entry.target.id}`;
        navLinks.forEach((a) =>
          a.classList.toggle("active", a.getAttribute("href") === id)
        );
      }
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );
  sectionsByNav.forEach((s) => navObserver.observe(s));
}

// ---------- Mobile navigation ----------
const navToggle = document.querySelector(".nav-toggle");
const mobileNav = document.querySelector(".mobile-nav");

if (navToggle && mobileNav) {
  const setOpen = (open) => {
    navToggle.classList.toggle("open", open);
    mobileNav.classList.toggle("open", open);
    document.body.classList.toggle("nav-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  navToggle.addEventListener("click", () =>
    setOpen(!mobileNav.classList.contains("open"))
  );
  mobileNav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => setOpen(false))
  );
}

// ---------- Animated counters ----------
const counters = document.querySelectorAll("[data-counter]");

function runCounter(el) {
  const target = parseFloat(el.dataset.counter);
  const decimals = parseInt(el.dataset.decimals || "0", 10);
  if (reduceMotion) {
    el.textContent = target.toFixed(decimals);
    return;
  }
  const dur = 1400;
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = (target * eased).toFixed(decimals);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

if ("IntersectionObserver" in window) {
  const countObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          runCounter(entry.target);
          countObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.6 }
  );
  counters.forEach((el) => countObserver.observe(el));
} else {
  counters.forEach(runCounter);
}

// ---------- Cursor spotlight on cards ----------
document.querySelectorAll(".card, .why-item").forEach((el) => {
  el.addEventListener("pointermove", (e) => {
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  });
});

// ---------- Magnetic buttons ----------
if (!reduceMotion) {
  document.querySelectorAll(".magnetic").forEach((btn) => {
    const strength = 0.3;
    btn.addEventListener("pointermove", (e) => {
      const rect = btn.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      btn.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
    });
    btn.addEventListener("pointerleave", () => {
      btn.style.transition = "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)";
      btn.style.transform = "";
      setTimeout(() => { btn.style.transition = ""; }, 400);
    });
  });
}

// ---------- Hero trajectory player ----------
// A miniature annotation-viewer: a tracked worker performs a full
// lift → carry → place cycle. Scrub the timeline, hover the joints.
const playerRoot = document.querySelector(".traj-player");
if (playerRoot) initTrajectoryPlayer(playerRoot);

function initTrajectoryPlayer(root) {
  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const tip = root.querySelector(".traj-tip");
  const toggle = root.querySelector(".traj-toggle");
  const range = root.querySelector('input[type="range"]');
  const phaseEl = root.querySelector("[data-phase]");
  const timeEl = root.querySelector("[data-time]");
  const coordEl = root.querySelector("[data-coord]");

  // Virtual coordinate space; canvas scales to fit its box.
  const W = 480;
  const H = 420;
  const GROUND = 350;
  const DUR = 9; // seconds per cycle

  const COLOR = {
    bone: "#eef1f5",
    accent: "#e0813c",
    accentBright: "#f0934e",
    grid: "rgba(233, 237, 243, 0.05)",
    ground: "rgba(233, 237, 243, 0.28)",
    path: "rgba(233, 237, 243, 0.2)",
    blockFill: "rgba(224, 129, 60, 0.22)",
    blockIdleFill: "rgba(233, 237, 243, 0.05)",
    blockIdleStroke: "rgba(233, 237, 243, 0.3)",
  };

  const BLOCK = { w: 26, h: 18 };
  const groundBlock = { x: 132, y: GROUND - BLOCK.h / 2 };
  const stackX = 310;
  const stackTopY = GROUND - 2 * BLOCK.h; // top surface of the existing stack
  const placedBlock = { x: stackX, y: stackTopY - BLOCK.h / 2 };

  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  // ----- Poses (side view, 11 keypoints) -----
  function stand(x) {
    return {
      head: [x, 172], neck: [x, 187], pelvis: [x, 252],
      elbow1: [x + 7, 217], hand1: [x + 11, 243],
      elbow2: [x - 7, 217], hand2: [x - 11, 243],
      knee1: [x + 8, 300], foot1: [x + 13, GROUND],
      knee2: [x - 8, 300], foot2: [x - 11, GROUND],
    };
  }

  // Squatting at the ground block, hands on its sides
  const SQUAT = {
    head: [128, 224], neck: [122, 238], pelvis: [104, 296],
    elbow1: [140, 290], hand1: [groundBlock.x + 11, groundBlock.y - 3],
    elbow2: [116, 292], hand2: [groundBlock.x - 11, groundBlock.y - 3],
    knee1: [128, 316], foot1: [124, GROUND],
    knee2: [92, 318], foot2: [98, GROUND],
  };

  // Standing while holding the block at waist height
  function carry(x) {
    return {
      head: [x, 174], neck: [x, 189], pelvis: [x, 254],
      elbow1: [x + 17, 220], hand1: [x + 37, 242],
      elbow2: [x + 3, 223], hand2: [x + 15, 242],
      knee1: [x + 8, 300], foot1: [x + 13, GROUND],
      knee2: [x - 8, 300], foot2: [x - 11, GROUND],
    };
  }

  // Leaning forward, setting the block on top of the stack
  const PLACE = {
    head: [290, 190], neck: [284, 204], pelvis: [264, 262],
    elbow1: [308, 252], hand1: [placedBlock.x + 11, placedBlock.y - 2],
    elbow2: [292, 258], hand2: [placedBlock.x - 11, placedBlock.y - 2],
    knee1: [278, 304], foot1: [284, GROUND],
    knee2: [248, 306], foot2: [254, GROUND],
  };

  const SEGMENTS = [
    { t0: 0.0, t1: 0.1, label: "approach", a: stand(70), b: stand(104), walk: true },
    { t0: 0.1, t1: 0.22, label: "reach", a: stand(104), b: SQUAT },
    { t0: 0.22, t1: 0.3, label: "grasp", a: SQUAT, b: SQUAT },
    { t0: 0.3, t1: 0.4, label: "lift", a: SQUAT, b: carry(112) },
    { t0: 0.4, t1: 0.58, label: "carry", a: carry(112), b: carry(240), walk: true },
    { t0: 0.58, t1: 0.7, label: "place", a: carry(240), b: PLACE },
    { t0: 0.7, t1: 0.78, label: "release", a: PLACE, b: PLACE },
    { t0: 0.78, t1: 0.88, label: "return", a: PLACE, b: stand(228) },
    { t0: 0.88, t1: 1.0, label: "return", a: stand(228), b: stand(70), walk: true },
  ];

  const ATTACH_START = 0.3; // block follows the hands in [start, end)
  const ATTACH_END = 0.7;

  const JOINT_LABELS = {
    head: "head", neck: "neck", pelvis: "pelvis",
    elbow1: "elbow_r", hand1: "wrist_r",
    elbow2: "elbow_l", hand2: "wrist_l",
    knee1: "knee_r", foot1: "ankle_r",
    knee2: "knee_l", foot2: "ankle_l",
  };

  const BONES = [
    ["neck", "pelvis"],
    ["neck", "elbow1"], ["elbow1", "hand1"],
    ["neck", "elbow2"], ["elbow2", "hand2"],
    ["pelvis", "knee1"], ["knee1", "foot1"],
    ["pelvis", "knee2"], ["knee2", "foot2"],
  ];

  function poseAt(t) {
    t = ((t % 1) + 1) % 1;
    let seg = SEGMENTS[SEGMENTS.length - 1];
    for (const s of SEGMENTS) {
      if (t >= s.t0 && t < s.t1) { seg = s; break; }
    }
    const frac = (t - seg.t0) / (seg.t1 - seg.t0);
    const k = ease(frac);
    const pts = {};
    for (const key of Object.keys(seg.a)) {
      pts[key] = [
        lerp(seg.a[key][0], seg.b[key][0], k),
        lerp(seg.a[key][1], seg.b[key][1], k),
      ];
    }
    // Walking bob: small body bounce and alternating foot lifts,
    // faded in/out over the segment so holds stay planted.
    if (seg.walk) {
      const env = Math.sin(Math.PI * frac);
      const w = pts.pelvis[0] / 9;
      const bob = 2.2 * Math.abs(Math.cos(w)) * env;
      for (const key of ["head", "neck", "pelvis", "elbow1", "hand1", "elbow2", "hand2", "knee1", "knee2"]) {
        pts[key][1] -= bob;
      }
      const step = Math.sin(w);
      pts.foot1[1] -= Math.max(0, step) * 5 * env;
      pts.foot2[1] -= Math.max(0, -step) * 5 * env;
    }
    return { pts, label: seg.label };
  }

  function blockAt(t, pts) {
    t = ((t % 1) + 1) % 1;
    if (t >= ATTACH_START && t < ATTACH_END) {
      return {
        x: (pts.hand1[0] + pts.hand2[0]) / 2,
        y: (pts.hand1[1] + pts.hand2[1]) / 2,
        alpha: 1,
      };
    }
    if (t < ATTACH_START) {
      // Ground block fades in at the start of the loop
      return { ...groundBlock, alpha: Math.min(1, t / 0.05) };
    }
    // Placed block fades out at the end of the loop
    return { ...placedBlock, alpha: t > 0.95 ? (1 - t) / 0.05 : 1 };
  }

  // Full wrist trajectory, precomputed for the dashed guide path
  const PATH_SAMPLES = 180;
  const wristPath = [];
  for (let i = 0; i <= PATH_SAMPLES; i++) {
    wristPath.push(poseAt(i / PATH_SAMPLES).pts.hand1);
  }

  // ----- State -----
  let playing = !reduceMotion;
  let t = reduceMotion ? 0.5 : 0;
  let hovered = null; // { key, x, y }
  let scale = 1;
  let lastNow = performance.now();

  function setPlaying(next) {
    playing = next;
    toggle.classList.toggle("paused", !playing);
    toggle.setAttribute("aria-label", playing ? "Pause animation" : "Play animation");
  }
  setPlaying(playing);

  // ----- Sizing -----
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.width * (H / W) * dpr);
    scale = canvas.width / W;
  }
  resize();
  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }

  // ----- Drawing -----
  function drawBlock(b, active) {
    if (b.alpha <= 0) return;
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = active ? COLOR.blockFill : COLOR.blockIdleFill;
    ctx.strokeStyle = active ? COLOR.accent : COLOR.blockIdleStroke;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.rect(b.x - BLOCK.w / 2, b.y - BLOCK.h / 2, BLOCK.w, BLOCK.h);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 40; x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 40; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Ground
    ctx.strokeStyle = COLOR.ground;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, GROUND + 10);
    ctx.lineTo(W - 16, GROUND + 10);
    ctx.stroke();

    // Full wrist path (dashed), with the elapsed portion in accent
    const upto = Math.floor(t * PATH_SAMPLES);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = COLOR.path;
    ctx.beginPath();
    for (let i = upto; i <= PATH_SAMPLES; i++) {
      const p = wristPath[i];
      i === upto ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(224, 129, 60, 0.65)";
    ctx.beginPath();
    for (let i = 0; i <= upto; i++) {
      const p = wristPath[i];
      i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const { pts, label } = poseAt(t);

    // Stack of already-placed blocks
    drawBlock({ x: stackX, y: GROUND - BLOCK.h / 2, alpha: 1 }, false);
    drawBlock({ x: stackX, y: GROUND - 1.5 * BLOCK.h, alpha: 1 }, false);

    // Recent wrist trail (deterministic, so scrubbing works)
    for (let i = 1; i <= 24; i++) {
      const p = poseAt(t - i * 0.007).pts.hand1;
      ctx.globalAlpha = 0.6 * (1 - i / 26);
      ctx.fillStyle = COLOR.accentBright;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // The carried block
    const b = blockAt(t, pts);
    drawBlock(b, t >= ATTACH_START && t < ATTACH_END);

    // Skeleton
    ctx.strokeStyle = COLOR.bone;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [a, c] of BONES) {
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[c][0], pts[c][1]);
    }
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(pts.head[0], pts.head[1], 13, 0, Math.PI * 2);
    ctx.stroke();

    // Joints
    for (const key of Object.keys(JOINT_LABELS)) {
      if (key === "head") continue;
      const p = pts[key];
      ctx.fillStyle = COLOR.bone;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hovered joint highlight
    if (hovered) {
      const p = pts[hovered.key];
      ctx.strokeStyle = COLOR.accentBright;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
      ctx.stroke();
      hovered.x = p[0];
      hovered.y = p[1];
    }

    // UI readouts
    phaseEl.textContent = label;
    timeEl.textContent = `${(t * DUR).toFixed(1)}s / ${DUR.toFixed(1)}s`;
    coordEl.textContent = `wrist_r · x ${Math.round(pts.hand1[0])} · y ${Math.round(pts.hand1[1])}`;
    range.value = Math.round(t * 1000);

    if (hovered) {
      const rect = canvas.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = `${JOINT_LABELS[hovered.key]} · ${Math.round(hovered.x)}, ${Math.round(hovered.y)}`;
      tip.style.left = `${(hovered.x / W) * rect.width}px`;
      tip.style.top = `${(hovered.y / H) * ((rect.width * H) / W)}px`;
    } else {
      tip.hidden = true;
    }
  }

  // ----- Animation loop -----
  function frame(now) {
    // rAF timestamps can trail the performance.now() taken at init,
    // so keep t wrapped into [0, 1) even for a negative first delta.
    if (playing) t = ((((t + (now - lastNow) / 1000 / DUR) % 1) + 1) % 1);
    lastNow = now;
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ----- Controls -----
  toggle.addEventListener("click", () => setPlaying(!playing));

  range.addEventListener("input", () => {
    setPlaying(false);
    t = Number(range.value) / 1000;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    const { pts } = poseAt(t);
    let best = null;
    let bestDist = 16;
    for (const key of Object.keys(JOINT_LABELS)) {
      const p = pts[key];
      const d = Math.hypot(p[0] - mx, p[1] - my);
      if (d < bestDist) { bestDist = d; best = key; }
    }
    hovered = best ? { key: best, x: pts[best][0], y: pts[best][1] } : null;
  });

  canvas.addEventListener("mouseleave", () => { hovered = null; });
}
