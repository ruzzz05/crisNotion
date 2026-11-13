// End-to-end test: drives the real app in headless Chrome/Edge.
//   npm run test:e2e            (set SHOTS=dir to keep screenshots, CHROME_PATH to pick a browser)
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePdf } from './pdf-fixture.mjs';

const OUT = process.env.SHOTS || mkdtempSync(join(tmpdir(), 'cuaderno-e2e-'));
mkdirSync(OUT, { recursive: true });
const PORT = 5174;
const URL0 = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url)), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => server.stdout.once('data', r));

const exe = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
if (!exe) { console.error('No Chrome or Edge found. Set CHROME_PATH.'); server.kill(); process.exit(2); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--force-color-profile=srgb'] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const shot = name => page.screenshot({ path: `${OUT}/${name}.png` });
const check = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) errors.push('assert: ' + msg); };
const count = sel => page.$$eval(sel, els => els.length);
const texts = sel => page.$$eval(sel, els => els.map(e => e.textContent.trim()));
const text = async sel => (await texts(sel))[0];
const visible = sel => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }, sel);
const clickText = async (sel, t) => {
  const ok = await page.evaluate((sel, t) => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().includes(t)); if (!el) return false; el.click(); return true; }, sel, t);
  if (!ok) throw new Error(`no ${sel} with "${t}"`);
  await sleep(150);
};
const type = async (s, enter = false) => { await page.keyboard.type(s); if (enter) await page.keyboard.press('Enter'); };
const press = async (...keys) => { for (const k of keys) await page.keyboard.press(k); };
const blocks = () => page.$$eval('.blk', els => els.map(e => ({ t: e.dataset.t, i: Number(e.style.getPropertyValue('--ind') || 0), text: e.querySelector('.content')?.textContent ?? '', hidden: e.offsetParent === null })));
const shape = async () => (await blocks()).map(b => b.t + b.i).join(' ');
const route = () => page.evaluate(() => location.hash.replace(/^#\/?/, ''));
const drawings = () => page.evaluate(async () => {
  const d = await new Promise(r => { const q = indexedDB.open('cuaderno'); q.onsuccess = () => { const g = q.result.transaction('drawings').objectStore('drawings').getAll(); g.onsuccess = () => r(g.result); }; });
  return d.map(x => x.strokes.length);
});
const section = async (name, fn) => {
  console.log('\n# ' + name);
  try { await fn(); } catch (e) { console.log('FAIL ' + name + ' threw: ' + e.message.split('\n')[0]); errors.push(`threw in "${name}": ${e.message.split('\n')[0]}`); await shot('error-' + name.replace(/\W+/g, '-')); }
};
/** Put the caret at the end of the block whose text is `t`. */
const caretIn = async t => {
  await page.evaluate(t => {
    const c = [...document.querySelectorAll('.blk .content')].find(e => e.textContent === t);
    c.focus(); const r = document.createRange(); r.selectNodeContents(c); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }, t);
};

await page.goto(URL0, { waitUntil: 'networkidle0' });

await section('shell', async () => {
  check(await visible('.sidebar'), 'sidebar is visible on a tablet');
  const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(paper === 'rgb(245, 240, 230)', 'the default background is beige: ' + paper);
  check(await count('.tabx') === 1 && (await text('.tabx.on')).includes('Inicio'), 'starts with one tab on Inicio');
  check((await texts('.side-item')).join('|').includes('Horario') && (await texts('.side-item')).join('|').includes('Calendario'), 'sidebar lists Horario and Calendario');
  check(!(await text('.topbar')).includes('null'), 'top bar shows no stray "null" on a built-in view');
  const iconW = await page.$eval('.side-item[data-route=home] .ico', e => e.getBoundingClientRect().width);
  check(iconW <= 20, 'sidebar icon keeps its size so the label sits next to it: ' + iconW);
  await shot('01-home-empty');
});

await section('books and pages', async () => {
  await page.click('.side-new-book'); await sleep(150);
  await type('2.º de Bachillerato');
  await clickText('.modal button', 'Guardar');
  check(await count('.book') === 1 && (await text('.book-name')) === '2.º de Bachillerato', 'new book appears in the sidebar');
  await page.click('.book-add'); await sleep(250);
  check(await page.evaluate(() => document.activeElement?.classList.contains('page-title')), 'a new page opens with its title focused');
  await type('Matemáticas II'); await sleep(100);
  check((await text('.tree-row .tree-title')) === 'Matemáticas II', 'sidebar tree follows the title as it is typed');
  check((await text('.tabx.on')).includes('Matemáticas II'), 'tab label follows the title');
  check(!(await text('.page-head')).includes('null') && !(await text('.topbar')).includes('null'), 'page header and top bar show no stray "null"');
  check((await texts('.crumb')).join(' > ') === '2.º de Bachillerato > Matemáticas II', 'breadcrumb shows book and page: ' + (await texts('.crumb')).join(' > '));
});

await section('slash menu', async () => {
  await press('Enter');
  await type('/tit'); await sleep(150);
  check(await visible('.slash'), 'typing / opens the block menu');
  const items = await texts('.slash-item .slash-label');
  check(items.length >= 3 && items.every(t => t.includes('Título')), 'menu filters as you type: ' + items.join(','));
  await press('Enter'); await sleep(100);
  check(!(await visible('.slash')), 'menu closes after choosing');
  await type('Derivadas');
  const b = await blocks();
  check(b.length === 1 && b[0].t === 'h1' && b[0].text === 'Derivadas', 'chosen block type is applied and the /query is removed: ' + JSON.stringify(b));
  await press('Enter'); await type('/zzzz'); await sleep(100);
  check((await text('.slash')).includes('Sin resultados'), 'menu says when nothing matches');
  await press('Escape'); await sleep(50);
  check(!(await visible('.slash')), 'Escape closes the menu');
  for (let i = 0; i < 5; i++) await press('Backspace');
});

await section('typing, lists and nesting', async () => {
  await type('Texto normal', true);
  await type('- uno', true);
  await type('dos'); await press('Tab');
  check(await shape() === 'h10 p0 bullet0 bullet1', 'Tab nests a list item: ' + await shape());
  await press('Enter');
  check(await shape() === 'h10 p0 bullet0 bullet1 bullet1', 'Enter continues the list at the same depth');
  await press('Enter');
  check(await shape() === 'h10 p0 bullet0 bullet1 bullet0', 'Enter on an empty nested item outdents it');
  await press('Enter');
  check(await shape() === 'h10 p0 bullet0 bullet1 p0', 'Enter on an empty top-level item turns it into text');
  await type('1. primero', true); await type('segundo');
  check((await page.$$eval('.blk[data-t=num]', els => els.map(e => e.dataset.n))).join() === '1,2', 'numbered items count up');
  await press('Enter', 'Enter');
  await type('[] comprar regla');
  await page.click('.blk[data-t=todo] .todo-box');
  check(await page.$eval('.blk[data-t=todo]', e => e.classList.contains('done')), 'to-do can be ticked');
  await press('Enter', 'Enter');
});

await section('toggle', async () => {
  await type('> Demostración', true);
  await type('paso oculto');
  const b = await blocks();
  check(b.at(-2).t === 'toggle' && b.at(-1).t === 'p' && b.at(-1).i === 1, 'Enter in an open toggle writes inside it');
  await page.click('.blk[data-t=toggle] .tog'); await sleep(80);
  check((await blocks()).at(-1).hidden, 'closing the toggle hides its content');
  await page.click('.blk[data-t=toggle] .tog'); await sleep(80);
  check(!(await blocks()).at(-1).hidden, 'opening the toggle shows it again');
  await caretIn('paso oculto');
  await press('Enter', 'Backspace');
  check((await blocks()).at(-1).i === 0, 'Backspace on an empty nested block outdents it');
});

await section('code block', async () => {
  await type('```'); await sleep(50);
  check((await blocks()).at(-1).t === 'code', 'three backticks start a code block');
  await type('x = 1', true); await type('y = 2');
  const code = await page.$eval('.blk[data-t=code] .content', e => e.innerText);
  check(await count('.blk[data-t=code]') === 1 && /x = 1\s+y = 2/.test(code), 'Enter stays inside the code block');
});

await section('drawing', async () => {
  await page.click('.page-tail'); await sleep(80);
  await type('/dibujo'); await sleep(120); await press('Enter'); await sleep(400);
  check(await count('.blk[data-t=draw] .draw-live') === 1, 'drawing block added from the slash menu');
  await page.$eval('.blk[data-t=draw]', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  const box = await (await page.$('.draw-live')).boundingBox();
  const stroke = async pts => { await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down(); for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 4 }); await page.mouse.up(); };
  await stroke(Array.from({ length: 20 }, (_, i) => [box.x + 40 + i * 20, box.y + 60 + Math.sin(i / 2) * 25]));
  await page.click('.draw-bar [aria-label="Subrayador"]');
  await stroke(Array.from({ length: 20 }, (_, i) => [box.x + 40 + i * 20, box.y + 140 + Math.sin(i / 2) * 25]));
  await sleep(600);
  check((await drawings())[0] === 2, 'strokes are saved: ' + JSON.stringify(await drawings()));
  await page.click('.draw-bar [aria-label="Goma"]');
  await stroke([[box.x + 200, box.y + 130], [box.x + 210, box.y + 150]]); await sleep(600);
  check((await drawings())[0] === 1, 'eraser removes a stroke');
  await page.click('.draw-bar [aria-label="Deshacer"]'); await sleep(600);
  check((await drawings())[0] === 2, 'undo brings it back');
  await page.click('.draw-bar [aria-label="Bolígrafo"]');
  const finger = await page.evaluate(() => {
    const live = document.querySelector('.draw-live'), q = live.getBoundingClientRect(), view = document.querySelector('.scroll');
    const ev = (type, o) => live.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', button: 0, ...o }));
    const before = view.scrollTop;
    ev('pointerdown', { clientX: q.left + 300, clientY: q.top + 200 });
    ev('pointermove', { clientX: q.left + 320, clientY: q.top + 150 });
    ev('pointerup', { clientX: q.left + 320, clientY: q.top + 150 });
    const moved = view.scrollTop - before;
    view.scrollTop = before;
    return { moved, handButton: !!document.querySelector('.draw-bar [aria-label*="dedo"]') };
  });
  await sleep(600);
  check((await drawings())[0] === 2 && finger.moved > 0, 'a finger never draws, even before any pencil was used; it scrolls: ' + JSON.stringify(finger));
  check(!finger.handButton, 'there is no option to draw with a finger');
  const r = await page.evaluate(() => {
    const live = document.querySelector('.draw-live'), q = live.getBoundingClientRect(), view = document.querySelector('.scroll');
    const ev = (type, o) => live.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...o }));
    ev('pointerdown', { pointerId: 7, pointerType: 'pen', pressure: 0.8, clientX: q.left + 500, clientY: q.top + 40, button: 0 });
    ev('pointermove', { pointerId: 7, pointerType: 'pen', pressure: 0.9, clientX: q.left + 540, clientY: q.top + 60 });
    ev('pointerup', { pointerId: 7, pointerType: 'pen', clientX: q.left + 540, clientY: q.top + 60 });
    const before = view.scrollTop;
    ev('pointerdown', { pointerId: 9, pointerType: 'touch', clientX: q.left + 300, clientY: q.top + 200, button: 0 });
    ev('pointermove', { pointerId: 9, pointerType: 'touch', clientX: q.left + 300, clientY: q.top + 140 });
    ev('pointerup', { pointerId: 9, pointerType: 'touch', clientX: q.left + 300, clientY: q.top + 140 });
    return { before, after: view.scrollTop };
  });
  await sleep(600);
  check((await drawings())[0] === 3 && r.after > r.before, 'pencil draws while a finger scrolls the page: ' + JSON.stringify(r));
});

