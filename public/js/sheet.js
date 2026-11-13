// Geometry for pictures placed on a drawing sheet. Pure functions, in sheet units (the sheet is 1000 wide).

const MIN = 40;

/** Size and position for a newly inserted picture. */
export function placeImage(naturalW, naturalH, { maxW = 420, x = 40, y = 40 } = {}) {
  const w = Math.min(maxW, naturalW);
  return { x, y, w, h: Math.round(w * naturalH / naturalW) };
}

/** Topmost picture under a point: {index, mode: 'move' | 'resize'} or null. The bottom-right corner resizes. */
export function hitImage(images, x, y, grip = 32) {
  for (let i = images.length - 1; i >= 0; i--) {
    const m = images[i];
    if (x < m.x || y < m.y || x > m.x + m.w || y > m.y + m.h) continue;
    const g = Math.min(grip, m.w / 3, m.h / 3); // small pictures keep most of their area for moving
    return { index: i, mode: x >= m.x + m.w - g && y >= m.y + m.h - g ? 'resize' : 'move' };
  }
  return null;
}

/** New width with the height following the aspect ratio; stays inside the sheet. */
export function resizeImage(img, width, sheetW = 1000) {
  const w = Math.max(MIN, Math.min(width, sheetW - img.x));
  return { ...img, w, h: Math.round(w * img.h / img.w) };
}

export const bottomOf = images => images.reduce((max, m) => Math.max(max, m.y + m.h), 0);
