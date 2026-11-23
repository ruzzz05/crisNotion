import * as S from '../store.js';
import { h, app, toast, viewHead } from '../ui.js';
import { ymd } from '../util.js';
import { THEMES } from '../model.js';
import { FONTS, THEME_NAMES, getFont, getTheme, setFont, setTheme } from '../theme.js';
import { download, importFile } from '../transfer.js';
import { cloud } from '../cloud.js';
import { confirmDialog } from '../ui.js';

async function exportBackup() {
  try {
    download(`cuaderno-${ymd(new Date())}.json`, await S.exportAll());
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

const ago = ts => {
  const m = Math.floor((Date.now() - ts) / 60000);
  return !ts ? 'todavía no' : m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} días`;
};

/** Account and sync: sign in, see what is going on, sync now, sign out. Redraws itself when the state changes. */
function account() {
  const box = h('div', { class: 'cloud-box' });
  let busy = false, error = '';
  const act = (label, fn, cls = 'btn') => h('button', { class: cls, type: 'button', disabled: busy, onclick: fn }, label);
  function draw() {
    const s = cloud.status;
    if (s.phase === 'off') return box.replaceChildren(h('p', null, 'La sincronización no está disponible aquí.'));
    if (s.phase === 'loading') return box.replaceChildren(h('p', null, 'Comprobando la sesión…'));
    if (s.phase === 'signedout') {
      if (box.querySelector('form')) { box.querySelector('.cloud-error').textContent = error; for (const b of box.querySelectorAll('button')) b.disabled = busy; return; }
      const user = h('input', { type: 'text', name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Usuario', placeholder: 'Usuario' });
      const pass = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', 'aria-label': 'Contraseña', placeholder: 'Contraseña' });
      const go = mode => async e => {
        e?.preventDefault();
        busy = true; error = ''; draw();
        error = await cloud[mode](user.value, pass.value) || '';
        busy = false; draw();
      };
      return box.replaceChildren(
        h('p', null, 'Entra con tu cuenta para guardar tus apuntes en la nube y verlos en todos tus dispositivos. Es la misma cuenta que en Mi App.'),
        h('form', { class: 'cloud-form', onsubmit: go('signIn') }, user, pass,
          h('p', { class: 'cloud-error', role: 'alert' }, error),
          h('div', { class: 'form-actions start' }, h('button', { class: 'btn primary cloud-in' }, 'Entrar'), act('Crear cuenta', go('signUp'), 'btn cloud-up'))));
    }
    if (s.phase === 'setmain') {
      return box.replaceChildren(
        h('p', null, `Has entrado como «${s.user}». Aún no has elegido cuál es tu cuenta principal, la única que guarda y recupera tus apuntes en este dispositivo. Mientras tanto no se sube ni se baja nada.`),
        h('div', { class: 'form-actions start' },
          act(`Sí, «${s.user}» es mi cuenta principal`, () => cloud.makeMain(), 'btn primary'),
          act('Entrar solo de invitado (sin sincronizar)', () => cloud.stayGuest()),
          act('Cerrar sesión', () => cloud.signOut())));
    }
    if (s.phase === 'guest') {
      return box.replaceChildren(
        h('p', null, `Has entrado como «${s.user}», que no es tu cuenta principal${s.main ? ` («${s.main}»)` : ''}. No se sube ni se baja nada: tus apuntes y los de esa cuenta no se tocan.`),
        h('div', { class: 'form-actions start' },
          act('Cerrar sesión', () => cloud.signOut(), 'btn primary'),
          act(`Hacer de «${s.user}» mi cuenta principal`, async () => {
            if (await confirmDialog(`«${s.user}» pasará a ser la única cuenta que sincroniza en este dispositivo. Después podrás elegir qué hacer con los apuntes que hay aquí.`, 'Cambiar')) cloud.makeMain();
          })));
    }
    if (s.phase === 'choose') {
      return box.replaceChildren(
        h('p', null, `Has entrado como «${s.user}», pero este dispositivo ya tiene apuntes y esa cuenta también. Por seguridad no se ha subido ni bajado nada todavía.`),
        h('p', { class: 'muted' }, 'Si los apuntes de este dispositivo no son de esa cuenta, no los mezcles: podrían acabar en la cuenta equivocada.'),
        h('div', { class: 'form-actions start' },
          act('Cerrar sesión', () => cloud.signOut()),
          act(`Usar solo los de «${s.user}» (borra lo de este dispositivo)`, async () => {
            if (await confirmDialog(`Se borrarán de este dispositivo los apuntes que tiene ahora y se cargarán los de «${s.user}».`, 'Borrar y cambiar')) cloud.adopt();
          }, 'btn danger'),
          act('Juntar los dos', async () => {
            if (await confirmDialog(`Los apuntes de este dispositivo se subirán a la cuenta «${s.user}» y se mezclarán con los que ya tiene. Hazlo solo si todo es tuyo.`, 'Juntar')) cloud.merge();
          })));
    }
    if (s.phase === 'other') {
      return box.replaceChildren(
        h('p', null, `Has entrado como «${s.user}», pero los apuntes de este dispositivo son de la cuenta «${s.owner}». No se mezclan: no se sube ni se baja nada.`),
        h('div', { class: 'form-actions start' },
          act('Cerrar sesión', () => cloud.signOut()),
          act(`Borrar lo de este dispositivo y usar «${s.user}»`, async () => {
            if (await confirmDialog(`Se borrarán de este dispositivo los apuntes de «${s.owner}» (siguen en su cuenta si estaban sincronizados) y se cargarán los de «${s.user}».`, 'Borrar y cambiar')) cloud.adopt();
          }, 'btn danger')));
    }
    const state = !s.online ? 'Sin conexión: los cambios se subirán solos cuando vuelva.'
      : s.syncing ? 'Sincronizando…'
        : s.error ? `No se ha podido sincronizar (${s.error}). Tus cambios siguen en este dispositivo.`
          : s.pending ? `${s.pending === 1 ? 'Hay 1 cambio' : `Hay ${s.pending} cambios`} por subir; se suben en unos segundos.`
            : 'Todo está sincronizado.';
    box.replaceChildren(
      h('p', null, 'Sesión de ', h('strong', null, s.user), '. Lo que haces se guarda en la nube y aparece en tus otros dispositivos.'),
      h('p', { class: 'cloud-state' }, state, ` Última sincronización: ${ago(s.lastOk)}.`),
      s.tooBig > 0 && h('p', { class: 'cloud-note' }, `${s.tooBig === 1 ? '1 archivo es demasiado grande' : `${s.tooBig} archivos son demasiado grandes`} para la nube (más de unos 18 MB) y solo ${s.tooBig === 1 ? 'está' : 'están'} en este dispositivo.`),
      h('div', { class: 'form-actions start' },
        h('button', { class: 'btn primary cloud-now', type: 'button', disabled: s.syncing || !s.online, onclick: () => cloud.syncNow() }, 'Sincronizar ahora'),
        act('Cerrar sesión', async () => {
          if (s.pending && !await confirmDialog('Hay cambios sin subir. Si cierras sesión se quedan solo en este dispositivo hasta que vuelvas a entrar.', 'Cerrar sesión')) return;
          cloud.signOut();
        })),
      h('p', { class: 'muted' }, 'Cerrar sesión la cierra también en Mi App en este navegador. Los apuntes no se borran del dispositivo.'));
  }
  const off = cloud.onStatus(draw);
  draw();
  return { el: box, off };
}

export function settings(root) {
  const st = S.settings();
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: () => { if (file.files[0]) importBackup(file.files[0]); file.value = ''; } });
  const bundle = h('input', { class: 'import-input', type: 'file', accept: 'application/json,.json', hidden: true, onchange: () => { if (bundle.files[0]) importFile(bundle.files[0]); bundle.value = ''; } });
  const theme = h('select', { class: 'theme-pick', 'aria-label': 'Tema', onchange: () => setTheme(theme.value) }, THEMES.map(t => h('option', { value: t }, THEME_NAMES[t])));
  theme.value = getTheme();
  const font = h('select', { class: 'font-pick', 'aria-label': 'Letra', onchange: () => setFont(font.value) }, FONTS.map(([k, label]) => h('option', { value: k }, label)));
  font.value = getFont();
  const acc = account();
  const name = h('input', { class: 'name-input', type: 'text', 'aria-label': 'Tu nombre', placeholder: 'Tu nombre', autocomplete: 'given-name', maxlength: 40, value: st.name || '', onchange: () => { S.put({ ...S.settings(), name: name.value.trim() }); } });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const sec = (title, ...kids) => h('section', { class: 'set-sec' }, h('h2', null, title), kids);

  root.classList.add('db');
  root.append(
    viewHead('⚙️', 'Ajustes'),
    !standalone && sec('Instalar en el iPhone o iPad',
      h('p', null, 'Abre esta página en Safari, pulsa Compartir y elige «Añadir a pantalla de inicio». Cuaderno se abrirá a pantalla completa y funcionará sin conexión.')),
    sec('Cuenta y sincronización', acc.el),
    sec('Tu nombre',
      h('p', null, 'Para saludarte en Inicio. Si lo dejas vacío se usa el nombre de tu cuenta.'),
      name),
    sec('Tema',
      h('p', null, 'Los colores de la aplicación en este dispositivo. Cada página puede tener además su propio fondo.'),
      theme),
    sec('Letra',
      h('p', null, 'La letra de los menús y de todo lo demás en este dispositivo. Cada página puede usar otra distinta desde su menú (los tres puntos) → Fuente.'),
      font),
    sec('Horario',
      h('label', { class: 'switch' },
        h('input', { type: 'checkbox', checked: st.weekend, onchange: e => { S.put({ ...S.settings(), weekend: e.target.checked }); } }),
        h('span', null, 'Mostrar sábado y domingo'))),
    sec('Copia de seguridad',
      h('p', null, 'Todo se guarda en este dispositivo. Guarda una copia en Archivos para no perder nada o para pasarlo a otro dispositivo. La sincronización en la nube llegará más adelante.'),
      h('div', { class: 'form-actions start' },
        h('button', { class: 'btn primary', type: 'button', onclick: exportBackup }, 'Guardar una copia'),
        h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Restaurar una copia'), file)),
    sec('Libros y páginas',
      h('p', null, 'Para pasar solo un libro o una página, expórtalos desde su menú (los tres puntos) y tráelos aquí. Un libro llega como libro nuevo; una página se añade al libro que elijas. Lo que ya tienes no se toca.'),
      h('div', { class: 'form-actions start' },
        h('button', { class: 'btn', type: 'button', onclick: () => bundle.click() }, 'Importar un libro o una página'), bundle)));  return acc.off;
}
