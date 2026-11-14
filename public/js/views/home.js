import * as S from '../store.js';
import { h, icon, app, empty, modal, toast } from '../ui.js';
import { dow, fmtLong, greeting, mins, tint, ymd } from '../util.js';
import { eventRow, taskRow, eventForm, taskForm, subjectName, byDue, byDate } from '../parts.js';
import { nextSwap, photoIndex } from '../model.js';
import { shrink } from '../image.js';

const EVERY = [[1, 'Cada hora'], [3, 'Cada 3 horas'], [24, 'Una vez al día']];

/**
 * Photo frame: holds any number of photos and shows one, moving on to the next every hour, 3 hours or day.
 * Which photo is due depends only on the clock, so it is the same after closing and reopening the app.
 */
function photoWidget() {
  const el = h('section', { class: 'photo-widget', 'aria-label': 'Fotos' });
  let timer = 0, dead = false;
  const data = () => S.get('photos') || { id: 'photos', type: 'photos', items: [], every: 1 };
  const due = d => photoIndex(Date.now(), d.every, d.items.length, new Date().getTimezoneOffset());

  const input = h('input', {
    class: 'photo-widget-input', type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async () => {
      const files = [...input.files], d = data();
      input.value = '';
      for (const f of files) {
        try { d.items.push(await S.saveBlob(await shrink(f))); } catch (e) { console.error(e); toast('No se ha podido añadir una de las fotos.'); }
      }
      S.put(d);
      draw();
    },
  });
  const addBtn = (cls = 'tbtn') => h('button', { class: cls, type: 'button', onclick: () => input.click() }, icon('plus'), 'Añadir fotos');

  function manage() {
    modal('Fotos del widget', body => {
      const list = () => {
        const d = data(), now = d.items[due(d)];
        body.replaceChildren(
          d.items.length ? h('div', { class: 'photo-grid' }, d.items.map(id => {
            const img = h('img', { alt: 'Foto del widget' });
            S.blobURL(id).then(u => { if (u) img.src = u; });
            return h('div', { class: 'photo-thumb' + (id === now ? ' now' : '') }, img,
              h('button', {
                class: 'photo-del', type: 'button', 'aria-label': 'Quitar esta foto', title: 'Quitar esta foto', onclick: () => {
                  const cur = data();
                  cur.items = cur.items.filter(x => x !== id);
                  S.delBlob(id);
                  S.put(cur);
                  list();
                  draw();
                },
              }, icon('x')));
          })) : h('p', { class: 'muted' }, 'No quedan fotos.'),
          h('p', { class: 'muted' }, 'La foto con borde azul es la que se ve ahora.'));
      };
      list();
    });
  }

  function draw() {
    clearTimeout(timer);
    if (dead) return;
    const d = data(), i = due(d);
    if (i < 0) {
      el.replaceChildren(h('div', { class: 'photo-empty' }, h('p', null, 'Sube tus fotos y aquí verás una distinta cada cierto tiempo.'), addBtn('btn')), input);
      return;
    }
    const img = h('img', { class: 'photo-now', alt: 'Foto del momento', 'data-blob': d.items[i] });
    S.blobURL(d.items[i]).then(u => { if (u) img.src = u; });
    const every = h('select', {
      class: 'photo-every', 'aria-label': 'Cambiar de foto', value: String(d.every), onchange: () => {
        const cur = data();
        cur.every = Number(every.value);
        S.put(cur);
        draw();
      },
    }, EVERY.map(([v, label]) => h('option', { value: v }, label)));
    every.value = String(d.every);
    el.replaceChildren(
      h('div', { class: 'photo-frame' }, img),
      h('div', { class: 'photo-bar' },
        h('span', { class: 'photo-count' }, d.items.length === 1 ? '1 foto' : `${d.items.length} fotos`),
        every, addBtn(),
        h('button', { class: 'tbtn', type: 'button', onclick: manage }, icon('image'), 'Gestionar')),
      input);
    // Wake up when the next photo is due (setTimeout cannot wait longer than about 24 days).
    timer = setTimeout(draw, Math.min(nextSwap(Date.now(), d.every, new Date().getTimezoneOffset()) - Date.now() + 500, 2 ** 31 - 1));
  }

  // Timers pause while the app is in the background, so check again when it comes back.
  const onShow = () => { if (document.visibilityState === 'visible') draw(); };
  document.addEventListener('visibilitychange', onShow);
  draw();
  return { el, destroy() { dead = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onShow); } };
}

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

  const photos = photoWidget();
  root.classList.add('home');
  root.append(
    h('header', { class: 'home-hero' }, h('h1', null, greeting(now.getHours())), h('p', { class: 'muted' }, fmtLong(now))),
    photos.el,

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
  return photos.destroy;
}
