// The cloud side of sync (see synccore.js) on Firestore, through its REST API so no SDK is needed for data.
//   users/{uid}/cuaderno/{key}                one document per item: k (kind), u (changed at), at (server time),
//                                             gone (deleted marker), json (the payload) or parts (how many pieces)
//   users/{uid}/cuadernoParts/{key}~{u}~{n}   pieces of a payload too long for one document (1 MiB limit)
// `at` is set by the server, so "what changed since my last visit" does not depend on any device's clock.
import { split } from './synccore.js';

const PAGE = 300;

export function firestore({ projectId, uid, token, fetch = globalThis.fetch.bind(globalThis), chunk = 900000 }) {
  const root = `projects/${projectId}/databases/(default)/documents`;
  const base = 'https://firestore.googleapis.com/v1/' + root;
  const user = `users/${uid}`;
  const name = (coll, id) => `${root}/${user}/${coll}/${id}`;
  const url = (coll, id) => `${base}/${user}/${coll}/${encodeURIComponent(id)}`;
  const partId = (key, u, n) => `${key}~${u}~${n}`;

  async function call(method, address, body) {
    const res = await fetch(address, {
      method, headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw Object.assign(new Error('Firestore respondió ' + res.status), { status: res.status });
    return res.json();
  }
  const commit = writes => call('POST', base + ':commit', { writes });
  const int = v => Number(v?.integerValue ?? 0);
  /** What write() hands back and later receives as `prev`: where the pieces of this version are, if any. */
  const piecesOf = f => (int(f.parts) ? [int(f.u), int(f.parts)] : 0);
  const dropPieces = (key, prev) => (prev ? Array.from({ length: prev[1] }, (_, n) => ({ delete: name('cuadernoParts', partId(key, prev[0], n)) })) : []);

  return {
    /** Items changed after `cursor` (null = everything), oldest first, without their payload. */
    async changes(cursor) {
      const items = [];
      let cur = cursor;
      for (;;) {
        const q = {
          select: { fields: ['u', 'gone', 'parts', 'at'].map(fieldPath => ({ fieldPath })) },
          from: [{ collectionId: 'cuaderno' }],
          orderBy: [{ field: { fieldPath: 'at' }, direction: 'ASCENDING' }, { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
          limit: PAGE,
        };
        if (cur) q.startAt = { values: [{ timestampValue: cur.at }, { referenceValue: cur.name }], before: false };
        const docs = ((await call('POST', `${base}/${user}:runQuery`, { structuredQuery: q })) || []).filter(r => r.document).map(r => r.document);
        for (const d of docs) {
          items.push({ key: d.name.slice(d.name.lastIndexOf('/') + 1), u: int(d.fields.u), gone: !!d.fields.gone?.booleanValue, x: piecesOf(d.fields) });
          cur = { at: d.fields.at.timestampValue, name: d.name };
        }
        if (docs.length < PAGE) return { items, cursor: cur };
      }
    },

    async fetch(key) {
      const d = await call('GET', url('cuaderno', key));
      if (!d?.fields) return null;
      const f = d.fields, u = int(f.u), parts = int(f.parts);
      if (f.gone?.booleanValue) return { u, gone: true, payload: null };
      if (!parts) return { u, gone: false, payload: f.json?.stringValue ?? '' };
      const pieces = [];
      for (let n = 0; n < parts; n++) {
        const p = await call('GET', url('cuadernoParts', partId(key, u, n)));
        if (!p?.fields?.data) throw new Error('Falta un trozo de ' + key);
        pieces.push(p.fields.data.stringValue);
      }
      return { u, gone: false, payload: pieces.join('') };
    },

    /** items: [{key, u, payload | null (= deleted), prev}]. All of them appear in the cloud at once. */
    async write(items) {
      const writes = [], out = [];
      for (const it of items) {
        const fields = { k: { stringValue: it.key[0] }, u: { integerValue: String(it.u) } };
        let x = 0;
        if (it.payload == null) fields.gone = { booleanValue: true };
        else if (it.payload.length <= chunk) fields.json = { stringValue: it.payload };
        else {
          // Pieces go up first, one request each; the item only points at them once they are all there.
          const pieces = split(it.payload, chunk);
          for (let n = 0; n < pieces.length; n++) {
            await commit([{ update: { name: name('cuadernoParts', partId(it.key, it.u, n)), fields: { data: { stringValue: pieces[n] } } } }]);
          }
          fields.parts = { integerValue: String(pieces.length) };
          x = [it.u, pieces.length];
        }
        writes.push({ update: { name: name('cuaderno', it.key), fields }, updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }] });
        if (it.prev && it.prev[0] !== it.u) writes.push(...dropPieces(it.key, it.prev));
        out.push(x);
      }
      if (writes.length) await commit(writes);
      return out;
    },
  };
}
