import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { selectAllRows } from '@/lib/supabase-pagination';

// Resets every contact in a company back to "Not Sent" so they can be
// drafted and sent again — e.g. after testing, or to run a follow-up pass.
// Skips anything mid-send ('sending') so it can't collide with an
// in-flight request from the queue worker.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: companyId } = await params;

  let contacts: { id: string }[];
  try {
    contacts = await selectAllRows<{ id: string }>(
      (from, to) => supabase.from('excel_contacts').select('id')
        .eq('user_id', user.id).eq('company_id', companyId).neq('status', 'not_sent').neq('status', 'sending')
        .order('id').range(from, to),
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  if (contacts.length === 0) {
    return NextResponse.json({ reset: 0 });
  }

  const { error } = await supabase
    .from('excel_contacts')
    .update({
      status: 'not_sent',
      sent_at: null,
      error: null,
      scheduled_at: null,
      gmail_message_id: null,
      gmail_thread_id: null,
      replied_at: null,
      reply_snippet: null,
    })
    .eq('user_id', user.id)
    .in('id', contacts.map(c => c.id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reset: contacts.length });
}
