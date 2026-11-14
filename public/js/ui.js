import { EMOJIS } from './util.js';

/** Hooks filled in by app.js so views can navigate and re-render without importing it. */
export const app = {
  refresh() {},           // re-render everything
  chrome() {},            // re-render sidebar, tabs and breadcrumb only (keeps the editor alive)
  go(route, opts) {},     // navigate the active tab; opts.newTab opens another
  route: () => 'home',
};

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false || k === 'value') continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat(Infinity).filter(k => k != null && k !== false));
  if (props?.value != null) el.value = props.value;
  return el;
}

const PATHS = {
  home: '<path d="M4 10.5 12 4l8 6.500V19a1 1 0 0 1-1 1h-4.500v-5.500h-5V20H5a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3.500" y="4.500" width="17" height="15" rx="2"/><path d="M3.500 10h17M9 4.500v15M15 4.500v15"/>',
  cal: '<rect x="3.500" y="5" width="17" height="15" rx="2"/><path d="M3.500 10h17M8 3v4M16 3v4"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.500 12.500l2.500 2.500 4.500-5"/>',
  search: '<circle cx="11" cy="11" r="6.500"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  more: '<circle cx="5" cy="12" r="1.500" fill="currentColor"/><circle cx="12" cy="12" r="1.500" fill="currentColor"/><circle cx="19" cy="12" r="1.500" fill="currentColor"/>',
  handle: '<circle cx="9" cy="6" r="1.400" fill="currentColor"/><circle cx="15" cy="6" r="1.400" fill="currentColor"/><circle cx="9" cy="12" r="1.400" fill="currentColor"/><circle cx="15" cy="12" r="1.400" fill="currentColor"/><circle cx="9" cy="18" r="1.400" fill="currentColor"/><circle cx="15" cy="18" r="1.400" fill="currentColor"/>',
  image: '<rect x="3.500" y="5" width="17" height="14" rx="2"/><circle cx="8.500" cy="10" r="1.500"/><path d="M20.500 16l-5-5-8 8"/>',
  pen: '<path d="M4 20l1-4L16.500 4.500a2.100 2.100 0 0 1 3 3L8 19z"/>',
  marker: '<path d="M14 4l6 6-8.500 8.500H7l-1.500-1.500v-4.500z"/><path d="M5 20h6"/>',
  eraser: '<path d="M8.500 20l-4.500-4.500a1.500 1.500 0 0 1 0-2L13.500 4l6.500 6.500L10.500 20z"/><path d="M8.500 20H20"/>',
  undo: '<path d="M9 6L4 11l5 5"/><path d="M4 11h10a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 6l5 5-5 5"/><path d="M20 11H10a5 5 0 0 0 0 10h3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M18.700 5.300l-2.100 2.100M7.400 16.600l-2.100 2.100"/>',
  star: '<path d="M12 3.500l2.600 5.600 6.100.700-4.500 4.200 1.200 6L12 17l-5.400 3 1.200-6-4.500-4.200 6.100-.700z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.500" cy="6" r="1" fill="currentColor"/><circle cx="4.500" cy="12" r="1" fill="currentColor"/><circle cx="4.500" cy="18" r="1" fill="currentColor"/>',
  grow: '<path d="M12 4v16M6 14l6 6 6-6"/>',
  hand: '<path d="M8 12V6a1.500 1.500 0 0 1 3 0v5V4.500a1.500 1.500 0 0 1 3 0V11V6a1.500 1.500 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4.500a1.400 1.400 0 0 1 2.300-1.500z"/>',
  doc: '<path d="M6.500 3.500h7l4 4V20a.500.500 0 0 1-.500.500h-10.500A.500.500 0 0 1 6 20V4a.500.500 0 0 1 .500-.500z"/><path d="M13.500 3.500v4h4M9 12h6M9 15.500h6"/>',
  trash: '<path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.800 12.500h9.400L17.500 7"/>',
  sidebar: '<rect x="3.500" y="4.500" width="17" height="15" rx="2"/><path d="M9.500 4.500v15"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  palette: '<path d="M12 3.500a8.500 8.500 0 1 0 0 17c1.200 0 1.800-.900 1.800-1.800 0-1.700 1-2.200 2.200-2.200h1.500a3 3 0 0 0 3-3c0-5.500-3.800-10-8.500-10z"/><circle cx="8" cy="11" r="1" fill="currentColor"/><circle cx="11.500" cy="7.500" r="1" fill="currentColor"/><circle cx="15.500" cy="9" r="1" fill="currentColor"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>',
  code: '<path d="M8.500 7l-5 5 5 5M15.500 7l5 5-5 5"/>',
  indent: '<path d="M4 6h16M11 12h9M4 18h16M4 10l3 2-3 2"/>',
  outdent: '<path d="M4 6h16M11 12h9M4 18h16M7 10l-3 2 3 2"/>',
  keyboard: '<rect x="3" y="6" width="18" height="11" rx="2"/><path d="M7 10h.010M11 10h.010M15 10h.010M8 13.500h8M9.500 20.500l2.500 1.500 2.500-1.500"/>',
  type: '<path d="M5 6V4.500h14V6M12 4.500v15M9.500 19.500h5"/>',
  tab: '<rect x="3.500" y="5" width="17" height="14" rx="2"/><path d="M3.500 9.500h17"/>',
  width: '<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>',
  cloud: '<path d="M7 18.500a4.500 4.500 0 0 1-.500-8.970A6 6 0 0 1 18 10.500a4 4 0 0 1-.500 8z"/>',
  columns: '<rect x="3.500" y="4.500" width="17" height="15" rx="2"/><path d="M12 4.500v15"/>',
  book: '<path d="M5.500 4h10.500a2.500 2.500 0 0 1 2.500 2.500V20H8a2.500 2.500 0 0 1-2.500-2.500z"/><path d="M5.500 17.500A2.500 2.500 0 0 1 8 15h10.500"/>',
};

