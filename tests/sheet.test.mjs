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
