import * as S from '../store.js';
import { h, app, toast, viewHead } from '../ui.js';
import { ymd } from '../util.js';

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

export function settings(root) {
  const st = S.settings();
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: () => { if (file.files[0]) importBackup(file.files[0]); file.value = ''; } });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const sec = (title, ...kids) => h('section', { class: 'set-sec' }, h('h2', null, title), kids);

  root.classList.add('db');
  root.append(
    viewHead('⚙️', 'Ajustes'),
    !standalone && sec('Instalar en el iPhone o iPad',
      h('p', null, 'Abre esta página en Safari, pulsa Compartir y elige «Añadir a pantalla de inicio». Cuaderno se abrirá a pantalla completa y funcionará sin conexión.')),
    sec('Horario',
      h('label', { class: 'switch' },
        h('input', { type: 'checkbox', checked: st.weekend, onchange: e => { S.put({ ...st, weekend: e.target.checked }); } }),
        h('span', null, 'Mostrar sábado y domingo'))),
    sec('Copia de seguridad',
      h('p', null, 'Todo se guarda en este dispositivo. Guarda una copia en Archivos para no perder nada o para pasarlo a otro dispositivo. La sincronización en la nube llegará más adelante.'),
      h('div', { class: 'form-actions start' },
        h('button', { class: 'btn primary', type: 'button', onclick: exportBackup }, 'Guardar una copia'),
        h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Restaurar una copia'), file)));
}
