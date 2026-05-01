import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET — load personal details for current user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('personal_details')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found (new user)
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    details: data?.data || null,
    profileComplete: data?.profile_complete || false,
  });
}

// POST — save personal details for current user
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { details, profileComplete = true } = body;

  // Upsert — insert or update
  const { error } = await supabase
    .from('personal_details')
    .upsert({
      user_id: user.id,
      data: details,
      profile_complete: profileComplete,
    }, { onConflict: 'user_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
