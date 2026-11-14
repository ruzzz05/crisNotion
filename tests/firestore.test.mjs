import test from 'node:test';
import assert from 'node:assert/strict';
import { firestore } from '../public/js/firestore.js';
import { createSync } from '../public/js/synccore.js';

/** Just enough of the Firestore REST API to exercise the adapter: commit, get and runQuery. */
function fakeFirestore() {
  const docs = new Map(); // full resource name -> fields
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 0, 1) + ++tick).toISOString();
  const calls = [];
  const fetch = async (address, { method, headers, body }) => {
    assert.equal(headers.Authorization, 'Bearer TOKEN');
    const path = decodeURIComponent(new URL(address).pathname.replace('/v1/', ''));
    const data = body ? JSON.parse(body) : null;
    calls.push(method + ' ' + path.split('/documents')[1]);
    const ok = json => ({ ok: true, status: 200, json: async () => json });
    if (path.endsWith(':commit')) {
      assert.ok(body.length < 10 * 1024 * 1024, 'request under the 10 MiB limit');
      const at = stamp();
      for (const w of data.writes) {
        if (w.delete) { docs.delete(w.delete); continue; }
        for (const v of Object.values(w.update.fields)) if (v.stringValue) assert.ok(v.stringValue.length < 1_000_000, 'field fits in a document');
        const fields = { ...w.update.fields };
        for (const t of w.updateTransforms || []) { assert.equal(t.setToServerValue, 'REQUEST_TIME'); fields[t.fieldPath] = { timestampValue: at }; }
        docs.set(w.update.name, fields);
      }
      return ok({});
    }
    if (path.endsWith(':runQuery')) {
      const q = data.structuredQuery, parent = path.slice(0, -':runQuery'.length) + '/' + q.from[0].collectionId + '/';
      let rows = [...docs].filter(([n]) => n.startsWith(parent)).map(([name, fields]) => ({ name, fields }))
        .sort((a, b) => a.fields.at.timestampValue.localeCompare(b.fields.at.timestampValue) || a.name.localeCompare(b.name));
      if (q.startAt) {
        const [at, ref] = [q.startAt.values[0].timestampValue, q.startAt.values[1].referenceValue];
        assert.equal(q.startAt.before, false);
        rows = rows.filter(r => r.fields.at.timestampValue > at || (r.fields.at.timestampValue === at && r.name > ref));
      }
      const keep = new Set(q.select.fields.map(f => f.fieldPath));
      rows = rows.slice(0, q.limit).map(r => ({ document: { name: r.name, fields: Object.fromEntries(Object.entries(r.fields).filter(([k]) => keep.has(k))) } }));
      return ok(rows.length ? rows : [{ readTime: stamp() }]);
    }
    const fields = docs.get(path);
    return fields ? ok({ name: path, fields }) : { ok: false, status: 404, json: async () => ({}) };
  };
  return { docs, fetch, calls };
}

const cloud = (fs, chunk) => firestore({ projectId: 'p', uid: 'u1', token: async () => 'TOKEN', fetch: fs.fetch, chunk });
const names = fs => [...fs.docs.keys()].map(n => n.split('/users/u1/')[1]).sort();

test('items are stored one per document and listed without their content', async () => {
  const fs = fakeFirestore(), c = cloud(fs);
  assert.deepEqual(await c.changes(null), { items: [], cursor: null });
  assert.deepEqual(await c.write([{ key: 'd_page', u: 7, payload: '{"a":1}' }, { key: 'i_ink~2', u: 8, payload: '[]' }]), [0, 0]);
  assert.deepEqual(names(fs), ['cuaderno/d_page', 'cuaderno/i_ink~2']);
  const first = await c.changes(null);
  assert.deepEqual(first.items, [{ key: 'd_page', u: 7, gone: false, x: 0 }, { key: 'i_ink~2', u: 8, gone: false, x: 0 }]);
  assert.deepEqual(await c.fetch('d_page'), { u: 7, gone: false, payload: '{"a":1}' });
  assert.equal(await c.fetch('d_nothing'), null);
  assert.deepEqual((await c.changes(first.cursor)).items, [], 'nothing new after the cursor, even for items written in the same instant');
  await c.write([{ key: 'd_page', u: 9, payload: null }]);
  const next = await c.changes(first.cursor);
  assert.deepEqual(next.items, [{ key: 'd_page', u: 9, gone: true, x: 0 }]);
  assert.deepEqual(await c.fetch('d_page'), { u: 9, gone: true, payload: null });
});

