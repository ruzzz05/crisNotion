// Pieces shared by several views: event and task rows and their forms.
import * as S from './store.js';
import { h, icon, app, openForm, modal, empty } from './ui.js';
import { mergeKinds } from './model.js';
import { COLORS, COLOR_NAMES, relDay, tint, ymd } from './util.js';

export const KINDS = { examen: ['Examen', 'red'], entrega: ['Entrega', 'orange'], evento: ['Evento', 'blue'], festivo: ['Festivo', 'orange'] };
/** Built-in kinds plus the user's own, as {id: [name, colour]}. */
export const kinds = () => mergeKinds(KINDS, S.all('evkind'));
/** The colour a holiday gives its whole day: the one chosen in its form, light orange at first. */
export const dayColor = e => (COLORS.includes(e.dayColor) ? e.dayColor : 'orange');

export const subjectName = s => `${s.icon ? s.icon + ' ' : ''}${s.title || 'Sin título'}`;

/** Subjects are the top-level pages of each book. */
export function subjectOptions(none = 'Sin asignatura') {
  const out = [['', none]];
  for (const b of S.all('book')) for (const s of S.children({ bookId: b.id })) out.push([s.id, subjectName(s)]);
  return out;
}

export function subjectTag(id) {
  const s = S.liveSubject(id);
  return s && h('span', { class: 'tag', style: tint(s.color) }, subjectName(s));
}

export function eventForm(ev = {}) {
  openForm(ev.id ? 'Editar evento' : 'Nuevo evento', [
    { key: 'title', label: 'Título', required: true, value: ev.title, placeholder: 'Examen del tema 4' },
    { key: 'kind', label: 'Tipo', type: 'select', value: kinds()[ev.kind] ? ev.kind : (ev.kind ? 'evento' : 'examen'), options: Object.entries(kinds()).map(([k, v]) => [k, v[0]]) },
    { key: 'date', label: 'Fecha', type: 'date', required: true, value: ev.date || ymd(new Date()) },
    { key: 'dayColor', label: 'Color del día', type: 'select', value: dayColor(ev), options: COLORS.map(c => [c, COLOR_NAMES[c].replace(/^./, x => x.toUpperCase())]), when: v => v.kind === 'festivo' },
    { key: 'endDate', label: 'Hasta el (opcional, para varios días)', type: 'date', value: ev.endDate },
    { key: 'time', label: 'Hora (opcional)', type: 'time', value: ev.time, when: v => v.kind !== 'festivo' },
    { key: 'subjectId', label: 'Asignatura', type: 'select', value: ev.subjectId, options: subjectOptions(), when: v => v.kind !== 'festivo' },
    { key: 'notes', label: 'Notas', type: 'textarea', value: ev.notes },
  ], {
    focus: !ev.id,
    onSave: v => {
      if (v.endDate && v.endDate < v.date) return 'La fecha final no puede ser anterior a la inicial.';
      if (!v.endDate) delete ev.endDate;
      S.put({ ...ev, type: 'event', ...v });
    },
    onDelete: ev.id && (() => S.remove(ev.id)),
    deleteText: '¿Eliminar este evento?',
  });
}

export function taskForm(t = {}) {
  openForm(t.id ? 'Editar tarea' : 'Nueva tarea', [
    { key: 'title', label: 'Tarea', required: true, value: t.title, placeholder: 'Ejercicios 3 y 4 de la página 52' },
    { key: 'due', label: 'Para el día (opcional)', type: 'date', value: t.due },
    { key: 'subjectId', label: 'Asignatura', type: 'select', value: t.subjectId, options: subjectOptions() },
    { key: 'listId', label: 'Categoría', type: 'select', value: S.get(t.listId)?.type === 'tasklist' ? t.listId : '', options: [['', 'Sin categoría'], ...S.all('tasklist').map(l => [l.id, l.name])] },
  ], {
    focus: !t.id,
    onSave: v => { S.put({ done: false, ...t, type: 'task', ...v }); },
    onDelete: t.id && (() => S.remove(t.id)),
    deleteText: '¿Eliminar esta tarea?',
  });
}

export function eventRow(e) {
  const [label, color] = kinds()[e.kind] || KINDS.evento;
  return h('button', { class: 'row', type: 'button', onclick: () => eventForm(e) },
    h('span', { class: 'row-date' }, relDay(e.date), e.time && h('small', null, e.time)),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-t' }, e.title),
      h('span', { class: 'row-meta' }, h('span', { class: 'tag', style: tint(color) }, label), subjectTag(e.subjectId))));
}

/** `drag(event, task)` makes the row draggable by a handle (the tasks view); other places show plain rows. */
export function taskRow(t, drag) {
  const late = !t.done && t.due && t.due < ymd(new Date());
  return h('div', { class: 'row task' + (t.done ? ' done' : ''), 'data-task': t.id },
    drag && h('button', { class: 'g-drag task-drag', type: 'button', 'aria-label': 'Arrastra para mover', title: 'Arrastra para mover', onpointerdown: e => drag(e, t) }, icon('handle')),
    h('button', {
      class: 'todo-box', type: 'button', 'aria-label': t.done ? 'Marcar como pendiente' : 'Marcar como hecha',
      onclick: () => { t.done = !t.done; S.put(t); app.refresh(); },
    }, icon('check')),
    h('button', { class: 'row-main', type: 'button', onclick: () => taskForm(t) },
      h('span', { class: 'row-t' }, t.title),
      (t.due || S.liveSubject(t.subjectId)) && h('span', { class: 'row-meta' },
        t.due && h('span', { class: 'due' + (late ? ' late' : '') }, relDay(t.due)), subjectTag(t.subjectId))));
}

export const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.order - b.order;
export const byDate = (a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');

/** Name + colour form shared by event kinds and task lists. `type` is the doc type they are stored as. */
export function labelForm(type, noun, item = {}) {
  openForm(item.id ? 'Editar ' + noun : 'Nuevo ' + noun, [
    { key: 'name', label: 'Nombre', required: true, value: item.name, placeholder: noun === 'tipo' ? 'Gimnasio' : 'Casa' },
    { key: 'color', label: 'Color', type: 'select', value: COLORS.includes(item.color) ? item.color : 'blue', options: COLORS.map(c => [c, COLOR_NAMES[c].replace(/^./, x => x.toUpperCase())]) },
  ], {
    focus: !item.id,
    onSave: v => { S.put({ ...item, type, ...v }); },
    onDelete: item.id && (() => S.remove(item.id)),
    deleteText: '¿Eliminar este ' + noun + '? Lo que lo use pasará a no tener ninguno.',
  });
}

/** Dialog listing the user's own event kinds, to add, edit or remove them. */
export function kindsManager() {
  modal('Tipos de evento', (body, close) => {
    const list = S.all('evkind');
    body.append(
      list.length ? h('div', { class: 'rows' }, list.map(k => h('button', { class: 'row', type: 'button', onclick: () => { close(); labelForm('evkind', 'tipo', k); } },
        h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, h('span', { class: 'tag', style: tint(k.color) }, k.name))))))
        : empty('Aún no tienes tipos propios. Examen, Entrega, Evento y Festivo ya vienen incluidos.'),
      h('div', { class: 'form-actions start' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { close(); labelForm('evkind', 'tipo'); } }, icon('plus'), 'Nuevo tipo')));
  });
}
