import test from 'node:test';
import assert from 'node:assert/strict';
import { ascii, split, keyOf, parseKey, decide, usernameToEmail, validateUsername, ownerAction, needsChoice, accountRole, createSync, isFileData } from '../public/js/synccore.js';

test('ascii keeps JSON valid while leaving only ASCII, so it can be cut anywhere', () => {
  const src = JSON.stringify({ t: 'Matemáticas 🚀 «límites»' });
  const out = ascii(src);
  assert.ok(/^[\x00-\x7e]*$/.test(out));
  assert.deepEqual(JSON.parse(out), JSON.parse(src));
  assert.equal(split(out, 7).join(''), out);
  assert.ok(split(out, 7).every(p => p.length <= 7));
  assert.deepEqual(split('', 5), ['']);
});

test('keys name the kind and survive ids with a colon (PDF sheet ink)', () => {
  assert.equal(keyOf('i', 'abc:3'), 'i_abc~3');
  assert.deepEqual(parseKey('i_abc~3'), { kind: 'i', id: 'abc:3' });
  assert.deepEqual(parseKey(keyOf('d', 'settings')), { kind: 'd', id: 'settings' });
});

test('decide: the newest change wins; our own uploads are not downloaded again', () => {
  assert.equal(decide({ remoteU: 5, synced: 5, dirty: null }), 'skip');
  assert.equal(decide({ remoteU: 6, synced: 5, dirty: null }), 'pull');
  assert.equal(decide({ remoteU: 6, synced: undefined, dirty: null }), 'pull');
  assert.equal(decide({ remoteU: 6, synced: 5, dirty: { u: 9 } }), 'keep');
  assert.equal(decide({ remoteU: 9, synced: 5, dirty: { u: 6 } }), 'pull');
});

test('accounts use the same user names as Mi App', () => {
  assert.equal(usernameToEmail(' Cris '), 'cris@mi-app.invalid');
  assert.equal(validateUsername('ab'), 'El usuario debe tener de 3 a 20 caracteres: letras, números, punto, guion o guion bajo.');
  assert.equal(validateUsername('cris.05'), null);
  assert.equal(ownerAction(null, 'u1'), 'claim');
  assert.equal(ownerAction('u1', 'u1'), 'keep');
  assert.equal(ownerAction('u1', 'u2'), 'other');
});

// ---------- two devices sharing one fake cloud ----------

function fakeCloud() {
  const docs = new Map(); // key -> {u, gone, payload, at}
  let clock = 0;
  return {
    docs, fail: false, fetched: [], writes: 0,
    async changes(cursor) {
      if (this.fail) throw new Error('offline');
      const items = [...docs].filter(([, d]) => d.at > (cursor || 0)).sort((a, b) => a[1].at - b[1].at).map(([key, d]) => ({ key, u: d.u, gone: d.gone, x: d.x }));
      return { items, cursor: clock };
    },
    async fetch(key) {
      this.fetched.push(key);
      const d = docs.get(key);
      return d ? { u: d.u, gone: d.gone, payload: d.payload } : null;
    },
    async write(items) {
      if (this.fail) throw new Error('offline');
      this.writes++;
      return items.map(it => { docs.set(it.key, { u: it.u, gone: it.payload == null, payload: it.payload, at: ++clock, x: 'x' + clock }); return 'x' + clock; });
    },
  };
}

function device(cloud, opts = {}) {
  const data = new Map(), kv = new Map();
  let t = opts.t0 || 1000;
  const dev = {
    data, busy: new Set(), applied: [],
    now: () => ++t,
    set(key, value) { data.set(key, { payload: value, u: ++t }); dev.sync.mark(key, 'put'); },
    del(key) { data.delete(key); dev.sync.mark(key, 'del'); },
    get: key => data.get(key)?.payload,
  };
  dev.sync = createSync({
    remote: cloud, now: () => ++t, maxPayload: opts.maxPayload,
    state: { get: k => kv.get(k), set: (k, v) => kv.set(k, structuredClone(v)) },
    local: {
      read: async key => data.get(key)?.payload ?? null,
      apply: async (key, payload, u) => { dev.applied.push(key); if (payload == null) data.delete(key); else data.set(key, { payload, u }); },
      keys: async () => [...data].map(([key, v]) => ({ key, u: v.u })),
      busy: key => dev.busy.has(key),
    },
  });
  return dev;
}

test('what one device writes reaches the other, and deleting does too', async () => {
  const cloud = fakeCloud(), a = device(cloud), b = device(cloud);
  a.set('d_page', '{"t":"hola"}');
  a.set('f_photo', 'data:image/jpeg;base64,AAAA');
  assert.deepEqual(await a.sync.run(), { pulled: 0, pushed: 2, deferred: 0, skipped: 0 });
  assert.equal((await b.sync.run()).pulled, 2);
  assert.equal(b.get('d_page'), '{"t":"hola"}');
  assert.equal(b.get('f_photo'), 'data:image/jpeg;base64,AAAA');
  b.del('d_page');
  await b.sync.run();
  await a.sync.run();
  assert.equal(a.get('d_page'), undefined);
  assert.equal(a.get('f_photo'), 'data:image/jpeg;base64,AAAA');
});

