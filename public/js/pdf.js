// PDF block: every page of the file is drawn with pdf.js and gets its own ink sheet on top,
// so you can highlight, annotate and place pictures. Only one page is shown at a time and you turn pages sideways;
// what is placed on a page stays on that page. One toolbar, kept in view while scrolling, drives the page on screen.
// Each sheet also has a margin on either side that holds notes: text, pictures and drawings.
import * as S from './store.js';
import { h, icon, menu, toast } from './ui.js';
import { sanitize, pdfScale } from './util.js';
import { sideAdd, sideList, sideRemove, sidesUsed, stepPage, parsePage, stepZoom } from './model.js';
import { mountSheet, mountToolbar, W } from './drawing.js';
import { imageBox, shrink } from './image.js';

const MAX_PIXELS = 12e6; // keeps page canvases inside iOS memory limits (its canvas cap is ~16.7M)
const SIDE_UNITS = 400; // a margin drawing is narrow, so it uses fewer units than a full sheet
let lib;
const load = () => lib ??= import('../vendor/pdfjs/pdf.min.mjs').then(m => {
  m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return m;
});

/** Storage key of the annotations of page `n` of a PDF block. */
export const pageInkId = (blockId, n) => `${blockId}:${n}`;

export function mountPdf(host, block, changed) {
  let dead = false, active = null, task = null, sideTarget = null, cur = 1, total = 0, zoom = 1;
  const sheets = [], rows = [];
  const noteSheets = new Map(); // margin drawing id -> sheet
  const bar = h('div', { class: 'draw-bar pdf-bar', role: 'toolbar', 'aria-label': 'Herramientas para anotar el PDF' });
  const pagesEl = h('div', { class: 'pdf-pages' });
  const status = h('p', { class: 'muted pdf-status' }, 'Abriendo el PDF…');
  const countEl = h('span', { class: 'muted pdf-count' });
  const pager = () => h('div', { class: 'pdf-pager' },
    h('button', { class: 'ibtn pdf-nav', type: 'button', 'aria-label': 'Página anterior', onclick: () => turn(-1) }, icon('back')),
    h('span', { class: 'pdf-pos' },
      h('input', {
        class: 'pdf-goto', type: 'text', inputmode: 'numeric', 'aria-label': 'Ir a la página número',
        onfocus: e => e.target.select(),
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
        onchange: e => { const n = parsePage(e.target.value, total); if (n) jump(n); e.target.value = cur; },
      }),
      h('span', { class: 'pdf-of' })),
    h('button', { class: 'ibtn pdf-nav', type: 'button', 'aria-label': 'Página siguiente', onclick: () => turn(1) }, icon('next')));
  const zoomEl = h('span', { class: 'pdf-zoom' },
    h('button', { class: 'ibtn zoom-out', type: 'button', 'aria-label': 'Reducir el PDF', title: 'Reducir', onclick: () => setZoom(stepZoom(zoom, -1)) }, icon('minus')),
    h('button', { class: 'pdf-zoom-val', type: 'button', 'aria-label': 'Ajustar al ancho', title: 'Ajustar al ancho', onclick: () => setZoom(1) }, '100%'),
    h('button', { class: 'ibtn zoom-in', type: 'button', 'aria-label': 'Ampliar el PDF', title: 'Ampliar', onclick: () => setZoom(stepZoom(zoom, 1)) }, icon('plus')));
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
    h('div', { class: 'pdf-head' }, icon('doc'), h('span', { class: 'pdf-name' }, block.name || 'Documento PDF'), countEl, zoomEl, pager()),
    bar, status, pagesEl, h('div', { class: 'pdf-foot' }, pager()), sideFile);

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

  /** Shows page `n` only; a page is rasterised the first time it is shown. */
  function show(n, dir = 0) {
    cur = n;
    rows.forEach((row, i) => {
      row.hidden = i + 1 !== n;
      row.classList.remove('from-next', 'from-prev');
      if (i + 1 === n && dir) row.classList.add(dir > 0 ? 'from-next' : 'from-prev');
    });
    const st = rows[n - 1]?.querySelector('.pdf-page');
    if (st && Math.abs(st.clientWidth - (st.renderedW || 0)) > 8) st.renderPage(); // first time, or the sheet changed width since
    for (const el of host.querySelectorAll('.pdf-pos')) {
      el.querySelector('.pdf-goto').value = total ? n : '';
      el.querySelector('.pdf-of').textContent = total ? `/ ${total}` : '';
    }
    for (const b of host.querySelectorAll('.pdf-nav')) b.disabled = b.getAttribute('aria-label') === 'Página anterior' ? n <= 1 : n >= total;
  }
  /** Zooms only the PDF sheets: they grow inside their own frame, which scrolls sideways; the page around it stays put. */
  function setZoom(z) {
    if (z === zoom) return;
    const w = pagesEl.scrollWidth || 1, mid = (pagesEl.scrollLeft + pagesEl.clientWidth / 2) / w;
    zoom = z;
    pagesEl.style.setProperty('--zoom', z);
    pagesEl.classList.toggle('zoomed', z > 1);
    zoomEl.querySelector('.pdf-zoom-val').textContent = `${Math.round(z * 100)}%`;
    zoomEl.querySelector('.zoom-out').disabled = z <= 1;
    zoomEl.querySelector('.zoom-in').disabled = stepZoom(z, 1) === z;
    pagesEl.scrollLeft = mid * pagesEl.scrollWidth - pagesEl.clientWidth / 2; // keeps looking at the same spot
  }
  /** Changes the page without moving the view: the reader keeps looking at the same spot (e.g. the bottom). */
  function jump(n) {
    if (n === cur) return;
    const sc = host.closest('.scroll'), top = sc?.scrollTop;
    show(n, Math.sign(n - cur));
    if (sc) sc.scrollTop = top;
  }
  pagesEl.addEventListener('wheel', e => { // Ctrl + wheel (or trackpad pinch) zooms the sheets instead of the browser page
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(stepZoom(zoom, e.deltaY < 0 ? 1 : -1));
  }, { passive: false });
  const turn = delta => jump(stepPage(cur, delta, total));

  setZoom(1);
  zoomEl.querySelector('.zoom-out').disabled = true;
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
      total = doc.numPages;
      countEl.textContent = doc.numPages === 1 ? '1 página' : `${doc.numPages} páginas`;
      syncSides();
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        if (dead) return;
        const vp = pg.getViewport({ scale: 1 });
        const canvas = h('canvas', { class: 'pdf-canvas' });
        const stage = h('div', { class: 'pdf-page', 'data-n': n }, canvas);
        const row = h('div', { class: 'pdf-row', hidden: n !== 1 }, side(n, 'l'), stage, side(n, 'r'));
        rows.push(row);
        pagesEl.append(row);
        sheets.push(mountSheet(stage, { id: pageInkId(block.id, n), height: () => W * vp.height / vp.width, images: true, light: true, onActive: setActive }));
        stage.style.aspectRatio = `${vp.width} / ${vp.height}`; // the sheet has its height before it is drawn, so showing it never shortens the page
        let job = null;
        stage.renderPage = async () => {
          try {
            const w = stage.clientWidth;
            stage.renderedW = w;
            const v = pg.getViewport({ scale: pdfScale({ pageW: vp.width, pageH: vp.height, cssW: w, dpr: devicePixelRatio, maxPixels: MAX_PIXELS }) });
            canvas.width = Math.round(v.width);
            canvas.height = Math.round(v.height);
            job?.cancel(); // a newer render of this canvas replaces one still running
            job = pg.render({ canvas, viewport: v });
            await job.promise;
          } catch (e) { if (!dead && e?.name !== 'RenderingCancelledException') console.error(e); }
        };
        new ResizeObserver(() => { if (!row.hidden && Math.abs(stage.clientWidth - (stage.renderedW || 0)) > 8) stage.renderPage(); }).observe(stage);
        if (n === 1) show(1);
      }
      show(cur);
    } catch (e) {
      console.error(e);
      if (!dead) status.textContent = 'No se ha podido abrir este PDF.';
    }
  })();

  return () => {
    if (dead) return;
    dead = true;
    unbar();
    for (const s of [...sheets, ...noteSheets.values()]) s.destroy();
    task?.destroy().catch(() => {}); // the loading task owns the worker-side document
  };
}
