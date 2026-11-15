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
// Enter inside a text block is a new line of that block; Ctrl+Enter starts another block.
const newBlock = async () => { await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control'); await sleep(150); };
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

// Cloud sync is off until its own section, which swaps Firebase for a cloud kept in this process.
await page.evaluateOnNewDocument(() => { window.__cuadernoCloud = { off: true }; });
await page.goto(URL0, { waitUntil: 'networkidle0' });

await section('shell', async () => {
  check(await visible('.sidebar'), 'sidebar is visible on a tablet');
  const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(paper === 'rgb(255, 255, 255)', 'the default theme is white: ' + paper);
  check(await count('.tabx') === 1 && (await text('.tabx.on')).includes('Inicio'), 'starts with one tab on Inicio');
  check(await page.evaluate(() => [document.documentElement, document.body, document.querySelector('.scroll'), document.querySelector('.side-item'), document.querySelector('.view'), document.querySelector('.home-hero h1')].every(e => getComputedStyle(e).touchAction === 'manipulation')), 'a double tap does not zoom the screen (scrolling and pinching still work)');
  const taps = await page.evaluate(() => {
    const tap = (el, x) => { const e = new Event('touchend', { bubbles: true, cancelable: true }); Object.defineProperty(e, 'touches', { value: [] }); Object.defineProperty(e, 'changedTouches', { value: [{ clientX: x, clientY: 200 }] }); el.dispatchEvent(e); return e.defaultPrevented; };
    const el = document.querySelector('.home-hero h1');
    let clicks = 0; const btn = document.querySelector('.home-edit'); btn.addEventListener('click', () => clicks++);
    const out = { first: tap(el, 300), second: tap(el, 304), far: tap(el, 600), b1: tap(btn, 900), b2: tap(btn, 902), clicks };
    out.clicks = clicks;
    return out;
  });
  check(!taps.first && taps.second && !taps.far, 'the second tap of a double tap is stopped before the browser zooms: ' + JSON.stringify(taps));
  check(taps.b2 && taps.clicks === 1, 'a button tapped twice quickly still gets its second press');
  if (await page.$eval('.view', e => e.classList.contains('editing'))) await page.click('.home-edit');
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
  await type('Texto normal'); await newBlock();
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
  await caretIn('Paso oculto');
  await newBlock(); await press('Backspace');
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
  check(await count('.draw-bar input.stroke-range') === 1 && await count('.draw-bar [aria-label="Trazo fino"]') === 0, 'line thickness is a slider, not three fixed sizes');
  await page.$eval('.draw-bar input.stroke-range', e => { e.value = '9.5'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(100);
  const nb = await (await page.$('.draw-live')).boundingBox();
  await stroke([[nb.x + 420, nb.y + 100], [nb.x + 470, nb.y + 105], [nb.x + 520, nb.y + 100]]); await sleep(600);
  const lastSize = await page.evaluate(async () => new Promise(r => { const q = indexedDB.open('cuaderno'); q.onsuccess = () => { const g = q.result.transaction('drawings').objectStore('drawings').getAll(); g.onsuccess = () => r(g.result[0].strokes.at(-1).s); }; }));
  check(lastSize === 9.5, 'a stroke uses the thickness picked on the slider: ' + lastSize);
  check(await page.$eval('.draw-bar input.stroke-range', e => e.value === '9.5'), 'the slider keeps its value after the toolbar redraws');

  const barH = await page.$eval('.blk[data-t=draw] .draw-bar', e => e.offsetHeight);
  check(barH <= 46, 'the drawing tools fit in one compact row: ' + barH);
  check(await page.$eval('.draw-base', c => c.width / c.clientWidth >= 2), 'the sheet is drawn with enough detail to look smooth');
  const lastStroke = () => page.evaluate(async () => new Promise(r => { const q = indexedDB.open('cuaderno'); q.onsuccess = () => { const g = q.result.transaction('drawings').objectStore('drawings').getAll(); g.onsuccess = () => r(g.result[0].strokes.at(-1)); }; }));
  check(await count('.blk[data-t=draw] .draw-bar .tb.color') === 4 && await count('.blk[data-t=draw] .draw-bar .tb.color.on') === 1, 'four colours are in view on the toolbar, one of them in use');
  await page.evaluate(() => document.querySelectorAll('.blk[data-t=draw] .draw-bar .tb.color')[1].click()); await sleep(120);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('cuaderno:draw')).color) === 'blue' && !(await visible('.color-pop')), 'tapping another of the four colours just switches to it');
  await page.evaluate(() => document.querySelectorAll('.blk[data-t=draw] .draw-bar .tb.color')[0].click()); await sleep(120);
  const slide = (cls, v) => page.$eval('.color-pop .color-range.' + cls, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
  await page.click('.blk[data-t=draw] .draw-bar .tb.color.on'); await sleep(150);
  check(await visible('.color-pop') && await count('.color-pop .color-inks .tb') === 7 && await count('.color-pop .color-range') === 3, 'the colour button opens the usual inks and sliders for any colour');
  await slide('hue', 200); await slide('sat', 100); await slide('lum', 50); await sleep(100);
  check(await page.$eval('.color-hex', e => e.value) === '#00aaff', 'the sliders show the colour as hexadecimal: ' + await page.$eval('.color-hex', e => e.value));
  await press('Escape'); await sleep(100);
  const nb2 = await (await page.$('.draw-live')).boundingBox();
  await stroke([[nb2.x + 560, nb2.y + 60], [nb2.x + 600, nb2.y + 70], [nb2.x + 640, nb2.y + 60]]); await sleep(600);
  check((await lastStroke()).c === '#00aaff', 'the pen writes in the colour made with the sliders: ' + (await lastStroke()).c);
  await page.click('.blk[data-t=draw] .draw-bar .tb.color.on'); await sleep(150);
  check(await page.$$eval('.color-recent .tb', b => b.map(x => x.dataset.color)).then(a => a[0] === '#00aaff' && a.length <= 8), 'a colour used for writing is kept among the recent ones');
  await page.$eval('.color-hex', e => { e.value = 'F00'; e.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(100);
  check(await page.$eval('.color-pop .color-range.hue', e => e.value) === '0' && await page.$eval('.blk[data-t=draw] .draw-bar .tb.color.on .dot', e => getComputedStyle(e).backgroundColor) === 'rgb(255, 0, 0)', 'a colour can also be typed as hexadecimal');
  await page.click('.color-pop [data-ink=ink]'); await sleep(100);
  await press('Escape'); await sleep(100);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('cuaderno:draw')).color) === 'ink', 'and the usual inks are one tap away');

  await page.click('.blk[data-t=draw] .bg-pick'); await sleep(150);
  const papers = (await texts('.pop .menu-label')).join('|');
  check(papers === 'Cuadrícula|Rayas|Puntos|Tian zi ge (田字格)|Liso', 'the paper is chosen from a list: ' + papers);
  await clickText('.pop .menu-item', 'Tian zi ge'); await sleep(150);
  const paper = () => page.$eval('.blk[data-t=draw] .draw-stage', e => e.className.match(/bg-\w+/)[0] + ' ' + getComputedStyle(e).backgroundImage.slice(0, 24));
  check((await paper()).startsWith('bg-tian none') && await page.$eval('.blk[data-t=draw] .draw-stage', e => getComputedStyle(e, '::before').maskImage.includes('svg') || getComputedStyle(e, '::before').webkitMaskImage.includes('svg')), 'tian zi ge paper: ' + await paper());
  await page.click('.blk[data-t=draw] .bg-pick'); await sleep(150); await clickText('.pop .menu-item', 'Puntos'); await sleep(150);
  check((await paper()).startsWith('bg-dots radial-gradient'), 'dotted paper: ' + await paper());
  await shot('02a-draw-dots');
  await page.click('.blk[data-t=draw] .bg-pick'); await sleep(150); await clickText('.pop .menu-item', 'Cuadrícula'); await sleep(150);
  const ruleC = () => page.$eval('.blk[data-t=draw] .draw-stage', e => e.style.getPropertyValue('--rule-c'));
  await page.click('.blk[data-t=draw] .rule-pick'); await sleep(150);
  const rules = (await texts('.pop .menu-label')).join('|');
  check(rules.startsWith('Automático|Gris|Marrón') && rules.endsWith('Granate'), 'the colour of the lines is chosen from a list: ' + rules);
  await clickText('.pop .menu-item', 'Rojo'); await sleep(150);
  check(await ruleC() === 'var(--c-red)' && await page.$eval('.blk[data-t=draw] .draw-stage', e => getComputedStyle(e).getPropertyValue('--rc').trim()) !== '', 'the lines take the chosen colour: ' + await ruleC());
  await page.click('.blk[data-t=draw] .rule-pick'); await sleep(150); await clickText('.pop .menu-item', 'Automático'); await sleep(150);
  check(await ruleC() === '', 'Automático goes back to following the page colour');
});

