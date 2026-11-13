// Block editor. A page is a flat list of blocks; `indent` expresses nesting (lists, toggles).
// Each text block is its own contenteditable, so photos and drawings can sit between paragraphs.
// Every structural change edits `page.blocks` and then calls sync(), which reconciles the DOM by block id.
import * as S from './store.js';
import { h, icon, app, menu, pop, placeNear, toast } from './ui.js';
import { COLORS, COLOR_NAMES, esc, tint } from './util.js';
import { belowIndex, filterCommands, hidden, joinRow, leaveRow, maxIndent, moveRange, normalizeRows, numbering, rangeEnd, rowOf, rowSizes } from './model.js';
import { mountDrawing } from './drawing.js';
import { shrink } from './image.js';

const TEXT = new Set(['p', 'h1', 'h2', 'h3', 'bullet', 'num', 'todo', 'toggle', 'quote', 'callout', 'code']);
const LIST = new Set(['bullet', 'num', 'todo']);
export const COMMANDS = [
  { t: 'p', label: 'Texto', desc: 'Empieza a escribir texto sin formato.', glyph: 'Aa', keys: 'text parrafo plain' },
  { t: 'page', label: 'Página', desc: 'Crea una subpágina dentro de esta.', glyph: '📄', keys: 'page subpagina' },
  { t: 'todo', label: 'Lista de tareas', desc: 'Haz seguimiento con casillas.', glyph: '☑', keys: 'todo checkbox casilla' },
  { t: 'h1', label: 'Título 1', desc: 'Encabezado grande de sección.', glyph: 'H1', keys: 'h1 heading encabezado' },
  { t: 'h2', label: 'Título 2', desc: 'Encabezado mediano de sección.', glyph: 'H2', keys: 'h2 heading encabezado' },
  { t: 'h3', label: 'Título 3', desc: 'Encabezado pequeño de sección.', glyph: 'H3', keys: 'h3 heading encabezado' },
  { t: 'bullet', label: 'Lista con viñetas', desc: 'Una lista sencilla con puntos.', glyph: '•', keys: 'bullet puntos' },
  { t: 'num', label: 'Lista numerada', desc: 'Una lista con números.', glyph: '1.', keys: 'numbered ordered numeros' },
  { t: 'toggle', label: 'Lista desplegable', desc: 'Oculta y muestra contenido.', glyph: '▸', keys: 'toggle plegar' },
  { t: 'quote', label: 'Cita', desc: 'Resalta una cita.', glyph: '❝', keys: 'quote' },
  { t: 'divider', label: 'Divisor', desc: 'Separa bloques visualmente.', glyph: '—', keys: 'divider separador linea hr' },
  { t: 'callout', label: 'Destacado', desc: 'Haz que un texto resalte.', glyph: '💡', keys: 'callout nota aviso' },
  { t: 'code', label: 'Código', desc: 'Un fragmento de código.', glyph: '</>', keys: 'code codigo' },
  { t: 'image', label: 'Imagen', desc: 'Sube una foto o hazla con la cámara.', glyph: '🖼️', keys: 'image foto photo camara' },
  { t: 'draw', label: 'Dibujo a mano', desc: 'Escribe o dibuja con el lápiz.', glyph: '✏️', keys: 'draw lapiz pencil apuntes' },
];
const LABEL = Object.fromEntries(COMMANDS.map(c => [c.t, c.label]));
const PLACEHOLDER = {
  p: 'Escribe «/» para ver los comandos', h1: 'Título 1', h2: 'Título 2', h3: 'Título 3', bullet: 'Lista', num: 'Lista',
  todo: 'Tarea pendiente', toggle: 'Desplegable', quote: 'Cita vacía', callout: 'Escribe algo…', code: 'Código',
};
const SHORTCUTS = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'bullet', '*': 'bullet', '+': 'bullet', '[]': 'todo', '1.': 'num', '>': 'toggle', '"': 'quote' };
const HIGHLIGHTS = [['Amarillo', 'rgba(255, 212, 0, 0.4)'], ['Verde', 'rgba(60, 200, 120, 0.35)'], ['Azul', 'rgba(35, 131, 226, 0.3)'], ['Rosa', 'rgba(255, 90, 170, 0.3)'], ['Rojo', 'rgba(255, 80, 80, 0.32)']];
const ALLOWED = new Set(['B', 'I', 'U', 'S', 'STRONG', 'EM', 'BR', 'SPAN', 'MARK', 'STRIKE', 'FONT', 'DIV', 'CODE', 'A']);
const COARSE = matchMedia('(pointer: coarse)');

const mk = (t, extra = {}) => ({ id: S.uid(), t, html: '', indent: 0, ...extra });
const ind = b => b.indent || 0;

