import * as S from '../store.js';
import { h, icon, app, empty, emojiPicker, pop, toast } from '../ui.js';
import { COLORS, STARTER_ICONS } from '../util.js';
import { mountEditor, shrink } from '../editor.js';

const GRADIENTS = ['g1', 'g2', 'g3', 'g4'];

export function pageView(root, id, { focusTitle = false } = {}) {
  const page = S.livePage(id);
  if (!page) {
    root.append(empty('Esta página ya no existe o está en la papelera.', h('button', { class: 'btn', type: 'button', onclick: () => app.go('home') }, 'Ir a Inicio')));
    return;
  }
  const el = h('article', { class: 'page' + (page.font ? ' font-' + page.font : '') + (page.wide ? ' wide' : '') });
  const cover = h('div', { class: 'page-cover-slot' });
  const head = h('div', { class: 'page-head' });
  const body = h('div', { class: 'page-body' });
  const save = () => { S.put(page); draw(); app.chrome(); };

  const file = h('input', {
    type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try {
        if (page.cover?.startsWith('img:')) S.delBlob(page.cover.slice(4));
        page.cover = 'img:' + await S.saveBlob(await shrink(f));
        save();
      } catch (e) { console.error(e); toast('No se ha podido usar esa imagen.'); }
    },
  });

  const coverPicker = anchor => pop(anchor, (box, close) => {
    const pick = v => { close(); if (page.cover?.startsWith('img:')) S.delBlob(page.cover.slice(4)); page.cover = v; save(); };
    box.append(
      h('div', { class: 'pop-head' }, h('span', null, 'Portada'), h('button', { class: 'tbtn', type: 'button', onclick: () => pick(null) }, 'Quitar')),
      h('div', { class: 'cover-grid' }, [...GRADIENTS, ...COLORS].map(c => h('button', { type: 'button', class: 'cover-sw cover-' + c, 'aria-label': 'Portada ' + c, onclick: () => pick('c:' + c) }))),
      h('button', { class: 'menu-item', type: 'button', onclick: () => { close(); file.click(); } }, icon('image'), 'Subir una imagen'));
  }, 'cover-pop');

  function draw() {
    cover.replaceChildren();
    if (page.cover) {
      const c = h('div', { class: 'page-cover' + (page.cover.startsWith('c:') ? ' cover-' + page.cover.slice(2) : '') },
        h('button', { class: 'tbtn cover-change', type: 'button', onclick: e => coverPicker(e.currentTarget) }, 'Cambiar portada'));
      if (page.cover.startsWith('img:')) S.blobURL(page.cover.slice(4)).then(u => { if (u) c.style.backgroundImage = `url("${u}")`; });
      cover.append(c);
    }
    el.classList.toggle('has-cover', !!page.cover);
    el.classList.toggle('has-icon', !!page.icon);
    head.replaceChildren(...[
      page.icon && h('button', {
        class: 'page-icon', type: 'button', 'aria-label': 'Cambiar el icono',
        onclick: e => emojiPicker(e.currentTarget, v => { page.icon = v; save(); }, () => { page.icon = null; save(); }),
      }, page.icon),
      h('div', { class: 'page-ctl' },
        !page.icon && h('button', { class: 'tbtn', type: 'button', onclick: () => { page.icon = STARTER_ICONS[Math.floor(Math.random() * STARTER_ICONS.length)]; save(); } }, icon('star'), 'Añadir icono'),
        !page.cover && h('button', { class: 'tbtn', type: 'button', onclick: () => { page.cover = 'c:' + GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)]; save(); } }, icon('image'), 'Añadir portada'))].filter(Boolean));
  }

  draw();
  el.append(cover, h('div', { class: 'page-inner' }, head, body), file);
  root.append(el);
  const editor = mountEditor(body, page, { focusTitle });
  return editor.destroy;
}
