import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildGoogleAuthUrl } from '@/lib/gmail';
import crypto from 'crypto';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const state = crypto.randomBytes(16).toString('hex');
  try {
    const url = buildGoogleAuthUrl(state);
    const res = NextResponse.redirect(url);
    // CSRF check for the callback — short-lived, cleared once consumed.
    res.cookies.set('gmail_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    return res;
  } catch (err: any) {
    // Surface a misconfiguration (missing GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI)
    // as a visible banner on the dashboard instead of a bare JSON 500 page —
    // that blank-looking response is what made "Connect Gmail" look like it
    // was doing nothing.
    console.error('Gmail connect misconfigured:', err.message);
    const dest = new URL('/dashboard/apply-via-excel', request.url);
    dest.searchParams.set('gmail', 'not_configured');
    return NextResponse.redirect(dest);
  }
}
