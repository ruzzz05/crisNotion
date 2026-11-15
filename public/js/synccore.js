// Cloud sync rules, with no network and no DOM so they can be tested (tests/sync.test.mjs).
//
// Everything stored on the device is an item with a key:  d_<id> a doc (book, page, event, settings…),
// i_<id> the ink of a drawing, f_<id> a file (photo or PDF). An item travels as one string (its payload).
// Each item carries `u`, the moment it was last changed; when two devices changed the same item,
// the latest change wins. Deleting is a change too: the cloud keeps a marker so other devices delete it.

// ---------- Text ----------

/** Whether a data URL is a photo or a PDF. A PDF the browser gave no type to travels as octet-stream or without a type. */
export const isFileData = s => typeof s === 'string' && /^data:(image[/]|application[/](pdf|octet-stream)[;,]|;)/.test(s);

/** JSON text with every non-ASCII character escaped: still the same JSON, but safe to cut at any point. */
export const ascii = s => s.replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

export function split(s, size) {
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out.length ? out : [''];
}

// ---------- Keys ----------

// ":" (ink of a PDF sheet is "<block>:<sheet>") would read as a verb at the end of a REST address.
export const keyOf = (kind, id) => `${kind}_${id.replaceAll(':', '~')}`;
export const parseKey = key => ({ kind: key[0], id: key.slice(2).replaceAll('~', ':') });

// ---------- Accounts (the same scheme as Mi App, so one account serves both) ----------

const DOMAIN = '@mi-app.invalid';
const normalize = u => String(u ?? '').trim().toLowerCase();
export const usernameToEmail = u => normalize(u) + DOMAIN;
export const emailToUsername = e => (typeof e === 'string' && e.endsWith(DOMAIN) ? e.slice(0, -DOMAIN.length) : e || '');
export const validateUsername = u => (/^[a-z0-9._-]{3,20}$/.test(normalize(u)) ? null : 'El usuario debe tener de 3 a 20 caracteres: letras, números, punto, guion o guion bajo.');
export const validatePassword = p => (typeof p === 'string' && p.length >= 6 ? null : 'La contraseña debe tener al menos 6 caracteres.');

const BAD_LOGIN = 'Usuario o contraseña incorrectos.';
const AUTH_ERRORS = {
  'auth/email-already-in-use': 'Ese usuario ya existe.',
  'auth/invalid-credential': BAD_LOGIN, 'auth/invalid-login-credentials': BAD_LOGIN, 'auth/wrong-password': BAD_LOGIN, 'auth/user-not-found': BAD_LOGIN,
  'auth/network-request-failed': 'Sin conexión. Inténtalo de nuevo cuando tengas internet.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
};
export function authErrorMessage(code) {
  if (AUTH_ERRORS[code]) return AUTH_ERRORS[code];
  if (typeof code === 'string' && code.includes('requests-from-referer')) return 'Firebase no permite entrar desde esta dirección. Usa la app publicada.';
  return 'No se ha podido completar. Inténtalo de nuevo.';
}

/** The notes on a device belong to one account: 'claim' (nobody yet), 'keep' (this account) or 'other'. */
export const ownerAction = (owner, uid) => (!owner ? 'claim' : owner === uid ? 'keep' : 'other');

// ---------- Which copy wins ----------

/**
 * remoteU: when the cloud copy was changed. synced: the `u` this device last matched with the cloud.
 * dirty: {u} when the device has a change not uploaded yet.
 * 'skip' = already the same, 'pull' = take the cloud copy, 'keep' = ours is newer and will be uploaded.
 */
export function decide({ remoteU, synced, dirty }) {
  if (dirty) return remoteU > dirty.u ? 'pull' : 'keep';
  return remoteU === synced ? 'skip' : 'pull';
}

// ---------- Engine ----------

/**
 * local:  read(key) -> payload | null,  apply(key, payload | null, u),  keys() -> [{key, u}],  busy(key)
 * remote: changes(cursor) -> {items: [{key, u, gone, x}], cursor},  fetch(key) -> {u, gone, payload} | null,
 *         write([{key, u, payload | null, prev}]) -> [x]      (x: whatever the remote wants back as `prev` next time)
 * state:  get(name) / set(name, value) — kept between visits
 */
