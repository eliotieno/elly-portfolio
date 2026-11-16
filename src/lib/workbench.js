// The home page's scroll model: a terrain slab with the seven projects worked out on it in turn.
// The slab is drawn once on a canvas. Everything that moves is an SVG object with a list of key states
// along the scroll; scroll position p runs from 0 (first pose) to 8 (last pose). Every shape is illustrative.

const D = Math.PI / 180;
const TH = 32 * D; // view yaw
const PH = 34 * D; // view elevation
const ct = Math.cos(TH), st = Math.sin(TH), sp = Math.sin(PH), cp = Math.cos(PH);
const P = (x, y, z = 0) => [100 * (x * ct - y * st), 100 * ((x * st + y * ct) * sp - z * cp)];

// Terrain: two shallow hills on a 10 x 7 slab.
const bump = (x, y, cx, cy, a, sx, sy) => a * Math.exp(-((x - cx) ** 2 / sx + (y - cy) ** 2 / sy));
const h = (x, y) => bump(x, y, 6.6, 3.0, 0.55, 6, 4) + bump(x, y, 2.6, 4.6, 0.35, 5, 3);
const SX = 10, SY = 7, BASE = -0.42;

// On the chalk slab (dark marks) and on the dark page (light marks).
const ON = { ink: '#2b2d29', green: '#2f7d4f', amber: '#bf8320', red: '#b4473d', grey: '#7c7e78' };
const UP = { ink: '#edece6', green: '#63c283', amber: '#e0b04a', red: '#e07a6e', muted: '#9a9a94' };
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const css = (c, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;

// ------------------------------------------------------------------ timeline
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a + (b - a) * t;
function mix(a, b, t) {
  const out = {};
  for (const k in b) {
    const x = a[k] ?? b[k], y = b[k];
    out[k] = Array.isArray(y) ? y.map((v, i) => lerp(x[i], v, t)) : lerp(x, y, t);
  }
  return out;
}
// keys: [[p, partial state], ...] in order. Each key adds to the one before, so unnamed values hold.
function track(keys) {
  if (keys.some((k, i) => i && k[0] < keys[i - 1][0])) throw new Error(`workbench keys out of order: ${keys.map((k) => k[0])}`);
  let acc = {};
  const ks = keys.map(([p, s]) => [p, (acc = { ...acc, ...s })]);
  return (p) => {
    if (p <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) {
      if (p < ks[i][0]) {
        const [p0, a] = ks[i - 1], [p1, b] = ks[i];
        return mix(a, b, ease((p - p0) / (p1 - p0)));
      }
    }
    return ks[ks.length - 1][1];
  };
}

// ------------------------------------------------------------------ svg helpers
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.append(e);
  return e;
}
const f1 = (v) => v.toFixed(1);
const poly = (pts) => 'M' + pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L') + 'Z';
// Affine matrix that lays local drawing units (1 unit = 0.01 world) on a plane. 'flat' lies on the ground,
// 'up' stands upright with its origin at the top left. yaw turns the plane about the vertical.
function M(kind, x, y, z, yaw = 0, s = 1) {
  const cy = Math.cos(yaw * D), sy = Math.sin(yaw * D);
  const a = (cy * ct - sy * st) * s, b = (cy * st + sy * ct) * sp * s;
  const c = kind === 'up' ? 0 : (-sy * ct - cy * st) * s;
  const d = kind === 'up' ? cp * s : (-sy * st + cy * ct) * sp * s;
  const [e, f] = P(x, y, z);
  return `matrix(${a.toFixed(4)} ${b.toFixed(4)} ${c.toFixed(4)} ${d.toFixed(4)} ${f1(e)} ${f1(f)})`;
}

function rand(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ the farms
function makeParcels() {
  const r = rand(11);
  const cols = [[1.0, 3.0], [3.2, 5.2], [5.4, 7.4], [7.6, 9.4]];
  const rows = [[1.65, 3.0], [3.3, 4.65], [4.95, 6.35]];
  const out = [];
  for (const [y0, y1] of rows) {
    for (const [x0, x1] of cols) {
      const cx = (x0 + x1) / 2 + (r() - 0.5) * 0.2, cy = (y0 + y1) / 2 + (r() - 0.5) * 0.12;
      const n = 5 + Math.floor(r() * 2), a0 = r() * Math.PI, pts = [];
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * 2 * Math.PI + (r() - 0.5) * 0.45;
        pts.push([cx + Math.cos(a) * ((x1 - x0) / 2) * (0.74 + r() * 0.2), cy + Math.sin(a) * ((y1 - y0) / 2) * (0.74 + r() * 0.2)]);
      }
      out.push({ pts, c: [cx, cy] });
    }
  }
  // Two planted faults: parcel 5 reaches into parcel 6, and parcel 9 has a narrow spike toward the front edge.
  const p5 = out[5].pts;
  p5[p5.reduce((m, v, i) => (v[0] > p5[m][0] ? i : m), 0)][0] = 5.95;
  const p9 = out[9].pts;
  const i = p9.reduce((m, v, k) => (v[1] + p9[(k + 1) % p9.length][1] > p9[m][1] + p9[(m + 1) % p9.length][1] ? k : m), 0);
  const a = p9[i], b = p9[(i + 1) % p9.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  p9.splice(i + 1, 0, [m[0] - 0.05, m[1]], [m[0] + 0.02, 6.85], [m[0] + 0.05, m[1]]);
  return out;
}

function drape(pts, lift = 0.015) {
  const out = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    for (let k = 0; k < 4; k++) {
      const x = lerp(a[0], b[0], k / 4), y = lerp(a[1], b[1], k / 4);
      out.push(P(x, y, h(x, y) + lift));
    }
  });
  return poly(out);
}

