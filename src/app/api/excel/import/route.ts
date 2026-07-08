import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { importWorkbookForUser } from '@/lib/excel-companies';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await importWorkbookForUser(supabase, user.id, buffer);
    return NextResponse.json(summary);
  } catch (err: any) {
    console.error('Excel import error:', err);
    return NextResponse.json({ error: err.message || 'Import failed.' }, { status: 500 });
  }
}
