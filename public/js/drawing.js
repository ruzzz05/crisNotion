// Handwriting block. Strokes are stored as vectors in a 1000-unit-wide coordinate space,
// so a drawing made on an iPad scales cleanly to an iPhone and to any pixel density.
// Only a pencil or a mouse draws (pencil pressure sets line width). Fingers always scroll the page.
import * as S from './store.js';
import { h, icon } from './ui.js';

const W = 1000;
const INK = ['ink', 'blue', 'red', 'green', 'orange', 'purple', 'yellow'];
const SIZES = [2, 4, 7];
const BGS = ['grid', 'lines', 'plain'];
const BG_LABEL = { grid: 'Cuadrícula', lines: 'Rayas', plain: 'Liso' };

const dark = matchMedia('(prefers-color-scheme: dark)');
const palette = () => ({
  ink: dark.matches ? '#E6E6E4' : '#37352F', blue: dark.matches ? '#5B9DF0' : '#2383E2', red: '#E5484D',
  green: '#2F9E44', orange: '#F08C00', purple: dark.matches ? '#A78BFA' : '#7048E8', yellow: '#FFD43B',
});

// Tool choice is shared by every drawing and remembered between visits.
const prefs = { tool: 'pen', color: 'ink', size: 4 };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('cuaderno:draw') || '{}')); } catch { /* storage blocked */ }
const remember = () => { try { localStorage.setItem('cuaderno:draw', JSON.stringify(prefs)); } catch { /* storage blocked */ } };

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

export function mountDrawing(host, block, changed) {
  block.h ??= 420;
  block.bg ??= 'grid';
  let strokes = [], undo = [], redo = [];
  let cur = null, pid = null, pan = null, erasing = false, erased = false, rect = null;
  let scale = 1, width = 0, saveTimer = 0, dead = false;

  const base = h('canvas', { class: 'draw-base' });
  const live = h('canvas', { class: 'draw-live', 'aria-label': 'Zona de dibujo' });
  const stage = h('div', { class: 'draw-stage bg-' + block.bg }, base, live);
  const bar = h('div', { class: 'draw-bar', role: 'toolbar', 'aria-label': 'Herramientas de dibujo' });
  host.append(bar, stage);
  const bctx = base.getContext('2d'), lctx = live.getContext('2d');

  const btn = (label, content, fn, on = false, cls = '') =>
    h('button', { class: `tb ${cls}${on ? ' on' : ''}`, type: 'button', 'aria-label': label, title: label, 'aria-pressed': String(on), onclick: fn }, content);

  function drawBar() {
    const colors = palette();
    const tool = (t, ic, label) => btn(label, icon(ic), () => {
      prefs.tool = t;
      if (t === 'hl' && prefs.color === 'ink') prefs.color = 'yellow';
      if (t === 'pen' && prefs.color === 'yellow') prefs.color = 'ink';
      remember(); drawBar();
    }, prefs.tool === t);
    bar.replaceChildren(
      tool('pen', 'pen', 'Bolígrafo'), tool('hl', 'marker', 'Subrayador'), tool('eraser', 'eraser', 'Goma'),
      h('span', { class: 'tb-sep' }),
      ...INK.map(c => btn('Color ' + c, h('span', { class: 'dot', style: `background:${colors[c]}` }), () => { prefs.color = c; if (prefs.tool === 'eraser') prefs.tool = 'pen'; remember(); drawBar(); }, prefs.color === c, 'color')),
      h('span', { class: 'tb-sep' }),
      ...SIZES.map((s, i) => btn(['Trazo fino', 'Trazo medio', 'Trazo grueso'][i], h('span', { class: 'dot ink', style: `width:${4 + i * 4}px;height:${4 + i * 4}px` }), () => { prefs.size = s; remember(); drawBar(); }, prefs.size === s)),
      h('span', { class: 'tb-sep' }),
      btn('Deshacer', icon('undo'), () => step(undo, redo)),
      btn('Rehacer', icon('redo'), () => step(redo, undo)),
      h('span', { class: 'tb-sep' }),
      btn('Fondo: ' + BG_LABEL[block.bg], icon('grid'), () => {
        stage.classList.remove('bg-' + block.bg);
        block.bg = BGS[(BGS.indexOf(block.bg) + 1) % BGS.length];
        stage.classList.add('bg-' + block.bg);
        changed(); drawBar();
      }),
      btn('Más espacio para dibujar', icon('grow'), () => { block.h += 300; changed(); fit(true); }));
  }

  function redraw() {
    const colors = palette();
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
    paint(lctx, cur, palette());
  }

  function fit(force) {
    const w = stage.clientWidth;
    if (!w || (w === width && !force)) return;
    width = w;
    scale = w / W;
    const hpx = Math.round(block.h * scale), dpr = devicePixelRatio || 1;
    stage.style.height = hpx + 'px';
    for (const cv of [base, live]) { cv.width = Math.round(w * dpr); cv.height = Math.round(hpx * dpr); }
    stage.style.setProperty('--u', scale + 'px');
    redraw();
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => S.putDrawing({ id: block.id, strokes }), 400);
  }

  function step(from, to) {
    if (!from.length) return;
    to.push(strokes);
    strokes = from.pop();
    redraw(); persist();
  }

  const point = e => [
    Math.round((e.clientX - rect.left) / scale * 10) / 10,
    Math.round((e.clientY - rect.top) / scale * 10) / 10,
    e.pointerType === 'pen' ? Math.round((e.pressure || 0.5) * 100) / 100 : 0.5,
  ];

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
    if (cur || erasing || pan) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { live.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    if (e.pointerType === 'touch') { pan = { id: e.pointerId, y: e.clientY }; return; }
    e.preventDefault();
    rect = live.getBoundingClientRect();
    pid = e.pointerId;
    if (prefs.tool === 'eraser') { erasing = true; erased = false; eraseAt(e); return; }
    cur = { t: prefs.tool, c: prefs.color, s: prefs.size, p: point(e) };
    drawLive();
  });

  live.addEventListener('pointermove', e => {
    if (pan && e.pointerId === pan.id) {
      const scroller = host.closest('.scroll');
      scroller.scrollTop -= e.clientY - pan.y;
      pan.y = e.clientY;
      return;
    }
    if (e.pointerId !== pid) return;
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
    paint(bctx, s, palette());
    persist();
    // Grow the sheet when writing reaches the bottom, like turning to a longer page.
    let maxY = 0;
    for (let i = 1; i < s.p.length; i += 3) if (s.p[i] > maxY) maxY = s.p[i];
    if (maxY > block.h - 90) { block.h += 300; changed(); fit(true); }
  }
  live.addEventListener('pointerup', end);
  live.addEventListener('pointercancel', end);
  // Stops Safari's double-tap zoom, text loupe and Scribble from hijacking pencil strokes.
  live.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  live.addEventListener('contextmenu', e => e.preventDefault());

  const ro = new ResizeObserver(() => fit(false));
  ro.observe(stage);
  const onScheme = () => { drawBar(); redraw(); };
  dark.addEventListener('change', onScheme);
  drawBar();

  S.getDrawing(block.id).then(d => {
    if (dead || !d?.strokes || strokes.length) return;
    strokes = d.strokes;
    redraw();
  }).catch(() => {});

  return () => {
    dead = true;
    ro.disconnect();
    dark.removeEventListener('change', onScheme);
    if (saveTimer) { clearTimeout(saveTimer); S.putDrawing({ id: block.id, strokes }); }
  };
}
