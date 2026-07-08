import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enqueueContacts } from '@/lib/excel-queue';
import { selectAllRows } from '@/lib/supabase-pagination';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: companyId } = await params;

  let contacts: { id: string }[];
  try {
    // Paged — a company with 1000+ ready contacts would otherwise only
    // have its first 1000 picked up by "Send All" (PostgREST's default cap).
    contacts = await selectAllRows<{ id: string }>(
      (from, to) => supabase.from('excel_contacts').select('id')
        .eq('user_id', user.id).eq('company_id', companyId).eq('status', 'not_sent').not('subject', 'is', null)
        .order('id').range(from, to),
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  if (contacts.length === 0) {
    return NextResponse.json({ queued: 0, skipped: 0, message: 'No contacts with a ready draft to send.' });
  }

  try {
    const result = await enqueueContacts(supabase, user.id, contacts.map(c => c.id));
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to enqueue sends.' }, { status: 500 });
  }
}
