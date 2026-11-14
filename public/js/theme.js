// Colour theme and font of the app. Both choices belong to this device (localStorage), and index.html applies
// them before the first paint; this module keeps them applied, follows the system when asked to, and tells listeners.
import { THEMES, resolveTheme } from './model.js';

const KEY = 'cuaderno:theme';
const BAR = { white: '#FFFFFF', beige: '#F5F0E6', dark: '#191919' }; // browser and status bar colour
const system = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

export const THEME_NAMES = { white: 'Blanco', beige: 'Beige', dark: 'Oscuro', system: 'Como el dispositivo' };

/** The stored choice: one of THEMES. */
export function getTheme() {
  let v = null;
  try { v = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  return THEMES.includes(v) ? v : THEMES[0];
}

export const isDark = () => document.documentElement.dataset.theme === 'dark';

function apply() {
  const t = resolveTheme(getTheme(), system.matches), el = document.documentElement;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[t]);
  if (el.dataset.theme === t) return;
  el.dataset.theme = t;
  for (const fn of listeners) fn();
}

export function setTheme(v) {
  try { localStorage.setItem(KEY, v); } catch { /* storage blocked */ }
  apply();
}

/** Calls `fn` whenever the colours on screen change. Returns the function that stops it. */
export function onTheme(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- Font ----------

/** [key, name]. The first is the default; the stacks themselves are in app.css (--f-<key>). */
export const FONTS = [['times', 'Times New Roman'], ['sans', 'Sin remates (la del sistema)'], ['georgia', 'Georgia'], ['palatino', 'Palatino'], ['verdana', 'Verdana'], ['rounded', 'Redondeada'], ['hand', 'Manuscrita'], ['mono', 'Máquina de escribir']];
const FONT_KEY = 'cuaderno:font';

export function getFont() {
  let v = null;
  try { v = localStorage.getItem(FONT_KEY); } catch { /* storage blocked */ }
  return FONTS.some(f => f[0] === v) ? v : FONTS[0][0];
}

export function setFont(v) {
  try { localStorage.setItem(FONT_KEY, v); } catch { /* storage blocked */ }
  document.documentElement.dataset.font = getFont();
}

system.addEventListener('change', apply);
apply();
document.documentElement.dataset.font = getFont();
