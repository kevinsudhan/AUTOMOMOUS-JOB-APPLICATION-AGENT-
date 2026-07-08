import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeJob } from '@/lib/job-analyzer';
import { tailorResume, type TailorMode } from '@/lib/resume-tailor';
import { compileLatexToPdf } from '@/lib/latex-compiler';

// Generates a tailored resume for a company/role, reusing the exact same
// analyze -> tailor -> compile pipeline as the main /dashboard/apply flow
// (lib/job-analyzer.ts, lib/resume-tailor.ts, lib/latex-compiler.ts).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: companyId } = await params;
  const { jobLinkOrJd, mode } = await req.json() as { jobLinkOrJd: string; mode?: TailorMode };

  const { data: company } = await supabase
    .from('excel_companies')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('id', companyId)
    .single();
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  try {
    const analysis = await analyzeJob(jobLinkOrJd);
    const resume = await tailorResume(analysis, mode);

    let pdfBase64: string | null = null;
    try {
      const pdfBuffer = await compileLatexToPdf(resume.latex);
      pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
    } catch (compileErr) {
      console.warn('PDF compilation failed for excel resume version (non-fatal):', compileErr);
    }

    const { data: resumeVersion, error: rvErr } = await supabase
      .from('excel_resume_versions')
      .insert({
        user_id: user.id,
        company_id: companyId,
        latex: resume.latex,
        sections: resume.sections,
        changes: resume.changes,
        ats_score: resume.atsScore,
        resume_score: resume.resumeScore,
        pdf_base64: pdfBase64,
      })
      .select('id')
      .single();
    if (rvErr || !resumeVersion) {
      throw new Error(rvErr?.message || 'Failed to save resume version.');
    }

    const { data: run, error: runErr } = await supabase
      .from('excel_application_runs')
      .insert({
        user_id: user.id,
        company_id: companyId,
        job_link_or_jd: jobLinkOrJd,
        role_title: analysis.role,
        resume_version_id: resumeVersion.id,
      })
      .select('id')
      .single();
    if (runErr || !run) {
      throw new Error(runErr?.message || 'Failed to save application run.');
    }

    return NextResponse.json({
      analysis,
      resume,
      resumeVersionId: resumeVersion.id,
      applicationRunId: run.id,
      pdfBase64,
    });
  } catch (err: any) {
    console.error('Excel generate-resume error:', err);
    return NextResponse.json({ error: err.message || 'Resume generation failed.' }, { status: 500 });
  }
}
