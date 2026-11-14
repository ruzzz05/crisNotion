// Thin IndexedDB wrapper. Three stores:
//   docs     – every small record (books, subjects, pages, timetable slots, events, tasks, settings)
//   drawings – handwriting strokes, keyed by the id of the drawing block (loaded on demand)
//   blobs    – photos, keyed by id (loaded on demand)
let opening;

function open() {
  return opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('cuaderno', 1);
    req.onupgradeneeded = () => {
      for (const name of ['docs', 'drawings', 'blobs']) req.result.createObjectStore(name, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(store, mode, fn) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  all: store => run(store, 'readonly', s => s.getAll()),
  get: (store, id) => run(store, 'readonly', s => s.get(id)),
  put: (store, value) => run(store, 'readwrite', s => s.put(value)),
  del: (store, id) => run(store, 'readwrite', s => s.delete(id)),
  keys: store => run(store, 'readonly', s => s.getAllKeys()),
  clear: store => run(store, 'readwrite', s => s.clear()),
};
