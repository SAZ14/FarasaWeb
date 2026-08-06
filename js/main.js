/* ==========================================================================
   Farasa site behaviour

   The centrepiece is a first-person capture simulator: a pinhole camera with
   barrel distortion moves through a procedural job site while a worker picks
   up a block and lays it on a wall. Every annotation layer we sell (hand
   pose, object boxes, gaze, contact, action) is drawn on top of that same
   geometry, so the page demonstrates the product instead of describing it.

   No dependencies, no build step.
   ========================================================================== */

'use strict';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const wrap01 = (t) => ((t % 1) + 1) % 1;

/* ==========================================================================
   1. The take: a 10 second lift → carry → place cycle
   ========================================================================== */

const DUR = 10;                       // seconds per loop
const FPS = 60;                       // nominal capture rate
const TC_BASE = 14 * 60 + 22;         // take starts at 00:14:22:00

const SEGMENTS = [
  { t0: 0.00, t1: 0.12, id: 'approach', verb: 'walk',    obj: 'none' },
  { t0: 0.12, t1: 0.22, id: 'reach',    verb: 'reach',   obj: 'blk_07' },
  { t0: 0.22, t1: 0.30, id: 'grasp',    verb: 'grasp',   obj: 'blk_07' },
  { t0: 0.30, t1: 0.40, id: 'lift',     verb: 'lift',    obj: 'blk_07' },
  { t0: 0.40, t1: 0.56, id: 'carry',    verb: 'carry',   obj: 'blk_07' },
  { t0: 0.56, t1: 0.66, id: 'align',    verb: 'align',   obj: 'blk_07' },
  { t0: 0.66, t1: 0.74, id: 'place',    verb: 'place',   obj: 'blk_07' },
  { t0: 0.74, t1: 0.80, id: 'release',  verb: 'release', obj: 'blk_07' },
  { t0: 0.80, t1: 1.00, id: 'return',   verb: 'walk',    obj: 'none' },
];

const segmentAt = (t) => {
  t = wrap01(t);
  for (const s of SEGMENTS) if (t >= s.t0 && t < s.t1) return s;
  return SEGMENTS[SEGMENTS.length - 1];
};

// Head keyframes: position (m), yaw (rad, +right), pitch (rad, +up).
// People carrying a load look where they are going, not at the load. The
// pitch only dips for the two moments that actually need hand-eye work.
const HEAD = [
  { t: 0.00, p: [-0.30, 1.64, -1.00], yaw: -0.30, pit: -0.09 },
  { t: 0.12, p: [-0.85, 1.62,  0.45], yaw: -0.55, pit: -0.30 },
  { t: 0.22, p: [-0.95, 1.47,  0.75], yaw: -0.63, pit: -0.60 },
  { t: 0.30, p: [-0.95, 1.45,  0.77], yaw: -0.63, pit: -0.62 },
  { t: 0.40, p: [-0.90, 1.62,  0.80], yaw: -0.52, pit: -0.28 },
  { t: 0.56, p: [ 0.24, 1.61,  1.72], yaw:  0.40, pit: -0.12 },
  { t: 0.66, p: [ 0.46, 1.57,  1.98], yaw:  0.54, pit: -0.40 },
  { t: 0.74, p: [ 0.50, 1.55,  2.04], yaw:  0.56, pit: -0.46 },
  { t: 0.80, p: [ 0.48, 1.62,  1.96], yaw:  0.50, pit: -0.26 },
  { t: 1.00, p: [-0.30, 1.64, -1.00], yaw: -0.30, pit: -0.09 },
];

const WALKING = { approach: 1, carry: 1, return: 1 };

// Block geometry and the two rest positions of the block being moved.
const BLK = { w: 0.39, h: 0.19, d: 0.19 };
const PICK  = [-1.35, 0.805, 1.30];   // loose block on top of the pallet
const PLACE = [ 1.10, 0.855, 3.05];   // its slot on the top course of the wall

const GRIP_T0 = 0.26;                 // block leaves the pallet
const GRIP_T1 = 0.78;                 // block is let go on the wall

function headAt(t) {
  t = wrap01(t);
  let a = HEAD[0], b = HEAD[HEAD.length - 1];
  for (let i = 0; i < HEAD.length - 1; i++) {
    if (t >= HEAD[i].t && t <= HEAD[i + 1].t) { a = HEAD[i]; b = HEAD[i + 1]; break; }
  }
  const k = smooth(b.t === a.t ? 0 : (t - a.t) / (b.t - a.t));
  const pos = [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)];
  let yaw = lerp(a.yaw, b.yaw, k);
  const pit = lerp(a.pit, b.pit, k);

  // Gait: a vertical bob and a lateral roll while the feet are moving.
  const seg = segmentAt(t);
  let roll = 0;
  if (WALKING[seg.id]) {
    const local = (t - seg.t0) / (seg.t1 - seg.t0);
    const env = Math.sin(Math.PI * local);           // fade in and out of the stride
    const stride = t * DUR * 3.4;
    pos[1] += 0.022 * Math.cos(stride * 2) * env;
    roll += 0.030 * Math.sin(stride) * env;
    yaw += 0.020 * Math.sin(stride) * env;
  }

  // Involuntary head motion, always present. This is what makes it read as
  // footage rather than as a camera path.
  const s = t * DUR;
  yaw  += 0.013 * Math.sin(s * 0.83) + 0.005 * Math.sin(s * 2.31 + 1.1);
  const pitch = pit + 0.010 * Math.sin(s * 1.27 + 0.4) + 0.004 * Math.sin(s * 3.1);
  pos[1] += 0.008 * Math.sin(s * 1.9);              // breathing
  roll += 0.008 * Math.sin(s * 0.61 + 2.0);

  return { pos, yaw, pitch, roll, bodyYaw: lerp(a.yaw, b.yaw, k) };
}

/* ==========================================================================
   2. Static world geometry
   ========================================================================== */

// A box is centre + size, optionally yawed about its own vertical axis.
const box = (c, s, yaw) => ({ c, s, yaw: yaw || 0 });

const WALL_Z = 3.05;
const WALL_T = 0.19;                  // wall thickness
const COURSES = [                      // [y-centre, x0, x1], stepped at the far end
  [0.095, -1.30, 2.60],
  [0.285, -1.30, 2.60],
  [0.475, -1.30, 2.60],
  [0.665, -1.30, 2.15],
  [0.855, -1.30, 0.905],              // the placed block continues this course
];

const PALLET_X = -1.35, PALLET_Z = 1.30;

const SCENE = {
  // Stacked formwork panels leaning against the left edge of the bay
  formwork: [
    box([-2.72, 0.62, 0.90], [0.10, 1.24, 2.10]),
    box([-2.60, 0.58, 1.15], [0.09, 1.16, 1.95]),
  ],
  // Pallet of blocks: timber base plus three courses, minus the loose top one
  pallet: [
    box([PALLET_X, 0.07, PALLET_Z], [1.05, 0.14, 1.10]),
    box([PALLET_X, 0.425, PALLET_Z], [0.99, 0.57, 1.02]),
  ],
  // Scaffold bay on the right
  scaffold: {
    posts: [[2.86, 0.90], [2.86, 3.30], [2.86, 5.70], [3.94, 0.90], [3.94, 3.30], [3.94, 5.70]],
    height: 2.55,
    ledgers: [0.62, 1.42, 2.22],
  },
  // Bundle of rebar lying beyond the wall
  rebar: { x: -0.30, z0: 4.60, z1: 6.90, n: 7 },
  // Distant structure
  columns: [[-5.4, 11.0], [5.6, 12.5], [-8.0, 18.0], [8.4, 20.0]],
  debris: [
    [-0.4, 0.9, 0.16], [0.9, 1.7, 0.11], [-1.9, 2.4, 0.2], [1.7, 0.6, 0.13],
    [0.2, 3.9, 0.18], [-2.4, 3.4, 0.12], [2.2, 4.6, 0.15], [-0.9, 5.4, 0.2],
    [1.2, 2.8, 0.09], [-1.6, 0.2, 0.14],
  ],
};

