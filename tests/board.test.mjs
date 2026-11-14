import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_SIZES, defaultHome, normalizeHome, moveItem, spanFor, pomoLeft, pomoStart, pomoPause, pomoReset, pomoNext, pomoDone, mmss } from '../public/js/board.js';

test('the home board starts with what Inicio always showed, in the same order', () => {
  assert.deepEqual(defaultHome().map(i => i.t), ['hello', 'photos', 'recent', 'classes', 'events', 'tasks']);
  assert.ok(defaultHome().every(i => i.id && i.w >= 1 && i.w <= 12 && i.h >= 1));
});

test('normalizeHome keeps only known widgets, with sizes inside their limits and unique ids', () => {
  const out = normalizeHome([{ id: 'a', t: 'clock', w: 99, h: 0 }, { id: 'a', t: 'text', w: 4, h: 3, html: 'x' }, { id: 'b', t: 'nope' }, null, { t: 'hello', w: 12, h: 2 }, { id: 'c', t: 'hello' }], () => 'new');
  assert.deepEqual(out.map(i => i.t), ['clock', 'text', 'hello']);
  assert.equal(out[0].w, 12);
  assert.equal(out[0].h, WIDGET_SIZES.clock.minH);
  assert.equal(out[1].id, 'new', 'a repeated id is replaced');
  assert.equal(out[1].html, 'x');
  assert.equal(out[2].id, 'new');
  assert.equal(out.filter(i => i.t === 'hello').length, 1, 'built-in widgets appear once');
  assert.deepEqual(normalizeHome(undefined, () => 'x').map(i => i.t), defaultHome().map(i => i.t));
  assert.deepEqual(normalizeHome([], () => 'x'), [], 'an emptied board stays empty');
});

test('moveItem puts a widget at a new place among the others', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveItem(items, 'c', 0).map(i => i.id), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(items, 'a', 2).map(i => i.id), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(items, 'a', 99).map(i => i.id), ['b', 'c', 'a']);
  assert.equal(moveItem(items, 'b', 1), items, 'no change returns the same array');
  assert.equal(moveItem(items, 'zz', 0), items);
});

test('spanFor snaps a size in pixels to whole cells of the grid', () => {
  // cells of 50 with a gap of 10: 1 cell = 50, 2 = 110, 3 = 170
  assert.equal(spanFor(50, 50, 10, 1, 12), 1);
  assert.equal(spanFor(105, 50, 10, 1, 12), 2);
  assert.equal(spanFor(141, 50, 10, 1, 12), 3);
  assert.equal(spanFor(5, 50, 10, 2, 12), 2);
  assert.equal(spanFor(5000, 50, 10, 1, 12), 12);
});

test('pomodoro: runs, pauses keeping what was left, and resets', () => {
  const p = { work: 25, rest: 5, phase: 'work' };
  assert.equal(pomoLeft(p, 0), 25 * 60000);
  const run = pomoStart(p, 1000);
  assert.equal(run.endsAt, 1000 + 25 * 60000);
  assert.equal(pomoLeft(run, 61000), 24 * 60000);
  assert.equal(pomoDone(run, 61000), false);
  const paused = pomoPause(run, 61000);
  assert.equal(paused.endsAt, null);
  assert.equal(pomoLeft(paused, 999999), 24 * 60000);
  assert.equal(pomoStart(paused, 100000).endsAt, 100000 + 24 * 60000);
  assert.equal(pomoLeft(pomoReset(paused), 0), 25 * 60000);
  assert.equal(pomoDone(run, 1000 + 25 * 60000), true);
  assert.equal(pomoLeft(run, 1e12), 0);
});

test('pomodoro: after work comes the break, and finished sessions are counted per day', () => {
  let p = pomoStart({ work: 25, rest: 5, phase: 'work' }, 0);
  p = pomoNext(p, '2026-11-14');
  assert.deepEqual([p.phase, p.endsAt, p.count], ['rest', null, { day: '2026-11-14', n: 1 }]);
  assert.equal(pomoLeft(p, 0), 5 * 60000);
  p = pomoNext(p, '2026-11-14');
  assert.deepEqual([p.phase, p.count.n], ['work', 1], 'a break does not count as a session');
  p = pomoNext(p, '2026-11-14');
  assert.equal(p.count.n, 2);
  p = pomoNext(pomoNext(p, '2026-11-15'), '2026-11-15');
  assert.deepEqual(p.count, { day: '2026-11-15', n: 1 }, 'the count starts again each day');
});

test('mmss shows the time left rounding up, so it only reads 00:00 at the end', () => {
  assert.equal(mmss(25 * 60000), '25:00');
  assert.equal(mmss(59001), '01:00');
  assert.equal(mmss(1), '00:01');
  assert.equal(mmss(0), '00:00');
  assert.equal(mmss(90 * 60000), '90:00');
});
