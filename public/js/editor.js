// Block editor. A page is a list of blocks; each text block is its own contenteditable,
// so photos and drawings can sit between paragraphs without the browser mangling them.
import * as S from './store.js';
import { h, icon, sheet, menu, toast } from './ui.js';
import { esc } from './util.js';
import { mountDrawing } from './drawing.js';

const TEXT = new Set(['p', 'h1', 'h2', 'h3', 'bullet', 'num', 'todo', 'quote', 'callout']);
const LIST = new Set(['bullet', 'num', 'todo']);
const TYPES = [
  ['p', 'Texto', '¶'], ['h1', 'Título grande', 'H1'], ['h2', 'Título mediano', 'H2'], ['h3', 'Título pequeño', 'H3'],
  ['bullet', 'Lista', '•'], ['num', 'Lista numerada', '1.'], ['todo', 'Lista de tareas', '☑'], ['quote', 'Cita', '❝'],
  ['callout', 'Destacado', '💡'], ['divider', 'Separador', '—'], ['image', 'Foto', '🖼️'], ['draw', 'Dibujo a mano', '✏️'],
];
const PLACEHOLDER = {
  p: 'Escribe aquí, o pulsa + para añadir fotos, dibujos y más', h1: 'Título', h2: 'Título', h3: 'Título',
  bullet: 'Lista', num: 'Lista', todo: 'Tarea', quote: 'Cita', callout: 'Nota destacada',
};
const SHORTCUTS = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'bullet', '*': 'bullet', '[]': 'todo', '1.': 'num', '>': 'quote' };
const HIGHLIGHT = '#ffe45c';
const ALLOWED = new Set(['B', 'I', 'U', 'S', 'STRONG', 'EM', 'BR', 'SPAN', 'MARK', 'STRIKE', 'FONT', 'DIV']);

const mk = (t, html = '') => ({ id: S.uid(), t, html });

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
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    if (bg && bg !== 'transparent') el.style.backgroundColor = bg;
  }
  return tpl.innerHTML;
}

