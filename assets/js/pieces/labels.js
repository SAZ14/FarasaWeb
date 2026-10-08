// labels: the label tracks for one task, written frame by frame as the clip plays.
// Follows the ascii.rest piece contract (meta + default(options) => frame(t)).
export const meta = {
  name: "labels",
  category: "data",
  note: "hand, object, contact and action tracks scrolling as a task is labelled",
  cols: 120,
  rows: 10,
  fps: 15,
  options: {},
};

// One task, looped: [action, object, seconds, hand in contact?]
const TASK = [
  ["reach", "screwdriver", 0.9, false], ["grasp", "screwdriver", 0.7, true], ["align", "screw", 1.3, true],
  ["fasten", "screw", 2.4, true], ["release", "screwdriver", 0.6, false], ["reach", "panel", 0.8, false],
  ["lift", "panel", 1.1, true], ["place", "panel", 1.4, true], ["inspect", "panel", 1.5, false],
];
const STEP = 0.06; // seconds per column

export default function labels() {
  const { cols, rows } = meta;
  const LW = 11, W = cols - LW - 1; // label column, then the track
  const period = TASK.reduce((s, a) => s + a[2], 0);
  const at = (time) => { // the segment playing at `time`
    let x = ((time % period) + period) % period;
    for (let i = 0; i < TASK.length; i++) { if (x < TASK[i][2]) return [i, x]; x -= TASK[i][2]; }
    return [TASK.length - 1, 0];
  };
  const track = (now, key) => { // a row of segments ending at `now`
    let out = "", prev = -1, run = 0;
    const cells = [];
    for (let c = 0; c < W; c++) cells.push(at(now - (W - 1 - c) * STEP));
    // a segment runs while the label stays the same, so one object held across actions is one box
    const ids = [];
    let id = 0;
    for (let c = 0; c < W; c++) {
      const [i] = cells[c], name = key === "action" ? TASK[i][0] : TASK[i][1];
      if (c && (key === "action" ? i !== cells[c - 1][0] : name !== ids[c - 1][1])) id++;
      ids.push([id, name]);
    }
    for (let c = 0; c < W; c++) {
      const [sid, name] = ids[c];
      if (sid !== prev) { run = 0; prev = sid; out += "["; continue; }
      run++;
      const next = c + 1 < W ? ids[c + 1][0] : -2;
      if (next !== sid && next !== -2) { out += "]"; continue; }
      out += run - 1 < name.length ? name[run - 1] : "·";
    }
    return out;
  };
  return (t) => {
    const now = t + 3.2;
    const [cur] = at(now);
    const lines = [];
    const frame = String(Math.floor(now * 30)).padStart(6, "0");
    const head = `label stack · frame ${frame}`, right = "30 fps · 2 qa passes";
    lines.push(head + " ".repeat(cols - head.length - right.length) + right);
    lines.push("");
    let hands = "", contact = "";
    for (let c = 0; c < W; c++) {
      const time = now - (W - 1 - c) * STEP, [i, x] = at(time);
      const occluded = Math.sin(time * 7.3) > 0.93;
      hands += occluded ? "░" : "▓";
      contact += TASK[i][3] && x > 0.12 ? "█" : "─";
    }
    const row = (name, s) => (name.padEnd(LW) + " " + s).slice(0, cols).padEnd(cols);
    lines.push(row("hand pose", hands));
    lines.push(row("objects", track(now, "object")));
    lines.push(row("contact", contact));
    lines.push(row("action", track(now, "action")));
    lines.push("");
    const ticks = " ".repeat(LW + 1) + `-${(W * STEP).toFixed(0)}s` + " ".repeat(W - 3 - 3) + "now";
    lines.push(ticks.slice(0, cols).padEnd(cols));
    const status = `now: ${TASK[cur][0]} · ${TASK[cur][1]} · ${TASK[cur][3] ? "contact" : "no contact"}`;
    lines.push(" ".repeat(LW + 1) + status);
    while (lines.length < rows) lines.push("");
    return lines.map((l) => l.padEnd(cols).slice(0, cols)).join("\n");
  };
}
