// Pure logic with no DOM or storage, so it can be unit-tested in Node.

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

// ---------- Page tree ----------

/** Live children of a page ({parentId}) or the top-level pages of a book ({bookId}). */
export function childrenOf(pages, { parentId, bookId }) {
  return pages
    .filter(p => !p.deleted && (parentId ? p.parentId === parentId : !p.parentId && p.bookId === bookId))
    .sort(byOrder);
}

/** Path from the top-level page down to the direct parent (the page itself excluded). */
export function ancestors(byId, page) {
  const out = [];
  for (let p = byId.get(page.parentId); p && !out.includes(p); p = byId.get(p.parentId)) out.unshift(p);
  return out;
}

export function descendants(pages, id) {
  const out = [];
  const walk = pid => { for (const p of pages) if (p.parentId === pid) { out.push(p); walk(p.id); } };
  walk(id);
  return out;
}

export function isAlive(byId, page) {
  if (!page || page.deleted) return false;
  if (ancestors(byId, page).some(p => p.deleted)) return false;
  const book = byId.get(page.bookId);
  return !!book && !book.deleted;
}

// ---------- Blocks: a flat list where `indent` expresses nesting ----------

const ind = b => b.indent || 0;

/** Index just past block `i` and everything nested under it. */
export function rangeEnd(blocks, i) {
  let j = i + 1;
  while (j < blocks.length && ind(blocks[j]) > ind(blocks[i])) j++;
  return j;
}

/** Map of block id -> ordinal for numbered-list items. */
export function numbering(blocks) {
  const out = new Map();
  blocks.forEach((b, i) => {
    if (b.t !== 'num') return;
    let n = 1;
    for (let j = i - 1; j >= 0; j--) {
      if (ind(blocks[j]) > ind(b)) continue;
      if (ind(blocks[j]) === ind(b) && blocks[j].t === 'num') n = out.get(blocks[j].id) + 1;
      break;
    }
    out.set(b.id, n);
  });
  return out;
}

/** Ids of blocks hidden inside a closed toggle. */
export function hidden(blocks) {
  const out = new Set();
  let level = null;
  for (const b of blocks) {
    if (level !== null && ind(b) > level) { out.add(b.id); continue; }
    level = b.t === 'toggle' && !b.open ? ind(b) : null;
  }
  return out;
}

/** Deepest indent block `i` may take: one more than the block above it. */
export function maxIndent(blocks, i) {
  return i > 0 ? ind(blocks[i - 1]) + 1 : 0;
}

/** Move block `from` (with its nested blocks) so it sits before original index `to`. */
export function moveRange(blocks, from, to) {
  const end = rangeEnd(blocks, from);
  if (to >= from && to <= end) return blocks;
  const seg = blocks.slice(from, end);
  const rest = [...blocks.slice(0, from), ...blocks.slice(end)];
  const at = to > from ? to - seg.length : to;
  const delta = Math.min(ind(seg[0]), at > 0 ? ind(rest[at - 1]) + 1 : 0) - ind(seg[0]);
  // Mutate in place: the editor's event handlers hold on to these block objects.
  if (delta) for (const b of seg) b.indent = ind(b) + delta;
  return [...rest.slice(0, at), ...seg, ...rest.slice(at)];
}

// ---------- Columns: consecutive blocks sharing a `row` id are laid out side by side ----------

export const MAX_COLUMNS = 4;

/** [start, end) of the row block `i` sits in; a block outside any row is its own span. */
export function rowOf(blocks, i) {
  const id = blocks[i].row;
  if (!id) return [i, i + 1];
  let s = i, e = i + 1;
  while (s > 0 && blocks[s - 1].row === id) s--;
  while (e < blocks.length && blocks[e].row === id) e++;
  return [s, e];
}

/** Where a new block goes when it should land underneath block `i`. */
export function belowIndex(blocks, i) {
  return blocks[i].row ? rowOf(blocks, i)[1] : rangeEnd(blocks, i);
}

/** Drop the `row` of any block that ended up alone. Mutates the blocks. */
export function normalizeRows(blocks) {
  for (let i = 0; i < blocks.length;) {
    const [s, e] = rowOf(blocks, i);
    if (blocks[i].row && e - s === 1) delete blocks[i].row;
    i = e;
  }
  return blocks;
}

