import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { reviseEmailDraft, formatPhoneDisplay, type CandidateContactInfo } from '@/lib/email-draft';

// Revises an existing draft using the user's own free-text pointers (e.g.
// "make it shorter", "mention my notice period is 2 weeks") — reuses the
// same review-before-send step, it just lets the user steer the rewrite
// instead of editing raw text by hand.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { feedback } = await req.json();
  if (!feedback || typeof feedback !== 'string' || !feedback.trim()) {
    return NextResponse.json({ error: 'Feedback is required.' }, { status: 400 });
  }

  const { data: contact } = await supabase
    .from('excel_contacts')
    .select('id, subject, body, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }
  if (contact.status !== 'not_sent') {
    return NextResponse.json({ error: 'This contact has already been sent/queued — only a "Not Sent" draft can be revised.' }, { status: 400 });
  }
  if (!contact.subject || !contact.body) {
    return NextResponse.json({ error: 'Generate a draft for this contact before revising it.' }, { status: 400 });
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

  try {
    const revised = await reviseEmailDraft({
      currentSubject: contact.subject,
      currentBody: contact.body,
      feedback: feedback.trim(),
      candidateName,
      contactInfo,
    });

    const { error: updateErr } = await supabase
      .from('excel_contacts')
      .update({ subject: revised.subject, body: revised.body })
      .eq('id', id)
      .eq('user_id', user.id);
    if (updateErr) throw new Error(updateErr.message);

    return NextResponse.json({ subject: revised.subject, body: revised.body });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to revise draft.' }, { status: 500 });
  }
}
