// Cloud sync: signs in with the Mi App account (Firebase Auth) and keeps this device and Firestore in step.
// The rules live in synccore.js and the Firestore calls in firestore.js; this file joins them to the app:
// it notes every local change, runs the sync at sensible moments and reports the state to the interface.
// Without an account, or without connection, the app works exactly as before with what is on the device.
import * as S from './store.js';
import { app } from './ui.js';
import { firebaseConfig } from './firebase-config.js';
import { firestore } from './firestore.js';
import { ascii, authErrorMessage, isFileData, createSync, emailToUsername, keyOf, needsChoice, ownerAction, parseKey, usernameToEmail, validatePassword, validateUsername } from './synccore.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const MAX_FILE = 25e6;     // characters of base64 (about 18 MB of file): larger files stay on the device
const PUSH_DELAY = 4000;   // after a change, wait for the burst of edits to finish
const CHECK_EVERY = 120e3; // while the app is in view, look for changes from other devices
const hook = globalThis.__cuadernoCloud; // tests replace Firebase with their own cloud, or turn it off

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem('cuaderno:cloud:' + k) ?? 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('cuaderno:cloud:' + k, JSON.stringify(v)); } catch { /* storage blocked or full */ } },
};

// ---------- This device ----------

const editing = () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };

const local = {
  async read(key) {
    const { kind, id } = parseKey(key);
    if (kind === 'd') { const d = S.get(id); return d ? ascii(JSON.stringify(d)) : null; }
    if (kind === 'i') { const d = await S.getDrawing(id); return d ? ascii(JSON.stringify(d)) : null; }
    const blob = await S.getBlob(id);
    return blob ? S.toDataURL(blob) : null;
  },
  async apply(key, payload) {
    const { kind, id } = parseKey(key);
    if (kind === 'd') {
      if (payload == null) return S.dropDoc(id);
      const d = JSON.parse(payload);
      if (d?.id === id && typeof d.type === 'string') await S.applyDoc(d);
    } else if (kind === 'i') {
      if (payload == null) return S.dropDrawing(id);
      const d = JSON.parse(payload);
      if (d?.id === id) await S.applyDrawing(d);
    } else if (payload == null) await S.dropBlob(id);
    else if (isFileData(payload)) await S.applyBlob(id, await (await fetch(payload)).blob());
  },
  keys: async () => (await S.localKeys()).map(([kind, id, u]) => ({ key: keyOf(kind, id), u })),
  /** The page being written in is not swapped under the cursor; its cloud copy is taken on a later run. */
  busy(key) {
    const { kind, id } = parseKey(key);
    return kind === 'd' && app.route() === 'page/' + id && editing();
  },
};

const engine = createSync({ local, remote: null, state: ls, maxPayload: MAX_FILE });

// ---------- State shown in the interface ----------

// phase: 'off' (not available) | 'loading' | 'signedout' | 'other' (the notes here belong to another account)
//        | 'choose' (this device and the account both hold notes and were never joined: nothing moves until the person picks) | 'on'
const status = { phase: hook?.off ? 'off' : 'loading', user: '', syncing: false, error: '', lastOk: ls.get('lastOk') || 0 };
const listeners = new Set();
const tell = patch => { Object.assign(status, patch); for (const fn of listeners) fn(); };

export const cloud = {
  get status() { return { ...status, pending: engine.pending(), tooBig: engine.tooBig().length, online: navigator.onLine !== false, owner: ls.get('ownerName') || '' }; },
  onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  /** One short line for the sidebar. */
  label() {
    const s = cloud.status;
    if (s.phase === 'off') return '';
    if (s.phase === 'loading') return 'Nube: comprobando…';
    if (s.phase === 'signedout') return 'Nube: sin sesión';
    if (s.phase === 'other') return 'Nube: otra cuenta';
    if (s.phase === 'choose') return 'Nube: elige qué hacer';
    if (!s.online) return 'Sin conexión';
    if (s.syncing) return 'Sincronizando…';
    if (s.error) return 'Error al sincronizar';
    if (s.pending) return 'Cambios sin subir';
    return 'Sincronizado';
  },
  signIn: (user, pass) => enter('in', user, pass),
  signUp: (user, pass) => enter('up', user, pass),
  async signOut() { await auth?.signOut(); },
  syncNow: () => run(),
  /** Both hold notes and had never met: put them together (this device's notes go up to the account, the account's come down). */
  async merge() {
    if (status.phase !== 'choose' || !session) return;
    await attach(session, true);
    app.refresh();
  },
  /** Erase what this device holds and make it a copy of the signed-in account. */
  async adopt() {
    if ((status.phase !== 'other' && status.phase !== 'choose') || !session) return;
    await S.wipe();
    engine.reset();
    ls.set('owner', null);
    await attach(session);
    app.refresh();
  },
};

// ---------- Running the sync ----------

let timer = 0, again = false, session = null, auth = null;