await section('pictures on the drawing sheet', async () => {
  writeFileSync(`${OUT}/photo.png`, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC', 'base64'));
  await page.$eval('.blk[data-t=draw]', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  const big = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#7fd4a8'; x.fillRect(0, 0, 600, 400); x.fillStyle = '#1f6f4a'; x.fillRect(40, 40, 200, 120); return c.toDataURL('image/png').split(',')[1]; });
  writeFileSync(`${OUT}/big.png`, Buffer.from(big, 'base64'));
  await (await page.$('.blk[data-t=draw] input.draw-file')).uploadFile(`${OUT}/big.png`); await sleep(1300);
  const img = () => page.$eval('.draw-img', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, loaded: e.naturalWidth > 0 }; });
  check(await count('.draw-img') === 1 && (await img()).loaded, 'a picture can be inserted into the drawing');
  check(await page.$eval('.draw-bar [aria-label="Mover imágenes"]', e => e.classList.contains('on')), 'inserting a picture switches to the move tool');
  const a = await img();
  await page.mouse.move(a.x + a.w / 2, a.y + a.h / 2); await page.mouse.down();
  await page.mouse.move(a.x + a.w / 2 + 80, a.y + a.h / 2 + 40, { steps: 6 }); await page.mouse.up(); await sleep(100);
  const b = await img();
  check(Math.abs(b.x - a.x - 80) < 3 && Math.abs(b.y - a.y - 40) < 3, 'dragging with the move tool moves the picture: ' + JSON.stringify([b.x - a.x, b.y - a.y]));
  await page.mouse.move(b.x + b.w - 4, b.y + b.h - 4); await page.mouse.down();
  await page.mouse.move(b.x + b.w + 56, b.y + b.h + 20, { steps: 6 }); await page.mouse.up(); await sleep(100);
  let c = await img();
  check(c.w > b.w + 40 && Math.abs(c.w / c.h - b.w / b.h) < 0.05, 'dragging its corner resizes it keeping the proportions: ' + JSON.stringify([b.w, c.w]));
  check(await visible('.draw-sel') && await count('.draw-sel .draw-grip') === 4, 'the selected picture shows a handle on each corner');
  await page.mouse.move(c.x + 4, c.y + 4); await page.mouse.down();
  await page.mouse.move(c.x + 64, c.y + 30, { steps: 6 }); await page.mouse.up(); await sleep(100);
  const c2 = await img();
  check(c2.w < c.w - 40 && Math.abs(c2.x + c2.w - c.x - c.w) < 2 && Math.abs(c2.y + c2.h - c.y - c.h) < 2, 'the top-left handle resizes too, keeping the opposite corner in place: ' + JSON.stringify([c.w, c2.w]));
  c = c2;
  const strokesBefore = (await drawings())[0];
  await page.click('.draw-bar [aria-label="Bolígrafo"]');
  await page.mouse.move(c.x + 5, c.y + 5); await page.mouse.down();
  await page.mouse.move(c.x + c.w - 5, c.y + c.h - 5, { steps: 6 }); await page.mouse.up(); await sleep(600);
  const d = await img();
  check((await drawings())[0] === strokesBefore + 1 && Math.abs(d.x - c.x) < 1, 'with the pen you write on top of the picture without moving it');
  const above = await page.evaluate(() => { const i = document.querySelector('.draw-img'), cv = document.querySelector('.draw-base'); return !!(i.compareDocumentPosition(cv) & Node.DOCUMENT_POSITION_FOLLOWING); });
  check(above, 'ink is painted above the picture');
  await (await page.$('.blk[data-t=draw] input.draw-file')).uploadFile(`${OUT}/big.png`); await sleep(1300);
  check(await count('.blk[data-t=draw] .draw-img') === 2 && await visible('.draw-del'), 'a selected picture shows a button to delete it');
  await page.click('.draw-del'); await sleep(700);
  check(await count('.blk[data-t=draw] .draw-img') === 1 && !(await visible('.draw-del')), 'the button deletes that picture and leaves the other');
  await page.click('.draw-bar [aria-label="Bolígrafo"]');
  const saved = await page.evaluate(async () => new Promise(r => { const q = indexedDB.open('cuaderno'); q.onsuccess = () => { const g = q.result.transaction('drawings').objectStore('drawings').getAll(); g.onsuccess = () => r(g.result[0].images?.length); }; }));
  check(saved === 1, 'the picture is saved with the drawing');
  await shot('02b-draw-picture');
});

await section('photo', async () => {
  writeFileSync(`${OUT}/photo.png`, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC', 'base64'));
  await (await page.$('input.photo-input')).uploadFile(`${OUT}/photo.png`); await sleep(700);
  check(await page.evaluate(() => { const i = document.querySelector('.blk[data-t=image] img'); return !!i && i.src.startsWith('blob:') && i.naturalWidth > 0; }), 'photo block shows the picture');
  await page.$eval('.blk[data-t=image]', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  const pw = () => page.$eval('.blk[data-t=image] img', e => e.getBoundingClientRect().width);
  const w0 = await pw(), grip = await (await page.$('.blk[data-t=image] .img-grip')).boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 - 200, grip.y + grip.height / 2, { steps: 6 }); await page.mouse.up(); await sleep(150);
  const w1 = await pw();
  check(Math.abs(w0 - w1 - 200) < 12, 'dragging the handle of a photo sets its size freely: ' + JSON.stringify([w0, w1]));
});

const pdfInk = () => page.evaluate(async () => new Promise(r => { const q = indexedDB.open('cuaderno'); q.onsuccess = () => { const g = q.result.transaction('drawings').objectStore('drawings').getAll(); g.onsuccess = () => r(g.result.filter(d => /:[0-9]+$/.test(d.id)).map(d => d.id.split(':')[1] + '=' + d.strokes.length)); }; }));
const waitFor = async (fn, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return true; await sleep(150); } return false; };

