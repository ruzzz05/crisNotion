import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../public/js/history.js';

test('undo returns the state before the last change, and nothing when there is none', () => {
  const h = createHistory();
  assert.equal(h.undo('now'), null);
  h.record('one');
  assert.equal(h.canUndo(), true);
  assert.equal(h.undo('two'), 'one');
  assert.equal(h.canUndo(), false);
});

test('redo returns the state that undo left, and a new change clears redo', () => {
  const h = createHistory();
  h.record('one');
  h.undo('two');
  assert.equal(h.canRedo(), true);
  assert.equal(h.redo('one'), 'two');
  h.record('x');
  h.undo('y');
  h.record('z');
  assert.equal(h.canRedo(), false);
  assert.equal(h.redo('q'), null);
});

test('steps back in order through several changes', () => {
  const h = createHistory();
  h.record('a');
  h.record('b');
  h.record('c');
  assert.equal(h.undo('d'), 'c');
  assert.equal(h.undo('c'), 'b');
  assert.equal(h.undo('b'), 'a');
  assert.equal(h.redo('a'), 'b');
});

test('keeps at most `limit` steps, dropping the oldest', () => {
  const h = createHistory(2);
  h.record('a');
  h.record('b');
  h.record('c');
  assert.equal(h.undo('d'), 'c');
  assert.equal(h.undo('c'), 'b');
  assert.equal(h.canUndo(), false);
});

test('clear forgets both stacks', () => {
  const h = createHistory();
  h.record('a');
  h.undo('b');
  h.clear();
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
});
