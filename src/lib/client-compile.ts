'use client';

/**
 * Client-side compile-with-auto-shrink, shared by the main Apply flow
 * (dashboard/apply/page.tsx) and ResumePreviewPanel (used by both Apply and
 * Apply via Excel) so a resume that overflows to 2 pages gets the same
 * fix everywhere instead of only on first generation.
 *
 * Runs as a client-driven loop of short requests (compile, then a small
 * revise-section call, then recompile) rather than one long server call —
 * the app is hosted on a Netlify plan with a hard 10s synchronous function
 * timeout, so a single request doing "compile + Claude shrink + recompile"
 * server-side would risk the same timeout already fixed elsewhere.
 */
import type { JobAnalysis, TailoredResume } from '@/app/dashboard/apply/types';

export interface CompileResult {
  pdfUrl: string | null;
  pdfBlob: Blob | null;
  latex: string;
  sections: TailoredResume['sections'];
}

const MAX_SHRINK_ATTEMPTS = 2;
type SectionKey = keyof TailoredResume['sections'];

async function compileOnce(latex: string): Promise<{ pdfBlob: Blob; pageCount: number } | null> {
  const res = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: latex }),
  });
  if (!res.ok) return null;
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/pdf')) return null;
  const pageCount = parseInt(res.headers.get('x-page-count') || '1', 10);
  const ab = await res.arrayBuffer();
  return { pdfBlob: new Blob([ab], { type: 'application/pdf' }), pageCount };
}

export async function compileWithAutoShrink(
  initialLatex: string,
  initialSections: TailoredResume['sections'],
  jobAnalysis: JobAnalysis | null,
): Promise<CompileResult> {
  let latex = initialLatex;
  let sections = initialSections;

  for (let attempt = 0; attempt <= MAX_SHRINK_ATTEMPTS; attempt++) {
    const compiled = await compileOnce(latex);
    if (!compiled) {
      return { pdfUrl: null, pdfBlob: null, latex, sections };
    }

    const canShrink = compiled.pageCount > 1 && attempt < MAX_SHRINK_ATTEMPTS && jobAnalysis;
    if (!canShrink) {
      return { pdfUrl: URL.createObjectURL(compiled.pdfBlob), pdfBlob: compiled.pdfBlob, latex, sections };
    }

    // Shrink whichever section is currently longest — a simple proxy for
    // which one is contributing most to the overflow, rather than always
    // assuming it's the same section regardless of what actually grew.
    const keys: SectionKey[] = ['experience', 'projects', 'skills'];
    const target = keys.reduce((a, b) => ((sections[a]?.length || 0) >= (sections[b]?.length || 0) ? a : b));

    try {
      const shrinkRes = await fetch('/api/ai/revise-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: target,
          sectionLatex: sections[target],
          fullLatex: latex,
          feedback: `The compiled resume is currently ${compiled.pageCount} pages. It MUST fit on exactly 1 page. Shorten this section's wording by roughly 15-20% — tighten phrasing, cut redundant words — while preserving every fact, metric, and keyword. Do not remove entire bullets, roles, or projects. Do not change any LaTeX formatting commands.`,
          jobAnalysis,
        }),
      });
      if (!shrinkRes.ok) {
        return { pdfUrl: URL.createObjectURL(compiled.pdfBlob), pdfBlob: compiled.pdfBlob, latex, sections };
      }
      const shrinkData = await shrinkRes.json();
      if (!shrinkData.updatedLatex || !shrinkData.updatedSections) {
        return { pdfUrl: URL.createObjectURL(compiled.pdfBlob), pdfBlob: compiled.pdfBlob, latex, sections };
      }
      latex = shrinkData.updatedLatex;
      sections = shrinkData.updatedSections;
      // loop back around to recompile with the shrunk content
    } catch {
      return { pdfUrl: URL.createObjectURL(compiled.pdfBlob), pdfBlob: compiled.pdfBlob, latex, sections };
    }
  }

  // Unreachable — the loop always returns by MAX_SHRINK_ATTEMPTS — but keeps
  // the return type honest for TypeScript.
  return { pdfUrl: null, pdfBlob: null, latex, sections };
}
