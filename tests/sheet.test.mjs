import test from 'node:test';
import assert from 'node:assert/strict';
import { placeImage, hitImage, resizeImage, resizeFrom, bottomOf, strokeSize, dragWidth } from '../public/js/sheet.js';

test('placeImage keeps the aspect ratio and caps the width', () => {
  assert.deepEqual(placeImage(2000, 1000, { maxW: 400, x: 40, y: 60 }), { x: 40, y: 60, w: 400, h: 200 });
});
test('placeImage never enlarges a small picture', () => {
  assert.deepEqual(placeImage(100, 50, { maxW: 400, x: 0, y: 0 }), { x: 0, y: 0, w: 100, h: 50 });
});

const imgs = [{ id: 'a', x: 0, y: 0, w: 200, h: 100 }, { id: 'b', x: 100, y: 50, w: 200, h: 100 }];

test('hitImage picks the topmost picture under the point', () => {
  assert.deepEqual(hitImage(imgs, 150, 75), { index: 1, mode: 'move' });
  assert.deepEqual(hitImage(imgs, 50, 20), { index: 0, mode: 'move' });
});
test('hitImage reports a resize when the point is in the bottom-right corner', () => {
  assert.deepEqual(hitImage(imgs, 290, 140), { index: 1, mode: 'resize', corner: 'se' });
});
test('hitImage returns null on empty paper', () => {
  assert.equal(hitImage(imgs, 600, 600), null);
});
test('resizeImage scales height with width and keeps a minimum size', () => {
  assert.deepEqual(resizeImage(imgs[0], 100), { id: 'a', x: 0, y: 0, w: 100, h: 50 });
  assert.equal(resizeImage(imgs[0], 5).w, 40);
});
test('resizeImage cannot grow past the right edge of the sheet', () => {
  assert.equal(resizeImage({ id: 'c', x: 900, y: 0, w: 50, h: 50 }, 500, 1000).w, 100);
});
test('bottomOf is the lowest edge of any picture', () => {
  assert.equal(bottomOf(imgs), 150);
  assert.equal(bottomOf([]), 0);
});

test('hitImage keeps most of a small picture for moving, with only its corner resizing', () => {
  const small = [{ id: 's', x: 0, y: 0, w: 30, h: 30 }];
  assert.deepEqual(hitImage(small, 15, 15), { index: 0, mode: 'move' });
  assert.deepEqual(hitImage(small, 28, 28), { index: 0, mode: 'resize', corner: 'se' });
});

test('hitImage resizes from any of the four corners', () => {
  const one = [{ id: 'a', x: 100, y: 100, w: 300, h: 200 }];
  assert.equal(hitImage(one, 105, 105).corner, 'nw');
  assert.equal(hitImage(one, 395, 105).corner, 'ne');
  assert.equal(hitImage(one, 105, 295).corner, 'sw');
  assert.equal(hitImage(one, 395, 295).corner, 'se');
  assert.deepEqual(hitImage(one, 250, 200), { index: 0, mode: 'move' });
});
test('resizeFrom keeps the opposite corner still and the proportions', () => {
  const m = { id: 'a', x: 100, y: 100, w: 300, h: 200 };
  assert.deepEqual(resizeFrom(m, 'se', 150), { id: 'a', x: 100, y: 100, w: 450, h: 300 });
  assert.deepEqual(resizeFrom(m, 'nw', 150), { id: 'a', x: 250, y: 200, w: 150, h: 100 });
  assert.deepEqual(resizeFrom(m, 'ne', -150), { id: 'a', x: 100, y: 200, w: 150, h: 100 });
  assert.deepEqual(resizeFrom(m, 'sw', -150), { id: 'a', x: 0, y: 100, w: 400, h: 267 });
});
test('resizeFrom stays inside the sheet and above a minimum size', () => {
  const m = { id: 'a', x: 100, y: 100, w: 300, h: 200 };
  assert.equal(resizeFrom(m, 'se', 5000, 1000).w, 900);
  assert.equal(resizeFrom(m, 'se', -5000).w, 40);
  const up = resizeFrom(m, 'ne', 5000, 1000);
  assert.equal(up.y, 0);
  assert.equal(up.h, 300);
});
test('strokeSize keeps the slider value inside its range', () => {
  assert.equal(strokeSize(0), 1);
  assert.equal(strokeSize(99), 14);
  assert.equal(strokeSize('5.5'), 5.5);
  assert.equal(strokeSize('x'), 4);
});
test('dragWidth turns a drag in pixels into a width in percent', () => {
  assert.equal(dragWidth(50, 100, 400), 75);
  assert.equal(dragWidth(50, 9999, 400), 100);
  assert.equal(dragWidth(50, -9999, 400), 10);
});

