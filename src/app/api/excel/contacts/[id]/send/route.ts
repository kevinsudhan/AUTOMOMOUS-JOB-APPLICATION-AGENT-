import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enqueueContacts } from '@/lib/excel-queue';

// Manual single-contact send — still goes through the same rate-limited
// queue (counts toward the daily cap) rather than sending synchronously in
// this handler, so status tracking / PDF attachment stays on one code path.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  try {
    const result = await enqueueContacts(supabase, user.id, [id]);
    if (result.queued === 0) {
      return NextResponse.json({ error: 'Contact is not eligible to send (needs a draft and must be "Not Sent").' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to enqueue send.' }, { status: 500 });
  }
}
