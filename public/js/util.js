export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
export const COLOR_NAMES = { gray: 'gris', brown: 'marrón', orange: 'naranja', yellow: 'amarillo', green: 'verde', blue: 'azul', purple: 'morado', pink: 'rosa', red: 'rojo' };
export const col = key => (COLORS.includes(key) ? key : 'blue');
/** Inline style exposing a colour as --c (text) and --b (background). */
export const tint = key => `--c:var(--c-${col(key)});--b:var(--b-${col(key)})`;

export const EMOJIS = ['😀', '😎', '🤓', '🥳', '🚀', '⭐', '🔥', '💡', '✅', '❤️',
  '📘', '📗', '📕', '📙', '📓', '📚', '🎒', '✏️', '📝', '📌', '📐', '🧮', '➗', '🧪', '⚛️', '🧬', '🔬', '🌍', '🗺️', '🏛️',
  '📖', '🗣️', '🇬🇧', '🇫🇷', '🇩🇪', '🎨', '🎵', '🎭', '⚽', '🏀', '💻', '⌨️', '🤖', '💰', '📊', '⚖️', '🧠', '🌱', '☀️', '🏠'];
/** Icons handed out by "Añadir icono"; all sit beyond the first row of the picker. */
export const STARTER_ICONS = ['📘', '📗', '📕', '📙', '📓', '📚', '📝', '📌'];

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
/** "Buenos días, Cris" — or just the greeting when there is no name. */
export const greetingFor = (hour, name) => greeting(hour) + (name ? ', ' + name : '');
/** The name to greet with: the one written in Ajustes, or else the account name. */
export const displayName = (custom, username) => (custom || '').trim() || cap(username || '');
export const greeting = hour => (hour >= 6 && hour < 13 ? 'Buenos días' : hour >= 13 && hour < 21 ? 'Buenas tardes' : 'Buenas noches');

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

const ALLOWED = new Set(['B', 'I', 'U', 'S', 'STRONG', 'EM', 'BR', 'SPAN', 'MARK', 'STRIKE', 'FONT', 'DIV', 'CODE', 'A']);
/** Keep only inline formatting; stored HTML may come from an imported backup. */
export function sanitize(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  for (const el of [...tpl.content.querySelectorAll('*')]) {
    if (!ALLOWED.has(el.tagName)) {
      if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META)$/.test(el.tagName)) el.remove();
      else el.replaceWith(...el.childNodes);
      continue;
    }
    const bg = el.style?.backgroundColor;
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    if (bg && bg !== 'transparent') el.style.backgroundColor = bg;
    if (href && /^(https?:|mailto:)/i.test(href)) { el.setAttribute('href', href); el.setAttribute('rel', 'noopener noreferrer'); }
  }
  return tpl.innerHTML;
}