const pdfPos = () => page.$eval('.pdf-pos', e => e.textContent.trim());
const goPage = async n => { for (let i = 0; i < 6; i++) { const cur = Number((await pdfPos()).split('/')[0]); if (cur === n) return; await page.click(`.blk[data-t=pdf] .pdf-nav[aria-label="${cur < n ? 'Página siguiente' : 'Página anterior'}"]`); await sleep(250); } };
const shownSheets = () => page.$$eval('.pdf-page', els => els.filter(e => e.offsetParent).length);
await section('pdf', async () => {
  writeFileSync(`${OUT}/apuntes.pdf`, makePdf(2), 'latin1');
  await page.click('.page-tail'); await sleep(80);
  await type('/pdf'); await sleep(150);
  check((await texts('.slash-item .slash-label')).join() === 'PDF', 'the block menu offers PDF');
  await press('Escape'); for (let i = 0; i < 4; i++) await press('Backspace');
  await (await page.$('input.pdf-input')).uploadFile(`${OUT}/apuntes.pdf`);
  check(await waitFor(async () => await count('.blk[data-t=pdf] .pdf-page') === 2), 'an uploaded PDF shows one sheet per page');
  check((await text('.pdf-name')).includes('apuntes.pdf'), 'the PDF block shows the file name');
  check(await shownSheets() === 1 && await pdfPos() === '1 / 2', 'a PDF shows one page at a time: ' + await shownSheets() + ' ' + await pdfPos());
  await page.$eval('.pdf-page', e => e.scrollIntoView({ block: 'start' })); await sleep(200);
  const painted = () => page.$eval('.pdf-canvas', c => { if (!c.width) return false; const x = c.getContext('2d'), k = c.width / 595, d = x.getImageData(Math.round(200 * k), Math.round((842 - 660) * k), 1, 1).data; return d[2] > 150 && d[0] < 120; });
  check(await waitFor(painted), 'the PDF page itself is rendered');
  await page.click('.blk[data-t=pdf] .draw-bar [aria-label="Subrayador"]');
  const box = await (await page.$('.pdf-page .draw-live')).boundingBox();
  await page.mouse.move(box.x + 60, box.y + 260); await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 264, { steps: 8 }); await page.mouse.up(); await sleep(700);
  check((await pdfInk()).join() === '1=1', 'highlighting on a PDF page is saved for that page: ' + (await pdfInk()).join());
  check(await page.$eval('.blk[data-t=pdf] .draw-bar', e => getComputedStyle(e).position === 'sticky'), 'the PDF tools stay in view while scrolling its pages');
  await (await page.$('.blk[data-t=pdf] input.draw-file')).uploadFile(`${OUT}/big.png`); await sleep(1300);
  check(await count('.pdf-page .draw-img') === 1 && await page.$eval('.pdf-page .draw-img', e => e.naturalWidth > 0), 'a picture can be placed on a PDF sheet');
  check(await page.$eval('.pdf-row', r => !!r.querySelector('.pdf-page .draw-img')), 'the picture lands on the sheet being used');
  await goPage(2);
  check(await pdfPos() === '2 / 2' && await shownSheets() === 1 && await page.$$eval('.pdf-page .draw-img', els => els.filter(e => e.offsetParent).length) === 0, 'turning the page leaves the picture of page 1 behind');
  await goPage(1);
  check(await page.$$eval('.pdf-page .draw-img', els => els.filter(e => e.offsetParent).length) === 1, 'and it is still there when coming back');
  await page.click('.blk[data-t=pdf] .draw-bar [aria-label="Bolígrafo"]');
  await shot('02c-pdf');
});

await section('pdf margins', async () => {
  const rect = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; });
  const addTo = async (row, side, what) => {
    await goPage(row);
    await page.$eval(`.pdf-row:nth-child(${row})`, e => e.scrollIntoView({ block: 'center' })); await sleep(200);
    await page.click(`.pdf-row:nth-child(${row}) .pdf-side[data-side=${side}] .side-add`); await sleep(150);
    await clickText('.pop .menu-item', what); await sleep(200);
  };
  check(await count('.pdf-row') === 2 && await count('.pdf-side .side-add') === 4, 'every PDF sheet has a margin on each side to add things');
  await goPage(1);
  const before = await rect('.pdf-row:nth-child(1) .pdf-page');
  await addTo(1, 'r', 'Texto');
  check(await page.evaluate(() => document.activeElement?.classList.contains('note-text')), 'adding text to a margin starts writing in it');
  await type('nota al margen'); await sleep(100);
  const sheet = await rect('.pdf-row:nth-child(1) .pdf-page'), note = await rect('.side-note[data-t=text]');
  check(note.l >= sheet.r - 1 && note.t >= sheet.t - 1 && note.t < sheet.b, 'the note sits to the right of its sheet, at its height: ' + JSON.stringify([sheet, note]));
  check(sheet.w > before.w * 0.55, 'the sheet stays readable next to its notes: ' + JSON.stringify([before.w, sheet.w]));
  await goPage(2);
  const s2 = await rect('.pdf-row:nth-child(2) .pdf-page');
  check(Math.abs(s2.w - sheet.w) < 1 && Math.abs(s2.l - sheet.l) < 1, 'all the sheets of the PDF keep the same width and line up');
  await addTo(2, 'l', 'Imagen');
  await (await page.$('.blk[data-t=pdf] input.side-file')).uploadFile(`${OUT}/big.png`); await sleep(1300);
  const pic = await rect('.pdf-row:nth-child(2) .side-note[data-t=image] img'), sheet2 = await rect('.pdf-row:nth-child(2) .pdf-page');
  check(pic.w > 20 && pic.r <= sheet2.l + 1 && await page.$eval('.side-note[data-t=image] img', e => e.naturalWidth > 0), 'a picture can go in the left margin of a sheet');
  const g = await (await page.$('.side-note[data-t=image] .img-grip')).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 - 60, g.y + g.height / 2, { steps: 5 }); await page.mouse.up(); await sleep(150);
  check((await rect('.side-note[data-t=image] img')).w < pic.w - 30, 'a picture in the margin can be resized by hand');
  await addTo(1, 'r', 'Dibujo');
  check(await count('.pdf-row:nth-child(1) .side-note[data-t=draw] .draw-live') === 1, 'a drawing can go in a margin');
  await page.click('.blk[data-t=pdf] .draw-bar [aria-label="Bolígrafo"]');
  await page.$eval('.side-note[data-t=draw]', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  const d = await (await page.$('.side-note[data-t=draw] .draw-live')).boundingBox();
  await page.mouse.move(d.x + 10, d.y + 20); await page.mouse.down();
  await page.mouse.move(d.x + d.width - 10, d.y + 40, { steps: 6 }); await page.mouse.up(); await sleep(700);
  const marginInk = await page.evaluate(async () => {
    const id = document.querySelector('.side-note[data-t=draw]').dataset.id;
    return new Promise(r => { const q = indexedDB.open('cuaderno'); q.onsuccess = () => { const g = q.result.transaction('drawings').objectStore('drawings').get(id); g.onsuccess = () => r(g.result?.strokes.length); }; });
  });
  check(marginInk === 1 && (await pdfInk()).join() === '1=1', 'the PDF tools draw on the margin drawing, not on the sheet: ' + marginInk);
  await addTo(2, 'r', 'Texto');
  await type('sobra'); await sleep(100);
  check(await count('.side-note') === 4, 'several things can be added around a PDF');
  await page.evaluate(() => [...document.querySelectorAll('.side-note')].find(e => e.textContent.includes('sobra')).querySelector('.note-del').click()); await sleep(150);
  check(await count('.side-note') === 3 && !(await text('.blk[data-t=pdf]')).includes('sobra'), 'a margin note can be removed');
  await shot('02d-pdf-margins');
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
  check(await visible('.fbar'), 'selecting text shows the formatting bar');
  await page.click('.fbar [aria-label="Negrita"]');
  await page.click('.fbar [aria-label="Código"]'); await sleep(100);
  const html = await page.evaluate(() => [...document.querySelectorAll('.blk .content')].find(e => e.textContent === 'Texto normal').innerHTML);
  check(/<b|font-weight/.test(html) && /<code/.test(html), 'bold and inline code are applied: ' + html);
  await shot('03-bubble');
  await press('ArrowRight'); await sleep(250);
  check(!(await visible('.fbar')), 'the formatting bar hides when the selection collapses');
});

