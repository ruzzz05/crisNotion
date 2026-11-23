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

// ---------- Calendar: multi-day events and custom kinds ----------

/** Where `day` falls in an event: 'single' (one day), 'start', 'mid' or 'end'. Only the ends carry the title. */
export function spanPart(e, day) {
  if (!e.endDate || e.endDate <= e.date) return 'single';
  return day === e.date ? 'start' : day === e.endDate ? 'end' : 'mid';
}

/** Built-in kinds {id: [name, color]} followed by the user's own ({id, name, color} docs). Built-ins win on a clash. */
export function mergeKinds(builtin, customs) {
  const out = { ...builtin };
  for (const c of customs) if (!(c.id in out)) out[c.id] = [c.name, c.color];
  return out;
}

// ---------- Tasks: categories and manual order ----------

/** `items` with `item` (an object or an id in the list) moved to `index` of the list without it. */
export function placeAt(items, item, index) {
  const it = typeof item === 'object' ? item : items.find(x => x.id === item);
  const rest = items.filter(x => x.id !== it.id);
  return [...rest.slice(0, index), it, ...rest.slice(index)];
}

/** Tasks split by category: [{list: null, tasks}, {list, tasks}…]. Tasks of a missing list count as uncategorised. */
export function groupTasks(tasks, lists) {
  const ids = new Set(lists.map(l => l.id));
  const sorted = [...tasks].sort(byOrder);
  return [
    { list: null, tasks: sorted.filter(t => !ids.has(t.listId)) },
    ...[...lists].sort(byOrder).map(list => ({ list, tasks: sorted.filter(t => t.listId === list.id) })),
  ];
}

/** Groups to draw: categories always, the uncategorised group only while it holds tasks. */
export const shownGroups = groups => groups.filter(g => g.list || g.tasks.length);

/** Colour of an event in the calendar: its subject's, else its kind's, else blue. */
export const eventColor = (e, kinds, subject) => subject?.color || kinds[e.kind]?.[1] || 'blue';

/** Page shown after moving `delta` pages from `cur` (1-based) in a PDF of `total` pages; stays within 1..total. */
export const stepPage = (cur, delta, total) => Math.max(1, Math.min(Math.max(1, total), cur + delta));

/** Zoom steps of a PDF block (1 = fit the width); only the sheets grow, never the whole page. */
export const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
/** Zoom after moving `dir` steps (+1 / -1) from `z`; stays within the available steps. */
export function stepZoom(z, dir) {
  let i = 0;
  ZOOMS.forEach((v, k) => { if (Math.abs(v - z) < Math.abs(ZOOMS[i] - z)) i = k; });
  return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))];
}

/** Page number typed by the user, as an integer within 1..total; null when it is not a number or there are no pages. */
export function parsePage(text, total) {
  const n = Math.trunc(Number(String(text).trim()));
  if (!String(text).trim() || !Number.isFinite(n) || total < 1) return null;
  return Math.max(1, Math.min(total, n));
}

/**
 * Splits the text block at `i` around a selection: `before` keeps the original block (and its id), `mid` becomes
 * a new block of type `t`, and `after` follows it as a copy of the original. A null part is left out.
 * Parts are HTML strings; the caller reads them from the DOM so inline formatting survives.
 */
export function splitBlock(blocks, i, { before, mid, after, t, midId, afterId }) {
  const b = blocks[i], out = [];
  const piece = { id: midId, t, html: mid, indent: b.indent || 0 };
  if (b.color) piece.color = b.color;
  if (t === 'toggle') piece.open = true;
  if (before !== null) out.push({ ...b, html: before });
  out.push(piece);
  if (after !== null) out.push({ ...b, id: afterId, html: after });
  return [...blocks.slice(0, i), ...out, ...blocks.slice(i + 1)];
}

/**
 * What Backspace at the start of a block does. Text only joins a block of the same type, so a paragraph
 * never turns into the title above it; an empty block just goes away; anything else is left alone.
 */
export function backspaceAction({ prevText, prevT, curT, curEmpty }) {
  if (prevText && prevT === curT) return 'merge';
  if (curEmpty) return 'remove';
  return 'none';
}

// ---------- Tables: a block holds `rows`, an array of rows, each an array of cell texts ----------

/** An empty table of `r` rows by `c` columns. */
export const newTable = (r = 3, c = 3) => Array.from({ length: Math.max(1, r) }, () => Array(Math.max(1, c)).fill(''));
/** Rows with an empty row inserted at index `i` (0..length). */
export const tableAddRow = (rows, i) => { const w = rows[0]?.length || 1, out = rows.map(r => [...r]); out.splice(Math.max(0, Math.min(i, out.length)), 0, Array(w).fill('')); return out; };
/** Rows with an empty column inserted at index `i` (0..width). */
export const tableAddCol = (rows, i) => rows.map(r => { const o = [...r]; o.splice(Math.max(0, Math.min(i, o.length)), 0, ''); return o; });
/** Rows without row `i`; a table always keeps at least one row. */
export const tableDelRow = (rows, i) => (rows.length <= 1 ? rows : rows.filter((_, k) => k !== i).map(r => [...r]));
/** Rows without column `i`; a table always keeps at least one column. */
export const tableDelCol = (rows, i) => ((rows[0]?.length || 0) <= 1 ? rows : rows.map(r => r.filter((_, k) => k !== i)));
/** All the text of a table, for searching. */
export const tableText = rows => (rows || []).flat().filter(Boolean).join(' ');
