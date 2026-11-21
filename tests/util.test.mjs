import test from 'node:test';
import assert from 'node:assert/strict';
import { ymd, parseYmd, dow, mins, hhmm, relDay, esc, col, tint, COLORS, greeting, pasteHtml, shouldCapitalize, TONES, barTop, VERSION, blocksTouchSelection, spokenText, formatBarTop, printTitle, pdfScale } from '../public/js/util.js';

test('ymd formats a local date as yyyy-mm-dd with zero padding', () => {
  assert.equal(ymd(new Date(2026, 0, 5)), '2026-01-05');
});

test('parseYmd is the inverse of ymd', () => {
  assert.equal(ymd(parseYmd('2026-11-13')), '2026-11-13');
});

test('dow counts Monday as 0 and Sunday as 6', () => {
  assert.equal(dow(new Date(2026, 10, 9)), 0);  // Monday
  assert.equal(dow(new Date(2026, 10, 15)), 6); // Sunday
});

test('mins and hhmm convert between clock time and minutes', () => {
  assert.equal(mins('08:30'), 510);
  assert.equal(hhmm(510), '08:30');
});

test('relDay names today, tomorrow and yesterday', () => {
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return ymd(x); };
  assert.equal(relDay(d(0)), 'Hoy');
  assert.equal(relDay(d(1)), 'Mañana');
  assert.equal(relDay(d(-1)), 'Ayer');
});

test('esc neutralises HTML in pasted text', () => {
  assert.equal(esc('<b>"a" & b</b>'), '&lt;b&gt;&quot;a&quot; &amp; b&lt;/b&gt;');
});

test('col falls back to blue for an unknown colour key', () => {
  assert.equal(col('nope'), 'blue');
  assert.equal(col('red'), 'red');
  assert.ok(COLORS.includes('gray'));
});

test('tint builds the CSS variables for a colour', () => {
  assert.equal(tint('red'), '--c:var(--c-red);--b:var(--b-red)');
  assert.equal(tint(undefined), '--c:var(--c-blue);--b:var(--b-blue)');
});

test('greeting depends on the hour', () => {
  assert.equal(greeting(8), 'Buenos días');
  assert.equal(greeting(16), 'Buenas tardes');
  assert.equal(greeting(22), 'Buenas noches');
  assert.equal(greeting(3), 'Buenas noches');
});

test('the greeting names the person when there is a name to use', async () => {
  const { greetingFor, displayName } = await import('../public/js/util.js');
  assert.equal(greetingFor(9, 'Cris'), 'Buenos días, Cris');
  assert.equal(greetingFor(15, ''), 'Buenas tardes');
  assert.equal(greetingFor(23, 'Cris'), 'Buenas noches, Cris');
  assert.equal(displayName(' Cristina ', 'cris.05'), 'Cristina', 'the name written in Ajustes comes first');
  assert.equal(displayName('', 'cris.05'), 'Cris.05', 'otherwise the account name, capitalised');
  assert.equal(displayName(undefined, ''), '');
});