/** Keep only inline formatting; stored HTML may come from an imported backup. */
function sanitize(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  for (const el of [...tpl.content.querySelectorAll('*')]) {
    if (!ALLOWED.has(el.tagName)) {
      if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META)$/.test(el.tagName)) el.remove();
      else el.replaceWith(...el.childNodes);
      continue;
    }
    const bg = el.style?.backgroundColor;
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    if (bg && bg !== 'transparent') el.style.backgroundColor = bg;
    if (href && /^(https?:|mailto:)/i.test(href)) { el.setAttribute('href', href); el.setAttribute('rel', 'noopener noreferrer'); }
  }
  return tpl.innerHTML;
}


function place(c, atEnd) {
  c.focus();
  const r = document.createRange();
  r.selectNodeContents(c);
  r.collapse(!atEnd);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

/** True when the caret is collapsed at the very start (or end) of `c`. */
function caretAt(c, start) {
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed) return false;
  const r = s.getRangeAt(0);
  const t = document.createRange();
  t.selectNodeContents(c);
  if (start) t.setEnd(r.startContainer, r.startOffset); else t.setStart(r.endContainer, r.endOffset);
  return t.toString() === '';
}

function textBeforeCaret(c) {
  const s = getSelection();
  if (!s.rangeCount) return '';
  const r = s.getRangeAt(0);
  const t = document.createRange();
  t.selectNodeContents(c);
  t.setEnd(r.startContainer, r.startOffset);
  return t.toString().replace(/ /g, ' ');
}