async function shrink(file) {
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

export function mountEditor(root, page, onTitle) {
  if (!page.blocks?.length) page.blocks = [mk('p')];
  let dirty = false, timer = 0, current = null;
  const cleanups = new Map();

  const flush = () => { clearTimeout(timer); if (dirty) { dirty = false; S.put(page); } };
  const touch = () => { dirty = true; clearTimeout(timer); timer = setTimeout(flush, 600); };
  const B = id => page.blocks.find(b => b.id === id);
  const I = id => page.blocks.findIndex(b => b.id === id);
  const E = id => list.querySelector(`[data-id="${id}"]`);
  const C = id => E(id)?.querySelector('.content');
  const keep = e => e.preventDefault(); // keeps the text selection when a button is pressed

  function render(b) {
    const el = h('div', { class: `block b-${b.t}` + (b.checked ? ' done' : ''), 'data-id': b.id },
      h('button', { class: 'handle', type: 'button', 'aria-label': 'Opciones del bloque', onmousedown: keep, onclick: () => blockMenu(b.id) }, icon('handle')));
    if (TEXT.has(b.t)) {
      if (b.t === 'todo') el.append(h('button', {
        class: 'check', type: 'button', 'aria-label': 'Marcar', onmousedown: keep,
        onclick: () => { b.checked = !b.checked; el.classList.toggle('done', b.checked); touch(); },
      }, icon('check')));
      else if (LIST.has(b.t)) el.append(h('span', { class: 'marker', 'aria-hidden': 'true' }));
      el.append(h('div', { class: 'content', contenteditable: 'true', 'data-ph': PLACEHOLDER[b.t], html: sanitize(b.html || '') }));
    } else if (b.t === 'divider') {
      el.append(h('hr'));
    } else if (b.t === 'image') {
      const img = h('img', { alt: 'Foto', style: `width:${b.w || 100}%`, onclick: () => blockMenu(b.id) });
      S.blobURL(b.blob).then(u => { if (u) img.src = u; else img.replaceWith(h('p', { class: 'muted' }, 'Esta foto no está en este dispositivo.')); });
      el.append(img);
    } else if (b.t === 'draw') {
      const host = h('div', { class: 'draw' });
      el.append(host);
      cleanups.set(b.id, mountDrawing(host, b, touch));
    }
    return el;
  }

  function insertAfter(id, b) {
    const ref = id && E(id);
    page.blocks.splice(ref ? I(id) + 1 : page.blocks.length, 0, b);
    const el = render(b);
    if (ref) ref.after(el); else list.append(el);
    touch();
    return el;
  }

  /** The page always ends in a text block, so there is somewhere to keep typing. */
  function ensureTail() {
    const lastB = page.blocks.at(-1);
    if (!lastB || !TEXT.has(lastB.t)) insertAfter(lastB?.id, mk('p'));
  }

  function removeBlock(id) {
    const i = I(id);
    if (i < 0) return;
    const b = page.blocks[i];
    cleanups.get(id)?.();
    cleanups.delete(id);
    if (b.t === 'draw') S.delDrawing(id);
    if (b.t === 'image') S.delBlob(b.blob);
    page.blocks.splice(i, 1);
    E(id)?.remove();
    if (current === id) current = null;
    ensureTail();
    touch();
  }

  function setType(id, t, atEnd = true) {
    const b = B(id), c = C(id);
    if (c) b.html = c.innerHTML;
    b.t = t;
    if (t !== 'todo') delete b.checked;
    const el = render(b);
    E(id).replaceWith(el);
    if (TEXT.has(t)) place(el.querySelector('.content'), atEnd);
    touch();
  }

  const textFrom = (i, step) => {
    for (; i >= 0 && i < page.blocks.length; i += step) if (TEXT.has(page.blocks[i].t)) return page.blocks[i];
    return null;
  };

  function add(t) {
    if (t === 'image') return picker.click();
    const cur = current && B(current);
    const c = cur && C(cur.id);
    if (TEXT.has(t)) {
      if (cur && TEXT.has(cur.t)) return setType(cur.id, cur.t === t ? 'p' : t);
      const el = insertAfter(cur?.id ?? page.blocks.at(-1)?.id, mk(t));
      return place(el.querySelector('.content'), false);
    }
    const el = insertAfter(cur?.id ?? page.blocks.at(-1)?.id, mk(t));
    if (cur?.t === 'p' && c && c.textContent === '') removeBlock(cur.id);
    ensureTail();
    current = el.dataset.id;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function addImages(files) {
    let after = current && B(current) ? current : page.blocks.at(-1)?.id;
    for (const f of files) {
      try {
        const b = { id: S.uid(), t: 'image', blob: await S.saveBlob(await shrink(f)), w: 100 };
        insertAfter(after, b);
        after = b.id;
      } catch (err) {
        console.error(err);
        toast('No se ha podido añadir una de las fotos.');
      }
    }
    ensureTail();
    E(after)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function move(id, dir) {
    const i = I(id), j = i + dir;
    if (j < 0 || j >= page.blocks.length) return;
    const other = page.blocks[j];
    [page.blocks[i], page.blocks[j]] = [page.blocks[j], page.blocks[i]];
    if (dir < 0) E(other.id).before(E(id)); else E(other.id).after(E(id));
    ensureTail();
    touch();
  }

  function typeSheet(title, types, pick) {
    sheet(title, (body, close) => {
      body.append(h('div', { class: 'type-grid' }, types.map(([t, label, glyph]) =>
        h('button', { class: 'type-btn', type: 'button', onclick: () => { close(); pick(t); } },
          h('span', { class: 'type-glyph', 'aria-hidden': 'true' }, glyph), label))));
    });
  }

  const addMenu = () => typeSheet('Añadir', TYPES, add);

  function blockMenu(id) {
    const b = B(id), i = I(id);
    if (!b) return;
    const size = (label, w) => ({ label, fn: () => { b.w = w; E(id).querySelector('img').style.width = w + '%'; touch(); } });
    menu('Bloque', [
      TEXT.has(b.t) && { label: 'Convertir en…', icon: 'list', fn: () => typeSheet('Convertir en', TYPES.filter(x => TEXT.has(x[0])), t => setType(id, t)) },
      ...(b.t === 'image' ? [size('Tamaño pequeño', 35), size('Tamaño mediano', 60), size('Ancho completo', 100)] : []),
      i > 0 && { label: 'Subir', icon: 'back', fn: () => move(id, -1) },
      i < page.blocks.length - 1 && { label: 'Bajar', icon: 'next', fn: () => move(id, 1) },
      { label: 'Eliminar', icon: 'x', danger: true, fn: () => removeBlock(id) },
    ]);
  }

  function highlight() {
    const on = /255,\s*228,\s*92|ffe45c/i.test(String(document.queryCommandValue('backColor')));
    const color = on ? 'transparent' : HIGHLIGHT;
    document.execCommand('styleWithCSS', false, true);
    if (!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color);
  }

  const tb = (label, content, fn, cls = '') => h('button', { class: 'tb ' + cls, type: 'button', 'aria-label': label, title: label, onmousedown: keep, onclick: fn }, content);
  const fmt = cmd => () => document.execCommand(cmd);
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Herramientas de la página' },
    tb('Añadir bloque', icon('plus'), addMenu, 'primary'),
    tb('Añadir foto', icon('image'), () => picker.click()),
    tb('Añadir dibujo a mano', icon('pen'), () => add('draw')),
    h('span', { class: 'tb-sep' }),
    tb('Negrita', h('b', null, 'B'), fmt('bold')),
    tb('Cursiva', h('i', null, 'I'), fmt('italic')),
    tb('Subrayado', h('u', null, 'U'), fmt('underline')),
    tb('Resaltar', h('span', { class: 'hl-sample' }, 'A'), highlight),
    h('span', { class: 'tb-sep' }),
    tb('Título', h('b', null, 'H'), () => add('h2')),
    tb('Lista', icon('list'), () => add('bullet')),
    tb('Lista de tareas', icon('tasks'), () => add('todo')));

  const picker = h('input', {
    type: 'file', accept: 'image/*', multiple: true, hidden: true,
    onchange: () => { const files = [...picker.files]; picker.value = ''; if (files.length) addImages(files); },
  });

  const title = h('h1', { class: 'page-title', contenteditable: 'plaintext-only', 'data-ph': 'Sin título', role: 'textbox', 'aria-label': 'Título de la página' });
  title.textContent = page.title || '';
  if (title.contentEditable !== 'plaintext-only') title.contentEditable = 'true';
  title.addEventListener('input', () => {
    if (title.innerHTML === '<br>') title.innerHTML = '';
    page.title = title.textContent.trim();
    onTitle?.(page.title);
    touch();
  });
  title.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = textFrom(0, 1);
    if (first) place(C(first.id), false);
  });
  title.addEventListener('paste', e => {
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' '));
  });

  const list = h('div', { class: 'blocks' });
  for (const b of page.blocks) list.append(render(b));
  const tail = h('div', {
    class: 'tail', onclick: () => { ensureTail(); place(C(page.blocks.at(-1).id), true); },
  });
  root.append(toolbar, title, list, tail, picker);

  list.addEventListener('focusin', e => { const bl = e.target.closest('.block'); if (bl) current = bl.dataset.id; });

  list.addEventListener('keydown', e => {
    const c = e.target.closest?.('.content');
    if (!c || e.isComposing) return;
    const id = c.parentElement.dataset.id, b = B(id), i = I(id);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (b.t !== 'p' && c.textContent === '') return setType(id, 'p');
      const r = getSelection().getRangeAt(0);
      r.deleteContents();
      const rest = document.createRange();
      rest.selectNodeContents(c);
      rest.setStart(r.endContainer, r.endOffset);
      const tmp = h('div');
      tmp.append(rest.extractContents());
      if (c.textContent === '') c.innerHTML = '';
      b.html = c.innerHTML;
      const el = insertAfter(id, mk(LIST.has(b.t) ? b.t : 'p', tmp.textContent === '' ? '' : tmp.innerHTML));
      place(el.querySelector('.content'), false);
      el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Backspace' && caretAt(c, true)) {
      if (b.t !== 'p') { e.preventDefault(); return setType(id, 'p', false); }
      const prev = page.blocks[i - 1];
      if (!prev) return;
      e.preventDefault();
      if (!TEXT.has(prev.t)) {
        if (c.textContent === '' && i < page.blocks.length - 1) {
          removeBlock(id);
          const p = textFrom(i - 1, -1);
          if (p) place(C(p.id), true);
        }
        return;
      }
      const pc = C(prev.id);
      const offset = pc.childNodes.length;
      pc.append(...c.childNodes);
      prev.html = pc.innerHTML;
      removeBlock(id);
      pc.focus();
      const r = document.createRange();
      r.setStart(pc, offset);
      r.collapse(true);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    } else if (e.key === 'ArrowUp' && caretAt(c, true)) {
      const p = textFrom(i - 1, -1);
      if (p) { e.preventDefault(); place(C(p.id), true); }
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
    b.html = c.innerHTML;
    touch();
    if (b.t !== 'p') return;
    const t = c.textContent.replace(/ /g, ' ');
    if (t === '/') { c.innerHTML = ''; b.html = ''; return addMenu(); }
    if (t === '---') {
      b.t = 'divider'; b.html = '';
      E(id).replaceWith(render(b));
      const next = page.blocks[I(id) + 1];
      const el = next && TEXT.has(next.t) ? E(next.id) : insertAfter(id, mk('p'));
      return place(el.querySelector('.content'), false);
    }
    if (e.data !== ' ') return;
    const m = /^(#{1,3}|[-*]|\[\]|1\.|>) /.exec(t);
    if (!m) return;
    const first = document.createTreeWalker(c, NodeFilter.SHOW_TEXT).nextNode();
    if (!first || first.length < m[0].length) return;
    first.deleteData(0, m[0].length);
    setType(id, SHORTCUTS[m[1]], false);
  });

  list.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); return addImages(files); }
    const c = e.target.closest?.('.content');
    if (!c) return;
    e.preventDefault();
    const lines = (e.clipboardData.getData('text/plain') || '').replace(/\r/g, '').split('\n');
    document.execCommand('insertText', false, lines.shift());
    let id = c.parentElement.dataset.id;
    const extra = lines.filter(l => l.trim());
    for (const l of extra) { const nb = mk('p', esc(l)); insertAfter(id, nb); id = nb.id; }
    if (extra.length) place(C(id), true);
  });

  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);
  addEventListener('pagehide', flush);

  return {
    flush,
    destroy() {
      flush();
      document.removeEventListener('visibilitychange', onHide);
      removeEventListener('pagehide', flush);
      for (const fn of cleanups.values()) fn();
    },
  };
}
