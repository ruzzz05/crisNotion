// The widgets of the home board. Each entry of WIDGETS draws one kind:
//   make(item, ctx) -> { el, destroy? }     item: its stored settings; ctx.save() stores them after a change.
// Sizes and limits are in board.js; the board itself (grid, moving, resizing) is in views/home.js.
import * as S from './store.js';
import { h, icon, app, empty, menu, modal, toast } from './ui.js';
import { dow, fmtLong, greeting, mins, sanitize, tint, ymd } from './util.js';
import { eventRow, taskRow, eventForm, taskForm, subjectName, byDue, byDate } from './parts.js';
import { nextSwap, photoIndex } from './model.js';
import { mmss, pomoDone, pomoLeft, pomoNext, pomoPause, pomoReset, pomoStart } from './board.js';
import { shrink } from './image.js';

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

// ---------- Built-in sections ----------

const section = (ic, title, action, ...kids) => h('section', { class: 'home-sec' },
  h('div', { class: 'home-sec-head' }, icon(ic), h('h2', null, title), action), h('div', { class: 'home-sec-body' }, kids));
const link = (label, fn) => h('button', { class: 'tbtn', type: 'button', onclick: fn }, label);

function hello() {
  const now = new Date();
  return { el: h('header', { class: 'home-hero' }, h('h1', null, greeting(now.getHours())), h('p', { class: 'muted' }, fmtLong(now))) };
}

function recent() {
  const pages = S.pages().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  return {
    el: section('doc', 'Visitadas recientemente', null,
      pages.length ? h('div', { class: 'cards' }, pages.map(p => h('button', { class: 'card', type: 'button', onclick: () => app.go('page/' + p.id) },
        h('span', { class: 'card-band' }), h('span', { class: 'card-icon' }, p.icon || icon('doc')),
        h('span', { class: 'card-title' }, p.title || 'Sin título'),
        h('span', { class: 'muted' }, S.get(p.bookId)?.name))))
        : empty(S.all('book').length ? 'Crea una página con el + que hay junto a cada libro.' : 'Empieza creando un libro en la barra lateral: agrupa las asignaturas de un curso.')),
  };
}

function classes() {
  const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
  const list = S.all('slot').filter(s => s.day === dow(now)).sort((a, b) => mins(a.start) - mins(b.start));
  const next = list.find(c => mins(c.end) > nowM);
  return {
    el: section('grid', 'Clases de hoy', link('Ver horario', () => app.go('timetable')),
      list.length ? h('div', { class: 'today' }, list.map(c => {
        const s = S.liveSubject(c.subjectId);
        return h('div', { class: 'today-item' + (mins(c.end) <= nowM ? ' past' : '') + (c === next ? ' next' : ''), style: tint(s?.color || 'gray') },
          h('span', { class: 'today-time' }, `${c.start} – ${c.end}`),
          h('span', { class: 'row-t' }, s ? subjectName(s) : (c.title || 'Clase')),
          c.room && h('span', { class: 'muted' }, c.room));
      })) : empty(S.all('slot').length ? 'Hoy no tienes clases.' : 'Aún no tienes horario.')),
  };
}

function events() {
  const list = S.all('event').filter(e => e.date >= ymd(new Date())).sort(byDate).slice(0, 8);
  return { el: section('cal', 'Próximos eventos', link('Nuevo evento', () => eventForm()), list.length ? h('div', { class: 'rows' }, list.map(eventRow)) : empty('No hay exámenes ni entregas a la vista.')) };
}

function tasks() {
  const list = S.all('task').filter(t => !t.done).sort(byDue).slice(0, 8);
  return { el: section('tasks', 'Tareas pendientes', link('Nueva tarea', () => taskForm()), list.length ? h('div', { class: 'rows' }, list.map(taskRow)) : empty('Nada pendiente.')) };
}

// ---------- Clock ----------

function clock() {
  const time = h('div', { class: 'clock-time' }), date = h('div', { class: 'clock-date' });
  const el = h('div', { class: 'w-card clock', role: 'timer', 'aria-label': 'Reloj' }, time, date);
  const draw = () => {
    const d = new Date();
    time.textContent = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    date.textContent = fmtLong(d);
  };
  draw();
  const timer = setInterval(draw, 1000);
  return { el, destroy: () => clearInterval(timer) };
}

// ---------- Pomodoro ----------

/** A short beep. Browsers only allow sound after the page has been touched, so it may stay silent. */
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
    osc.onended = () => ctx.close();
  } catch { /* no sound available */ }
}