await section('pictures on the drawing sheet', async () => {
  writeFileSync(`${OUT}/photo.png`, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC', 'base64'));
  await page.$eval('.blk[data-t=draw]', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  const big = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#7fd4a8'; x.fillRect(0, 0, 600, 400); x.fillStyle = '#1f6f4a'; x.fillRect(40, 40, 200, 120); return c.toDataURL('image/png').split(',')[1]; });
  writeFileSync(`${OUT}/big.png`, Buffer.from(big, 'base64'));
  await (await page.$('.blk[data-t=draw] input.draw-file')).uploadFile(`${OUT}/big.png`); await sleep(700);
  const img = () => page.$eval('.draw-img', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, loaded: e.naturalWidth > 0 }; });
  check(await count('.draw-img') === 1 && (await img()).loaded, 'a picture can be inserted into the drawing');
  check(await page.$eval('.draw-bar [aria-label="Mover imágenes"]', e => e.classList.contains('on')), 'inserting a picture switches to the move tool');
  const a = await img();
  await page.mouse.move(a.x + 10, a.y + 10); await page.mouse.down();
  await page.mouse.move(a.x + 90, a.y + 50, { steps: 6 }); await page.mouse.up(); await sleep(100);
  const b = await img();
  check(Math.abs(b.x - a.x - 80) < 3 && Math.abs(b.y - a.y - 40) < 3, 'dragging with the move tool moves the picture: ' + JSON.stringify([b.x - a.x, b.y - a.y]));
  await page.mouse.move(b.x + b.w - 4, b.y + b.h - 4); await page.mouse.down();
  await page.mouse.move(b.x + b.w + 56, b.y + b.h + 20, { steps: 6 }); await page.mouse.up(); await sleep(100);
  const c = await img();
  check(c.w > b.w + 40 && Math.abs(c.w / c.h - b.w / b.h) < 0.05, 'dragging its corner resizes it keeping the proportions: ' + JSON.stringify([b.w, c.w]));
  const strokesBefore = (await drawings())[0];
  await page.click('.draw-bar [aria-label="Bolígrafo"]');
  await page.mouse.move(c.x + 5, c.y + 5); await page.mouse.down();
  await page.mouse.move(c.x + c.w - 5, c.y + c.h - 5, { steps: 6 }); await page.mouse.up(); await sleep(600);
  const d = await img();
  check((await drawings())[0] === strokesBefore + 1 && Math.abs(d.x - c.x) < 1, 'with the pen you write on top of the picture without moving it');
  const above = await page.evaluate(() => { const i = document.querySelector('.draw-img'), cv = document.querySelector('.draw-base'); return !!(i.compareDocumentPosition(cv) & Node.DOCUMENT_POSITION_FOLLOWING); });
  check(above, 'ink is painted above the picture');
  const saved = await page.evaluate(async () => new Promise(r => { const q = indexedDB.open('cuaderno'); q.onsuccess = () => { const g = q.result.transaction('drawings').objectStore('drawings').getAll(); g.onsuccess = () => r(g.result[0].images?.length); }; }));
  check(saved === 1, 'the picture is saved with the drawing');
  await shot('02b-draw-picture');
});

