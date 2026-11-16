// Shared by the map and chart demos.

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
// The basemap is always light, so map layers use the light-mode tokens directly.
export const INK = '#121412';
export const ACCENT = '#1c6b3c';
export const GREY = '#8a8c88';

export const num = new Intl.NumberFormat('en');
export const pct = (n) => `${(n * 100).toFixed(1)}%`;

/** Run `fn` once, shortly before `el` scrolls into view. Keeps map and chart code off the initial load. */
export function whenVisible(el, fn) {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        fn();
      }
    },
    { rootMargin: '400px' },
  );
  io.observe(el);
}

export async function loadMap() {
  // MapLibre 6 finds its worker relative to its own file, which a bundler moves. Hand it the real URL.
  const [m, worker] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')]);
  const gl = m.default ?? m;
  gl.setWorkerUrl(worker.default);
  return gl;
}

/** Create a map that fits `bounds` ([[w, s], [e, n]]) and does not hijack page scroll. */
export function makeMap(gl, container, bounds) {
  const map = new gl.Map({
    container,
    style: MAP_STYLE,
    bounds,
    fitBoundsOptions: { padding: 32 },
    cooperativeGestures: true,
    attributionControl: { compact: true },
  });
  map.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right');
  return map;
}

export function boundsOf(points) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [[w, s], [e, n]];
}

/** The page's current accent colour as a plain value, for chart libraries that cannot read CSS variables. */
export const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

/** Options every chart shares, so they all read as one set. */
export function plotBase(el, extra = {}) {
  return {
    width: Math.max(280, el.clientWidth),
    height: 260,
    style: { background: 'transparent', fontFamily: "'JetBrains Mono Variable', monospace", fontSize: '11px', overflow: 'visible' },
    ...extra,
  };
}

/** Re-run `draw` when the element's width or the colour scheme changes. */
export function redrawOn(el, draw) {
  let width = el.clientWidth;
  new ResizeObserver(() => {
    if (el.clientWidth !== width) {
      width = el.clientWidth;
      draw();
    }
  }).observe(el);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
}

export function card(label, value) {
  const d = document.createElement('div');
  d.className = 'card';
  const b = document.createElement('b');
  b.textContent = value;
  const s = document.createElement('span');
  s.className = 'label';
  s.textContent = label;
  d.append(b, s);
  return d;
}

/**
 * Chart builders shared by the dashboards. Each returns a function that draws into an element once it has a width.
 * Rows are arrays, so '0', '1' and '2' below are column positions.
 */
export function chartKit(Plot) {
  // Horizontal bars from rows of [label, value, highlighted?].
  const bars = (rows, { percent = false, left = 150 } = {}) => (el, green) =>
    Plot.plot(
      plotBase(el, {
        height: 40 + rows.length * 26,
        marginLeft: left,
        x: { label: null, grid: true, percent, ...(percent ? { domain: [0, 100] } : {}) },
        y: { label: null, domain: rows.map((r) => r[0]) },
        marks: [Plot.barX(rows, { y: '0', x: '1', fill: (r) => (r[2] ? green : 'currentColor'), fillOpacity: 0.85 }), Plot.ruleX([0])],
      }),
    );
  // Stacked bars or columns from rows of [category, series, value]. The first series is green, the second ink.
  const stacked = (rows, series, { horizontal = false, interval, left = 70 } = {}) => (el, green) => {
    const scale = { label: null, grid: true };
    const cat = horizontal ? { label: null, domain: [...new Set(rows.map((r) => r[0]))] } : { label: null };
    const mark = horizontal ? Plot.barX : Plot.rectY;
    const ch = { fill: '1', fillOpacity: 0.85, ...(horizontal ? { y: '0', x: '2' } : { x: '0', y: '2', interval }) };
    return Plot.plot(
      plotBase(el, {
        height: horizontal ? 60 + cat.domain.length * 24 : 260,
        marginLeft: horizontal ? left : 44,
        x: horizontal ? scale : cat,
        y: horizontal ? cat : scale,
        color: { domain: series, range: [green, 'currentColor'], legend: series.length > 1 },
        marks: [mark(rows, ch), horizontal ? Plot.ruleX([0]) : Plot.ruleY([0])],
      }),
    );
  };
  // A line over time from rows of [date, value]. A null value leaves a gap.
  const line = (rows, { percent = false } = {}) => (el, green) =>
    Plot.plot(
      plotBase(el, {
        marginLeft: 44,
        x: { label: null },
        y: { label: null, grid: true, percent, ...(percent ? { domain: [0, 100] } : {}) },
        marks: [Plot.areaY(rows, { x: '0', y: '1', fill: green, fillOpacity: 0.12 }), Plot.lineY(rows, { x: '0', y: '1', stroke: green, strokeWidth: 1.75 }), Plot.ruleY([0])],
      }),
    );
  return { bars, stacked, line };
}

/**
 * Fill a dashboard from one page description: { cards: [[label, value]], charts: [[caption, draw]], tables: [{ head, rows, cls, text }] }.
 * A table cell is a number, a string, or { t: text, c: class }. `text` lists the columns to left-align.
 */
export function renderPage(root, page) {
  const green = accent();
  root.querySelector('[data-cards]').replaceChildren(...page.cards.map(([label, value]) => card(label, value)));

  const figures = page.charts.map(([caption]) => {
    const f = document.createElement('figure');
    const c = document.createElement('figcaption');
    c.className = 'label';
    c.textContent = caption;
    f.append(c, document.createElement('div'));
    return f;
  });
  root.querySelector('[data-charts]').replaceChildren(...figures);
  page.charts.forEach(([, draw], i) => figures[i].lastChild.append(draw(figures[i].lastChild, green)));

  const tables = (page.tables ?? [page.table]).map((t) => {
    const table = document.createElement('table');
    table.className = `data ${t.cls ?? ''}`;
    const row = (cells, tag) => {
      const tr = document.createElement('tr');
      cells.forEach((v, i) => {
        const cell = document.createElement(tag);
        cell.textContent = typeof v === 'number' ? num.format(v) : (v?.t ?? v);
        cell.className = v?.c ?? ((t.text ?? [1]).includes(i) ? 'text' : '');
        tr.append(cell);
      });
      return tr;
    };
    if (t.caption) table.createCaption().textContent = t.caption;
    table.createTHead().append(row(t.head, 'th'));
    table.createTBody().append(...t.rows.map((r) => row(r, 'td')));
    return table;
  });
  root.querySelector('[data-table]').replaceChildren(...tables);
}
