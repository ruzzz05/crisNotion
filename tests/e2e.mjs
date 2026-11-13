// End-to-end test: drives the real app in headless Chrome/Edge.
//   npm run test:e2e            (set SHOTS=dir to keep screenshots, CHROME_PATH to pick a browser)
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function newPage(w, hgt) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: hgt, deviceScaleFactor: 2, hasTouch: false });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const clickText = async (page, sel, text) => {
  const ok = await page.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().includes(text));
    if (!el) return false; el.click(); return true;
  }, sel, text);
  if (!ok) throw new Error(`no ${sel} with "${text}"`);
  await sleep(120);
};
const fill = async (page, sel, value) => { await page.click(sel, { clickCount: 3 }); await page.keyboard.type(value); };
const check = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) errors.push('assert: ' + msg); };
/** True when every button of a toolbar lies inside the toolbar's own box (nothing scrolled out of sight). */
const allVisible = (page, sel) => page.evaluate(sel => {
  const bar = document.querySelector(sel).getBoundingClientRect();
  return [...document.querySelectorAll(sel + ' button')].every(b => { const r = b.getBoundingClientRect(); return r.right <= bar.right + 1 && r.left >= bar.left - 1; });
}, sel);

// ---------- iPad flow ----------
const page = await newPage(1024, 1366);
await page.goto(URL0, { waitUntil: 'networkidle0' });
await shot(page, '01-home-empty');

await page.goto(URL0 + '#/books'); await sleep(150);
await clickText(page, 'button', 'Crear mi primer libro');
await fill(page, '.sheet input[type=text]', '2.º de Bachillerato');
await clickText(page, '.sheet button', 'Guardar');
check(await page.$('.cover') !== null, 'book created');
await clickText(page, 'button', 'Nuevo libro');
await fill(page, '.sheet input[type=text]', 'Academia de inglés');
await page.evaluate(() => { document.querySelectorAll('.sheet .pick.swatch')[3].click(); document.querySelectorAll('.sheet .pick:not(.swatch)')[17].click(); });
await clickText(page, '.sheet button', 'Guardar');
await shot(page, '02-books');

await page.click('.cover'); await sleep(150);
const subs = [['Matemáticas II', 8, 5], ['Física', 11, 0], ['Lengua', 15, 1], ['Historia', 14, 6]];
for (const [name, em, colr] of subs) {
  await clickText(page, 'button', 'Asignatura');
  await fill(page, '.sheet input[type=text]', name);
  await page.evaluate((em, colr) => { document.querySelectorAll('.sheet .pick:not(.swatch)')[em].click(); document.querySelectorAll('.sheet .pick.swatch')[colr].click(); }, em, colr);
  await clickText(page, '.sheet button', 'Guardar');
}
check((await page.$$('.subject')).length === 4, '4 subjects');
await shot(page, '03-book');

await page.click('.subject'); await sleep(150);
await clickText(page, 'button', 'Crear la primera página'); await sleep(200);
check(await page.evaluate(() => document.activeElement?.classList.contains('page-title')), 'title focused on new page');
await page.keyboard.type('Tema 4: Derivadas');
await page.keyboard.press('Enter');
await page.keyboard.type('## Definición');
await page.keyboard.press('Enter');
await page.keyboard.type('La derivada mide como cambia una funcion en un punto.');
await page.keyboard.press('Enter');
await page.keyboard.type('- Regla de la cadena');
await page.keyboard.press('Enter');
await page.keyboard.type('Regla del producto');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.keyboard.type('[] Hacer ejercicios 3 y 4');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.keyboard.type('1. Primero');
await page.keyboard.press('Enter');
await page.keyboard.type('Segundo');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.keyboard.type('> Recuerda repasar antes del examen');
await page.keyboard.press('Enter');
await page.keyboard.type('texto para unir');
let types = await page.evaluate(() => [...document.querySelectorAll('.block')].map(b => b.className.replace('block b-', '')));
console.log('types:', types.join(','));
check(types.join(',') === 'h2,p,bullet,bullet,todo,num,num,quote,p', 'markdown shortcuts + enter behaviour');
// backspace merge
await page.keyboard.down('Control'); await page.keyboard.press('Home'); await page.keyboard.up('Control');
await page.keyboard.press('Home');
await page.keyboard.press('Backspace');
types = await page.evaluate(() => [...document.querySelectorAll('.block')].map(b => b.className.replace('block b-', '')));
const quoteText = await page.evaluate(() => document.querySelector('.b-quote .content').textContent);
check(types.length === 8 && quoteText === 'Recuerda repasar antes del examentexto para unir', 'backspace merges into previous: ' + quoteText);
// bold selection
await page.keyboard.down('Shift'); for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
await page.click('.toolbar [aria-label="Negrita"]');
await page.click('.toolbar [aria-label="Resaltar"]');
const qh = await page.evaluate(() => document.querySelector('.b-quote .content').innerHTML);
check(/<b[ >]|font-weight/.test(qh) && /background/.test(qh), 'bold + highlight applied: ' + qh);
// todo check
await page.click('.b-todo .check');
check(await page.evaluate(() => document.querySelector('.b-todo').classList.contains('done')), 'todo toggles');