await section('photo', async () => {
  writeFileSync(`${OUT}/photo.png`, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC', 'base64'));
  await (await page.$('input.photo-input')).uploadFile(`${OUT}/photo.png`); await sleep(700);
  check(await page.evaluate(() => { const i = document.querySelector('.blk[data-t=image] img'); return !!i && i.src.startsWith('blob:') && i.naturalWidth > 0; }), 'photo block shows the picture');
});

const pdfInk = () => page.evaluate(async () => new Promise(r => { const q = indexedDB.open('cuaderno'); q.onsuccess = () => { const g = q.result.transaction('drawings').objectStore('drawings').getAll(); g.onsuccess = () => r(g.result.filter(d => /:[0-9]+$/.test(d.id)).map(d => d.id.split(':')[1] + '=' + d.strokes.length)); }; }));
const waitFor = async (fn, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return true; await sleep(150); } return false; };

await section('pdf', async () => {
  writeFileSync(`${OUT}/apuntes.pdf`, makePdf(2), 'latin1');
  await page.click('.page-tail'); await sleep(80);
  await type('/pdf'); await sleep(150);
  check((await texts('.slash-item .slash-label')).join() === 'PDF', 'the block menu offers PDF');
  await press('Escape'); for (let i = 0; i < 4; i++) await press('Backspace');
  await (await page.$('input.pdf-input')).uploadFile(`${OUT}/apuntes.pdf`);
  check(await waitFor(async () => await count('.blk[data-t=pdf] .pdf-page') === 2), 'an uploaded PDF shows one sheet per page');
  check((await text('.pdf-name')).includes('apuntes.pdf'), 'the PDF block shows the file name');
  await page.$eval('.pdf-page', e => e.scrollIntoView({ block: 'start' })); await sleep(200);
  const painted = () => page.$eval('.pdf-canvas', c => { if (!c.width) return false; const x = c.getContext('2d'), k = c.width / 595, d = x.getImageData(Math.round(200 * k), Math.round((842 - 660) * k), 1, 1).data; return d[2] > 150 && d[0] < 120; });
  check(await waitFor(painted), 'the PDF page itself is rendered');
  await page.click('.blk[data-t=pdf] .draw-bar [aria-label="Subrayador"]');
  const box = await (await page.$('.pdf-page .draw-live')).boundingBox();
  await page.mouse.move(box.x + 60, box.y + 260); await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 264, { steps: 8 }); await page.mouse.up(); await sleep(700);
  check((await pdfInk()).join() === '1=1', 'highlighting on a PDF page is saved for that page: ' + (await pdfInk()).join());
  check(await page.$eval('.blk[data-t=pdf] .draw-bar', e => getComputedStyle(e).position === 'sticky'), 'the PDF tools stay in view while scrolling its pages');
  await page.click('.blk[data-t=pdf] .draw-bar [aria-label="Bolígrafo"]');
  await shot('02c-pdf');
});

