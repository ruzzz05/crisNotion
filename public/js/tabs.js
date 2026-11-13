// Open tabs, like a browser: each tab remembers its own route. Pure state transitions.

export const initial = () => ({ tabs: [{ id: 't1', route: 'home' }], active: 't1', next: 2 });

export function open(state, route) {
  const tab = { id: 't' + state.next, route };
  const at = state.tabs.findIndex(t => t.id === state.active) + 1;
  return { tabs: [...state.tabs.slice(0, at), tab, ...state.tabs.slice(at)], active: tab.id, next: state.next + 1 };
}

export function navigate(state, route) {
  return { ...state, tabs: state.tabs.map(t => (t.id === state.active ? { ...t, route } : t)) };
}

export function activate(state, id) {
  return state.tabs.some(t => t.id === id) ? { ...state, active: id } : state;
}

export function close(state, id) {
  const i = state.tabs.findIndex(t => t.id === id);
  if (i < 0) return state;
  const tabs = state.tabs.filter(t => t.id !== id);
  if (!tabs.length) return { tabs: [{ id: 't' + state.next, route: 'home' }], active: 't' + state.next, next: state.next + 1 };
  const active = state.active === id ? tabs[Math.min(i, tabs.length - 1)].id : state.active;
  return { ...state, tabs, active };
}

/** Point every tab whose route matches `test` at `route` (used when a page is deleted). */
export function redirect(state, test, route) {
  return { ...state, tabs: state.tabs.map(t => (test(t.route) ? { ...t, route } : t)) };
}

export const current = state => state.tabs.find(t => t.id === state.active) || state.tabs[0];

/** Accept only a well-formed saved state; anything else falls back to a fresh one. */
export function restore(raw) {
  try {
    const s = JSON.parse(raw);
    if (Array.isArray(s.tabs) && s.tabs.length && s.tabs.every(t => typeof t.id === 'string' && typeof t.route === 'string') &&
      s.tabs.some(t => t.id === s.active) && Number.isInteger(s.next)) return s;
  } catch { /* corrupt or missing */ }
  return initial();
}
