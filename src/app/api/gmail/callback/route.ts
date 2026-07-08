import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exchangeCodeForTokens, fetchGoogleUserEmail, saveGmailConnection } from '@/lib/gmail';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const dest = `${origin}/dashboard/apply-via-excel`;

  const cookieState = request.headers.get('cookie')?.match(/gmail_oauth_state=([^;]+)/)?.[1];

  if (!code || !state || !cookieState || state !== cookieState) {
    const res = NextResponse.redirect(`${dest}?gmail=error`);
    res.cookies.delete('gmail_oauth_state');
    return res;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      throw new Error('Google did not return a refresh token (try disconnecting the app at myaccount.google.com/permissions and reconnecting).');
    }
    const email = await fetchGoogleUserEmail(tokens.access_token);
    await saveGmailConnection(user.id, email, tokens.refresh_token);
    const res = NextResponse.redirect(`${dest}?gmail=connected`);
    res.cookies.delete('gmail_oauth_state');
    return res;
  } catch (err: any) {
    console.error('Gmail OAuth callback error:', err);
    const res = NextResponse.redirect(`${dest}?gmail=error`);
    res.cookies.delete('gmail_oauth_state');
    return res;
  }
}