await section('subpages', async () => {
  await page.click('.page-tail'); await sleep(80);
  await type('/pagina'); await sleep(120); await press('Enter'); await sleep(300);
  check(await page.evaluate(() => document.activeElement?.classList.contains('page-title')), 'creating a subpage opens it');
  await type('Tema 1: Límites'); await sleep(100);
  check((await texts('.crumb')).length === 3, 'breadcrumb has three levels inside a subpage');
  check((await texts('.tree-row .tree-title')).join('|') === 'Matemáticas II|Tema 1: Límites', 'subpage is nested in the sidebar tree: ' + (await texts('.tree-row .tree-title')).join('|'));
  await press('Enter'); await type('Contenido del tema');
  await page.click('.crumb:nth-of-type(2)'); await sleep(250);
  check((await text('.blk[data-t=page]')).includes('Tema 1: Límites'), 'parent shows the subpage as a block');
  await page.click('.blk[data-t=page] .page-link'); await sleep(250);
  check((await page.$eval('.page-title', e => e.textContent)) === 'Tema 1: Límites', 'clicking the block opens the subpage');
  await page.click('.tree-row .tree-title'); await sleep(250);
  check((await page.$eval('.page-title', e => e.textContent)) === 'Matemáticas II', 'clicking a tree row opens that page');
  await shot('02-page');
});

