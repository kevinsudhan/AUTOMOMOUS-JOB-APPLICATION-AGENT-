import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Persists edits made through the reused resume-review panel (regenerate /
// section-revise / recompile) back onto the saved resume version. The AI
// calls themselves happen client-side against the existing, unmodified
// /api/ai/tailor-resume, /api/ai/revise-section, and /api/compile routes —
// this route only saves the result.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.latex === 'string') updates.latex = body.latex;
  if (body.sections) updates.sections = body.sections;
  if (body.changes) updates.changes = body.changes;
  if (typeof body.atsScore === 'number') updates.ats_score = body.atsScore;
  if (typeof body.resumeScore === 'number') updates.resume_score = body.resumeScore;
  if (typeof body.pdfBase64 === 'string') updates.pdf_base64 = body.pdfBase64;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('excel_resume_versions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
