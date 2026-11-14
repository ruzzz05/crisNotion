// Handwriting. Strokes are stored as vectors in a 1000-unit-wide coordinate space,
// so a drawing made on an iPad scales cleanly to an iPhone and to any pixel density.
// Only a pencil or a mouse draws (pencil pressure varies the line width around the size picked on the slider).
// Fingers always scroll the page.
//
// Two pieces, so one toolbar can drive many sheets (a PDF has one sheet per page):
//   mountToolbar(bar, opts)  – tool and colour buttons and the thickness slider; the choice is shared by every sheet
//   mountSheet(stage, opts)  – one inkable surface, optionally with movable pictures under the ink
import * as S from './store.js';
import { h, icon, menu, pop, toast } from './ui.js';
import { STROKE, bottomOf, cleanHex, hexToHsl, hitImage, hslToHex, inkSlots, placeImage, pushRecent, resizeFrom, strokePath, strokeSize } from './sheet.js';
import { shrink } from './image.js';
import { isDark, onTheme } from './theme.js';
import { COLORS, COLOR_NAMES } from './util.js';

export const W = 1000;
const INK = ['ink', 'blue', 'red', 'green', 'orange', 'purple', 'yellow'];
const BG_LABEL = { grid: 'Cuadrícula', lines: 'Rayas', dots: 'Puntos', tian: 'Tian zi ge (田字格)', plain: 'Liso' };
const INK_NAMES = { ink: 'Tinta', blue: 'Azul', red: 'Rojo', green: 'Verde', orange: 'Naranja', purple: 'Morado', yellow: 'Amarillo' };
const MAX_CANVAS = 14e6; // pixels per canvas; iOS refuses larger ones

/** `light` forces the light-theme inks, for surfaces that are always white such as PDF pages. */
const palette = (light = false) => {
  const d = !light && isDark();
  return {
    ink: d ? '#E6E6E4' : '#37352F', blue: d ? '#5B9DF0' : '#2383E2', red: '#E5484D',
    green: '#2F9E44', orange: '#F08C00', purple: d ? '#A78BFA' : '#7048E8', yellow: '#FFD43B',
  };
};

// Tool choice is shared by every sheet and remembered between visits.
const prefs = { tool: 'pen', color: 'ink', size: STROKE.initial };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('cuaderno:draw') || '{}')); } catch { /* storage blocked */ }
if (prefs.tool === 'move') prefs.tool = 'pen';
prefs.size = strokeSize(prefs.size);
prefs.slots = inkSlots(prefs.slots, INK); // the four quick colours on the toolbar
prefs.recent = pushRecent(prefs.recent, null, INK); // up to eight colours used lately, newest first
const bars = new Set();
const overlays = new Set(); // per-sheet redraw of the picture handles, which only show with the move tool
const remember = () => { try { localStorage.setItem('cuaderno:draw', JSON.stringify(prefs)); } catch { /* storage blocked */ } };
function setPrefs(patch) {
  Object.assign(prefs, patch);
  remember();
  refreshBars();
  for (const fn of overlays) fn();
}
const refreshBars = () => { for (const draw of bars) draw(); };

/** The colour of a stroke: one of the named inks (which follow the theme) or any '#rrggbb'. */
const inkOf = (c, colors) => colors[c] || cleanHex(c) || colors.ink;

function paint(ctx, s, colors) {
  const p = s.p;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle = inkOf(s.c, colors);
  if (s.t === 'hl') {
    // One continuous path, so the translucent ink does not darken where it overlaps itself.
    // It curves through the midpoints between samples instead of joining them with straight segments.
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = s.s * 5;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 3; i < p.length - 3; i += 3) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 3]) / 2, (p[i + 1] + p[i + 4]) / 2);
    ctx.lineTo(p.at(-3) + (p.length === 3 ? 0.1 : 0), p.at(-2));
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  // Pen: the stroke is a filled outline (see strokePath), smooth at its edges and as wide as the pressure.
  ctx.fill(new Path2D(strokePath(p, s.s)));
}

const btn = (label, content, fn, on = false, cls = '') =>
  h('button', { class: `tb ${cls}${on ? ' on' : ''}`, type: 'button', 'aria-label': label, title: label, 'aria-pressed': String(on), onclick: fn }, content);

