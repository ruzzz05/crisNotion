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
