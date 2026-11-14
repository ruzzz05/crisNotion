// The home board: which widgets it holds, how they are sized on its grid, and the pomodoro clock.
// Pure functions, tested in tests/board.test.mjs. The widgets themselves are drawn in widgets.js.

export const COLS = 12;
const MAX_ROWS = 24;

/** Default and smallest size of each widget, in grid cells. `single`: built into the app, at most one. `tint`: its background can be changed. */
export const WIDGET_SIZES = {
  hello: { w: 12, h: 2, minW: 3, minH: 2, single: true },
  photos: { w: 12, h: 7, minW: 3, minH: 4 },
  recent: { w: 12, h: 4, minW: 3, minH: 4, single: true },
  classes: { w: 6, h: 5, minW: 3, minH: 3, single: true },
  events: { w: 6, h: 5, minW: 3, minH: 3, single: true },
  tasks: { w: 12, h: 5, minW: 3, minH: 3, single: true },
  clock: { w: 4, h: 3, minW: 2, minH: 2, tint: true },
  pomodoro: { w: 4, h: 5, minW: 3, minH: 4, tint: true },
  text: { w: 4, h: 4, minW: 2, minH: 2, tint: true },
  image: { w: 4, h: 5, minW: 2, minH: 2 },
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, Math.round(Number(v)) || 0));

export const newItem = (t, id, extra = {}) => ({ id, t, w: WIDGET_SIZES[t].w, h: WIDGET_SIZES[t].h, ...extra });

/** What Inicio showed before it became a board, in the same order. */
export const defaultHome = () => ['hello', 'photos', 'recent', 'classes', 'events', 'tasks'].map(t => newItem(t, t));

/** A stored board made safe to draw: known widgets only, sizes within limits, ids present and unique. */
export function normalizeHome(items, newId) {
  if (!Array.isArray(items)) return defaultHome();
  const ids = new Set(), singles = new Set(), out = [];
  for (const it of items) {
    const size = it && WIDGET_SIZES[it.t];
    if (!size || (size.single && singles.has(it.t))) continue;
    if (size.single) singles.add(it.t);
    const id = typeof it.id === 'string' && it.id && !ids.has(it.id) ? it.id : newId();
    ids.add(id);
    out.push({ ...it, id, w: clamp(it.w ?? size.w, size.minW, COLS), h: clamp(it.h ?? size.h, size.minH, MAX_ROWS) });
  }
  return out;
}

/** Same array when nothing changes. */
export function moveItem(items, id, index) {
  const from = items.findIndex(i => i.id === id);
  if (from < 0) return items;
  const rest = items.filter((_, i) => i !== from), at = Math.max(0, Math.min(index, rest.length));
  if (at === from) return items;
  return [...rest.slice(0, at), items[from], ...rest.slice(at)];
}

/** How many grid cells a length in pixels covers, given the cell size and the gap between cells. */
export const spanFor = (px, cell, gap, min, max) => clamp((px + gap) / (cell + gap), min, max);

/** Background colours a widget can take, besides its default card and 'none'. */
export const TINTS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red', 'beige'];
/** CSS colour for a stored background choice; null = the default card. */
export const widgetTint = bg => (bg === 'none' ? 'transparent' : TINTS.includes(bg) ? `var(--b-${bg})` : null);

// ---------- Pomodoro ----------
// p = {work, rest (minutes), phase: 'work' | 'rest', endsAt: ms while running, left: ms while paused, count: {day, n}}

const total = p => (p.phase === 'rest' ? p.rest ?? 5 : p.work ?? 25) * 60000;
export const pomoLeft = (p, now) => (p.endsAt ? Math.max(0, p.endsAt - now) : p.left ?? total(p));
export const pomoDone = (p, now) => !!p.endsAt && p.endsAt <= now;
export const pomoStart = (p, now) => ({ ...p, endsAt: now + pomoLeft(p, now), left: null });
export const pomoPause = (p, now) => ({ ...p, left: pomoLeft(p, now), endsAt: null });
export const pomoReset = p => ({ ...p, endsAt: null, left: null });
/** The phase is over: get the next one ready (not running). Finishing work adds one to today's count. */
export function pomoNext(p, today) {
  const n = p.count?.day === today ? p.count.n : 0;
  const worked = p.phase !== 'rest';
  return { ...p, phase: worked ? 'rest' : 'work', endsAt: null, left: null, count: { day: today, n: n + (worked ? 1 : 0) } };
}
export function mmss(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
