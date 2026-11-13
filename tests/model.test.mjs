import test from 'node:test';
import assert from 'node:assert/strict';
import { childrenOf, ancestors, descendants, isAlive, rangeEnd, numbering, hidden, moveRange, maxIndent, filterCommands, migrate } from '../public/js/model.js';

const pages = [
  { id: 'a', type: 'page', bookId: 'b1', parentId: null, order: 2 },
  { id: 'b', type: 'page', bookId: 'b1', parentId: null, order: 1 },
  { id: 'a1', type: 'page', bookId: 'b1', parentId: 'a', order: 1 },
  { id: 'a2', type: 'page', bookId: 'b1', parentId: 'a', order: 2, deleted: true },
  { id: 'a1x', type: 'page', bookId: 'b1', parentId: 'a1', order: 1 },
  { id: 'c', type: 'page', bookId: 'b2', parentId: null, order: 1 },
];
const byId = new Map([...pages, { id: 'b1', type: 'book' }, { id: 'b2', type: 'book', deleted: true }].map(d => [d.id, d]));

test('childrenOf lists the top-level pages of a book in order', () => {
  assert.deepEqual(childrenOf(pages, { bookId: 'b1' }).map(p => p.id), ['b', 'a']);
});
test('childrenOf lists live subpages of a page and skips deleted ones', () => {
  assert.deepEqual(childrenOf(pages, { parentId: 'a' }).map(p => p.id), ['a1']);
});
test('ancestors returns the path from the root down to the parent', () => {
  assert.deepEqual(ancestors(byId, byId.get('a1x')).map(p => p.id), ['a', 'a1']);
});
test('descendants returns pages at every depth, deleted included', () => {
  assert.deepEqual(descendants(pages, 'a').map(p => p.id).sort(), ['a1', 'a1x', 'a2']);
});
test('isAlive is false when the page, an ancestor or its book is deleted', () => {
  assert.equal(isAlive(byId, byId.get('a1x')), true);
  assert.equal(isAlive(byId, byId.get('a2')), false);
  assert.equal(isAlive(byId, byId.get('c')), false);
  byId.get('a').deleted = true;
  assert.equal(isAlive(byId, byId.get('a1x')), false);
  delete byId.get('a').deleted;
});

const B = (id, t, indent = 0, extra = {}) => ({ id, t, indent, ...extra });

test('rangeEnd covers a block and everything indented under it', () => {
  const bl = [B(1, 'toggle'), B(2, 'p', 1), B(3, 'p', 2), B(4, 'p', 1), B(5, 'p')];
  assert.equal(rangeEnd(bl, 0), 4);
  assert.equal(rangeEnd(bl, 1), 3);
  assert.equal(rangeEnd(bl, 4), 5);
});
test('numbering counts consecutive numbered items and restarts after a break', () => {
  const bl = [B(1, 'num'), B(2, 'num'), B(3, 'p'), B(4, 'num')];
  assert.deepEqual([...numbering(bl)], [[1, 1], [2, 2], [4, 1]]);
});
test('numbering keeps counting across nested children and numbers each level separately', () => {
  const bl = [B(1, 'num'), B(2, 'num', 1), B(3, 'num', 1), B(4, 'num')];
  assert.deepEqual([...numbering(bl)], [[1, 1], [2, 1], [3, 2], [4, 2]]);
});
test('hidden returns the blocks inside a closed toggle, including nested ones', () => {
  const bl = [B(1, 'toggle', 0, { open: false }), B(2, 'p', 1), B(3, 'toggle', 1, { open: true }), B(4, 'p', 2), B(5, 'p')];
  assert.deepEqual([...hidden(bl)], [2, 3, 4]);
});
test('hidden is empty when every toggle is open', () => {
  assert.equal(hidden([B(1, 'toggle', 0, { open: true }), B(2, 'p', 1)]).size, 0);
});
test('moveRange moves a block with its children before the target index', () => {
  const bl = [B(1, 'p'), B(2, 'toggle'), B(3, 'p', 1), B(4, 'p')];
  assert.deepEqual(moveRange(bl, 1, 0).map(b => b.id), [2, 3, 1, 4]);
  assert.deepEqual(moveRange(bl, 1, 4).map(b => b.id), [1, 4, 2, 3]);
});
test('moveRange leaves the list alone when dropped inside its own range', () => {
  const bl = [B(1, 'p'), B(2, 'toggle'), B(3, 'p', 1), B(4, 'p')];
  assert.deepEqual(moveRange(bl, 1, 2).map(b => b.id), [1, 2, 3, 4]);
});
test('moveRange re-bases indentation so a moved block is never deeper than its new place allows', () => {
  const bl = [B(1, 'p'), B(2, 'p', 1), B(3, 'p', 2)];
  const out = moveRange(bl, 1, 0);
  assert.deepEqual(out.map(b => [b.id, b.indent]), [[2, 0], [3, 1], [1, 0]]);
});
test('maxIndent allows one level deeper than the previous block and none for the first', () => {
  const bl = [B(1, 'p'), B(2, 'p', 1), B(3, 'p')];
  assert.equal(maxIndent(bl, 0), 0);
  assert.equal(maxIndent(bl, 2), 2);
});

const cmds = [{ t: 'h1', label: 'Título 1', keys: 'h1 heading encabezado' }, { t: 'todo', label: 'Lista de tareas', keys: 'todo checkbox' }, { t: 'image', label: 'Imagen', keys: 'foto photo' }];
test('filterCommands matches label or keywords ignoring case and accents', () => {
  assert.deepEqual(filterCommands(cmds, 'titulo').map(c => c.t), ['h1']);
  assert.deepEqual(filterCommands(cmds, 'FOTO').map(c => c.t), ['image']);
  assert.equal(filterCommands(cmds, '').length, 3);
  assert.equal(filterCommands(cmds, 'zzz').length, 0);
});

test('migrate turns old subjects into top-level pages and re-parents their pages', () => {
  const docs = [
    { id: 's1', type: 'subject', bookId: 'b1', name: 'Mates', emoji: '📐', color: 'blue', order: 3 },
    { id: 'p1', type: 'page', subjectId: 's1', title: 'Tema 1', blocks: [] },
  ];
  const changed = migrate(docs);
  assert.equal(changed.length, 2);
  assert.deepEqual({ ...docs[0] }, { id: 's1', type: 'page', bookId: 'b1', parentId: null, title: 'Mates', icon: '📐', color: 'blue', order: 3, blocks: [] });
  assert.equal(docs[1].parentId, 's1');
  assert.equal(docs[1].bookId, 'b1');
  assert.equal('subjectId' in docs[1], false);
});
test('migrate changes nothing on current data', () => {
  assert.equal(migrate([{ id: 'p', type: 'page', bookId: 'b', parentId: null }]).length, 0);
});