await section('long text, alignment and colour', async () => {
  await press('End'); await newBlock();
  const before = await count('.blk');
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', 'Encabezado\nlínea uno\n\nlínea dos');
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await sleep(200);
  check(await count('.blk') === before, 'a long pasted text stays in one block: ' + before + ' -> ' + await count('.blk'));
  const para = word => page.evaluate(word => {
    const d = [...document.querySelectorAll('.blk .content div')].find(e => e.textContent === word);
    const r = document.createRange(); r.selectNodeContents(d); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  }, word);
  const lines = () => page.evaluate(() => [...document.querySelectorAll('.blk .content div')].map(e => e.textContent).join('|'));
  check((await lines()).includes('Encabezado|línea uno||línea dos') || (await lines()).includes('Encabezado|línea uno|'), 'its lines are paragraphs of that block: ' + await lines());
  await para('Encabezado'); await sleep(250);
  await page.click('.fbar [aria-label="Centrar"]'); await sleep(150);
  const centred = await page.evaluate(() => [...document.querySelectorAll('.blk .content div')].find(e => e.textContent === 'Encabezado')?.style.textAlign);
  check(centred === 'center', 'a paragraph can be centred inside its block: ' + centred);
  await para('línea uno'); await sleep(250);
  await page.click('.fbar [aria-label="Color del texto"]'); await sleep(150);
  await clickText('.pop .menu-item', 'Rojo'); await sleep(150);
  const red = await page.evaluate(() => { const s = document.querySelector('.blk .content [data-c=red]'); return s && [s.textContent, getComputedStyle(s).color]; });
  check(red && red[0] === 'línea uno' && red[1] === 'rgb(212, 76, 71)', 'the selected part takes the text colour: ' + JSON.stringify(red));
  await para('línea dos'); await sleep(250);
  await page.click('.fbar [aria-label="Resaltar"]'); await sleep(150);
  const swatches = await count('.pop .menu-item');
  check(swatches >= 12, 'many highlight colours are offered: ' + swatches);
  await press('Escape'); await sleep(100);
  const kept = await page.evaluate(async () => {
    const { sanitize } = await import('/js/util.js');
    return sanitize('<div style="text-align:right;position:fixed"><span data-c="red" style="x:y">a</span><span data-c="evil">b</span></div>');
  });
  check(kept === '<div style="text-align: right;"><span data-c="red">a</span><span>b</span></div>', 'saved text keeps alignment and palette colours only: ' + kept);
  // After highlight/align the browser writes bold/italic as styled spans: sanitize must keep them as real tags.
  const styled = await page.evaluate(async () => {
    const { sanitize } = await import('/js/util.js');
    return sanitize('<span style="font-weight: bold;">a</span><span style="font-style: italic;">b</span><span style="font-weight: bold; font-style: italic; text-decoration: underline;">c</span>');
  });
  check(styled === '<b>a</b><i>b</i><u><i><b>c</b></i></u>', 'bold/italic written as styles survive as tags: ' + styled);
});

