// Tiny DOM helpers + a dependency-free line chart.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fmtDateLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const mmss = (secs) => {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Line chart as inline SVG. Returns an <svg> element.
 * @param {{date:string, value:number}[]} points
 */
export function lineChart(points, { height = 150, unit = '' } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'chart');
  svg.setAttribute('viewBox', `0 0 300 ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');

  const pts = (points || []).filter((p) => Number.isFinite(p.value));
  if (!pts.length) return svg;

  const padL = 34;
  const padR = 8;
  const padT = 12;
  const padB = 20;
  const w = 300 - padL - padR;
  const h = height - padT - padB;

  const values = pts.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi === lo) {
    hi = lo + Math.max(1, Math.abs(lo) * 0.02);
    lo -= Math.max(1, Math.abs(lo) * 0.02);
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;

  const x = (i) => padL + (pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w);
  const y = (v) => padT + h - ((v - lo) / (hi - lo)) * h;

  const mk = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };

  for (const frac of [0, 0.5, 1]) {
    const yy = padT + h * frac;
    svg.append(mk('line', { class: 'grid-line', x1: padL, x2: padL + w, y1: yy, y2: yy }));
    const v = hi - (hi - lo) * frac;
    const t = mk('text', { class: 'lbl', x: 0, y: yy + 3.5 });
    t.textContent = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
    svg.append(t);
  }

  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  svg.append(mk('path', { class: 'line', d, 'vector-effect': 'non-scaling-stroke' }));
  pts.forEach((p, i) => svg.append(mk('circle', { class: 'dot', cx: x(i), cy: y(p.value), r: 3 })));

  const first = mk('text', { class: 'lbl', x: padL, y: height - 5 });
  first.textContent = fmtDate(pts[0].date);
  svg.append(first);
  if (pts.length > 1) {
    const last = mk('text', { class: 'lbl', x: padL + w, y: height - 5, 'text-anchor': 'end' });
    last.textContent = fmtDate(pts[pts.length - 1].date);
    svg.append(last);
  }

  svg.setAttribute(
    'aria-label',
    `${pts.length} points from ${pts[0].value}${unit} to ${pts[pts.length - 1].value}${unit}`
  );
  return svg;
}