// drawing
await page.click('.toolbar [aria-label="Añadir dibujo a mano"]'); await sleep(400);
check(await page.$('.draw-live') !== null, 'drawing block added');
check(await allVisible(page, '.draw-bar'), 'every drawing tool is visible on iPad without scrolling the bar');
const box = await (await page.$('.draw-live')).boundingBox();
console.log('draw box', JSON.stringify(box));
const stroke = async (pts) => { await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down(); for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 4 }); await page.mouse.up(); };
const wave = (y, n = 24) => Array.from({ length: n }, (_, i) => [box.x + 60 + i * 22, box.y + y + Math.sin(i / 2) * 30]);
await stroke(wave(90));
await page.click('.draw-bar [aria-label="Subrayador"]');
await stroke(wave(190));
await page.click('.draw-bar [aria-label="Bolígrafo"]');
await page.click('.draw-bar [aria-label="Color red"]');
await stroke([[box.x + 100, box.y + 260], [box.x + 300, box.y + 300], [box.x + 500, box.y + 250]]);
await sleep(600);
const drawn = async () => page.evaluate(async () => {
  const d = await new Promise(r => { const q = indexedDB.open('cuaderno'); q.onsuccess = () => { const g = q.result.transaction('drawings').objectStore('drawings').getAll(); g.onsuccess = () => r(g.result); }; });
  return d.map(x => x.strokes.length);
});
check((await drawn())[0] === 3, 'three strokes persisted: ' + JSON.stringify(await drawn()));
await page.click('.draw-bar [aria-label="Goma"]');
await stroke([[box.x + 290, box.y + 280], [box.x + 300, box.y + 300], [box.x + 305, box.y + 305]]);
await sleep(600);
check((await drawn())[0] === 2, 'eraser removed a stroke');
await page.click('.draw-bar [aria-label="Deshacer"]'); await sleep(600);
check((await drawn())[0] === 3, 'undo restores stroke');
const inked = await page.evaluate(() => { const c = document.querySelector('.draw-base'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
check(inked > 2000, 'canvas has ink pixels: ' + inked);

await page.click('.draw-bar [aria-label="Bolígrafo"]');
const penThenTouch = await page.evaluate(() => {
  const live = document.querySelector('.draw-live'); const r = live.getBoundingClientRect(); const view = document.getElementById('view');
  const ev = (type, o) => live.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...o }));
  ev('pointerdown', { pointerId: 7, pointerType: 'pen', pressure: 0.8, clientX: r.left + 600, clientY: r.top + 60, button: 0 });
  ev('pointermove', { pointerId: 7, pointerType: 'pen', pressure: 0.9, clientX: r.left + 640, clientY: r.top + 80 });
  ev('pointerup', { pointerId: 7, pointerType: 'pen', clientX: r.left + 640, clientY: r.top + 80 });
  const before = view.scrollTop;
  ev('pointerdown', { pointerId: 9, pointerType: 'touch', clientX: r.left + 300, clientY: r.top + 200, button: 0 });
  ev('pointermove', { pointerId: 9, pointerType: 'touch', clientX: r.left + 300, clientY: r.top + 120 });
  ev('pointerup', { pointerId: 9, pointerType: 'touch', clientX: r.left + 300, clientY: r.top + 120 });
  return { before, after: view.scrollTop, penOnly: JSON.parse(localStorage.getItem('cuaderno:draw')).penOnly };
});
await sleep(600);
check(penThenTouch.penOnly && penThenTouch.after > penThenTouch.before && (await drawn())[0] === 4, 'pencil draws, finger scrolls: ' + JSON.stringify(penThenTouch));
await page.evaluate(() => { document.getElementById('view').scrollTop = 0; });