test('strokePath outlines a stroke as one smooth closed shape', async () => {
  const { strokePath } = await import('../public/js/sheet.js');
  const line = [0, 0, 0.5, 10, 2, 0.5, 20, 8, 0.5, 30, 18, 0.5, 40, 20, 0.5];
  const d = strokePath(line, 4);
  assert.ok(d.startsWith('M') && d.trim().endsWith('Z'), d.slice(0, 40));
  assert.ok(d.includes('Q'), 'the sides are curves, not straight segments');
  assert.ok(d.includes('A'), 'the ends are rounded');
  assert.ok(!/NaN|Infinity|undefined/.test(d));
  assert.equal((d.match(/Z/g) || []).length, 1, 'one shape per stroke');
});
test('strokePath: a tap is a dot, and pressing harder makes the stroke wider', async () => {
  const { strokePath } = await import('../public/js/sheet.js');
  const dot = strokePath([5, 5, 0.5], 4);
  assert.ok(dot.startsWith('M') && dot.includes('A') && !/NaN/.test(dot));
  // A level line at y = 500: how far above and below it the outline reaches is its thickness.
  const thick = d => { const ys = [...d.matchAll(/-?\d+(\.\d+)?/g)].map(m => Number(m[0])).filter(v => v > 400 && v < 600); return Math.max(...ys) - Math.min(...ys); };
  const flat = pr => strokePath([0, 500, pr, 20, 500, pr, 40, 500, pr, 60, 500, pr], 6);
  assert.ok(thick(flat(1)) > thick(flat(0.1)) * 2, 'pressing harder makes it wider: ' + thick(flat(1)) + ' vs ' + thick(flat(0.1)));
  assert.ok(!/NaN/.test(strokePath([1, 1, 0.5, 1, 1, 0.5, 1, 1, 0.5], 4)), 'repeated points do not break it');
});
test('colours: sliders give a hex colour and a hex colour gives the sliders back', async () => {
  const { hslToHex, hexToHsl, cleanHex } = await import('../public/js/sheet.js');
  assert.equal(hslToHex(0, 100, 50), '#ff0000');
  assert.equal(hslToHex(120, 100, 50), '#00ff00');
  assert.equal(hslToHex(240, 100, 50), '#0000ff');
  assert.equal(hslToHex(0, 0, 100), '#ffffff');
  assert.deepEqual(hexToHsl('#ff0000'), [0, 100, 50]);
  assert.deepEqual(hexToHsl(hslToHex(210, 60, 40)), [210, 60, 40]);
  assert.equal(cleanHex('#AbC'), '#aabbcc');
  assert.equal(cleanHex('1e90ff'), '#1e90ff');
  assert.equal(cleanHex('rojo'), null);
  assert.equal(cleanHex('#12345'), null);
});

test('inkSlots: the four quick colours of the toolbar are always four valid colours', async () => {
  const { inkSlots } = await import('../public/js/sheet.js');
  const names = ['ink', 'blue', 'red', 'green', 'orange'];
  assert.deepEqual(inkSlots(undefined, names), ['ink', 'blue', 'red', 'green']);
  assert.deepEqual(inkSlots(['red', '#ABC', 'nope', 'blue', 'green', 'ink'], names), ['red', '#aabbcc', 'red', 'blue']);
  assert.deepEqual(inkSlots(['#123456'], names), ['#123456', 'blue', 'red', 'green']);
});

test('pushRecent: the colours used lately, newest first, no repeats, at most eight', async () => {
  const { pushRecent } = await import('../public/js/sheet.js');
  const names = ['ink', 'blue', 'red'];
  assert.deepEqual(pushRecent(undefined, '#ABC', names), ['#aabbcc']);
  assert.deepEqual(pushRecent(['red', '#123456'], '#123456', names), ['#123456', 'red']);
  assert.deepEqual(pushRecent(['red'], 'nope', names), ['red'], 'invalid colours are ignored');
  assert.deepEqual(pushRecent(['x', 'blue', 'blue', '#zzz'], 'red', names), ['red', 'blue'], 'stored junk is dropped');
  let l = [];
  for (let i = 0; i < 12; i++) l = pushRecent(l, '#' + String(i).padStart(2, '0') + '0000', names);
  assert.equal(l.length, 8);
  assert.equal(l[0], '#110000');
  assert.equal(l[7], '#040000');
});
