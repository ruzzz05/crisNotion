import * as S from '../store.js';
import { h, icon, iconBtn, app, topbar, empty } from '../ui.js';
import { DAYS_SHORT, cap, col, dow, fmtLong, mins, parseYmd, ymd } from '../util.js';
import { KINDS, eventForm, eventRow, taskRow, byDate } from '../parts.js';

let month = null; // first day of the month on screen
let sel = null;   // selected day, yyyy-mm-dd

export function calendar(main) {
  const today = ymd(new Date());
  sel ??= today;
  month ??= new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const marks = {};
  const mark = (date, title, color) => (marks[date] ??= []).push({ title, color });
  const events = S.all('event').sort(byDate);
  const tasks = S.all('task').filter(t => t.due);
  for (const e of events) mark(e.date, e.title, col((KINDS[e.kind] || KINDS.evento)[1]));
  for (const t of tasks) if (!t.done) mark(t.due, t.title, col('slate'));

  const first = new Date(month);
  first.setDate(1 - dow(month));
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((dow(month) + daysInMonth) / 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const key = ymd(d);
    const list = marks[key] || [];
    cells.push(h('button', {
      type: 'button',
      class: 'cal-cell' + (d.getMonth() !== month.getMonth() ? ' out' : '') + (key === today ? ' today' : '') + (key === sel ? ' sel' : ''),
      'aria-label': fmtLong(d) + (list.length ? `, ${list.length} cosas` : ''),
      onclick: () => { sel = key; app.refresh(); },
    },
    h('span', { class: 'cal-num' }, d.getDate()),
    h('span', { class: 'cal-marks' }, list.slice(0, 3).map(m => h('span', { class: 'cal-mark', style: `--c:${m.color}` }, m.title)),
      list.length > 3 && h('span', { class: 'cal-more' }, '+' + (list.length - 3)))));
  }

  const shift = n => { month = new Date(month.getFullYear(), month.getMonth() + n, 1); app.refresh(); };
  const selDate = parseYmd(sel);
  const dayEvents = events.filter(e => e.date === sel);
  const dayTasks = tasks.filter(t => t.due === sel);
  const classes = S.all('slot').filter(s => s.day === dow(selDate)).sort((a, b) => mins(a.start) - mins(b.start));

  main.append(h('div', { class: 'wrap wide' },
    topbar(cap(month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })), {
      actions: [
        iconBtn('back', 'Mes anterior', () => shift(-1)),
        h('button', { class: 'btn', type: 'button', onclick: () => { month = null; sel = today; app.refresh(); } }, 'Hoy'),
        iconBtn('next', 'Mes siguiente', () => shift(1)),
      ],
    }),
    h('div', { class: 'cal-layout' },
      h('div', { class: 'cal' },
        DAYS_SHORT.map(d => h('div', { class: 'cal-dow' }, d)), cells),
      h('section', { class: 'day-panel' },
        h('div', { class: 'sec-head' },
          h('h2', null, fmtLong(selDate)),
          h('button', { class: 'btn primary', type: 'button', onclick: () => eventForm({ date: sel }) }, icon('plus'), 'Evento')),
        dayEvents.length || dayTasks.length
          ? h('div', { class: 'rows' }, dayEvents.map(eventRow), dayTasks.map(taskRow))
          : empty('Nada apuntado para este día.'),
        classes.length ? h('div', { class: 'day-classes' },
          h('h3', null, 'Clases'),
          classes.map(c => {
            const s = S.liveSubject(c.subjectId);
            return h('div', { class: 'today-item', style: `--c:${col(s?.color || 'slate')}` },
              h('span', { class: 'today-time' }, c.start),
              h('span', { class: 'row-t' }, s ? `${s.emoji} ${s.name}` : (c.title || 'Clase')),
              c.room && h('span', { class: 'muted' }, c.room));
          })) : null))));
}
