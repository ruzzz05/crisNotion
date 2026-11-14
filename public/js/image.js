import * as S from './store.js';
import { h } from './ui.js';
import { dragWidth } from './sheet.js';

/** Downscale a photo to at most 1800px on its long side and re-encode it as JPEG. */
export async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k);
    cv.height = Math.round(img.naturalHeight * k);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('toBlob failed');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A stored picture with a handle on its right edge: dragging it sets the width, in percent of the space available.
 * onResize(w) is called once when the drag ends. The returned element has setWidth(w) for changes made elsewhere.
 */
export function imageBox({ blob, w = 100, alt = 'Foto', onResize = () => {}, onClick = null }) {
  const img = h('img', { alt, draggable: 'false', onclick: onClick });
  const grip = h('button', { class: 'img-grip', type: 'button', 'aria-label': 'Arrastra para cambiar el tamaño', title: 'Arrastra para cambiar el tamaño' });
  const box = h('div', { class: 'img-box', style: `width:${w}%` }, img, grip);
  S.blobURL(blob).then(u => { if (u) img.src = u; else box.replaceWith(h('p', { class: 'muted' }, 'Esta foto no está en este dispositivo.')); });
  box.setWidth = v => { w = v; box.style.width = v + '%'; };
  grip.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try { grip.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const x0 = e.clientX, start = w, full = box.parentElement.clientWidth || 1;
    box.classList.add('resizing');
    const move = ev => box.setWidth(dragWidth(start, ev.clientX - x0, full));
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      box.classList.remove('resizing');
      if (w !== start) onResize(w);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
  return box;
}
