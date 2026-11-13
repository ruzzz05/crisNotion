// Handwriting. Strokes are stored as vectors in a 1000-unit-wide coordinate space,
// so a drawing made on an iPad scales cleanly to an iPhone and to any pixel density.
// Only a pencil or a mouse draws (pencil pressure sets line width). Fingers always scroll the page.
//
// Two pieces, so one toolbar can drive many sheets (a PDF has one sheet per page):
//   mountToolbar(bar, opts)  – tool, colour and size buttons; the choice is shared by every sheet
//   mountSheet(stage, opts)  – one inkable surface, optionally with movable pictures under the ink
import * as S from './store.js';
import { h, icon, toast } from './ui.js';
import { bottomOf, hitImage, placeImage, resizeImage } from './sheet.js';
import { shrink } from './image.js';

export const W = 1000;
const INK = ['ink', 'blue', 'red', 'green', 'orange', 'purple', 'yellow'];
const SIZES = [2, 4, 7];
const BGS = ['grid', 'lines', 'plain'];
const BG_LABEL = { grid: 'Cuadrícula', lines: 'Rayas', plain: 'Liso' };

const dark = matchMedia('(prefers-color-scheme: dark)');
/** `light` forces the light-theme inks, for surfaces that are always white such as PDF pages. */
const palette = (light = false) => {
  const d = !light && dark.matches;
  return {
    ink: d ? '#E6E6E4' : '#37352F', blue: d ? '#5B9DF0' : '#2383E2', red: '#E5484D',
    green: '#2F9E44', orange: '#F08C00', purple: d ? '#A78BFA' : '#7048E8', yellow: '#FFD43B',
  };
};

// Tool choice is shared by every sheet and remembered between visits.
const prefs = { tool: 'pen', color: 'ink', size: 4 };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('cuaderno:draw') || '{}')); } catch { /* storage blocked */ }
if (prefs.tool === 'move') prefs.tool = 'pen';
const bars = new Set();
function setPrefs(patch) {
  Object.assign(prefs, patch);
  try { localStorage.setItem('cuaderno:draw', JSON.stringify(prefs)); } catch { /* storage blocked */ }
  refreshBars();
}
const refreshBars = () => { for (const draw of bars) draw(); };

function paint(ctx, s, colors) {
  const p = s.p;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle = colors[s.c] || colors.ink;
  if (s.t === 'hl') {
    // One continuous path, so the translucent ink does not darken where segments overlap.
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = s.s * 5;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 3; i < p.length; i += 3) ctx.lineTo(p[i], p[i + 1]);
    if (p.length === 3) ctx.lineTo(p[0] + 0.1, p[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  const width = pr => s.s * (0.35 + pr * 1.3);
  if (p.length === 3) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], width(p[2]) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 3; i < p.length; i += 3) {
    ctx.lineWidth = width((p[i - 1] + p[i + 2]) / 2);
    ctx.beginPath();
    ctx.moveTo(p[i - 3], p[i - 2]);
    ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  }
}

const btn = (label, content, fn, on = false, cls = '') =>
  h('button', { class: `tb ${cls}${on ? ' on' : ''}`, type: 'button', 'aria-label': label, title: label, 'aria-pressed': String(on), onclick: fn }, content);

/**
 * opts.sheet()  – the sheet that undo/redo and picture actions apply to (may return null)
 * opts.images   – offer "insert picture" and the move tool
 * opts.extra()  – extra buttons appended at the end
 */
