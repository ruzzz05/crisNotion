import * as S from '../store.js';
import { h, icon, app, empty } from '../ui.js';
import { dow, fmtLong, greeting, mins, tint, ymd } from '../util.js';
import { eventRow, taskRow, eventForm, taskForm, subjectName, byDue, byDate } from '../parts.js';

const section = (ic, title, action, ...kids) => h('section', { class: 'home-sec' },
  h('div', { class: 'home-sec-head' }, icon(ic), h('h2', null, title), action), kids);

export function home(root) {
  const now = new Date(), today = ymd(now), nowM = now.getHours() * 60 + now.getMinutes();
  const classes = S.all('slot').filter(s => s.day === dow(now)).sort((a, b) => mins(a.start) - mins(b.start));
  const events = S.all('event').filter(e => e.date >= today).sort(byDate).slice(0, 5);
  const pending = S.all('task').filter(t => !t.done).sort(byDue).slice(0, 5);
  const recent = S.pages().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  const next = classes.find(c => mins(c.end) > nowM);
  const link = (label, fn) => h('button', { class: 'tbtn', type: 'button', onclick: fn }, label);

  root.classList.add('home');
  root.append(
    h('header', { class: 'home-hero' }, h('h1', null, greeting(now.getHours())), h('p', { class: 'muted' }, fmtLong(now))),

    section('doc', 'Visitadas recientemente', null,
      recent.length ? h('div', { class: 'cards' }, recent.map(p => h('button', { class: 'card', type: 'button', onclick: () => app.go('page/' + p.id) },
        h('span', { class: 'card-band' }), h('span', { class: 'card-icon' }, p.icon || icon('doc')),
        h('span', { class: 'card-title' }, p.title || 'Sin título'),
        h('span', { class: 'muted' }, S.get(p.bookId)?.name))))
        : empty(S.all('book').length ? 'Crea una página con el + que hay junto a cada libro.' : 'Empieza creando un libro en la barra lateral: agrupa las asignaturas de un curso.')),

    section('grid', 'Clases de hoy', link('Ver horario', () => app.go('timetable')),
      classes.length ? h('div', { class: 'today' }, classes.map(c => {
        const s = S.liveSubject(c.subjectId);
        return h('div', { class: 'today-item' + (mins(c.end) <= nowM ? ' past' : '') + (c === next ? ' next' : ''), style: tint(s?.color || 'gray') },
          h('span', { class: 'today-time' }, `${c.start} – ${c.end}`),
          h('span', { class: 'row-t' }, s ? subjectName(s) : (c.title || 'Clase')),
          c.room && h('span', { class: 'muted' }, c.room));
      })) : empty(S.all('slot').length ? 'Hoy no tienes clases.' : 'Aún no tienes horario.')),

    section('cal', 'Próximos eventos', link('Nuevo evento', () => eventForm()),
      events.length ? h('div', { class: 'rows' }, events.map(eventRow)) : empty('No hay exámenes ni entregas a la vista.')),

    section('tasks', 'Tareas pendientes', link('Nueva tarea', () => taskForm()),
      pending.length ? h('div', { class: 'rows' }, pending.map(taskRow)) : empty('Nada pendiente.')));
}
