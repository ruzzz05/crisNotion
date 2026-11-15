// Save the page on screen as a PDF: the browser's print dialog does it, using the page's own look (see @media print in app.css).
import { printTitle } from './util.js';

export function printPage(title) {
  const before = document.title;
  const restore = () => { document.title = before; removeEventListener('afterprint', restore); };
  document.title = printTitle(title); // browsers use the document title as the PDF's name
  addEventListener('afterprint', restore);
  setTimeout(() => print(), 150); // let the page menu close first, so it is not printed
}
