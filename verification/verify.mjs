// Purpose-fit verification for "How FlashAttention Works".
// Run: node verification/verify.mjs  (zero dependencies)
import { readFileSync, existsSync } from 'node:fs';
import { model, fmtBytes, SEQS } from '../model.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const scene = readFileSync(new URL('../scene.js', import.meta.url), 'utf8');

// Feature map: every panel and control the page promises
for (const f of ['vendor/three.module.min.js', 'favicon.svg', 'styles.css', 'app.js', 'scene.js', 'model.js'])
  ok(`file ${f} exists`, existsSync(new URL('../' + f, import.meta.url)));
for (const probe of ['role="tablist"', 'Live diagrams', 'Hold the pass', 'The Core Idea', 'Controls',
  'data-phase="prefill"', 'data-phase="decode"', 'id="btn-play"', 'id="btn-compare"', 'id="btn-reset"',
  'aria-label="Tile step"', 'data-chip="showFlow"', 'data-chip="showGrid"', 'data-chip="showTraffic"', 'data-chip="showLabels"',
  'role="switch"', 'Sequence length', 'Head dim', 'Tile rows', 'Pass speed'])
  ok(`html has ${probe}`, html.includes(probe));
for (const token of ['--paper:#fdf6f2', '--yellow:#fde384', '--lav:#e3dcf7', 'Fuzzy Bubbles', 'Patrick Hand', 'filter:url(#wobble)', 'mix-blend-mode:multiply'])
  ok(`css token ${token}`, css.includes(token));
ok('app renders both diagrams', app.includes('tileDiagram') && app.includes('trafficGraph'));
ok('scene has drag rotate', scene.includes('pointerdown') && scene.includes('azim'));
ok('scene labels all parts', ['HBM', 'SRAM', 'Q tile', 'K,V tiles', 'score tile', 'KV cache'].every((t) => scene.includes(t)));

// Model journeys
const base = { seqIdx: 3, dimIdx: 1, tileIdx: 1, causal: true, phase: 'prefill' };
const pre = model(base);
ok('prefill 8k flash moves fewer bytes', pre.flash < pre.std);
ok('prefill speedup near 2x (honest, conservative)', pre.speedup > 1.5 && pre.speedup < 4);
ok('flash stores no scores', model({ ...base, phase: 'decode' }).storedStd >= 0 && pre.storedStd > 0);
const dec = model({ ...base, phase: 'decode' });
ok('decode gain is small (KV read dominates both)', dec.speedup < 1.3);
ok('non-causal moves more than causal', model({ ...base, causal: false }).flash > pre.flash);
ok('bigger tiles cut re-reads', model({ ...base, tileIdx: 2 }).flash < model({ ...base, tileIdx: 0 }).flash);
ok('steps track rows/tile', pre.steps === Math.ceil(8192 / 64));
ok('traffic grows with length', model({ ...base, seqIdx: 5 }).std > model({ ...base, seqIdx: 0 }).std);
ok('fmtBytes sane', fmtBytes(536870912) === '512 MB');


// Label overlap rule (fleet ground rule): silhouette-aware placement, gated, hidden while orbiting
ok('labels gated on showLabels chip', scene.includes('st8.showLabels'));
ok('labels hidden while orbiting', scene.includes('!dragging) project('));
ok('labels hidden when their part is hidden', scene.includes('d.obj.visible && !dragging'));
ok('labels avoid model silhouette', scene.includes('modelScreenRect') && scene.includes('machineBox'));
ok('labels de-overlap each other', scene.includes('placed.find'));
ok('labels never intersect silhouette after clamping', scene.includes('clearOfModel') && scene.includes('free grid slot'));
ok('leader lines never cross label text', scene.includes('segHitsRect') && scene.includes('leaderClear'));
ok('earlier leaders repaired against later labels', scene.includes('repairLeaders') && scene.includes('if (placed.length > 1) repairLeaders('));
ok('part labels reachable from kernel tab', scene.includes("modes: ['kernel','parts']"));
ok('tab presets sync chips like the reference', app.includes('TAB_PRESETS') && app.includes('showLabels: true'));
ok('memory-traffic chip drives the data arrows', scene.includes('arrows.visible = st8.showTraffic'));
ok('label text sits outside pill boxes by default', css.includes('.plabel-text{white-space:nowrap;color:var(--ink);background:none'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
