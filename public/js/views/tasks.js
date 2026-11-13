import * as S from '../store.js';
import { h, icon, app, topbar, empty, confirmDialog } from '../ui.js';
import { taskRow, taskForm, byDue } from '../parts.js';

export function tasks(main) {
  const all = S.all('task');
  const pending = all.filter(t => !t.done).sort(byDue);
  const done = all.filter(t => t.done).sort((a, b) => b.updatedAt - a.updatedAt);

  const input = h('input', { type: 'text', placeholder: 'Añadir una tarea y pulsar Intro', 'aria-label': 'Nueva tarea', autocomplete: 'off', enterkeyhint: 'done' });
  const quick = h('form', {
    class: 'quick', onsubmit: e => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      S.put({ type: 'task', title, done: false });
      app.refresh();
      document.querySelector('.quick input')?.focus();
    },
  }, input, h('button', { class: 'btn primary', 'aria-label': 'Añadir tarea' }, icon('plus')));

  main.append(h('div', { class: 'wrap' },
    topbar('Tareas', { actions: [h('button', { class: 'btn', type: 'button', onclick: () => taskForm() }, 'Con fecha')] }),
    quick,
    pending.length ? h('div', { class: 'rows' }, pending.map(taskRow))
      : empty(all.length ? 'Todo hecho.' : 'Apunta aquí deberes y cosas por hacer. Toca una tarea para ponerle fecha o asignatura.'),
    done.length ? h('details', { class: 'done-list' },
      h('summary', null, `Hechas (${done.length})`),
      h('div', { class: 'rows' }, done.map(taskRow)),
      h('button', {
        class: 'btn danger', type: 'button', onclick: async () => {
          if (!await confirmDialog('¿Borrar todas las tareas hechas?', 'Borrar')) return;
          for (const t of done) S.remove(t.id);
          app.refresh();
        },
      }, 'Borrar las hechas')) : null));
}
