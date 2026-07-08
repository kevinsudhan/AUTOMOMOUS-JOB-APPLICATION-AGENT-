import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getQueueSummaryForUser } from '@/lib/excel-queue';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = await getQueueSummaryForUser(supabase, user.id);
  return NextResponse.json(summary);
}
