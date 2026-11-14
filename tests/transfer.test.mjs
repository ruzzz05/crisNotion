import test from 'node:test';
import assert from 'node:assert/strict';
import { pageAssets, remapBundle, resolveTheme } from '../public/js/model.js';

test('resolveTheme: white is the default and "system" follows the device', () => {
  assert.equal(resolveTheme(null, true), 'white');
  assert.equal(resolveTheme('nonsense', true), 'white');
  assert.equal(resolveTheme('beige', true), 'beige');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'white');
});

const page = {
  id: 'p1', type: 'page', bookId: 'b1', parentId: null, title: 'Mates', cover: 'img:cov', bg: 'img:fondo', fav: true,
  blocks: [
    { id: 't', t: 'p', html: 'hola' },
    { id: 'i', t: 'image', blob: 'foto' },
    { id: 'd', t: 'draw' },
    { id: 'f', t: 'pdf', blob: 'file', n: 2, side: { 1: { r: [{ id: 'n1', t: 'image', blob: 'margen' }, { id: 'n2', t: 'draw' }] } } },
    { id: 's', t: 'page', pageId: 'p2' },
  ],
};

test('pageAssets lists the files and drawings a page needs', () => {
  assert.deepEqual(pageAssets(page), { blobs: ['cov', 'fondo', 'foto', 'file', 'margen'], drawings: ['d', 'f:1', 'f:2', 'n2'] });
  assert.deepEqual(pageAssets({ id: 'x', type: 'page', cover: 'c:g1' }), { blobs: [], drawings: [] });
});

const bundle = () => ({
  app: 'cuaderno', kind: 'book', root: 'b1',
  docs: [
    { id: 'b1', type: 'book', name: 'Curso' },
    structuredClone(page),
    { id: 'p2', type: 'page', bookId: 'b1', parentId: 'p1', title: 'Tema 1', blocks: [{ id: 't2', t: 'p', row: 'r1' }, { id: 't3', t: 'p', row: 'r1' }] },
  ],
  drawings: [{ id: 'd', strokes: [1], images: [{ id: 'm', blob: 'dentro', x: 0 }] }, { id: 'f:1', strokes: [2] }, { id: 'n2', strokes: [] }],
  blobs: [{ id: 'cov', data: 'x' }, { id: 'foto', data: 'y' }, { id: 'dentro', data: 'z' }],
});

test('remapBundle gives everything new ids and keeps every link between the pieces', () => {
  let n = 0;
  const src = bundle(), out = remapBundle(src, () => 'N' + ++n);
  const [book, p1, p2] = out.docs;
  const all = JSON.stringify(out);
  for (const old of ['"b1"', '"p1"', '"p2"', '"d"', '"foto"', '"cov"', '"dentro"', '"n2"', '"f:1"', 'img:cov']) assert.ok(!all.includes(old), 'still has ' + old);
  assert.equal(out.root, book.id);
  assert.equal(p1.bookId, book.id);
  assert.equal(p2.bookId, book.id);
  assert.equal(p1.parentId, null);
  assert.equal(p2.parentId, p1.id);
  assert.equal(p1.blocks[4].pageId, p2.id);
  assert.equal(p1.cover, 'img:' + out.blobs[0].id);
  assert.equal(p1.blocks[1].blob, out.blobs[1].id);
  assert.equal(out.drawings[0].id, p1.blocks[2].id);
  assert.equal(out.drawings[0].images[0].blob, out.blobs[2].id);
  assert.equal(out.drawings[1].id, p1.blocks[3].id + ':1');
  assert.equal(out.drawings[2].id, p1.blocks[3].side[1].r[1].id);
  assert.equal(p2.blocks[0].row, p2.blocks[1].row);
  assert.notEqual(p2.blocks[0].row, 'r1');
  assert.equal(p1.title, 'Mates');
  assert.equal(p1.fav, undefined, 'an imported page does not arrive starred');
  assert.equal(src.docs[1].id, 'p1', 'the source is left untouched');
});

test('remapBundle of a single page detaches it from the parent it had', () => {
  let n = 0;
  const out = remapBundle({ app: 'cuaderno', kind: 'page', root: 'p2', docs: [bundle().docs[2]], drawings: [], blobs: [] }, () => 'N' + ++n);
  assert.equal(out.docs[0].parentId, null);
  assert.equal(out.root, out.docs[0].id);
});
