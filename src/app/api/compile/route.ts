import { NextResponse } from 'next/server';
import { compileLatexToPdf } from '@/lib/latex-compiler';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'No LaTeX text provided' }, { status: 400 });
    }

    const pdfBuffer = await compileLatexToPdf(text);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="document.pdf"',
      },
    });
  } catch (error: any) {
    console.error('Compilation Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error during compilation' }, { status: error.status || 500 });
  }
}