export function mountToolbar(bar, { sheet = () => null, images = false, extra = () => [] } = {}) {
  const file = h('input', {
    class: 'draw-file', type: 'file', accept: 'image/*', hidden: true,
    onchange: () => { const f = file.files[0]; file.value = ''; if (f) sheet()?.addImage(f); },
  });
  const draw = () => {
    const colors = palette();
    const tool = (t, ic, label) => btn(label, icon(ic), () => {
      const patch = { tool: t };
      if (t === 'hl' && prefs.color === 'ink') patch.color = 'yellow';
      if (t === 'pen' && prefs.color === 'yellow') patch.color = 'ink';
      setPrefs(patch);
    }, prefs.tool === t);
    bar.replaceChildren(...[
      tool('pen', 'pen', 'Bolígrafo'), tool('hl', 'marker', 'Subrayador'), tool('eraser', 'eraser', 'Goma'),
      images && tool('move', 'hand', 'Mover imágenes'),
      h('span', { class: 'tb-sep' }),
      ...INK.map(c => btn('Color ' + c, h('span', { class: 'dot', style: `background:${colors[c]}` }), () => setPrefs({ color: c, tool: prefs.tool === 'eraser' || prefs.tool === 'move' ? 'pen' : prefs.tool }), prefs.color === c, 'color')),
      h('span', { class: 'tb-sep' }),
      ...SIZES.map((s, i) => btn(['Trazo fino', 'Trazo medio', 'Trazo grueso'][i], h('span', { class: 'dot ink', style: `width:${4 + i * 4}px;height:${4 + i * 4}px` }), () => setPrefs({ size: s }), prefs.size === s)),
      h('span', { class: 'tb-sep' }),
      btn('Deshacer', icon('undo'), () => sheet()?.undo()),
      btn('Rehacer', icon('redo'), () => sheet()?.redo()),
      images && h('span', { class: 'tb-sep' }),
      images && btn('Insertar imagen', icon('image'), () => file.click()),
      images && sheet()?.hasSelection() && btn('Quitar la imagen seleccionada', icon('trash'), () => sheet().removeSelected()),
      ...extra(), file].filter(Boolean));
  };
  bars.add(draw);
  dark.addEventListener('change', draw);
  draw();
  return () => { bars.delete(draw); dark.removeEventListener('change', draw); };
}

/**
 * opts.id            – key of the stored drawing
 * opts.height()      – sheet height in units; opts.setHeight(h) present = the sheet can grow
 * opts.images        – allow pictures under the ink
 * opts.light         – always use light-theme ink colours
 * opts.onActive(api) – called when the sheet is drawn on (lets a shared toolbar target it)
 */
