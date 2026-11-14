import test from 'node:test';
import assert from 'node:assert/strict';
import { ymd, parseYmd, dow, mins, hhmm, relDay, esc, col, tint, COLORS, greeting } from '../public/js/util.js';

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
