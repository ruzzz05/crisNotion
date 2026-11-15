// In-memory copy of every doc, written through to IndexedDB.
// Every doc carries `updatedAt`, and books/pages are soft-deleted (`deleted: true`),
// so a cloud sync layer can be added later without changing the data shape.
import { db } from './db.js';
import * as M from './model.js';
import { COLORS } from './util.js';
import { isFileData } from './synccore.js';

const docs = new Map();
const urls = new Map();
let onError = () => {};
// Cloud sync listens here: every change made on this device is reported as (kind, id, 'put' | 'del'),
// with kind 'd' for a doc, 'i' for the ink of a drawing and 'f' for a stored file.
let changed = () => {};
export const watch = fn => { changed = fn; };

export const uid = () => crypto.randomUUID?.() ??
  Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(10)), b => b.toString(36)).join('');

export async function load(errorHandler) {
  onError = errorHandler || onError;
  const list = await db.all('docs');
  for (const d of M.migrate(list)) db.put('docs', d).catch(onError);
  for (const d of list) docs.set(d.id, d);
}

export const get = id => docs.get(id);

export function all(type, includeDeleted = false) {
  return [...docs.values()]
    .filter(d => d.type === type && (includeDeleted || !d.deleted))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function put(doc) {
  doc.id ??= uid();
  doc.order ??= Date.now();
  doc.updatedAt = Date.now();
  docs.set(doc.id, doc);
  db.put('docs', doc).catch(onError);
  changed('d', doc.id, 'put');
  return doc;
}

export function remove(id) {
  docs.delete(id);
  db.del('docs', id).catch(onError);
  changed('d', id, 'del');
}

export function trash(id) {
  const d = docs.get(id);
  if (d) { d.deleted = true; put(d); }
}

export function restore(id) {
  const d = docs.get(id);
  if (d) { delete d.deleted; put(d); }
}

/** Permanently delete a book or page together with everything inside it. */
export function purge(id) {
  const d = docs.get(id);
  if (!d) return;
  const pages = all('page', true);
  if (d.type === 'book') for (const p of pages) if (p.bookId === id && docs.has(p.id)) purge(p.id);
  if (d.type === 'page') {
    for (const p of pages) if (p.parentId === id) purge(p.id);
    for (const b of d.blocks || []) {
      if (b.t === 'draw') delDrawing(b.id);
      if (b.t === 'image') delBlob(b.blob);
      if (b.t === 'pdf') { const own = M.pdfAssets(b); own.blobs.forEach(delBlob); own.drawings.forEach(delDrawing); }
    }
    if (d.cover?.startsWith('img:')) delBlob(d.cover.slice(4));
    if (d.bg?.startsWith('img:')) delBlob(d.bg.slice(4));
  }
  remove(id);
}

// Pages
export const liveBook = id => { const b = docs.get(id); return b && !b.deleted ? b : null; };
export const livePage = id => { const p = docs.get(id); return p?.type === 'page' && M.isAlive(docs, p) ? p : null; };
/** A subject (asignatura) is a top-level page of a book. */
export const liveSubject = id => { const p = livePage(id); return p && !p.parentId ? p : null; };
export const pages = () => all('page').filter(p => M.isAlive(docs, p));
export const children = where => M.childrenOf(all('page'), where);
export const descendants = id => M.descendants(all('page', true), id);
/** Book, ancestors and the page itself, for the breadcrumb. */
export const path = page => [docs.get(page.bookId), ...M.ancestors(docs, page), page].filter(Boolean);

export function newPage({ bookId, parentId = null }) {
  const page = { type: 'page', bookId, parentId, title: '', icon: null, blocks: [] };
  if (!parentId) page.color = COLORS[(children({ bookId }).length * 2 + 5) % COLORS.length];
  return put(page);
}

export const settings = () => docs.get('settings') || { id: 'settings', type: 'settings', weekend: false };

// Photos
export async function saveBlob(blob) {
  const id = uid();
  await db.put('blobs', { id, blob });
  urls.set(id, URL.createObjectURL(blob));
  changed('f', id, 'put');
  return id;
}
export async function blobURL(id) {
  if (urls.has(id)) return urls.get(id);
  const rec = await db.get('blobs', id).catch(() => null);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urls.set(id, url);
  return url;
}
export const getBlob = async id => (await db.get('blobs', id).catch(() => null))?.blob || null;
export function delBlob(id) {
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  db.del('blobs', id).catch(onError);
  changed('f', id, 'del');
}

// Drawings
export const getDrawing = id => db.get('drawings', id);
export const putDrawing = d => db.put('drawings', { ...d, updatedAt: Date.now() }).then(() => changed('i', d.id, 'put')).catch(onError);
/** Deletes a drawing together with the pictures placed on it. */
export async function delDrawing(id) {
  try {
    const d = await db.get('drawings', id);
    if (!d) return; // a sheet nobody drew on
    for (const m of d.images || []) delBlob(m.blob);
    await db.del('drawings', id);
    changed('i', id, 'del');
  } catch (e) { onError(e); }
}

// ---------- What cloud sync needs: apply changes that come from another device, without reporting them back ----------

/** Updates the doc in place, so a view holding it keeps a valid reference. */
export async function applyDoc(doc) {
  const cur = docs.get(doc.id);
  if (cur) { for (const k of Object.keys(cur)) delete cur[k]; Object.assign(cur, doc); } else docs.set(doc.id, doc);
  await db.put('docs', docs.get(doc.id));
}
export async function dropDoc(id) { docs.delete(id); await db.del('docs', id); }
export const applyDrawing = d => db.put('drawings', d);
export const dropDrawing = id => db.del('drawings', id);
export const applyBlob = (id, blob) => db.put('blobs', { id, blob });
export async function dropBlob(id) {
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  await db.del('blobs', id);
}
/** Everything stored here, as [kind, id, changed at]. */
export async function localKeys() {
  return [
    ...[...docs.values()].map(d => ['d', d.id, d.updatedAt || 1]),
    ...(await db.all('drawings')).map(d => ['i', d.id, d.updatedAt || 1]),
    ...(await db.keys('blobs')).map(id => ['f', id, 1]),
  ];
}
/** Erases everything on this device. */
export async function wipe() {
  docs.clear();
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  for (const name of ['docs', 'drawings', 'blobs']) await db.clear(name);
}

// Backup
export const toDataURL = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

export async function exportAll() {
  const blobs = [];
  for (const b of await db.all('blobs')) blobs.push({ id: b.id, data: await toDataURL(b.blob) });
  return { app: 'cuaderno', version: 2, exportedAt: new Date().toISOString(), docs: [...docs.values()], drawings: await db.all('drawings'), blobs };
}

/** A book with all its pages, or a page with its subpages, plus the photos, PDFs and drawings they use. */
export async function exportBundle(id) {
  const root = docs.get(id);
  if (root?.type !== 'book' && root?.type !== 'page') throw new Error('nothing to export');
  const list = root.type === 'book' ? pages().filter(p => p.bookId === id) : [root, ...descendants(id).filter(p => livePage(p.id))];
  const blobIds = new Set(), drawings = [], blobs = [];
  for (const p of list) {
    const own = M.pageAssets(p);
    own.blobs.forEach(b => blobIds.add(b));
    for (const did of own.drawings) {
      const d = await db.get('drawings', did);
      if (!d) continue; // a sheet nobody wrote on
      drawings.push(d);
      for (const pic of d.images || []) blobIds.add(pic.blob);
    }
  }
  for (const bid of blobIds) {
    const rec = await db.get('blobs', bid);
    if (rec) blobs.push({ id: bid, data: await toDataURL(rec.blob) });
  }
  return {
    app: 'cuaderno', version: 2, kind: root.type, root: id, name: root.name || root.title || '', exportedAt: new Date().toISOString(),
    docs: root.type === 'book' ? [root, ...list] : list, drawings, blobs,
  };
}


/** Adds an exported book as a new book, or an exported page to `bookId`. Returns the new book or page. */
export async function importBundle(data, { bookId = null } = {}) {
  const bad = () => new Error('El archivo no es un libro ni una página de Cuaderno.');
  if (data?.app !== 'cuaderno' || !['book', 'page'].includes(data.kind) || !Array.isArray(data.docs)) throw bad();
  const list = data.docs.filter(d => d && typeof d.id === 'string' && (d.type === 'page' || (d.type === 'book' && d.id === data.root && data.kind === 'book')));
  if (!list.some(d => d.id === data.root && d.type === data.kind)) throw bad();
  const out = M.remapBundle({
    ...data, docs: list,
    drawings: (data.drawings || []).filter(d => d && typeof d.id === 'string'),
    blobs: (data.blobs || []).filter(b => b && typeof b.id === 'string' && isFileData(b.data)),
  }, uid);
  if (data.kind === 'page') {
    if (!liveBook(bookId)) throw new Error('missing book');
    for (const d of out.docs) d.bookId = bookId;
  }
  for (const b of out.blobs) { await db.put('blobs', { id: b.id, blob: await (await fetch(b.data)).blob() }); changed('f', b.id, 'put'); }
  for (const d of out.drawings) { await db.put('drawings', d); changed('i', d.id, 'put'); }
  for (const d of out.docs) {
    if (d.id === out.root) delete d.order; // lands after what is already there
    put(d);
  }
  return docs.get(out.root);
}

export async function importAll(data) {
  if (data?.app !== 'cuaderno' || !Array.isArray(data.docs)) throw new Error('El archivo no es una copia de Cuaderno.');
  const list = data.docs.filter(d => d && typeof d.id === 'string' && typeof d.type === 'string');
  M.migrate(list);
  // A restored copy counts as changed now, so with cloud sync it is what the other devices get.
  for (const d of data.blobs || []) {
    if (!d?.id || !isFileData(d.data)) continue;
    await db.put('blobs', { id: d.id, blob: await (await fetch(d.data)).blob() });
    changed('f', d.id, 'put');
  }
  for (const d of data.drawings || []) if (d?.id) { await db.put('drawings', d); changed('i', d.id, 'put'); }
  for (const d of list) { docs.set(d.id, d); await db.put('docs', d); changed('d', d.id, 'put'); }
}