test('daysBetween lists every date from start to end, and only start when there is no valid end', async () => {
  const { daysBetween } = await import('../public/js/util.js');
  assert.deepEqual(daysBetween('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual(daysBetween('2026-03-28', '2026-03-30'), ['2026-03-28', '2026-03-29', '2026-03-30'], 'daylight saving does not skip or repeat a day');
  assert.deepEqual(daysBetween('2026-05-01', ''), ['2026-05-01']);
  assert.deepEqual(daysBetween('2026-05-01', '2026-05-01'), ['2026-05-01']);
  assert.deepEqual(daysBetween('2026-05-05', '2026-05-01'), ['2026-05-05'], 'an end before the start is ignored');
  assert.equal(daysBetween('2026-01-01', '2030-01-01').length, 366, 'ranges are capped');
});

import { readFileSync } from 'node:fs';
import { COLOR_NAMES } from '../public/js/util.js';

test('there are at least 12 colours, each with a name', () => {
  assert.ok(COLORS.length >= 12);
  for (const c of COLORS) assert.ok(COLOR_NAMES[c], c);
});
test('every colour defines text and background variables in the light and the dark theme', () => {
  const css = readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');
  for (const c of COLORS) {
    assert.equal(css.split(`--c-${c}:`).length - 1, 2, `--c-${c} in two themes`);
    assert.equal(css.split(`--b-${c}:`).length - 1, 2, `--b-${c} in two themes`);
  }
});

test('pasteHtml keeps one line as plain escaped text', () => {
  assert.equal(pasteHtml('hola <b>'), 'hola &lt;b&gt;');
});
test('pasteHtml turns a long text into one paragraph per line, blank lines included', () => {
  assert.equal(pasteHtml('a\r\nb\n\nc\n'), '<div>a</div><div>b</div><div><br></div><div>c</div>');
});

test('shouldCapitalize: a lowercase letter at the start of a paragraph', () => {
  assert.equal(shouldCapitalize('', 'h'), true);
  assert.equal(shouldCapitalize('  ', 'h'), true);
  assert.equal(shouldCapitalize('¿', 'q'), true);
});
test('shouldCapitalize: after a full stop, ! or ? and a space', () => {
  assert.equal(shouldCapitalize('Hola. ', 'm'), true);
  assert.equal(shouldCapitalize('¡Hola! ', 'm'), true);
  assert.equal(shouldCapitalize('¿Qué? ', 'y'), true);
  assert.equal(shouldCapitalize('Hola.', 'm'), false); // no space yet: "e.g" or "3.5" must not change
});
test('shouldCapitalize: not inside a sentence, for digits, or for what is already upper case', () => {
  assert.equal(shouldCapitalize('Hola, ', 'm'), false);
  assert.equal(shouldCapitalize('Hola', 'm'), false);
  assert.equal(shouldCapitalize('', '5'), false);
  assert.equal(shouldCapitalize('', 'M'), false);
  assert.equal(shouldCapitalize('', 'ñ'), true);
});

test('TONES are the palette colours plus black, the only values a text colour may take', () => {
  assert.ok(TONES.includes('black'));
  assert.ok(COLORS.every(c => TONES.includes(c)));
});

test('barTop keeps the bottom bar on the bottom of the screen when there is no keyboard', () => {
  assert.equal(barTop({ innerHeight: 1000, vvHeight: 1000, vvOffsetTop: 0, barHeight: 60 }), 940);
});
test('barTop sits right above the keyboard, following the visual viewport', () => {
  assert.equal(barTop({ innerHeight: 1000, vvHeight: 600, vvOffsetTop: 0, barHeight: 60 }), 540);
  assert.equal(barTop({ innerHeight: 1000, vvHeight: 600, vvOffsetTop: 40, barHeight: 60 }), 580);
});
test('barTop never goes above the top of the screen', () => {
  assert.equal(barTop({ innerHeight: 1000, vvHeight: 30, vvOffsetTop: 0, barHeight: 60 }), 0);
});

test('VERSION is the app version and matches package.json', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, '0.9.14');
  assert.equal(pkg.version, VERSION);
});

test('blocksTouchSelection: long-press selection is blocked on touch screens only, unless allowed', () => {
  assert.equal(blocksTouchSelection(true), true);
  assert.equal(blocksTouchSelection(false), false);
  assert.equal(blocksTouchSelection(true, true), false);
});

test('spokenText: dictated words are trimmed and separated from the text before the caret', () => {
  assert.equal(spokenText(' hola ', ''), 'hola ');
  assert.equal(spokenText('que tal', 'hola'), ' que tal ');
  assert.equal(spokenText('que tal', 'hola '), 'que tal ');
  assert.equal(spokenText('   ', 'hola'), '');
});

test('formatBarTop: the edit bar hangs just below the breadcrumb bar', () => {
  assert.equal(formatBarTop(44), 50);
  assert.equal(formatBarTop(0), 6);
});

test('printTitle: the name the PDF gets, without characters a file name cannot have', () => {
  assert.equal(printTitle('  Tema 1: Células/ADN?  '), 'Tema 1 Células ADN');
  assert.equal(printTitle('Matemáticas II'), 'Matemáticas II');
  assert.equal(printTitle(''), 'Sin título');
  assert.equal(printTitle(undefined), 'Sin título');
});

test('pdfScale draws a PDF page with twice the pixels of the screen, so a scan stays sharp', () => {
  const k = pdfScale({ pageW: 595, pageH: 842, cssW: 700, dpr: 2, maxPixels: 1e9 });
  assert.equal(k, 2 * 2 * 700 / 595);
});

test('pdfScale never goes past the pixel budget of a canvas', () => {
  const k = pdfScale({ pageW: 595, pageH: 842, cssW: 1000, dpr: 3, maxPixels: 12e6 });
  assert.ok(595 * k * 842 * k <= 12e6 + 1);
  assert.ok(k > 3);
});

test('pdfScale falls back to a width of 700 when the sheet has no width yet', () => {
  assert.equal(pdfScale({ pageW: 600, pageH: 800, cssW: 0, dpr: 1, maxPixels: 1e9 }), 2 * 700 / 600);
});
