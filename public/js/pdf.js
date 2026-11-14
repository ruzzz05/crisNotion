// PDF block: every page of the file is drawn with pdf.js and gets its own ink sheet on top,
// so you can highlight, annotate and place pictures. One toolbar, kept in view while scrolling, drives all pages.
// Each sheet also has a margin on either side that holds notes: text, pictures and drawings.
import * as S from './store.js';
import { h, icon, menu, toast } from './ui.js';
import { sanitize } from './util.js';
import { sideAdd, sideList, sideRemove, sidesUsed } from './model.js';
import { mountSheet, mountToolbar, W } from './drawing.js';
import { imageBox, shrink } from './image.js';

const MAX_PIXELS = 8e6; // keeps page canvases inside iOS memory limits
const SIDE_UNITS = 400; // a margin drawing is narrow, so it uses fewer units than a full sheet
let lib;
const load = () => lib ??= import('../vendor/pdfjs/pdf.min.mjs').then(m => {
  m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return m;
});

/** Storage key of the annotations of page `n` of a PDF block. */
export const pageInkId = (blockId, n) => `${blockId}:${n}`;

export function mountPdf(host, block, changed) {
  let dead = false, active = null, task = null, sideTarget = null;
  const sheets = [];
  const noteSheets = new Map(); // margin drawing id -> sheet
  const bar = h('div', { class: 'draw-bar pdf-bar', role: 'toolbar', 'aria-label': 'Herramientas para anotar el PDF' });
  const pagesEl = h('div', { class: 'pdf-pages' });
  const status = h('p', { class: 'muted pdf-status' }, 'Abriendo el PDF…');
  const countEl = h('span', { class: 'muted pdf-count' });
  const sideFile = h('input', {
    class: 'side-file', type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const f = sideFile.files[0], add = sideTarget;
      sideFile.value = '';
      sideTarget = null;
      if (!f || !add) return;
      try { add({ id: S.uid(), t: 'image', blob: await S.saveBlob(await shrink(f)), w: 100 }); } catch (e) { console.error(e); toast('No se ha podido añadir esa imagen.'); }
    },
  });
  host.append(
    h('div', { class: 'pdf-head' }, icon('doc'), h('span', { class: 'pdf-name' }, block.name || 'Documento PDF'), countEl),
    bar, status, pagesEl, sideFile);

  // The tools act on the sheet last touched while it is on screen; otherwise on the first sheet in view.
  const onScreen = s => { const r = s.stage.getBoundingClientRect(); return r.bottom > 80 && r.top < innerHeight - 80; };
  const target = () => (active && onScreen(active) ? active : sheets.find(onScreen) || active || sheets[0] || null);
  const unbar = mountToolbar(bar, { sheet: target, images: true });
  const setActive = s => { active = s; };

  /** Every sheet keeps the same width: a margin opens on all of them as soon as one sheet uses it. */
  const syncSides = () => {
    const used = sidesUsed(block);
    pagesEl.classList.toggle('has-l', used.l);
    pagesEl.classList.toggle('has-r', used.r);
  };

  function note(n, k, item) {
    const el = h('div', { class: 'side-note', 'data-t': item.t, 'data-id': item.id });
    if (item.t === 'text') {
      const c = h('div', { class: 'note-text', contenteditable: 'true', 'data-ph': 'Escribe una nota…', html: sanitize(item.html || '') });
      c.addEventListener('input', () => { if (c.innerHTML === '<br>') c.innerHTML = ''; item.html = c.innerHTML; changed(); });
      c.addEventListener('paste', e => {
        e.preventDefault();
        e.stopPropagation();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain') || '');
      });
      el.append(c);
    } else if (item.t === 'image') {
      el.append(imageBox({ blob: item.blob, w: item.w || 100, alt: 'Imagen en el margen', onResize: w => { item.w = w; changed(); } }));
    } else if (item.t === 'draw') {
      const stage = h('div', { class: 'note-draw' });
      el.append(stage);
      noteSheets.set(item.id, mountSheet(stage, { id: item.id, units: SIDE_UNITS, height: () => item.h, setHeight: v => { item.h = v; changed(); }, images: true, onActive: setActive }));
    }
    el.append(h('button', {
      class: 'note-del', type: 'button', 'aria-label': 'Quitar del margen', title: 'Quitar del margen', onclick: () => {
        if (!sideRemove(block, n, k, item.id)) return;
        const sheet = noteSheets.get(item.id);
        if (sheet) { if (active === sheet) active = null; sheet.destroy(); noteSheets.delete(item.id); S.delDrawing(item.id); }
        if (item.t === 'image') S.delBlob(item.blob);
        el.remove();
        syncSides();
        changed();
      },
    }, icon('x')));
    return el;
  }

  function side(n, k) {
    const items = h('div', { class: 'side-items' }, sideList(block, n, k).map(it => note(n, k, it)));
    const add = item => {
      sideAdd(block, n, k, item);
      const el = note(n, k, item);
      items.append(el);
      syncSides();
      changed();
      if (item.t === 'text') el.querySelector('.note-text').focus();
      return el;
    };
    const label = `Añadir al margen ${k === 'l' ? 'izquierdo' : 'derecho'} de la hoja ${n}`;
    return h('div', { class: 'pdf-side', 'data-side': k }, items,
      h('button', {
        class: 'side-add', type: 'button', 'aria-label': label, title: label, onclick: e => menu(e.currentTarget, [
          { label: 'Texto', icon: 'type', fn: () => add({ id: S.uid(), t: 'text', html: '' }) },
          { label: 'Imagen', icon: 'image', fn: () => { sideTarget = add; sideFile.click(); } },
          { label: 'Dibujo', icon: 'pen', fn: () => add({ id: S.uid(), t: 'draw', h: 320 }) },
        ]),
      }, icon('plus')));
  }

  // Pages are only rasterised when they come near the screen.
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); e.target.renderPage(); }
  }, { root: host.closest('.scroll'), rootMargin: '800px 0px' });

  (async () => {
    try {
      const blob = await S.getBlob(block.blob);
      if (!blob) throw new Error('missing file');
      const pdfjs = await load();
      task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
      const doc = await task.promise;
      if (dead) return;
      if (block.n !== doc.numPages) { block.n = doc.numPages; changed(); }
      status.remove();
      countEl.textContent = doc.numPages === 1 ? '1 página' : `${doc.numPages} páginas`;
      syncSides();
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        if (dead) return;
        const vp = pg.getViewport({ scale: 1 });
        const canvas = h('canvas', { class: 'pdf-canvas' });
        const stage = h('div', { class: 'pdf-page', 'data-n': n }, canvas);
        pagesEl.append(h('div', { class: 'pdf-row' }, side(n, 'l'), stage, side(n, 'r')));
        sheets.push(mountSheet(stage, { id: pageInkId(block.id, n), height: () => W * vp.height / vp.width, images: true, light: true, onActive: setActive }));
        stage.renderPage = async () => {
          try {
            let k = Math.min(3, devicePixelRatio || 1) * (stage.clientWidth || 700) / vp.width;
            k = Math.min(k, Math.sqrt(MAX_PIXELS / (vp.width * vp.height)));
            const v = pg.getViewport({ scale: k });
            canvas.width = Math.round(v.width);
            canvas.height = Math.round(v.height);
            await pg.render({ canvas, viewport: v }).promise;
          } catch (e) { if (!dead) console.error(e); }
        };
        io.observe(stage);
      }
    } catch (e) {
      console.error(e);
      if (!dead) status.textContent = 'No se ha podido abrir este PDF.';
    }
  })();

  return () => {
    if (dead) return;
    dead = true;
    io.disconnect();
    unbar();
    for (const s of [...sheets, ...noteSheets.values()]) s.destroy();
    task?.destroy().catch(() => {}); // the loading task owns the worker-side document
  };
}
