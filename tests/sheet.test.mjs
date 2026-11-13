import test from 'node:test';
import assert from 'node:assert/strict';
import { placeImage, hitImage, resizeImage, bottomOf } from '../public/js/sheet.js';

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
  assert.deepEqual(hitImage(imgs, 290, 140), { index: 1, mode: 'resize' });
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
  assert.deepEqual(hitImage(small, 5, 5), { index: 0, mode: 'move' });
  assert.deepEqual(hitImage(small, 28, 28), { index: 0, mode: 'resize' });
});
