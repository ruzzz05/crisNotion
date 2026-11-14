// Geometry for pictures placed on a drawing sheet. Pure functions, in sheet units (a full sheet is 1000 wide).

const MIN = 40;

/** Size and position for a newly inserted picture. */
export function placeImage(naturalW, naturalH, { maxW = 420, x = 40, y = 40 } = {}) {
  const w = Math.min(maxW, naturalW);
  return { x, y, w, h: Math.round(w * naturalH / naturalW) };
}

/** Topmost picture under a point: {index, mode: 'move'} or {index, mode: 'resize', corner} (nw, ne, sw, se), or null. */
export function hitImage(images, x, y, grip = 32) {
  for (let i = images.length - 1; i >= 0; i--) {
    const m = images[i];
    if (x < m.x || y < m.y || x > m.x + m.w || y > m.y + m.h) continue;
    const g = Math.min(grip, m.w / 3, m.h / 3); // small pictures keep most of their area for moving
    const ns = y <= m.y + g ? 'n' : y >= m.y + m.h - g ? 's' : '', ew = x <= m.x + g ? 'w' : x >= m.x + m.w - g ? 'e' : '';
    return ns && ew ? { index: i, mode: 'resize', corner: ns + ew } : { index: i, mode: 'move' };
  }
  return null;
}

/** New width with the height following the aspect ratio; stays inside the sheet. */
export function resizeImage(img, width, sheetW = 1000) {
  const w = Math.max(MIN, Math.min(width, sheetW - img.x));
  return { ...img, w, h: Math.round(w * img.h / img.w) };
}

/**
 * Resize by dragging `corner` sideways by `dx`: the opposite corner stays put, the proportions are kept
 * and the picture stays inside the sheet.
 */
export function resizeFrom(img, corner, dx, sheetW = 1000) {
  const west = corner[1] === 'w', north = corner[0] === 'n';
  const right = img.x + img.w, bottom = img.y + img.h, ratio = img.h / img.w;
  let w = img.w + (west ? -dx : dx);
  w = Math.min(w, west ? right : sheetW - img.x);
  if (north) w = Math.min(w, bottom / ratio);
  w = Math.round(Math.max(MIN, w));
  const h = Math.round(w * ratio);
  return { ...img, x: west ? right - w : img.x, y: north ? bottom - h : img.y, w, h };
}

/** Pen thickness chosen with the slider, kept inside its range. */
export const STROKE = { min: 1, max: 14, step: 0.5, initial: 4 };
export function strokeSize(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(STROKE.min, Math.min(STROKE.max, n)) : STROKE.initial;
}

/** Width in percent of a picture after dragging its handle `dx` pixels inside a box `boxW` pixels wide. */
export function dragWidth(startPct, dx, boxW, min = 10) {
  return Math.round(Math.max(min, Math.min(100, startPct + dx / boxW * 100)));
}

export const bottomOf = images => images.reduce((max, m) => Math.max(max, m.y + m.h), 0);

// ---------- Ink ----------

const r1 = v => Math.round(v * 10) / 10;

/**
 * Outline of a pen stroke as SVG path data: one closed shape with curved sides and round ends, as wide at
 * each point as the pressure there. Filling it gives a smooth line at any zoom, with no visible joints.
 * `p` is the flat list [x, y, pressure, x, y, pressure, …]; `size` is the pen thickness.
 */
export function strokePath(p, size) {
  // Points too close together add nothing but wobble.
  const pts = [];
  for (let i = 0; i < p.length; i += 3) {
    const last = pts.at(-1);
    if (!last || Math.hypot(p[i] - last[0], p[i + 1] - last[1]) >= 0.6) pts.push([p[i], p[i + 1], size * (0.35 + (p[i + 2] ?? 0.5) * 1.3)]);
  }
  const n = pts.length;
  if (n === 1) {
    const [x, y, w] = pts[0], r = r1(Math.max(0.4, w / 2));
    return `M${r1(x - r)} ${r1(y)}A${r} ${r} 0 1 0 ${r1(x + r)} ${r1(y)}A${r} ${r} 0 1 0 ${r1(x - r)} ${r1(y)}Z`;
  }
  // Even out the hand's tremor and sudden changes of pressure.
  const c = pts.map((q, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    return i === 0 || i === n - 1 ? [q[0], q[1], (q[2] * 2 + a[2] + b[2]) / 4] : [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4, (a[2] + 2 * q[2] + b[2]) / 4];
  });
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1, r = Math.max(0.4, c[i][2] / 2);
    dx /= len; dy /= len;
    left.push([c[i][0] - dy * r, c[i][1] + dx * r]);
    right.push([c[i][0] + dy * r, c[i][1] - dx * r]);
  }
  const mid = (a, b) => `${r1((a[0] + b[0]) / 2)} ${r1((a[1] + b[1]) / 2)}`;
  const at = q => `${r1(q[0])} ${r1(q[1])}`;
  /** A curve through the points: each one is the control point between the midpoints around it. */
  const side = s => {
    let d = '';
    for (let i = 1; i < s.length - 1; i++) d += `Q${at(s[i])} ${mid(s[i], s[i + 1])}`;
    return d + `L${at(s.at(-1))}`;
  };
  const cap = (r, to) => `A${r1(r)} ${r1(r)} 0 0 0 ${at(to)}`;
  const back = [...right].reverse();
  return `M${at(left[0])}${side(left)}${cap(c[n - 1][2] / 2, back[0])}${side(back)}${cap(c[0][2] / 2, left[0])}Z`;
}

// ---------- Colour ----------

/** '#rrggbb' from any '#rgb', 'rrggbb'… or null when it is not a colour. */
export function cleanHex(v) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return '#' + (h.length === 3 ? [...h].map(ch => ch + ch).join('') : h);
}

/** h 0–360, s and l 0–100. */
export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToHsl(hex) {
  const c = cleanHex(hex) || '#000000';
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const h = !d ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(((h * 60) + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
}

/** The four quick colours shown on the toolbar: what was stored where it is valid, the defaults elsewhere. */
export function inkSlots(stored, names) {
  const list = Array.isArray(stored) ? stored : [];
  return names.slice(0, 4).map((def, i) => (names.includes(list[i]) ? list[i] : cleanHex(list[i]) || def));
}
