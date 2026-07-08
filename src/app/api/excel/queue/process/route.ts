import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processDueSendsForUser } from '@/lib/excel-queue';

// Worker tick for the rate-limited send queue. Called two ways:
//  - from the browser (authenticated session) while an Apply via Excel page
//    is open, scoped to that one user;
//  - from the vercel.json cron (GET request; Vercel automatically sends
//    `Authorization: Bearer $CRON_SECRET` when that env var is set), scoped
//    to every user who has connected Gmail — best-effort background trigger
//    for when no tab is open.
async function runForAllConnectedUsers() {
  const admin = createAdminClient();
  const { data: accounts } = await admin.from('gmail_accounts').select('user_id');
  let sent = 0;
  let bounced = 0;
  let reauthRequiredFor: string[] = [];
  for (const { user_id } of accounts || []) {
    const result = await processDueSendsForUser(admin, user_id);
    sent += result.sent;
    bounced += result.bounced;
    if (result.reauthRequired) reauthRequiredFor.push(user_id);
  }
  return { sent, bounced, ...(reauthRequiredFor.length > 0 ? { reauthRequiredFor } : {}) };
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

  const result = await processDueSendsForUser(supabase, user.id);
  return NextResponse.json(result);
}
