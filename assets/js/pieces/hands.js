// hands: both hands from a real head-cam clip, tracked at 21 keypoints each, drawn as ascii.
// Follows the ascii.rest piece contract (meta + default(options) => frame(t)).
// Keypoints: MediaPipe Hand Landmarker on Egocentric-10K footage (Build AI, Apache 2.0).
export const meta = {
  name: "hands",
  category: "data",
  note: "two tracked hands, 21 keypoints each, from first-person footage",
  cols: 80,
  rows: 24,
  fps: 30,
  options: { data: null },
};

const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const TIPS = new Set([4, 8, 12, 16, 20]);

export default function hands({ data } = {}) {
  const { cols, rows } = meta;
  const top = 2, h = rows - 3; // rows 0-1 header, then the image, last row a footer
  // frame the hands: crop to where they move over the whole clip, keeping the cell grid's shape
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const f of (data && data.frames) || []) for (const hd of f) for (const q of hd.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  if (x1 <= x0) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
  const shape = (cols * 0.6) / (h * 1.2) * (9 / 16); // grid width:height, in video units
  let cw = (x1 - x0) * 1.12, ch = (y1 - y0) * 1.12;
  if (cw / ch > shape) ch = cw / shape; else cw = ch * shape;
  const cx = (x0 + x1) / 2 - cw / 2, cy = (y0 + y1) / 2 - ch / 2;
  return (t) => {
    const g = Array.from({ length: rows }, () => new Array(cols).fill(" "));
    const put = (x, y, c) => { if (x >= 0 && x < cols && y >= top && y < top + h && g[y][x] !== "@") g[y][x] = c; };
    const text = (x, y, s) => { for (let i = 0; i < s.length && x + i < cols; i++) if (x + i >= 0) g[y][x + i] = s[i]; };
    // corners of the viewfinder
    [[0, top, "┌"], [cols - 1, top, "┐"], [0, top + h - 1, "└"], [cols - 1, top + h - 1, "┘"]].forEach(([x, y, c]) => (g[y][x] = c));
    const n = data && data.frames ? data.frames.length : 0;
    const fi = n ? Math.floor(t * data.fps) % n : 0;
    const frame = n ? data.frames[fi] : [];
    const P = (q) => [Math.round(((q[0] - cx) / cw) * (cols - 1)), Math.round(top + ((q[1] - cy) / ch) * (h - 1))];
    for (const hd of frame) {
      const pts = hd.p.map(P);
      for (const [a, b] of BONES) {
        const [x0, y0] = pts[a], [x1, y1] = pts[b];
        const dx = x1 - x0, dy = y1 - y0, steps = Math.max(Math.abs(dx), Math.abs(dy) * 2, 1);
        // a cell is about twice as tall as it is wide, so weigh the vertical run double
        const ang = Math.atan2(dy * 2, dx) * 180 / Math.PI, a2 = ((ang % 180) + 180) % 180;
        const c = a2 < 22.5 || a2 >= 157.5 ? "-" : a2 < 67.5 ? "\\" : a2 < 112.5 ? "|" : "/";
        for (let s = 1; s < steps; s++) put(Math.round(x0 + (dx * s) / steps), Math.round(y0 + (dy * s) / steps), c);
      }
      pts.forEach(([x, y], i) => put(x, y, i === 0 ? "#" : TIPS.has(i) ? "@" : "o"));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const lx = Math.max(1, Math.min(cols - 14, Math.min(...xs))), ly = Math.max(top + 1, Math.min(...ys) - 2);
      text(lx, ly, `hand ${hd.h.toLowerCase()} ${hd.s.toFixed(2)}`);
    }
    const pad = (v, w) => String(v).padStart(w, "0");
    text(0, 0, `head-cam · frame ${pad(fi, 4)}`);
    const right = `hands ${frame.length} · ${frame.length * 21} keypoints`;
    text(cols - right.length, 0, right);
    const sec = (fi / (data ? data.fps : 30));
    text(0, rows - 1, `t ${sec.toFixed(2)} s`);
    text(cols - 13, rows - 1, "● tracking");
    return g.map((r) => r.join("")).join("\n");
  };
}