// Deterministic dust motes: fixed seeds so scrubbing is reproducible.
const MOTES = Array.from({ length: 46 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: -3.4 + r(1) * 6.8, y: 0.25 + r(2) * 2.3, z: -1.2 + r(3) * 8.0, s: r(4), r: 0.6 + r(5) * 1.4 };
});

/* ==========================================================================
   3. Hand model: 21 keypoints per hand, MediaPipe ordering
   ========================================================================== */

// Curl totals about 100°, not 166°. A hand wrapping the end of a block is
// not a closed fist, and a fist buries the keypoints inside each other.
const FINGERS = [
  { base: [ 0.030, -0.004, 0.020], seg: [0.034, 0.030, 0.024], curl: [0.34, 0.46, 0.34], splay:  0.42 },
  { base: [ 0.023,  0.000, 0.078], seg: [0.040, 0.026, 0.020], curl: [0.60, 0.66, 0.44], splay:  0.10 },
  { base: [ 0.006,  0.000, 0.082], seg: [0.044, 0.028, 0.021], curl: [0.63, 0.69, 0.46], splay:  0.02 },
  { base: [-0.011,  0.000, 0.078], seg: [0.040, 0.026, 0.020], curl: [0.62, 0.68, 0.46], splay: -0.06 },
  { base: [-0.027,  0.000, 0.068], seg: [0.032, 0.023, 0.018], curl: [0.60, 0.66, 0.44], splay: -0.16 },
];

// [a, b] index pairs, MediaPipe hand connections
const HAND_BONES = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

/** 21 keypoints in hand-local metres: +z toward fingertips, +y dorsal. */
function handLocal(grip, side) {
  const pts = [[0, 0, 0]];
  for (let f = 0; f < 5; f++) {
    const F = FINGERS[f];
    let p = [F.base[0] * side, F.base[1], F.base[2]];
    pts.push(p.slice());
    let ang = f === 0 ? 0.30 : 0.06;                   // resting flex
    let dir;
    const sp = F.splay * side * (1 - grip * 0.7);
    for (let s = 0; s < 3; s++) {
      ang += F.curl[s] * grip + (f === 0 ? 0.12 : 0.05);
      dir = [Math.sin(sp) * Math.cos(ang), -Math.sin(ang), Math.cos(sp) * Math.cos(ang)];
      p = [p[0] + dir[0] * F.seg[s], p[1] + dir[1] * F.seg[s], p[2] + dir[2] * F.seg[s]];
      pts.push(p.slice());
    }
  }
  return pts;
}

/* ==========================================================================
   4. The renderer
   ========================================================================== */

const PAL = {
  skyHi:   '#3c4757',      // overcast, cool overhead
  skyLo:   '#8d9099',
  haze:    '#b3ac9c',      // dusty bright band at the horizon
  slab:    '#4a463c',      // concrete, kept dark so overlays carry
  slabLo:  '#2f2c26',
  joint:   'rgba(0,0,0,0.20)',
  block:   '#8d8677',
  blockLo: '#605b52',
  blockHi: '#b3aa97',      // the block in play, lifted off the stack it sits on
  timber:  '#664f34',
  steel:   '#5d636d',
  rebar:   '#8a6743',
  far:     '#353a43',
  glove:   '#7c7466',
  gloveLo: '#5d574c',
  sleeve:  '#c25f24',      // hi-vis sleeve, the only warm mass in the scene
  sleeveLo:'#8f4319',
  flare:   '#ff5a1f',
  hot:     '#ff8a55',
  bone:    '#f2efe9',
};

