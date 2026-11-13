import { COLORS, EMOJIS, col } from './util.js';

/** Hooks filled in by app.js so views can ask for a re-render without importing it. */
export const app = { refresh() {} };

export function nav(hash, replace = false) {
  if (replace) location.replace(hash); else location.hash = hash;
}

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
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 4v16"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  handle: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/>',
  marker: '<path d="M14 4l6 6-8.5 8.5H7l-1.5-1.5v-4.500z"/><path d="M5 20h6"/>',
  eraser: '<path d="M8.500 20l-4.500-4.500a1.500 1.500 0 0 1 0-2L13.500 4l6.500 6.500L10.500 20z"/><path d="M8.500 20H20"/>',
  undo: '<path d="M9 6L4 11l5 5"/><path d="M4 11h10a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 6l5 5-5 5"/><path d="M20 11H10a5 5 0 0 0 0 10h3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  star: '<path d="M12 3l2.700 5.800 6.300.800-4.600 4.400 1.200 6.300L12 17.300 6.400 20.300l1.200-6.300L3 9.600l6.300-.800z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.500" cy="6" r="1"/><circle cx="4.500" cy="12" r="1"/><circle cx="4.500" cy="18" r="1"/>',
  grow: '<path d="M12 4v16M6 14l6 6 6-6"/>',
  hand: '<path d="M8 12V6a1.500 1.500 0 0 1 3 0v5V4.500a1.500 1.500 0 0 1 3 0V11V6a1.500 1.500 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4.500a1.400 1.400 0 0 1 2.300-1.500z"/>',
};

export function icon(name) {
  return h('span', { class: 'ico', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>` });
}

export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

/** Bottom sheet on phones, centred dialog on tablets. `build(body, close)` fills it. */
export function sheet(title, build) {
  const close = () => wrap.remove();
  const body = h('div', { class: 'sheet-body' });
  const wrap = h('div', { class: 'sheet-wrap', onclick: e => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('div', { class: 'sheet-head' },
        h('h2', null, title),
        h('button', { class: 'icon-btn', type: 'button', onclick: close, 'aria-label': 'Cerrar' }, icon('x'))),
      body));
  document.body.append(wrap);
  build(body, close);
  return close;
}

/** items: [{label, icon?, danger?, fn}] */
export function menu(title, items) {
  sheet(title, (body, close) => {
    body.append(h('div', { class: 'menu' }, items.filter(Boolean).map(it =>
      h('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), type: 'button', onclick: () => { close(); it.fn(); } },
        it.icon && icon(it.icon), it.label))));
  });
}

export function confirmDialog(text, okLabel = 'Eliminar') {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    sheet(text, (body, close) => {
      body.append(h('div', { class: 'form-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { close(); finish(false); } }, 'Cancelar'),
        h('button', { class: 'btn danger solid', type: 'button', onclick: () => { close(); finish(true); } }, okLabel)));
      body.closest('.sheet-wrap').addEventListener('click', e => { if (e.target.classList.contains('sheet-wrap') || e.target.closest('.sheet-head button')) finish(false); });
    });
  });
}

/**
 * fields: [{key, label, type: text|date|time|select|textarea|color|emoji, value, options, required, placeholder}]
 * onSave(values) may return a string to show as an error and keep the form open.
 */
export function openForm(title, fields, { onSave, onDelete, deleteText = '¿Eliminar?', saveLabel = 'Guardar', focus = false } = {}) {
  sheet(title, (body, close) => {
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
      if (f.type === 'color' || f.type === 'emoji') {
        let val = f.value;
        const row = h('div', { class: 'picks' });
        const opts = f.type === 'color' ? Object.keys(COLORS) : EMOJIS;
        for (const o of opts) {
          const b = h('button', {
            type: 'button', class: 'pick' + (f.type === 'color' ? ' swatch' : '') + (o === val ? ' on' : ''),
            style: f.type === 'color' ? `--c:${col(o)}` : null, 'aria-label': f.type === 'color' ? o : null,
            onclick: () => { val = o; row.querySelectorAll('.on').forEach(x => x.classList.remove('on')); b.classList.add('on'); },
          }, f.type === 'emoji' ? o : null);
          row.append(b);
        }
        read[f.key] = () => val;
        form.append(h('div', { class: 'field' }, h('span', null, f.label), row));
        continue;
      }
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

export function topbar(title, { back, actions = [], sub } = {}) {
  return h('header', { class: 'top' },
    back && h('a', { class: 'icon-btn', href: back, 'aria-label': 'Volver' }, icon('back')),
    h('div', { class: 'top-t' }, h('h1', null, title), sub && h('p', { class: 'muted' }, sub)),
    h('div', { class: 'top-a' }, actions));
}

export const iconBtn = (name, label, fn, cls = '') =>
  h('button', { class: 'icon-btn ' + cls, type: 'button', 'aria-label': label, title: label, onclick: fn }, icon(name));

export const empty = (text, action) => h('div', { class: 'empty' }, h('p', null, text), action);