export function mountEditor(root, page, { focusTitle = false } = {}) {
  if (!page.blocks?.length) page.blocks = [mk('p')];
  let dirty = false, timer = 0, current = null, imageAfter = null;
  const els = new Map();       // block id -> element
  const cleanups = new Map();  // block id -> teardown (drawings)
  let slash = null;            // open slash menu state
  let slashEscaped = false;

  const flush = () => { clearTimeout(timer); if (dirty) { dirty = false; S.put(page); } };
  const touch = () => { dirty = true; clearTimeout(timer); timer = setTimeout(flush, 600); };
  const B = id => page.blocks.find(b => b.id === id);
  const I = id => page.blocks.findIndex(b => b.id === id);
  const C = id => els.get(id)?.querySelector('.content');
  const keep = e => e.preventDefault(); // keeps the text selection when a button is pressed
  const pull = id => { const c = C(id), b = B(id); if (c && b) b.html = c.innerHTML === '<br>' ? '' : c.innerHTML; };
  const isEmpty = id => { const c = C(id); return !!c && c.textContent === ''; };

  // ---------- Rendering ----------

  function build(b) {
    const el = h('div', { class: 'blk', 'data-id': b.id, 'data-t': b.t },
      h('div', { class: 'gutter' },
        h('button', { class: 'g-add', type: 'button', 'aria-label': 'Añadir un bloque debajo', title: 'Añadir un bloque debajo', onmousedown: keep, onclick: () => addBelow(b.id) }, icon('plus')),
        h('button', { class: 'g-drag', type: 'button', 'aria-label': 'Arrastra para mover; toca para abrir el menú', title: 'Arrastra para mover; toca para abrir el menú', onpointerdown: e => startDrag(e, b.id) }, icon('handle'))));
    if (TEXT.has(b.t)) {
      if (b.t === 'todo') el.append(h('button', {
        class: 'todo-box', type: 'button', 'aria-label': 'Marcar', onmousedown: keep,
        onclick: () => { b.checked = !b.checked; sync(); touch(); },
      }, icon('check')));
      else if (b.t === 'bullet' || b.t === 'num') el.append(h('span', { class: 'mark', 'aria-hidden': 'true' }, b.t === 'bullet' ? '•' : ''));
      else if (b.t === 'toggle') el.append(h('button', {
        class: 'tog', type: 'button', 'aria-label': 'Desplegar o contraer', onmousedown: keep,
        onclick: () => { b.open = !b.open; sync(); touch(); },
      }, icon('next')));
      else if (b.t === 'callout') el.append(h('span', { class: 'callout-ico', 'aria-hidden': 'true' }, '💡'));
      el.append(h('div', {
        class: 'content', contenteditable: b.t === 'code' ? 'plaintext-only' : 'true', spellcheck: b.t === 'code' ? 'false' : null,
        'data-ph': PLACEHOLDER[b.t], html: sanitize(b.html || ''),
      }));
    } else if (b.t === 'divider') {
      el.append(h('div', { class: 'hr', role: 'separator' }));
    } else if (b.t === 'image') {
      const img = h('img', { alt: 'Foto', style: `width:${b.w || 100}%`, onclick: e => blockMenu(b.id, e.currentTarget) });
      S.blobURL(b.blob).then(u => { if (u) img.src = u; else img.replaceWith(h('p', { class: 'muted' }, 'Esta foto no está en este dispositivo.')); });
      el.append(h('figure', null, img));
    } else if (b.t === 'draw') {
      const host = h('div', { class: 'draw' });
      el.append(host);
      cleanups.set(b.id, mountDrawing(host, b, touch));
    } else if (b.t === 'page') {
      const p = S.livePage(b.pageId);
      el.append(h('button', { class: 'page-link' + (p ? '' : ' gone'), type: 'button', disabled: !p, onclick: () => { flush(); app.go('page/' + b.pageId); } },
        h('span', { class: 'tree-icon' }, p?.icon || icon('doc')), h('span', { class: 'page-link-title' }, p ? p.title || 'Sin título' : 'Página eliminada')));
    }
    if (!TEXT.has(b.t)) el.append(h('button', { class: 'blk-more', type: 'button', 'aria-label': 'Opciones del bloque', onclick: e => blockMenu(b.id, e.currentTarget) }, icon('more')));
    return el;
  }

  function drop(id) {
    cleanups.get(id)?.();
    cleanups.delete(id);
    els.get(id)?.remove();
    els.delete(id);
  }

  /** Make the DOM match page.blocks, reusing existing elements so focus and canvases survive. */
  function sync() {
    normalizeRows(page.blocks);
    const hid = hidden(page.blocks), nums = numbering(page.blocks), cols = rowSizes(page.blocks), live = new Set();
    let cursor = list.firstChild;
    for (const b of page.blocks) {
      live.add(b.id);
      let el = els.get(b.id);
      if (!el || el.dataset.t !== b.t) {
        const old = el;
        if (old) { cleanups.get(b.id)?.(); cleanups.delete(b.id); }
        el = build(b);
        els.set(b.id, el);
        if (old?.parentNode) { if (cursor === old) cursor = el; old.replaceWith(el); }
      }
      if (el === cursor) cursor = cursor.nextSibling; else list.insertBefore(el, cursor);
      el.style.setProperty('--ind', ind(b));
      el.style.setProperty('--cols', cols.get(b.id) || 1);
      el.classList.toggle('in-row', cols.has(b.id));
      el.hidden = hid.has(b.id);
      el.classList.toggle('done', !!b.checked);
      el.classList.toggle('open', !!b.open);
      if (b.color) el.dataset.color = b.color; else delete el.dataset.color;
      if (b.t === 'num') { el.dataset.n = nums.get(b.id); el.querySelector('.mark').textContent = nums.get(b.id) + '.'; }
    }
    for (const id of [...els.keys()]) if (!live.has(id)) drop(id);
  }

  // ---------- Block operations ----------

  function insertAt(index, b) {
    page.blocks.splice(index, 0, b);
    sync();
    touch();
    return b;
  }

  function removeBlock(id) {
    const i = I(id);
    if (i < 0) return;
    const b = page.blocks[i];
    if (b.t === 'draw') { cleanups.get(id)?.(); cleanups.delete(id); S.delDrawing(id); }
    if (b.t === 'image' && !page.blocks.some(x => x !== b && x.blob === b.blob)) S.delBlob(b.blob);
    if (b.t === 'page' && S.livePage(b.pageId)) S.trash(b.pageId);
    page.blocks.splice(i, 1);
    if (!page.blocks.length) page.blocks.push(mk('p'));
    if (current === id) current = null;
    sync();
    touch();
    if (b.t === 'page') app.chrome();
  }

  function setType(id, t, atEnd = true) {
    const b = B(id);
    pull(id);
    if (t === 'code' && b.t !== 'code') b.html = esc(C(id)?.textContent || '');
    b.t = t;
    if (t !== 'todo') delete b.checked;
    if (t === 'toggle') b.open ??= true; else delete b.open;
    sync();
    place(C(id), atEnd);
    touch();
  }

  function shiftIndent(id, delta) {
    const i = I(id), b = page.blocks[i];
    if (b.row) return; // columns hold a single block, so they do not nest
    const want = Math.max(0, Math.min(ind(b) + delta, maxIndent(page.blocks, i)));
    const d = want - ind(b);
    if (!d) return;
    for (let j = i, end = rangeEnd(page.blocks, i); j < end; j++) page.blocks[j].indent = ind(page.blocks[j]) + d;
    sync();
    touch();
  }

  const textFrom = (i, step) => {
    const hid = hidden(page.blocks);
    for (; i >= 0 && i < page.blocks.length; i += step) if (TEXT.has(page.blocks[i].t) && !hid.has(page.blocks[i].id)) return page.blocks[i];
    return null;
  };

  /** Apply a slash command relative to block `id` (or the end of the page). */
  function apply(t, id) {
    const b = B(id) || page.blocks.at(-1);
    const blank = TEXT.has(b.t) && isEmpty(b.id);
    if (t === 'image') { imageAfter = { id: b.id, replace: blank && b.t === 'p' }; picker.click(); return; }
    if (TEXT.has(t)) {
      if (blank) return setType(b.id, t);
      const nb = insertAt(belowIndex(page.blocks, I(b.id)), mk(t, { indent: ind(b), ...(t === 'toggle' ? { open: true } : {}) }));
      return place(C(nb.id), false);
    }
    const nb = mk(t, { indent: ind(b) });
    delete nb.html;
    if (t === 'page') nb.pageId = S.newPage({ bookId: page.bookId, parentId: page.id }).id;
    if (blank && b.t === 'p') { if (b.row) nb.row = b.row; page.blocks.splice(I(b.id), 1, nb); }
    else page.blocks.splice(belowIndex(page.blocks, I(b.id)), 0, nb);
    sync();
    touch();
    if (t === 'page') { flush(); return app.go('page/' + nb.pageId, { focusTitle: true }); }
    const next = page.blocks[I(nb.id) + 1];
    if (t === 'divider') place(C((next && TEXT.has(next.t) ? next : insertAt(I(nb.id) + 1, mk('p', { indent: ind(nb) }))).id), false);
    else { current = nb.id; els.get(nb.id).scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  function addBelow(id) {
    const i = I(id), b = page.blocks[i];
    const target = TEXT.has(b.t) && b.t === 'p' && isEmpty(id) ? b : insertAt(belowIndex(page.blocks, i), mk('p', { indent: ind(b) }));
    place(C(target.id), true);
    document.execCommand('insertText', false, '/');
  }

  async function addImages(files) {
    let after = imageAfter?.id && B(imageAfter.id) ? imageAfter.id : current && B(current) ? current : page.blocks.at(-1).id;
    const replace = imageAfter?.replace && B(imageAfter.id) ? imageAfter.id : null;
    imageAfter = null;
    for (const f of files) {
      try {
        const nb = { id: S.uid(), t: 'image', blob: await S.saveBlob(await shrink(f)), w: 100, indent: 0 };
        insertAt(belowIndex(page.blocks, I(after)), nb);
        after = nb.id;
      } catch (err) {
        console.error(err);
        toast('No se ha podido añadir una de las fotos.');
      }
    }
    if (replace && after !== replace) removeBlock(replace);
    els.get(after)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function duplicate(id) {
    const i = I(id), b = page.blocks[i];
    pull(id);
    const copy = { ...b, id: S.uid() };
    delete copy.row;
    if (b.t === 'draw') S.getDrawing(id).then(d => d && S.putDrawing({ id: copy.id, strokes: d.strokes })).then(() => { drop(copy.id); sync(); });
    insertAt(belowIndex(page.blocks, i), copy);
  }

  /** Adopt a new block order from the model; a refused move returns the same array. */
  function setBlocks(out) {
    if (out === page.blocks) return toast('Ese bloque no se puede poner en columnas.');
    page.blocks = out;
    sync();
    touch();
  }

  function blockMenu(id, anchor) {
    const b = B(id), i = I(id);
    if (!b) return;
    const size = (label, w) => ({ label, on: (b.w || 100) === w, fn: () => { b.w = w; els.get(id).querySelector('img').style.width = w + '%'; touch(); } });
    const colour = (key, label, swatch) => ({ label, swatch, on: (b.color || '') === key, fn: () => { if (key) b.color = key; else delete b.color; sync(); touch(); } });
    const swap = dir => {
      const to = dir < 0 ? (() => { let j = i - 1; while (j > 0 && ind(page.blocks[j]) > ind(b)) j--; return j; })() : rangeEnd(page.blocks, rangeEnd(page.blocks, i));
      const out = moveRange(page.blocks, i, to);
      if (out !== page.blocks) { page.blocks = out; sync(); touch(); }
    };
    menu(anchor, [
      { label: 'Eliminar', icon: 'trash', danger: true, fn: () => { const end = rangeEnd(page.blocks, i); for (const x of page.blocks.slice(i, end).reverse()) removeBlock(x.id); } },
      b.t !== 'page' && { label: 'Duplicar', icon: 'copy', fn: () => duplicate(id) },
      TEXT.has(b.t) && { label: 'Convertir en', icon: 'swap', sub: COMMANDS.filter(c => TEXT.has(c.t)).map(c => ({ label: c.label, on: b.t === c.t, fn: () => setType(id, c.t) })) },
      TEXT.has(b.t) && {
        label: 'Color', icon: 'palette', sub: [
          colour('', 'Predeterminado'),
          ...COLORS.map(c => colour(c, 'Texto ' + COLOR_NAMES[c], `color:var(--c-${c})`)),
          ...COLORS.map(c => colour(c + '_bg', 'Fondo ' + COLOR_NAMES[c], `background:var(--b-${c})`)),
        ],
      },
      ...(b.t === 'image' ? [{ sep: true }, size('Tamaño pequeño', 35), size('Tamaño mediano', 60), size('Ancho completo', 100)] : []),
      { sep: true },
      !b.row && i > 0 && { label: 'Poner al lado del bloque anterior', icon: 'columns', fn: () => setBlocks(joinRow(page.blocks, i, i - 1, 'right', S.uid())) },
      b.row && { label: 'Sacar de la columna', icon: 'columns', fn: () => setBlocks(leaveRow(page.blocks, i)) },
      i > 0 && { label: 'Subir', icon: 'up', fn: () => swap(-1) },
      rangeEnd(page.blocks, i) < page.blocks.length && { label: 'Bajar', icon: 'down', fn: () => swap(1) },
    ]);
  }

  // ---------- Drag to reorder ----------

  function startDrag(e, id) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const btn = e.currentTarget, sx = e.clientX, sy = e.clientY;
    let moved = false, target = null;
    const move = ev => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      moved = true;
      root.classList.add('dragging');
      const shownEls = [...list.children].filter(x => !x.hidden);
      const box = root.getBoundingClientRect();
      const over = shownEls.find(x => { const r = x.getBoundingClientRect(); return x.dataset.id !== id && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; });
      if (over) {
        const r = over.getBoundingClientRect(), frac = (ev.clientX - r.left) / r.width;
        if (frac < 0.25 || frac > 0.75) {
          // Near the left or right edge: drop beside the block to make columns.
          target = { beside: over.dataset.id, side: frac < 0.25 ? 'left' : 'right' };
          line.hidden = false;
          line.classList.add('v');
          line.style.cssText = `top:${r.top - box.top}px;height:${r.height}px;left:${(frac < 0.25 ? r.left : r.right) - box.left - 2}px`;
          return;
        }
      }
      line.classList.remove('v');
      line.style.cssText = '';
      let y = shownEls.at(-1).getBoundingClientRect().bottom;
      target = page.blocks.length;
      for (const x of shownEls) {
        const r = x.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { target = I(x.dataset.id); y = r.top; break; }
      }
      line.hidden = false;
      line.style.top = y - box.top - 2 + 'px';
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      line.hidden = true;
      root.classList.remove('dragging');
      if (!moved) return blockMenu(id, btn);
      pull(id);
      if (target?.beside) return setBlocks(joinRow(page.blocks, I(id), I(target.beside), target.side, S.uid()));
      const wasInRow = !!B(id).row;
      delete B(id).row; // a plain up/down drop takes the block out of its column
      const out = moveRange(page.blocks, I(id), target);
      if (out !== page.blocks || wasInRow) { page.blocks = out; sync(); touch(); }
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  // ---------- Slash menu ----------

  function closeSlash() {
    slash?.el.remove();
    slash = null;
  }

  /** mode 'type': filtered by what follows "/" in the block. mode 'pick': opened from a button, no typing. */
  function openSlash(query, { mode = 'type', anchor = null, blockId = current } = {}) {
    const items = filterCommands(COMMANDS, query);
    const el = slash?.el || h('div', { class: 'slash', role: 'listbox', onmousedown: keep });
    const index = slash && slash.query === query ? Math.min(slash.index, Math.max(0, items.length - 1)) : 0;
    slash = { el, items, index, query, mode, blockId, anchor: anchor || slash?.anchor };
    el.replaceChildren(
      h('div', { class: 'slash-head' }, 'Bloques básicos'),
      ...(items.length ? items.map((c, i) => h('button', {
        class: 'slash-item' + (i === index ? ' on' : ''), type: 'button', role: 'option', 'data-t': c.t,
        onclick: () => choose(c),
      }, h('span', { class: 'slash-glyph', 'aria-hidden': 'true' }, c.glyph),
      h('span', { class: 'slash-text' }, h('span', { class: 'slash-label' }, c.label), h('span', { class: 'slash-desc' }, c.desc))))
        : [h('div', { class: 'slash-none' }, 'Sin resultados')]));
    if (!el.isConnected) document.body.append(el);
    let rect = slash.anchor?.getBoundingClientRect();
    if (!rect) {
      const s = getSelection();
      rect = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
      if (!rect || (!rect.width && !rect.height && !rect.top)) rect = C(blockId)?.getBoundingClientRect() || root.getBoundingClientRect();
    }
    placeNear(el, rect, { above: mode === 'pick' && rect.top > innerHeight / 2 });
    el.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }

  function choose(cmd) {
    const { mode, query, blockId } = slash;
    closeSlash();
    if (mode === 'type') {
      const c = C(blockId);
      if (c && document.activeElement !== c) place(c, true);
      const r = getSelection().getRangeAt(0), n = r.startContainer, len = query.length + 1;
      if (n.nodeType === 3 && r.startOffset >= len) n.deleteData(r.startOffset - len, len);
      pull(blockId);
    }
    apply(cmd.t, blockId);
  }

  // ---------- Inline formatting ----------

  const selectedContent = () => {
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed) return null;
    const n = s.getRangeAt(0).commonAncestorContainer;
    const c = (n.nodeType === 1 ? n : n.parentElement)?.closest('.content');
    return c && list.contains(c) && c.parentElement.dataset.t !== 'code' ? c : null;
  };

  function inlineCode() {
    const s = getSelection();
    if (!s.rangeCount) return;
    const r = s.getRangeAt(0), n = r.commonAncestorContainer;
    const inside = (n.nodeType === 1 ? n : n.parentElement)?.closest('code');
    if (inside) {
      const c = inside.closest('.content');
      inside.replaceWith(...inside.childNodes);
      c.normalize();
      c.dispatchEvent(new InputEvent('input', { bubbles: true }));
      return;
    }
    if (s.isCollapsed) return;
    try {
      // Wrapping in place keeps any bold/italic already around the selection.
      const code = document.createElement('code');
      r.surroundContents(code);
      for (const x of code.querySelectorAll('code')) x.replaceWith(...x.childNodes);
      s.selectAllChildren(code);
      code.closest('.content').dispatchEvent(new InputEvent('input', { bubbles: true }));
      return;
    } catch { /* selection crosses element boundaries: fall back to re-inserting it */ }
    const tmp = h('div');
    tmp.append(r.cloneContents());
    for (const x of tmp.querySelectorAll('code')) x.replaceWith(...x.childNodes);
    document.execCommand('insertHTML', false, `<code>${tmp.innerHTML}</code>`);
  }

  function highlight(color) {
    document.execCommand('styleWithCSS', false, true);
    if (!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color);
  }

  function linkPrompt(anchor) {
    const s = getSelection();
    if (!s.rangeCount) return;
    const saved = s.getRangeAt(0).cloneRange();
    pop(anchor, (el, close) => {
      const input = h('input', { type: 'text', placeholder: 'Pega un enlace', 'aria-label': 'Enlace', autocomplete: 'off', inputmode: 'url' });
      el.append(h('form', {
        class: 'link-form', onsubmit: e => {
          e.preventDefault();
          let url = input.value.trim();
          close();
          const sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(saved);
          if (!url) return document.execCommand('unlink');
          if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
          document.execCommand('createLink', false, url);
        },
      }, input, h('button', { class: 'btn primary' }, 'Enlazar')));
      setTimeout(() => input.focus());
    });
  }

  const fmt = cmd => () => document.execCommand(cmd);
  const bb = (label, content, fn) => h('button', { type: 'button', 'aria-label': label, title: label, onmousedown: keep, onclick: fn }, content);
  const bubble = h('div', { class: 'bubble', role: 'toolbar', 'aria-label': 'Formato', hidden: true },
    bb('Negrita', h('b', null, 'B'), fmt('bold')),
    bb('Cursiva', h('i', null, 'i'), fmt('italic')),
    bb('Subrayado', h('u', null, 'U'), fmt('underline')),
    bb('Tachado', h('s', null, 'S'), fmt('strikeThrough')),
    bb('Código', icon('code'), inlineCode),
    bb('Enlace', icon('link'), e => linkPrompt(e.currentTarget)),
    bb('Resaltar', h('span', { class: 'hl-a' }, 'A'), e => {
      const s = getSelection(), saved = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      const run = c => () => { if (saved) { s.removeAllRanges(); s.addRange(saved); } highlight(c); };
      menu(e.currentTarget, [...HIGHLIGHTS.map(([label, c]) => ({ label, swatch: `background:${c}`, fn: run(c) })), { label: 'Quitar resaltado', icon: 'x', fn: run('transparent') }]);
    }));
  document.body.append(bubble);

  let selTimer = 0;
  const onSelection = () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      const c = selectedContent();
      if (!c) { bubble.hidden = true; return; }
      bubble.hidden = false;
      placeNear(bubble, getSelection().getRangeAt(0).getBoundingClientRect(), { above: !COARSE.matches, gap: 8 });
    }, 80);
  };
  document.addEventListener('selectionchange', onSelection);

  // ---------- Touch toolbar (phones and tablets without a hardware keyboard) ----------

  const kb = (label, content, fn) => h('button', { type: 'button', 'aria-label': label, title: label, onmousedown: keep, onclick: fn }, content);
  const onCurrent = fn => () => { const b = current && B(current); if (b && TEXT.has(b.t)) fn(b); };
  const kbar = h('div', { class: 'kbar', role: 'toolbar', 'aria-label': 'Herramientas de edición' },
    kb('Añadir bloque', icon('plus'), e => (slash ? closeSlash() : openSlash('', { mode: 'pick', anchor: e.currentTarget, blockId: current && B(current) ? current : page.blocks.at(-1).id }))),
    kb('Añadir foto', icon('image'), () => apply('image', current)),
    kb('Añadir dibujo a mano', icon('pen'), () => apply('draw', current)),
    kb('Lista de tareas', icon('tasks'), onCurrent(b => setType(b.id, b.t === 'todo' ? 'p' : 'todo'))),
    kb('Lista con viñetas', icon('list'), onCurrent(b => setType(b.id, b.t === 'bullet' ? 'p' : 'bullet'))),
    kb('Título', h('b', null, 'H'), onCurrent(b => setType(b.id, b.t === 'h2' ? 'p' : 'h2'))),
    kb('Aumentar sangría', icon('indent'), onCurrent(b => shiftIndent(b.id, 1))),
    kb('Reducir sangría', icon('outdent'), onCurrent(b => shiftIndent(b.id, -1))),
    kb('Negrita', h('b', null, 'B'), fmt('bold')),
    kb('Cursiva', h('i', null, 'i'), fmt('italic')),
    kb('Opciones del bloque', icon('more'), e => { if (current && B(current)) blockMenu(current, e.currentTarget); }),
    kb('Ocultar el teclado', icon('keyboard'), () => document.activeElement?.blur()));
  document.body.append(kbar);
  const vv = window.visualViewport;
  const liftBar = () => { kbar.style.bottom = Math.max(0, innerHeight - (vv ? vv.height + vv.offsetTop : innerHeight)) + 'px'; };
  vv?.addEventListener('resize', liftBar);
  vv?.addEventListener('scroll', liftBar);

  // ---------- DOM ----------

  const picker = h('input', {
    class: 'photo-input', type: 'file', accept: 'image/*', multiple: true, hidden: true,
    onchange: () => { const files = [...picker.files]; picker.value = ''; if (files.length) addImages(files); },
  });

  const title = h('h1', { class: 'page-title', contenteditable: 'plaintext-only', 'data-ph': 'Sin título', role: 'textbox', 'aria-label': 'Título de la página' });
  title.textContent = page.title || '';
  if (title.contentEditable !== 'plaintext-only') title.contentEditable = 'true';
  title.addEventListener('input', () => {
    if (title.innerHTML === '<br>') title.innerHTML = '';
    page.title = title.textContent.replace(/\s+/g, ' ').trim();
    app.chrome();
    touch();
  });
  title.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const first = page.blocks[0];
    place(C((TEXT.has(first.t) && (e.key === 'ArrowDown' || isEmpty(first.id)) ? first : insertAt(0, mk('p'))).id), false);
  });
  title.addEventListener('paste', e => {
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' '));
  });

  const list = h('div', { class: 'blocks' });
  const line = h('div', { class: 'drop-line', hidden: true });
  const tail = h('div', {
    class: 'page-tail', onclick: () => {
      const lastB = page.blocks.at(-1);
      place(C((lastB.t === 'p' && isEmpty(lastB.id) ? lastB : insertAt(page.blocks.length, mk('p'))).id), true);
    },
  });
  root.append(title, list, line, tail, picker);
  sync();

  list.addEventListener('focusin', e => { const bl = e.target.closest('.blk'); if (bl) current = bl.dataset.id; });
  list.addEventListener('click', e => {
    const a = e.target.closest('.content a[href]');
    if (a) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
  });

  list.addEventListener('keydown', e => {
    const c = e.target.closest?.('.content');
    if (!c || e.isComposing) return;
    if (slash && slash.mode === 'type') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = slash.items.length;
        if (n) { slash.index = (slash.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; openSlash(slash.query); }
        return;
      }
      if (e.key === 'Enter' && slash.items.length) { e.preventDefault(); return choose(slash.items[slash.index]); }
      if (e.key === 'Escape') { e.preventDefault(); slashEscaped = true; return closeSlash(); }
    }
    const id = c.parentElement.dataset.id, b = B(id), i = I(id);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); return inlineCode(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (b.t === 'code') return document.execCommand('insertText', false, '  ');
      return shiftIndent(id, e.shiftKey ? -1 : 1);
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (b.t === 'code') return;
      e.preventDefault();
      const blank = c.textContent === '';
      if (blank && (b.t !== 'p' || ind(b) > 0)) return ind(b) > 0 && (LIST.has(b.t) || b.t === 'p') ? shiftIndent(id, -1) : setType(id, 'p');
      const follow = LIST.has(b.t) ? b.t : 'p';
      const [rowStart, rowEnd] = rowOf(page.blocks, i);
      if (!blank && caretAt(c, true)) { insertAt(b.row ? rowStart : i, mk(b.row ? 'p' : follow, { indent: ind(b) })); return; }
      const r = getSelection().getRangeAt(0);
      r.deleteContents();
      const rest = document.createRange();
      rest.selectNodeContents(c);
      rest.setStart(r.endContainer, r.endOffset);
      const tmp = h('div');
      tmp.append(rest.extractContents());
      if (c.textContent === '') c.innerHTML = '';
      pull(id);
      const html = tmp.textContent === '' ? '' : tmp.innerHTML;
      const nb = b.t === 'toggle' && b.open ? insertAt(i + 1, mk('p', { html, indent: ind(b) + 1 }))
        : b.t === 'toggle' ? insertAt(rangeEnd(page.blocks, i), mk('toggle', { html, indent: ind(b), open: false }))
          : insertAt(b.row ? rowEnd : i + 1, mk(b.row ? 'p' : follow, { html, indent: ind(b) }));
      place(C(nb.id), false);
      els.get(nb.id).scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Backspace' && caretAt(c, true)) {
      if (b.t !== 'p') { e.preventDefault(); return setType(id, 'p', false); }
      if (ind(b) > 0) { e.preventDefault(); return shiftIndent(id, -1); }
      const hid = hidden(page.blocks);
      let j = i - 1;
      while (j >= 0 && hid.has(page.blocks[j].id)) j--;
      const prev = page.blocks[j];
      if (!prev) return;
      e.preventDefault();
      if (!TEXT.has(prev.t)) {
        if (c.textContent === '' && page.blocks.length > 1) {
          removeBlock(id);
          const p = textFrom(j, -1) || textFrom(j, 1);
          if (p) place(C(p.id), true);
        }
        return;
      }
      const pc = C(prev.id);
      const offset = pc.childNodes.length;
      if (prev.t === 'code') pc.append(c.textContent); else pc.append(...c.childNodes);
      pull(prev.id);
      removeBlock(id);
      pc.focus();
      const r = document.createRange();
      r.setStart(pc, Math.min(offset, pc.childNodes.length));
      r.collapse(true);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    } else if (e.key === 'ArrowUp' && caretAt(c, true)) {
      e.preventDefault();
      const p = textFrom(i - 1, -1);
      if (p) place(C(p.id), true); else place(title, true);
    } else if (e.key === 'ArrowDown' && caretAt(c, false)) {
      const n = textFrom(i + 1, 1);
      if (n) { e.preventDefault(); place(C(n.id), false); }
    }
  });

  list.addEventListener('input', e => {
    const c = e.target.closest?.('.content');
    if (!c) return;
    const id = c.parentElement.dataset.id, b = B(id);
    if (c.innerHTML === '<br>') c.innerHTML = '';
    pull(id);
    touch();
    if (b.t === 'code') return;
    const m = /(?:^|\s)\/([^\s/]{0,24})$/.exec(textBeforeCaret(c));
    if (!m) { slashEscaped = false; if (slash?.mode === 'type') closeSlash(); }
    else if (!slashEscaped) openSlash(m[1], { blockId: id });
    if (b.t !== 'p') return;
    const t = c.textContent.replace(/ /g, ' ');
    if (t === '```') { c.innerHTML = ''; return setType(id, 'code'); }
    if (t === '---') {
      c.innerHTML = '';
      page.blocks.splice(I(id), 1, { id, t: 'divider', indent: ind(b) });
      const next = page.blocks[I(id) + 1];
      const target = next && TEXT.has(next.t) ? next : mk('p', { indent: ind(b) });
      if (target !== next) page.blocks.splice(I(id) + 1, 0, target);
      sync(); touch();
      return place(C(target.id), false);
    }
    if (e.data !== ' ') return;
    const sc = /^(#{1,3}|[-*+]|\[\]|1\.|>|") /.exec(t);
    if (!sc) return;
    const first = document.createTreeWalker(c, NodeFilter.SHOW_TEXT).nextNode();
    if (!first || first.length < sc[0].length) return;
    first.deleteData(0, sc[0].length);
    setType(id, SHORTCUTS[sc[1]], false);
  });

  list.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); return addImages(files); }
    const c = e.target.closest?.('.content');
    if (!c) return;
    e.preventDefault();
    const raw = (e.clipboardData.getData('text/plain') || '').replace(/\r/g, '');
    const id = c.parentElement.dataset.id;
    if (B(id).t === 'code') return document.execCommand('insertText', false, raw);
    const lines = raw.split('\n');
    document.execCommand('insertText', false, lines.shift());
    let at = I(id), lastId = id;
    for (const l of lines.filter(x => x.trim())) { const nb = mk('p', { html: esc(l), indent: ind(B(id)) }); page.blocks.splice(++at, 0, nb); lastId = nb.id; }
    if (lastId !== id) { sync(); touch(); place(C(lastId), true); }
  });

  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  const onOutside = e => { if (slash && !slash.el.contains(e.target) && !kbar.contains(e.target)) closeSlash(); };
  document.addEventListener('visibilitychange', onHide);
  addEventListener('pagehide', flush);
  addEventListener('pointerdown', onOutside, true);

  if (focusTitle) title.focus();

  return {
    flush,
    destroy() {
      flush();
      closeSlash();
      clearTimeout(selTimer);
      bubble.remove();
      kbar.remove();
      document.removeEventListener('selectionchange', onSelection);
      document.removeEventListener('visibilitychange', onHide);
      removeEventListener('pagehide', flush);
      removeEventListener('pointerdown', onOutside, true);
      vv?.removeEventListener('resize', liftBar);
      vv?.removeEventListener('scroll', liftBar);
      for (const fn of cleanups.values()) fn();
    },
  };
}
