import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    
    if (!text) {
      return NextResponse.json({ error: 'No LaTeX text provided' }, { status: 400 });
    }

    // We use the official TeX Live compiler API (texlive.net) 
    // This provides a complete, up-to-date TeX Live environment with all CTAN packages.
    const formData = new FormData();
    formData.append('filecontents[]', text);
    formData.append('filename[]', 'document.tex');
    formData.append('engine', 'pdflatex');
    formData.append('return', 'pdf');

    // Send to texlive.net
    const response = await fetch('https://texlive.net/cgi-bin/latexcgi', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText || 'Compilation failed' }, { status: response.status });
    }

    // Get the PDF as an array buffer and return it
    const pdfBuffer = await response.arrayBuffer();
    
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="document.pdf"',
      },
    });
  } catch (error) {
    console.error('Compilation Error:', error);
    return NextResponse.json({ error: 'Internal server error during compilation' }, { status: 500 });
  }
}
