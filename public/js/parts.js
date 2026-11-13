// Pieces shared by several views: event and task rows and their forms.
import * as S from './store.js';
import { h, icon, app, openForm } from './ui.js';
import { relDay, tint, ymd } from './util.js';

export const KINDS = { examen: ['Examen', 'red'], entrega: ['Entrega', 'orange'], evento: ['Evento', 'blue'] };

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
    { key: 'kind', label: 'Tipo', type: 'select', value: ev.kind || 'examen', options: Object.entries(KINDS).map(([k, v]) => [k, v[0]]) },
    { key: 'date', label: 'Fecha', type: 'date', required: true, value: ev.date || ymd(new Date()) },
    { key: 'time', label: 'Hora (opcional)', type: 'time', value: ev.time },
    { key: 'subjectId', label: 'Asignatura', type: 'select', value: ev.subjectId, options: subjectOptions() },
    { key: 'notes', label: 'Notas', type: 'textarea', value: ev.notes },
  ], {
    focus: !ev.id,
    onSave: v => { S.put({ ...ev, type: 'event', ...v }); },
    onDelete: ev.id && (() => S.remove(ev.id)),
    deleteText: '¿Eliminar este evento?',
  });
}

export function taskForm(t = {}) {
  openForm(t.id ? 'Editar tarea' : 'Nueva tarea', [
    { key: 'title', label: 'Tarea', required: true, value: t.title, placeholder: 'Ejercicios 3 y 4 de la página 52' },
    { key: 'due', label: 'Para el día (opcional)', type: 'date', value: t.due },
    { key: 'subjectId', label: 'Asignatura', type: 'select', value: t.subjectId, options: subjectOptions() },
  ], {
    focus: !t.id,
    onSave: v => { S.put({ done: false, ...t, type: 'task', ...v }); },
    onDelete: t.id && (() => S.remove(t.id)),
    deleteText: '¿Eliminar esta tarea?',
  });
}

export function eventRow(e) {
  const [label, color] = KINDS[e.kind] || KINDS.evento;
  return h('button', { class: 'row', type: 'button', onclick: () => eventForm(e) },
    h('span', { class: 'row-date' }, relDay(e.date), e.time && h('small', null, e.time)),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-t' }, e.title),
      h('span', { class: 'row-meta' }, h('span', { class: 'tag', style: tint(color) }, label), subjectTag(e.subjectId))));
}

export function taskRow(t) {
  const late = !t.done && t.due && t.due < ymd(new Date());
  return h('div', { class: 'row task' + (t.done ? ' done' : '') },
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
