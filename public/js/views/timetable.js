import * as S from '../store.js';
import { h, icon, openForm, viewHead } from '../ui.js';
import { DAYS, DAYS_SHORT, dow, hhmm, mins, tint } from '../util.js';
import { subjectOptions } from '../parts.js';

const HOUR = 60; // px per hour

function slotForm(slot = {}) {
  openForm(slot.id ? 'Editar clase' : 'Nueva clase', [
    { key: 'subjectId', label: 'Asignatura', type: 'select', value: slot.subjectId, options: subjectOptions('Otra cosa (escribe el nombre abajo)') },
    { key: 'title', label: 'Nombre, si no es una asignatura', value: slot.title, placeholder: 'Recreo, tutoría, entrenamiento…' },
    { key: 'day', label: 'Día', type: 'select', value: String(slot.day ?? 0), options: DAYS.map((d, i) => [String(i), d]) },
    { key: 'start', label: 'Empieza', type: 'time', required: true, value: slot.start || '08:30' },
    { key: 'end', label: 'Termina', type: 'time', required: true, value: slot.end || '09:25' },
    { key: 'room', label: 'Aula (opcional)', value: slot.room },
  ], {
    onSave: v => {
      if (!v.subjectId && !v.title) return 'Elige una asignatura o escribe un nombre.';
      if (mins(v.end) <= mins(v.start)) return 'La clase tiene que terminar después de empezar.';
      S.put({ ...slot, type: 'slot', ...v, day: Number(v.day) });
    },
    onDelete: slot.id && (() => S.remove(slot.id)),
    deleteText: '¿Quitar esta clase del horario?',
  });
}

export function timetable(root) {
  const st = S.settings();
  const slots = S.all('slot');
  const nDays = st.weekend || slots.some(s => s.day > 4) ? 7 : 5;
  const from = Math.floor(Math.min(8 * 60, ...slots.map(s => mins(s.start))) / 60) * 60;
  const to = Math.ceil(Math.max(15 * 60, ...slots.map(s => mins(s.end))) / 60) * 60;
  const y = m => (m - from) / 60 * HOUR;
  const now = new Date(), today = dow(now), nowM = now.getHours() * 60 + now.getMinutes();

  const hours = [];
  for (let m = from; m <= to; m += 60) hours.push(h('span', { class: 'tt-hour', style: `top:${y(m)}px` }, hhmm(m)));

  const cols = [];
  for (let d = 0; d < nDays; d++) {
    const colEl = h('div', {
      class: 'tt-col' + (d === today ? ' today' : ''),
      onclick: e => {
        if (e.target !== colEl) return;
        const start = Math.min(to - 30, from + Math.floor((e.clientY - colEl.getBoundingClientRect().top) / HOUR * 2) * 30);
        slotForm({ day: d, start: hhmm(start), end: hhmm(Math.min(to, start + 60)) });
      },
    }, slots.filter(s => s.day === d).map(s => {
      const sub = S.liveSubject(s.subjectId);
      const height = y(mins(s.end)) - y(mins(s.start));
      return h('button', {
        class: 'tt-slot' + (height < 42 ? ' short' : ''), type: 'button',
        style: `top:${y(mins(s.start))}px;height:${height}px;${tint(sub?.color || 'gray')}`,
        onclick: () => slotForm(s),
      },
      h('strong', null, sub ? sub.title || 'Sin título' : (s.title || 'Clase')),
      h('small', null, `${s.start}–${s.end}${s.room ? ' · ' + s.room : ''}`));
    }),
    d === today && nowM >= from && nowM <= to && h('div', { class: 'tt-now', style: `top:${y(nowM)}px` }));
    cols.push(colEl);
  }

  root.classList.add('db');
  root.append(
    viewHead(null, 'Horario', [h('button', { class: 'btn primary', type: 'button', onclick: () => slotForm({ day: today < nDays ? today : 0 }) }, icon('plus'), 'Clase')],
      slots.length ? null : 'Toca un hueco de la cuadrícula para añadir una clase.'),
    h('div', { class: 'tt', style: `--days:${nDays};--h:${y(to)}px;--hour:${HOUR}px` },
      h('div', { class: 'tt-corner' }),
      DAYS.slice(0, nDays).map((d, i) => h('div', { class: 'tt-day' + (i === today ? ' today' : '') },
        h('span', { class: 'long' }, d), h('span', { class: 'short' }, DAYS_SHORT[i]))),
      h('div', { class: 'tt-hours' }, hours),
      cols));
}
