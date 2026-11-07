// The coloured-pencil 3D machine: slow memory (HBM) on the left, a fast chip
// (SRAM) on the right, and small tiles flying between them as attention runs.
import * as THREE from 'three';

const INK = 0x1f1a1d;
const COL = {
  hbm: 0xd9ccef, hbmEdge: 0x8a6fd0, chip: 0x3a3438, sram: 0xf2c94c,
  q: 0xfde384, kv: 0xe3dcf7, score: 0xf8b4ac, out: 0xa9c6f8,
  table: 0xeadfce, arrow: 0xf39a2e, red: 0xd9453a, blue: 0x3f7de6,
};

function hatchTexture(color = '#4a4347', gap = 7, alpha = 0.16) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = color; x.globalAlpha = alpha; x.lineWidth = 1.4; x.lineCap = 'round';
  for (let i = -128; i < 128; i += gap) {
    x.beginPath();
    x.moveTo(i + (Math.random() * 4 - 2), 0);
    x.lineTo(i + 128 + (Math.random() * 4 - 2), 128);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(60,40,30,0.28)');
  g.addColorStop(1, 'rgba(60,40,30,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function scoreTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d');
  const paint = (heat) => {
    x.fillStyle = '#fffaf3'; x.fillRect(0, 0, 96, 96);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const v = heat[i * 6 + j] || 0;
      x.fillStyle = `rgba(217,69,58,${(0.12 + v * 0.6).toFixed(2)})`;
      x.fillRect(4 + j * 15, 4 + i * 15, 11, 11);
    }
    x.strokeStyle = '#c4473a'; x.lineWidth = 2; x.strokeRect(2, 2, 92, 92);
  };
  const tex = new THREE.CanvasTexture(c);
  return { tex, paint };
}

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function jitterGeo(geo, amt = 0.03) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + (rnd() - 0.5) * amt, p.getY(i) + (rnd() - 0.5) * amt, p.getZ(i) + (rnd() - 0.5) * amt);
  }
  p.needsUpdate = true;
  return geo;
}

function pencil(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, map: opts.hatch === false ? null : hatchTexture(opts.hatchColor || '#4a4347', opts.gap || 7, opts.hatchAlpha ?? 0.14), transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
}

function box(w, h, d, color, opts = {}) {
  const g = opts.crumple === false ? new THREE.BoxGeometry(w, h, d) : jitterGeo(new THREE.BoxGeometry(w, h, d), opts.jitter ?? 0.035);
  const m = new THREE.Mesh(g, pencil(color, opts));
  const edges = new THREE.LineSegments(
    jitterGeo(new THREE.EdgesGeometry(g, 20), 0.012),
    new THREE.LineBasicMaterial({ color: opts.edge ?? INK, transparent: true, opacity: opts.edgeOpacity ?? 0.75 })
  );
  m.add(edges);
  return m;
}

function arrowCurve(from, to, lift = 1.4) {
  const mid = from.clone().lerp(to, 0.5);
  mid.y += lift;
  return new THREE.QuadraticBezierCurve3(from, mid, to);
}

function pencilArrow(curve, color = COL.arrow) {
  const pts = curve.getPoints(24);
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  jitterGeo(g, 0.02);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  const grp = new THREE.Group();
  grp.add(line);
  const end = pts[pts.length - 1], prev = pts[pts.length - 3];
  const dir = end.clone().sub(prev).normalize();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), pencil(color, { hatch: false }));
  cone.position.copy(end);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  grp.add(cone);
  return grp;
}

