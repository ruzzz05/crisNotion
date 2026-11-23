// App shell: sidebar with the page tree, tab strip, breadcrumb bar and the active view.
import * as S from './store.js';
import * as T from './tabs.js';
import { h, icon, iconBtn, app, toast, menu, modal, openForm, confirmDialog } from './ui.js';
import { COLORS, COLOR_NAMES, VERSION, plain, tint } from './util.js';
import { norm, tableText } from './model.js';
import { home } from './views/home.js';
import { pageView } from './views/page.js';
import { timetable } from './views/timetable.js';
import { calendar } from './views/calendar.js';
import { tasks } from './views/tasks.js';
import { trash } from './views/trash.js';
import { settings } from './views/settings.js';
import { exportItem, importFile } from './transfer.js';
import { printPage } from './print.js';
import { FONTS } from './theme.js';
import { cloud } from './cloud.js';

const VIEWS = {
  home: { title: 'Inicio', icon: 'home', render: home },
  timetable: { title: 'Horario', icon: 'grid', render: timetable },
  calendar: { title: 'Calendario', icon: 'cal', render: calendar },
  tasks: { title: 'Tareas', icon: 'tasks', render: tasks },
  trash: { title: 'Papelera', icon: 'trash', render: trash },
  settings: { title: 'Ajustes', icon: 'gear', render: settings },
};
const NARROW = matchMedia('(max-width: 767px)');
const ls = {
  get(k, d) { try { return localStorage.getItem('cuaderno:' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cuaderno:' + k, v); } catch { /* storage blocked */ } },
};

const root = document.getElementById('app');
const sidebar = h('aside', { class: 'sidebar', 'aria-label': 'Navegación' });
const tabstrip = h('div', { class: 'tabstrip', role: 'tablist' });
const topbar = h('div', { class: 'topbar' });
const view = h('div', { class: 'view' });
const scroll = h('div', { class: 'scroll' }, view);
const scrim = h('div', { class: 'scrim', onclick: () => setSide(false) });
// One file picker for "import a page into this book", kept outside the sidebar because that is redrawn all the time.
let importInto = null;
const importHere = h('input', {
  class: 'import-here-input', type: 'file', accept: 'application/json,.json', hidden: true,
  onchange: () => { const f = importHere.files[0]; importHere.value = ''; if (f && importInto) importFile(f, { bookId: importInto }); },
});
root.append(sidebar, scrim, h('div', { class: 'main' }, tabstrip, topbar, scroll), importHere);

let tabs = T.restore(ls.get('tabs', null));
let expanded = new Set(JSON.parse(ls.get('expanded', '[]')));
let cleanup = null;
let shown = null; // "tabId|route" of the view on screen
let scrolls = new Map(); // scroll position of each tab's view, so switching tabs does not lose your place

const route = () => T.current(tabs).route;
const pageOf = r => (r.startsWith('page/') ? S.livePage(r.slice(5)) : null);
const info = r => {
  if (VIEWS[r]) return VIEWS[r];
  const p = pageOf(r);
  return p ? { title: p.title || 'Sin título', emoji: p.icon, icon: 'doc' } : { title: 'Página no encontrada', icon: 'doc' };
};

function setTabs(next) {
  tabs = next;
  ls.set('tabs', JSON.stringify(tabs));
}

function setSide(open) {
  if (NARROW.matches) root.classList.toggle('side-open', open);
  else { root.classList.toggle('side-closed', !open); ls.set('side', open ? '1' : '0'); }
}
const sideIsOpen = () => (NARROW.matches ? root.classList.contains('side-open') : !root.classList.contains('side-closed'));

function go(r, { newTab = false, focusTitle = false } = {}) {
  setTabs(newTab ? T.open(tabs, r) : T.navigate(tabs, r));
  if (NARROW.matches) setSide(false);
  render({ focusTitle });
}

// ---------- Sidebar ----------

const glyph = (p, fallback = 'doc') => h('span', { class: 'tree-icon' }, p.icon || icon(fallback));

function pageMenu(p, anchor) {
  const top = !p.parentId;
  menu(anchor, [
    { label: p.fav ? 'Quitar de favoritos' : 'Añadir a favoritos', icon: 'star', fn: () => { p.fav = !p.fav; S.put(p); chrome(); } },
    { label: 'Abrir en una pestaña nueva', icon: 'tab', fn: () => go('page/' + p.id, { newTab: true }) },
    { label: 'Añadir una subpágina', icon: 'plus', fn: () => addPage({ bookId: p.bookId, parentId: p.id }) },
    { sep: true },
    { label: 'Fuente', icon: 'type', sub: [['', 'La de la aplicación'], ...FONTS].map(([k, label]) => ({ label, on: (p.font || '') === k, fn: () => { p.font = k; S.put(p); render(); } })) },
    { label: 'Ancho completo', icon: 'width', on: !!p.wide, fn: () => { p.wide = !p.wide; S.put(p); render(); } },
    top && { label: 'Color en el horario', icon: 'palette', sub: COLORS.map(c => ({ label: COLOR_NAMES[c][0].toUpperCase() + COLOR_NAMES[c].slice(1), swatch: tint(c), on: p.color === c, fn: () => { p.color = c; S.put(p); chrome(); } })) },
    { label: 'Guardar como PDF', icon: 'doc', fn: () => printPage(p.title) },
    { label: 'Exportar página', icon: 'down', fn: () => exportItem(p.id) },
    { sep: true },
    { label: 'Eliminar', icon: 'trash', danger: true, fn: () => deletePage(p) },
  ]);
}

function deletePage(p) {
  const gone = new Set([p.id, ...S.descendants(p.id).map(d => d.id)]);
  S.trash(p.id);
  setTabs(T.redirect(tabs, r => r.startsWith('page/') && gone.has(r.slice(5)), p.parentId && S.livePage(p.parentId) ? 'page/' + p.parentId : 'home'));
  toast('Página enviada a la papelera');
  render();
}

function addPage(where) {
  const p = S.newPage(where);
  if (where.parentId) { expanded.add(where.parentId); ls.set('expanded', JSON.stringify([...expanded])); }
  go('page/' + p.id, { focusTitle: true });
}

function bookForm(b = {}) {
  openForm(b.id ? 'Renombrar libro' : 'Nuevo libro', [
    { key: 'name', label: 'Nombre', required: true, value: b.name, placeholder: '2.º de Bachillerato' },
  ], {
    focus: true,
    onSave: v => { S.put({ ...b, type: 'book', ...v }); },
  });
}

function treeRow(p, depth, current, flat = false) {
  const kids = flat ? [] : S.children({ parentId: p.id });
  const open = expanded.has(p.id);
  const row = h('div', {
    class: 'tree-row' + (current?.id === p.id ? ' on' : ''), 'data-id': p.id, style: `--depth:${depth}`,
    onclick: () => go('page/' + p.id),
  },
  !flat && h('button', {
    class: 'tree-toggle' + (open ? ' open' : ''), type: 'button', 'aria-label': open ? 'Contraer' : 'Desplegar',
    onclick: e => { e.stopPropagation(); open ? expanded.delete(p.id) : expanded.add(p.id); ls.set('expanded', JSON.stringify([...expanded])); chrome(); },
  }, icon('next')),
  glyph(p),
  h('span', { class: 'tree-title' }, p.title || 'Sin título'),
  h('button', { class: 'tree-btn tree-more', type: 'button', 'aria-label': 'Opciones de la página', onclick: e => { e.stopPropagation(); pageMenu(p, e.currentTarget); } }, icon('more')),
  !flat && h('button', { class: 'tree-btn tree-add', type: 'button', 'aria-label': 'Añadir una subpágina', onclick: e => { e.stopPropagation(); addPage({ bookId: p.bookId, parentId: p.id }); } }, icon('plus')));
  if (flat || !open) return [row];
  return [row, ...(kids.length ? kids.flatMap(k => treeRow(k, depth + 1, current)) : [h('div', { class: 'tree-empty', style: `--depth:${depth + 1}` }, 'Sin páginas dentro')])];
}

function drawSidebar() {
  const r = route(), current = pageOf(r);
  if (current) for (const a of S.path(current).slice(1, -1)) expanded.add(a.id);
  const item = (key, extra) => h('button', { class: 'side-item' + (r === key ? ' on' : ''), type: 'button', 'data-route': key, onclick: () => go(key) }, icon(VIEWS[key].icon), h('span', null, VIEWS[key].title), extra);
  const favs = S.pages().filter(p => p.fav);
  sidebar.replaceChildren(
    h('div', { class: 'side-head' },
      h('span', { class: 'ws-logo', 'aria-hidden': 'true' }, 'C'), h('span', { class: 'ws-name' }, 'Cuaderno'),
      iconBtn('sidebar', 'Ocultar la barra lateral', () => setSide(false), 'side-close')),
    h('nav', { class: 'side-nav' },
      h('button', { class: 'side-item side-search', type: 'button', onclick: finder }, icon('search'), h('span', null, 'Buscar'), h('kbd', null, 'Ctrl K')),
      item('home'), item('timetable'), item('calendar'), item('tasks')),
    h('div', { class: 'side-scroll' },
      favs.length ? h('section', { class: 'side-sec side-favs' }, h('div', { class: 'side-label' }, 'Favoritos'), favs.flatMap(p => treeRow(p, 0, current, true))) : null,
      S.all('book').map(b => h('section', { class: 'side-sec book', 'data-id': b.id },
        h('div', { class: 'book-head' },
          h('span', { class: 'book-name' }, b.name),
          h('button', {
            class: 'tree-btn book-more', type: 'button', 'aria-label': 'Opciones del libro', onclick: e => menu(e.currentTarget, [
              { label: 'Renombrar', icon: 'pen', fn: () => bookForm(b) },
              { label: 'Exportar libro', icon: 'down', fn: () => exportItem(b.id) },
              { label: 'Importar página aquí', icon: 'up', fn: () => { importInto = b.id; importHere.click(); } },
              { sep: true },
              {
                label: 'Eliminar libro', icon: 'trash', danger: true, fn: async () => {
                  if (!await confirmDialog(`¿Enviar «${b.name}» y todas sus páginas a la papelera?`)) return;
                  S.trash(b.id);
                  setTabs(T.redirect(tabs, x => x.startsWith('page/') && !S.livePage(x.slice(5)), 'home'));
                  render();
                },
              }]),
          }, icon('more')),
          h('button', { class: 'tree-btn book-add', type: 'button', 'aria-label': 'Nueva página en este libro', onclick: () => addPage({ bookId: b.id }) }, icon('plus'))),
        S.children({ bookId: b.id }).flatMap(p => treeRow(p, 0, current)),
        !S.children({ bookId: b.id }).length && h('div', { class: 'tree-empty', style: '--depth:0' }, 'Añade una asignatura con +'))),
      h('button', { class: 'side-item side-new-book', type: 'button', onclick: () => bookForm() }, icon('plus'), h('span', null, 'Nuevo libro'))),
    h('nav', { class: 'side-foot' },
      cloud.label() && h('button', { class: 'side-item side-sync', type: 'button', title: 'Cuenta y sincronización', onclick: () => go('settings') }, icon('cloud'), h('span', { class: 'sync-label' }, cloud.label())),
      h('div', { class: 'side-version', title: 'Versión de la app' }, 'v' + VERSION),
      item('trash'), item('settings')));
}

// ---------- Tabs and top bar ----------

function drawTabs() {
  tabstrip.replaceChildren(
    ...tabs.tabs.map(t => {
      const i = info(t.route);
      return h('div', {
        class: 'tabx' + (t.id === tabs.active ? ' on' : ''), role: 'tab', 'data-id': t.id, 'aria-selected': String(t.id === tabs.active),
        onclick: () => { if (t.id !== tabs.active) { setTabs(T.activate(tabs, t.id)); render(); } },
      },
      h('span', { class: 'tabx-icon' }, i.emoji || icon(i.icon)),
      h('span', { class: 'tabx-title' }, i.title),
      h('button', { class: 'tabx-close', type: 'button', 'aria-label': 'Cerrar pestaña', onclick: e => { e.stopPropagation(); setTabs(T.close(tabs, t.id)); render(); } }, icon('x')));
    }),
    h('button', { class: 'tab-new', type: 'button', 'aria-label': 'Nueva pestaña', title: 'Nueva pestaña', onclick: () => go('home', { newTab: true }) }, icon('plus')));
  tabstrip.querySelector('.tabx.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function drawTop() {
  const r = route(), p = pageOf(r);
  const crumbs = [];
  if (p) {
    S.path(p).forEach((d, i, arr) => {
      if (i) crumbs.push(h('span', { class: 'crumb-sep' }, '/'));
      const isBook = d.type === 'book';
      crumbs.push(h('button', {
        class: 'crumb' + (i === arr.length - 1 ? ' last' : ''), type: 'button', disabled: isBook,
        onclick: () => { if (!isBook && d.id !== p.id) go('page/' + d.id); },
      }, !isBook && d.icon ? h('span', { class: 'crumb-icon' }, d.icon) : null, isBook ? d.name : d.title || 'Sin título'));
    });
  } else crumbs.push(h('span', { class: 'crumb-static' }, info(r).title));
  topbar.replaceChildren(...[
    iconBtn('menu', 'Mostrar la barra lateral', () => setSide(!sideIsOpen()), 'side-toggle'),
    h('div', { class: 'crumbs' }, crumbs),
    p && iconBtn('star', p.fav ? 'Quitar de favoritos' : 'Añadir a favoritos', () => { p.fav = !p.fav; S.put(p); chrome(); }, 'top-fav' + (p.fav ? ' on' : '')),
    p && iconBtn('more', 'Opciones de la página', e => pageMenu(p, e.currentTarget), 'top-more')].filter(Boolean));
}

function chrome() {
  drawSidebar();
  drawTabs();
  drawTop();
  document.title = info(route()).title + ' · Cuaderno';
}

function render({ focusTitle = false } = {}) {
  const r = route();
  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  if (shown) scrolls.set(shown, scroll.scrollTop);
  scrolls = T.pruneScroll(scrolls, tabs);
  view.replaceChildren();
  view.className = 'view';
  chrome();
  cleanup = (VIEWS[r] ? VIEWS[r].render(view) : pageView(view, r.slice(5), { focusTitle })) || null;
  shown = tabs.active + '|' + r;
  const want = scrolls.get(shown) ?? 0, key = shown;
  scroll.scrollTop = want;
  requestAnimationFrame(() => { if (shown === key) scroll.scrollTop = want; }); // content that settles after the first paint
  if (location.hash !== '#/' + r) history.replaceState(null, '', '#/' + r);
}

// ---------- Quick find ----------

function finder() {
  if (document.querySelector('.finder')) return;
  const index = S.pages().map(p => ({ p, body: (p.blocks || []).map(b => plain(b.t === 'table' ? tableText(b.rows) : b.html)).filter(Boolean).join(' · ') }));
  modal('', (body, close) => {
    const input = h('input', { type: 'search', placeholder: 'Buscar páginas, eventos y tareas…', 'aria-label': 'Buscar', autocomplete: 'off' });
    const out = h('div', { class: 'finder-list' });
    let hits = [], sel = 0;
    const open = hit => { close(); go(hit.route); };
    const draw = () => {
      out.replaceChildren(...(hits.length ? hits.map((x, i) => h('button', { class: 'finder-item' + (i === sel ? ' on' : ''), type: 'button', onclick: () => open(x) },
        h('span', { class: 'tree-icon' }, x.emoji || icon(x.icon)),
        h('span', { class: 'finder-text' }, h('span', { class: 'finder-title' }, x.title), x.sub && h('span', { class: 'muted' }, x.sub))))
        : [h('div', { class: 'finder-empty' }, input.value.trim() ? 'Sin resultados' : 'Escribe para buscar en todo tu cuaderno.')]));
      out.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    };
    const run = () => {
      const q = norm(input.value.trim());
      hits = []; sel = 0;
      if (q) {
        for (const { p, body: text } of index) {
          const at = norm(text).indexOf(q);
          if (!norm(p.title).includes(q) && at < 0) continue;
          hits.push({ route: 'page/' + p.id, emoji: p.icon, icon: 'doc', title: p.title || 'Sin título', sub: at >= 0 ? '…' + text.slice(Math.max(0, at - 24), at + 60) + '…' : S.get(p.bookId)?.name });
        }
        for (const e of S.all('event')) if (norm(e.title + ' ' + (e.notes || '')).includes(q)) hits.push({ route: 'calendar', icon: 'cal', title: e.title, sub: 'Evento' });
        for (const t of S.all('task')) if (norm(t.title).includes(q)) hits.push({ route: 'tasks', icon: 'tasks', title: t.title, sub: t.done ? 'Tarea hecha' : 'Tarea pendiente' });
      } else {
        hits = [...index].sort((a, b) => b.p.updatedAt - a.p.updatedAt).slice(0, 6).map(({ p }) => ({ route: 'page/' + p.id, emoji: p.icon, icon: 'doc', title: p.title || 'Sin título', sub: S.get(p.bookId)?.name }));
      }
      draw();
    };
    input.addEventListener('input', run);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (hits.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; draw(); } }
      else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); open(hits[sel]); }
    });
    body.append(h('div', { class: 'finder-input' }, icon('search'), input), out);
    run();
    input.focus();
  }, 'finder');
}

