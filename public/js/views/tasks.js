import * as S from '../store.js';
import { h, icon, app, empty, confirmDialog, viewHead } from '../ui.js';
import { taskRow, taskForm, byDue } from '../parts.js';

export function tasks(root) {
  const all = S.all('task');
  const pending = all.filter(t => !t.done).sort(byDue);
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

  root.classList.add('db');
  root.append(
    viewHead('✅', 'Tareas', [h('button', { class: 'btn primary', type: 'button', onclick: () => taskForm() }, icon('plus'), 'Nueva')]),
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
      }, 'Borrar las hechas')) : null);
}
