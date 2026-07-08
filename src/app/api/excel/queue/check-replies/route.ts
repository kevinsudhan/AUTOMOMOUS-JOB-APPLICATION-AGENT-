import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRepliesForUser } from '@/lib/excel-queue';

async function runForAllConnectedUsers() {
  const admin = createAdminClient();
  const { data: accounts } = await admin.from('gmail_accounts').select('user_id');
  let checked = 0;
  let replied = 0;
  let reauthRequiredFor: string[] = [];
  for (const { user_id } of accounts || []) {
    const result = await checkRepliesForUser(admin, user_id);
    checked += result.checked;
    replied += result.replied;
    if (result.reauthRequired) reauthRequiredFor.push(user_id);
  }
  return { checked, replied, ...(reauthRequiredFor.length > 0 ? { reauthRequiredFor } : {}) };
}

function isAuthorizedCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await runForAllConnectedUsers());
}

export async function POST(req: NextRequest) {
  if (isAuthorizedCron(req)) {
    return NextResponse.json(await runForAllConnectedUsers());
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await checkRepliesForUser(supabase, user.id);
  return NextResponse.json(result);
}
