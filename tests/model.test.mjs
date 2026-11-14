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
// ---------- Columns: consecutive blocks sharing a `row` id sit side by side ----------
import { rowOf, joinRow, leaveRow, normalizeRows, rowSizes, belowIndex } from '../public/js/model.js';

const ids = bl => bl.map(b => b.id);
const rows = bl => bl.map(b => b.row || '-').join('');

test('moveRange keeps the same block objects, so editor closures stay valid', () => {
  const bl = [B(1, 'p'), B(2, 'p', 1), B(3, 'p', 2)];
  const out = moveRange(bl, 1, 0);
  assert.ok(out.every(b => bl.includes(b)));
});
test('rowOf returns the span of the row a block belongs to, or just the block', () => {
  const bl = [B(1, 'p'), B(2, 'image', 0, { row: 'r' }), B(3, 'p', 0, { row: 'r' }), B(4, 'p')];
  assert.deepEqual(rowOf(bl, 2), [1, 3]);
  assert.deepEqual(rowOf(bl, 0), [0, 1]);
});
test('joinRow puts a block to the right of another and gives both the same row', () => {
  const bl = [B(1, 'image'), B(2, 'p'), B(3, 'image')];
  const out = joinRow(bl, 2, 0, 'right', 'r');
  assert.deepEqual(ids(out), [1, 3, 2]);
  assert.equal(rows(out), 'rr-');
});
test('joinRow can place the block on the left', () => {
  const bl = [B(1, 'image'), B(2, 'p')];
  const out = joinRow(bl, 1, 0, 'left', 'r');
  assert.deepEqual(ids(out), [2, 1]);
  assert.equal(rows(out), 'rr');
});
test('joinRow adds to an existing row and keeps its id', () => {
  const bl = [B(1, 'p', 0, { row: 'a' }), B(2, 'p', 0, { row: 'a' }), B(3, 'p')];
  const out = joinRow(bl, 2, 1, 'right', 'new');
  assert.deepEqual(ids(out), [1, 2, 3]);
  assert.equal(rows(out), 'aaa');
});
test('joinRow reorders inside a row without changing its size', () => {
  const bl = [B(1, 'p', 0, { row: 'a' }), B(2, 'p', 0, { row: 'a' })];
  assert.deepEqual(ids(joinRow(bl, 0, 1, 'right', 'x')), [2, 1]);
});
test('joinRow refuses a fifth column', () => {
  const bl = [1, 2, 3, 4].map(i => B(i, 'p', 0, { row: 'a' })).concat(B(5, 'p'));
  assert.equal(joinRow(bl, 4, 0, 'left', 'x'), bl);
});
test('joinRow refuses blocks that have nested blocks under them', () => {
  const bl = [B(1, 'p'), B(2, 'toggle'), B(3, 'p', 1)];
  assert.equal(joinRow(bl, 1, 0, 'right', 'x'), bl);
  assert.equal(joinRow(bl, 0, 1, 'right', 'x'), bl);
});
test('joinRow takes the indent of the block it joins', () => {
  const bl = [B(1, 'p'), B(2, 'p', 1), B(3, 'p')];
  const out = joinRow(bl, 1, 2, 'left', 'r');
  assert.equal(out.find(b => b.id === 2).indent, 0);
});
test('leaveRow moves the block below its row and dissolves a row of one', () => {
  const bl = [B(1, 'p', 0, { row: 'a' }), B(2, 'p', 0, { row: 'a' }), B(3, 'p')];
  const out = leaveRow(bl, 0);
  assert.deepEqual(ids(out), [2, 1, 3]);
  assert.equal(rows(out), '---');
});
test('leaveRow keeps the row when two or more blocks remain', () => {
  const bl = [1, 2, 3].map(i => B(i, 'p', 0, { row: 'a' }));
  const out = leaveRow(bl, 1);
  assert.deepEqual(ids(out), [1, 3, 2]);
  assert.equal(rows(out), 'aa-');
});
test('normalizeRows clears the row of a block left alone', () => {
  const bl = [B(1, 'p', 0, { row: 'a' }), B(2, 'p'), B(3, 'p', 0, { row: 'a' })];
  normalizeRows(bl);
  assert.equal(rows(bl), '---');
});
test('rowSizes maps each block in a row to the number of columns', () => {
  const bl = [B(1, 'p', 0, { row: 'a' }), B(2, 'p', 0, { row: 'a' }), B(3, 'p')];
  assert.deepEqual([...rowSizes(bl)], [[1, 2], [2, 2]]);
});
test('belowIndex is the end of the row for a column and the end of the nested range otherwise', () => {
  const bl = [B(1, 'p', 0, { row: 'a' }), B(2, 'p', 0, { row: 'a' }), B(3, 'toggle'), B(4, 'p', 1)];
  assert.equal(belowIndex(bl, 0), 2);
  assert.equal(belowIndex(bl, 2), 4);
});

test('migrate changes nothing on current data', () => {
  assert.equal(migrate([{ id: 'p', type: 'page', bookId: 'b', parentId: null }]).length, 0);
});