export function icon(name) {
  return h('span', { class: 'ico', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.600" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>` });
}

export const iconBtn = (name, label, fn, cls = '') =>
  h('button', { class: 'ibtn ' + cls, type: 'button', 'aria-label': label, title: label, onclick: fn }, icon(name));

export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------- Popovers ----------

let openPop = null;

/** Place a floating element next to an anchor (element, DOMRect or {x, y}), keeping it on screen. */
export function placeNear(el, anchor, { above = false, gap = 6 } = {}) {
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect()
    : 'x' in anchor && !('width' in anchor) ? { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y } : anchor;
  const w = el.offsetWidth, ht = el.offsetHeight, vw = innerWidth, vh = visualViewport?.height ?? innerHeight;
  let top = above ? r.top - ht - gap : r.bottom + gap;
  if (!above && top + ht > vh - 8 && r.top - ht - gap > 8) top = r.top - ht - gap;
  if (above && top < 8) top = r.bottom + gap;
  el.style.top = Math.max(8, Math.min(top, vh - ht - 8)) + 'px';
  el.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
}

/** Floating panel anchored to something; closes on outside press or Escape. `build(el, close)`. */
export function pop(anchor, build, cls = '') {
  openPop?.();
  const el = h('div', { class: 'pop ' + cls, role: 'dialog' });
  const close = () => {
    if (openPop !== close) return;
    openPop = null;
    el.remove();
    removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', key, true);
  };
  const outside = e => { if (!el.contains(e.target)) close(); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  build(el, close);
  document.body.append(el);
  placeNear(el, anchor);
  el.reposition = () => placeNear(el, anchor);
  openPop = close;
  setTimeout(() => { if (openPop === close) { addEventListener('pointerdown', outside, true); addEventListener('keydown', key, true); } });
  return close;
}

/** items: [{label, icon?, danger?, on?, hint?, fn?, sub?: items}] — `sub` opens a nested list in place. */
export function menu(anchor, items) {
  pop(anchor, (el, close) => {
    const show = (list, parent) => {
      el.replaceChildren(h('div', { class: 'menu' },
        parent && h('button', { class: 'menu-item menu-back', type: 'button', onclick: () => show(parent) }, icon('back'), 'Atrás'),
        list.filter(Boolean).map(it => it.sep ? h('div', { class: 'menu-sep' }) : h('button', {
          class: 'menu-item' + (it.danger ? ' danger' : ''), type: 'button',
          onclick: () => { if (it.sub) { show(it.sub, list); el.reposition?.(); } else { close(); it.fn(); } },
        },
        it.swatch ? h('span', { class: 'swatch', style: it.swatch }, 'A') : it.icon && icon(it.icon),
        h('span', { class: 'menu-label' }, it.label),
        it.on && icon('check'), it.sub && icon('next')))));
    };
    show(items);
  }, 'menu-pop');
}

export function emojiPicker(anchor, onPick, onRemove) {
  pop(anchor, (el, close) => {
    el.append(
      h('div', { class: 'pop-head' }, h('span', null, 'Icono'),
        onRemove && h('button', { class: 'tbtn', type: 'button', onclick: () => { close(); onRemove(); } }, 'Quitar')),
      h('div', { class: 'emoji-grid' }, EMOJIS.map(e => h('button', { type: 'button', onclick: () => { close(); onPick(e); } }, e))));
  }, 'emoji-pop');
}

// ---------- Modals ----------

/** Centred dialog. `build(body, close)` fills it. */
export function modal(title, build, cls = '') {
  const close = () => { wrap.remove(); removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const body = h('div', { class: 'modal-body' });
  const wrap = h('div', { class: 'modal-wrap', onpointerdown: e => { if (e.target === wrap) close(); } },
    h('div', { class: 'modal ' + cls, role: 'dialog', 'aria-label': title },
      title && h('div', { class: 'modal-head' },
        h('h2', null, title),
        h('button', { class: 'ibtn modal-close', type: 'button', onclick: close, 'aria-label': 'Cerrar' }, icon('x'))),
      body));
  document.body.append(wrap);
  addEventListener('keydown', key, true);
  build(body, close);
  return close;
}

export function confirmDialog(text, okLabel = 'Eliminar') {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    modal(text, (body, close) => {
      body.append(h('div', { class: 'form-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { close(); finish(false); } }, 'Cancelar'),
        h('button', { class: 'btn danger solid', type: 'button', onclick: () => { close(); finish(true); } }, okLabel)));
      const wrap = body.closest('.modal-wrap');
      new MutationObserver(() => { if (!wrap.isConnected) finish(false); }).observe(document.body, { childList: true });
    }, 'confirm');
  });
}

/**
 * fields: [{key, label, type: text|date|time|select|textarea, value, options, required, placeholder}]
 * onSave(values) may return a string to show as an error and keep the form open.
 */
export function openForm(title, fields, { onSave, onDelete, deleteText = '¿Eliminar?', saveLabel = 'Guardar', focus = false } = {}) {
  modal(title, (body, close) => {
    const read = {};
    const form = h('form', {
      class: 'form', onsubmit: e => {
        e.preventDefault();
        const v = {};
        for (const f of fields) v[f.key] = read[f.key]();
        const err = onSave(v);
        if (typeof err === 'string') return toast(err);
        close(); app.refresh();
      },
    });
    for (const f of fields) {
      let el;
      if (f.type === 'select') el = h('select', { value: f.value ?? '' }, f.options.map(([v, l]) => h('option', { value: v }, l)));
      else if (f.type === 'textarea') el = h('textarea', { rows: 3, placeholder: f.placeholder, value: f.value ?? '' });
      else el = h('input', { type: f.type || 'text', required: f.required, placeholder: f.placeholder, value: f.value ?? '', autocomplete: 'off' });
      read[f.key] = () => el.value.trim();
      form.append(h('label', { class: 'field' }, h('span', null, f.label), el));
    }
    form.append(h('div', { class: 'form-actions' },
      onDelete && h('button', {
        type: 'button', class: 'btn danger',
        onclick: async () => { if (await confirmDialog(deleteText)) { onDelete(); close(); app.refresh(); } },
      }, 'Eliminar'),
      h('button', { class: 'btn primary' }, saveLabel)));
    body.append(form);
    if (focus) form.querySelector('input')?.focus();
  });
}

export const empty = (text, action) => h('div', { class: 'empty' }, h('p', null, text), action);

/** Header shared by the built-in views (Horario, Calendario…): big icon, title, actions on the right. */
export function viewHead(emoji, title, actions = [], sub) {
  return h('header', { class: 'view-head' },
    emoji && h('div', { class: 'view-emoji', 'aria-hidden': 'true' }, emoji),
    h('div', { class: 'view-title-row' }, h('h1', null, title), h('div', { class: 'view-actions' }, actions)),
    sub && h('p', { class: 'muted' }, sub));
}