/** Map of block id -> number of columns, for blocks that share a row. */
export function rowSizes(blocks) {
  const out = new Map();
  for (let i = 0; i < blocks.length;) {
    const [s, e] = rowOf(blocks, i);
    if (e - s > 1) for (let j = s; j < e; j++) out.set(blocks[j].id, e - s);
    i = e;
  }
  return out;
}

/** Put block `from` beside block `target` ('left' or 'right'). Returns the same array when not allowed. */
export function joinRow(blocks, from, target, side, newRowId) {
  if (from === target || rangeEnd(blocks, from) !== from + 1) return blocks;
  const t = blocks[target], b = blocks[from];
  if (!t.row && rangeEnd(blocks, target) !== target + 1) return blocks;
  const [s, e] = rowOf(blocks, target);
  const sameRow = from >= s && from < e;
  if (!sameRow && e - s >= MAX_COLUMNS) return blocks;
  t.row = b.row = t.row || newRowId;
  b.indent = ind(t);
  const rest = blocks.filter(x => x !== b);
  const at = rest.indexOf(t) + (side === 'left' ? 0 : 1);
  return normalizeRows([...rest.slice(0, at), b, ...rest.slice(at)]);
}

/** Take block `i` out of its row and place it right below. */
export function leaveRow(blocks, i) {
  const b = blocks[i];
  if (!b.row) return blocks;
  const end = rowOf(blocks, i)[1];
  delete b.row;
  const rest = blocks.filter(x => x !== b);
  return normalizeRows([...rest.slice(0, end - 1), b, ...rest.slice(end - 1)]);
}

// ---------- PDF margins: blocks placed to the left or right of one sheet ----------
// Stored on the PDF block as side[sheet number][l | r] = [{id, t: 'text' | 'image' | 'draw', …}].

export const sideList = (block, n, side) => block.side?.[n]?.[side] || [];

export function sideAdd(block, n, side, item) {
  ((block.side ??= {})[n] ??= {})[side] = [...sideList(block, n, side), item];
  return item;
}

/** Removes and returns the item; empty containers are dropped so the block stays small. */
export function sideRemove(block, n, side, id) {
  const list = sideList(block, n, side), item = list.find(x => x.id === id);
  if (!item) return null;
  const rest = list.filter(x => x !== item);
  if (rest.length) block.side[n][side] = rest; else delete block.side[n][side];
  if (!Object.keys(block.side[n]).length) delete block.side[n];
  if (!Object.keys(block.side).length) delete block.side;
  return item;
}

/** Which margins hold something on any sheet, so every sheet can keep the same width. */
export function sidesUsed(block) {
  const used = { l: false, r: false };
  for (const s of Object.values(block.side || {})) for (const k of ['l', 'r']) if (s[k]?.length) used[k] = true;
  return used;
}

/** Stored files and drawings that belong to a PDF block and must go when it is deleted. */
export function pdfAssets(block) {
  const blobs = [block.blob], drawings = [];
  for (let n = 1; n <= (block.n || 0); n++) drawings.push(`${block.id}:${n}`);
  for (const s of Object.values(block.side || {})) for (const k of ['l', 'r']) for (const it of s[k] || []) {
    if (it.t === 'image') blobs.push(it.blob);
    if (it.t === 'draw') drawings.push(it.id);
  }
  return { blobs, drawings };
}

/** Stored files and drawings used by a page: its cover, background and blocks. */
export function pageAssets(page) {
  const blobs = [], drawings = [];
  for (const k of ['cover', 'bg']) if (page[k]?.startsWith('img:')) blobs.push(page[k].slice(4));
  for (const b of page.blocks || []) {
    if (b.t === 'image') blobs.push(b.blob);
    if (b.t === 'draw') drawings.push(b.id);
    if (b.t === 'pdf') { const own = pdfAssets(b); blobs.push(...own.blobs); drawings.push(...own.drawings); }
  }
  return { blobs, drawings };
}

// ---------- Exported books and pages ----------

