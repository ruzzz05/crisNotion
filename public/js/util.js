export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red', 'teal', 'lime', 'indigo', 'wine'];
export const COLOR_NAMES = { gray: 'gris', brown: 'marrón', orange: 'naranja', yellow: 'amarillo', green: 'verde', blue: 'azul', purple: 'morado', pink: 'rosa', red: 'rojo', teal: 'turquesa', lime: 'lima', indigo: 'índigo', wine: 'granate' };
/**
 * On touch screens the editor blocks long-press text selection, which brings up iPadOS's cut/copy/paste bar.
 * To allow it again, set this to true (one line; nothing else depends on it).
 */
export const ALLOW_TOUCH_SELECTION = false;
export const blocksTouchSelection = (isCoarse, allow = ALLOW_TOUCH_SELECTION) => isCoarse && !allow;
/** Text to insert for a dictated phrase at a caret after `before`: trimmed, with a space before it when needed and after it. */
export function spokenText(chunk, before = '') {
  const t = chunk.trim();
  if (!t) return '';
  return (before && !/\s$/.test(before) ? ' ' : '') + t + ' ';
}
/** Where the edit bar goes on screen: just under the breadcrumb bar, whose bottom edge is `topbarBottom`. */
export const formatBarTop = topbarBottom => Math.round(topbarBottom + 6);

/** Name the browser gives a printed PDF: the page title without characters a file name cannot have. */
export const printTitle = t => (t || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Sin título';

/** App version shown in the sidebar; kept equal to package.json (see tests). */
export const VERSION = '0.9.15';
/** Colours a text may take: the palette plus black (data-c on a span, see sanitize). */
export const TONES = [...COLORS, 'black'];
/** Top edge of the touch toolbar: its bottom sits on the visible bottom (above the on-screen keyboard). */
export const barTop = ({ innerHeight, vvHeight, vvOffsetTop, barHeight }) => Math.max(0, Math.round(vvOffsetTop + vvHeight - barHeight));
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
/** Every date from `start` to `end` inclusive (capped at a year); just `start` when `end` is missing or not after it. */
export function daysBetween(start, end) {
  const out = [start];
  if (!end || end <= start) return out;
  const d = parseYmd(start);
  while (out.length < 366) {
    d.setDate(d.getDate() + 1);
    const k = ymd(d);
    if (k > end) break;
    out.push(k);
  }
  return out;
}
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

/** Pasted text: one line stays inline; several lines become one paragraph (div) each, so they can be styled apart. */
export function pasteHtml(raw) {
  const lines = raw.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
  return lines.length === 1 ? esc(lines[0]) : lines.map(l => '<div>' + (esc(l) || '<br>') + '</div>').join('');
}

/** Whether typing lowercase letter \`ch\` after \`before\` (the text of its paragraph so far) should give a capital: it starts a sentence. */
export function shouldCapitalize(before, ch) {
  if (ch.length !== 1 || ch.toUpperCase() === ch) return false;
  return /^[\s¿¡"“«(]*$/.test(before) || /[.!?…]["”»)]*\s+[¿¡"“«(]*$/.test(before);
}

const ALIGNS = new Set(['left', 'center', 'right', 'justify']);
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
    const align = el.tagName === 'DIV' && ALIGNS.has(el.style?.textAlign) ? el.style.textAlign : null;
    const tone = el.tagName === 'SPAN' && TONES.includes(el.dataset?.c) ? el.dataset.c : null;
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    // execCommand writes bold/italic/underline as styled spans once styleWithCSS is on: keep them as real tags.
    const looks = el.tagName === 'SPAN' ? ['b', 'i', 'u', 's'].filter(k => k === 'b' ? /^(bold|[6-9]00)$/.test(el.style.fontWeight)
      : k === 'i' ? el.style.fontStyle === 'italic'
        : (el.style.textDecorationLine || el.style.textDecoration).includes(k === 'u' ? 'underline' : 'line-through')) : [];
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    if (bg && bg !== 'transparent') el.style.backgroundColor = bg;
    if (align) el.style.textAlign = align;
    if (tone) el.dataset.c = tone;
    if (href && /^(https?:|mailto:)/i.test(href)) { el.setAttribute('href', href); el.setAttribute('rel', 'noopener noreferrer'); }
    for (const k of looks) { const w = document.createElement(k); w.append(...el.childNodes); el.append(w); }
    if (looks.length && !el.attributes.length) el.replaceWith(...el.childNodes);
  }
  return tpl.innerHTML;
}

/** Scale to draw a PDF page at: twice the screen's pixel density (a scan keeps its detail when zoomed), within `maxPixels` per canvas. */
export function pdfScale({ pageW, pageH, cssW, dpr, maxPixels }) {
  const k = 2 * Math.min(3, dpr || 1) * (cssW || 700) / pageW;
  return Math.min(k, Math.sqrt(maxPixels / (pageW * pageH)));
}