test('a device does not download again what it has just uploaded', async () => {
  const cloud = fakeCloud(), a = device(cloud);
  a.set('d_page', 'v1');
  await a.sync.run();
  cloud.fetched.length = 0;
  assert.deepEqual(await a.sync.run(), { pulled: 0, pushed: 0, deferred: 0, skipped: 0 });
  assert.deepEqual(cloud.fetched, []);
  assert.deepEqual(a.applied, []);
});

test('when two devices change the same thing, the latest change wins on both', async () => {
  const cloud = fakeCloud(), a = device(cloud, { t0: 1000 }), b = device(cloud, { t0: 5000 });
  a.set('d_page', 'base'); await a.sync.run(); await b.sync.run();
  a.set('d_page', 'from A (older)');
  b.set('d_page', 'from B (newer)');
  await a.sync.run();
  await b.sync.run();
  await a.sync.run();
  assert.equal(a.get('d_page'), 'from B (newer)');
  assert.equal(b.get('d_page'), 'from B (newer)');
  assert.equal(cloud.docs.get('d_page').payload, 'from B (newer)');
});

test('without connection changes wait and go up later', async () => {
  const cloud = fakeCloud(), a = device(cloud), b = device(cloud);
  cloud.fail = true;
  a.set('d_page', 'offline edit');
  await assert.rejects(a.sync.run());
  assert.equal(a.sync.pending(), 1);
  cloud.fail = false;
  assert.equal((await a.sync.run()).pushed, 1);
  assert.equal(a.sync.pending(), 0);
  await b.sync.run();
  assert.equal(b.get('d_page'), 'offline edit');
});

test('a change made while its upload was in flight is not lost', async () => {
  const cloud = fakeCloud(), a = device(cloud);
  a.set('d_page', 'v1');
  const write = cloud.write.bind(cloud);
  cloud.write = async items => { const r = await write(items); cloud.write = write; a.set('d_page', 'v2'); return r; };
  await a.sync.run();
  assert.equal(a.sync.pending(), 1);
  await a.sync.run();
  assert.equal(cloud.docs.get('d_page').payload, 'v2');
});

test('the first sync of a device that already has notes uploads all of them', async () => {
  const cloud = fakeCloud(), a = device(cloud), b = device(cloud);
  a.data.set('d_one', { payload: '1', u: 10 });
  a.data.set('i_ink', { payload: '2', u: 20 });
  await a.sync.markAll();
  assert.equal((await a.sync.run()).pushed, 2);
  await b.sync.run();
  assert.equal(b.get('d_one'), '1');
  assert.equal(b.get('i_ink'), '2');
});

test('a page being edited is not replaced under the cursor; it is taken later', async () => {
  const cloud = fakeCloud(), a = device(cloud), b = device(cloud);
  a.set('d_page', 'v1'); await a.sync.run(); await b.sync.run();
  a.set('d_page', 'v2'); await a.sync.run();
  b.busy.add('d_page');
  assert.equal((await b.sync.run()).deferred, 1);
  assert.equal(b.get('d_page'), 'v1');
  b.busy.clear();
  assert.equal((await b.sync.run()).pulled, 1);
  assert.equal(b.get('d_page'), 'v2');
});

test('a file too large for the cloud stays on the device and is reported, the rest still syncs', async () => {
  const cloud = fakeCloud(), a = device(cloud, { maxPayload: 10 });
  a.set('f_big', 'x'.repeat(50));
  a.set('d_page', 'small');
  assert.deepEqual(await a.sync.run(), { pulled: 0, pushed: 1, deferred: 0, skipped: 1 });
  assert.equal(cloud.docs.has('f_big'), false);
  assert.equal(a.sync.pending(), 0);
  assert.deepEqual(a.sync.tooBig(), ['f_big']);
});

test('reset forgets the cloud position so another account starts clean', async () => {
  const cloud = fakeCloud(), a = device(cloud);
  a.set('d_page', 'v1'); await a.sync.run();
  a.sync.reset();
  assert.equal(a.sync.pending(), 0);
  const other = fakeCloud();
  a.sync.remote = other;
  await a.sync.markAll();
  await a.sync.run();
  assert.equal(other.docs.get('d_page').payload, 'v1');
});

test('isFileData accepts photos and PDFs, also when the browser gave a PDF no type', () => {
  assert.ok(isFileData('data:image/jpeg;base64,AAAA'));
  assert.ok(isFileData('data:application/pdf;base64,AAAA'));
  assert.ok(isFileData('data:application/octet-stream;base64,AAAA'));
  assert.ok(isFileData('data:;base64,AAAA'));
  assert.ok(!isFileData('data:text/html;base64,AAAA'));
  assert.ok(!isFileData('javascript:alert(1)'));
  assert.ok(!isFileData(null));
});

test('needsChoice: a device with notes and an account with notes are never joined without asking', () => {
  assert.equal(needsChoice(true, true), true);
  assert.equal(needsChoice(true, false), false); // empty account: the device's notes just go up
  assert.equal(needsChoice(false, true), false); // empty device: the account's notes just come down
  assert.equal(needsChoice(false, false), false);
});

test('accountRole: only the main account syncs; any other is a guest', () => {
  assert.equal(accountRole(null, 'u1'), 'unset');
  assert.equal(accountRole({}, 'u1'), 'unset');
  assert.equal(accountRole({ uid: 'u1' }, 'u1'), 'main');
  assert.equal(accountRole({ uid: 'u1' }, 'u2'), 'guest');
});
