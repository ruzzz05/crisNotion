// In-memory copy of every doc, written through to IndexedDB.
// Every doc carries `updatedAt`, and books/subjects/pages are soft-deleted (`deleted: true`),
// so a cloud sync layer can be added later without changing the data shape.
import { db } from './db.js';

const docs = new Map();
const urls = new Map();
let onError = () => {};

export const uid = () => crypto.randomUUID?.() ??
  Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(10)), b => b.toString(36)).join('');

export async function load(errorHandler) {
  onError = errorHandler || onError;
  for (const d of await db.all('docs')) docs.set(d.id, d);
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

/** Permanently delete a book, subject or page together with everything inside it. */
export function purge(id) {
  const d = docs.get(id);
  if (!d) return;
  if (d.type === 'book') for (const s of all('subject', true)) if (s.bookId === id) purge(s.id);
  if (d.type === 'subject') for (const p of all('page', true)) if (p.subjectId === id) purge(p.id);
  if (d.type === 'page') for (const b of d.blocks || []) {
    if (b.t === 'draw') delDrawing(b.id);
    if (b.t === 'image') delBlob(b.blob);
  }
  remove(id);
}

export const subjectsOf = bookId => all('subject').filter(s => s.bookId === bookId);
export const pagesOf = subjectId => all('page').filter(p => p.subjectId === subjectId);
export const liveBook = id => { const b = docs.get(id); return b && !b.deleted ? b : null; };
export const liveSubject = id => { const s = docs.get(id); return s && !s.deleted && liveBook(s.bookId) ? s : null; };
export const livePage = id => { const p = docs.get(id); return p && !p.deleted && liveSubject(p.subjectId) ? p : null; };

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
export const delDrawing = id => db.del('drawings', id).catch(onError);

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
  return { app: 'cuaderno', version: 1, exportedAt: new Date().toISOString(), docs: [...docs.values()], drawings: await db.all('drawings'), blobs };
}

export async function importAll(data) {
  if (data?.app !== 'cuaderno' || !Array.isArray(data.docs)) throw new Error('El archivo no es una copia de Cuaderno.');
  for (const d of data.docs) {
    if (!d || typeof d.id !== 'string' || typeof d.type !== 'string') continue;
    docs.set(d.id, d);
    await db.put('docs', d);
  }
  for (const d of data.drawings || []) if (d?.id) await db.put('drawings', d);
  for (const b of data.blobs || []) {
    if (!b?.id || typeof b.data !== 'string' || !b.data.startsWith('data:image/')) continue;
    await db.put('blobs', { id: b.id, blob: await (await fetch(b.data)).blob() });
  }
}