export function createSync({ local, remote, state, now = Date.now, maxPayload = Infinity, batchChars = 2e6, batchItems = 40 }) {
  let outbox = state.get('outbox') || {};   // key -> {op: 'put' | 'del', u}
  let synced = state.get('synced') || {};   // key -> [u, x]
  let cursor = state.get('cursor') ?? null;
  let deferred = state.get('deferred') || []; // cloud changes not taken yet because the item was in use
  let big = state.get('big') || [];
  let running = null;

  const saveOut = () => state.set('outbox', outbox);
  const saveSynced = () => state.set('synced', synced);

  async function take(key, x, counts) {
    const doc = await api.remote.fetch(key);
    if (!doc) return;
    const dirty = outbox[key];
    if (decide({ remoteU: doc.u, synced: synced[key]?.[0], dirty }) !== 'pull') return;
    await local.apply(key, doc.gone ? null : doc.payload, doc.u);
    if (outbox[key] === dirty) delete outbox[key]; // unless it was changed again while downloading
    synced[key] = [doc.u, x ?? synced[key]?.[1] ?? 0];
    counts.pulled++;
  }

  async function pull(counts) {
    const res = await api.remote.changes(cursor);
    const wanted = new Map(deferred.map(k => [k, null]));
    for (const it of res.items) {
      const what = decide({ remoteU: it.u, synced: synced[it.key]?.[0], dirty: outbox[it.key] });
      if (what === 'pull') wanted.set(it.key, it);
      else { wanted.delete(it.key); if (what === 'skip') synced[it.key] = [it.u, it.x]; }
    }
    const later = [];
    for (const [key, it] of wanted) {
      if (local.busy(key)) { later.push(key); continue; }
      await take(key, it?.x, counts);
    }
    counts.deferred = later.length;
    deferred = later;
    cursor = res.cursor;
    state.set('deferred', deferred);
    state.set('cursor', cursor);
    saveOut();
    saveSynced();
  }

  async function push(counts) {
    let batch = [], chars = 0;
    const send = async () => {
      if (!batch.length) return;
      const sent = batch;
      batch = []; chars = 0;
      const xs = await api.remote.write(sent.map(b => ({ key: b.key, u: b.u, payload: b.payload, prev: synced[b.key]?.[1] })));
      sent.forEach((b, i) => {
        synced[b.key] = [b.u, xs[i]];
        if (outbox[b.key]?.u === b.u) delete outbox[b.key]; // a newer change stays queued
        counts.pushed++;
      });
      saveOut();
      saveSynced();
    };
    for (const [key, entry] of Object.entries(outbox)) {
      const payload = entry.op === 'del' ? null : await local.read(key);
      if (entry.op !== 'del' && payload == null) { delete outbox[key]; continue; } // gone before it could go up
      if (payload && payload.length > maxPayload) {
        delete outbox[key];
        if (!big.includes(key)) big.push(key);
        counts.skipped++;
        continue;
      }
      const size = payload ? payload.length : 0;
      if (batch.length && (chars + size > batchChars || batch.length >= batchItems)) await send();
      batch.push({ key, u: entry.u, payload });
      chars += size;
    }
    await send();
    state.set('big', big);
    saveOut();
  }

  const api = {
    remote,
    /** Note a local change; it is uploaded on the next run. */
    mark(key, op) {
      outbox[key] = { op, u: now() };
      if (op === 'del') big = big.filter(k => k !== key);
      saveOut();
    },
    /** Queue everything the device holds that the cloud has not seen (first sync of an account here). */
    async markAll() {
      for (const { key, u } of await local.keys()) if (!outbox[key] && !synced[key]) outbox[key] = { op: 'put', u: u || 1 };
      saveOut();
    },
    /** Download what changed in the cloud, then upload what changed here. One run at a time. */
    run() {
      return running ??= (async () => {
        const counts = { pulled: 0, pushed: 0, deferred: 0, skipped: 0 };
        try { await pull(counts); await push(counts); return counts; } finally { running = null; }
      })();
    },
    pending: () => Object.keys(outbox).length,
    tooBig: () => [...big],
    /** Forget what was synced (another account, or the local data was erased). */
    reset() {
      outbox = {}; synced = {}; cursor = null; deferred = []; big = [];
      for (const k of ['outbox', 'synced', 'deferred', 'big']) state.set(k, k === 'outbox' || k === 'synced' ? {} : []);
      state.set('cursor', null);
    },
  };
  return api;
}
