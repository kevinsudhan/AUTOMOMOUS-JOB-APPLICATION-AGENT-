import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCompanyWorkspace, setCompanyStatus } from '@/lib/excel-companies';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const workspace = await getCompanyWorkspace(supabase, user.id, id);
  if (!workspace) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }
  return NextResponse.json(workspace);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { status } = await req.json();
  if (status !== 'skipped' && status !== 'not_started') {
    return NextResponse.json({ error: 'status must be "skipped" or "not_started"' }, { status: 400 });
  }

  try {
    await setCompanyStatus(supabase, user.id, id, status);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
