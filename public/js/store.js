// In-memory copy of every doc, written through to IndexedDB.
// Every doc carries `updatedAt`, and books/pages are soft-deleted (`deleted: true`),
// so a cloud sync layer can be added later without changing the data shape.
import { db } from './db.js';
import * as M from './model.js';
import { COLORS } from './util.js';

const docs = new Map();
const urls = new Map();
let onError = () => {};

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
  return doc;
}

export function remove(id) {
  docs.delete(id);
  db.del('docs', id).catch(onError);
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
export function delBlob(id) {
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  db.del('blobs', id).catch(onError);
}

// Drawings
export const getDrawing = id => db.get('drawings', id);
export const putDrawing = d => db.put('drawings', { ...d, updatedAt: Date.now() }).catch(onError);
/** Deletes a drawing together with the pictures placed on it. */
export async function delDrawing(id) {
  try {
    for (const m of (await db.get('drawings', id))?.images || []) delBlob(m.blob);
    await db.del('drawings', id);
  } catch (e) { onError(e); }
}

// Backup
const toDataURL = blob => new Promise((res, rej) => {
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

export async function importAll(data) {
  if (data?.app !== 'cuaderno' || !Array.isArray(data.docs)) throw new Error('El archivo no es una copia de Cuaderno.');
  const list = data.docs.filter(d => d && typeof d.id === 'string' && typeof d.type === 'string');
  M.migrate(list);
  for (const d of list) { docs.set(d.id, d); await db.put('docs', d); }
  for (const d of data.drawings || []) if (d?.id) await db.put('drawings', d);
  for (const b of data.blobs || []) {
    if (!b?.id || typeof b.data !== 'string' || !b.data.startsWith('data:image/')) continue;
    await db.put('blobs', { id: b.id, blob: await (await fetch(b.data)).blob() });
  }
}
