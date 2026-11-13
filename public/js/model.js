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
