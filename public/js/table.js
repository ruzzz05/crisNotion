// Table block: `block.rows` is an array of rows of plain-text cells. Every cell is editable in place; the bar above the table
// adds or removes rows and columns next to the cell you are in (or at the end when none is chosen).
import { h, icon } from './ui.js';
import { esc, sanitize } from './util.js';
import { tableAddRow, tableAddCol, tableDelRow, tableDelCol } from './model.js';

/** Whether the caret sits where an arrow would leave the cell: start/end of the text for left/right, first/last line for up/down. */
function leaving(td, [dr, dc]) {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed || !td.contains(sel.anchorNode)) return false;
  const range = sel.getRangeAt(0);
  if (dc) {
    const probe = document.createRange();
    probe.selectNodeContents(td);
    if (dc < 0) probe.setEnd(range.startContainer, range.startOffset); else probe.setStart(range.endContainer, range.endOffset);
    return probe.toString() === '' && probe.cloneContents().querySelector('br, img') === null;
  }
  if (!td.textContent) return true;
  let caret = range.getClientRects()[0];
  if (!caret || (!caret.height && !caret.width)) {
    // an empty line has no rectangle of its own: borrow one from a temporary marker
    const mark = document.createElement('span');
    mark.textContent = '\u200b';
    range.insertNode(mark);
    caret = mark.getBoundingClientRect();
    mark.remove();
    td.normalize();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  const box = td.getBoundingClientRect(), line = Math.max(caret.height, 12);
  return dr < 0 ? caret.top - box.top < line + 6 : box.bottom - caret.bottom < line + 6;
}

export function mountTable(host, block, changed) {
  // Cells hold formatted text (bold, colour, highlight…) as HTML. A table made when cells were plain text is converted once.
  if (!block.rich) { block.rows = block.rows.map(r => r.map(t => esc(t || '').replace(/\n/g, '<br>'))); block.rich = true; }
  let at = { r: 0, c: 0 }, body;
  const bar = h('div', { class: 'tbl-bar', role: 'toolbar', 'aria-label': 'Herramientas de la tabla' });
  const wrap = h('div', { class: 'tbl-wrap' });
  host.append(bar, wrap);

  const btn = (label, ic, fn) => h('button', { class: 'tbl-btn', type: 'button', title: label, 'aria-label': label, onmousedown: e => e.preventDefault(), onclick: fn }, icon(ic), h('span', null, label));
  const rows = () => block.rows;
  const cell = (r, c) => body.rows[r]?.cells[c];
  const focusCell = (r, c) => {
    const el = cell(Math.min(r, rows().length - 1), Math.min(c, rows()[0].length - 1));
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  };
  const edit = (next, r, c) => { block.rows = next; at = { r, c }; render(); changed(); focusCell(r, c); };

  function render() {
    const hdr = !!block.hdr;
    body = h('table', { class: 'tbl' + (hdr ? ' hdr' : '') });
    rows().forEach((row, r) => {
      const tr = body.insertRow();
      row.forEach((text, c) => {
        const td = tr.insertCell();
        td.className = 'tbl-cell';
        td.contentEditable = 'true';
        td.spellcheck = true;
        td.innerHTML = sanitize(text);
        td.setAttribute('role', 'textbox');
        td.setAttribute('aria-label', `Fila ${r + 1}, columna ${c + 1}`);
        td.addEventListener('focus', () => { at = { r, c }; });
        td.addEventListener('input', () => { rows()[r][c] = td.innerHTML === '<br>' ? '' : td.innerHTML; changed(); });
        td.addEventListener('paste', e => {
          e.preventDefault();
          document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\r?\n/g, ' '));
        });
        td.addEventListener('keydown', e => {
          const dir = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
          if (dir && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
            // Ctrl/Cmd + arrow: a new row or column right next to this cell, on the side of the arrow.
            e.preventDefault();
            const [dr, dc] = dir;
            if (dr) edit(tableAddRow(rows(), dr < 0 ? r : r + 1), dr < 0 ? r : r + 1, c);
            else edit(tableAddCol(rows(), dc < 0 ? c : c + 1), r, dc < 0 ? c : c + 1);
            return;
          }
          if (dir && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && leaving(td, dir)) {
            // Arrow at the edge of the text: on to the neighbouring cell (inside the text it moves the caret as usual).
            const nr = r + dir[0], nc = c + dir[1];
            if (nr >= 0 && nr < rows().length && nc >= 0 && nc < rows()[0].length) { e.preventDefault(); focusCell(nr, nc); }
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            const w = rows()[0].length, last = r === rows().length - 1 && c === w - 1, first = r === 0 && c === 0;
            if (e.shiftKey) { if (!first) focusCell(c ? r : r - 1, c ? c - 1 : w - 1); }
            else if (last) edit(tableAddRow(rows(), rows().length), r + 1, 0); // Tab on the last cell grows the table
            else focusCell(c === w - 1 ? r + 1 : r, c === w - 1 ? 0 : c + 1);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) document.execCommand('insertLineBreak');
            else if (r < rows().length - 1) focusCell(r + 1, c); // Enter goes down; Shift+Enter breaks the line
          }
        });
      });
    });
    wrap.replaceChildren(body);
    paintBar();
  }

  function paintBar() {
    const R = rows().length, C = rows()[0].length;
    bar.replaceChildren(
      btn('Fila', 'plus', () => edit(tableAddRow(rows(), at.r + 1), at.r + 1, at.c)),
      btn('Columna', 'plus', () => edit(tableAddCol(rows(), at.c + 1), at.r, at.c + 1)),
      h('span', { class: 'tb-sep' }),
      R > 1 && btn('Quitar fila', 'minus', () => edit(tableDelRow(rows(), at.r), Math.min(at.r, R - 2), at.c)),
      C > 1 && btn('Quitar columna', 'minus', () => edit(tableDelCol(rows(), at.c), at.r, Math.min(at.c, C - 2))),
      h('span', { class: 'tb-sep' }),
      h('button', {
        class: 'tbl-btn' + (block.hdr ? ' on' : ''), type: 'button', 'aria-pressed': String(!!block.hdr), title: 'Primera fila como título', onmousedown: e => e.preventDefault(),
        onclick: () => { block.hdr = !block.hdr; render(); changed(); },
      }, h('span', null, 'Fila de título')),
      h('span', { class: 'tbl-size muted' }, `${R} × ${C}`));
  }

  render();
  return () => {};
}
