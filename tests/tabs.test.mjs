import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, open, navigate, close, activate, redirect, pruneScroll } from '../public/js/tabs.js';

test('starts with one tab on home', () => {
  const s = initial();
  assert.equal(s.tabs.length, 1);
  assert.equal(s.tabs[0].route, 'home');
  assert.equal(s.active, s.tabs[0].id);
});
test('open adds a tab right after the active one and activates it', () => {
  let s = open(initial(), 'page/a');
  s = activate(s, s.tabs[0].id);
  s = open(s, 'page/b');
  assert.deepEqual(s.tabs.map(t => t.route), ['home', 'page/b', 'page/a']);
  assert.equal(s.tabs.find(t => t.id === s.active).route, 'page/b');
});
test('navigate changes only the active tab', () => {
  let s = open(initial(), 'page/a');
  s = navigate(s, 'calendar');
  assert.deepEqual(s.tabs.map(t => t.route), ['home', 'calendar']);
});
test('close on the active tab activates the tab that takes its place', () => {
  let s = open(open(initial(), 'page/a'), 'page/b');
  s = activate(s, s.tabs[1].id);
  s = close(s, s.active);
  assert.deepEqual(s.tabs.map(t => t.route), ['home', 'page/b']);
  assert.equal(s.tabs.find(t => t.id === s.active).route, 'page/b');
});
test('close on the last tab of the strip activates the previous one', () => {
  let s = open(initial(), 'page/a');
  s = close(s, s.active);
  assert.equal(s.tabs.find(t => t.id === s.active).route, 'home');
});
test('closing a background tab keeps the active one', () => {
  let s = open(initial(), 'page/a');
  const active = s.active;
  s = close(s, s.tabs[0].id);
  assert.equal(s.active, active);
  assert.equal(s.tabs.length, 1);
});
test('closing the only tab leaves a fresh home tab', () => {
  let s = navigate(initial(), 'page/a');
  s = close(s, s.active);
  assert.deepEqual(s.tabs.map(t => t.route), ['home']);
  assert.equal(s.active, s.tabs[0].id);
});
test('redirect sends every tab showing a removed page somewhere else', () => {
  let s = open(navigate(initial(), 'page/a'), 'page/a');
  s = redirect(s, r => r === 'page/a', 'home');
  assert.deepEqual(s.tabs.map(t => t.route), ['home', 'home']);
});
test('tab ids are never reused', () => {
  let s = open(initial(), 'x');
  const closedId = s.active;
  s = close(s, s.active);
  s = open(s, 'y');
  assert.notEqual(s.active, closedId);
  assert.equal(new Set(s.tabs.map(t => t.id)).size, s.tabs.length);
});

import { current, restore } from '../public/js/tabs.js';

test('current returns the active tab', () => {
  const s = open(initial(), 'page/a');
  assert.equal(current(s).route, 'page/a');
});
test('restore accepts a saved state and falls back to a fresh one on garbage', () => {
  const s = open(initial(), 'page/a');
  assert.deepEqual(restore(JSON.stringify(s)), s);
  assert.deepEqual(restore('{"tabs":[],"active":"x"}'), initial());
  assert.deepEqual(restore('not json'), initial());
  assert.deepEqual(restore(null), initial());
});

test('pruneScroll forgets the scroll of tabs that no longer exist', () => {
  const s = open(initial(), 'page/a'); // tabs t1 and t2
  const memory = new Map([['t1|home', 120], ['t2|page/a', 40], ['t9|page/x', 7]]);
  assert.deepEqual([...pruneScroll(memory, s)], [['t1|home', 120], ['t2|page/a', 40]]);
});