async function run() {
  if (status.phase !== 'on' || !engine.remote) return;
  if (status.syncing) { again = true; return; }
  clearTimeout(timer);
  tell({ syncing: true });
  try {
    const done = await engine.run();
    const now = Date.now();
    ls.set('lastOk', now);
    tell({ syncing: false, error: '', lastOk: now });
    // Show what arrived. While something is being typed only the sidebar is redrawn, to keep the cursor.
    if (done.pulled) { if (editing()) app.chrome(); else app.refresh(); }
  } catch (e) {
    console.warn('Cuaderno: la nube no está disponible por ahora:', e);
    tell({ syncing: false, error: navigator.onLine === false ? '' : String(e?.message || e) });
  }
  if (again) { again = false; schedule(500); }
}
const schedule = (ms = PUSH_DELAY) => { clearTimeout(timer); timer = setTimeout(run, ms); };

S.watch((kind, id, op) => {
  if (!ls.get('owner')) return; // no account has been used here yet: the first sign-in uploads everything anyway
  engine.mark(keyOf(kind, id), op);
  if (status.phase === 'on') { tell({}); schedule(); }
});

/** Whether the device holds anything of the person's own (the settings document exists on its own and does not count). */
const deviceHasNotes = async () => (await S.localKeys()).some(([kind, id]) => !(kind === 'd' && id === 'settings'));

async function attach(user, merge = false) {
  session = user;
  const owner = ls.get('owner');
  const what = ownerAction(owner, user.uid);
  if (what === 'other') { engine.remote = null; return tell({ phase: 'other', user: user.username }); }
  engine.remote = user.remote || firestore({ projectId: firebaseConfig.projectId, uid: user.uid, token: user.token });
  if (what === 'claim') {
    // First time this account is used here. If the device holds notes and the account does too, they could be
    // from two different people: nothing is uploaded or downloaded until the person chooses.
    if (!merge && await deviceHasNotes()) {
      let inCloud = true; // when it cannot be checked, ask
      try { inCloud = (await engine.remote.changes(null)).items.some(i => !i.gone && i.key !== 'd_settings'); } catch { /* offline */ }
      if (needsChoice(true, inCloud)) { engine.remote = null; return tell({ phase: 'choose', user: user.username, error: '' }); }
    }
    // Otherwise whatever the device already holds goes up to the account.
    engine.reset();
    await engine.markAll();
    ls.set('owner', user.uid);
    ls.set('ownerName', user.username);
  }
  tell({ phase: 'on', user: user.username, error: '' });
  run();
}

function detach() {
  session = null;
  engine.remote = null;
  clearTimeout(timer);
  tell({ phase: 'signedout', user: '', syncing: false, error: '' });
}

// ---------- Account (Firebase Auth, loaded only when there is connection) ----------

let loading = null;
function loadAuth() {
  return loading ??= (async () => {
    const [fb, a] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js')]);
    const fbApp = fb.initializeApp(firebaseConfig);
    // Same storage as Mi App (localStorage), so a session started in either one is valid in both.
    let au;
    try { au = a.initializeAuth(fbApp, { persistence: a.browserLocalPersistence }); } catch { au = a.getAuth(fbApp); }
    await au.authStateReady();
    auth = {
      signIn: (email, pass) => a.signInWithEmailAndPassword(au, email, pass),
      signUp: (email, pass) => a.createUserWithEmailAndPassword(au, email, pass),
      signOut: () => a.signOut(au),
    };
    a.onAuthStateChanged(au, u => {
      if (u && !u.isAnonymous) attach({ uid: u.uid, username: emailToUsername(u.email), token: () => u.getIdToken() });
      else detach();
    });
  })().catch(e => { loading = null; throw e; });
}

/** Returns an error message to show, or null when the session has started. */
async function enter(mode, user, pass) {
  const bad = validateUsername(user) || (mode === 'up' ? validatePassword(pass) : pass ? null : 'Escribe tu contraseña.');
  if (bad) return bad;
  try {
    await loadAuth();
    await auth[mode === 'up' ? 'signUp' : 'signIn'](usernameToEmail(user), pass);
    return null;
  } catch (e) {
    console.warn('Cuaderno: error de cuenta:', e);
    return authErrorMessage(e?.code || String(e?.message || ''));
  }
}

async function start() {
  if (hook?.off) return;
  if (hook?.uid) return attach({ uid: hook.uid, username: hook.username || 'prueba', remote: hook.remote });
  try { await loadAuth(); } catch (e) {
    // No connection (or Firebase unreachable): the app goes on with the device's data and tries again later.
    console.warn('Cuaderno: no se ha podido cargar la cuenta:', e);
    tell({ phase: ls.get('owner') ? 'on' : 'signedout', user: ls.get('ownerName') || '' });
    addEventListener('online', () => { if (!auth) start(); }, { once: true });
  }
}

addEventListener('online', () => { tell({}); run(); });
addEventListener('offline', () => tell({}));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' || engine.pending()) run(); });
setInterval(() => { if (document.visibilityState === 'visible') run(); }, CHECK_EVERY);
/** Called by app.js once the device's data is in memory: sync must not run against an empty store. */
cloud.start = start;
