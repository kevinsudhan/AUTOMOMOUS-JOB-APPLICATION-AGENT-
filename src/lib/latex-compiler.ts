/**
 * Shared LaTeX -> PDF compilation.
 * Extracted from /api/compile so it can also be called server-side
 * (e.g. to attach a resume PDF to an outgoing email) without an HTTP round-trip.
 */
import { PDFDocument } from 'pdf-lib';

/**
 * Compile LaTeX source to a PDF using the texlive.net compiler service.
 * Returns the raw PDF bytes. Throws on failure.
 */
export async function compileLatexToPdf(text: string): Promise<ArrayBuffer> {
  if (!text) {
    throw new Error('No LaTeX text provided');
  }

  const formData = new FormData();
  formData.append('filecontents[]', text);
  formData.append('filename[]', 'document.tex');
  formData.append('engine', 'pdflatex');
  formData.append('return', 'pdf');

  const response = await fetch('https://texlive.net/cgi-bin/latexcgi', {
    method: 'POST',
    body: formData,
  });

  const buffer = await response.arrayBuffer();

  // texlive.net returns HTTP 200 even when the LaTeX itself fails to
  // compile — it just sends back the pdflatex log (text/plain) instead of
  // a PDF. response.ok alone can't tell success from failure here, so the
  // actual PDF magic bytes are checked; otherwise a broken compile would
  // silently ship a log file mislabeled as a PDF to the browser instead of
  // surfacing a real, actionable error.
  const header = Buffer.from(buffer.slice(0, 5)).toString('latin1');
  if (!response.ok || header !== '%PDF-') {
    const log = Buffer.from(buffer).toString('utf8');
    console.error('LaTeX compilation failed:', log.slice(0, 3000));
    const err: Error & { status?: number } = new Error('LaTeX compilation failed — the generated resume contains invalid LaTeX.');
    err.status = response.status >= 400 ? response.status : 502;
    throw err;
  }

  return buffer;
}

/**
 * Counts pages in a compiled PDF via a real parse (pdf-lib) rather than a
 * byte-pattern heuristic — resume LaTeX templates vary enough (object
 * streams, differing key ordering) that guessing from raw bytes isn't
 * reliable, and this feeds an auto-shrink decision that must trust the
 * count.
 */
export async function countPdfPages(buffer: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(buffer);
  return doc.getPageCount();
}