// ------------------------------------------------------------------ the slab, drawn once
function roundedRect(z, r = 0.35, n = 6) {
  const out = [];
  for (const [cx, cy, a0] of [[SX - r, r, -90], [SX - r, SY - r, 0], [r, SY - r, 90], [r, r, 180]]) {
    for (let k = 0; k <= n; k++) {
      const a = (a0 + (k / n) * 90) * D;
      out.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z));
    }
  }
  return out;
}

function hull(pts) {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length > 1 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(s), ...half([...s].reverse())];
}

function drawSlab(canvas, vb) {
  const box = canvas.getBoundingClientRect();
  if (!box.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const k = canvas.width / vb.w;
  const g = canvas.getContext('2d');
  g.setTransform(k, 0, 0, k, -vb.x * k, -vb.y * k);
  const path = (pts) => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
    g.closePath();
  };

  // A soft pool of light behind the model.
  const [mx, my] = P(5, 3.5, 0.6);
  const glow = g.createRadialGradient(mx, my, 0, mx, my, 900);
  glow.addColorStop(0, 'rgba(237,236,230,0.07)');
  glow.addColorStop(1, 'rgba(237,236,230,0)');
  g.fillStyle = glow;
  g.fillRect(vb.x, vb.y, vb.w, vb.h);

  // Sides: the outline of the whole block, lit from the upper left.
  const top = roundedRect(0), bottom = roundedRect(BASE);
  const side = hull([...top, ...bottom]);
  const xs = side.map((p) => p[0]);
  const sideFill = g.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  sideFill.addColorStop(0, '#b4b0a5');
  sideFill.addColorStop(1, '#7d7a72');
  path(side);
  g.fillStyle = sideFill;
  g.fill();

  // Top: the terrain in small lit quads, clipped to the rounded outline.
  g.save();
  path(top);
  g.clip();
  const L = [-1, -0.2, 1.1], ln = Math.hypot(...L), flat = L[2] / ln, step = 0.2;
  for (let y = 0; y < SY; y += step) {
    for (let x = 0; x < SX; x += step) {
      const hx = (h(x + 0.05, y) - h(x - 0.05, y)) / 0.1, hy = (h(x, y + 0.05) - h(x, y - 0.05)) / 0.1;
      const nl = Math.hypot(hx, hy, 1);
      const dot = (-hx * L[0] - hy * L[1] + L[2]) / nl / ln;
      const light = 1 + 1.7 * (dot - flat) - 0.012 * Math.hypot(x - 2, y - 1);
      g.fillStyle = css([222, 218, 208].map((v) => Math.min(255, v * light)));
      g.strokeStyle = g.fillStyle;
      g.lineWidth = 0.8;
      const q = [[x, y], [x + step, y], [x + step, y + step], [x, y + step]].map(([a, b]) => P(a, b, h(a, b)));
      path(q);
      g.fill();
      g.stroke();
    }
  }

  // Contour lines by marching squares, every 0.07 of height.
  const c = 0.1, nx = Math.round(SX / c), ny = Math.round(SY / c);
  for (let lv = 1; lv <= 7; lv++) {
    const z = lv * 0.07;
    g.beginPath();
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = i * c, y = j * c;
        const v = [h(x, y), h(x + c, y), h(x + c, y + c), h(x, y + c)];
        const corners = [[x, y], [x + c, y], [x + c, y + c], [x, y + c]];
        const cuts = [];
        for (let e = 0; e < 4; e++) {
          const a = v[e] - z, b = v[(e + 1) % 4] - z;
          if ((a < 0) !== (b < 0)) {
            const t = a / (a - b), p = corners[e], q = corners[(e + 1) % 4];
            cuts.push(P(lerp(p[0], q[0], t), lerp(p[1], q[1], t), z));
          }
        }
        for (let e = 0; e + 1 < cuts.length; e += 2) {
          g.moveTo(...cuts[e]);
          g.lineTo(...cuts[e + 1]);
        }
      }
    }
    g.strokeStyle = `rgba(43,45,41,${lv % 2 ? 0.16 : 0.3})`;
    g.lineWidth = 1.3;
    g.stroke();
  }
  g.restore();

  // A light rim on the top edge.
  path(top);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 1.2;
  g.stroke();
}

