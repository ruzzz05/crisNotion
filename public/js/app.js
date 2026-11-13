import * as S from './store.js';
import { h, icon, app, toast } from './ui.js';
import { home } from './views/home.js';
import { books, book } from './views/books.js';
import { subject } from './views/subject.js';
import { timetable } from './views/timetable.js';
import { calendar } from './views/calendar.js';
import { tasks } from './views/tasks.js';
import { search } from './views/search.js';
import { settings } from './views/settings.js';

const routes = { home, books, book, subject, timetable, calendar, tasks, search, settings };
const TABS = [
  ['home', 'Inicio', 'home'], ['books', 'Libros', 'book'], ['timetable', 'Horario', 'grid'],
  ['calendar', 'Calendario', 'cal'], ['tasks', 'Tareas', 'tasks'],
];
const TAB_OF = { book: 'books', subject: 'books', search: 'home', settings: 'home' };

const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
let cleanup = null;
let lastRoute = '';

function render() {
  const [name = 'home', ...args] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const route = routes[name] ? name : 'home';
  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  const scroll = view.scrollTop;
  view.replaceChildren();
  cleanup = routes[route](view, ...args) || null;
  const key = route + '/' + (args[0] || '');
  view.scrollTop = key === lastRoute ? scroll : 0;
  lastRoute = key;
  const active = TAB_OF[route] || route;
  for (const a of tabs.children) a.classList.toggle('on', a.dataset.tab === active);
}

async function boot() {
  tabs.append(...TABS.map(([id, label, ic]) => h('a', { href: '#/' + id, 'data-tab': id, class: 'tab' }, icon(ic), h('span', null, label))));
  try {
    await S.load(() => toast('No se ha podido guardar. Comprueba el espacio libre del dispositivo.'));
  } catch (e) {
    console.error(e);
    view.append(h('div', { class: 'wrap' }, h('div', { class: 'empty' },
      h('p', null, 'No se puede abrir el almacenamiento del dispositivo. Si estás en navegación privada, sal de ella y vuelve a abrir Cuaderno.'))));
    return;
  }
  navigator.storage?.persist?.();
  app.refresh = render;
  addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
