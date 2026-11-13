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