await section('formatting bubble', async () => {
  await page.evaluate(() => { document.querySelector('.scroll').scrollTop = 0; });
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('.blk .content')].find(e => e.textContent === 'Texto normal');
    const r = document.createRange(); r.selectNodeContents(c); const s = getSelection(); s.removeAllRanges(); s.addRange(r); c.focus();
    document.dispatchEvent(new Event('selectionchange'));
  });
  await sleep(250);
  check(await visible('.bubble'), 'selecting text shows the formatting bubble');
  await page.click('.bubble [aria-label="Negrita"]');
  await page.click('.bubble [aria-label="Código"]'); await sleep(100);
  const html = await page.evaluate(() => [...document.querySelectorAll('.blk .content')].find(e => e.textContent === 'Texto normal').innerHTML);
  check(/<b|font-weight/.test(html) && /<code/.test(html), 'bold and inline code are applied: ' + html);
  await shot('03-bubble');
  await press('ArrowRight'); await sleep(250);
  check(!(await visible('.bubble')), 'bubble hides when the selection collapses');
});

await section('block handle: drag, menu, colour', async () => {
  const order = async () => (await blocks()).map(b => b.text).slice(0, 2).join('|');
  check(await order() === 'Derivadas|Texto normal', 'before dragging: ' + await order());
  const second = (await page.$$('.blk'))[1];
  await second.hover(); await sleep(120);
  const hb = await (await second.$('.g-drag')).boundingBox();
  const first = await (await page.$('.blk')).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 4, first.y + 20, { steps: 6 });
  await page.mouse.move(hb.x + 4, first.y + 2, { steps: 4 });
  check(await visible('.drop-line'), 'a line shows where the block will land');
  await page.mouse.up(); await sleep(150);
  check(await order() === 'Texto normal|Derivadas', 'dragging the handle reorders blocks: ' + await order());
  const n = await count('.blk');
  await (await page.$('.blk')).hover(); await sleep(100);
  await page.click('.blk:first-child .g-drag'); await sleep(150);
  check(await visible('.pop'), 'clicking the handle opens the block menu');
  await clickText('.pop .menu-item', 'Duplicar');
  check(await count('.blk') === n + 1, 'Duplicar adds a copy');
  await (await page.$('.blk')).hover(); await sleep(100);
  await page.click('.blk:first-child .g-drag'); await sleep(150);
  await clickText('.pop .menu-item', 'Eliminar');
  check(await count('.blk') === n, 'Eliminar removes the block');
  await (await page.$('.blk')).hover(); await sleep(100);
  await page.click('.blk:first-child .g-drag'); await sleep(150);
  await clickText('.pop .menu-item', 'Color');
  await clickText('.pop .menu-item', 'Fondo azul');
  check(await page.$eval('.blk', e => e.dataset.color === 'blue_bg'), 'block colour is applied');
  await (await page.$('.blk')).hover(); await sleep(100);
  await page.click('.blk:first-child .g-add'); await sleep(200);
  check(await visible('.slash') && (await blocks())[1].text === '/', 'the + handle adds a block below and opens the menu');
  await press('Escape', 'Backspace', 'Backspace');
});

