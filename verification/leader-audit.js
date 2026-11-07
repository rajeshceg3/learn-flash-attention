const els = [...document.querySelectorAll('.plabel')].filter(e => +getComputedStyle(e).opacity > 0.5);
const items = els.map(e => {
  const sr = e.parentElement.getBoundingClientRect();
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(e.style.transform);
  const x = +m[1], y = +m[2];
  const line = e.querySelector('.plabel-line');
  const len = parseFloat(line.style.width) || 0;
  const rm = /rotate\(([-\d.e]+)rad\)/.exec(line.style.transform);
  const rot = rm ? +rm[1] : 0;
  const ex = x + Math.cos(rot) * len, ey = y + Math.sin(rot) * len;
  const r = e.querySelector('.plabel-text').getBoundingClientRect();
  return { t: e.querySelector('.plabel-text').textContent, x: Math.round(x), y: Math.round(y), ex: Math.round(ex), ey: Math.round(ey), box: { lx: r.left - sr.left, ly: r.top - sr.top, tw: r.width, th: r.height } };
});
function seg(ax, ay, bx, by, r) {
  const x0 = r.lx, y0 = r.ly, x1 = r.lx + r.tw, y1 = r.ly + r.th;
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  const pp = [-dx, dx, -dy, dy], qq = [ax - x0, x1 - ax, ay - y0, y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (pp[i] === 0) { if (qq[i] < 0) return false; continue; }
    const t = qq[i] / pp[i];
    if (pp[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 0.02;
}
const bad = [];
for (const a of items) for (const b of items) { if (a !== b && seg(a.x, a.y, a.ex, a.ey, b.box)) bad.push(a.t + ' -> ' + b.t); }
const ov = [];
for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
  const A = items[i].box, B = items[j].box;
  if (A.lx < B.lx + B.tw && A.lx + A.tw > B.lx && A.ly < B.ly + B.th && A.ly + A.th > B.ly) ov.push(items[i].t + ' / ' + items[j].t);
}
return JSON.stringify({ labels: items.map(i => i.t), leaderCrossings: bad, boxOverlaps: ov });