// ---------- No zoom on double tap ----------
// CSS (touch-action) already asks for this, but iOS does not always honour it, above all in the installed app.
// So the second of two quick taps on the same spot is cancelled before the browser can zoom. Writing areas
// are left alone (there a double tap selects a word), and a control still receives its second press.
let lastTap = { t: 0, x: 0, y: 0 };
document.addEventListener('touchend', e => {
  const p = e.changedTouches?.[0];
  if (!p || e.touches.length) return;
  const now = Date.now(), double = now - lastTap.t < 350 && Math.hypot(p.clientX - lastTap.x, p.clientY - lastTap.y) < 40;
  lastTap = { t: double ? 0 : now, x: p.clientX, y: p.clientY };
  const el = e.target instanceof Element ? e.target : null;
  if (!double || !el || el.closest('[contenteditable], input, textarea, select')) return;
  e.preventDefault();
  el.closest('button, a, label, [role="button"], [role="tab"], [role="option"]')?.click();
}, { passive: false });

// ---------- Boot ----------

async function boot() {
  try {
    await S.load(() => toast('No se ha podido guardar. Comprueba el espacio libre del dispositivo.'));
    cloud.start();
  } catch (e) {
    console.error(e);
    view.append(h('div', { class: 'empty' }, h('p', null, 'No se puede abrir el almacenamiento del dispositivo. Si estás en navegación privada, sal de ella y vuelve a abrir Cuaderno.')));
    return;
  }
  navigator.storage?.persist?.();
  if (ls.get('side', '1') === '0') root.classList.add('side-closed');
  Object.assign(app, { refresh: () => render(), chrome, go, route });
  cloud.onStatus(() => { const el = sidebar.querySelector('.sync-label'); if (el) el.textContent = cloud.label(); else drawSidebar(); });
  addEventListener('hashchange', () => {
    const r = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home';
    if (r !== route()) go(r);
  });
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); finder(); }
  });
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