await section('icon and cover', async () => {
  await page.hover('.page-head');
  await clickText('.page-ctl button', 'Añadir icono');
  const icon = await text('.page-icon');
  check(!!icon && (await text('.tree-row .tree-icon')) === icon, 'adding an icon shows it on the page and in the sidebar: ' + icon);
  await page.hover('.page-head');
  await clickText('.page-ctl button', 'Añadir portada');
  check(await visible('.page-cover'), 'adding a cover shows it');
  await page.click('.page-icon'); await sleep(150);
  check(await visible('.pop .emoji-grid'), 'clicking the icon opens the emoji picker');
  await page.click('.pop .emoji-grid button:nth-child(5)'); await sleep(150);
  check((await text('.page-icon')) !== icon, 'picking an emoji changes the icon');
  await shot('04-cover');
});

await section('columns', async () => {
  const box = t => page.evaluate(t => {
    const e = [...document.querySelectorAll('.blk')].find(x => x.querySelector('.content')?.textContent === t), r = e.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom };
  }, t);
  const beside = async () => { const a = await box('Texto normal'), b = await box('Derivadas'); return b.l >= a.r - 1 && b.t < a.b && a.t < b.b; };
  const top3 = async () => (await blocks()).slice(0, 3).map(b => b.text).join('|');
  const menuOf = async (index, item) => {
    const el = (await page.$$('.blk'))[index];
    await el.hover(); await sleep(120);
    await (await el.$('.g-drag')).click(); await sleep(150);
    await clickText('.pop .menu-item', item);
  };
  check(!(await beside()), 'blocks start stacked');
  await menuOf(1, 'Poner al lado del bloque anterior');
  check(await beside(), 'the block menu places a block beside the previous one');
  await caretIn('Texto normal');
  await press('Enter'); await type('debajo de la fila');
  check(await top3() === 'Texto normal|Derivadas|debajo de la fila', 'Enter inside a column continues below the row: ' + await top3());
  const a = await box('Texto normal'), b = await box('Derivadas'), c = await box('debajo de la fila');
  check(c.t >= Math.max(a.b, b.b) - 1 && c.r - c.l > (a.r - a.l) * 1.5, 'the block under a row is full width again');
  await menuOf(1, 'Sacar de la columna');
  check(!(await beside()) && await top3() === 'Texto normal|Derivadas|debajo de la fila', 'a block can be taken out of its column');
  const second = (await page.$$('.blk'))[1];
  await second.hover(); await sleep(120);
  const hb = await (await second.$('.g-drag')).boundingBox();
  const target = await box('Texto normal');
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.r - 40, (target.t + target.b) / 2, { steps: 8 });
  await page.mouse.move(target.r - 12, (target.t + target.b) / 2, { steps: 3 });
  check(await visible('.drop-line.v'), 'dragging to the side of a block shows an upright line');
  await page.mouse.up(); await sleep(150);
  check(await beside(), 'dropping on the side of a block makes two columns');
  const ta = await box('Texto normal'), tb = await box('Derivadas');
  check(Math.abs(ta.t - tb.t) < 6, 'columns line up at the top: ' + (tb.t - ta.t));
  await shot('04b-columns');
});

await section('page background', async () => {
  const bg = () => page.$eval('.scroll', e => { const s = getComputedStyle(e); return { c: s.backgroundColor, i: s.backgroundImage }; });
  await page.evaluate(() => { document.querySelector('.scroll').scrollTop = 0; });
  await page.hover('.page-head');
  await clickText('.page-ctl button', 'Fondo');
  check(await visible('.pop .bg-grid'), 'the Fondo button opens the background picker');
  await (await page.$('input.bg-input')).uploadFile(`${OUT}/photo.png`); await sleep(700);
  check((await bg()).i.includes('blob:'), 'a picture can be set as the page background: ' + (await bg()).i.slice(0, 20));
  await page.hover('.page-head');
  await clickText('.page-ctl button', 'Fondo');
  await page.click('.pop .bg-grid [data-bg="blue"]'); await sleep(150);
  check((await bg()).c === 'rgb(231, 243, 248)' && (await bg()).i === 'none', 'choosing a colour replaces the picture: ' + JSON.stringify(await bg()));
  await clickText('.side-item', 'Inicio'); await sleep(200);
  check((await bg()).c === 'rgba(0, 0, 0, 0)', 'other views keep the default background');
  await clickText('.book .tree-row .tree-title', 'Matemáticas II'); await sleep(250);
  check((await bg()).c === 'rgb(231, 243, 248)', 'the page gets its background back when reopened');
  await shot('04c-background');
});

