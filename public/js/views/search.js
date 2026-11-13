import * as S from '../store.js';
import { h, topbar, empty } from '../ui.js';
import { col, plain, relDay } from '../util.js';

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
let lastQuery = '';

export function search(main) {
  const input = h('input', { type: 'search', placeholder: 'Buscar en apuntes, eventos y tareas', 'aria-label': 'Buscar', value: lastQuery, autocomplete: 'off' });
  const out = h('div', { class: 'rows' });

  const pages = S.all('page').filter(p => S.liveSubject(p.subjectId)).map(p => ({
    p, s: S.liveSubject(p.subjectId), body: (p.blocks || []).map(b => plain(b.html)).filter(Boolean).join(' · '),
  }));

  function run() {
    const q = norm(lastQuery = input.value.trim());
    out.replaceChildren();
    if (!q) { out.append(empty('Escribe para buscar en todo tu cuaderno.')); return; }
    const hits = [];
    for (const { p, s, body } of pages) {
      const inTitle = norm(p.title).includes(q), at = norm(body).indexOf(q);
      if (!inTitle && at < 0) continue;
      hits.push(h('a', { class: 'row', href: `#/subject/${s.id}/${p.id}`, style: `--c:${col(s.color)}` },
        h('span', { class: 'row-main' },
          h('span', { class: 'row-t' }, p.title || 'Sin título'),
          h('span', { class: 'muted' }, `${s.emoji} ${s.name}` + (at >= 0 ? ' — …' + body.slice(Math.max(0, at - 30), at + 70) + '…' : '')))));
    }
    for (const s of S.all('subject').filter(x => S.liveSubject(x.id) && norm(x.name).includes(q)))
      hits.push(h('a', { class: 'row', href: '#/subject/' + s.id }, h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, `${s.emoji} ${s.name}`), h('span', { class: 'muted' }, 'Asignatura'))));
    for (const e of S.all('event').filter(x => norm(x.title + ' ' + (x.notes || '')).includes(q)))
      hits.push(h('a', { class: 'row', href: '#/calendar' }, h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, e.title), h('span', { class: 'muted' }, 'Evento, ' + relDay(e.date)))));
    for (const t of S.all('task').filter(x => norm(x.title).includes(q)))
      hits.push(h('a', { class: 'row', href: '#/tasks' }, h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, t.title), h('span', { class: 'muted' }, t.done ? 'Tarea hecha' : 'Tarea pendiente'))));
    out.append(...(hits.length ? hits : [empty(`Nada coincide con «${input.value.trim()}».`)]));
  }

  input.addEventListener('input', run);
  main.append(h('div', { class: 'wrap' }, topbar('Buscar', { back: '#/home' }), h('div', { class: 'quick' }, input), out));
  run();
  input.focus();
}