function pomodoro(item, { save }) {
  item.work ??= 25; item.rest ??= 5; item.phase ??= 'work';
  const set = next => { Object.assign(item, next); save(); draw(); };
  const phase = h('div', { class: 'pomo-phase' }), time = h('div', { class: 'pomo-time', role: 'timer' }), count = h('div', { class: 'pomo-count muted' });
  const go = h('button', { class: 'btn primary pomo-go', type: 'button', onclick: () => set(item.endsAt ? pomoPause(item, Date.now()) : pomoStart(item, Date.now())) });
  const minutes = (key, label, options) => ({ label, sub: options.map(m => ({ label: `${m} minutos`, on: item[key] === m, fn: () => set({ ...pomoReset(item), [key]: m }) })) });
  const el = h('div', { class: 'w-card pomo' }, phase, time,
    h('div', { class: 'pomo-actions' }, go,
      h('button', { class: 'btn pomo-reset', type: 'button', onclick: () => set(pomoReset(item)) }, 'Reiniciar'),
      h('button', {
        class: 'ibtn pomo-set', type: 'button', 'aria-label': 'Duración', title: 'Duración',
        onclick: e => menu(e.currentTarget, [minutes('work', 'Concentración', [15, 20, 25, 30, 45, 50, 60]), minutes('rest', 'Descanso', [5, 10, 15, 20]),
          { sep: true }, { label: item.phase === 'rest' ? 'Pasar a concentración' : 'Pasar al descanso', icon: 'next', fn: () => set({ ...pomoNext(item, ymd(new Date())), count: item.count }) }]),
      }, icon('gear'))),
    count);
  function draw() {
    const now = Date.now();
    if (pomoDone(item, now)) {
      const worked = item.phase !== 'rest';
      Object.assign(item, pomoNext(item, ymd(new Date())));
      save();
      beep();
      toast(worked ? 'Tiempo de concentración terminado: toca descansar.' : 'Descanso terminado: a por otro.');
    }
    el.classList.toggle('rest', item.phase === 'rest');
    el.classList.toggle('running', !!item.endsAt);
    phase.textContent = item.phase === 'rest' ? 'Descanso' : 'Concentración';
    time.textContent = mmss(pomoLeft(item, now));
    go.textContent = item.endsAt ? 'Pausar' : 'Iniciar';
    const n = item.count?.day === ymd(new Date()) ? item.count.n : 0;
    count.textContent = n === 1 ? 'Hoy: 1 pomodoro' : `Hoy: ${n} pomodoros`;
  }
  draw();
  const timer = setInterval(() => { if (item.endsAt) draw(); }, 500);
  return { el, destroy: () => clearInterval(timer) };
}

// ---------- Text ----------

function text(item, { save }) {
  let timer = 0;
  const c = h('div', { class: 'w-text', contenteditable: 'true', 'data-ph': 'Escribe aquí…', html: sanitize(item.html || '') });
  const flush = () => { clearTimeout(timer); timer = 0; save(); };
  c.addEventListener('input', () => { if (c.innerHTML === '<br>') c.innerHTML = ''; item.html = c.innerHTML; clearTimeout(timer); timer = setTimeout(flush, 600); });
  c.addEventListener('blur', () => { if (timer) flush(); });
  c.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain') || ''); });
  return { el: h('div', { class: 'w-card note' }, c), destroy: () => { if (timer) flush(); } };
}

// ---------- Image ----------

function image(item) {
  const img = h('img', { class: 'w-img', alt: 'Imagen', draggable: 'false' });
  const el = h('div', { class: 'w-card picture' }, img);
  S.blobURL(item.blob).then(u => { if (u) img.src = u; else el.replaceChildren(h('p', { class: 'muted' }, 'Esta imagen no está en este dispositivo.')); });
  return { el };
}

export const WIDGETS = {
  hello: { name: 'Saludo y fecha', make: hello },
  photos: { name: 'Fotos que van cambiando', make: photoWidget },
  recent: { name: 'Visitadas recientemente', make: recent },
  classes: { name: 'Clases de hoy', make: classes },
  events: { name: 'Próximos eventos', make: events },
  tasks: { name: 'Tareas pendientes', make: tasks },
  clock: { name: 'Reloj', make: clock },
  pomodoro: { name: 'Pomodoro', make: pomodoro },
  text: { name: 'Texto', make: text },
  image: { name: 'Imagen', make: image },
};
