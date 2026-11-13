import * as S from '../store.js';
import { h, icon, app, empty, emojiPicker, pop, toast } from '../ui.js';
import { COLORS, COLOR_NAMES, STARTER_ICONS } from '../util.js';
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
  const scroller = root.closest('.scroll');
  let alive = true;

  // Page background: unset = the default beige, 'white', a colour key, or 'img:<blob id>'.
  function paint() {
    scroller.style.backgroundColor = '';
    scroller.style.backgroundImage = '';
    scroller.classList.remove('has-bgimg');
    const bg = page.bg;
    if (!bg) return;
    if (bg.startsWith('img:')) {
      S.blobURL(bg.slice(4)).then(u => {
        if (!alive || page.bg !== bg || !u) return;
        scroller.style.backgroundImage = `url("${u}")`;
        scroller.classList.add('has-bgimg');
      });
    } else scroller.style.backgroundColor = bg === 'white' ? 'var(--white)' : `var(--b-${bg})`;
  }
  const setBg = v => {
    if (page.bg?.startsWith('img:') && page.bg !== v) S.delBlob(page.bg.slice(4));
    if (v) page.bg = v; else delete page.bg;
    S.put(page);
    paint();
  };
  const bgFile = h('input', {
    class: 'bg-input', type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const f = bgFile.files[0];
      bgFile.value = '';
      if (!f) return;
      try { setBg('img:' + await S.saveBlob(await shrink(f))); } catch (e) { console.error(e); toast('No se ha podido usar esa imagen.'); }
    },
  });
  const bgPicker = anchor => pop(anchor, (box, close) => {
    const sw = (key, label, style) => h('button', {
      type: 'button', class: 'bg-sw' + ((page.bg || '') === key ? ' on' : ''), 'data-bg': key || 'default', style, 'aria-label': 'Fondo ' + label, title: label,
      onclick: () => { close(); setBg(key || null); },
    });
    box.append(
      h('div', { class: 'pop-head' }, h('span', null, 'Fondo de la página')),
      h('div', { class: 'bg-grid' },
        sw('', 'beige (predeterminado)', 'background:var(--bg)'), sw('white', 'blanco', 'background:var(--white)'),
        COLORS.map(c => sw(c, COLOR_NAMES[c], `background:var(--b-${c})`))),
      h('button', { class: 'menu-item', type: 'button', onclick: () => { close(); bgFile.click(); } }, icon('image'), 'Usar una imagen'));
  }, 'cover-pop');

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
        !page.cover && h('button', { class: 'tbtn', type: 'button', onclick: () => { page.cover = 'c:' + GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)]; save(); } }, icon('image'), 'Añadir portada'),
        h('button', { class: 'tbtn', type: 'button', onclick: e => bgPicker(e.currentTarget) }, icon('palette'), 'Fondo'))].filter(Boolean));
  }

  draw();
  paint();
  el.append(cover, h('div', { class: 'page-inner' }, head, body), file, bgFile);
  root.append(el);
  const editor = mountEditor(body, page, { focusTitle });
  return () => {
    alive = false;
    editor.destroy();
    scroller.style.backgroundColor = '';
    scroller.style.backgroundImage = '';
    scroller.classList.remove('has-bgimg');
  };
}