export function createScene(stageEl, labelsEl, bus) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    bus.onNoWebGL();
    return;
  }
  renderer.setClearColor(0xffffff, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  stageEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  let azim = 0.55, azimV = 0, polar = 0.42, dist = 15.5;
  const target = new THREE.Vector3(0, 1.15, 0);

  scene.add(new THREE.HemisphereLight(0xfff8ec, 0xd9cbb8, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(4, 8, 5);
  scene.add(sun);

  // Table
  const table = box(11.5, 0.5, 7.6, COL.table, { gap: 11, hatchAlpha: 0.07 });
  table.position.y = -0.25;
  scene.add(table);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(11, 7), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.9 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  scene.add(shadow);

  // HBM bank (left): slow, big
  const hbm = new THREE.Group();
  const hbmBody = box(3.4, 1.5, 4.6, COL.hbm, { hatchColor: '#6a54a8', gap: 8 });
  hbmBody.position.y = 0.75;
  hbm.add(hbmBody);
  // memory cards on top: Q (yellow), K,V (lavender), O (blue)
  const cardRow = (z, color, n = 4) => {
    const row = [];
    for (let i = 0; i < n; i++) {
      const c = box(0.52, 0.34, 0.7, color, { hatch: false });
      c.position.set(-1.15 + i * 0.77, 1.67, z);
      hbm.add(c); row.push(c);
    }
    return row;
  };
  const qCards = cardRow(-1.55, COL.q);
  const kvCards = cardRow(-0.55, COL.kv);
  const oCards = cardRow(1.05, COL.out);
  // KV cache rack behind, for decode
  const kvRack = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const c = box(0.34, 0.5, 0.6, COL.kv, { hatch: false });
    c.position.set(-1.35 + i * 0.54, 1.74, 1.95);
    kvRack.add(c);
  }
  kvRack.visible = false;
  hbm.add(kvRack);
  hbm.position.set(-2.9, 0, 0);
  scene.add(hbm);

  // Standard mode: the giant score sheet that gets written to slow memory
  const sheet = new THREE.Group();
  const sheetMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshLambertMaterial({ color: COL.red, transparent: true, opacity: 0.32, side: THREE.DoubleSide }));
  sheet.add(sheetMesh);
  const sheetGrid = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.6, 3.6, 6, 6)), new THREE.LineBasicMaterial({ color: COL.red, transparent: true, opacity: 0.5 }));
  sheet.add(sheetGrid);
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.set(-2.9, 2.35, 0);
  sheet.visible = false;
  scene.add(sheet);

  // GPU chip (right): fast, small
  const chip = new THREE.Group();
  const board = box(3.1, 0.5, 4.2, 0x6a5f68, { hatchColor: '#2a2528', gap: 10, hatchAlpha: 0.15 });
  board.position.y = 0.55;
  chip.add(board);
  const sram = box(1.7, 0.6, 2.1, COL.sram, { hatchColor: '#8a6a10', gap: 6 });
  sram.position.set(0, 1.1, -0.4);
  chip.add(sram);
  // score tile that lights up while computing
  const st = scoreTexture();
  const scoreTile = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: st.tex, transparent: true, opacity: 0.95 }));
  scoreTile.rotation.x = -Math.PI / 2;
  scoreTile.position.set(0, 1.44, -0.4);
  chip.add(scoreTile);
  // dials m and l
  const dial = (x) => {
    const d = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 20), pencil(0xfffaf3, { hatch: false }));
    face.rotation.x = Math.PI / 2;
    d.add(face);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), pencil(COL.red, { hatch: false }));
    needle.position.set(0, 0.12, 0.06);
    d.add(needle);
    d.position.set(x, 1.02, 1.35);
    d.userData.needle = needle;
    chip.add(d);
    return d;
  };
  const dialM = dial(-0.55), dialL = dial(0.55);
  chip.position.set(2.9, 0, 0);
  scene.add(chip);

  // Flying tile cards (reused each step)
  const mkFly = (color) => {
    const c = box(0.5, 0.1, 0.66, color, { hatch: false });
    c.visible = false;
    scene.add(c);
    return c;
  };
  const flyQ = mkFly(COL.q);
  const flyKV = [mkFly(COL.kv), mkFly(COL.kv), mkFly(COL.kv)];
  const flyOut = mkFly(COL.out);

  // Flow arrows (drawn once, re-shaped per phase)
  const arrows = new THREE.Group();
  scene.add(arrows);
  function buildArrows(decode) {
    arrows.clear();
    const hbmTop = new THREE.Vector3(-2.9, 2.0, decode ? 1.95 : -1.0);
    const sramTop = new THREE.Vector3(2.9, 1.75, -0.4);
    arrows.add(pencilArrow(arrowCurve(hbmTop, sramTop, 1.9), COL.arrow));
    arrows.add(pencilArrow(arrowCurve(sramTop.clone().add(new THREE.Vector3(0, 0, 0.6)), new THREE.Vector3(-2.9, 2.0, 1.05), 1.7), COL.blue));
  }
  buildArrows(false);

  // 2D silhouette of the machine: labels must land outside this rect
  const machineBox = new THREE.Box3();
  {
    const tb = new THREE.Box3();
    scene.updateMatrixWorld(true);
    [table, hbm, chip, sheet].forEach((o) => { tb.setFromObject(o); machineBox.union(tb); });
    machineBox.expandByScalar(0.1);
  }
  const corner = new THREE.Vector3();
  function modelScreenRect(w, h) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? machineBox.max.x : machineBox.min.x, i & 2 ? machineBox.max.y : machineBox.min.y, i & 4 ? machineBox.max.z : machineBox.min.z).project(camera);
      if (corner.z >= 1) continue;
      const sx = (corner.x * 0.5 + 0.5) * w, sy = (-corner.y * 0.5 + 0.5) * h;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
    if (minX > maxX) return { minX: w * 0.35, maxX: w * 0.65, minY: h * 0.35, maxY: h * 0.65 };
    return { minX, minY, maxX, maxY };
  }

  // ---- HTML labels ----
  const LABEL_DEFS = [
    { id: 'hbm', text: 'HBM: big, slow memory', obj: hbm, off: [-1.2, 2.6, 0], cls: '', modes: ['kernel','parts'] },
    { id: 'sram', text: 'SRAM: small, on-chip, fast', obj: sram, off: [0, 1.1, 0], cls: '', modes: ['kernel','parts'] },
    { id: 'q', text: 'Q tile', obj: qCards[1], off: [0, 0.55, 0], cls: '', modes: ['kernel','parts'] },
    { id: 'kv', text: 'K,V tiles', obj: kvCards[2], off: [0, 0.55, 0], cls: '', modes: ['kernel','parts'] },
    { id: 'sc', text: 'score tile', obj: scoreTile, off: [0, 0.35, 0], cls: '', modes: ['kernel','parts'] },
    { id: 'out', text: 'finished output rows', obj: oCards[1], off: [0, 0.6, 0], cls: 'plabel-blue', modes: ['kernel','parts'] },
    { id: 'kvc', text: 'KV cache', obj: kvRack, off: [0, 0.75, 0], cls: '', modes: ['kernel','parts'], decode: true },
    { id: 'n1', text: 'scores never leave the chip', obj: scoreTile, off: [0.2, 1.15, 0], cls: 'plabel-note', modes: ['principle'] },
    { id: 'n2', text: 'running max m', obj: dialM, off: [0, 0.5, 0], cls: 'plabel-note', modes: ['principle'] },
    { id: 'n3', text: 'running sum ℓ', obj: dialL, off: [0, 0.5, 0], cls: 'plabel-note', modes: ['principle'] },
    { id: 'n4', text: 'K,V re-read per tile', obj: hbm, off: [0.4, 2.3, -1.2], cls: 'plabel-blue', modes: ['principle'] },
    { id: 'n5', text: 'standard writes N×N here', obj: sheet, off: [0, 0.5, 0], cls: 'plabel-note', modes: ['principle'], std: true },
  ];
  const labelEls = {};
  for (const d of LABEL_DEFS) {
    const el = document.createElement('span');
    el.className = `plabel plabel-${d.id} ${d.cls}`;
    el.innerHTML = '<span class="plabel-dot"></span><span class="plabel-line"></span><span class="plabel-text"></span>';
    el.querySelector('.plabel-text').textContent = d.text;
    labelsEl.appendChild(el);
    labelEls[d.id] = el;
  }

  // ---- drag to turn ----
  let dragging = false, px = 0;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { dragging = true; px = e.clientX; azimV = 0; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - px; px = e.clientX;
    azimV = -dx * 0.0045;
    azim += azimV;
  });
  const stop = () => { dragging = false; };
  cv.addEventListener('pointerup', stop);
  cv.addEventListener('pointercancel', stop);

  // ---- animation state ----
  let passT = 0;          // seconds into the pass
  let liveTraffic = 0;    // bytes moved this pass
  let lastStep = -1;
  const heat = new Array(36).fill(0);
  st.paint(heat);

  bus.onReset(( ) => { passT = 0; liveTraffic = 0; lastStep = -1; });

  function resize() {
    const w = stageEl.clientWidth || 600, h = stageEl.clientHeight || 420;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stageEl);
  resize();

  const v = new THREE.Vector3();

  // leader-line geometry: a leader runs from the part's anchor point to the
  // nearest edge of its label box, and must never cross any label's text
  function segHitsRect(ax, ay, bx, by, r, pad) {
    const x0 = r.lx - pad, y0 = r.ly - pad, x1 = r.lx + r.tw + pad, y1 = r.ly + r.th + pad;
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    const pp = [-dx, dx, -dy, dy], qq = [ax - x0, x1 - ax, ay - y0, y1 - ay];
    for (let i = 0; i < 4; i++) {
      if (pp[i] === 0) { if (qq[i] < 0) return false; continue; }
      const t = qq[i] / pp[i];
      if (pp[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t0 < t1 && t1 > 0 && t0 < 1;
  }
  const boxOverlap = (a, b, pad) => a.lx < b.lx + b.tw + pad && a.lx + a.tw + pad > b.lx && a.ly < b.ly + b.th + pad && a.ly + a.th + pad > b.ly;

  function finishLabel(p) {
    p.ex = Math.max(p.lx, Math.min(p.x, p.lx + p.tw));
    p.ey = Math.max(p.ly, Math.min(p.y, p.ly + p.th));
    const len = Math.hypot(p.ex - p.x, p.ey - p.y);
    const el = p.el, text = p.text, line = el.querySelector('.plabel-line');
    el.style.opacity = 1;
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    line.style.width = `${len}px`;
    line.style.transform = `rotate(${Math.atan2(p.ey - p.y, p.ex - p.x)}rad)`;
    text.style.transform = `translate(${p.lx - p.x}px, ${p.ly - p.y}px)`;
  }

  function project(obj, off, el, rect, placed, w, h) {
    obj.updateWorldMatrix(true, false);
    v.set(...off).applyMatrix4(obj.matrixWorld);
    v.project(camera);
    if (v.z >= 1) { el.style.opacity = 0; return; }
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    const text = el.querySelector('.plabel-text');
    const tw = text.offsetWidth, th = text.offsetHeight;
    const cx = (rect.minX + rect.maxX) / 2, cy = (rect.minY + rect.maxY) / 2;
    let dx = x - cx, dy = y - cy;
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    let lx = x, ly = y;
    for (let t = 30; ; t += 8) {
      const px = x + dx * t, py = y + dy * t;
      const L = dx >= 0 ? px : px - tw;
      const T = dy >= 0 ? py : py - th;
      lx = L; ly = T;
      const clear = L > rect.maxX + 16 || L + tw < rect.minX - 16 || T > rect.maxY + 16 || T + th < rect.minY - 16;
      if (clear || t > Math.max(w, h)) break;
    }
    const clampX = (vv) => Math.max(4, Math.min(w - tw - 4, vv));
    const clampY = (vv) => Math.max(4, Math.min(h - th - 4, vv));
    const clearOfModel = () => lx > rect.maxX + 2 || lx + tw < rect.minX - 2 || ly > rect.maxY + 2 || ly + th < rect.minY - 2;
    const overlapsPlaced = () => placed.find((p) => boxOverlap({ lx, ly, tw, th }, p, 6));
    const leaderCrossings = () => {
      const ex = Math.max(lx, Math.min(x, lx + tw)), ey = Math.max(ly, Math.min(y, ly + th));
      return placed.filter((p) => segHitsRect(x, y, ex, ey, p, 4)).length;
    };
    const leaderClear = () => leaderCrossings() === 0;
    lx = clampX(lx); ly = clampY(ly);
    const lx0 = lx, ly0 = ly;
    let okPlace = false;
    for (let round = 0; round < 14 && !okPlace; round++) {
      for (let guard = 0; guard < 40; guard++) {
        const hit = overlapsPlaced();
        if (!hit) break;
        const below = hit.ly + hit.th + 6;
        ly = below + th + 6 <= h - 4 ? below : Math.max(4, hit.ly - th - 6);
      }
      for (let guard = 0; guard < 60 && !clearOfModel(); guard++) {
        const nx = clampX(lx + dx * 8), ny = clampY(ly + dy * 8);
        if (nx === lx && ny === ly) break;
        lx = nx; ly = ny;
      }
      okPlace = clearOfModel() && !overlapsPlaced() && leaderClear();
      if (!okPlace) {
        const ny = clampY(ly + 16);
        ly = ny !== ly ? ny : clampY(ly - 32);
      }
    }
    if (!okPlace) {
      // crowded stage (small screens): free grid slot clearing model, labels and leader lines
      let bd = 1e9, bx = -1, by = -1, bc = 1e9, bcd = 1e9, bcx = -1, bcy = -1;
      for (let gy = 4; gy <= h - th - 4; gy += 12) for (let gx = 4; gx <= w - tw - 4; gx += 12) {
        lx = gx; ly = gy;
        if (!clearOfModel() || overlapsPlaced()) continue;
        const d2 = (gx - lx0) ** 2 + (gy - ly0) ** 2;
        const c = leaderCrossings();
        if (c === 0 && d2 < bd) { bd = d2; bx = gx; by = gy; }
        if (c < bc || (c === bc && d2 < bcd)) { bc = c; bcd = d2; bcx = gx; bcy = gy; }
      }
      if (bx >= 0) { lx = bx; ly = by; okPlace = true; }
      else if (bcx >= 0) { lx = bcx; ly = bcy; okPlace = true; }
    }
    if (!okPlace) { el.style.opacity = 0; return; }
    const p = { el, text, x, y, lx, ly, tw, th };
    finishLabel(p);
    placed.push(p);
  }

  // repair pass: a label placed earlier must not have its leader cross a label placed later
  function repairLeaders(placed, rect, w, h) {
    for (const a of placed) {
      for (let guard = 0; guard < 40; guard++) {
        const hit = placed.find((b) => b !== a && segHitsRect(a.x, a.y, a.ex, a.ey, b, 4));
        if (!hit) break;
        let moved = false;
        for (let r = 10; r <= 130 && !moved; r += 10) {
          for (let k = 0; k < 12 && !moved; k++) {
            const ang = (k / 12) * Math.PI * 2;
            const nx = Math.max(4, Math.min(w - a.tw - 4, a.lx + Math.cos(ang) * r));
            const ny = Math.max(4, Math.min(h - a.th - 4, a.ly + Math.sin(ang) * r));
            const clearM = nx > rect.maxX + 2 || nx + a.tw < rect.minX - 2 || ny > rect.maxY + 2 || ny + a.th < rect.minY - 2;
            if (!clearM) continue;
            if (placed.find((b) => b !== a && boxOverlap({ lx: nx, ly: ny, tw: a.tw, th: a.th }, b, 6))) continue;
            const ex = Math.max(nx, Math.min(a.x, nx + a.tw)), ey = Math.max(ny, Math.min(a.y, ny + a.th));
            if (placed.find((b) => b !== a && segHitsRect(a.x, a.y, ex, ey, b, 4))) continue;
            a.lx = nx; a.ly = ny; finishLabel(a); moved = true;
          }
        }
        if (!moved) break;
      }
    }
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const st8 = bus.getState();

    if (!dragging) { azim += azimV; azimV *= 0.94; }
    camera.position.set(
      target.x + dist * Math.sin(azim) * Math.cos(polar),
      target.y + dist * Math.sin(polar),
      target.z + dist * Math.cos(azim) * Math.cos(polar)
    );
    camera.lookAt(target);

    const decode = st8.phase === 'decode';
    kvRack.visible = decode;
    sheet.visible = st8.standard;
    arrows.visible = st8.showTraffic;
    scoreTile.visible = st8.showGrid;
    dialM.visible = dialL.visible = st8.showGrid;
    if (buildArrows._d !== decode) { buildArrows(decode); buildArrows._d = decode; }

    const Nq = decode ? 1 : [1024, 2048, 4096, 8192, 16384, 32768][st8.seqIdx];
    const B = [32, 64, 128][st8.tileIdx];
    const steps = Math.max(1, Math.ceil(Nq / B));
    const stepDur = 1.6 / (st8.speed || 0.7);

    if (st8.compute && !st8.paused && !st8.hold) passT += dt;
    const stepF = Math.min(steps - 1, Math.floor(passT / stepDur));
    const step = st8.hold ? st8.holdStep % steps : stepF;
    const ph = st8.hold ? 0.55 : (passT / stepDur) % 1; // 0..1 inside the step
    if (step !== lastStep) {
      lastStep = step;
      for (let i = 0; i < 36; i++) heat[i] = Math.max(0, Math.min(1, rnd() * 1.1 - 0.15));
      st.paint(heat);
    }
    if (!st8.hold && st8.compute && !st8.paused && stepF >= steps - 1 && ph > 0.96) passT = 0;

    // animate the flying cards within the step
    const hbmTop = new THREE.Vector3(-2.9, 2.0, decode ? 1.95 : -1.55 + (step % 3) * 0.77);
    const sramTop = new THREE.Vector3(2.9, 1.72, -0.4);
    const outSlot = new THREE.Vector3(-3.9 + (step % 4) * 0.77, 2.0, 1.05);
    const c1 = arrowCurve(hbmTop, sramTop, 1.9);
    const c2 = arrowCurve(sramTop, outSlot, 1.7);
    flyQ.visible = flyOut.visible = st8.showFlow && st8.compute;
    flyKV.forEach((f) => (f.visible = st8.showFlow && st8.compute));
    if (st8.showFlow && st8.compute) {
      flyQ.position.copy(c1.getPoint(Math.min(1, ph * 2.4)));
      flyKV.forEach((f, i) => {
        const t = (ph * 2.4 + i * 0.18) % 1;
        f.position.copy(c1.getPoint(Math.min(1, Math.max(0, t))));
        f.visible = st8.showFlow && st8.compute && !decode;
      });
      if (decode) flyKV[0].visible = true;
      flyOut.position.copy(c2.getPoint(Math.max(0, (ph - 0.55) * 2.2)));
      flyOut.visible = st8.showFlow && st8.compute && ph > 0.55;
      flyQ.rotation.y = flyOut.rotation.y = -azim;
    }
    // dials wiggle while computing
    const wig = st8.compute && !st8.paused && st8.showGrid ? 1 : 0;
    dialM.userData.needle.rotation.z = Math.sin(now * 0.004) * 0.7 * wig - 0.2;
    dialL.userData.needle.rotation.z = Math.sin(now * 0.006 + 2) * 0.9 * wig - 0.1;
    scoreTile.material.opacity = 0.7 + 0.25 * Math.sin(now * 0.005) * wig;

    // labels
    const lw = stageEl.clientWidth, lh = stageEl.clientHeight;
    const mrect = modelScreenRect(lw, lh);
    const placed = [];
    for (const d of LABEL_DEFS) {
      const el = labelEls[d.id];
      const modeOk = d.modes.includes(st8.tab) && st8.showLabels;
      const stdOk = !d.std || st8.standard;
      const decOk = !d.decode || decode;
      if (modeOk && stdOk && decOk && d.obj.visible && !dragging) project(d.obj, d.off, el, mrect, placed, lw, lh);
      else el.style.opacity = 0;
    }
    if (placed.length > 1) repairLeaders(placed, mrect, lw, lh);

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