test('side notes of a PDF sheet are added, listed and removed per sheet and side', async () => {
  const { sideList, sideAdd, sideRemove, sidesUsed } = await import('../public/js/model.js');
  const b = { id: 'p', t: 'pdf' };
  assert.deepEqual(sideList(b, 1, 'l'), []);
  assert.deepEqual(sidesUsed(b), { l: false, r: false });
  sideAdd(b, 2, 'r', { id: 'n1', t: 'text' });
  sideAdd(b, 2, 'r', { id: 'n2', t: 'image', blob: 'x' });
  assert.deepEqual(sideList(b, 2, 'r').map(x => x.id), ['n1', 'n2']);
  assert.deepEqual(sideList(b, 2, 'l'), []);
  assert.deepEqual(sidesUsed(b), { l: false, r: true });
  assert.equal(sideRemove(b, 2, 'r', 'n1').id, 'n1');
  sideRemove(b, 2, 'r', 'n2');
  assert.equal(b.side, undefined);
});
test('pdfAssets lists every file and drawing a PDF block owns', async () => {
  const { pdfAssets } = await import('../public/js/model.js');
  const b = { id: 'p', t: 'pdf', blob: 'file', n: 2, side: { 1: { l: [{ id: 'a', t: 'image', blob: 'pic' }, { id: 'b', t: 'draw' }], r: [{ id: 'c', t: 'text' }] } } };
  assert.deepEqual(pdfAssets(b), { blobs: ['file', 'pic'], drawings: ['p:1', 'p:2', 'b'] });
});
test('photoIndex rotates through the photos once per period', async () => {
  const { photoIndex, nextSwap } = await import('../public/js/model.js');
  const H = 3600e3;
  assert.equal(photoIndex(0, 1, 3), 0);
  assert.equal(photoIndex(H + 5, 1, 3), 1);
  assert.equal(photoIndex(3 * H, 1, 3), 0);
  assert.equal(photoIndex(2 * H, 3, 3), 0);
  assert.equal(photoIndex(3 * H, 3, 3), 1);
  assert.equal(photoIndex(5, 1, 0), -1);
  // A daily photo changes at local midnight, not at midnight UTC.
  assert.equal(photoIndex(23 * H, 24, 5, -120), 1);
  assert.equal(nextSwap(H + 5, 1), 2 * H);
  assert.equal(nextSwap(23 * H, 24, -120), 46 * H);
});

// ---------- Multi-day events, custom kinds, task ordering ----------
import { spanPart, mergeKinds, placeAt, groupTasks } from '../public/js/model.js';

test('spanPart: a one-day event shows its title', () => {
  assert.equal(spanPart({ date: '2026-11-10' }, '2026-11-10'), 'single');
  assert.equal(spanPart({ date: '2026-11-10', endDate: '2026-11-10' }, '2026-11-10'), 'single');
});
test('spanPart: a multi-day event names its first and last day, not the ones between', () => {
  const e = { date: '2026-11-10', endDate: '2026-11-12' };
  assert.deepEqual(['2026-11-10', '2026-11-11', '2026-11-12'].map(d => spanPart(e, d)), ['start', 'mid', 'end']);
});

test('mergeKinds appends custom kinds after the built-in ones', () => {
  const k = mergeKinds({ a: ['A', 'red'] }, [{ id: 'x1', name: 'Gym', color: 'green' }]);
  assert.deepEqual(k, { a: ['A', 'red'], x1: ['Gym', 'green'] });
});
test('mergeKinds never lets a custom kind replace a built-in one', () => {
  assert.deepEqual(mergeKinds({ a: ['A', 'red'] }, [{ id: 'a', name: 'Fake', color: 'blue' }]), { a: ['A', 'red'] });
});

test('placeAt moves an item to an index of the list without it', () => {
  const l = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(placeAt(l, 1, 2).map(x => x.id), [2, 3, 1]);
  assert.deepEqual(placeAt(l, 3, 0).map(x => x.id), [3, 1, 2]);
});
test('placeAt accepts an item that comes from another list', () => {
  assert.deepEqual(placeAt([{ id: 1 }], { id: 9 }, 0).map(x => x.id), [9, 1]);
});

test('groupTasks puts uncategorised tasks first, then each list, ordered by `order`', () => {
  const lists = [{ id: 'L1', order: 2 }, { id: 'L2', order: 1 }];
  const tasks = [{ id: 'a', order: 5, listId: 'L1' }, { id: 'b', order: 1 }, { id: 'c', order: 0, listId: 'L2' }, { id: 'd', order: 0, listId: 'gone' }, { id: 'e', order: 0.5 }];
  const g = groupTasks(tasks, lists);
  assert.deepEqual(g.map(x => x.list?.id ?? null), [null, 'L2', 'L1']);
  assert.deepEqual(g[0].tasks.map(t => t.id), ['d', 'e', 'b']); // a deleted list's tasks fall back to no category
});
