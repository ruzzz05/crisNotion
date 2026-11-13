// PDF block: every page of the file is drawn with pdf.js and gets its own ink sheet on top,
// so you can highlight and annotate. One toolbar, kept in view while scrolling, drives all pages.
import * as S from './store.js';
import { h, icon } from './ui.js';
import { mountSheet, mountToolbar, W } from './drawing.js';

const MAX_PIXELS = 8e6; // keeps page canvases inside iOS memory limits
let lib;
const load = () => lib ??= import('../vendor/pdfjs/pdf.min.mjs').then(m => {
  m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return m;
});

/** Storage key of the annotations of page `n` of a PDF block. */
export const pageInkId = (blockId, n) => `${blockId}:${n}`;

export function mountPdf(host, block, changed) {
  let dead = false, active = null, task = null;
  const sheets = [];
  const bar = h('div', { class: 'draw-bar pdf-bar', role: 'toolbar', 'aria-label': 'Herramientas para anotar el PDF' });
  const pagesEl = h('div', { class: 'pdf-pages' });
  const status = h('p', { class: 'muted pdf-status' }, 'Abriendo el PDF…');
  const countEl = h('span', { class: 'muted pdf-count' });
  host.append(
    h('div', { class: 'pdf-head' }, icon('doc'), h('span', { class: 'pdf-name' }, block.name || 'Documento PDF'), countEl),
    bar, status, pagesEl);
  const unbar = mountToolbar(bar, { sheet: () => active || sheets[0] || null });

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
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        if (dead) return;
        const vp = pg.getViewport({ scale: 1 });
        const canvas = h('canvas', { class: 'pdf-canvas' });
        const stage = h('div', { class: 'pdf-page', 'data-n': n }, canvas);
        pagesEl.append(stage);
        sheets.push(mountSheet(stage, { id: pageInkId(block.id, n), height: () => W * vp.height / vp.width, light: true, onActive: s => { active = s; } }));
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
    for (const s of sheets) s.destroy();
    task?.destroy().catch(() => {}); // the loading task owns the worker-side document
  };
}
