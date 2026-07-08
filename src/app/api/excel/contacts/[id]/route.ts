import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Edit a contact's draft (review step before sending) or manually mark it
// skipped/not-sent. Statuses driven by the send queue itself (queued/
// sending/sent/bounced) are not settable here.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.subject === 'string') updates.subject = body.subject;
  if (typeof body.body === 'string') updates.body = body.body;
  if (body.status !== undefined) {
    if (body.status !== 'skipped' && body.status !== 'not_sent') {
      return NextResponse.json({ error: 'status must be "skipped" or "not_sent"' }, { status: 400 });
    }

    if (body.status === 'not_sent') {
      const { data: current } = await supabase.from('excel_contacts').select('status').eq('id', id).eq('user_id', user.id).single();
      if (current?.status === 'sending') {
        return NextResponse.json({ error: 'This contact is currently being sent — try again in a moment.' }, { status: 409 });
      }
      // A reset must clear every trace of the previous send attempt, not
      // just flip the status — otherwise the old sent_at/error/thread would
      // stick around and the contact still couldn't be sent again.
      updates.sent_at = null;
      updates.error = null;
      updates.scheduled_at = null;
      updates.gmail_message_id = null;
      updates.gmail_thread_id = null;
      updates.replied_at = null;
      updates.reply_snippet = null;
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('excel_contacts')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

// Permanently removes a contact — e.g. one that was imported by mistake or
// is a test/dummy entry. Blocked while a send is in flight to avoid racing
// the queue worker; a already-sent contact can still be removed (it's just
// a record at that point, not an in-progress operation).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { data: current } = await supabase.from('excel_contacts').select('status').eq('id', id).eq('user_id', user.id).single();
  if (!current) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }
  if (current.status === 'sending') {
    return NextResponse.json({ error: 'This contact is currently being sent — try again in a moment.' }, { status: 409 });
  }

  const { error } = await supabase.from('excel_contacts').delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
