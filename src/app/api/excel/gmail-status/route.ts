import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGmailConnectionStatus } from '@/lib/gmail';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const status = await getGmailConnectionStatus(user.id);
  return NextResponse.json(status);
}
