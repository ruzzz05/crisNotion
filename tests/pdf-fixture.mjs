/** A tiny valid PDF for tests: each page is A4 with one blue rectangle. */
export function makePdf(pages) {
  const NL = String.fromCharCode(10);
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
  const kids = [];
  for (let i = 0; i < pages; i++) {
    const stream = '0.2 0.4 0.8 rg 60 600 300 120 re f';
    kids.push(`${3 + i * 2} 0 R`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${4 + i * 2} 0 R >>`);
    objs.push([`<< /Length ${stream.length} >>`, 'stream', stream, 'endstream'].join(NL));
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;
  let out = '%PDF-1.4' + NL;
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += [`${i + 1} 0 obj`, o, 'endobj', ''].join(NL);
    return at;
  });
  const xref = out.length;
  out += ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f ', ...offsets.map(o => String(o).padStart(10, '0') + ' 00000 n '), ''].join(NL);
  return out + ['trailer', `<< /Size ${objs.length + 1} /Root 1 0 R >>`, 'startxref', String(xref), '%%EOF', ''].join(NL);
}