await section('enter stays inside a text block', async () => {
  await newBlock();
  const n = await count('.blk');
  await type('uno'); await press('Enter'); await type('dos'); await sleep(100);
  check(await count('.blk') === n, 'Enter in a text block does not create another block: ' + n + ' -> ' + await count('.blk'));
  const inner = await page.evaluate(() => document.activeElement.innerText);
  check(/uno/i.test(inner) && /dos/i.test(inner), 'both lines live in that block: ' + JSON.stringify(inner));
  await newBlock();
  check(await count('.blk') === n + 1, 'Ctrl+Enter starts a new block: ' + await count('.blk'));
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
  await newBlock(); await type('debajo de la fila');
  check(await top3() === 'Texto normal|Derivadas|Debajo de la fila', 'Enter inside a column continues below the row: ' + await top3());
  const a = await box('Texto normal'), b = await box('Derivadas'), c = await box('Debajo de la fila');
  check(c.t >= Math.max(a.b, b.b) - 1 && c.r - c.l > (a.r - a.l) * 1.5, 'the block under a row is full width again');
  await menuOf(1, 'Sacar de la columna');
  check(!(await beside()) && await top3() === 'Texto normal|Derivadas|Debajo de la fila', 'a block can be taken out of its column');
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
  const veil = await page.evaluate(() => {
    const sc = document.querySelector('.scroll'), inner = document.querySelector('.page-inner'), img = getComputedStyle(sc).backgroundImage;
    const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(img) || /color\(srgb [\d. ]+\/ ([\d.]+)\)/.exec(img);
    return { panel: getComputedStyle(inner).backgroundColor, gradient: img.includes('gradient'), alpha: m ? Number(m[1]) : 1, img: img.slice(0, 90) };
  });
  check(veil.panel === 'rgba(0, 0, 0, 0)' && veil.gradient, 'the tint over a background picture covers the whole picture, with no misaligned panel: ' + JSON.stringify(veil));
  check(veil.alpha <= 0.5, 'the tint over a background picture is light: ' + veil.alpha);
  await shot('04c-background-image');
  await page.hover('.page-head');
  await clickText('.page-ctl button', 'Fondo');
  await page.click('.pop .bg-grid [data-bg="blue"]'); await sleep(150);
  check((await bg()).c === 'rgb(231, 243, 248)' && (await bg()).i === 'none', 'choosing a colour replaces the picture: ' + JSON.stringify(await bg()));
  const sheet = () => page.$eval('.blk[data-t=draw] .draw-stage', e => { const s = getComputedStyle(e); return { bg: getComputedStyle(e.closest('.draw')).backgroundColor, rule: s.getPropertyValue('--rule-c').trim() }; });
  check((await sheet()).bg === 'rgb(255, 255, 255)', 'the handwriting sheet is white whatever the page colour: ' + JSON.stringify(await sheet()));
  check(/^color-mix/.test((await sheet()).rule) && (await sheet()).rule.toLowerCase().includes('#e7f3f8'), 'its lines are a darker tone of the page colour: ' + (await sheet()).rule);
  await page.hover('.page-head'); await clickText('.page-ctl button', 'Fondo'); await page.click('.pop .bg-grid [data-bg="beige"]'); await sleep(150);
  check((await sheet()).rule.includes('#8b5e34'), 'on a beige page the lines are brown: ' + (await sheet()).rule);
  await page.hover('.page-head'); await clickText('.page-ctl button', 'Fondo'); await page.click('.pop .bg-grid [data-bg="blue"]'); await sleep(150);
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
  // Each tab keeps its own scroll position.
  await page.addStyleTag({ content: '.view { min-height: 3000px !important; }' });
  const top = () => page.$eval('.scroll', e => Math.round(e.scrollTop));
  await page.$eval('.scroll', e => { e.scrollTop = 400; }); await sleep(150);
  await page.click('.tabx:nth-child(2)'); await sleep(250);
  check(await top() === 0, 'another tab starts at the top: ' + await top());
  await page.$eval('.scroll', e => { e.scrollTop = 150; }); await sleep(100);
  await page.click('.tabx:first-child'); await sleep(300);
  check(Math.abs(await top() - 400) < 3, 'coming back to a tab restores where you were: ' + await top());
  await page.click('.tabx:nth-child(2)'); await sleep(300);
  check(Math.abs(await top() - 150) < 3, 'and the other tab kept its own position: ' + await top());
  await page.click('.tabx:first-child'); await sleep(250);
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
  check(await count('.blk[data-t=draw] .draw-img') === 1, 'pictures in a drawing survive a reload');
  check(await waitFor(async () => await count('.pdf-page') === 2) && (await pdfInk()).join() === '1=1', 'the PDF and its annotations survive a reload');
  check(await count('.side-note') === 3 && (await text('.side-note[data-t=text]')).includes('nota al margen'), 'PDF margin notes survive a reload');
  check(await count('.pdf-page .draw-img') === 1, 'the picture on a PDF sheet survives a reload');
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
  // Festivo: no subject or time, and the whole day takes a colour.
  await clickText('.view-actions button', 'Nuevo');
  const vis = label => page.evaluate(l => { const f = [...document.querySelectorAll('.modal .field')].find(x => x.textContent.startsWith(l)); return !!f && f.offsetParent !== null; }, label);
  check(await vis('Asignatura') && await vis('Hora') && !(await vis('Color del día')), 'a normal event asks for subject and time, not for a day colour');
  await page.evaluate(() => { const s = document.querySelectorAll('.modal form select')[0]; s.value = 'festivo'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(100);
  check(!(await vis('Asignatura')) && !(await vis('Hora')) && await vis('Color del día'), 'a holiday hides subject and time and offers a day colour');
  await page.evaluate(() => { const f = document.querySelector('.modal form'); f.querySelector('input[type=text]').value = 'Día del Pilar'; const d = new Date(); d.setDate(d.getDate() + 1); f.querySelector('input[type=date]').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await clickText('.modal button', 'Guardar'); await sleep(200);
  const holiday = () => page.evaluate(() => { const c = [...document.querySelectorAll('.cal-cell.holiday')]; return c.map(x => getComputedStyle(x).backgroundColor); });
  check((await holiday()).join() === 'rgb(251, 236, 221)', 'the day of a holiday is light orange: ' + await holiday());
  await page.click('.cal-cell.holiday'); await sleep(150);
  await page.evaluate(() => { const s = [...document.querySelectorAll('.modal .field')].find(x => x.textContent.startsWith('Color del día')).querySelector('select'); s.value = 'green'; });
  await clickText('.modal button', 'Guardar'); await sleep(200);
  check((await holiday()).join() === 'rgb(237, 243, 236)', 'the holiday colour can be changed: ' + await holiday());
  // A range of dates: every day of it takes the colour.
  await page.click('.cal-cell.holiday'); await sleep(150);
  check(await vis('Hasta el'), 'a holiday can have an end date');
  await page.evaluate(() => { const f = [...document.querySelectorAll('.modal .field')].find(x => x.textContent.startsWith('Hasta el')).querySelector('input'); const s = document.querySelector('.modal form input[type=date]').value.split('-').map(Number); const d = new Date(s[0], s[1] - 1, s[2] + 2); f.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await clickText('.modal button', 'Guardar'); await sleep(200);
  const spanDays = await page.$$eval('.cal-cell.holiday:not(.out)', c => c.length);
  check(spanDays >= 2 && spanDays <= 3, 'every day of the range is coloured: ' + spanDays);
  const named = (await texts('.cal-ev')).filter(t => t.includes('Pilar')).length;
  check(named === 0, 'a holiday only colours its days, with no chip: ' + named);
  const holNames = (await texts('.cal-hol')).filter(x => x.includes('Pilar')).length;
  check(holNames === 2, 'a multi-day holiday writes its name on the first and last day only: ' + holNames);
  await page.click('.cal-cell.holiday'); await sleep(150);
  await page.evaluate(() => { const f = [...document.querySelectorAll('.modal .field')].find(x => x.textContent.startsWith('Hasta el')).querySelector('input'); f.value = '2000-01-01'; });
  await clickText('.modal button', 'Guardar'); await sleep(200);
  check(await visible('.modal') && await visible('.toast'), 'an end date before the start is refused');
  await press('Escape'); await sleep(150);
  await clickText('.side-item', 'Tareas'); await sleep(200);
  for (const t of ['Ejercicios 3 y 4', 'Leer capítulo 2']) { await page.click('.quick input'); await type(t, true); await sleep(100); }
  check(await count('.task') === 2, 'tasks are added with Enter');
  await page.click('.task .todo-box'); await sleep(120);
  check(await count('.task.done') === 1, 'a task can be ticked');
  await shot('08-tasks');
  // Own calendar kinds
  await clickText('.side-item', 'Calendario'); await sleep(200);
  await clickText('.view-actions button', 'Tipos'); await sleep(150);
  await clickText('.modal button', 'Nuevo tipo'); await sleep(150);
  await page.evaluate(() => { document.querySelector('.modal form input[type=text]').value = 'Gimnasio'; });
  await clickText('.modal button', 'Guardar'); await sleep(200);
  await clickText('.view-actions button', 'Nuevo'); await sleep(150);
  check((await page.$$eval('.modal form select option', o => o.map(x => x.textContent))).includes('Gimnasio'), 'a custom kind is offered when creating an event');
  await press('Escape'); await sleep(150);
  // Task categories and drag to reorder
  await clickText('.side-item', 'Tareas'); await sleep(200);
  await clickText('.view-actions button', 'Categoría'); await sleep(150);
  await page.evaluate(() => { document.querySelector('.modal form input[type=text]').value = 'Casa'; });
  await clickText('.modal button', 'Guardar'); await sleep(200);
  check(await count('.task-group') === 2, 'a task category adds a group');
  const box = async sel => { const r = await page.$eval(sel, e => { const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }); return r; };
  const [hx, hy] = await box('.task-group[data-group=""] .task:not(.done) .task-drag');
  const [tx, ty] = await box('.task-group:not([data-group=""]) .group-empty');
  await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.move(tx, ty, { steps: 6 }); await page.mouse.up(); await sleep(250);
  check(await count('.task-group:not([data-group=""]) .task') === 1, 'dragging a task into a category moves it there');
  await clickText('.side-item', 'Inicio'); await sleep(250);
  check((await text('.view')).includes('Examen de derivadas') && (await text('.view')).includes('Matemáticas II'), 'home shows upcoming events and recent pages');
  await shot('09-home');
});

await section('photo widget', async () => {
  check(await count('.photo-widget') === 1 && await visible('.photo-empty'), 'home has a photo widget that starts empty');
  await (await page.$('input.photo-widget-input')).uploadFile(`${OUT}/big.png`, `${OUT}/photo.png`); await sleep(900);
  check(await page.evaluate(() => { const i = document.querySelector('.photo-widget img.photo-now'); return !!i && i.naturalWidth > 0; }), 'uploaded photos are shown in the widget');
  check((await text('.photo-count')).includes('2'), 'the widget says how many photos it holds: ' + await text('.photo-count'));
  check((await page.$$eval('.photo-every option', o => o.map(x => x.value))).join() === '1,3,24', 'the photo changes every hour, every 3 hours or once a day');
  await page.select('.photo-every', '24'); await sleep(150);
  const which = await page.evaluate(async () => {
    const M = await import('./js/model.js'), S = await import('./js/store.js'), d = S.get('photos'), tz = new Date().getTimezoneOffset();
    const shown = document.querySelector('.photo-widget img.photo-now').dataset.blob;
    return { every: d.every, ok: d.items[M.photoIndex(Date.now(), d.every, d.items.length, tz)] === shown };
  });
  check(which.every === 24 && which.ok, 'the photo shown is the one due for the chosen interval: ' + JSON.stringify(which));
  await clickText('.side-item', 'Tareas'); await sleep(150); await clickText('.side-item', 'Inicio'); await sleep(300);
  check(await page.$eval('.photo-every', e => e.value === '24') && await count('.photo-widget img.photo-now') === 1, 'the widget remembers its photos and interval');
  await clickText('.photo-widget button', 'Gestionar'); await sleep(200);
  check(await count('.modal .photo-thumb') === 2, 'the photos can be reviewed');
  await page.click('.modal .photo-thumb .photo-del'); await sleep(200);
  check(await count('.modal .photo-thumb') === 1, 'a photo can be removed from the widget');
  await page.click('.modal-close'); await sleep(200);
  check((await text('.photo-count')).includes('1'), 'the widget updates after removing a photo');
  await shot('09b-photo-widget');
});

await section('home board', async () => {
  const kinds = () => page.$$eval('.home-grid .widget', els => els.map(e => e.dataset.t).join());
  const rect = t => page.$eval(`.widget[data-t=${t}]`, e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; });
  const drag = async (from, to) => { await page.mouse.move(from[0], from[1]); await page.mouse.down(); await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 6 }); await page.mouse.move(to[0], to[1], { steps: 8 }); await page.mouse.up(); await sleep(200); };
  const addWidget = async name => { await page.click('.home-add'); await sleep(150); await clickText('.pop .menu-item', name); await sleep(250); };
  await page.evaluate(() => { document.querySelector('.scroll').scrollTop = 0; });
  check(await kinds() === 'hello,photos,recent,classes,events,tasks', 'Inicio starts with the same things as before, as widgets: ' + await kinds());
  check(!(await visible('.w-resize')), 'outside edit mode there are no handles in the way');
  await page.click('.home-edit'); await sleep(150);
  check(await page.$eval('.view', e => e.classList.contains('editing')) && await visible('.w-resize'), 'Editar shows the handles');
  await page.click('.home-add'); await sleep(150);
  const offered = (await texts('.pop .menu-label')).join('|');
  check(offered === 'Fotos que van cambiando|Reloj|Pomodoro|Texto|Imagen fija', 'new widgets can be added; the built-in ones already there are not offered twice: ' + offered);
  await clickText('.pop .menu-item', 'Reloj'); await sleep(250);
  check(/^\d\d:\d\d/.test(await text('.widget[data-t=clock]')), 'a clock shows the time: ' + await text('.widget[data-t=clock] .clock-time'));

  // Resize: the photos become narrower and the clock slots in beside them.
  await page.evaluate(() => { document.querySelector('.scroll').scrollTop = 0; }); await sleep(150);
  const p0 = await rect('photos'), grip = await (await page.$('.widget[data-t=photos] .w-resize')).boundingBox();
  await drag([grip.x + grip.width / 2, grip.y + grip.height / 2], [p0.l + p0.w * 0.66, p0.b - 100]);
  const p1 = await rect('photos'), c1 = await rect('clock');
  check(Math.abs(p1.w / p0.w - 8 / 12) < 0.03 && p1.h < p0.h - 60, 'dragging the corner resizes a widget in whole cells: ' + JSON.stringify([Math.round(p0.w), Math.round(p1.w), Math.round(p0.h), Math.round(p1.h)]));
  check(c1.l >= p1.r && Math.abs(c1.t - p1.t) < 2, 'the others fit themselves into the free space: the clock sits beside the photos: ' + JSON.stringify([c1.l, p1.r, c1.t, p1.t]));
  check(await page.evaluate(() => document.querySelector('.scroll').scrollWidth <= document.querySelector('.scroll').clientWidth + 1), 'nothing sticks out sideways');

  // Move: drop the clock on the left half of the greeting and it goes first.
  const hello = await rect('hello');
  await drag([c1.l + c1.w / 2, c1.t + c1.h / 2], [hello.l + 60, hello.t + 14]);
  check((await kinds()).startsWith('clock,hello'), 'dragging a widget onto another moves it there: ' + await kinds());

  await addWidget('Texto'); await addWidget('Pomodoro');
  await addWidget('Fotos que van cambiando');
  check(await count('.photo-widget') === 2 && await count('.photo-empty') === 1, 'a second frame of changing photos can be added, and it starts empty');
  await (await page.$('.photo-empty ~ input.photo-widget-input')).uploadFile(`${OUT}/photo.png`, `${OUT}/big.png`); await sleep(900);
  const frames = await texts('.photo-count');
  check(frames.join('|') === '1 foto|2 fotos' && await count('.photo-widget img.photo-now') === 2, 'each frame keeps its own photos: ' + frames.join('|'));
  await (await page.$('input.home-image-input')).uploadFile(`${OUT}/big.png`); await sleep(900);
  check(await page.evaluate(() => document.querySelector('.widget[data-t=image] img')?.naturalWidth > 0), 'an image can be added as a widget');
  const cardBg = t => page.$eval(`.widget[data-t=${t}] .w-card`, e => { const s = getComputedStyle(e); return s.backgroundColor + '|' + s.boxShadow; });
  const tintOf = async (t, label) => { await page.$eval(`.widget[data-t=${t}]`, e => e.scrollIntoView({ block: 'center' })); await sleep(150); await page.click(`.widget[data-t=${t}] .w-color`); await sleep(150); await clickText('.pop .menu-item', label); await sleep(150); };
  check(await count('.widget[data-t=clock] .w-color') === 1 && await count('.widget[data-t=pomodoro] .w-color') === 1 && await count('.widget[data-t=recent] .w-color') === 0, 'the clock and the pomodoro have a background button');
  await tintOf('clock', 'Sin fondo');
  check(await cardBg('clock') === 'rgba(0, 0, 0, 0)|none', 'the background of the clock can be removed: ' + await cardBg('clock'));
  await tintOf('pomodoro', 'Azul');
  check((await cardBg('pomodoro')).startsWith('rgb(231, 243, 248)'), 'the pomodoro can take a colour: ' + await cardBg('pomodoro'));
  await page.evaluate(() => { document.querySelector('.scroll').scrollTop = 0; }); await sleep(150);
  check(await count('.home-cover') === 0, 'Inicio has no cover until one is chosen');
  await page.click('.home-cover-btn'); await sleep(150);
  check(await visible('.pop .cover-grid'), 'in edit mode a cover can be chosen for Inicio');
  await press('Escape'); await sleep(100);
  await (await page.$('input.home-cover-input')).uploadFile(`${OUT}/big.png`); await sleep(900);
  check((await page.$eval('.home-cover', e => getComputedStyle(e).backgroundImage)).includes('blob:'), 'a picture can be the cover of Inicio');
  await page.click('.home-cover-btn'); await sleep(150);
  await page.click('.pop .cover-grid .cover-g2'); await sleep(200);
  check(await page.$eval('.home-cover', e => e.classList.contains('cover-g2') && getComputedStyle(e).backgroundImage.includes('gradient')), 'or one of the colours');
  await page.click('.widget[data-t=tasks] .w-del'); await sleep(150);
  check(!(await kinds()).includes('tasks'), 'a widget can be removed');
  await page.click('.home-add'); await sleep(150);
  check((await texts('.pop .menu-label')).includes('Tareas pendientes'), 'a removed built-in widget can be added back');
  await clickText('.pop .menu-item', 'Tareas pendientes'); await sleep(250);
  await page.click('.home-edit'); await sleep(150);
  check(!(await visible('.w-resize')), 'Listo leaves edit mode');

  await page.$eval('.widget[data-t=text]', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  await page.click('.widget[data-t=text] .w-text'); await type('Repasar integrales'); await sleep(900);
  await page.$eval('.widget[data-t=pomodoro]', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  check(await text('.pomo-time') === '25:00' && (await text('.pomo-phase')) === 'Concentración', 'a pomodoro starts at 25 minutes of work');
  await page.click('.pomo-go'); await sleep(1600);
  const running = await text('.pomo-time');
  check(/^24:5\d$/.test(running) && await text('.pomo-go') === 'Pausar', 'it counts down once started: ' + running);
  await page.click('.pomo-go'); await sleep(150);
  const paused = await text('.pomo-time');
  await sleep(1300);
  check(await text('.pomo-time') === paused && await text('.pomo-go') === 'Iniciar', 'and stops when paused: ' + paused);
  const done = await page.evaluate(async () => {
    const B = await import('./js/board.js'), S = await import('./js/store.js'), it = S.get('home').items.find(i => i.t === 'pomodoro');
    Object.assign(it, B.pomoStart({ ...it, left: 400 }, Date.now())); S.put(S.get('home'));
    return it.id;
  });
  await clickText('.side-item', 'Tareas'); await sleep(150); await clickText('.side-item', 'Inicio'); await sleep(1500);
  check((await text('.pomo-phase')) === 'Descanso' && await text('.pomo-time') === '05:00' && (await text('.pomo-count')).includes('1 pomodoro') && !!done, 'when the time runs out the break is ready and the session is counted: ' + await text('.pomo-count'));
  await sleep(3200);

  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  const after = await kinds();
  check(after.startsWith('clock,hello,photos') && after.split(',').length === 11, 'the board is kept as it was left: ' + after);
  check((await text('.widget[data-t=text]')).includes('Repasar integrales') && paused !== '', 'text written on a widget is kept');
  check(Math.abs((await rect('photos')).w - p1.w) < 2, 'sizes are kept too');
  check(await cardBg('clock') === 'rgba(0, 0, 0, 0)|none' && (await cardBg('pomodoro')).startsWith('rgb(231, 243, 248)'), 'widget backgrounds are kept');
  check(await page.$eval('.home-cover', e => e.classList.contains('cover-g2')) && !(await visible('.home-cover-btn')), 'the cover of Inicio is kept, and its button only shows while editing');
  const hi = () => text('.home-hero h1');
  check(/^Buen[oa]s (días|tardes|noches)$/.test(await hi()), 'with no name the greeting is plain: ' + await hi());
  await clickText('.side-item', 'Ajustes'); await sleep(200);
  await page.click('.name-input'); await type('Cristina'); await press('Tab'); await sleep(150);
  await clickText('.side-item', 'Inicio'); await sleep(300);
  check(/^Buen[oa]s (días|tardes|noches), Cristina$/.test(await hi()), 'the greeting uses the name written in Ajustes: ' + await hi());
  check(await count('.photo-widget img.photo-now') === 2 && (await texts('.photo-count')).join('|') === '1 foto|2 fotos' && (await text('.view')).includes('Examen de derivadas'), 'the built-in widgets keep working inside the board, and both photo frames keep their photos');
  await shot('09c-home-board');
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
  check(rt.docs >= 10 && rt.drawings === 3 && rt.blobs === 9, 'backup exports and re-imports everything: ' + JSON.stringify(rt));
});

await section('export and import', async () => {
  const names = () => texts('.book-name');
  await page.click('.book-more'); await sleep(150);
  const bookItems = (await texts('.pop .menu-item')).join('|');
  check(bookItems.includes('Exportar libro') && bookItems.includes('Importar página aquí'), 'the book menu exports the book and imports pages: ' + bookItems);
  await press('Escape');
  await clickText('.tree-row .tree-title', 'Matemáticas II'); await sleep(300);
  await page.click('.top-more'); await sleep(150);
  check((await texts('.pop .menu-item')).join('|').includes('Exportar página'), 'the page menu exports the page');
  await press('Escape');
  const files = await page.evaluate(async () => {
    const S = await import('./js/store.js');
    const book = S.all('book')[0], sub = S.pages().find(p => p.title === 'Tema 1: Límites');
    const b = await S.exportBundle(book.id), p = await S.exportBundle(sub.id);
    return { book: JSON.stringify(b), page: JSON.stringify(p), kinds: [b.kind, p.kind], pages: b.docs.filter(d => d.type === 'page').length, blobs: b.blobs.length, drawings: b.drawings.length, pageDocs: p.docs.length };
  });
  check(files.kinds.join() === 'book,page' && files.pages === 3 && files.pageDocs === 1, 'a book exports with all its pages and a page on its own: ' + JSON.stringify([files.kinds, files.pages, files.pageDocs]));
  check(files.blobs === 5 && files.drawings === 3, 'an export carries the photos, PDFs and drawings of its pages: ' + JSON.stringify([files.blobs, files.drawings]));
  writeFileSync(`${OUT}/libro.cuaderno.json`, files.book);
  writeFileSync(`${OUT}/pagina.cuaderno.json`, files.page);
  await clickText('.side-item', 'Ajustes'); await sleep(200);
  await (await page.$('input.import-input')).uploadFile(`${OUT}/libro.cuaderno.json`); await sleep(1200);
  check((await names()).join('|') === '2.º de Bachillerato|2.º de Bachillerato', 'importing a book adds it as a new book, without touching the one already there: ' + (await names()).join('|'));
  const copy = await page.evaluate(async () => {
    const S = await import('./js/store.js'), { db } = await import('./js/db.js');
    const [a, b] = S.all('book'), mine = S.pages().filter(p => p.bookId === b.id), top = mine.find(p => p.title === 'Matemáticas II'), sub = mine.find(p => p.title === 'Tema 1: Límites');
    const draw = top.blocks.find(x => x.t === 'draw'), d = await db.get('drawings', draw.id), img = top.blocks.find(x => x.t === 'image');
    const orig = S.pages().find(p => p.bookId === a.id && p.title === 'Matemáticas II');
    return { pages: mine.length, nested: sub?.parentId === top.id, link: top.blocks.find(x => x.t === 'page').pageId === sub?.id, strokes: d?.strokes.length, pic: !!(await S.getBlob(d.images[0].blob)), photo: !!(await S.getBlob(img.blob)),
      fresh: draw.id !== orig.blocks.find(x => x.t === 'draw').id && img.blob !== orig.blocks.find(x => x.t === 'image').blob, id: top.id };
  });
  check(copy.pages === 3 && copy.nested && copy.link, 'the imported book keeps its pages nested and its subpage links: ' + JSON.stringify(copy));
  check(copy.strokes >= 4 && copy.pic && copy.photo && copy.fresh, 'the imported pages bring their own copies of drawings and photos');
  await page.evaluate(id => { location.hash = '#/page/' + id; }, copy.id); await sleep(900);
  check(await count('.blk[data-t=draw] .draw-img') === 1 && await page.evaluate(() => { const i = document.querySelector('.blk[data-t=image] img'); return !!i && i.naturalWidth > 0; }), 'an imported page opens with its pictures');
  await page.evaluate(() => document.querySelectorAll('.book-more')[1].click()); await sleep(150);
  await clickText('.pop .menu-item', 'Importar página aquí');
  await (await page.$('input.import-here-input')).uploadFile(`${OUT}/pagina.cuaderno.json`); await sleep(900);
  const into = await page.evaluate(async () => { const S = await import('./js/store.js'); const b = S.all('book')[1]; return S.children({ bookId: b.id }).map(p => p.title).sort().join('|'); });
  check(into === 'Física|Matemáticas II|Tema 1: Límites', 'a single page is imported into the chosen book as a top-level page: ' + into);
  await clickText('.side-item', 'Ajustes'); await sleep(200);
  writeFileSync(`${OUT}/malo.json`, '{"hola":1}');
  await (await page.$('input.import-input')).uploadFile(`${OUT}/malo.json`); await sleep(400);
  check(await visible('.toast') && (await names()).length === 2, 'a file that is not from Cuaderno is rejected with a message');
  await sleep(3200);
  await page.evaluate(() => document.querySelectorAll('.book-more')[1].click()); await sleep(150);
  await clickText('.pop .menu-item', 'Eliminar libro'); await clickText('.modal button', 'Eliminar'); await sleep(300);
  check((await names()).length === 1, 'the imported book can be deleted again');
});

await section('themes', async () => {
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await clickText('.side-item', 'Ajustes'); await sleep(200);
  check((await page.$$eval('.theme-pick option', o => o.map(x => x.value))).join() === 'white,beige,dark,system' && await page.$eval('.theme-pick', e => e.value === 'white'), 'Ajustes offers the themes, with white selected at first');
  await page.select('.theme-pick', 'beige'); await sleep(150);
  check(await bg() === 'rgb(245, 240, 230)', 'the beige theme can be chosen: ' + await bg());
  await page.select('.theme-pick', 'dark'); await sleep(150);
  check(await bg() === 'rgb(25, 25, 25)', 'the dark theme can be chosen whatever the device says: ' + await bg());
  await clickText('.tree-row .tree-title', 'Matemáticas II'); await sleep(500);
  await shot('10-dark');
  await page.reload({ waitUntil: 'networkidle0' });
  check(await bg() === 'rgb(25, 25, 25)', 'the chosen theme survives a reload');
  await clickText('.side-item', 'Ajustes'); await sleep(200);
  await page.select('.theme-pick', 'system'); await sleep(150);
  check(await bg() === 'rgb(255, 255, 255)', 'following the system gives white on a light device');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]); await sleep(200);
  check(await bg() === 'rgb(25, 25, 25)', 'and switches to dark as soon as the device does');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.select('.theme-pick', 'white'); await sleep(150);
  check(await bg() === 'rgb(255, 255, 255)', 'back to white: ' + await bg());
  const face = sel => page.$eval(sel, e => getComputedStyle(e).fontFamily.split(',')[0].replaceAll('"', '').trim());
  check(await face('body') === 'Times New Roman' && await face('.side-item') === 'Times New Roman', 'menus and everything else use Times New Roman unless another font is chosen: ' + await face('body'));
  check((await page.$$eval('.font-pick option', o => o.map(x => x.value))).join() === 'times,sans,georgia,palatino,verdana,rounded,hand,mono' && await page.$eval('.font-pick', e => e.value === 'times'), 'Ajustes offers several fonts for the app');
  await page.select('.font-pick', 'verdana'); await sleep(150);
  check(await face('body') === 'Verdana', 'the font of the app can be changed: ' + await face('body'));
  await page.reload({ waitUntil: 'networkidle0' });
  check(await face('body') === 'Verdana', 'the chosen font survives a reload');
  await clickText('.tree-row .tree-title', 'Matemáticas II'); await sleep(400);
  await page.click('.top-more'); await sleep(150);
  await clickText('.pop .menu-item', 'Fuente');
  const faces = (await texts('.pop .menu-label')).join('|');
  check(faces.includes('Georgia') && faces.includes('Manuscrita') && faces.includes('Times New Roman'), 'each page can have its own writing font: ' + faces);
  await clickText('.pop .menu-item', 'Georgia'); await sleep(300);
  check(await face('.page .blk .content') === 'Georgia' && await face('.side-item') === 'Verdana', 'the font of a page changes its text and nothing else');
  await page.click('.top-more'); await sleep(150);
  await clickText('.pop .menu-item', 'Fuente'); await clickText('.pop .menu-item', 'La de la aplicación'); await sleep(300);
  check(await face('.page .blk .content') === 'Verdana', 'a page can go back to the font of the app');
  await clickText('.side-item', 'Ajustes'); await sleep(200);
  await page.select('.font-pick', 'times'); await sleep(150);
  check(await face('body') === 'Times New Roman', 'back to Times New Roman');
  await clickText('.tree-row .tree-title', 'Matemáticas II'); await sleep(400);
});

await section('cloud sync between two devices', async () => {
  const cloudDocs = new Map();
  let clock = 0;
  const cloudCall = async (method, arg) => {
    if (method === 'changes') return { items: [...cloudDocs].filter(([, d]) => d.at > (arg || 0)).sort((a, b) => a[1].at - b[1].at).map(([key, d]) => ({ key, u: d.u, gone: d.gone, x: 0 })), cursor: clock };
    if (method === 'fetch') { const d = cloudDocs.get(arg); return d ? { u: d.u, gone: d.gone, payload: d.payload } : null; }
    return arg.map(it => { cloudDocs.set(it.key, { u: it.u, gone: it.payload == null, payload: it.payload, at: ++clock }); return 0; });
  };
  const wire = async pg => {
    await pg.exposeFunction('__cloud', cloudCall);
    await pg.evaluateOnNewDocument(() => { window.__cuadernoCloud = { uid: 'u1', username: 'cris', remote: { changes: c => window.__cloud('changes', c), fetch: k => window.__cloud('fetch', k), write: i => window.__cloud('write', i) } }; });
  };
  const label = pg => pg.evaluate(() => document.querySelector('.side-sync')?.textContent || '');
  const live = prefix => [...cloudDocs].filter(([k, d]) => k.startsWith(prefix) && !d.gone).length;
  const inCloud = t => [...cloudDocs.values()].some(d => !d.gone && d.payload.includes(t));

  check(await label(page) === '', 'without an account nothing about the cloud gets in the way');
  await wire(page);
  await page.reload({ waitUntil: 'networkidle0' });
  check(await waitFor(async () => await label(page) === 'Sincronizado', 20000), 'signing in uploads what the device already had: ' + await label(page));
  check(live('d_') >= 10 && live('i_') >= 3 && live('f_') >= 6, 'pages, drawings, photos and PDFs all go up: ' + JSON.stringify([live('d_'), live('i_'), live('f_')]));

  const ctx2 = await browser.createBrowserContext(), p2 = await ctx2.newPage();
  await p2.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1 });
  p2.on('pageerror', e => errors.push('pageerror (2): ' + e.message));
  p2.on('console', m => { if (m.type() === 'error') errors.push('console (2): ' + m.text()); });
  await wire(p2);
  await p2.goto(URL0, { waitUntil: 'networkidle0' });
  check(await waitFor(async () => (await p2.$$eval('.book-name', e => e.map(x => x.textContent))).join() === '2.º de Bachillerato', 20000), 'a second device with the same account gets the books');
  await p2.evaluate(() => [...document.querySelectorAll('.tree-row .tree-title')].find(e => e.textContent === 'Matemáticas II').click());
  check(await waitFor(async () => await p2.$$eval('.pdf-page', e => e.length) === 2, 15000), 'the PDF arrives on the second device');
  const there = await p2.evaluate(() => ({
    blocks: document.querySelectorAll('.blk').length,
    photo: document.querySelector('.blk[data-t=image] img')?.naturalWidth > 0,
    drawPic: document.querySelectorAll('.blk[data-t=draw] .draw-img').length,
    note: document.querySelector('.side-note[data-t=text]')?.textContent || '',
    bg: getComputedStyle(document.querySelector('.scroll')).backgroundColor,
  }));
  check(there.blocks >= 10 && there.photo && there.drawPic === 1 && there.note.includes('nota al margen') && there.bg === 'rgb(231, 243, 248)', 'the page looks the same there: blocks, photo, drawing, margin notes and background: ' + JSON.stringify(there));
  const ink = await p2.evaluate(async () => new Promise(r => { const q = indexedDB.open('cuaderno'); q.onsuccess = () => { const g = q.result.transaction('drawings').objectStore('drawings').getAll(); g.onsuccess = () => r(g.result.map(d => d.strokes.length).sort().join()); }; }));
  check(ink.split(',').includes('6'), 'the handwriting arrives too: ' + ink);

  await p2.evaluate(() => [...document.querySelectorAll('.side-item')].find(e => e.textContent.includes('Tareas')).click()); await sleep(200);
  await p2.click('.quick input'); await p2.keyboard.type('Tarea desde el otro dispositivo'); await p2.keyboard.press('Enter');
  check(await waitFor(async () => inCloud('Tarea desde el otro dispositivo'), 15000), 'what is done on the second device goes up by itself');
  await clickText('.side-item', 'Ajustes'); await sleep(200);
  check((await text('.cloud-box')).includes('Sesión de cris'), 'Ajustes shows the account in use: ' + (await text('.cloud-box')).slice(0, 40));
  await page.evaluate(async () => { const S = await import('./js/store.js'); S.put({ ...S.settings(), name: '' }); });
  await clickText('.side-item', 'Inicio'); await sleep(300);
  check((await text('.home-hero h1')).endsWith(', Cris'), 'with no name written, the greeting uses the account name: ' + await text('.home-hero h1'));
  await clickText('.side-item', 'Ajustes'); await sleep(200);
  await page.click('.cloud-now');
  await clickText('.side-item', 'Tareas');
  check(await waitFor(async () => (await text('.view')).includes('Tarea desde el otro dispositivo'), 10000), 'and shows up on the first device');
  await page.evaluate(async () => { const S = await import('./js/store.js'); S.remove(S.all('task').find(t => t.title === 'Tarea desde el otro dispositivo').id); });
  check(await waitFor(async () => !inCloud('Tarea desde el otro dispositivo'), 15000), 'deleting something is sent to the cloud as well');
  await p2.evaluate(() => [...document.querySelectorAll('.side-item')].find(e => e.textContent.includes('Ajustes')).click()); await sleep(200);
  await p2.click('.cloud-now');
  await p2.evaluate(() => [...document.querySelectorAll('.side-item')].find(e => e.textContent.includes('Tareas')).click());
  check(await waitFor(async () => !(await p2.$eval('.view', e => e.textContent)).includes('Tarea desde el otro dispositivo'), 10000), 'and disappears from the other device');

  // Typing on one device while the other changes the same page: the cursor is left alone.
  await p2.evaluate(async () => { const S = await import('./js/store.js'); location.hash = '#/page/' + S.pages().find(p => p.title === 'Tema 1: Límites').id; }); await sleep(500);
  await p2.evaluate(() => { const c = [...document.querySelectorAll('.blk .content')].find(e => e.textContent === 'Contenido del tema'); c.focus(); const r = document.createRange(); r.selectNodeContents(c); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await p2.keyboard.type(' ampliado');
  check(await waitFor(async () => inCloud('Contenido del tema ampliado'), 15000), 'typing is saved to the cloud a few seconds later');
  check(await p2.evaluate(() => document.activeElement?.classList.contains('content')), 'syncing does not take the cursor away while writing');
  await ctx2.close();
  await clickText('.tree-row .tree-title', 'Matemáticas II'); await sleep(400);
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

await section('print to PDF', async () => {
  await page.setViewport({ width: 1100, height: 800 });
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  await clickText('.tree-row .tree-title', 'Matemáticas II'); await sleep(300);
  check(await visible('.blk'), 'a page with blocks is open');
  const prevTitle = await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; return document.title; });
  await page.evaluate(() => import('/js/print.js').then(m => m.printPage('Tema 1: Células/ADN?')));
  await sleep(300);
  check(await page.evaluate(() => window.__printed === 1 && document.title === 'Tema 1 Células ADN'), 'Guardar como PDF opens the print dialog with the page title as name');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  check(await page.evaluate(() => document.title) === prevTitle, 'the document title is restored after printing');
  await page.emulateMediaType('print'); await sleep(150);
  check(!(await visible('.sidebar')), 'print hides the sidebar');
  check(!(await visible('.kbar')) && !(await visible('.topbar')), 'print hides the top bar and the editing toolbar');
  check(await visible('.blk'), 'print keeps the page blocks');
  await shot('pdf-print-view');
  const pdf = await page.pdf({ path: join(OUT, 'pagina.pdf'), format: 'A4', printBackground: true });
  check(pdf.length > 1000, 'a PDF is produced: ' + pdf.length + ' bytes');
  await page.emulateMediaType('screen');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
});

console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);
