import * as S from '../store.js';
import { h, icon, iconBtn, nav, openForm, topbar, empty, toast } from '../ui.js';
import { col } from '../util.js';

export function bookForm(b = {}) {
  openForm(b.id ? 'Editar libro' : 'Nuevo libro', [
    { key: 'name', label: 'Nombre', required: true, value: b.name, placeholder: '2.º de Bachillerato' },
    { key: 'emoji', label: 'Icono', type: 'emoji', value: b.emoji || '📘' },
    { key: 'color', label: 'Color', type: 'color', value: b.color || 'blue' },
  ], {
    focus: !b.id,
    onSave: v => { S.put({ ...b, type: 'book', ...v }); },
    onDelete: b.id && (() => { S.trash(b.id); nav('#/books'); toast('Libro enviado a la papelera'); }),
    deleteText: `¿Enviar «${b.name}» y sus asignaturas a la papelera?`,
  });
}

export function subjectForm(s = {}, bookId = s.bookId) {
  openForm(s.id ? 'Editar asignatura' : 'Nueva asignatura', [
    { key: 'name', label: 'Nombre', required: true, value: s.name, placeholder: 'Matemáticas' },
    { key: 'emoji', label: 'Icono', type: 'emoji', value: s.emoji || '📐' },
    { key: 'color', label: 'Color', type: 'color', value: s.color || 'blue' },
  ], {
    focus: !s.id,
    onSave: v => { S.put({ ...s, type: 'subject', bookId, ...v }); },
    onDelete: s.id && (() => { S.trash(s.id); nav('#/book/' + bookId); toast('Asignatura enviada a la papelera'); }),
    deleteText: `¿Enviar «${s.name}» y sus páginas a la papelera?`,
  });
}

export function books(main) {
  const list = S.all('book');
  main.append(h('div', { class: 'wrap' },
    topbar('Libros', { actions: [h('button', { class: 'btn primary', type: 'button', onclick: () => bookForm() }, icon('plus'), 'Nuevo libro')] }),
    list.length
      ? h('div', { class: 'shelf' }, list.map(b => {
        const n = S.subjectsOf(b.id).length;
        return h('a', { class: 'cover', href: '#/book/' + b.id, style: `--c:${col(b.color)}` },
          h('span', { class: 'cover-emoji' }, b.emoji),
          h('span', { class: 'cover-label' },
            h('strong', null, b.name),
            h('small', null, n === 1 ? '1 asignatura' : `${n} asignaturas`)));
      }))
      : empty('Un libro agrupa asignaturas: por ejemplo, uno por curso o por trimestre.',
        h('button', { class: 'btn primary', type: 'button', onclick: () => bookForm() }, 'Crear mi primer libro'))));
}

export function book(main, id) {
  const b = S.liveBook(id);
  if (!b) { main.append(h('div', { class: 'wrap' }, topbar('Libros', { back: '#/books' }), empty('Este libro ya no existe.'))); return; }
  const subs = S.subjectsOf(id);
  main.append(h('div', { class: 'wrap', style: `--c:${col(b.color)}` },
    topbar(`${b.emoji} ${b.name}`, {
      back: '#/books',
      actions: [iconBtn('more', 'Editar libro', () => bookForm(b)),
        h('button', { class: 'btn primary', type: 'button', onclick: () => subjectForm({}, id) }, icon('plus'), 'Asignatura')],
    }),
    subs.length
      ? h('div', { class: 'subjects' }, subs.map(s => {
        const n = S.pagesOf(s.id).length;
        return h('a', { class: 'subject', href: '#/subject/' + s.id, style: `--c:${col(s.color)}` },
          h('span', { class: 'subject-emoji' }, s.emoji),
          h('span', { class: 'row-main' },
            h('span', { class: 'row-t' }, s.name),
            h('span', { class: 'muted' }, n === 1 ? '1 página' : `${n} páginas`)),
          icon('next'));
      }))
      : empty('Este libro está vacío. Añade las asignaturas que vayas a tener.',
        h('button', { class: 'btn primary', type: 'button', onclick: () => subjectForm({}, id) }, 'Añadir asignatura'))));
}