test('a payload too long for one document is split, read back whole, and its old pieces are cleaned up', async () => {
  const fs = fakeFirestore(), c = cloud(fs, 10);
  const long = 'abcdefghij'.repeat(3) + 'xyz';
  const [x] = await c.write([{ key: 'f_pdf', u: 5, payload: long }]);
  assert.deepEqual(x, [5, 4]);
  assert.deepEqual(names(fs), ['cuaderno/f_pdf', 'cuadernoParts/f_pdf~5~0', 'cuadernoParts/f_pdf~5~1', 'cuadernoParts/f_pdf~5~2', 'cuadernoParts/f_pdf~5~3']);
  assert.equal((await c.fetch('f_pdf')).payload, long);
  assert.deepEqual((await c.changes(null)).items, [{ key: 'f_pdf', u: 5, gone: false, x: [5, 4] }]);
  await c.write([{ key: 'f_pdf', u: 6, payload: 'short', prev: x }]);
  assert.deepEqual(names(fs), ['cuaderno/f_pdf']);
  assert.equal((await c.fetch('f_pdf')).payload, 'short');
  const [y] = await c.write([{ key: 'f_pdf', u: 7, payload: long, prev: 0 }]);
  await c.write([{ key: 'f_pdf', u: 8, payload: null, prev: y }]);
  assert.deepEqual(names(fs), ['cuaderno/f_pdf'], 'deleting removes the pieces and leaves only the marker');
});

test('listing goes on past one page of results', async () => {
  const fs = fakeFirestore(), c = cloud(fs);
  const many = Array.from({ length: 650 }, (_, i) => ({ key: 'd_' + String(i).padStart(4, '0'), u: i + 1, payload: 'x' }));
  for (let i = 0; i < many.length; i += 325) await c.write(many.slice(i, i + 325)); // two commits: 325 items share each instant
  const all = await c.changes(null);
  assert.equal(all.items.length, 650);
  assert.equal(new Set(all.items.map(i => i.key)).size, 650);
  assert.deepEqual((await c.changes(all.cursor)).items, []);
});

test('two devices sync through Firestore, large files included', async () => {
  const fs = fakeFirestore();
  const device = () => {
    const data = new Map(), kv = new Map();
    let t = 100;
    const sync = createSync({
      remote: cloud(fs, 50), now: () => ++t, state: { get: k => kv.get(k), set: (k, v) => kv.set(k, structuredClone(v)) },
      local: { read: async k => data.get(k) ?? null, apply: async (k, p) => { if (p == null) data.delete(k); else data.set(k, p); }, keys: async () => [], busy: () => false },
    });
    return { data, sync, set(k, v) { data.set(k, v); sync.mark(k, 'put'); }, del(k) { data.delete(k); sync.mark(k, 'del'); } };
  };
  const a = device(), b = device(), pdf = 'data:application/pdf;base64,' + 'QUJD'.repeat(60);
  a.set('d_page', '{"title":"Mates"}'); a.set('f_pdf', pdf);
  await a.sync.run();
  assert.equal((await b.sync.run()).pulled, 2);
  assert.equal(b.data.get('f_pdf'), pdf);
  fs.calls.length = 0;
  assert.deepEqual(await a.sync.run(), { pulled: 0, pushed: 0, deferred: 0, skipped: 0 });
  assert.deepEqual(fs.calls, ['POST /users/u1:runQuery'], 'an idle check costs one request');
  b.del('f_pdf'); await b.sync.run(); await a.sync.run();
  assert.equal(a.data.has('f_pdf'), false);
  assert.deepEqual(names(fs), ['cuaderno/d_page', 'cuaderno/f_pdf']);
});
