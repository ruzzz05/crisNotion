import * as S from '../store.js';
import { h, icon, iconBtn, app, viewHead } from '../ui.js';
import { DAYS, DAYS_SHORT, cap, dow, fmtLong, tint, ymd } from '../util.js';
import { KINDS, eventForm, taskForm, byDate } from '../parts.js';

let month = null; // first day of the month on screen

export function calendar(root) {
  const today = ymd(new Date());
  month ??= new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const marks = {};
  for (const e of S.all('event').sort(byDate)) (marks[e.date] ??= []).push({ label: (e.time ? e.time + ' ' : '') + e.title, color: (KINDS[e.kind] || KINDS.evento)[1], open: () => eventForm(e) });
  for (const t of S.all('task')) if (t.due && !t.done) (marks[t.due] ??= []).push({ label: '☐ ' + t.title, color: 'gray', open: () => taskForm(t) });

  const first = new Date(month);
  first.setDate(1 - dow(month));
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((dow(month) + daysInMonth) / 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const key = ymd(d);
    const list = marks[key] || [];
    const cell = h('div', {
      class: 'cal-cell' + (d.getMonth() !== month.getMonth() ? ' out' : '') + (key === today ? ' today' : '') + (i % 7 > 4 ? ' weekend' : ''),
      role: 'button', tabindex: '0', 'aria-label': `${fmtLong(d)}: añadir evento`,
      onclick: e => { if (!e.target.closest('.cal-ev')) eventForm({ date: key }); },
      onkeydown: e => { if (e.key === 'Enter' && e.target === cell) eventForm({ date: key }); },
    },
    h('span', { class: 'cal-num' }, d.getDate() === 1 ? `${d.getDate()} ${d.toLocaleDateString('es-ES', { month: 'short' })}` : d.getDate()),
    list.slice(0, 3).map(m => h('button', { class: 'cal-ev', type: 'button', style: tint(m.color), title: m.label, onclick: m.open }, m.label)),
    list.length > 3 && h('span', { class: 'cal-more' }, `+${list.length - 3} más`));
    cells.push(cell);
  }

  const shift = n => { month = new Date(month.getFullYear(), month.getMonth() + n, 1); app.refresh(); };

  root.classList.add('db');
  root.append(
    viewHead('📅', 'Calendario', [h('button', { class: 'btn primary', type: 'button', onclick: () => eventForm() }, icon('plus'), 'Nuevo')]),
    h('div', { class: 'cal-bar' },
      h('h2', null, cap(month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }))),
      h('div', { class: 'cal-nav' },
        iconBtn('back', 'Mes anterior', () => shift(-1)),
        h('button', { class: 'tbtn', type: 'button', onclick: () => { month = null; app.refresh(); } }, 'Hoy'),
        iconBtn('next', 'Mes siguiente', () => shift(1)))),
    h('div', { class: 'cal' },
      DAYS.map((d, i) => h('div', { class: 'cal-dow' }, h('span', { class: 'long' }, d.slice(0, 3)), h('span', { class: 'short' }, DAYS_SHORT[i]))),
      cells));
}