export function mountSheet(stage, { id, height, setHeight = null, images: allowImages = false, light = false, onActive = () => {} }) {
  let strokes = [], undo = [], redo = [], images = [], selected = null;
  let cur = null, pid = null, pan = null, erasing = false, erased = false, drag = null, rect = null;
  let scale = 1, width = 0, saveTimer = 0, dead = false;

  const layer = h('div', { class: 'draw-imgs' });
  const base = h('canvas', { class: 'draw-base' });
  const live = h('canvas', { class: 'draw-live', 'aria-label': 'Zona de dibujo' });
  stage.classList.add('draw-stage');
  stage.append(layer, base, live);
  const bctx = base.getContext('2d'), lctx = live.getContext('2d');
  const imgEls = new Map();

  function redraw() {
    const colors = palette(light);
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, base.width, base.height);
    const k = scale * (devicePixelRatio || 1);
    bctx.setTransform(k, 0, 0, k, 0, 0);
    for (const s of strokes) paint(bctx, s, colors);
  }

  function drawLive() {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, live.width, live.height);
    if (!cur) return;
    const k = scale * (devicePixelRatio || 1);
    lctx.setTransform(k, 0, 0, k, 0, 0);
    paint(lctx, cur, palette(light));
  }

  /** Create, position and remove <img> elements to match `images`. */
  function layout() {
    for (const m of images) {
      let el = imgEls.get(m.id);
      if (!el) {
        el = h('img', { class: 'draw-img', alt: 'Imagen en el dibujo', draggable: 'false' });
        imgEls.set(m.id, el);
        S.blobURL(m.blob).then(u => { if (u) el.src = u; });
      }
      layer.append(el); // re-appending keeps DOM order = stacking order
      el.style.cssText = `left:${m.x * scale}px;top:${m.y * scale}px;width:${m.w * scale}px;height:${m.h * scale}px`;
      el.classList.toggle('sel', m.id === selected);
    }
    for (const [mid, el] of imgEls) if (!images.some(m => m.id === mid)) { el.remove(); imgEls.delete(mid); }
  }

  function fit(force) {
    const w = stage.clientWidth;
    if (!w || (w === width && !force)) return;
    width = w;
    scale = w / W;
    const hpx = Math.round(height() * scale), dpr = devicePixelRatio || 1;
    stage.style.height = hpx + 'px';
    for (const cv of [base, live]) { cv.width = Math.round(w * dpr); cv.height = Math.round(hpx * dpr); }
    stage.style.setProperty('--u', scale + 'px');
    redraw();
    layout();
  }

  const save = () => S.putDrawing({ id, strokes, images });
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = 0; save(); }, 400);
  }

  function step(from, to) {
    if (!from.length) return;
    to.push(strokes);
    strokes = from.pop();
    redraw(); persist();
  }

  const growTo = y => { if (setHeight && y > height() - 90) { setHeight(Math.max(height() + 300, Math.ceil(y + 120))); fit(true); } };
  const select = mid => { if (selected !== mid) { selected = mid; layout(); refreshBars(); } };

  const xy = e => [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale];
  const point = e => {
    const [x, y] = xy(e);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, e.pointerType === 'pen' ? Math.round((e.pressure || 0.5) * 100) / 100 : 0.5];
  };

  function eraseAt(e) {
    const [x, y] = point(e);
    const kept = strokes.filter(s => {
      const r = 14 + s.s * (s.t === 'hl' ? 2.5 : 1);
      for (let i = 0; i < s.p.length; i += 3) if (Math.hypot(s.p[i] - x, s.p[i + 1] - y) < r) return false;
      return true;
    });
    if (kept.length === strokes.length) return;
    if (!erased) { undo.push(strokes); redo = []; erased = true; }
    strokes = kept;
    redraw();
  }

  live.addEventListener('pointerdown', e => {
    if (cur || erasing || pan || drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { live.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    rect = live.getBoundingClientRect();
    onActive(api);
    if (prefs.tool === 'move' && allowImages) {
      // Any pointer, fingers included, can move pictures; a finger on empty paper still scrolls.
      const hit = hitImage(images, ...xy(e));
      select(hit ? images[hit.index].id : null);
      if (hit) { e.preventDefault(); pid = e.pointerId; drag = { ...hit, start: xy(e), orig: { ...images[hit.index] } }; return; }
    }
    if (e.pointerType === 'touch') { pan = { id: e.pointerId, y: e.clientY }; return; }
    if (prefs.tool === 'move') return;
    e.preventDefault();
    pid = e.pointerId;
    if (prefs.tool === 'eraser') { erasing = true; erased = false; eraseAt(e); return; }
    cur = { t: prefs.tool, c: prefs.color, s: prefs.size, p: point(e) };
    drawLive();
  });

  live.addEventListener('pointermove', e => {
    if (pan && e.pointerId === pan.id) {
      const scroller = stage.closest('.scroll');
      if (scroller) scroller.scrollTop -= e.clientY - pan.y;
      pan.y = e.clientY;
      return;
    }
    if (e.pointerId !== pid) return;
    if (drag) {
      const [x, y] = xy(e), dx = x - drag.start[0], dy = y - drag.start[1], o = drag.orig;
      images[drag.index] = drag.mode === 'resize' ? resizeImage(o, o.w + dx, W)
        : { ...o, x: Math.max(0, Math.min(W - 40, o.x + dx)), y: Math.max(0, o.y + dy) };
      return layout();
    }
    if (erasing) return eraseAt(e);
    if (!cur) return;
    const batch = e.getCoalescedEvents?.() || [];
    for (const ev of batch.length ? batch : [e]) cur.p.push(...point(ev));
    drawLive();
  });

  function end(e) {
    if (pan && e.pointerId === pan.id) { pan = null; return; }
    if (e.pointerId !== pid) return;
    pid = null;
    if (drag) { drag = null; persist(); growTo(bottomOf(images)); return; }
    if (erasing) { erasing = false; if (erased) persist(); return; }
    if (!cur) return;
    const s = cur;
    cur = null;
    undo.push(strokes);
    if (undo.length > 60) undo.shift();
    redo = [];
    strokes = [...strokes, s];
    drawLive();
    const k = scale * (devicePixelRatio || 1);
    bctx.setTransform(k, 0, 0, k, 0, 0);
    paint(bctx, s, palette(light));
    persist();
    // Grow the sheet when writing reaches the bottom, like turning to a longer page.
    let maxY = 0;
    for (let i = 1; i < s.p.length; i += 3) if (s.p[i] > maxY) maxY = s.p[i];
    growTo(maxY);
  }
  live.addEventListener('pointerup', end);
  live.addEventListener('pointercancel', end);
  // Stops Safari's double-tap zoom, text loupe and Scribble from hijacking pencil strokes.
  live.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  live.addEventListener('contextmenu', e => e.preventDefault());

  const ro = new ResizeObserver(() => fit(false));
  ro.observe(stage);
  dark.addEventListener('change', redraw);

  S.getDrawing(id).then(d => {
    if (dead || !d) return;
    if (!strokes.length && d.strokes) strokes = d.strokes;
    if (!images.length && d.images) images = d.images;
    redraw();
    layout();
  }).catch(() => {});

  const api = {
    undo: () => step(undo, redo),
    redo: () => step(redo, undo),
    fit,
    hasSelection: () => !!selected,
    async addImage(file) {
      try {
        const blob = await shrink(file);
        const bmp = await createImageBitmap(blob);
        const m = { id: S.uid(), blob: await S.saveBlob(blob), ...placeImage(bmp.width, bmp.height, { x: 40 + images.length * 30, y: 40 + images.length * 30 }) };
        bmp.close?.();
        images = [...images, m];
        selected = m.id;
        growTo(bottomOf(images));
        layout();
        persist();
        setPrefs({ tool: 'move' });
      } catch (err) {
        console.error(err);
        toast('No se ha podido añadir esa imagen.');
      }
    },
    removeSelected() {
      const m = images.find(x => x.id === selected);
      if (!m) return;
      images = images.filter(x => x !== m);
      selected = null;
      S.delBlob(m.blob);
      layout(); persist(); refreshBars();
    },
    destroy() {
      dead = true;
      ro.disconnect();
      dark.removeEventListener('change', redraw);
      if (saveTimer) { clearTimeout(saveTimer); save(); }
    },
  };
  return api;
}

/** The drawing block: one toolbar and one growing sheet with a paper pattern. */
export function mountDrawing(host, block, changed) {
  block.h ??= 420;
  block.bg ??= 'grid';
  const stage = h('div', { class: 'bg-' + block.bg });
  const bar = h('div', { class: 'draw-bar', role: 'toolbar', 'aria-label': 'Herramientas de dibujo' });
  host.append(bar, stage);
  const sheet = mountSheet(stage, { id: block.id, height: () => block.h, setHeight: v => { block.h = v; changed(); }, images: true });
  const unbar = mountToolbar(bar, {
    sheet: () => sheet, images: true,
    extra: () => [
      h('span', { class: 'tb-sep' }),
      btn('Fondo: ' + BG_LABEL[block.bg], icon('grid'), () => {
        stage.classList.remove('bg-' + block.bg);
        block.bg = BGS[(BGS.indexOf(block.bg) + 1) % BGS.length];
        stage.classList.add('bg-' + block.bg);
        changed(); refreshBars();
      }),
      btn('Más espacio para dibujar', icon('grow'), () => { block.h += 300; changed(); sheet.fit(true); }),
    ],
  });
  return () => { unbar(); sheet.destroy(); };
}