// ------------------------------------------------------------------ build the scene
export function initWorkbench(root) {
  const canvas = root.querySelector('canvas');
  const svg = root.querySelector('svg');

  // The view box: the slab plus room for the panels that rise behind it.
  const corners = [];
  for (const x of [-0.3, 10.6]) for (const y of [-1.1, 7.8]) for (const z of [BASE, 3.75]) corners.push(P(x, y, z));
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  const vb = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  svg.setAttribute('viewBox', `${f1(vb.x)} ${f1(vb.y)} ${f1(vb.w)} ${f1(vb.h)}`);
  root.style.setProperty('--ar', (vb.w / vb.h).toFixed(4));

  const objs = [];
  const add = (g, keys, apply = () => {}) => objs.push({ g, at: track(keys), apply });
  const at = (kind) => (g, s) => g.setAttribute('transform', M(kind, s.x, s.y, s.z, s.yaw, s.s));
  const layer = () => el('g', {}, svg);
  const defs = el('defs', {}, svg);
  let clips = 0;

  const parcels = makeParcels();
  const ground = layer(), above = layer(), surface = layer(), front = layer(), panels = layer();
  const SLOT = { x: 1.05, y: 0.57 };
  const intoSlot = (p, end) => [[p, { x: SLOT.x, y: SLOT.y, z: 0.04, s: 0.25 }], [end, { o: 0 }]];

  // Archive slot, back left. Things that leave the bench go in here.
  {
    const g = el('g', {}, ground);
    el('rect', { x: -70, y: -28, width: 140, height: 56, rx: 6, fill: '#1c1e1b' }, g);
    el('rect', { x: -64, y: -22, width: 128, height: 44, rx: 4, fill: 'none', stroke: 'rgba(255,255,255,0.12)', 'stroke-width': 1 }, g);
    add(g, [[0, { ...SLOT, z: 0.01, o: 0 }], [2.85, {}], [3.2, { o: 1 }]], at('flat'));
  }

  // Parcels. Review colours: green confirm, amber review, red fix.
  const QUEUE = ['green', 'green', 'amber', 'green', 'green', 'red', 'amber', 'green', 'green', 'red', 'green', 'amber'];
  parcels.forEach((pc, i) => {
    const g = el('g', {}, ground);
    const path = el('path', { d: drape(pc.pts), 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, g);
    const ink = rgb(ON.ink), q = rgb(ON[QUEUE[i]]);
    const focus = i === 11;
    add(
      g,
      [
        [0, { c: ink, fa: 0.06, o: 1 }],
        [1.3, {}],
        [1.95, { c: q, fa: 0.14 }],
        [2.05, {}],
        [2.5, { o: focus ? 1 : 0.35 }],
        [3.0, {}],
        [3.5, { c: ink, fa: 0.05, o: 0.5 }],
        [5.2, {}],
        [5.6, { o: 0.35 }],
        [6.1, {}],
        [6.5, { o: 0 }],
        [7.3, {}],
        [7.9, { o: 1 }],
      ],
      (_, s) => {
        path.setAttribute('stroke', css(s.c));
        path.setAttribute('fill', css(s.c, s.fa));
      },
    );
  });

  // Nursery hosts and the straight farm-to-site assignment lines.
  const HOSTS = [1, 7, 8];
  const elev = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) + 4 * Math.abs(h(...a) - h(...b));
  parcels.forEach((pc, i) => {
    if (HOSTS.includes(i)) return;
    const to = parcels[HOSTS.reduce((m, j) => (elev(pc.c, parcels[j].c) < elev(pc.c, parcels[m].c) ? j : m), HOSTS[0])].c;
    const a = P(pc.c[0], pc.c[1], h(...pc.c) + 0.03), b = P(to[0], to[1], h(...to) + 0.03);
    const g = el('g', {}, ground);
    const line = el('path', { d: `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`, stroke: ON.green, 'stroke-width': 1.6, fill: 'none', pathLength: 1, 'stroke-dasharray': '1 1' }, g);
    const d0 = 0.4 + (i % 6) * 0.03;
    add(
      g,
      [[0, { d: 0, o: 1 }], [d0, {}], [d0 + 0.4, { d: 1 }], [1.05, {}], [1.4, { d: 0 }], [7.45 + (i % 6) * 0.04, {}], [7.95, { d: 1, o: 0.75 }]],
      (_, s) => (line.style.strokeDashoffset = 1 - s.d),
    );
  });

  // Farm markers: a short pin on each parcel.
  parcels.forEach((pc) => {
    const z = h(...pc.c);
    const [x0, y0] = P(pc.c[0], pc.c[1], z), [x1, y1] = P(pc.c[0], pc.c[1], z + 0.24);
    const g = el('g', {}, ground);
    el('line', { x1: f1(x0), y1: f1(y0), x2: f1(x1), y2: f1(y1), stroke: ON.ink, 'stroke-width': 1.2 }, g);
    el('circle', { cx: f1(x1), cy: f1(y1), r: 4.2, fill: ON.grey, stroke: ON.ink, 'stroke-width': 1 }, g);
    add(g, [[0, { o: 1 }], [1.1, {}], [1.6, { o: 0.75 }], [2.1, {}], [2.5, { o: 0.4 }], [6.1, {}], [6.5, { o: 0 }], [7.3, {}], [7.9, { o: 0.95 }]]);
  });

  // The three hosts: a green base with a seedling tray.
  HOSTS.forEach((j, n) => {
    const [x, y] = parcels[j].c;
    const g = el('g', {}, ground);
    el('circle', { r: 34, fill: ON.green, 'fill-opacity': 0.9 }, g);
    el('rect', { x: -17, y: -12, width: 34, height: 24, rx: 3, fill: '#f2efe6', stroke: ON.ink, 'stroke-width': 1 }, g);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) el('circle', { cx: -10 + a * 10, cy: -5 + b * 10, r: 3, fill: ON.green }, g);
    const t0 = 0.08 + n * 0.08;
    add(g, [[0, { x, y, z: h(x, y) + 0.02, s: 0.4, o: 0 }], [t0, {}], [t0 + 0.32, { s: 1, o: 1 }], [1.05, {}], [1.45, { s: 0.5, o: 0 }], [7.2, {}], [7.7, { s: 1, o: 1 }]], at('flat'));
  });

  // Record tiles: three at the back to begin with. Two later come forward as the pair behind one counted visit.
  const tile = (parent) => {
    const g = el('g', {}, parent);
    el('rect', { x: -28, y: -20, width: 56, height: 40, rx: 4, fill: 'rgba(255,255,255,0.62)', stroke: ON.ink, 'stroke-opacity': 0.5, 'stroke-width': 1 }, g);
    for (let k = 0; k < 3; k++) el('line', { x1: -18, x2: k === 2 ? 4 : 16, y1: -8 + k * 8, y2: -8 + k * 8, stroke: ON.ink, 'stroke-opacity': 0.45, 'stroke-width': 1 }, g);
    return g;
  };
  const PAIR = [[4.27, 6.42], [5.03, 6.42]];
  [0, 1, 2].forEach((k) => {
    const g = tile(ground);
    const start = { x: 1.0 + k * 0.72, y: 0.48, z: 0.02, s: 1, o: 1 };
    const keys = [[0, start], [2.1, {}], [2.5, { o: 0.55 }], [3.05, {}]];
    if (k < 2) {
      const [x, y] = PAIR[k];
      keys.push([3.45, { x: lerp(start.x, x, 0.5), y: 3.4, z: 0.9, o: 1 }], [3.85, { x, y, z: 0.03 }], [4.05, {}], ...intoSlot(4.55, 4.65));
    } else keys.push(...intoSlot(3.6, 3.72));
    add(g, keys, at('flat'));
  });

  // Count token: one counted visit above the two source records.
  {
    const g = el('g', {}, front);
    const l1 = el('line', { stroke: ON.green, 'stroke-width': 1.3 }, g);
    const l2 = el('line', { stroke: ON.green, 'stroke-width': 1.3 }, g);
    const dot = el('circle', { r: 10, fill: ON.green, stroke: '#f2efe6', 'stroke-width': 2 }, g);
    const mid = [(PAIR[0][0] + PAIR[1][0]) / 2, PAIR[0][1]];
    add(g, [[0, { z: 1.4, o: 0 }], [3.6, {}], [3.95, { z: 0.85, o: 1 }], [4.05, {}], [4.35, { o: 0 }]], (_, s) => {
      const [x, y] = P(mid[0], mid[1], s.z);
      dot.setAttribute('cx', f1(x));
      dot.setAttribute('cy', f1(y));
      for (const [ln, pr] of [[l1, PAIR[0]], [l2, PAIR[1]]]) {
        const [bx, by] = P(pr[0], pr[1], 0.05);
        ln.setAttribute('x1', f1(x));
        ln.setAttribute('y1', f1(y));
        ln.setAttribute('x2', f1(bx));
        ln.setAttribute('y2', f1(by));
      }
    });
  }

  // Review trays at the back: confirm, review, correct.
  const TRAYS = [3.75, 5.45, 7.15].map((x) => ({ x, y: 0.62 }));
  const marker = (kind, parent, colour, r = 9) => {
    if (kind === 0) return el('circle', { r, fill: colour }, parent);
    if (kind === 1) return el('path', { d: `M0 ${-r * 1.25}L${r * 1.25} 0L0 ${r * 1.25}L${-r * 1.25} 0Z`, fill: colour }, parent);
    return el('rect', { x: -r, y: -r, width: 2 * r, height: 2 * r, fill: colour }, parent);
  };
  TRAYS.forEach((t, k) => {
    const g = el('g', {}, ground);
    el('rect', { x: -66, y: -31, width: 132, height: 62, rx: 7, fill: 'rgba(43,45,41,0.07)', stroke: ON.ink, 'stroke-opacity': 0.55, 'stroke-width': 1.1 }, g);
    el('rect', { x: -60, y: -25, width: 120, height: 50, rx: 5, fill: 'none', stroke: ON.ink, 'stroke-opacity': 0.2, 'stroke-width': 1 }, g);
    const m = marker(k, el('g', { transform: 'translate(-46 -12)' }, g), ON[['green', 'amber', 'red'][k]], 6.5);
    m.setAttribute('stroke', 'none');
    add(g, [[0, { ...t, y: -0.5, z: 0.02, s: 1, o: 0 }], [1.15, {}], [1.6 + k * 0.06, { y: t.y, o: 1 }], [2.05, {}], [2.5, { y: 0.42, s: 0.9, o: 0.35 }], [3.0, {}], [3.35, { o: 0 }]], at('flat'));
  });

  // Small copies of parcels lifted into the trays. The originals stay where they are.
  [[0, 0], [3, 0], [2, 1], [6, 1], [5, 2], [9, 2]].forEach(([i, k], n) => {
    const pc = parcels[i];
    const g = el('g', {}, above);
    el('path', { d: poly(pc.pts.map(([x, y]) => [(x - pc.c[0]) * 100, (y - pc.c[1]) * 100])), fill: css(rgb(ON[QUEUE[i]]), 0.22), stroke: ON[QUEUE[i]], 'stroke-width': 1.3 }, g);
    const t = TRAYS[k], tx = t.x - 0.12 + (n % 2) * 0.48, t0 = 1.3 + n * 0.04;
    add(
      g,
      [[0, { x: pc.c[0], y: pc.c[1], z: h(...pc.c) + 0.03, s: 1, o: 0 }], [t0, {}], [t0 + 0.15, { z: 0.7, o: 0.95 }], [t0 + 0.5, { x: tx, y: t.y, z: 0.05, s: 0.3 }], [2.05, {}], [2.5, { y: 0.42, o: 0.35 }], [3.0, {}], [3.35, { o: 0 }]],
      at('flat'),
    );
  });

  // Process track at the back: five steps, the fourth (approval) is where the change waits.
  {
    const g = el('g', {}, ground);
    el('line', { x1: 0, x2: 600, y1: 0, y2: 0, stroke: ON.ink, 'stroke-opacity': 0.4, 'stroke-width': 1.2 }, g);
    for (let k = 0; k < 5; k++) {
      const x = k * 150;
      if (k < 3) el('circle', { cx: x, cy: 0, r: 9, fill: ON.ink }, g);
      else if (k === 3) el('circle', { cx: x, cy: 0, r: 11, fill: '#f2efe6', stroke: ON.amber, 'stroke-width': 2.4 }, g);
      else el('circle', { cx: x, cy: 0, r: 9, fill: '#f2efe6', stroke: ON.ink, 'stroke-opacity': 0.5, 'stroke-width': 1.2 }, g);
    }
    add(g, [[0, { x: 1.9, y: 1.14, z: 0.02, o: 0 }], [2.3, {}], [2.85, { x: 2.6, o: 1 }], [3.05, {}], [3.4, { o: 0 }]], at('flat'));
  }

  // Boundary history: previous boundary below, proposed replacement above, a gate, and the empty final position.
  {
    const pc = parcels[11], [cx, cy] = pc.c;
    const local = (pts) => poly(pts.map(([x, y]) => [(x - cx) * 100, (y - cy) * 100]));
    const proposed = pc.pts.map(([x, y], k) => [cx + (x - cx) * (k % 2 ? 1.08 : 0.94), cy + (y - cy) * (k % 2 ? 0.95 : 1.06)]);
    const sheet = (parent, dashed) =>
      el('rect', { x: -105, y: -80, width: 210, height: 160, rx: 6, fill: dashed ? 'none' : 'rgba(255,255,255,0.42)', stroke: ON.ink, 'stroke-opacity': dashed ? 0.45 : 0.4, 'stroke-width': 1.1, 'stroke-dasharray': dashed ? '6 5' : 'none' }, parent);

    const slot = el('g', {}, above);
    sheet(slot, true);
    add(slot, [[0, { x: 5.95, y: cy, z: 1.55, o: 0 }], [2.3, {}], [2.8, { o: 1 }], [3.05, {}], [3.35, { o: 0 }]], at('flat'));

    const gate = el('g', {}, above);
    for (const u of [0, 82]) el('rect', { x: u, y: 0, width: 9, height: 190, fill: ON.ink }, gate);
    el('rect', { x: 0, y: 0, width: 91, height: 10, fill: ON.ink }, gate);
    const gz = h(7.25, 5.3) + 1.9;
    add(gate, [[0, { x: 7.25, y: 5.25, z: gz, yaw: 90, s: 1, o: 0 }], [2.35, {}], [2.85, { o: 1 }], [3.05, {}], [3.35, { o: 0 }]], at('up'));

    const old = el('g', {}, above);
    sheet(old);
    el('path', { d: local(pc.pts), fill: 'none', stroke: ON.ink, 'stroke-opacity': 0.55, 'stroke-width': 1.5 }, old);
    add(old, [[0, { x: cx, y: cy, z: 0.1, s: 1, o: 0 }], [2.1, {}], [2.55, { z: 1.0, o: 1 }], [3.1, {}], ...intoSlot(3.6, 3.72)], at('flat'));

    const prop = el('g', {}, above);
    sheet(prop);
    el('path', { d: local(proposed), fill: css(rgb(ON.green), 0.16), stroke: ON.green, 'stroke-width': 1.8 }, prop);
    add(prop, [[0, { x: cx + 0.12, y: cy, z: 0.4, s: 1, o: 0 }], [2.3, {}], [2.8, { z: 1.55, o: 1 }], [3.15, {}], ...intoSlot(3.7, 3.82)], at('flat'));
  }

  // Panels: upright cards that rise behind the slab. Content sits in clipped inserts that can slide.
  function panel(w, hgt, parent = panels) {
    const g = el('g', {}, parent);
    el('rect', { width: w, height: hgt, rx: 7, fill: 'rgba(237,236,230,0.06)', stroke: 'rgba(237,236,230,0.34)', 'stroke-width': 1 }, g);
    const id = `wb-clip-${clips++}`;
    el('rect', { width: w, height: hgt, rx: 7 }, el('clipPath', { id }, defs));
    const clip = el('g', { 'clip-path': `url(#${id})` }, g);
    const insert = () => el('g', {}, clip);
    return { g, insert };
  }
  const head = (g, w = 46) => el('line', { x1: 16, x2: 16 + w, y1: 20, y2: 20, stroke: UP.ink, 'stroke-opacity': 0.45, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
  const slideIn = (g, a, b, c, d, from = 50, to = -50) =>
    add(g, [[0, { v: from, o: 0 }], [a, {}], [b, { v: 0, o: 1 }], [c, {}], [d, { v: to, o: 0 }]], (_, s) => g.setAttribute('transform', `translate(0 ${f1(s.v)})`));

  // Chart pieces, in panel units.
  const bars = (g, x0, base, vals, w, gap, colour, scale = 1) =>
    vals.forEach((v, i) => el('rect', { x: x0 + i * (w + gap), y: base - v * scale, width: w, height: v * scale, rx: 2, fill: colour }, g));
  const line = (g, pts, colour, width = 2, area) => {
    const d = 'M' + pts.map((p) => p.map(f1).join(' ')).join('L');
    if (area) el('path', { d: `${d}L${f1(pts.at(-1)[0])} ${area}L${f1(pts[0][0])} ${area}Z`, fill: colour, 'fill-opacity': 0.14 }, g);
    el('path', { d, fill: 'none', stroke: colour, 'stroke-width': width, 'stroke-linejoin': 'round' }, g);
  };
  const series = (x0, x1, base, vals) => vals.map((v, i) => [lerp(x0, x1, i / (vals.length - 1)), base - v]);

  // Programme reporting: four panels, later reused for nursery stock.
  const PW = 225, PH_ = 245;
  [0, 1, 2, 3].forEach((k) => {
    const x = 0.2 + k * 2.45;
    const p = panel(PW, PH_);
    add(p.g, [[0, { x, y: -0.35, z: 2.55, s: 1, o: 0 }], [3.1, {}], [3.6 + k * 0.06, { z: 3.35, o: 1 }], [5.1, {}], [5.5, { z: 2.75, o: 0 }]], at('up'));

    const a = p.insert();
    head(a);
    if (k === 0) bars(a, 22, PH_ - 30, [62, 96, 74, 122, 104, 140, 128], 18, 8, UP.green);
    if (k === 1) {
      const pts = series(22, PW - 22, PH_ - 34, [30, 46, 40, 70, 86, 82, 112, 128, 150]);
      line(a, pts, UP.green, 2.2, PH_ - 34);
      pts.forEach(([cx, cy]) => el('circle', { cx, cy, r: 3.2, fill: UP.green }, a));
    }
    if (k === 2) {
      [1, 0.8, 0.68, 0.61].forEach((v, i) => {
        el('rect', { x: 22, y: 64 + i * 40, width: PW - 44, height: 14, rx: 7, fill: 'rgba(237,236,230,0.12)' }, a);
        el('rect', { x: 22, y: 64 + i * 40, width: (PW - 44) * v, height: 14, rx: 7, fill: UP.green, 'fill-opacity': 1 - i * 0.15 }, a);
      });
    }
    if (k === 3) {
      const segs = [[0.6, UP.green, 1], [0.13, UP.green, 0.5], [0.14, UP.amber, 1], [0.13, UP.muted, 0.7]];
      let x0 = 22;
      for (const [v, c, op] of segs) {
        el('rect', { x: x0, y: 52, width: (PW - 44) * v - 2, height: 24, fill: c, 'fill-opacity': op }, a);
        x0 += (PW - 44) * v;
      }
      for (let n = 0; n < 60; n++) {
        const f = n / 60, [, c, op] = f < 0.6 ? segs[0] : f < 0.73 ? segs[1] : f < 0.87 ? segs[2] : segs[3];
        el('circle', { cx: 30 + (n % 10) * 18, cy: 104 + Math.floor(n / 10) * 20, r: 5, fill: c, 'fill-opacity': op }, a);
      }
    }
    slideIn(a, 3.3, 3.8 + k * 0.06, 4.05, 4.45, 60, 70);

    // Nursery stock inserts: a stock line, then fresh, copied and missing report states.
    const b = p.insert();
    head(b, 38);
    if (k === 0) {
      const pts = series(22, PW - 22, PH_ - 40, [96, 96, 118, 132, 132, 132, 150, 112, 120]);
      line(b, pts, UP.ink, 2, PH_ - 40);
    } else {
      el('rect', { x: 52, y: 70, width: 120, height: 120, rx: 12, fill: 'rgba(237,236,230,0.05)', stroke: 'rgba(237,236,230,0.28)', 'stroke-width': 1 }, b);
      if (k === 1) el('circle', { cx: 112, cy: 130, r: 22, fill: UP.green }, b);
      if (k === 2) for (const cx of [90, 134]) el('circle', { cx, cy: 130, r: 17, fill: 'none', stroke: UP.amber, 'stroke-width': 3 }, b);
      if (k === 3) el('rect', { x: 82, y: 100, width: 60, height: 60, rx: 8, fill: 'none', stroke: UP.muted, 'stroke-width': 2, 'stroke-dasharray': '7 6' }, b);
    }
    slideIn(b, 4.25, 4.7 + k * 0.05, 5.05, 5.35, -70, 40);
  });

  // Nursery trays at the front, with weekly report sheets behind each. Only the latest comes forward.
  [0, 1, 2].forEach((k) => {
    const x = 3.0 + k * 1.5, y = 6.15;
    // Weekly sheets, oldest at the back.
    for (let wk = 3; wk >= 0; wk--) {
      const g = el('g', {}, front);
      el('rect', { width: 80, height: 54, rx: 4, fill: 'rgba(255,255,255,0.72)', stroke: ON.ink, 'stroke-opacity': 0.45, 'stroke-width': 1 }, g);
      for (let n = 0; n < 2; n++) el('line', { x1: 10, x2: 46, y1: 14 + n * 9, y2: 14 + n * 9, stroke: ON.ink, 'stroke-opacity': 0.35, 'stroke-width': 1 }, g);
      if (wk === 0) {
        if (k === 0) el('circle', { cx: 62, cy: 36, r: 8, fill: ON.green }, g);
        if (k === 1) for (const cx of [52, 68]) el('circle', { cx, cy: 36, r: 6.5, fill: 'none', stroke: ON.amber, 'stroke-width': 2 }, g);
        if (k === 2) el('rect', { x: 54, y: 28, width: 16, height: 16, rx: 3, fill: 'none', stroke: ON.ink, 'stroke-opacity': 0.6, 'stroke-width': 1.3, 'stroke-dasharray': '3 3' }, g);
      }
      const sy = y - 0.62 - wk * 0.13, op = wk === 0 ? 1 : 0.55 - wk * 0.08, t0 = 4.3 + k * 0.04 + (3 - wk) * 0.03;
      const keys = [[0, { x: x - 0.4, y: sy, z: 0.85, s: 1, o: 0 }], [t0, {}], [t0 + 0.35, { o: op }]];
      if (wk === 0) keys.push([4.86, {}], [5.0, { y: sy + 0.3, z: 0.95 }]);
      keys.push([5.05, {}], ...intoSlot(5.45 + k * 0.04, 5.6));
      add(g, keys, at('up'));
    }
    const g = el('g', {}, front);
    el('rect', { x: -55, y: -28, width: 110, height: 56, rx: 6, fill: '#3a3c37', stroke: ON.ink, 'stroke-width': 1.2 }, g);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) el('circle', { cx: -40 + i * 16, cy: -15 + j * 15, r: 4.4, fill: '#6fb586' }, g);
    add(g, [[0, { x, y: 7.7, z: 0.05, s: 1, o: 0 }], [4.1 + k * 0.05, {}], [4.6 + k * 0.05, { y, z: h(x, y) + 0.04, o: 1 }], [5.0, {}], ...intoSlot(5.45 + k * 0.04, 5.6)], at('flat'));
  });

  // NEST coverage: two matched panels, Kenya and Uganda, on one 0 to 100% scale. The figures are the case study's.
  const CW = 340, CH = 255;
  [['Kenya', 0.072], ['Uganda', 0.482]].forEach(([name, v], k) => {
    const p = panel(CW, CH);
    const tab = el('g', {}, p.g);
    el('rect', { x: 22, y: -24, width: 48, height: 22, rx: 4, fill: 'rgba(237,236,230,0.1)', stroke: 'rgba(237,236,230,0.34)', 'stroke-width': 1 }, tab);
    for (const cx of [34, 58]) el('line', { x1: cx, x2: cx, y1: -30, y2: -16, stroke: UP.ink, 'stroke-opacity': 0.6, 'stroke-width': 2 }, tab);
    const c = p.insert();
    el('text', { x: 22, y: 38, 'font-size': 15, 'letter-spacing': '0.08em', fill: UP.ink, 'fill-opacity': 0.75 }, c).textContent = name.toUpperCase();
    for (let i = 0; i < 24; i++) el('rect', { x: 22 + (i % 8) * 37, y: 56 + Math.floor(i / 8) * 26, width: 28, height: 18, rx: 3, fill: 'rgba(237,236,230,0.1)', stroke: 'rgba(237,236,230,0.22)', 'stroke-width': 1 }, c);
    const tw = CW - 44;
    el('rect', { x: 22, y: 186, width: tw, height: 16, rx: 3, fill: 'none', stroke: 'rgba(237,236,230,0.4)', 'stroke-width': 1 }, c);
    const fill = el('rect', { x: 22, y: 186, width: 0, height: 16, rx: 3, fill: UP.green }, c);
    const val = el('text', { x: 22, y: 174, 'font-size': 24, fill: UP.ink }, c);
    val.textContent = `${(v * 100).toFixed(1)}%`;
    el('text', { x: 22, y: 222, 'font-size': 12, fill: UP.muted }, c).textContent = '0';
    el('text', { x: CW - 22, y: 222, 'font-size': 12, fill: UP.muted, 'text-anchor': 'end' }, c).textContent = '100%';
    add(p.g, [[0, { x: 1.35 + k * 3.9, y: -0.35, z: 2.75, s: 1, o: 0 }], [5.25, {}], [5.75 + k * 0.06, { z: 3.45, o: 1 }], [6.05, {}], [6.4, { z: 2.85, o: 0 }]], at('up'));
    add(fill, [[0, { f: 0 }], [5.7, {}], [5.97, { f: 1 }]], (g, s) => g.setAttribute('width', f1(tw * v * s.f)));
    add(val, [[0, { o: 0 }], [5.8, {}], [5.97, { o: 1 }]]);
  });

  // Retail: a neutral reporting surface over the slab, order tiles, three report panels and a phone layout.
  {
    const g = el('g', {}, surface);
    const edge = el('rect', { x: 0, y: 0, width: 940, height: 640, rx: 14, fill: '#8f8c84' }, g);
    const top = el('rect', { x: 0, y: 0, width: 940, height: 640, rx: 14, fill: '#cfccc2', stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 1 }, g);
    add(g, [[0, { y: -2.2, o: 0 }], [6.0, {}], [6.5, { y: 0.3, o: 1 }], [7.0, {}], [7.45, { y: -2.2, o: 0 }]], (_, s) => {
      edge.setAttribute('transform', M('flat', 0.3, s.y, 0.62));
      top.setAttribute('transform', M('flat', 0.3, s.y, 0.7));
    });
    const tiles = el('g', {}, surface);
    for (let i = 0; i < 12; i++) el('rect', { x: (i % 4) * 62, y: Math.floor(i / 4) * 44, width: 52, height: 34, rx: 4, fill: 'rgba(255,255,255,0.75)', stroke: ON.ink, 'stroke-opacity': 0.35, 'stroke-width': 1 }, tiles);
    add(tiles, [[0, { x: 1.0, y: 4.85, z: 1.3, s: 1, o: 0 }], [6.35, {}], [6.8, { z: 0.72, o: 1 }], [7.0, {}], [7.3, { o: 0 }]], at('flat'));
  }
  [300, 300, 230].forEach((w, k) => {
    const p = panel(w, 245);
    const c = p.insert();
    head(c);
    if (k === 0) {
      for (let n = 0; n < 3; n++) el('line', { x1: 20, x2: w - 20, y1: 80 + n * 50, y2: 80 + n * 50, stroke: 'rgba(237,236,230,0.1)', 'stroke-width': 1 }, c);
      line(c, series(22, w - 22, 200, [70, 82, 76, 98, 92, 110, 104, 126, 118, 140, 132, 150]), UP.ink, 2);
      line(c, series(22, w - 22, 200, [18, 26, 20, 34, 26, 40, 30, 44, 36, 50, 42, 56]), UP.green, 2);
    }
    if (k === 1) {
      const axis = w * 0.4;
      el('line', { x1: axis, x2: axis, y1: 40, y2: 225, stroke: 'rgba(237,236,230,0.3)', 'stroke-width': 1 }, c);
      [1, 0.82, 0.7, 0.55, 0.42, 0.25, -0.3, -0.55].forEach((v, i) =>
        el('rect', { x: v > 0 ? axis : axis + v * w * 0.32, y: 44 + i * 22, width: Math.abs(v) * (v > 0 ? w * 0.52 : w * 0.32), height: 14, rx: 2, fill: v > 0 ? UP.green : UP.red, 'fill-opacity': v > 0 ? 0.9 : 0.85 }, c),
      );
    }
    if (k === 2) bars(c, 30, 210, [70, 96, 58, 132, 84], 28, 12, UP.muted);
    const keys = [[0, { x: [0.3, 3.55, 6.8][k], y: -0.35, z: 2.6, s: 1, yaw: 0, o: 0 }], [6.3, {}], [6.8 + k * 0.06, { z: 3.35, o: 1 }], [7.0, {}]];
    keys.push(k === 1 ? [7.55, { o: 0, z: 3.1 }] : [7.4, { z: 2.7, o: 0 }]);
    add(p.g, keys, at('up'));
  });
  {
    const p = panel(60, 120);
    const c = p.insert();
    el('line', { x1: 10, x2: 30, y1: 12, y2: 12, stroke: UP.ink, 'stroke-opacity': 0.45, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, c);
    line(c, series(10, 50, 44, [8, 12, 10, 16, 14, 20]), UP.ink, 1.5);
    [0.9, 0.6, -0.4].forEach((v, i) => el('rect', { x: v > 0 ? 24 : 24 + v * 20, y: 58 + i * 12, width: Math.abs(v) * 24, height: 7, fill: v > 0 ? UP.green : UP.red }, c));
    bars(c, 12, 112, [10, 16, 8], 8, 6, UP.muted);
    add(p.g, [[0, { x: 9.85, y: -1.0, z: 2.95, s: 1, o: 0 }], [6.5, {}], [6.95, { o: 1 }], [7.0, {}], [7.35, { o: 0 }]], at('up'));
  }

  // Final view: seven slim cards in a shallow fan, one motif each, rising out of the archive.
  const FW = 115, FH = 195;
  const motifs = [
    (g) => {
      const hub = [57, 108];
      [[24, 70], [92, 66], [20, 140], [96, 150], [58, 160], [40, 52]].forEach(([x, y]) => {
        el('line', { x1: x, y1: y, x2: hub[0], y2: hub[1], stroke: UP.green, 'stroke-width': 1.4 }, g);
        el('circle', { cx: x, cy: y, r: 4.5, fill: UP.ink, 'fill-opacity': 0.8 }, g);
      });
      el('circle', { cx: hub[0], cy: hub[1], r: 10, fill: UP.green }, g);
    },
    (g) =>
      ['green', 'amber', 'red'].forEach((c, i) => {
        marker(i, el('g', { transform: `translate(26 ${70 + i * 38})` }, g), UP[c], 7);
        el('line', { x1: 44, x2: 92, y1: 70 + i * 38, y2: 70 + i * 38, stroke: UP.ink, 'stroke-opacity': 0.35, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
      }),
    (g) => {
      el('rect', { x: 18, y: 62, width: 56, height: 44, rx: 4, fill: 'none', stroke: UP.ink, 'stroke-opacity': 0.5, 'stroke-width': 1.3 }, g);
      el('rect', { x: 30, y: 78, width: 56, height: 44, rx: 4, fill: 'rgba(99,194,131,0.15)', stroke: UP.green, 'stroke-width': 1.5 }, g);
      for (const x of [26, 88]) el('rect', { x, y: 136, width: 5, height: 40, fill: UP.ink, 'fill-opacity': 0.7 }, g);
      el('rect', { x: 26, y: 136, width: 67, height: 5, fill: UP.ink, 'fill-opacity': 0.7 }, g);
    },
    (g) => bars(g, 18, 170, [40, 64, 52, 88, 76, 104], 10, 6, UP.green),
    (g) => {
      el('circle', { cx: 57, cy: 66, r: 12, fill: UP.green }, g);
      for (const cx of [45, 69]) el('circle', { cx, cy: 110, r: 9, fill: 'none', stroke: UP.amber, 'stroke-width': 2.4 }, g);
      el('rect', { x: 45, y: 140, width: 24, height: 24, rx: 4, fill: 'none', stroke: UP.muted, 'stroke-width': 1.8, 'stroke-dasharray': '4 4' }, g);
    },
    (g) =>
      [0.072, 0.482].forEach((v, i) => {
        el('rect', { x: 16, y: 84 + i * 44, width: 83, height: 12, rx: 2, fill: 'none', stroke: 'rgba(237,236,230,0.4)', 'stroke-width': 1 }, g);
        el('rect', { x: 16, y: 84 + i * 44, width: Math.max(2, 83 * v), height: 12, rx: 2, fill: UP.green }, g);
      }),
    (g) => {
      el('line', { x1: 50, x2: 50, y1: 56, y2: 178, stroke: 'rgba(237,236,230,0.3)', 'stroke-width': 1 }, g);
      [1, 0.7, 0.45, -0.35, -0.6].forEach((v, i) => el('rect', { x: v > 0 ? 50 : 50 + v * 38, y: 62 + i * 23, width: Math.abs(v) * (v > 0 ? 52 : 38), height: 12, rx: 2, fill: v > 0 ? UP.green : UP.red }, g));
    },
  ];
  motifs.forEach((draw, i) => {
    const p = panel(FW, FH);
    const c = p.insert();
    head(c, 32);
    draw(c);
    const a = (i - 3) / 3, yaw = -a * 16;
    const cx = 5.05 + a * 4.5 + (i === 6 ? 0.25 : 0), cy = -0.2 - 0.55 * (1 - a * a);
    const x = cx - (FW / 200) * Math.cos(yaw * D), y = cy - (FW / 200) * Math.sin(yaw * D);
    const end = { x, y, z: 2.95, yaw, s: 1, o: 1 };
    if (i === 6) add(p.g, [[0, { ...end, z: 2.6, o: 0 }], [7.25, {}], [7.85, { z: 2.95, o: 1 }]], at('up'));
    else add(p.g, [[0, { ...SLOT, z: 0.15, yaw: 0, s: 0.2, o: 0 }], [7.15 + i * 0.05, {}], [7.25 + i * 0.05, { o: 0.6 }], [7.85 + i * 0.02, end]], at('up'));
  });

  // ------------------------------------------------------------------ run
  const hidden = new WeakSet();
  function render(p) {
    for (const o of objs) {
      const s = o.at(p);
      const op = s.o ?? 1;
      if (op < 0.004) {
        if (!hidden.has(o.g)) {
          o.g.style.display = 'none';
          hidden.add(o.g);
        }
        continue;
      }
      if (hidden.has(o.g)) {
        o.g.style.display = '';
        hidden.delete(o.g);
      }
      if (s.o !== undefined) o.g.style.opacity = op.toFixed(3);
      o.apply(o.g, s);
    }
  }

  const redraw = () => drawSlab(canvas, vb);
  redraw();
  new ResizeObserver(redraw).observe(canvas);
  return render;
}