/** Any colour for quick colour number `slot`: the usual inks, or one made with the sliders or typed as #rrggbb. */
function colorPicker(anchor, slot) {
  pop(anchor, box => {
    const colors = palette();
    const use = color => setPrefs({ color, slots: prefs.slots.map((c, i) => (i === slot ? color : c)), tool: prefs.tool === 'eraser' || prefs.tool === 'move' ? 'pen' : prefs.tool });
    let [hue, sat, lum] = hexToHsl(inkOf(prefs.color, colors));
    const preview = h('span', { class: 'dot color-preview' });
    const hex = h('input', { class: 'color-hex', type: 'text', maxlength: 7, spellcheck: 'false', autocapitalize: 'none', 'aria-label': 'Color en hexadecimal', onchange: () => { const c = cleanHex(hex.value); if (c) { [hue, sat, lum] = hexToHsl(c); use(c); } show(); } });
    const slider = (cls, label, max, get, set) => {
      const r = h('input', { class: 'color-range ' + cls, type: 'range', min: 0, max, step: 1, 'aria-label': label, title: label, oninput: () => { set(Number(r.value)); use(hslToHex(hue, sat, lum)); show(); } });
      r.sync = () => { r.value = get(); };
      return r;
    };
    const sliders = [slider('hue', 'Tono', 360, () => hue, v => { hue = v; }), slider('sat', 'Intensidad', 100, () => sat, v => { sat = v; }), slider('lum', 'Claridad', 100, () => lum, v => { lum = v; })];
    const inks = h('div', { class: 'color-inks' }, INK.map(c => h('button', {
      class: 'tb color', type: 'button', 'data-ink': c, 'aria-label': INK_NAMES[c], title: INK_NAMES[c],
      onclick: () => { [hue, sat, lum] = hexToHsl(colors[c]); use(c); show(); },
    }, h('span', { class: 'dot', style: `background:${colors[c]}` }))));
    function show() {
      const now = inkOf(prefs.color, colors);
      preview.style.background = now;
      if (document.activeElement !== hex) hex.value = now;
      for (const r of sliders) r.sync();
      box.style.setProperty('--hue', hue);
      box.style.setProperty('--sat', sat + '%');
      for (const b of inks.children) b.classList.toggle('on', b.dataset.ink === prefs.color);
    }
    const recent = h('div', { class: 'color-recent' }, prefs.recent.map(c => h('button', {
      class: 'tb color', type: 'button', 'data-color': c, 'aria-label': 'Usado hace poco', title: 'Usado hace poco',
      onclick: () => { [hue, sat, lum] = hexToHsl(inkOf(c, colors)); use(c); show(); },
    }, h('span', { class: 'dot', style: `background:${inkOf(c, colors)}` }))));
    box.append(inks, prefs.recent.length ? recent : null, h('div', { class: 'color-custom' }, ...sliders, h('div', { class: 'color-row' }, preview, hex)));
    show();
  }, 'color-pop');
}

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
  // The slider is built once: replacing it while it is being dragged would cut the drag short.
  const dot = h('span', { class: 'dot ink' });
  const range = h('input', {
    class: 'stroke-range', type: 'range', min: STROKE.min, max: STROKE.max, step: STROKE.step, 'aria-label': 'Grosor del trazo', title: 'Grosor del trazo',
    oninput: () => { prefs.size = strokeSize(range.value); remember(); showSize(); },
    onchange: () => setPrefs({ size: strokeSize(range.value) }),
  });
  const stroke = h('span', { class: 'stroke' }, h('span', { class: 'stroke-dot', 'aria-hidden': 'true' }, dot), range);
  const showSize = () => { dot.style.width = dot.style.height = 3 + prefs.size * 1.3 + 'px'; };
  const draw = () => {
    const colors = palette();
    range.value = prefs.size;
    showSize();
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
      // Four colours at hand. Tapping one uses it; tapping the one in use opens the picker to change it.
      ...prefs.slots.map((c, i) => btn(`Color ${i + 1}` + (prefs.color === c ? ' (toca otra vez para cambiarlo)' : ''), h('span', { class: 'dot', style: `background:${inkOf(c, colors)}` }),
        e => (prefs.color === c ? colorPicker(e.currentTarget, i) : setPrefs({ color: c, tool: prefs.tool === 'eraser' || prefs.tool === 'move' ? 'pen' : prefs.tool })), prefs.color === c, 'color')),
      stroke,
      h('span', { class: 'tb-sep' }),
      btn('Deshacer', icon('undo'), () => sheet()?.undo()),
      btn('Rehacer', icon('redo'), () => sheet()?.redo()),
      images && h('span', { class: 'tb-sep' }),
      images && btn('Insertar imagen', icon('image'), () => file.click()),
      images && sheet()?.hasSelection() && btn('Quitar la imagen seleccionada', icon('trash'), () => sheet().removeSelected()),
      ...extra(), file].filter(Boolean));
  };
  bars.add(draw);
  const offTheme = onTheme(draw);
  draw();
  return () => { bars.delete(draw); offTheme(); };
}

