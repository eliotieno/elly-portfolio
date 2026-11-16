// Shared by the map and chart demos.

// The site and the basemap are both dark, so map layers use the dark tokens directly.
export const INK = '#f1ecde';
export const ACCENT = '#8fd18a';
export const MID = '#d9d77c'; // the middle of the walking-time scale, between ACCENT and WARM
export const GREY = '#8f958c';
export const WARM = '#e3a657';
export const BG = '#0c1311';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
// Public elevation tiles (Mapzen Terrain Tiles on AWS Open Data). Hillshade, 3D relief and contours all come from these.
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TERRAIN_CREDIT = 'Elevation: Mapzen Terrain Tiles';
// Sentinel-2 cloudless 2016 by EOX, CC BY 4.0. The credit below is the wording the licence asks for.
const IMAGERY = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';
const IMAGERY_CREDIT =
  '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by <a href="https://eox.at" target="_blank" rel="noopener">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016 &amp; 2017)';

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

/**
 * The public basemap, recoloured to the site's palette: spruce ground, teal water, paper-coloured names.
 * Its sprite icons are dropped, since nothing here uses them.
 */
function tune(style) {
  const paint = {
    background: { 'background-color': BG },
    water: { 'fill-color': '#12282f' },
    waterway: { 'line-color': '#1d3f49' },
    landcover_wood: { 'fill-color': '#11211a' },
    landuse_park: { 'fill-color': '#11211a' },
    landuse_residential: { 'fill-color': '#151d1a' },
    building: { 'fill-color': '#151d1a', 'fill-outline-color': '#202a26' },
    highway_path: { 'line-color': '#27322d' },
    highway_minor: { 'line-color': '#222c28' },
    highway_major_casing: { 'line-color': '#0c1311' },
    highway_major_inner: { 'line-color': '#2b3631' },
    highway_major_subtle: { 'line-color': '#2b3631' },
    highway_motorway_casing: { 'line-color': '#0c1311' },
    highway_motorway_inner: { 'line-color': '#35423c' },
    highway_motorway_subtle: { 'line-color': '#2b3631' },
    boundary_state: { 'line-color': '#4a5a50' },
    'boundary_country_z0-4': { 'line-color': '#62756a' },
    'boundary_country_z5-': { 'line-color': '#62756a' },
    water_name: { 'text-color': '#6f9aa6', 'text-halo-color': BG },
  };
  for (const l of style.layers) {
    Object.assign((l.paint ??= {}), paint[l.id]);
    delete l.paint['fill-pattern'];
    if (l.type !== 'symbol') continue;
    if (l.layout?.['icon-image']) delete l.layout['icon-image'];
    if (l.id.startsWith('place') || l.id.startsWith('highway_name')) {
      const big = /city|country|state/.test(l.id);
      Object.assign(l.paint, { 'text-color': big ? '#c5c3b3' : '#8f9689', 'text-halo-color': 'rgba(12,19,17,0.85)', 'text-halo-width': 1.2 });
    }
  }
  style.layers = style.layers.filter((l) => !l.id.startsWith('road_oneway'));
  delete style.sprite;
  return style;
}

let base;
/** MapLibre, with its worker and the recoloured basemap ready. */
export async function loadMap() {
  // MapLibre 6 finds its worker relative to its own file, which a bundler moves. Hand it the real URL.
  const [m, worker, style] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    (base ??= fetch(MAP_STYLE)
      .then((r) => r.json())
      .then(tune)),
  ]);
  const gl = m.default ?? m;
  gl.setWorkerUrl(worker.default);
  return { gl, style: () => structuredClone(style) };
}

/** Create a map that fits `bounds` ([[w, s], [e, n]]) and does not hijack page scroll. `lib` is what loadMap returns. */
export function makeMap(lib, container, bounds, options = {}) {
  const map = new lib.gl.Map({
    container,
    style: lib.style(),
    bounds,
    fitBoundsOptions: { padding: 32 },
    cooperativeGestures: true,
    attributionControl: { compact: true },
    maxPitch: 70,
    ...options,
  });
  if (import.meta.env.DEV) (window.__maps ??= []).push(map); // a handle for testing in the browser console
  // The credits start folded, so on a phone they do not sit over the first pop-up. One tap opens them.
  map.once('load', () => {
    const attrib = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
    attrib?.classList.remove('maplibregl-compact-show');
    attrib?.removeAttribute('open');
  });
  return map;
}

/**
 * Map furniture: zoom and compass, full screen, a scale bar, and a readout of the position under the pointer
 * (the map centre on touch screens), with ground height where the map has relief.
 */
