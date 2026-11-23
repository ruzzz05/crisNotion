// Table block: `block.rows` is an array of rows of plain-text cells. Every cell is editable in place; the bar above the table
// adds or removes rows and columns next to the cell you are in (or at the end when none is chosen).
import { h, icon } from './ui.js';
import { tableAddRow, tableAddCol, tableDelRow, tableDelCol } from './model.js';

export function mountTable(host, block, changed) {
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
        td.contentEditable = 'plaintext-only';
        td.spellcheck = true;
        td.textContent = text;
        td.setAttribute('role', 'textbox');
        td.setAttribute('aria-label', `Fila ${r + 1}, columna ${c + 1}`);
        td.addEventListener('focus', () => { at = { r, c }; });
        td.addEventListener('input', () => { rows()[r][c] = td.textContent; changed(); });
        td.addEventListener('paste', e => {
          e.preventDefault();
          document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\r?\n/g, ' '));
        });
        td.addEventListener('keydown', e => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const w = rows()[0].length, last = r === rows().length - 1 && c === w - 1, first = r === 0 && c === 0;
            if (e.shiftKey) { if (!first) focusCell(c ? r : r - 1, c ? c - 1 : w - 1); }
            else if (last) edit(tableAddRow(rows(), rows().length), r + 1, 0); // Tab on the last cell grows the table
            else focusCell(c === w - 1 ? r + 1 : r, c === w - 1 ? 0 : c + 1);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (r < rows().length - 1) focusCell(r + 1, c); // Enter goes down; Shift+Enter breaks the line
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
