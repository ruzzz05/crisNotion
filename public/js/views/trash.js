import * as S from '../store.js';
import { h, icon, app, empty, confirmDialog, toast, viewHead } from '../ui.js';

export function trash(root) {
  const items = [...S.all('book', true), ...S.all('page', true)].filter(d => d.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
  root.classList.add('db');
  root.append(
    viewHead('🗑️', 'Papelera', [], 'Lo que elimines se queda aquí hasta que lo borres para siempre.'),
    items.length ? h('div', { class: 'rows' }, items.map(d => h('div', { class: 'row' },
      h('span', { class: 'tree-icon' }, d.type === 'book' ? icon('book') : d.icon || icon('doc')),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-t' }, d.name || d.title || 'Sin título'),
        h('span', { class: 'muted' }, d.type === 'book' ? 'Libro' : 'Página de ' + (S.get(d.bookId)?.name || 'un libro eliminado'))),
      h('button', { class: 'btn', type: 'button', onclick: () => { S.restore(d.id); toast('Restaurado'); app.refresh(); } }, 'Restaurar'),
      h('button', {
        class: 'btn danger', type: 'button', onclick: async () => {
          if (!await confirmDialog('Se borrará para siempre, con todo lo que contiene.', 'Borrar para siempre')) return;
          S.purge(d.id); app.refresh();
        },
      }, 'Borrar'))))
      : empty('La papelera está vacía.'));
}
