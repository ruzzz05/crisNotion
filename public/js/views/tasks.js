import * as S from '../store.js';
import { h, icon, app, empty, confirmDialog, viewHead } from '../ui.js';
import { taskRow, taskForm, labelForm } from '../parts.js';
import { groupTasks, placeAt } from '../model.js';
import { tint } from '../util.js';

/** Drop `task` where the pointer was released: renumbers the tasks of the group it lands in. */
function drop(task, x, y) {
  const el = document.elementFromPoint(x, y);
  const zone = el?.closest('[data-group]');
  if (!zone) return false;
  const listId = zone.dataset.group || null;
  const rows = [...zone.querySelectorAll('[data-task]')].filter(r => r.dataset.task !== task.id);
  let at = rows.findIndex(r => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
  if (at < 0) at = rows.length;
  const items = rows.map(r => S.get(r.dataset.task));
  placeAt(items, task, at).forEach((t, i) => { t.order = i; if (listId) t.listId = listId; else delete t.listId; S.put(t); });
  return true;
}

function startDrag(e, task) {
  if (e.button > 0) return;
  e.preventDefault();
  const row = e.target.closest('[data-task]');
  row.classList.add('dragging');
  let hover = null;
  const mark = el => { hover?.classList.remove('drop'); hover = el; hover?.classList.add('drop'); };
  const move = ev => mark(document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-group]'));
  const end = ev => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
    mark(null); row.classList.remove('dragging');
    if (ev.type === 'pointerup' && drop(task, ev.clientX, ev.clientY)) app.refresh();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
}

export function tasks(root) {
  const all = S.all('task');
  const lists = S.all('tasklist');
  const groups = groupTasks(all.filter(t => !t.done), lists);
  const done = all.filter(t => t.done).sort((a, b) => b.updatedAt - a.updatedAt);

  const input = h('input', { type: 'text', placeholder: 'Escribe una tarea y pulsa Intro', 'aria-label': 'Nueva tarea', autocomplete: 'off', enterkeyhint: 'done' });
  const quick = h('form', {
    class: 'quick', onsubmit: e => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      S.put({ type: 'task', title, done: false });
      app.refresh();
      document.querySelector('.quick input')?.focus();
    },
  }, icon('plus'), input);

  const section = ({ list, tasks }) => h('section', { class: 'task-group', 'data-group': list?.id ?? '' },
    (list || lists.length > 0) && h('div', { class: 'group-head' },
      list ? h('button', { class: 'tag', type: 'button', style: tint(list.color), title: 'Editar categoría', onclick: () => labelForm('tasklist', 'categoría', list) }, list.name)
        : h('span', { class: 'muted' }, 'Sin categoría')),
    h('div', { class: 'rows' }, tasks.map(t => taskRow(t, startDrag))),
    !tasks.length && lists.length > 0 && h('p', { class: 'group-empty muted' }, 'Arrastra tareas aquí'));

  root.classList.add('db');
  root.append(
    viewHead(null, 'Tareas', [
      h('button', { class: 'btn', type: 'button', onclick: () => labelForm('tasklist', 'categoría') }, 'Categoría'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => taskForm() }, icon('plus'), 'Nueva'),
    ]),
    quick,
    groups.some(g => g.tasks.length) || lists.length ? h('div', { class: 'task-groups' }, groups.filter(g => g.list || g.tasks.length || lists.length).map(section))
      : empty(all.length ? 'Todo hecho.' : 'Apunta aquí deberes y cosas por hacer. Toca una tarea para ponerle fecha o asignatura.'),
    done.length ? h('details', { class: 'done-list' },
      h('summary', null, `Hechas (${done.length})`),
      h('div', { class: 'rows' }, done.map(t => taskRow(t))),
      h('button', {
        class: 'btn danger', type: 'button', onclick: async () => {
          if (!await confirmDialog('¿Borrar todas las tareas hechas?', 'Borrar')) return;
          for (const t of done) S.remove(t.id);
          app.refresh();
        },
      }, 'Borrar las hechas')) : null);
}