// photo
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
writeFileSync(`${OUT}/photo.png`, Buffer.from(png, 'base64'));
const input = await page.$('.paper input[type=file]');
await input.uploadFile(`${OUT}/photo.png`);
await sleep(700);
check(await page.evaluate(() => { const i = document.querySelector('.b-image img'); return !!i && i.src.startsWith('blob:') && i.naturalWidth > 0; }), 'photo block shows image');
await page.evaluate(() => { document.getElementById('view').scrollTop = 0; });
await sleep(700);
await shot(page, '04-editor');
await page.evaluate(() => { document.getElementById('view').scrollTop = 500; }); await sleep(200);
await shot(page, '04b-editor-draw');

// second page tab + persistence after reload
await page.click('.ptab.add'); await sleep(200);
await page.keyboard.type('Ejercicios');
await sleep(800);
await page.reload({ waitUntil: 'networkidle0' });
check(await page.evaluate(() => document.querySelectorAll('.ptab:not(.add)').length) === 2, 'two page tabs after reload');
await clickText(page, '.ptab', 'Tema 4'); await sleep(500);
const after = await page.evaluate(() => ({ blocks: document.querySelectorAll('.block').length, title: document.querySelector('.page-title').textContent }));
check(after.title === 'Tema 4: Derivadas' && after.blocks >= 10, 'page content persisted: ' + JSON.stringify(after));
const inked2 = await page.evaluate(() => { const c = document.querySelector('.draw-base'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
check(inked2 > 2000, 'drawing redrawn after reload: ' + inked2);

// timetable
await page.goto(URL0 + '#/timetable'); await sleep(200);
const addSlot = async (subjIdx, day, start, end, room) => {
  await clickText(page, '.top button', 'Clase');
  await page.evaluate((subjIdx, day, start, end, room) => {
    const f = document.querySelector('.sheet form'); const [sub, dayS] = f.querySelectorAll('select'); const times = f.querySelectorAll('input[type=time]'); const texts = f.querySelectorAll('input[type=text]');
    sub.selectedIndex = subjIdx; dayS.value = String(day); times[0].value = start; times[1].value = end; texts[1].value = room;
  }, subjIdx, day, start, end, room);
  await clickText(page, '.sheet button', 'Guardar');
};
const today = (new Date().getDay() + 6) % 7;
const plan = [[1, 0, '08:30', '09:25', 'A12'], [2, 0, '09:25', '10:20', 'Lab'], [3, 1, '08:30', '09:25', ''], [4, 2, '10:45', '11:40', 'B3'], [1, 3, '11:40', '12:35', 'A12'], [2, 4, '08:30', '10:20', 'Lab'], [3, today > 4 ? 2 : today, '12:35', '13:30', 'A2']];
for (const p of plan) await addSlot(...p);
check((await page.$$('.tt-slot')).length === 7, 'timetable has 7 slots');
// validation
await clickText(page, '.top button', 'Clase');
await page.evaluate(() => { const t = document.querySelectorAll('.sheet input[type=time]'); t[0].value = '10:00'; t[1].value = '09:00'; document.querySelector('.sheet select').selectedIndex = 1; });
await clickText(page, '.sheet button', 'Guardar');
check(await page.$('.sheet') !== null && await page.$('.toast') !== null, 'invalid slot rejected with message');
await page.click('.sheet-head button'); await sleep(100);
await shot(page, '05-timetable');

// calendar
await page.goto(URL0 + '#/calendar'); await sleep(200);
const addEvent = async (title, kindIdx, offset) => {
  await clickText(page, '.day-panel button', 'Evento');
  await page.evaluate((title, kindIdx, offset) => {
    const f = document.querySelector('.sheet form'); f.querySelector('input[type=text]').value = title; f.querySelectorAll('select')[0].selectedIndex = kindIdx;
    const d = new Date(); d.setDate(d.getDate() + offset); f.querySelector('input[type=date]').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, title, kindIdx, offset);
  await clickText(page, '.sheet button', 'Guardar');
};
await addEvent('Examen de derivadas', 0, 3);
await addEvent('Entrega comentario de texto', 1, 5);
await addEvent('Excursión al museo', 2, 0);
check((await page.$$('.cal-mark')).length >= 1, 'calendar shows marks');
await shot(page, '06-calendar');

// tasks
await page.goto(URL0 + '#/tasks'); await sleep(200);
for (const t of ['Ejercicios 3 y 4 de la página 52', 'Leer capítulo 2', 'Traer la calculadora']) { await page.type('.quick input', t); await page.keyboard.press('Enter'); await sleep(80); }
check((await page.$$('.task')).length === 3, '3 tasks');
await page.click('.task .check'); await sleep(100);
check((await page.$$('.done-list .task')).length === 1, 'task marked done');
await shot(page, '07-tasks');

await page.goto(URL0 + '#/home'); await sleep(300);
await shot(page, '08-home');

await page.goto(URL0 + '#/search'); await sleep(200);
await page.type('input[type=search]', 'cadena'); await sleep(200);
check((await page.$$('.rows .row')).length === 1, 'search finds page body text');
await shot(page, '09-search');

// trash + restore
await page.click('.rows .row'); await sleep(300);
await page.click('[aria-label="Opciones de la página"]'); await sleep(100);
await clickText(page, '.menu-item', 'Eliminar página');
await clickText(page, '.sheet button', 'Eliminar'); await sleep(300);
check(await page.evaluate(() => document.querySelectorAll('.ptab:not(.add)').length) === 1, 'page trashed');
await page.goto(URL0 + '#/settings'); await sleep(200);
await shot(page, '10-settings');
await clickText(page, '.row button', 'Restaurar'); await sleep(200);
await page.goBack(); await sleep(300);

// export/import roundtrip
const rt = await page.evaluate(async () => {
  const S = await import('./js/store.js');
  const data = await S.exportAll();
  const json = JSON.stringify(data);
  await S.importAll(JSON.parse(json));
  return { docs: data.docs.length, drawings: data.drawings.length, blobs: data.blobs.length, kb: Math.round(json.length / 1024) };
});
check(rt.docs > 15 && rt.drawings === 1 && rt.blobs === 1, 'backup export/import roundtrip: ' + JSON.stringify(rt));

// ---------- iPhone + dark, same data (new context => empty DB), so reuse the first context via viewport change ----------
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
for (const [hash, name] of [['#/home', 'm1-home'], ['#/books', 'm2-books'], ['#/timetable', 'm3-timetable'], ['#/calendar', 'm4-calendar'], ['#/tasks', 'm5-tasks']]) {
  await page.goto(URL0 + hash); await sleep(250); await shot(page, name);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.getElementById('view').scrollWidth > document.getElementById('view').clientWidth + 1);
  check(!overflow, 'no horizontal overflow on phone at ' + hash);
}
await page.goto(URL0 + '#/books'); await sleep(200); await page.click('.cover'); await sleep(200); await page.click('.subject'); await sleep(600);
await clickText(page, '.ptab', 'Tema 4'); await sleep(500);
await shot(page, 'm6-editor');
check(await allVisible(page, '.draw-bar'), 'every drawing tool is visible on iPhone without scrolling the bar');
check(!(await page.evaluate(() => document.getElementById('view').scrollWidth > document.getElementById('view').clientWidth + 1)), 'no horizontal overflow on phone in editor');
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 2 });
await sleep(400); await shot(page, 'd1-editor-dark');
await page.goto(URL0 + '#/home'); await sleep(250); await shot(page, 'd2-home-dark');
await page.goto(URL0 + '#/timetable'); await sleep(250); await shot(page, 'd3-timetable-dark');

console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);