function createPOV(canvas, config) {
  const cfg = Object.assign({
    quality: 1,        // 1 = hero, 0.7 = inline viewer
    interactive: false,
    layers: { hands: 1, objects: 1, gaze: 1, contact: 1, action: 1 },
    focus: null,       // when set, other active layers render dimmed
    fov: 122,
    chipAnchor: 'bottom',
    chipOffset: 14,    // css px clear of the anchored edge
    shiftX: 0,         // crop the frame off-centre, as a fraction of width
  }, config);

  const ctx = canvas.getContext('2d', { alpha: false });
  let W = 0, H = 0, dpr = 1, f = 1, cx = 0, cy = 0, halfW = 1;
  let unit = 1, shiftPx = 0;
  const K = 0.16;                       // barrel coefficient
  const NEAR = 0.14;

  // ---- camera state -------------------------------------------------------
  let cam = { p: [0, 1.6, 0], yaw: 0, pitch: 0, roll: 0, bodyYaw: 0 };
  let lookX = 0, lookY = 0, wantX = 0, wantY = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w === canvas.width && h === canvas.height) return true;
    canvas.width = w; canvas.height = h;
    W = w; H = h; cx = W / 2; cy = H / 2; halfW = W / 2;
    f = halfW / Math.tan((cfg.fov * Math.PI / 180) / 2);
    // A 122° horizontal field on a portrait canvas implies a ~150° vertical
    // one, which is all sky and floor. Cap the vertical angle and let the
    // frame crop horizontally instead.
    f = Math.max(f, (H / 2) / Math.tan((94 * Math.PI / 180) / 2));

    // Overlay chrome is sized against a 900px reference frame, otherwise the
    // labels swallow a phone-width canvas.
    const css = W / dpr;
    unit = dpr * clamp(css / 900, 0.6, 1) * (cfg.quality > 0.8 ? 1 : 0.92);
    // Off-centre cropping only earns its keep when the copy sits beside the
    // picture; on a narrow screen it sits on top of it, so centre the frame.
    shiftPx = (css > 900 ? cfg.shiftX : 0) * W;
    return true;
  }

  // ---- transforms ---------------------------------------------------------

  /** world → camera space */
  function toCam(p) {
    const dx = p[0] - cam.p[0], dy = p[1] - cam.p[1], dz = p[2] - cam.p[2];
    const cy_ = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const x = dx * cy_ - dz * sy;
    const z0 = dx * sy + dz * cy_;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return [x, dy * cp - z0 * sp, dy * sp + z0 * cp];
  }

  /** body space (position + body yaw only) → camera space */
  function bodyToCam(b) {
    const d = cam.yaw - cam.bodyYaw;                  // head turned relative to torso
    const c = Math.cos(d), s = Math.sin(d);
    const x = b[0] * c - b[2] * s;
    const z0 = b[0] * s + b[2] * c;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return [x, b[1] * cp - z0 * sp, b[1] * sp + z0 * cp];
  }

  /** body space → world */
  function bodyToWorld(b) {
    const c = Math.cos(cam.bodyYaw), s = Math.sin(cam.bodyYaw);
    return [cam.p[0] + b[0] * c + b[2] * s, cam.p[1] + b[1], cam.p[2] - b[0] * s + b[2] * c];
  }

  /** world → body space */
  function worldToBody(p) {
    const dx = p[0] - cam.p[0], dy = p[1] - cam.p[1], dz = p[2] - cam.p[2];
    const c = Math.cos(cam.bodyYaw), s = Math.sin(cam.bodyYaw);
    return [dx * c - dz * s, dy, dx * s + dz * c];
  }

  /** camera space → screen, with barrel distortion. null when behind the lens. */
  function proj(c) {
    if (c[2] <= NEAR) return null;
    let u = f * c[0] / c[2];
    let v = -f * c[1] / c[2];
    // Points just past the near plane project to absurd offsets; the barrel
    // divisor would then fold them back through the centre of frame. Cap the
    // undistorted radius first so they land just outside the edge instead.
    const r = Math.hypot(u, v), rmax = halfW * 3.2;
    if (r > rmax) { u = u / r * rmax; v = v / r * rmax; }
    const rr = (u * u + v * v) / (halfW * halfW);
    const s = 1 / (1 + K * rr);
    // Distortion is about the true optical centre; the shift is a crop applied
    // after it, so the lens stays honest and the composition still clears the
    // headline.
    return [cx + u * s + shiftPx, cy + v * s, c[2]];
  }

  const P  = (p) => proj(toCam(p));       // world → screen
  const PB = (b) => proj(bodyToCam(b));   // body  → screen

  // ---- primitives ---------------------------------------------------------

  /** Straight world lines bow under the lens, so every edge is subdivided. */
  function edge(a, b, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const s = P([lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]);
      out.push(s);
    }
    return out;
  }

  function strokeRun(pts) {
    let open = false;
    for (const p of pts) {
      if (!p) { open = false; continue; }
      if (!open) { ctx.moveTo(p[0], p[1]); open = true; }
      else ctx.lineTo(p[0], p[1]);
    }
  }

  /** Local box coordinate → world, honouring the box's own yaw. */
  function boxPt(b, sx, sy, sz) {
    const hx = sx * b.s[0] / 2, hy = sy * b.s[1] / 2, hz = sz * b.s[2] / 2;
    if (!b.yaw) return [b.c[0] + hx, b.c[1] + hy, b.c[2] + hz];
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    return [b.c[0] + hx * c + hz * s, b.c[1] + hy, b.c[2] - hx * s + hz * c];
  }

  const FACE_SIGNS = [
    [[-1, 1,-1],[ 1, 1,-1],[ 1, 1, 1],[-1, 1, 1]],  // top
    [[-1,-1,-1],[ 1,-1,-1],[ 1, 1,-1],[-1, 1,-1]],  // near
    [[-1,-1, 1],[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1]],  // far
    [[-1,-1,-1],[-1,-1, 1],[-1, 1, 1],[-1, 1,-1]],  // left
    [[ 1,-1,-1],[ 1,-1, 1],[ 1, 1, 1],[ 1, 1,-1]],  // right
    [[-1,-1,-1],[ 1,-1,-1],[ 1,-1, 1],[-1,-1, 1]],  // bottom
  ];

  const faceOf = (b, i) => FACE_SIGNS[i].map((s) => boxPt(b, s[0], s[1], s[2]));

  const SHADE = [1.10, 0.88, 0.62, 0.72, 0.82, 0.5];   // per-face light factor

  function tint(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) * k, 0, 255) | 0;
    const g = clamp(((n >> 8) & 255) * k, 0, 255) | 0;
    const b = clamp((n & 255) * k, 0, 255) | 0;
    return `rgb(${r},${g},${b})`;
  }

  function drawBox(b, colour, opts = {}) {
    const cam0 = toCam(b.c);
    const seg = cam0[2] < 3 ? 5 : 3;

    // Painter's algorithm on the six faces. Sorting by centroid depth is
    // cheaper to reason about than winding-order culling and stays correct
    // whichever side of the box the camera happens to be on.
    const faces = [];
    for (let i = 0; i < 6; i++) {
      const quad = faceOf(b, i);
      const mid = [0, 0, 0];
      for (const q of quad) { mid[0] += q[0] / 4; mid[1] += q[1] / 4; mid[2] += q[2] / 4; }
      faces.push({ i, quad, z: toCam(mid)[2] });
    }
    faces.sort((a, c) => c.z - a.z);

    for (const face of faces) {
      if (face.z <= NEAR) continue;
      const pts = [];
      let ok = true;
      for (let e = 0; e < 4; e++) {
        const run = edge(face.quad[e], face.quad[(e + 1) % 4], seg);
        for (const p of run) { if (!p) { ok = false; break; } pts.push(p); }
        if (!ok) break;
      }
      if (!ok || pts.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.closePath();
      ctx.fillStyle = tint(colour, SHADE[face.i] * (opts.shade || 1));
      ctx.fill();
      if (opts.edges) {
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = Math.max(1, dpr * 0.7);
        ctx.stroke();
      }
    }
  }

  function fillQuad(quad, colour, seg = 3) {
    const pts = [];
    for (let e = 0; e < 4; e++) {
      for (const p of edge(quad[e], quad[(e + 1) % 4], seg)) {
        if (!p) return;
        pts.push(p);
      }
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
  }

  /** A concrete block. The two hollow cores in the top face are the single
      detail that stops it reading as a plain slab. */
  function drawCMU(b, colour) {
    drawBox(b, colour, { edges: true });
    const camZ = toCam(b.c)[2];
    if (camZ > 4) return;                              // cores stop resolving
    // Local units are normalised to half-extents, so a 145mm core in a 390mm
    // block is 0.372 wide and sits 0.474 either side of centre.
    const top = b.c[1] + b.s[1] / 2 + 0.002;
    const cw = 0.372, cd = 0.68;
    for (const off of [-0.474, 0.474]) {
      const quad = [
        [off - cw, -cd], [off + cw, -cd], [off + cw, cd], [off - cw, cd],
      ].map(([sx, sz]) => {
        const p = boxPt(b, sx, 1, sz);
        return [p[0], top, p[2]];
      });
      fillQuad(quad, tint(colour, 0.40), 2);
    }
  }

  /** A perspective-correct tapered cylinder: scaffold poles, rebar, forearms.
      Clipped against the near plane in camera space so a pole that runs past
      the lens is shortened rather than flung across the frame. */
  function tube(a, b, ra, rb, colour, body) {
    let A = body ? bodyToCam(a) : toCam(a);
    let B = body ? bodyToCam(b) : toCam(b);
    const MIN = body ? 0.16 : 0.42;
    if (A[2] < MIN && B[2] < MIN) return;
    if (A[2] < MIN) {
      const k = (MIN - A[2]) / (B[2] - A[2]);
      A = [lerp(A[0], B[0], k), lerp(A[1], B[1], k), MIN];
      ra = lerp(ra, rb, k);
    } else if (B[2] < MIN) {
      const k = (MIN - B[2]) / (A[2] - B[2]);
      B = [lerp(B[0], A[0], k), lerp(B[1], A[1], k), MIN];
      rb = lerp(rb, ra, k);
    }
    const pa = proj(A), pb = proj(B);
    if (!pa || !pb) return;
    const wa = Math.max(1.2, f * ra / pa[2]);
    const wb = Math.max(1.2, f * rb / pb[2]);
    let dx = pb[0] - pa[0], dy = pb[1] - pa[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    ctx.beginPath();
    ctx.moveTo(pa[0] + nx * wa, pa[1] + ny * wa);
    ctx.lineTo(pb[0] + nx * wb, pb[1] + ny * wb);
    ctx.lineTo(pb[0] - nx * wb, pb[1] - ny * wb);
    ctx.lineTo(pa[0] - nx * wa, pa[1] - ny * wa);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
  }

  // ---- scene --------------------------------------------------------------

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.skyHi);
    g.addColorStop(0.44, PAL.skyLo);
    g.addColorStop(1, PAL.haze);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function horizonCurve() {
    const pts = [];
    const span = 1.5;                                  // rad either side of centre
    for (let i = 0; i <= 26; i++) {
      const a = cam.yaw - span + (i / 26) * span * 2;
      const p = P([cam.p[0] + Math.sin(a) * 420, 0, cam.p[2] + Math.cos(a) * 420]);
      if (p) pts.push(p);
    }
    return pts;
  }

  function drawGround() {
    const hz = horizonCurve();
    if (hz.length < 2) { ctx.fillStyle = PAL.slab; ctx.fillRect(0, 0, W, H); return; }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-W, hz[0][1]);
    ctx.lineTo(hz[0][0], hz[0][1]);
    for (let i = 1; i < hz.length; i++) ctx.lineTo(hz[i][0], hz[i][1]);
    ctx.lineTo(W * 2, hz[hz.length - 1][1]);
    ctx.lineTo(W * 2, H * 2);
    ctx.lineTo(-W, H * 2);
    ctx.closePath();
    ctx.clip();

    const g = ctx.createLinearGradient(0, cy * 0.5, 0, H);
    g.addColorStop(0, tint(PAL.slabLo, 1.75));           // aerial haze at distance
    g.addColorStop(0.3, tint(PAL.slab, 1.08));
    g.addColorStop(1, tint(PAL.slab, 0.86));             // falls off underfoot
    ctx.fillStyle = g;
    ctx.fillRect(-W, 0, W * 4, H * 2);

    // control joints: sawn, not painted, so they stay subtle
    ctx.strokeStyle = PAL.joint;
    ctx.lineWidth = Math.max(1, dpr * 0.8);
    ctx.beginPath();
    const step = cfg.quality > 0.8 ? 0.6 : 1.0;
    for (let x = -9; x <= 9; x += 3) {
      const run = [];
      for (let z = -4; z <= 26; z += step * 2) run.push(P([x, 0, z]));
      strokeRun(run);
    }
    for (let z = -3; z <= 24; z += 3) {
      const run = [];
      for (let x = -10; x <= 10; x += step) run.push(P([x, 0, z]));
      strokeRun(run);
    }
    ctx.stroke();

    // ground staining
    ctx.fillStyle = 'rgba(38,33,26,0.30)';
    for (const [x, z, r] of SCENE.debris) {
      const p = P([x, 0.005, z]);
      if (!p) continue;
      const rad = Math.max(1, f * r / p[2]);
      ctx.beginPath();
      ctx.ellipse(p[0], p[1], rad, rad * 0.38, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // A hard, hazy horizon does more for the sense of outdoors than any
    // amount of sky gradient.
    ctx.save();
    ctx.strokeStyle = PAL.haze;
    ctx.lineCap = 'round';
    for (const [w, a] of [[9 * dpr, 0.16], [3.5 * dpr, 0.3], [1.2 * dpr, 0.5]]) {
      ctx.globalAlpha = a;
      ctx.lineWidth = w;
      ctx.beginPath();
      strokeRun(hz);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFar() {
    // Distant structure, sunk into the haze so it stays background.
    for (const [x, z] of SCENE.columns) {
      const a = P([x, 0, z]), b = P([x, 4.4, z]);
      if (!a || !b) continue;
      const w = Math.max(2, f * 0.28 / a[2]);
      ctx.globalAlpha = clamp(0.62 - a[2] / 40, 0.1, 0.4);
      ctx.fillStyle = PAL.far;
      ctx.fillRect(a[0] - w, b[1], w * 2, a[1] - b[1]);
      ctx.globalAlpha *= 0.5;
      ctx.fillStyle = PAL.haze;
      ctx.fillRect(a[0] - w, b[1], w * 0.5, a[1] - b[1]);
    }
    ctx.globalAlpha = 1;
  }

  function drawWall() {
    const face = WALL_Z - WALL_T / 2 - 0.002;
    COURSES.forEach(([y, x0, x1], ci) => {
      // Each course is one box; the running bond is drawn onto the near face.
      // Fifty individual block meshes would cost ten times as much and look
      // the same at this distance.
      const shade = 1 + ((ci % 2) ? -0.035 : 0.03);
      drawBox(box([(x0 + x1) / 2, y, WALL_Z], [x1 - x0, 0.19, WALL_T]), PAL.block, { shade });

      const off = (ci % 2) * 0.195;
      ctx.lineCap = 'butt';
      // bed joint (recessed mortar reads as a shadow, then a highlight below)
      ctx.strokeStyle = 'rgba(0,0,0,0.34)';
      ctx.lineWidth = Math.max(1, dpr * 1.6);
      ctx.beginPath();
      strokeRun(edge([x0, y + 0.095, face], [x1, y + 0.095, face], 8));
      ctx.stroke();
      // perpends
      ctx.strokeStyle = 'rgba(0,0,0,0.26)';
      ctx.lineWidth = Math.max(1, dpr * 1.2);
      ctx.beginPath();
      for (let x = x0 + 0.195 + off; x < x1 - 0.04; x += 0.39) {
        strokeRun(edge([x, y - 0.09, face], [x, y + 0.09, face], 2));
      }
      ctx.stroke();
    });

    // Starter bars left proud of the top course for the next lift. The most
    // recognisable thing on a half-built block wall.
    for (let x = -1.10; x < 2.4; x += 0.78) {
      const top = x < 0.905 ? 0.95 : x < 2.15 ? 0.76 : 0.57;
      tube([x, top - 0.1, WALL_Z], [x, top + 0.44, WALL_Z], 0.011, 0.010, PAL.rebar);
    }
  }

  /** The stocked pallet beyond the wall, drawn before it so the wall
      occludes it correctly. */
  function drawFarPallet() {
    drawBox(box([2.05, 0.07, 5.40], [1.05, 0.14, 1.10]), PAL.timber);
    drawBox(box([2.05, 0.52, 5.40], [0.99, 0.76, 1.02]), PAL.block, { shade: 0.94 });
  }

  function drawPallet() {
    drawBox(SCENE.pallet[0], PAL.timber);
    drawBox(SCENE.pallet[1], PAL.block);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const y = 0.14 + i * 0.19;
      strokeRun(edge([PALLET_X - 0.5, y, PALLET_Z - 0.51], [PALLET_X + 0.5, y, PALLET_Z - 0.51], 4));
    }
    ctx.stroke();
  }

  function drawScaffold() {
    const S = SCENE.scaffold;
    for (const [x, z] of S.posts) tube([x, 0, z], [x, S.height, z], 0.024, 0.024, PAL.steel);
    for (const y of S.ledgers) {
      for (const x of [2.86, 3.94]) tube([x, y, 0.90], [x, y, 5.70], 0.021, 0.021, tint(PAL.steel, 0.82));
      for (const z of [0.90, 3.30, 5.70]) tube([2.86, y, z], [3.94, y, z], 0.021, 0.021, tint(PAL.steel, 0.94));
    }
    // diagonal brace: the giveaway that it is a scaffold and not a shelf
    tube([2.86, 0.10, 0.90], [2.86, 2.30, 3.30], 0.017, 0.017, tint(PAL.steel, 0.88));
    tube([2.86, 0.10, 3.30], [2.86, 2.30, 5.70], 0.017, 0.017, tint(PAL.steel, 0.88));
    // planking on the first lift
    drawBox(box([3.40, 1.46, 3.30], [1.06, 0.05, 4.80]), PAL.timber);
  }

  function drawRebar() {
    const R = SCENE.rebar;
    for (let i = 0; i < R.n; i++) {
      const x = R.x - 0.5 + (i / (R.n - 1)) * 1.0;
      tube([x, 0.026, R.z0], [x, 0.026, R.z1], 0.014, 0.014, i % 2 ? PAL.rebar : tint(PAL.rebar, 1.12));
    }
    tube([R.x - 0.62, 0.05, R.z0 + 0.35], [R.x + 0.62, 0.05, R.z0 + 0.35], 0.02, 0.02, PAL.steel);
  }

  function drawFormwork() {
    for (const b of SCENE.formwork) drawBox(b, PAL.timber, { edges: true });
  }

  function drawMotes(t) {
    ctx.fillStyle = 'rgba(255,246,232,0.5)';
    for (const m of MOTES) {
      const y = m.y + 0.18 * Math.sin(t * TAU * 0.35 + m.s * 9);
      const x = m.x + 0.12 * Math.sin(t * TAU * 0.21 + m.s * 5);
      const p = P([x, y, m.z]);
      if (!p || p[2] > 9) continue;
      ctx.globalAlpha = clamp(0.5 - p[2] * 0.05, 0.04, 0.4);
      ctx.beginPath();
      ctx.arc(p[0], p[1], Math.max(0.7, m.r * dpr * 0.9 / Math.max(0.6, p[2])), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---- the worker's own hands --------------------------------------------

  const REST = (side) => [0.255 * side, -0.760, 0.185];
  // Carried low and well out from the chest. A block held up by your face
  // reads as a prop, not as work, and it swallows the frame.
  const HELD = (side) => [0.215 * side, -0.580, 0.820];

  /** Body-space anchor + grip amount + orientation for one hand at time t. */
  function handState(t, side) {
    t = wrap01(t);
    // Offset along the block's own long axis (world x while it is at rest),
    // then convert. Offsetting in body space would put the hands across the
    // block's depth instead of on its ends.
    const gripPick  = () => worldToBody([PICK[0]  + 0.205 * side, PICK[1]  + 0.02, PICK[2]]);
    const gripPlace = () => worldToBody([PLACE[0] + 0.205 * side, PLACE[1] + 0.02, PLACE[2]]);

    let a, b, k;
    if (t < 0.10)       { a = REST(side),      b = REST(side),      k = 0; }
    else if (t < 0.22)  { a = REST(side),      b = gripPick(),      k = (t - 0.10) / 0.12; }
    else if (t < 0.30)  { a = gripPick(),      b = gripPick(),      k = 0; }
    else if (t < 0.42)  { a = gripPick(),      b = HELD(side),      k = (t - 0.30) / 0.12; }
    else if (t < 0.60)  { a = HELD(side),      b = HELD(side),      k = 0; }
    else if (t < 0.72)  { a = HELD(side),      b = gripPlace(),     k = (t - 0.60) / 0.12; }
    else if (t < 0.80)  { a = gripPlace(),     b = gripPlace(),     k = 0; }
    else if (t < 0.90)  { a = gripPlace(),     b = REST(side),      k = (t - 0.80) / 0.10; }
    else                { a = REST(side),      b = REST(side),      k = 0; }

    k = smooth(clamp(k, 0, 1));
    const pos = [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

    // Arm swing while walking, only when the hands are empty
    const seg = segmentAt(t);
    if (WALKING[seg.id] && (t < 0.14 || t > 0.86)) {
      const local = (t - seg.t0) / (seg.t1 - seg.t0);
      const env = Math.sin(Math.PI * local);
      pos[2] += 0.09 * Math.sin(t * DUR * 3.4) * side * env;
    }

    let grip = 0;
    if (t >= 0.22 && t < 0.28) grip = smooth((t - 0.22) / 0.06);
    else if (t >= 0.28 && t < 0.76) grip = 1;
    else if (t >= 0.76 && t < 0.80) grip = 1 - smooth((t - 0.76) / 0.04);

    // Palm turns inward and downward as the grip closes.
    const yaw = lerp(-0.55 * side, -1.28 * side, grip);
    const pitch = lerp(-1.05, -0.28, grip);
    const roll = lerp(0.25 * side, 0.06 * side, grip);
    return { pos, grip, yaw, pitch, roll };
  }

  function rotate(p, yaw, pitch, roll) {
    let [x, y, z] = p;
    let c = Math.cos(roll), s = Math.sin(roll);
    [x, y] = [x * c - y * s, x * s + y * c];
    c = Math.cos(pitch); s = Math.sin(pitch);
    [y, z] = [y * c - z * s, y * s + z * c];
    c = Math.cos(yaw); s = Math.sin(yaw);
    [x, z] = [x * c + z * s, -x * s + z * c];
    return [x, y, z];
  }

  function handPoints(t, side) {
    const st = handState(t, side);
    const loc = handLocal(st.grip, side);
    const pts = loc.map((p) => {
      const r = rotate(p, st.yaw, st.pitch, st.roll);
      return [st.pos[0] + r[0], st.pos[1] + r[1], st.pos[2] + r[2]];
    });
    return { pts, st, side };
  }

  function drawArm(hand) {
    const side = hand.side;
    const w = hand.pts[0];
    const elbow = [0.36 * side, -0.98, -0.30];
    const at = (k) => [lerp(elbow[0], w[0], k), lerp(elbow[1], w[1], k), lerp(elbow[2], w[2], k)];

    // Upper sleeve, lower sleeve, then the cuff. Three tapering runs read as
    // a limb where one uniform tube reads as a pipe.
    tube(elbow, at(0.5), 0.088, 0.066, PAL.sleeveLo, true);
    tube(at(0.46), at(0.86), 0.068, 0.050, PAL.sleeve, true);
    tube(at(0.84), w, 0.050, 0.043, PAL.gloveLo, true);
    // a hi-vis band near the cuff
    tube(at(0.72), at(0.80), 0.056, 0.053, tint(PAL.sleeve, 1.28), true);

    // palm: a filled hull over wrist + the knuckle row
    const hull = [0, 1, 5, 9, 13, 17].map((i) => PB(hand.pts[i])).filter(Boolean);
    if (hull.length > 2) {
      ctx.beginPath();
      ctx.moveTo(hull[0][0], hull[0][1]);
      for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i][0], hull[i][1]);
      ctx.closePath();
      ctx.fillStyle = PAL.glove;
      ctx.fill();
    }
    // fingers
    for (const [a, b] of HAND_BONES) {
      if (a === 0 && b === 17) continue;
      tube(hand.pts[a], hand.pts[b], 0.0145, 0.0115, PAL.gloveLo, true);
    }
  }

  // ---- annotation overlays ------------------------------------------------

  function blockPos(t) {
    t = wrap01(t);
    if (t < GRIP_T0) return PICK;
    if (t >= GRIP_T1) return PLACE;
    const r = handPoints(t, 1).pts[0], l = handPoints(t, -1).pts[0];
    return bodyToWorld([(r[0] + l[0]) / 2, (r[1] + l[1]) / 2 + 0.01, (r[2] + l[2]) / 2]);
  }

  /** The block as a yawed box: while it is held it turns with the carrier. */
  function carriedBlock(t) {
    const held = wrap01(t) >= GRIP_T0 && wrap01(t) < GRIP_T1;
    return box(blockPos(t), [BLK.w, BLK.h, BLK.d], held ? cam.bodyYaw : 0);
  }

  function trackedObjects(t) {
    const top = COURSES[COURSES.length - 1];
    return [
      { id: 'blk_07', cls: 'cmu_block',   conf: 0.98, b: carriedBlock(t) },
      { id: 'crs_04', cls: 'wall_course', conf: 0.99, b: box([(top[1] + top[2]) / 2, top[0], WALL_Z], [top[2] - top[1], 0.19, WALL_T]) },
      { id: 'plt_01', cls: 'block_pallet',conf: 0.97, b: SCENE.pallet[1] },
      { id: 'scf_01', cls: 'scaffold_bay',conf: 0.94, b: box([3.40, 1.28, 3.30], [1.30, 2.55, 4.90]) },
      { id: 'reb_03', cls: 'rebar_bundle',conf: 0.96, b: box([SCENE.rebar.x, 0.06, (SCENE.rebar.z0 + SCENE.rebar.z1) / 2], [1.15, 0.09, SCENE.rebar.z1 - SCENE.rebar.z0]) },
    ];
  }

  function screenBox(b) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, near = 1e9;
    for (let i = 0; i < 8; i++) {
      const p = P(boxPt(b, i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1));
      if (!p) return null;
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      near = Math.min(near, p[2]);
    }
    if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) return null;
    return { x0, y0, x1, y1, z: near };
  }

  const U = () => unit;                                   // overlay unit scale

  function drawBoxes(t, alpha) {
    const u = U();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.6 * u;
    ctx.font = `500 ${10.5 * u}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'alphabetic';

    // Everything in view gets a box; only the nearest few get a label, or the
    // frame turns into unreadable soup.
    const seen = trackedObjects(t)
      .map((o) => ({ o, r: screenBox(o.b) }))
      .filter((x) => x.r)
      .sort((a, b) => a.r.z - b.r.z);
    // A label pinned to a box whose centre is off-frame just piles up against
    // the edge, so those go unlabelled.
    const labelled = new Set(seen
      .filter(({ r }) => {
        const my = (r.y0 + r.y1) / 2;
        // The caption hangs off the box's top-left, so that corner has to be
        // on the canvas too. Clamping alone just stacks captions on the edge.
        return r.x0 > 0 && r.x0 < W * 0.92 && my > 0 && my < H;
      })
      .slice(0, W / dpr < 620 ? 1 : 3).map((x) => x.o.id));

    for (const { o, r } of seen) {
      const held = o.id === 'blk_07' && t >= GRIP_T0 && t < GRIP_T1;
      const col = held ? PAL.flare : 'rgba(242,239,233,0.72)';

      // corner brackets rather than a full rectangle: reads as a tool, not a border
      const s = Math.min(18 * u, (r.x1 - r.x0) * 0.32, (r.y1 - r.y0) * 0.32);
      ctx.strokeStyle = col;
      ctx.globalAlpha = alpha * (held ? 1 : 0.72);
      ctx.beginPath();
      ctx.moveTo(r.x0, r.y0 + s); ctx.lineTo(r.x0, r.y0); ctx.lineTo(r.x0 + s, r.y0);
      ctx.moveTo(r.x1 - s, r.y0); ctx.lineTo(r.x1, r.y0); ctx.lineTo(r.x1, r.y0 + s);
      ctx.moveTo(r.x1, r.y1 - s); ctx.lineTo(r.x1, r.y1); ctx.lineTo(r.x1 - s, r.y1);
      ctx.moveTo(r.x0 + s, r.y1); ctx.lineTo(r.x0, r.y1); ctx.lineTo(r.x0, r.y1 - s);
      ctx.stroke();

      if (held) {
        ctx.globalAlpha = alpha * 0.10;
        ctx.fillStyle = PAL.flare;
        ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
        ctx.globalAlpha = alpha;
      }

      ctx.globalAlpha = alpha;
      if (alpha < 0.9 || !labelled.has(o.id)) continue;

      const label = `${o.cls} · ${o.id} · ${o.conf.toFixed(2)}`;
      const tw = ctx.measureText(label).width;
      const ly = r.y0 - 6 * u < 14 * u ? r.y1 + 15 * u : r.y0 - 6 * u;
      const lx = clamp(r.x0, 4 * u, W - tw - 14 * u);
      ctx.fillStyle = held ? PAL.flare : 'rgba(11,11,12,0.72)';
      ctx.fillRect(lx, ly - 11 * u, tw + 10 * u, 14 * u);
      ctx.fillStyle = held ? '#14100c' : 'rgba(242,239,233,0.9)';
      ctx.fillText(label, lx + 5 * u, ly - 1 * u);
    }
    ctx.restore();
  }

  function drawHandKeypoints(t, alpha) {
    const u = U();
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const side of [1, -1]) {
      const hand = handPoints(t, side);
      const scr = hand.pts.map(PB);

      // Scale the markers to how big the hand actually is on screen, using
      // the wrist-to-middle-knuckle span as the ruler.
      const ref = scr[0] && scr[9]
        ? Math.hypot(scr[9][0] - scr[0][0], scr[9][1] - scr[0][1]) : 22 * u;
      const kp = clamp(ref * 0.088, 1.5 * u, 4 * u);

      ctx.strokeStyle = 'rgba(242,239,233,0.85)';
      ctx.lineWidth = clamp(ref * 0.05, 1 * u, 2.2 * u);
      ctx.beginPath();
      for (const [a, b] of HAND_BONES) {
        if (!scr[a] || !scr[b]) continue;
        ctx.moveTo(scr[a][0], scr[a][1]);
        ctx.lineTo(scr[b][0], scr[b][1]);
      }
      ctx.stroke();

      for (let i = 0; i < scr.length; i++) {
        const p = scr[i];
        if (!p) continue;
        const tip = i > 0 && i % 4 === 0;
        ctx.beginPath();
        ctx.arc(p[0], p[1], kp * (i === 0 ? 1.5 : tip ? 1.2 : 0.9), 0, TAU);
        ctx.fillStyle = i === 0 ? PAL.flare : tip ? PAL.hot : '#fff';
        ctx.fill();
      }

      const wrist = scr[0];
      if (wrist && alpha > 0.9) {
        const grasp = hand.st.grip > 0.6 ? (side > 0 ? 'power' : 'support') : 'open';
        const label = `hand_${side > 0 ? 'r' : 'l'} · 21/21 · ${grasp}`;
        ctx.font = `500 ${10 * u}px "JetBrains Mono", ui-monospace, monospace`;
        const tw = ctx.measureText(label).width;
        // Push each caption outboard and stagger them vertically. The wrists
        // sit close together on a two-handed grip and the labels would merge.
        const bx = side > 0
          ? clamp(wrist[0] + 14 * u, 4 * u, W - tw - 14 * u)
          : clamp(wrist[0] - tw - 23 * u, 4 * u, W - tw - 14 * u);
        const by = wrist[1] + (side > 0 ? -14 : 20) * u;
        ctx.fillStyle = 'rgba(11,11,12,0.8)';
        ctx.fillRect(bx, by - 8 * u, tw + 9 * u, 14 * u);
        ctx.fillStyle = PAL.hot;
        ctx.fillText(label, bx + 4.5 * u, by + 2.4 * u);
      }
    }
    ctx.restore();
  }

  function gazeTarget(t) {
    t = wrap01(t);
    if (t < 0.10) return [PICK[0], PICK[1] + 0.1, PICK[2]];
    if (t < 0.44) return blockPos(t);
    if (t < 0.62) return [PLACE[0], PLACE[1] + 0.05, PLACE[2]];
    if (t < 0.80) return blockPos(t);
    return [PICK[0], PICK[1] + 0.1, PICK[2]];
  }

  function drawGaze(t, alpha) {
    const u = U();
    const g = gazeTarget(t);
    const s = t * DUR;
    const p = P([g[0] + 0.02 * Math.sin(s * 1.7), g[1] + 0.02 * Math.cos(s * 2.3), g[2]]);
    if (!p) return;
    const r = 16 * u;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = PAL.flare;
    ctx.lineWidth = 1.4 * u;

    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, TAU);
    ctx.stroke();

    // dwell arc: fills over the current segment
    const seg = segmentAt(t);
    const dwell = clamp((wrap01(t) - seg.t0) / (seg.t1 - seg.t0), 0, 1);
    ctx.lineWidth = 2.6 * u;
    ctx.beginPath();
    ctx.arc(p[0], p[1], r + 4 * u, -Math.PI / 2, -Math.PI / 2 + dwell * TAU);
    ctx.stroke();

    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      ctx.moveTo(p[0] + dx * r * 0.42, p[1] + dy * r * 0.42);
      ctx.lineTo(p[0] + dx * r * 0.82, p[1] + dy * r * 0.82);
    }
    ctx.stroke();
    ctx.fillStyle = PAL.flare;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 1.9 * u, 0, TAU);
    ctx.fill();

    if (alpha < 0.9) { ctx.restore(); return; }
    ctx.font = `500 ${10 * u}px "JetBrains Mono", ui-monospace, monospace`;
    const gl = `gaze · dwell ${Math.round(dwell * (seg.t1 - seg.t0) * DUR * 1000)}ms`;
    const gw = ctx.measureText(gl).width;
    // flip the caption to the inboard side when the reticle nears an edge
    const gx = p[0] + r + 8 * u + gw > W - 8 * u ? p[0] - r - 8 * u - gw : p[0] + r + 8 * u;
    ctx.fillText(gl, gx, p[1] - r * 0.4);
    ctx.restore();
  }

  function drawContact(t, alpha) {
    const u = U();
    t = wrap01(t);
    const make = t >= 0.22 && t < 0.36;
    const brk = t >= 0.74 && t < 0.86;
    if (!make && !brk && !(t >= GRIP_T0 && t < GRIP_T1)) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    for (const side of [1, -1]) {
      const hand = handPoints(t, side);
      const p = PB(hand.pts[9]);                       // middle-finger knuckle
      if (!p) continue;
      if (make || brk) {
        const k = make ? (t - 0.22) / 0.14 : (t - 0.74) / 0.12;
        for (let i = 0; i < 2; i++) {
          const kk = clamp(k + i * 0.28, 0, 1);
          ctx.globalAlpha = alpha * (1 - kk) * 0.9;
          ctx.strokeStyle = PAL.flare;
          ctx.lineWidth = 2 * u * (1 - kk * 0.5);
          ctx.beginPath();
          ctx.arc(p[0], p[1], (6 + kk * 34) * u, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = alpha;
      }
      ctx.fillStyle = PAL.flare;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3.4 * u, 0, TAU);
      ctx.fill();
    }

    if (alpha < 0.9) { ctx.restore(); return; }
    const label = make ? 'contact make · blk_07 · power'
      : brk ? 'contact break · blk_07'
      : `contact held · blk_07 · ${((t - GRIP_T0) * DUR).toFixed(1)}s`;
    ctx.font = `500 ${10.5 * u}px "JetBrains Mono", ui-monospace, monospace`;
    const tw = ctx.measureText(label).width;
    const top = cfg.chipAnchor === 'top';
    const by = top ? (cfg.chipOffset + 26) * dpr : H - (cfg.chipOffset + 46) * dpr;
    ctx.fillStyle = PAL.flare;
    ctx.fillRect(W / 2 - tw / 2 - 8 * u, by, tw + 16 * u, 17 * u);
    ctx.fillStyle = '#14100c';
    ctx.fillText(label, W / 2 - tw / 2, by + 12 * u);
    ctx.restore();
  }

  function drawAction(t, alpha) {
    const u = U();
    const seg = segmentAt(t);
    const f0 = Math.round(seg.t0 * DUR * FPS), f1 = Math.round(seg.t1 * DUR * FPS);
    const label = `${seg.verb}(${seg.obj}) · frames ${f0}-${f1}`;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `500 ${11 * u}px "JetBrains Mono", ui-monospace, monospace`;
    const tw = ctx.measureText(label).width;
    const bw = tw + 18 * u, bh = 20 * u;
    const bx = W / 2 - bw / 2;
    // Chip placement is in css px (dpr), not overlay units. It has to clear
    // real page furniture like the header and the scrub bar.
    const by = cfg.chipAnchor === 'top' ? cfg.chipOffset * dpr : H - (cfg.chipOffset + 20) * dpr;
    ctx.fillStyle = 'rgba(11,11,12,0.78)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(255,90,31,0.6)';
    ctx.lineWidth = 1 * u;
    ctx.strokeRect(bx, by, bw, bh);
    // progress through the segment
    const k = clamp((wrap01(t) - seg.t0) / (seg.t1 - seg.t0), 0, 1);
    ctx.fillStyle = PAL.flare;
    ctx.fillRect(bx, by + bh - 2 * u, bw * k, 2 * u);
    ctx.fillStyle = PAL.bone;
    ctx.fillText(label, bx + 9 * u, by + 14 * u);
    ctx.restore();
  }

  // ---- frame --------------------------------------------------------------

  let lastT = 0;

  function render(t) {
    lastT = t;
    if (!resize()) return;

    const h = headAt(t);
    cam.p = h.pos;
    cam.yaw = h.yaw + lookX;
    cam.pitch = h.pitch + lookY;
    cam.bodyYaw = h.bodyYaw;
    cam.roll = h.roll;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    // camera roll, applied to the whole frame
    ctx.translate(cx, cy);
    ctx.rotate(cam.roll);
    ctx.scale(1.06, 1.06);                             // hide the rolled corners
    ctx.translate(-cx, -cy);

    drawSky();
    drawFar();
    drawGround();

    // back to front
    drawRebar();
    drawFarPallet();
    drawScaffold();
    drawWall();
    drawFormwork();
    drawPallet();

    drawCMU(carriedBlock(t), PAL.blockHi);

    if (cfg.quality > 0.8) drawMotes(t);

    const rh = handPoints(t, 1), lh = handPoints(t, -1);
    // draw the far hand first
    const order = bodyToCam(rh.pts[0])[2] > bodyToCam(lh.pts[0])[2] ? [rh, lh] : [lh, rh];
    for (const hd of order) drawArm(hd);

    // overlays
    const L = cfg.layers;
    const dim = (id) => (cfg.focus && cfg.focus !== id ? 0.3 : 1);
    if (L.objects) drawBoxes(t, dim('objects'));
    if (L.hands)   drawHandKeypoints(t, dim('hands'));
    if (L.gaze)    drawGaze(t, dim('gaze'));
    if (L.contact) drawContact(t, dim('contact'));
    if (L.action)  drawAction(t, dim('action'));

    ctx.restore();
  }

  // ---- look control -------------------------------------------------------

  function attachLook(host) {
    if (REDUCED) return;
    host.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = host.getBoundingClientRect();
      wantX = ((e.clientX - r.left) / r.width - 0.5) * 0.34;
      wantY = -((e.clientY - r.top) / r.height - 0.5) * 0.20;
    }, { passive: true });
    host.addEventListener('pointerleave', () => { wantX = 0; wantY = 0; }, { passive: true });
  }

  function easeLook() {
    lookX += (wantX - lookX) * 0.055;
    lookY += (wantY - lookY) * 0.055;
  }

  function idleSway(t) {                                // for the non-interactive viewer
    wantX = 0.055 * Math.sin(t * 0.31);
    wantY = 0.030 * Math.sin(t * 0.23 + 1.4);
  }

  // Instances that render statically (reduced motion, or a viewer that is off
  // screen) still have to survive a window resize, so redraw on geometry
  // change rather than relying on the animation loop to notice.
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => render(lastT)).observe(canvas);
  } else {
    addEventListener('resize', () => render(lastT));
  }

  return { render, resize, attachLook, easeLook, idleSway, cfg,
    setLayers: (l) => { cfg.layers = l; }, setFocus: (fo) => { cfg.focus = fo; } };
}

/* ==========================================================================
   5. Hero: wiring the feed to its controls
   ========================================================================== */

function timecode(t) {
  const total = TC_BASE + t * DUR;
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor(total / 60) % 60).padStart(2, '0');
  const ss = String(Math.floor(total) % 60).padStart(2, '0');
  const ff = String(Math.floor((total % 1) * FPS)).padStart(2, '0');
  return `${hh}:${mm}:${ss}:${ff}`;
}

function initHero() {
  const hero = document.querySelector('.hero');
  const canvas = hero && hero.querySelector('[data-pov="hero"]');
  if (!canvas) return null;

  const pov = createPOV(canvas, {
    quality: 1, interactive: true, chipAnchor: 'top', chipOffset: 126, shiftX: 0.14,
  });
  pov.attachLook(hero);

  const playBtn = hero.querySelector('.scrub-play');
  const range = hero.querySelector('.track input');
  const head = hero.querySelector('[data-playhead]');
  const segsEl = hero.querySelector('[data-segs]');
  const tcEl = hero.querySelector('[data-hud="timecode"]');
  const phaseEl = hero.querySelector('[data-hud="phase"]');
  const clockEl = hero.querySelector('[data-hud="clock"]');

  // Build the segmentation track from the same table the sim runs on.
  const segNodes = SEGMENTS.map((s) => {
    const el = document.createElement('span');
    el.style.flex = `${(s.t1 - s.t0) * 1000} 0 0`;
    el.dataset.label = s.id;
    segsEl.appendChild(el);
    return el;
  });

  let t = REDUCED ? 0.30 : 0;
  let playing = !REDUCED;
  let last = performance.now();
  let visible = true;
  let running = false;
  let lastSeg = null;

  const draw = () => { pov.render(t); chrome(); };

  // Under reduced motion the loop is not running, so anything the visitor
  // drives has to start it, otherwise play and scrub are dead controls.
  const ensureLoop = () => {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  };

  const setPlaying = (v) => {
    playing = v;
    playBtn.classList.toggle('paused', !v);
    playBtn.setAttribute('aria-label', v ? 'Pause capture' : 'Play capture');
    if (v) { last = performance.now(); ensureLoop(); }
  };
  setPlaying(playing);

  playBtn.addEventListener('click', () => setPlaying(!playing));
  range.addEventListener('input', () => {
    setPlaying(false);
    t = Number(range.value) / 1000;
    draw();
  });

  // Layer toggles
  const layers = { hands: 1, objects: 1, gaze: 1, contact: 1, action: 1 };
  hero.querySelectorAll('.lyr').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.layer;
      layers[id] = layers[id] ? 0 : 1;
      btn.setAttribute('aria-pressed', String(!!layers[id]));
      pov.setLayers(layers);
      draw();
    });
  });

  function chrome() {
    tcEl.textContent = timecode(t);
    clockEl.textContent = `${(t * DUR).toFixed(1)} / ${DUR.toFixed(1)}s`;
    const seg = segmentAt(t);
    if (seg !== lastSeg) {
      lastSeg = seg;
      phaseEl.textContent = seg.id;
    }
    const idx = SEGMENTS.indexOf(seg);
    segNodes.forEach((n, i) => {
      n.classList.toggle('on', i === idx);
      n.classList.toggle('done', i < idx);
    });
    head.style.transform = `translateX(${wrap01(t) * segsEl.offsetWidth}px)`;
    range.value = Math.round(wrap01(t) * 1000);
  }

  function frame(now) {
    // dt is capped so a throttled or backgrounded tab slows the take down
    // rather than jumping it forward on the next visible frame.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      if (visible) {
        if (playing) t = wrap01(t + dt / DUR);
        pov.easeLook();
        pov.render(t);
        chrome();
      }
    } finally {
      // Always re-arm: one bad frame must not stop the feed for good.
      requestAnimationFrame(frame);
    }
  }

  if (REDUCED) {
    requestAnimationFrame(draw);
  } else {
    ensureLoop();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible) last = performance.now();
      }, { threshold: 0 }).observe(hero);
    }
  }

  return pov;
}

/* ==========================================================================
   6. Annotation stack viewer
   ========================================================================== */

const LAYER_ORDER = ['rgb', 'hands', 'objects', 'gaze', 'contact', 'action'];

function initStack() {
  const section = document.getElementById('stack');
  const canvas = section && section.querySelector('[data-pov="stack"]');
  if (!canvas) return;

  // A detail view, not a second hero: tighter lens, and framed over the hands
  // so 21 keypoints are actually countable.
  const pov = createPOV(canvas, { quality: 0.7, fov: 86, chipOffset: 12 });
  const rows = Array.from(section.querySelectorAll('.sl'));
  const tagEl = section.querySelector('[data-hud="stack-tag"]');
  const countEl = section.querySelector('[data-hud="stack-count"]');

  // Mid-grasp: the one moment where all six layers have something to show:
  // hands closing, block boxed, gaze on target, a live contact event.
  const FROZEN = 0.28;
  let active = 0;
  let held = false;
  let timer = null;
  let visible = false;

  function apply(i) {
    active = clamp(i, 0, LAYER_ORDER.length - 1);
    const id = LAYER_ORDER[active];
    const layers = {};
    // cumulative: everything up to and including the active layer
    for (let k = 1; k <= active; k++) layers[LAYER_ORDER[k]] = 1;
    pov.setLayers(layers);
    pov.setFocus(active === 0 ? null : id);

    rows.forEach((r, k) => {
      r.classList.toggle('on', k === active);
      if (k === active) { r.classList.remove('on'); void r.offsetWidth; r.classList.add('on'); }
    });
    tagEl.textContent = active === 0 ? 'RGB' : id.toUpperCase();
    countEl.textContent = `layer ${active + 1} / ${LAYER_ORDER.length}`;
    if (!raf) pov.render(FROZEN);      // no loop running: repaint on demand
  }

  function schedule() {
    clearTimeout(timer);
    if (REDUCED || held || !visible) return;
    timer = setTimeout(() => { apply((active + 1) % LAYER_ORDER.length); schedule(); }, 7000);
  }

  let raf = null;

  rows.forEach((row, i) => {
    row.querySelector('button').addEventListener('click', () => {
      held = true;
      rows.forEach((r) => r.classList.add('held'));
      apply(i);
      clearTimeout(timer);
    });
  });

  apply(0);

  function frame(now) {
    try {
      if (visible) {
        pov.idleSway(now / 1000);
        pov.easeLook();
        pov.render(FROZEN);
      }
    } finally {
      raf = requestAnimationFrame(frame);
    }
  }

  if (REDUCED) {
    // one static pass once layout has settled
    requestAnimationFrame(() => pov.render(FROZEN));
    visible = true;
  } else if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
      if (visible) schedule(); else clearTimeout(timer);
    }, { threshold: 0.15 }).observe(section);
  } else {
    visible = true;
    raf = requestAnimationFrame(frame);
    schedule();
  }
}

/* ==========================================================================
   7. Reveals, header, counters, and the rest of the page
   ========================================================================== */

function initReveals() {
  // Masked rise: wrap the contents so they can slide out of a clipped box.
  document.querySelectorAll('[data-rise]').forEach((el, i) => {
    const inner = document.createElement('span');
    inner.className = 'rise-i';
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);
    el.style.setProperty('--rd', `${(i % 4) * 60}ms`);
  });

  document.querySelectorAll('[data-stagger]').forEach((g) => {
    Array.from(g.children).forEach((c, i) => c.style.setProperty('--sd', `${i * 85}ms`));
  });

  const targets = document.querySelectorAll('[data-rise], [data-stagger]');

  if (!('IntersectionObserver' in window) || REDUCED) {
    targets.forEach((el) => el.classList.add('seen'));
    document.querySelectorAll('h1, h2').forEach((el) => el.classList.add('seen'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('seen');
      io.unobserve(e.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });

  targets.forEach((el) => io.observe(el));

  // Hero copy is above the fold, so reveal it immediately.
  requestAnimationFrame(() => {
    document.querySelectorAll('.hero [data-rise]').forEach((el) => el.classList.add('seen'));
  });
}

function initHeader() {
  const header = document.querySelector('[data-header]');
  const onScroll = () => header.classList.toggle('stuck', window.scrollY > 12);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  // Swap the header to ink-on-paper while a paper band is under it.
  const themed = document.querySelectorAll('[data-theme]');
  if ('IntersectionObserver' in window && themed.length) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        header.classList.toggle('on-paper', e.target.dataset.theme === 'paper');
      }
    }, { rootMargin: `-${68}px 0px -100% 0px`, threshold: 0 });
    themed.forEach((s) => io.observe(s));
  }

  // Active section in the nav
  const links = Array.from(document.querySelectorAll('.site-nav a'));
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = `#${e.target.id}`;
        links.forEach((a) => a.classList.toggle('here', a.getAttribute('href') === id));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s));
  }
}

function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('mobile-nav');
  if (!toggle || !nav) return;

  const set = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('open', open);
    document.body.classList.toggle('locked', open);
    if (open) nav.removeAttribute('inert'); else nav.setAttribute('inert', '');
  };

  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}

