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
