import * as S from '../store.js';
import { h, app, topbar, toast, confirmDialog } from '../ui.js';
import { ymd } from '../util.js';

const KIND = { book: 'Libro', subject: 'Asignatura', page: 'Página' };

async function exportBackup() {
  try {
    const blob = new Blob([JSON.stringify(await S.exportAll())], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `cuaderno-${ymd(new Date())}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) {
    console.error(e);
    toast('No se ha podido crear la copia.');
  }
}

async function importBackup(file) {
  try {
    await S.importAll(JSON.parse(await file.text()));
    toast('Copia restaurada');
    app.refresh();
  } catch (e) {
    console.error(e);
    toast(e.message?.startsWith('El archivo') ? e.message : 'No se ha podido leer ese archivo.');
  }
}

export function settings(main) {
  const st = S.settings();
  const trashed = ['book', 'subject', 'page'].flatMap(t => S.all(t, true).filter(d => d.deleted));
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: () => { if (file.files[0]) importBackup(file.files[0]); file.value = ''; } });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  main.append(h('div', { class: 'wrap' },
    topbar('Ajustes', { back: '#/home' }),

    !standalone && h('section', { class: 'sec card' },
      h('h2', null, 'Instalar en el iPhone o iPad'),
      h('p', null, 'Abre esta página en Safari, pulsa Compartir y elige «Añadir a pantalla de inicio». Cuaderno se abrirá a pantalla completa y funcionará sin conexión.')),

    h('section', { class: 'sec card' },
      h('h2', null, 'Horario'),
      h('label', { class: 'switch' },
        h('input', { type: 'checkbox', checked: st.weekend, onchange: e => { S.put({ ...st, weekend: e.target.checked }); } }),
        h('span', null, 'Mostrar sábado y domingo'))),

    h('section', { class: 'sec card' },
      h('h2', null, 'Copia de seguridad'),
      h('p', null, 'Todo se guarda en este dispositivo. Guarda una copia en Archivos para no perder nada o para pasarlo a otro dispositivo. La sincronización en la nube llegará más adelante.'),
      h('div', { class: 'form-actions start' },
        h('button', { class: 'btn primary', type: 'button', onclick: exportBackup }, 'Guardar una copia'),
        h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Restaurar una copia'), file)),

    h('section', { class: 'sec card' },
      h('h2', null, 'Papelera'),
      trashed.length ? h('div', { class: 'rows' }, trashed.map(d => h('div', { class: 'row' },
        h('span', { class: 'row-main' },
          h('span', { class: 'row-t' }, d.name || d.title || 'Sin título'),
          h('span', { class: 'muted' }, KIND[d.type])),
        h('button', { class: 'btn', type: 'button', onclick: () => { S.restore(d.id); toast('Restaurado'); app.refresh(); } }, 'Restaurar'),
        h('button', {
          class: 'btn danger', type: 'button', onclick: async () => {
            if (!await confirmDialog('Se borrará para siempre, con todo lo que contiene.', 'Borrar para siempre')) return;
            S.purge(d.id); app.refresh();
          },
        }, 'Borrar'))))
        : h('p', { class: 'muted' }, 'La papelera está vacía.'))));
}
