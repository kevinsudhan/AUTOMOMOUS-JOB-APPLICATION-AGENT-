import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listCompaniesForUser } from '@/lib/excel-companies';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companies = await listCompaniesForUser(supabase, user.id);
    return NextResponse.json({ companies });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load companies.' }, { status: 500 });
  }
}