await section('tabs', async () => {
  await page.click('.tab-new'); await sleep(200);
  check(await count('.tabx') === 2 && (await text('.tabx.on')).includes('Inicio'), 'a new tab opens on Inicio');
  await clickText('.side-item', 'Calendario'); await sleep(200);
  check((await texts('.tabx')).map(t => t.replace(/\s+/g, ' ')).join('|').includes('Matemáticas II') && (await text('.tabx.on')).includes('Calendario'), 'navigating changes only the active tab: ' + (await texts('.tabx')).join('|'));
  await page.click('.tabx:first-child'); await sleep(250);
  check((await route()).startsWith('page/') && (await page.$eval('.page-title', e => e.textContent)) === 'Matemáticas II', 'switching tab shows its page');
  await page.reload({ waitUntil: 'networkidle0' });
  check(await count('.tabx') === 2 && (await text('.tabx.on')).includes('Matemáticas II'), 'tabs survive a reload');
  await page.click('.tabx:nth-child(2) .tabx-close'); await sleep(150);
  check(await count('.tabx') === 1, 'a tab can be closed');
});

await section('persistence', async () => {
  const b = await blocks();
  check(b.length >= 10 && b[0].text === 'Texto normal' && b.some(x => x.t === 'toggle') && b.some(x => x.t === 'code') && b.some(x => x.t === 'page'), 'blocks are still there after a reload: ' + b.map(x => x.t).join(','));
  check(await count('.blk.in-row') === 2, 'columns survive a reload');
  check((await page.$eval('.scroll', e => getComputedStyle(e).backgroundColor)) === 'rgb(231, 243, 248)', 'page background survives a reload');
  check(await count('.draw-img') === 1, 'pictures in a drawing survive a reload');
  check(await waitFor(async () => await count('.pdf-page') === 2) && (await pdfInk()).join() === '1=1', 'the PDF and its annotations survive a reload');
  await sleep(500);
  const inked = await page.evaluate(() => { const c = document.querySelector('.draw-base'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  check(inked > 1500, 'drawing is repainted after a reload: ' + inked);
});

await section('favourites and quick find', async () => {
  await page.click('.top-fav'); await sleep(150);
  check((await texts('.side-favs .tree-title')).join() === 'Matemáticas II', 'starred page appears under Favoritos');
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control'); await sleep(200);
  check(await page.evaluate(() => document.activeElement?.closest('.finder') !== null), 'Ctrl+K opens quick find with the input focused');
  await type('contenido del'); await sleep(200);
  check((await texts('.finder-item')).length === 1 && (await text('.finder-item')).includes('Tema 1'), 'quick find searches inside pages');
  await shot('05-finder');
  await press('Enter'); await sleep(250);
  check((await page.$eval('.page-title', e => e.textContent)) === 'Tema 1: Límites', 'Enter opens the result');
});

await section('second subject and timetable', async () => {
  await page.click('.book-add'); await sleep(250);
  await type('Física'); await sleep(100);
  await clickText('.side-item', 'Horario'); await sleep(200);
  const add = async (subj, day, start, end, room) => {
    await clickText('.view-actions button', 'Clase');
    await page.evaluate((subj, day, start, end, room) => {
      const f = document.querySelector('.modal form'); const [sub, dayS] = f.querySelectorAll('select'); const times = f.querySelectorAll('input[type=time]'); const txt = f.querySelectorAll('input[type=text]');
      sub.selectedIndex = subj; dayS.value = String(day); times[0].value = start; times[1].value = end; txt[1].value = room;
    }, subj, day, start, end, room);
    await clickText('.modal button', 'Guardar');
  };
  const today = (new Date().getDay() + 6) % 7, d = today > 4 ? 2 : today;
  check((await page.$$eval('.modal-probe, .tt', e => e.length)) >= 1, 'timetable grid is shown');
  await add(1, 0, '08:30', '09:25', 'A12'); await add(2, 0, '09:25', '10:20', 'Lab'); await add(1, 2, '10:45', '11:40', ''); await add(2, d, '12:35', '13:30', 'Lab');
  check(await count('.tt-slot') === 4, 'classes appear in the grid');
  check((await texts('.tt-slot strong')).includes('Física'), 'a class shows its subject name');
  await clickText('.view-actions button', 'Clase');
  await page.evaluate(() => { const t = document.querySelectorAll('.modal input[type=time]'); t[0].value = '10:00'; t[1].value = '09:00'; document.querySelector('.modal select').selectedIndex = 1; });
  await clickText('.modal button', 'Guardar');
  check(await visible('.modal') && await visible('.toast'), 'a class that ends before it starts is rejected with a message');
  await page.click('.modal-close'); await sleep(3300);
  await shot('06-timetable');
});

await section('calendar and tasks', async () => {
  await clickText('.side-item', 'Calendario'); await sleep(200);
  const add = async (title, kind, offset) => {
    await clickText('.view-actions button', 'Nuevo');
    await page.evaluate((title, kind, offset) => {
      const f = document.querySelector('.modal form'); f.querySelector('input[type=text]').value = title; f.querySelectorAll('select')[0].selectedIndex = kind;
      const d = new Date(); d.setDate(d.getDate() + offset); f.querySelector('input[type=date]').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, title, kind, offset);
    await clickText('.modal button', 'Guardar');
  };
  await add('Examen de derivadas', 0, 0); await add('Entrega de problemas', 1, 2);
  check((await texts('.cal-ev')).some(t => t.includes('Examen de derivadas')), 'events show inside the month grid');
  check((await texts('.cal-cell.today .cal-ev')).length >= 1, 'today is marked and holds its event');
  await shot('07-calendar');
  await clickText('.side-item', 'Tareas'); await sleep(200);
  for (const t of ['Ejercicios 3 y 4', 'Leer capítulo 2']) { await page.click('.quick input'); await type(t, true); await sleep(100); }
  check(await count('.task') === 2, 'tasks are added with Enter');
  await page.click('.task .todo-box'); await sleep(120);
  check(await count('.task.done') === 1, 'a task can be ticked');
  await shot('08-tasks');
  await clickText('.side-item', 'Inicio'); await sleep(250);
  check((await text('.view')).includes('Examen de derivadas') && (await text('.view')).includes('Matemáticas II'), 'home shows upcoming events and recent pages');
  await shot('09-home');
});

await section('trash', async () => {
  await clickText('.tree-row .tree-title', 'Física'); await sleep(250);
  await page.click('.top-more'); await sleep(150);
  await clickText('.pop .menu-item', 'Eliminar'); await sleep(250);
  check(!(await texts('.tree-row .tree-title')).includes('Física') && !(await route()).startsWith('page/'), 'deleting a page removes it from the tree and leaves the page');
  check((await texts('.tt-slot, .view')).join(' ').length > 0, 'app still renders after deleting');
  await clickText('.side-item', 'Papelera'); await sleep(200);
  check((await text('.view')).includes('Física'), 'deleted page is listed in the trash');
  await clickText('.view button', 'Restaurar'); await sleep(200);
  check((await texts('.tree-row .tree-title')).includes('Física'), 'restoring puts it back in the tree');
});

await section('backup', async () => {
  const rt = await page.evaluate(async () => {
    const S = await import('./js/store.js');
    const data = await S.exportAll(); const json = JSON.stringify(data);
    await S.importAll(JSON.parse(json));
    return { docs: data.docs.length, drawings: data.drawings.length, blobs: data.blobs.length };
  });
  check(rt.docs >= 10 && rt.drawings === 2 && rt.blobs === 3, 'backup exports and re-imports everything: ' + JSON.stringify(rt));
});

await section('dark mode', async () => {
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await clickText('.tree-row .tree-title', 'Matemáticas II'); await sleep(500);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg === 'rgb(25, 25, 25)', 'dark mode uses the dark background: ' + bg);
  await shot('10-dark');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
});

await section('phone', async () => {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  const off = () => page.evaluate(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1);
  check(await off(), 'sidebar is off-screen on a phone');
  check(await visible('.kbar'), 'phone shows the editing toolbar');
  const noOverflow = async where => check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('.scroll').scrollWidth > document.querySelector('.scroll').clientWidth + 1)), 'no sideways scrolling on a phone: ' + where);
  await noOverflow('page');
  await shot('m1-page');
  await page.tap('.kbar [aria-label="Añadir bloque"]'); await sleep(250);
  check(await visible('.slash'), 'toolbar + opens the block menu');
  await shot('m2-slash');
  await clickText('.slash-item', 'Lista con viñetas'); await sleep(150);
  check((await blocks()).some(b => b.t === 'bullet' && b.text === ''), 'choosing from the toolbar menu adds that block');
  await page.tap('.side-toggle'); await sleep(350);
  check(!(await off()), 'the menu button slides the sidebar in');
  await shot('m3-sidebar');
  await clickText('.side-item', 'Horario'); await sleep(350);
  check(await off() && await count('.tt') === 1, 'choosing an item closes the sidebar and opens it');
  await noOverflow('timetable'); await shot('m4-timetable');
  await page.tap('.side-toggle'); await sleep(300); await clickText('.side-item', 'Calendario'); await sleep(350);
  await noOverflow('calendar'); await shot('m5-calendar');
  await page.tap('.side-toggle'); await sleep(300); await clickText('.side-item', 'Inicio'); await sleep(350);
  await noOverflow('home'); await shot('m6-home');
});

console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);
