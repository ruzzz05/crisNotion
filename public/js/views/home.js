import * as S from '../store.js';
import { h, icon, iconBtn, nav, empty } from '../ui.js';
import { col, dow, fmtLong, mins, ymd } from '../util.js';
import { eventRow, taskRow, eventForm, taskForm, byDue, byDate } from '../parts.js';

const section = (title, action, ...kids) => h('section', { class: 'sec' },
  h('div', { class: 'sec-head' }, h('h2', null, title), action), kids);

export function home(main) {
  const now = new Date();
  const today = ymd(now);
  const nowM = now.getHours() * 60 + now.getMinutes();
  const classes = S.all('slot').filter(s => s.day === dow(now)).sort((a, b) => mins(a.start) - mins(b.start));
  const events = S.all('event').filter(e => e.date >= today).sort(byDate).slice(0, 5);
  const pending = S.all('task').filter(t => !t.done).sort(byDue).slice(0, 5);
  const pages = S.all('page').filter(p => S.liveSubject(p.subjectId));
  const favs = pages.filter(p => p.fav);
  const recent = [...pages].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const next = classes.find(c => mins(c.end) > nowM);

  const pageLink = p => {
    const s = S.liveSubject(p.subjectId);
    return h('a', { class: 'page-link', href: `#/subject/${s.id}/${p.id}`, style: `--c:${col(s.color)}` },
      h('span', { class: 'row-t' }, p.title || 'Sin título'),
      h('span', { class: 'muted' }, `${s.emoji} ${s.name}`));
  };

  main.append(h('div', { class: 'wrap' },
    h('header', { class: 'top hero' },
      h('div', { class: 'top-t' }, h('h1', null, fmtLong(now))),
      h('div', { class: 'top-a' },
        iconBtn('search', 'Buscar', () => nav('#/search')),
        iconBtn('gear', 'Ajustes', () => nav('#/settings')))),

    section('Clases de hoy', h('a', { class: 'link', href: '#/timetable' }, 'Ver horario'),
      classes.length
        ? h('div', { class: 'today' }, classes.map(c => {
          const s = S.liveSubject(c.subjectId);
          const past = mins(c.end) <= nowM;
          return h('div', { class: 'today-item' + (past ? ' past' : '') + (c === next ? ' next' : ''), style: `--c:${col(s?.color || 'slate')}` },
            h('span', { class: 'today-time' }, c.start),
            h('span', { class: 'row-t' }, s ? `${s.emoji} ${s.name}` : (c.title || 'Clase')),
            c.room && h('span', { class: 'muted' }, c.room));
        }))
        : empty(S.all('slot').length ? 'Hoy no tienes clases.' : 'Aún no tienes horario.',
          !S.all('slot').length && h('a', { class: 'btn', href: '#/timetable' }, 'Crear horario'))),

    section('Próximamente', h('button', { class: 'link', type: 'button', onclick: () => eventForm() }, 'Añadir evento'),
      events.length ? h('div', { class: 'rows' }, events.map(eventRow)) : empty('No hay exámenes ni entregas a la vista.')),

    section('Tareas pendientes', h('button', { class: 'link', type: 'button', onclick: () => taskForm() }, 'Añadir tarea'),
      pending.length ? h('div', { class: 'rows' }, pending.map(taskRow)) : empty('Nada pendiente.')),

    favs.length ? section('Favoritas', null, h('div', { class: 'page-links' }, favs.map(pageLink))) : null,

    section('Páginas recientes', null,
      recent.length ? h('div', { class: 'page-links' }, recent.map(pageLink))
        : empty('Tus apuntes aparecerán aquí.', h('a', { class: 'btn primary', href: '#/books' }, icon('book'), 'Ir a mis libros')))));
}