function initCounters() {
  const els = document.querySelectorAll('[data-counter]');
  const run = (el) => {
    const target = parseFloat(el.dataset.counter);
    const dp = parseInt(el.dataset.decimals || '0', 10);
    if (REDUCED) { el.textContent = target.toFixed(dp); return; }
    const t0 = performance.now(), dur = 1500;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = (target * (1 - Math.pow(1 - k, 4))).toFixed(dp);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      run(e.target);
      io.unobserve(e.target);
    }
  }, { threshold: 0.6 });
  els.forEach((el) => io.observe(el));
}

function initRail() {
  const rail = document.querySelector('[data-railfill]');
  const steps = document.querySelector('[data-rail]');
  if (!rail || !steps || REDUCED) { if (rail) rail.style.width = '100%'; return; }

  let ticking = false;
  const update = () => {
    ticking = false;
    const r = steps.getBoundingClientRect();
    const vh = innerHeight;
    const k = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35), 0, 1);
    rail.style.width = `${k * 100}%`;
  };
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}

/* ==========================================================================
   8. Contact form

   A form with action="mailto:" is not a working form: browsers hand it to the
   OS mail handler inconsistently, and on a machine with no desktop mail client
   configured the submit silently does nothing. So: POST to a real endpoint if
   one is configured, otherwise compose a pre-filled message the visitor can
   actually see and send.
   ========================================================================== */