/**
 * Copy of an exported bundle {root, docs, drawings, blobs} in which every id is new, so importing it
 * never overwrites what is already there (importing twice gives two copies). Links between the pieces
 * are kept; a page whose parent is not in the bundle becomes a top-level page.
 */
export function remapBundle(data, newId) {
  const ids = new Map(), inside = new Set(data.docs.map(d => d.id));
  const m = id => { if (!ids.has(id)) ids.set(id, newId()); return ids.get(id); };
  const img = v => (typeof v === 'string' && v.startsWith('img:') ? 'img:' + m(v.slice(4)) : v);
  const docs = data.docs.map(src => {
    const d = structuredClone(src);
    d.id = m(src.id);
    if (d.type !== 'page') return d;
    d.bookId = inside.has(src.bookId) ? m(src.bookId) : null;
    d.parentId = inside.has(src.parentId) ? m(src.parentId) : null;
    delete d.fav;
    delete d.deleted;
    if (d.cover) d.cover = img(d.cover);
    if (d.bg) d.bg = img(d.bg);
    for (const b of d.blocks || []) {
      b.id = m(b.id);
      if (b.row) b.row = m(b.row);
      if (b.blob) b.blob = m(b.blob);
      if (b.pageId) b.pageId = m(b.pageId);
      for (const s of Object.values(b.side || {})) for (const k of ['l', 'r']) for (const it of s[k] || []) {
        it.id = m(it.id);
        if (it.blob) it.blob = m(it.blob);
      }
    }
    return d;
  });
  const drawings = (data.drawings || []).map(src => {
    const d = structuredClone(src), at = src.id.indexOf(':'); // "block:sheet" for the ink of a PDF sheet
    d.id = at < 0 ? m(src.id) : m(src.id.slice(0, at)) + src.id.slice(at);
    for (const pic of d.images || []) pic.blob = m(pic.blob);
    return d;
  });
  return { ...data, root: m(data.root), docs, drawings, blobs: (data.blobs || []).map(b => ({ ...b, id: m(b.id) })) };
}

// ---------- Themes ----------

export const THEMES = ['white', 'beige', 'dark', 'system'];
/** The theme to paint for a stored choice: white unless something else was chosen; 'system' follows the device. */
export function resolveTheme(choice, systemDark) {
  if (choice === 'system') return systemDark ? 'dark' : 'white';
  return THEMES.includes(choice) ? choice : 'white';
}

// ---------- Photo widget ----------

const period = (ms, hours, tzOffsetMin) => Math.floor((ms - tzOffsetMin * 60e3) / (hours * 3600e3));
/** Which of `n` photos to show now; it moves on once per `hours`, counted in local time. -1 without photos. */
export const photoIndex = (ms, hours, n, tzOffsetMin = 0) => (n > 0 ? ((period(ms, hours, tzOffsetMin) % n) + n) % n : -1);
/** Moment (ms) when the next photo is due. */
export const nextSwap = (ms, hours, tzOffsetMin = 0) => (period(ms, hours, tzOffsetMin) + 1) * hours * 3600e3 + tzOffsetMin * 60e3;

// ---------- Slash menu ----------

export const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function filterCommands(cmds, query) {
  const q = norm(query.trim());
  return q ? cmds.filter(c => norm(c.label + ' ' + (c.keys || '')).includes(q)) : cmds;
}

// ---------- Data migration from the first version (books > subjects > pages) ----------

/** Mutates old docs into the current shape and returns the ones that changed. */
export function migrate(docs) {
  const changed = [];
  const subjects = new Map();
  for (const d of docs) {
    if (d.type !== 'subject') continue;
    subjects.set(d.id, d);
    d.type = 'page';
    d.parentId = null;
    d.title = d.name;
    d.icon = d.emoji;
    d.blocks = [];
    delete d.name;
    delete d.emoji;
    changed.push(d);
  }
  for (const d of docs) {
    if (d.type !== 'page' || !('subjectId' in d)) continue;
    d.parentId = d.subjectId;
    d.bookId = subjects.get(d.subjectId)?.bookId ?? d.bookId;
    delete d.subjectId;
    changed.push(d);
  }
  return changed;
}
