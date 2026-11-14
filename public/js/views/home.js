// Inicio: a board of widgets on a 12-column grid. In "Editar" mode every widget can be dragged to another
// place, resized from its corner or removed, and new ones added; the grid packs them as they change.
// The layout is one stored doc ('home'), so it follows the account to other devices.
import * as S from '../store.js';
import { h, icon, menu, pop, toast } from '../ui.js';
import { COLS, TINTS, WIDGET_SIZES, moveItem, newItem, normalizeHome, spanFor, widgetTint } from '../board.js';
import { COLORS, COLOR_NAMES } from '../util.js';
import { WIDGETS, photoStore } from '../widgets.js';
import { shrink } from '../image.js';

let editing = false; // survives re-renders of the view
const GRADIENTS = ['g1', 'g2', 'g3', 'g4'];

export function home(root) {
  const stored = S.get('home');
  let items = normalizeHome(stored?.items, S.uid);
  let cover = stored?.cover || null; // 'c:<colour or gradient>' or 'img:<blob id>', like the cover of a page
  const save = () => { S.put({ ...(S.get('home') || { id: 'home', type: 'home' }), items, cover }); };
  const live = new Map(); // item id -> {el, destroy}
  const grid = h('div', { class: 'home-grid', style: `--cols:${COLS}` });

  function mount(item) {
    const w = WIDGETS[item.t].make(item, { save });
    const el = h('div', { class: 'widget', 'data-id': item.id, 'data-t': item.t, style: `--w:${item.w};--h:${item.h}` },
      h('div', { class: 'w-body' }, w.el),
      h('div', { class: 'w-veil', title: 'Arrastra para mover', onpointerdown: e => startMove(e, item) }),
      WIDGET_SIZES[item.t].tint && h('button', { class: 'w-color', type: 'button', 'aria-label': 'Fondo de ' + WIDGETS[item.t].name, title: 'Fondo', onclick: e => tintMenu(e.currentTarget, item) }, icon('palette')),
      h('button', { class: 'w-del', type: 'button', 'aria-label': 'Quitar ' + WIDGETS[item.t].name, title: 'Quitar', onclick: () => remove(item) }, icon('x')),
      h('div', { class: 'w-resize', title: 'Arrastra para cambiar el tamaño', onpointerdown: e => startResize(e, item) }));
    live.set(item.id, { el, destroy: w.destroy });
    paint(item, el);
    return el;
  }

  /** Background of a widget: its default card, none at all, or a colour. */
  function paint(item, el = live.get(item.id).el) {
    const c = widgetTint(item.bg);
    if (c) { el.dataset.bg = item.bg; el.style.setProperty('--wbg', c); } else { delete el.dataset.bg; el.style.removeProperty('--wbg'); }
  }
  function tintMenu(anchor, item) {
    const pick = (bg, label, swatch) => ({ label, swatch, on: (item.bg || '') === bg, fn: () => { if (bg) item.bg = bg; else delete item.bg; paint(item); save(); } });
    menu(anchor, [pick('', 'Predeterminado', 'background:var(--card)'), pick('none', 'Sin fondo'), { sep: true },
      ...TINTS.map(c => pick(c, (COLOR_NAMES[c] || c).replace(/^./, x => x.toUpperCase()), `background:var(--b-${c})`))]);
  }
  /** Put the elements in the order of `items` without touching `still`: moving the element being dragged would end the drag. */
  function order(still) {
    let passed = false;
    for (const it of items) {
      const el = live.get(it.id).el;
      if (el === still) passed = true;
      else if (passed) grid.append(el);
      else grid.insertBefore(el, still);
    }
  }

  function remove(item) {
    items = items.filter(i => i !== item);
    live.get(item.id)?.destroy?.();
    live.get(item.id)?.el.remove();
    live.delete(item.id);
    if (item.t === 'image' && item.blob) S.delBlob(item.blob);
    if (item.t === 'photos') { const store = photoStore(item); store.get().items.forEach(S.delBlob); store.drop(); }
    save();
  }

  function add(item) {
    items = [...items, item];
    const el = mount(item);
    grid.append(el);
    save();
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ---------- Moving: the widget takes the place of the one it is dragged onto ----------

  function startMove(e, item) {
    if (!editing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const veil = e.currentTarget, el = live.get(item.id).el;
    try { veil.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    let moved = false, last = null;
    const move = ev => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 6) return;
      moved = true;
      el.classList.add('moving');
      const over = document.elementsFromPoint(ev.clientX, ev.clientY).find(x => x.classList?.contains('widget') && x !== el);
      if (!over) return;
      const r = over.getBoundingClientRect();
      // Wide widgets are entered from above or below, the rest from the sides.
      const after = r.width > r.height * 2 ? ev.clientY > r.top + r.height / 2 : ev.clientX > r.left + r.width / 2;
      // The grid reflows under the pointer after each swap: the same half of the same widget is not acted on twice in a row.
      const where = over.dataset.id + (after ? '>' : '<');
      if (where === last) return;
      last = where;
      const rest = items.filter(i => i !== item), at = rest.findIndex(i => i.id === over.dataset.id);
      const next = at < 0 ? items : moveItem(items, item.id, at + (after ? 1 : 0));
      if (next === items) return;
      items = next;
      order(el);
    };
    const up = () => {
      veil.removeEventListener('pointermove', move);
      veil.removeEventListener('pointerup', up);
      veil.removeEventListener('pointercancel', up);
      el.classList.remove('moving');
      if (moved) save();
    };
    veil.addEventListener('pointermove', move);
    veil.addEventListener('pointerup', up);
    veil.addEventListener('pointercancel', up);
  }

  // ---------- Resizing: the corner snaps to whole cells ----------

  function startResize(e, item) {
    if (!editing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    const grip = e.currentTarget, el = live.get(item.id).el, size = WIDGET_SIZES[item.t];
    try { grip.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const cs = getComputedStyle(grid), gap = parseFloat(cs.columnGap) || 0, row = parseFloat(cs.gridAutoRows) || 48;
    const cols = cs.gridTemplateColumns.split(' ').length, col = (grid.clientWidth - gap * (cols - 1)) / cols;
    const box = el.getBoundingClientRect(), before = `${item.w},${item.h}`;
    el.classList.add('resizing');
    const move = ev => {
      item.w = spanFor(ev.clientX - box.left, col, gap, size.minW, COLS);
      item.h = spanFor(ev.clientY - box.top, row, gap, size.minH, 24);
      el.style.setProperty('--w', item.w);
      el.style.setProperty('--h', item.h);
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      el.classList.remove('resizing');
      if (`${item.w},${item.h}` !== before) save();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  }

  // ---------- Cover ----------

  const coverSlot = h('div', { class: 'home-cover-slot' });
  function drawCover() {
    coverSlot.replaceChildren();
    if (!cover) return;
    const el = h('div', { class: 'page-cover home-cover' + (cover.startsWith('c:') ? ' cover-' + cover.slice(2) : '') });
    if (cover.startsWith('img:')) S.blobURL(cover.slice(4)).then(u => { if (u) el.style.backgroundImage = `url("${u}")`; });
    coverSlot.append(el);
  }
  function setCover(v) {
    if (cover?.startsWith('img:') && cover !== v) S.delBlob(cover.slice(4));
    cover = v;
    save();
    drawCover();
    drawBar();
  }
  const coverFile = h('input', {
    class: 'home-cover-input', type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const f = coverFile.files[0];
      coverFile.value = '';
      if (!f) return;
      try { setCover('img:' + await S.saveBlob(await shrink(f))); } catch (e) { console.error(e); toast('No se ha podido usar esa imagen.'); }
    },
  });
  const coverPicker = anchor => pop(anchor, (box, close) => {
    box.append(
      h('div', { class: 'pop-head' }, h('span', null, 'Portada de Inicio'), cover && h('button', { class: 'tbtn', type: 'button', onclick: () => { close(); setCover(null); } }, 'Quitar')),
      h('div', { class: 'cover-grid' }, [...GRADIENTS, ...COLORS].map(c => h('button', { type: 'button', class: 'cover-sw cover-' + c, 'aria-label': 'Portada ' + c, onclick: () => { close(); setCover('c:' + c); } }))),
      h('button', { class: 'menu-item', type: 'button', onclick: () => { close(); coverFile.click(); } }, icon('image'), 'Subir una imagen'));
  }, 'cover-pop');

  // ---------- Toolbar ----------

  const file = h('input', {
    class: 'home-image-input', type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try { add(newItem('image', S.uid(), { blob: await S.saveBlob(await shrink(f)) })); } catch (e) { console.error(e); toast('No se ha podido usar esa imagen.'); }
    },
  });
  const addMenu = anchor => menu(anchor, Object.entries(WIDGETS)
    .filter(([t]) => !(WIDGET_SIZES[t].single && items.some(i => i.t === t)))
    .map(([t, w]) => ({ label: w.name, fn: () => (t === 'image' ? file.click() : add(newItem(t, S.uid()))) })));
  const bar = h('div', { class: 'home-bar' });
  function drawBar() {
    root.classList.toggle('editing', editing);
    bar.replaceChildren(...[
      editing && h('span', { class: 'muted home-hint' }, 'Arrastra un widget para moverlo y su esquina para cambiar el tamaño.'),
      editing && h('button', { class: 'btn home-cover-btn', type: 'button', onclick: e => coverPicker(e.currentTarget) }, icon('image'), cover ? 'Cambiar portada' : 'Añadir portada'),
      editing && h('button', { class: 'btn home-add', type: 'button', onclick: e => addMenu(e.currentTarget) }, icon('plus'), 'Añadir widget'),
      h('button', { class: 'btn home-edit' + (editing ? ' primary' : ''), type: 'button', onclick: () => { editing = !editing; drawBar(); } }, editing ? 'Listo' : 'Editar'),
    ].filter(Boolean));
  }

  root.classList.add('home');
  drawBar();
  for (const it of items) grid.append(mount(it));
  drawCover();
  root.append(coverSlot, bar, grid, file, coverFile);
  return () => { for (const w of live.values()) w.destroy?.(); };
}
