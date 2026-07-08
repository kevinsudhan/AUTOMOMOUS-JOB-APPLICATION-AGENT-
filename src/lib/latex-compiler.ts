/**
 * Shared LaTeX -> PDF compilation.
 * Extracted from /api/compile so it can also be called server-side
 * (e.g. to attach a resume PDF to an outgoing email) without an HTTP round-trip.
 */

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

  if (!response.ok) {
    const errorText = await response.text();
    const err: Error & { status?: number } = new Error(errorText || 'Compilation failed');
    err.status = response.status;
    throw err;
  }

  return response.arrayBuffer();
}
