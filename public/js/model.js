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
  const moved = delta ? seg.map(b => ({ ...b, indent: ind(b) + delta })) : seg;
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
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
