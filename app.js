// How FlashAttention Works - UI state, model and diagrams.
// The 3D machine lives in scene.js; this file owns state, panels and SVG diagrams.
import { createScene } from './scene.js?v=5';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

import { SEQS, DIMS, TILES, model, fmtBytes, fmtSeq } from './model.js?v=5';

const defaults = {
  tab: 'kernel',
  showFlow: true, showGrid: true, showTraffic: true, showLabels: false,
  compute: true, standard: false, causal: true,
  seqIdx: 3, dimIdx: 1, tileIdx: 1, speed: 0.7,
  phase: 'prefill', paused: false, hold: false, holdStep: 0,
};

let state = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem('flash-how') || 'null');
  if (saved && typeof saved === 'object') state = { ...defaults, ...saved };
} catch (_) {}

const listeners = new Set();
function set(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem('flash-how', JSON.stringify(state)); } catch (_) {}
  render();
  listeners.forEach((f) => f(state));
}
export function getState() { return state; }
export function onChange(f) { listeners.add(f); }

// ---- Live diagram 1: one tile step ----
function tileDiagram(st) {
  const m = model(st);
  const cells = 8, size = 17, x0 = 10, y0 = 12;
  const step = m.steps > 0 ? (st.hold ? st.holdStep % m.steps : 0) : 0;
  const bandRow = st.hold ? (step * 8) / m.steps : 5;
  let g = '';
  g += `<rect class="td-grid" x="${x0}" y="${y0}" width="${cells * size}" height="${cells * size}" rx="2"/>`;
  for (let i = 1; i < cells; i++) {
    g += `<path class="td-lines" d="M${x0 + i * size} ${y0}v${cells * size}M${x0} ${y0 + i * size}h${cells * size}" fill="none"/>`;
  }
  if (st.causal) g += `<path class="td-mask" d="M${x0} ${y0}h${cells * size}v${cells * size}z"/>`;
  const by = y0 + bandRow * size * (cells / 8) * 0 + (bandRow * size) / 1 * 0;
  const ry = y0 + Math.min(cells - 1, Math.round((step / Math.max(1, m.steps)) * (cells - 1))) * size;
  g += `<rect class="td-q" x="${x0}" y="${ry}" width="${cells * size}" height="${size}" opacity="${st.standard ? 0.25 : 0.9}"/>`;
  g += `<rect class="td-kv" x="${x0 + 2 * size}" y="${y0}" width="${size}" height="${cells * size}" opacity="${st.standard ? 0.25 : 0.9}"/>`;
  const ax = x0 + cells * size + 14;
  g += `<path class="td-arrow" d="M${ax - 6} ${y0 + 40}h10M${ax} ${y0 + 34}l4 6-4 6"/>`;
  g += `<rect class="td-score" x="${ax + 6}" y="${y0 + 18}" width="34" height="34" rx="3"/>`;
  g += `<text class="td-txt" x="${ax + 23}" y="${y0 + 66}" text-anchor="middle">SRAM</text>`;
  const ox = ax + 52;
  g += `<path class="td-arrow" d="M${ox - 4} ${y0 + 40}h10M${ox + 2} ${y0 + 34}l4 6-4 6"/>`;
  g += `<rect class="td-out" x="${ox + 8}" y="${y0 + 6}" width="16" height="${cells * size - 12}" rx="2"/>`;
  g += `<text class="td-txt" x="${ox + 16}" y="${y0 + cells * size + 14}" text-anchor="middle">O</text>`;
  return `<svg viewBox="0 0 236 170" role="img" aria-label="One tile step: a band of query rows meets a column of key,value tiles, the small score tile stays in SRAM and only the finished output row leaves">${g}</svg>`;
}

