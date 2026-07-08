import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateEmailDraft, formatPhoneDisplay, type CandidateContactInfo } from '@/lib/email-draft';
import { extractBulletItems } from '@/lib/latex-parser';
import { selectAllRows } from '@/lib/supabase-pagination';

function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

// Generates a personalized draft per contact — one LLM call per contact (not
// a single template), reusing lib/email-draft.ts. By default fills in every
// contact missing a draft; pass `contactIds` to (re)generate specific ones.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: companyId } = await params;
  const { contactIds } = await req.json().catch(() => ({ contactIds: undefined as string[] | undefined }));

  const { data: company } = await supabase
    .from('excel_companies')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('id', companyId)
    .single();
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const { data: run } = await supabase
    .from('excel_application_runs')
    .select('id, job_link_or_jd, role_title')
    .eq('user_id', user.id)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: resumeVersion } = await supabase
    .from('excel_resume_versions')
    .select('sections')
    .eq('user_id', user.id)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run || !resumeVersion) {
    return NextResponse.json({ error: 'Generate a tailored resume for this company before creating email drafts.' }, { status: 400 });
  }

  let candidateName = 'The candidate';
  let contactInfo: CandidateContactInfo = {};
  try {
    const { data: details } = await supabase.from('personal_details').select('data').eq('user_id', user.id).single();
    const identity = details?.data;
    if (identity?.firstName) {
      candidateName = [identity.firstName, identity.lastName].filter(Boolean).join(' ');
    }
    contactInfo = {
      phone: formatPhoneDisplay(identity?.phoneCountryCode, identity?.phone),
      email: identity?.email || null,
      github: identity?.github || null,
      linkedin: identity?.linkedin || null,
      portfolio: identity?.portfolio || null,
    };
  } catch { /* fall back to defaults */ }

  // Bullet text only (never headings/project titles — extractBulletItems
  // deliberately excludes \resumeProjectHeading/\resumeSubheading, since the
  // email must never name a project, only describe what it does). Also kept
  // short: more facts just gives the model more to try to cram in.
  const sections = resumeVersion.sections || {};
  const resumeHighlights = {
    experience: extractBulletItems(sections.experience || '').slice(0, 2),
    projects: extractBulletItems(sections.projects || '').slice(0, 1),
    skills: [],
  };

  const jobSummary = run.job_link_or_jd && !isUrl(run.job_link_or_jd)
    ? run.job_link_or_jd.slice(0, 400)
    : null;

  let contacts: { id: string; name: string | null; email: string }[];
  try {
    // Paged — a company with 1000+ contacts needing drafts would otherwise
    // only have its first 1000 picked up (PostgREST's default row cap).
    contacts = await selectAllRows<{ id: string; name: string | null; email: string }>((from, to) => {
      let q = supabase.from('excel_contacts').select('id, name, email').eq('user_id', user.id).eq('company_id', companyId);
      q = (contactIds && contactIds.length > 0) ? q.in('id', contactIds) : q.is('subject', null).eq('status', 'not_sent');
      return q.order('id').range(from, to);
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  if (contacts.length === 0) {
    return NextResponse.json({ drafted: 0, failed: [] });
  }

  let drafted = 0;
  const failed: { contactId: string; error: string }[] = [];

  for (const contact of contacts) {
    try {
      const draft = await generateEmailDraft({
        contact: { name: contact.name, email: contact.email },
        companyName: company.name,
        roleTitle: run.role_title,
        jobSummary,
        resumeHighlights,
        candidateName,
        contactInfo,
      });
      const { error: updateErr } = await supabase
        .from('excel_contacts')
        .update({ subject: draft.subject, body: draft.body, application_run_id: run.id })
        .eq('id', contact.id)
        .eq('user_id', user.id);
      if (updateErr) throw new Error(updateErr.message);
      drafted++;
    } catch (err: any) {
      failed.push({ contactId: contact.id, error: err.message || 'Draft generation failed.' });
    }
  }

  return NextResponse.json({ drafted, failed });
}