export function furnish(map, gl, corner = 'top-right') {
  map.addControl(new gl.NavigationControl({ visualizePitch: true }), corner);
  map.addControl(new gl.FullscreenControl(), corner);
  map.addControl(new gl.ScaleControl({ maxWidth: 110 }), 'bottom-left');
  const box = Object.assign(document.createElement('div'), { className: 'maplibregl-ctrl readout' });
  const deg = (v, pos, neg) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
  const show = (at) => {
    // Height comes back multiplied by the relief exaggeration, so divide it out.
    const k = map.getTerrain()?.exaggeration;
    const h = k ? map.queryTerrainElevation(at) : null;
    box.textContent = `${deg(at.lat, 'N', 'S')}  ${deg(at.lng, 'E', 'W')}${h == null ? '' : `  ${num.format(Math.round(h / k))} m`}  z${map.getZoom().toFixed(1)}`;
  };
  map.addControl({ onAdd: () => box, onRemove: () => box.remove() }, 'bottom-left');
  map.on('mousemove', (e) => show(e.lngLat));
  map.on('move', () => matchMedia('(hover: none)').matches && show(map.getCenter()));
  map.once('idle', () => show(map.getCenter()));
}

/**
 * Relief from the elevation tiles: hillshade always, a 3D surface when `relief` is a number (its exaggeration),
 * and contour lines with labelled index contours when `contours` is true. Returns once the layers are in.
 */
export async function addTerrain(map, gl, { relief = 0, contours = false } = {}) {
  const dem = () => ({ type: 'raster-dem', tiles: [TERRARIUM], encoding: 'terrarium', tileSize: 256, maxzoom: 12, attribution: TERRAIN_CREDIT });
  const under = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  map.addSource('dem-shade', dem());
  map.addLayer(
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem-shade',
      paint: { 'hillshade-shadow-color': '#02060a', 'hillshade-highlight-color': '#4a5f52', 'hillshade-accent-color': '#02060a', 'hillshade-exaggeration': 0.6 },
    },
    under,
  );
  if (relief) {
    // Its own source: sharing one between hillshade and the 3D surface costs rendering quality.
    map.addSource('dem-relief', dem());
    map.setTerrain({ source: 'dem-relief', exaggeration: relief });
  }
  if (contours) {
    const { default: mlcontour } = await import('maplibre-contour');
    const source = new mlcontour.DemSource({ url: TERRARIUM, encoding: 'terrarium', maxzoom: 12, worker: true });
    source.setupMaplibre(gl);
    map.addSource('contours', {
      type: 'vector',
      // zoom: [contour interval, index contour interval] in metres
      tiles: [source.contourProtocolUrl({ thresholds: { 7: [200, 1000], 9: [100, 500], 10: [50, 250], 11: [20, 100], 13: [10, 50] }, overzoom: 1 })],
      maxzoom: 14,
    });
    map.addLayer(
      {
        id: 'contour-lines',
        type: 'line',
        source: 'contours',
        'source-layer': 'contours',
        paint: { 'line-color': '#c9b48a', 'line-opacity': ['match', ['get', 'level'], 1, 0.6, 0.3], 'line-width': ['match', ['get', 'level'], 1, 1.1, 0.6] },
      },
      under,
    );
    map.addLayer({
      id: 'contour-labels',
      type: 'symbol',
      source: 'contours',
      'source-layer': 'contours',
      filter: ['>', ['get', 'level'], 0],
      layout: { 'symbol-placement': 'line', 'text-size': 10, 'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ' m'], 'text-font': ['Noto Sans Regular'] },
      paint: { 'text-color': '#c9b48a', 'text-opacity': 0.75, 'text-halo-color': BG, 'text-halo-width': 1.2 },
    });
  }
}

/** A Sentinel-2 satellite layer under the roads and names, hidden until `showImagery(map, true)`. */
export function addImagery(map) {
  map.addSource('imagery', { type: 'raster', tiles: [IMAGERY], tileSize: 256, maxzoom: 14, attribution: IMAGERY_CREDIT });
  map.addLayer({ id: 'imagery', type: 'raster', source: 'imagery', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.15, 'raster-brightness-max': 0.85 } }, 'waterway');
}

export function showImagery(map, on) {
  map.setLayoutProperty('imagery', 'visibility', on ? 'visible' : 'none');
  // The hillshade is tuned for the dark ground; over a photograph it only muddies it.
  if (map.getLayer('hillshade')) map.setLayoutProperty('hillshade', 'visibility', on ? 'none' : 'visible');
}

/** Call `fn(index)` when a `[data-step]` element inside `root` crosses the middle of the screen. */
export function onStep(root, fn) {
  const steps = [...root.querySelectorAll('[data-step]')];
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        steps.forEach((s) => s.classList.toggle('on', s === e.target));
        fn(steps.indexOf(e.target));
      }
    },
    { rootMargin: '-50% 0px -50% 0px' },
  );
  steps.forEach((s) => io.observe(s));
}

/** A pop-up body: a title and rows of label and value. Text only, so no data can inject markup. */
export function popBody(title, rows, ...extra) {
  const el = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
  const dl = document.createElement('dl');
  for (const [k, v] of rows) dl.append(el('dt', k), el('dd', v));
  const box = el('div', '');
  box.className = 'pop';
  box.append(el('strong', title), dl, ...extra);
  return box;
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
    style: { background: 'transparent', fontFamily: "'Libre Franklin Variable', system-ui, sans-serif", fontSize: '11px', overflow: 'visible' },
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