// ---- Live diagram 2: HBM traffic vs sequence length ----
function trafficGraph(st) {
  const W = 300, H = 128, px = 34, py = 98;
  const xs = SEQS.map((n) => n);
  const logMin = Math.log2(xs[0]), logMax = Math.log2(xs[xs.length - 1]);
  const X = (n) => px + ((Math.log2(n) - logMin) / (logMax - logMin)) * (256);
  const maxStd = model({ ...st, seqIdx: xs.length - 1, standard: true }).std;
  const Y = (bytes) => py - (bytes / maxStd) * 78;
  const mk = (key, extra) => xs.map((n, i) => `${i ? 'L' : 'M'}${X(n).toFixed(1)} ${Y(model({ ...st, seqIdx: i })[key]).toFixed(1)}`).join(' ');
  const stdPath = mk('std'), flashPath = mk('flash');
  const cur = model(st);
  const cx = X(cur.N);
  const cy = Y(st.standard ? cur.std : cur.flash);
  let g = `<path d="${stdPath}" class="g-curve g-curve-std"/>`;
  g += `<path d="${flashPath}" class="g-curve g-curve-flash"/>`;
  [1, 3, 5].forEach((i) => {
    g += `<line x1="${X(xs[i])}" y1="14" x2="${X(xs[i])}" y2="${py}" class="g-grid"/>`;
  });
  g += `<line x1="${px}" y1="14" x2="${px}" y2="${py}" class="g-axis"/><line x1="${px}" y1="${py}" x2="${px + 262}" y2="${py}" class="g-axis"/>`;
  xs.forEach((n, i) => { if (i % 2 === 1) return; g += `<text x="${X(n)}" y="${py + 13}" class="g-tick" text-anchor="middle">${fmtSeq(n)}</text>`; });
  g += `<text x="162" y="126" class="g-title" text-anchor="middle">sequence length</text>`;
  g += `<text x="12" y="58" class="g-title" text-anchor="middle" transform="rotate(-90 12 58)">bytes</text>`;
  g += `<line x1="${cx}" y1="16" x2="${cx}" y2="${py}" class="g-cursor" style="stroke:#1f1a1d;stroke-width:1;stroke-dasharray:2 3;opacity:.5"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="5" class="g-dot"/>`;
  const tag = st.standard
    ? `<span class="graph-tag std">standard: N×N hits slow memory</span>`
    : `<span class="graph-tag">flash: scores stay on chip</span>`;
  return `<figcaption class="graph-head"><span>Memory traffic vs length</span>${tag}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Graph of slow-memory traffic against sequence length for both kernels, with a dot at the current setting">${g}</svg>`;
}

// ---- Panel rendering ----
const HOLD_HINTS = {
  idle: 'Hold it still to inspect each tile step.',
  load: (i, n) => `Step ${i + 1} of ${n}: a Q tile and a K,V tile meet on chip.`,
  write: (i, n) => `Step ${i + 1} of ${n}: the finished output row leaves for slow memory.`,
};

function meters(st) {
  const m = model(st);
  const maxT = model({ ...st, seqIdx: 5, standard: true }).std;
  const traffic = st.standard ? m.std : m.flash;
  $('#m-traffic').textContent = fmtBytes(traffic);
  $('#m-traffic-fill').style.transform = `scaleX(${Math.max(0.02, traffic / maxT)})`;
  const stored = st.standard ? m.storedStd : 0;
  $('#m-stored').textContent = stored ? fmtBytes(stored) : 'none';
  $('#m-stored-fill').style.transform = `scaleX(${Math.max(0.02, stored / maxT)})`;
  const sp = st.standard ? 1 : m.speedup;
  $('#m-speed').textContent = st.standard ? '1.0×' : `${sp < 1.05 ? sp.toFixed(1) : sp.toFixed(1)}×`;
  $('#m-speed-fill').style.transform = `scaleX(${Math.max(0.02, Math.min(1, sp / 4))})`;
}

function holdUI(st) {
  const m = model(st);
  const slider = $('#hold-slider');
  slider.max = String(Math.max(0, m.steps - 1));
  if (st.holdStep > m.steps - 1) st.holdStep = m.steps - 1;
  slider.value = String(st.holdStep);
  slider.style.setProperty('--pct', `${(st.holdStep / Math.max(1, m.steps - 1)) * 100}%`);
  $('#hold-range').classList.toggle('is-off', !st.hold);
  $('#hold-val').textContent = `${st.holdStep + 1} of ${m.steps}`;
  const sw = $('#hold-switch');
  sw.classList.toggle('is-on', st.hold);
  sw.setAttribute('aria-checked', String(st.hold));
  $('#hold-hint').textContent = !st.hold
    ? HOLD_HINTS.idle
    : st.holdStep % 2 === 0
      ? HOLD_HINTS.load(st.holdStep, m.steps)
      : HOLD_HINTS.write(st.holdStep, m.steps);
}

function phaseUI(st) {
  $$('#phase-hint').forEach(() => {});
  $('#phase-hint').textContent = st.phase === 'decode'
    ? 'One new token against the whole KV cache; still memory-bound.'
    : 'Every query row arrives together; tiling keeps scores on chip.';
  $$('.seg [data-phase]').forEach((b) => {
    const on = b.dataset.phase === st.phase;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', String(on));
  });
}