/**
 * opts.id            – key of the stored drawing
 * opts.height()      – sheet height in units; opts.setHeight(h) present = the sheet can grow
 * opts.images        – allow pictures under the ink
 * opts.light         – always use light-theme ink colours
 * opts.units         – width of the sheet in units (1000 by default; narrow sheets use fewer so lines keep their weight)
 * opts.onActive(api) – called when the sheet is drawn on (lets a shared toolbar target it)
 */
export function mountSheet(stage, { id, height, setHeight = null, images: allowImages = false, light = false, units = W, onActive = () => {} }) {
  let strokes = [], undo = [], redo = [], images = [], selected = null;
  let cur = null, pid = null, pan = null, erasing = false, erased = false, drag = null, rect = null;
  let scale = 1, width = 0, dpr = 2, saveTimer = 0, dead = false, zoomTimer = 0;

  const layer = h('div', { class: 'draw-imgs' });
  const base = h('canvas', { class: 'draw-base' });
  const live = h('canvas', { class: 'draw-live', 'aria-label': 'Zona de dibujo' });
  stage.classList.add('draw-stage');
  // Frame with a handle on each corner around the selected picture.
  const frame = h('div', { class: 'draw-sel', hidden: true }, ['nw', 'ne', 'sw', 'se'].map(c => h('span', { class: 'draw-grip ' + c })));
  const del = h('button', { class: 'draw-del', type: 'button', hidden: true, 'aria-label': 'Eliminar esta imagen', title: 'Eliminar esta imagen', onclick: () => api.removeSelected() }, icon('trash'));
  stage.append(layer, base, live, frame, del);
  const bctx = base.getContext('2d'), lctx = live.getContext('2d');
  const imgEls = new Map();

  function redraw() {
    const colors = palette(light);
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, base.width, base.height);
    const k = scale * dpr;
    bctx.setTransform(k, 0, 0, k, 0, 0);
    for (const s of strokes) paint(bctx, s, colors);
  }

  function drawLive() {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, live.width, live.height);
    if (!cur) return;
    const k = scale * dpr;
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
    const m = prefs.tool === 'move' && images.find(x => x.id === selected);
    frame.hidden = del.hidden = !m;
    if (m) {
      frame.style.cssText = `left:${m.x * scale}px;top:${m.y * scale}px;width:${m.w * scale}px;height:${m.h * scale}px`;
      // Above the picture's top-right corner, or inside it when the picture touches the top of the sheet.
      del.style.cssText = `left:${Math.max(4, Math.min(width - 40, (m.x + m.w) * scale - 18))}px;top:${m.y * scale > 44 ? m.y * scale - 42 : m.y * scale + 8}px`;
    }
  }
  overlays.add(layout);

  function fit(force) {
    const w = stage.clientWidth;
    if (!w || (w === width && !force)) return;
    width = w;
    scale = w / units;
    const hpx = Math.round(height() * scale);
    // At least 2 device pixels per CSS pixel, more while the page is zoomed in, within what a canvas can hold.
    dpr = Math.min(Math.max(2, devicePixelRatio || 1) * Math.min(3, visualViewport?.scale || 1), Math.sqrt(MAX_CANVAS / (w * hpx)));
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
      const hit = hitImage(images, ...xy(e), Math.max(32, 26 / scale)); // handles stay easy to grab on small screens
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
      const maxY = setHeight ? Infinity : height() - 40; // a sheet that cannot grow keeps its pictures in reach
      images[drag.index] = drag.mode === 'resize' ? resizeFrom(o, drag.corner, dx, units)
        : { ...o, x: Math.max(0, Math.min(units - 40, o.x + dx)), y: Math.max(0, Math.min(maxY, o.y + dy)) };
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
    prefs.recent = pushRecent(prefs.recent, s.c, INK); remember();
    undo.push(strokes);
    if (undo.length > 60) undo.shift();
    redo = [];
    strokes = [...strokes, s];
    drawLive();
    const k = scale * dpr;
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
  // Pinching to zoom would otherwise stretch the same pixels: redraw sharper once the zoom settles.
  const onZoom = () => { clearTimeout(zoomTimer); zoomTimer = setTimeout(() => { if (!dead && !cur) fit(true); }, 250); };
  visualViewport?.addEventListener('resize', onZoom);
  const offTheme = onTheme(redraw);

  S.getDrawing(id).then(d => {
    if (dead || !d) return;
    if (!strokes.length && d.strokes) strokes = d.strokes;
    if (!images.length && d.images) images = d.images;
    redraw();
    layout();
  }).catch(() => {});

  const api = {
    stage,
    undo: () => step(undo, redo),
    redo: () => step(redo, undo),
    fit,
    hasSelection: () => !!selected,
    async addImage(file) {
      try {
        const blob = await shrink(file);
        const bmp = await createImageBitmap(blob);
        const at = Math.min(40, units * 0.05) + images.length * 30;
        const m = { id: S.uid(), blob: await S.saveBlob(blob), ...placeImage(bmp.width, bmp.height, { maxW: units * 0.42, x: at, y: at }) };
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
      overlays.delete(layout);
      ro.disconnect();
      clearTimeout(zoomTimer);
      visualViewport?.removeEventListener('resize', onZoom);
      offTheme();
      if (saveTimer) { clearTimeout(saveTimer); save(); }
    },
  };
  return api;
}

/** The drawing block: one toolbar and one growing sheet with a paper pattern. */
export function mountDrawing(host, block, changed) {
  block.h ??= 420;
  block.bg ??= 'grid';
  const paintRule = () => { if (COLORS.includes(block.rule)) stage.style.setProperty('--rule-c', `var(--c-${block.rule})`); else stage.style.removeProperty('--rule-c'); };
  const stage = h('div', { class: 'bg-' + block.bg });
  const bar = h('div', { class: 'draw-bar', role: 'toolbar', 'aria-label': 'Herramientas de dibujo' });
  host.append(bar, stage);
  paintRule();
  const sheet = mountSheet(stage, { id: block.id, height: () => block.h, setHeight: v => { block.h = v; changed(); }, images: true });
  const unbar = mountToolbar(bar, {
    sheet: () => sheet, images: true,
    extra: () => [
      h('span', { class: 'tb-sep' }),
      btn('Fondo de la hoja: ' + (BG_LABEL[block.bg] || BG_LABEL.grid), icon('grid'), e => menu(e.currentTarget, Object.entries(BG_LABEL).map(([key, label]) => ({
        label, on: block.bg === key, fn: () => {
          stage.classList.remove('bg-' + block.bg);
          block.bg = key;
          stage.classList.add('bg-' + key);
          changed(); refreshBars();
        },
      }))), false, 'bg-pick'),
      btn('Color de las líneas', icon('palette'), e => menu(e.currentTarget, [
        { label: 'Automático', swatch: 'background:var(--card)', on: !COLORS.includes(block.rule), fn: () => { delete block.rule; paintRule(); changed(); refreshBars(); } },
        ...COLORS.map(c => ({ label: COLOR_NAMES[c].replace(/^./, x => x.toUpperCase()), swatch: `background:var(--c-${c})`, on: block.rule === c, fn: () => { block.rule = c; paintRule(); changed(); refreshBars(); } })),
      ]), false, 'rule-pick'),
      btn('Más espacio para dibujar', icon('grow'), () => { block.h += 300; changed(); sheet.fit(true); }),
    ],
  });
  return () => { unbar(); sheet.destroy(); };
}
