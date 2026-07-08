/**
 * Gmail API integration: OAuth2 (authorization code + refresh) and sending
 * a message via users.messages.send with a PDF attachment.
 * Implemented with plain fetch calls (matching this codebase's existing
 * style of calling the Anthropic API directly) rather than pulling in the
 * full googleapis SDK.
 */
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptSecret, decryptSecret } from '@/lib/gmail-crypto';

/**
 * Thrown when Google rejects a refresh token as expired/revoked
 * ("invalid_grant"). There's no way to recover from this without the user
 * re-authorizing — callers should surface a "reconnect Gmail" message
 * rather than treating it like a one-off send failure.
 */
export class GmailReauthRequiredError extends Error {
  constructor(message = 'Gmail connection expired or was revoked. Reconnect Gmail to keep sending.') {
    super(message);
    this.name = 'GmailReauthRequiredError';
  }
}

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
// Read-only is required (in addition to send) so the send-queue's reply
// tracker can check whether a contact has replied in the same thread.
const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const USERINFO_SCOPE = 'openid email';

function requireOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env.local.');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleAuthUrl(state: string): string {
  const { clientId, redirectUri } = requireOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: `${GMAIL_SEND_SCOPE} ${GMAIL_READONLY_SCOPE} ${USERINFO_SCOPE}`,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = requireOAuthConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${await res.text()}`);
  }
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = requireOAuthConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (errText.includes('invalid_grant')) {
      throw new GmailReauthRequiredError();
    }
    throw new Error(`Google token refresh failed: ${errText}`);
  }
  const data: GoogleTokenResponse = await res.json();
  return data.access_token;
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

/** Save (or replace) the current user's Gmail connection. Called from the OAuth callback. */
export async function saveGmailConnection(userId: string, email: string | null, refreshToken: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('gmail_accounts').upsert({
    user_id: userId,
    email,
    encrypted_refresh_token: encryptSecret(refreshToken),
  }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

export interface GmailConnectionStatus {
  connected: boolean;
  email: string | null;
}

export async function getGmailConnectionStatus(userId: string): Promise<GmailConnectionStatus> {
  const supabase = await createClient();
  const { data } = await supabase.from('gmail_accounts').select('email').eq('user_id', userId).single();
  return { connected: !!data, email: data?.email ?? null };
}

/**
 * Get a fresh access token for the given user, using the admin client so
 * this also works from the background send-queue worker (no user session).
 */
async function getAccessTokenForUser(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('gmail_accounts').select('encrypted_refresh_token').eq('user_id', userId).single();
  if (error || !data) {
    throw new Error('Gmail account not connected for this user.');
  }
  const refreshToken = decryptSecret(data.encrypted_refresh_token);
  try {
    return await refreshAccessToken(refreshToken);
  } catch (err) {
    if (err instanceof GmailReauthRequiredError) {
      // Self-heal: the stored refresh token is permanently dead, so clear
      // the connection row. That flips gmail-status back to "not connected"
      // so the dashboard prompts the user to reconnect, instead of every
      // send/reply-check tick silently failing against Google forever.
      await admin.from('gmail_accounts').delete().eq('user_id', userId);
    }
    throw err;
  }
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeHeaderUtf8(value: string): string {
  // MIME "encoded word" so non-ASCII subjects/names render correctly in clients.
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts the plain-text draft (paragraphs separated by a blank line, an
 * occasional single "\n" for the two-line sign-off or the multi-line contact
 * footer) into minimal HTML. text/html renders consistently across Gmail
 * Web/Android, Apple Mail, Outlook, etc. — plain text's line-wrapping
 * behavior varies by client depending on whether it honors format=flowed,
 * which is what caused the earlier "wraps oddly" issue. HTML sidesteps that
 * entirely: clients ignore raw newlines in the source and only respect
 * explicit tags, so each paragraph gets an unambiguous <p> boundary and the
 * client's own text reflow (not a literal newline) handles line wrapping.
 */
export function plainTextToHtml(text: string): string {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const htmlParagraphs = paragraphs
    .map(p => `    <p style="margin:0 0 1em 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #202020;">
${htmlParagraphs}
  </body>
</html>`;
}

export interface SendEmailWithAttachmentInput {
  userId: string;
  to: string;
  subject: string;
  body: string;
  attachment: { filename: string; content: Buffer; mimeType: string };
}

/** Build an RFC 2822 multipart/mixed message and send it via Gmail's users.messages.send. */
export async function sendGmailMessage(input: SendEmailWithAttachmentInput): Promise<{ id: string; threadId: string }> {
  const accessToken = await getAccessTokenForUser(input.userId);

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const htmlBody = plainTextToHtml(input.body);
  const messageParts = [
    `To: ${input.to}`,
    `Subject: ${encodeHeaderUtf8(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundary}`,
    `Content-Type: ${input.attachment.mimeType}; name="${input.attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${input.attachment.filename}"`,
    '',
    input.attachment.content.toString('base64'),
    `--${boundary}--`,
  ].join('\r\n');

  const raw = base64UrlEncode(Buffer.from(messageParts, 'utf8'));

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail send failed: ${errText}`);
  }

  return res.json();
}

/**
 * Fetch the message IDs currently in a thread. Used by the send-queue's
 * reply checker: if the thread has grown beyond just our own sent message,
 * the contact has replied.
 */
export async function getThreadMessageIds(userId: string, threadId: string): Promise<string[]> {
  const accessToken = await getAccessTokenForUser(userId);
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?fields=messages(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Gmail thread lookup failed: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.messages || []).map((m: { id: string }) => m.id);
}