function tilesUI(st) {
  const t = (id, on) => {
    const el = $(id);
    el.classList.toggle('is-on', on);
    el.querySelector('.switch').classList.toggle('is-on', on);
  };
  t('#tile-compute', st.compute);
  t('#tile-standard', st.standard);
  t('#tile-causal', st.causal);
}

function chipsUI(st) {
  $$('.chip[data-chip]').forEach((c) => {
    const on = !!st[c.dataset.chip];
    c.classList.toggle('is-on', on);
    c.setAttribute('aria-pressed', String(on));
  });
}

function tabsUI(st) {
  $$('.tab[data-tab]').forEach((b) => {
    const on = b.dataset.tab === st.tab;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', String(on));
  });
}

function rangesUI(st) {
  const setR = (id, val, max) => {
    const el = $(id);
    el.value = String(val);
    el.style.setProperty('--pct', `${(val / max) * 100}%`);
  };
  setR('#r-seq', st.seqIdx, 5);
  setR('#r-dim', st.dimIdx, 2);
  setR('#r-tile', st.tileIdx, 2);
  setR('#r-speed', st.speed, 1);
  $('#v-seq').textContent = fmtSeq(SEQS[st.seqIdx]);
  $('#v-dim').textContent = String(DIMS[st.dimIdx]);
  $('#v-tile').textContent = String(TILES[st.tileIdx]);
  $('#v-speed').textContent = st.speed < 0.4 ? 'slow-mo' : `${Math.round(st.speed * 100)}%`;
}

function playUI(st) {
  const btn = $('#btn-play');
  btn.setAttribute('aria-label', st.paused ? 'Play' : 'Pause');
  btn.querySelector('.ic-pause').style.display = st.paused ? 'none' : '';
  btn.querySelector('.ic-play').style.display = st.paused ? '' : 'none';
  const cmp = $('#btn-compare');
  cmp.classList.toggle('is-on', st.standard);
  cmp.setAttribute('aria-pressed', String(st.standard));
  cmp.setAttribute('aria-label', st.standard ? 'Run the flash kernel instead' : 'Run the standard kernel instead');
}

function render() {
  const st = state;
  tabsUI(st); chipsUI(st); tilesUI(st); rangesUI(st); phaseUI(st); holdUI(st); meters(st); playUI(st);
  $('#tile-diagram').innerHTML = tileDiagram(st);
  $('#traffic-graph').innerHTML = trafficGraph(st);
}

// ---- Wiring ----
const TAB_PRESETS = {
  kernel: { showFlow: true, showGrid: true, showTraffic: true, showLabels: false },
  parts: { showFlow: false, showGrid: false, showTraffic: false, showLabels: true },
  principle: { showFlow: true, showGrid: true, showTraffic: true, showLabels: true },
};
$$('.tab[data-tab]').forEach((b) => b.addEventListener('click', () => set({ tab: b.dataset.tab, ...(TAB_PRESETS[b.dataset.tab] || {}) })));
$$('.chip[data-chip]').forEach((c) => c.addEventListener('click', () => set({ [c.dataset.chip]: !state[c.dataset.chip] })));
$('#tile-compute').addEventListener('click', () => set({ compute: !state.compute }));
$('#tile-standard').addEventListener('click', () => set({ standard: !state.standard }));
$('#tile-causal').addEventListener('click', () => set({ causal: !state.causal }));
$$('.seg [data-phase]').forEach((b) => b.addEventListener('click', () => set({ phase: b.dataset.phase })));
$('#r-seq').addEventListener('input', (e) => set({ seqIdx: +e.target.value, holdStep: 0 }));
$('#r-dim').addEventListener('input', (e) => set({ dimIdx: +e.target.value }));
$('#r-tile').addEventListener('input', (e) => set({ tileIdx: +e.target.value, holdStep: 0 }));
$('#r-speed').addEventListener('input', (e) => set({ speed: +e.target.value }));
$('#hold-switch').addEventListener('click', () => set({ hold: !state.hold, holdStep: state.holdStep }));
$('#hold-slider').addEventListener('input', (e) => set({ hold: true, holdStep: +e.target.value }));
$('#btn-play').addEventListener('click', () => set({ paused: !state.paused }));
$('#btn-compare').addEventListener('click', () => set({ standard: !state.standard }));
$('#btn-reset').addEventListener('click', () => { resetPass(); set({ holdStep: 0 }); });

let resetPass = () => {};
render();
createScene($('#stage'), $('#labels'), {
  getState, onChange,
  onReset: (f) => { resetPass = f; },
  onNoWebGL: () => { $('#no3d').hidden = false; },
});
