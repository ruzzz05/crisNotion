import * as S from '../store.js';
import { h, icon, iconBtn, nav, app, menu, topbar, empty, toast, confirmDialog } from '../ui.js';
import { col } from '../util.js';
import { subjectForm } from './books.js';
import { mountEditor } from '../editor.js';

let focusTitleOf = null;

export function subject(main, sid, pid) {
  const s = S.liveSubject(sid);
  if (!s) { main.append(h('div', { class: 'wrap' }, topbar('Libros', { back: '#/books' }), empty('Esta asignatura ya no existe.'))); return; }
  const pages = S.pagesOf(sid);
  const key = 'cuaderno:last:' + sid;
  let last = null;
  try { last = localStorage.getItem(key); } catch { /* storage blocked */ }
  const page = pages.find(p => p.id === pid) || pages.find(p => p.id === last) || pages[0];
  if (page) try { localStorage.setItem(key, page.id); } catch { /* storage blocked */ }
  const go = p => nav(`#/subject/${sid}/${p.id}`, true);

  const newPage = () => {
    const p = S.put({ type: 'page', subjectId: sid, title: '', blocks: [] });
    focusTitleOf = p.id;
    go(p);
  };

  const swap = dir => {
    const i = pages.indexOf(page), other = pages[i + dir];
    if (!other) return;
    [page.order, other.order] = [other.order, page.order];
    S.put(page); S.put(other); app.refresh();
  };

  const tabs = h('div', { class: 'ptabs', role: 'tablist' },
    pages.map(p => h('a', {
      class: 'ptab' + (p === page ? ' on' : ''), role: 'tab', href: `#/subject/${sid}/${p.id}`, 'data-id': p.id,
      onclick: e => { e.preventDefault(); if (p !== page) go(p); },
    }, p.title || 'Sin título')),
    h('button', { class: 'ptab add', type: 'button', 'aria-label': 'Nueva página', onclick: newPage }, icon('plus')));

  const wrap = h('div', { class: 'wrap subject-view', style: `--c:${col(s.color)}` },
    topbar(`${s.emoji} ${s.name}`, { back: '#/book/' + s.bookId, actions: [iconBtn('more', 'Editar asignatura', () => subjectForm(s))] }),
    tabs);
  main.append(wrap);

  if (!page) {
    wrap.append(empty('Cada página es una pestaña: apuntes, ejercicios, resúmenes…',
      h('button', { class: 'btn primary', type: 'button', onclick: newPage }, 'Crear la primera página')));
    return;
  }

  const star = iconBtn('star', 'Favorita', () => { page.fav = !page.fav; S.put(page); star.classList.toggle('on', !!page.fav); }, page.fav ? 'star on' : 'star');
  const paper = h('article', { class: 'paper' });
  wrap.append(h('div', { class: 'page-actions' }, star,
    iconBtn('more', 'Opciones de la página', () => menu(page.title || 'Sin título', [
      pages.indexOf(page) > 0 && { label: 'Mover la pestaña a la izquierda', icon: 'back', fn: () => swap(-1) },
      pages.indexOf(page) < pages.length - 1 && { label: 'Mover la pestaña a la derecha', icon: 'next', fn: () => swap(1) },
      {
        label: 'Eliminar página', icon: 'x', danger: true, fn: async () => {
          if (!await confirmDialog('¿Enviar esta página a la papelera?')) return;
          S.trash(page.id); toast('Página enviada a la papelera'); nav('#/subject/' + sid, true); app.refresh();
        },
      },
    ]))), paper);

  const tab = tabs.querySelector(`[data-id="${page.id}"]`);
  tab.scrollIntoView({ block: 'nearest', inline: 'center' });
  const editor = mountEditor(paper, page, title => { tab.textContent = title || 'Sin título'; });
  if (focusTitleOf === page.id) { focusTitleOf = null; paper.querySelector('.page-title').focus(); }
  return editor.destroy;
}
