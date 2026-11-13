export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const COLORS = {
  red: '#E5484D', orange: '#E8590C', yellow: '#C99700', green: '#2F9E44', teal: '#0C8599',
  blue: '#2447D6', purple: '#7048E8', pink: '#D6336C', slate: '#5B6585',
};
export const col = key => COLORS[key] || COLORS.blue;

export const EMOJIS = ['📘', '📗', '📕', '📙', '📓', '📚', '🎒', '✏️', '📐', '🧮', '🧪', '⚛️', '🧬', '🌍', '🏛️', '📖',
  '🗣️', '🇬🇧', '🇫🇷', '🎨', '🎵', '⚽', '💻', '💡', '📝', '⭐'];

const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** Day of week with Monday = 0. */
export const dow = d => (d.getDay() + 6) % 7;
export const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const hhmm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtLong = d => cap(d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
export const fmtShort = d => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

export function relDay(s) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((parseYmd(s) - t) / 864e5);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return fmtShort(parseYmd(s));
}

export function plain(html) {
  const t = document.createElement('template');
  t.innerHTML = html || '';
  return t.content.textContent || '';
}

export const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
