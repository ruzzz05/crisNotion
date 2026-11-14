// Moving books and pages between devices as files: download one, or read one back in.
import * as S from './store.js';
import { h, app, openForm, toast } from './ui.js';

export function download(name, data) {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const fileName = s => (s || 'sin-titulo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'cuaderno';

/** Download a book (with all its pages) or a page (with its subpages). */
export async function exportItem(id) {
  try {
    const data = await S.exportBundle(id);
    download(`${fileName(data.name)}.${data.kind === 'book' ? 'libro' : 'pagina'}.json`, data);
  } catch (e) {
    console.error(e);
    toast('No se ha podido exportar.');
  }
}

async function bring(data, bookId) {
  try {
    const doc = await S.importBundle(data, { bookId });
    toast(doc.type === 'book' ? 'Libro importado' : 'Página importada');
    if (doc.type === 'page') app.go('page/' + doc.id); else app.refresh();
  } catch (e) {
    console.error(e);
    toast(e.message?.startsWith('El archivo') ? e.message : 'No se ha podido importar ese archivo.');
  }
}

/**
 * Read an exported book or page. A book always arrives as a new book. A page goes into `bookId`;
 * without one, it goes into the only book there is, or you are asked which.
 */
export async function importFile(file, { bookId = null } = {}) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('No se ha podido leer ese archivo.'); }
  if (data?.app === 'cuaderno' && !data.kind && Array.isArray(data.docs)) return toast('Ese archivo es una copia completa: restáurala en Ajustes, en «Copia de seguridad».');
  if (data?.app !== 'cuaderno' || !['book', 'page'].includes(data.kind)) return toast('El archivo no es un libro ni una página de Cuaderno.');
  if (data.kind === 'book' || bookId) return bring(data, bookId);
  const books = S.all('book');
  if (!books.length) return bring(data, S.put({ type: 'book', name: 'Importado' }).id);
  if (books.length === 1) return bring(data, books[0].id);
  openForm('¿En qué libro va la página?', [{ key: 'bookId', label: 'Libro', type: 'select', value: books[0].id, options: books.map(b => [b.id, b.name]) }],
    { saveLabel: 'Importar', onSave: v => { bring(data, v.bookId); } });
}