function initForm() {
  const form = document.querySelector('[data-form]');
  if (!form) return;

  const status = form.querySelector('[data-form-status]');
  const btn = form.querySelector('button[type="submit"]');
  const label = btn.textContent;

  const say = (msg, kind) => {
    status.textContent = msg;
    status.dataset.kind = kind || '';
  };

  const firstInvalid = () => {
    for (const el of form.elements) {
      if (el.willValidate && !el.checkValidity()) return el;
    }
    return null;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const bad = firstInvalid();
    if (bad) {
      bad.focus();
      say(bad.validity.typeMismatch
        ? 'That email address does not look right.'
        : 'Please fill in your name and work email.', 'bad');
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    const endpoint = form.dataset.endpoint;

    if (endpoint) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
      say('');
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        say('Sent. We will reply within two business days.', 'good');
      } catch (err) {
        say('That did not go through. Email us directly at ' + form.dataset.mailto + '.', 'bad');
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
      return;
    }

    // No endpoint configured, so open a pre-filled message. Navigating to a
    // mailto: URL is handled far more reliably than submitting a form to one,
    // and webmail users can register a handler for it.
    const subject = `Sample clip request from ${data.name || 'the Farasa site'}`;
    const body = [
      `Name: ${data.name || ''}`,
      `Work email: ${data.email || ''}`,
      '',
      'What are you building?',
      data.message || '',
    ].join('\n');
    const url = `mailto:${form.dataset.mailto}`
      + `?subject=${encodeURIComponent(subject)}`
      + `&body=${encodeURIComponent(body)}`;

    say('Opening your email app… if nothing happens, write to ' + form.dataset.mailto + '.');
    window.location.href = url;
  });
}

/* ==========================================================================
   9. Boot
   ========================================================================== */

initReveals();
initHeader();
initMobileNav();
initCounters();
initRail();
initForm();
initHero();
initStack();
