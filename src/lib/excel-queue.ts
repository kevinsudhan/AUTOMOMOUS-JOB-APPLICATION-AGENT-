/**
 * Apply via Excel: send-queue orchestration (DB + Gmail side).
 * Pure scheduling math lives in lib/send-queue.ts (unit tested); this file
 * wires that math up to Supabase + lib/gmail.ts so route handlers stay thin.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { scheduleSends, hasReply } from '@/lib/send-queue';
import { sendGmailMessage, getThreadMessageIds, GmailReauthRequiredError } from '@/lib/gmail';
import { selectAllRows } from '@/lib/supabase-pagination';

export interface SendSettings {
  dailyCap: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
}

const DEFAULT_SETTINGS: SendSettings = { dailyCap: 30, minDelaySeconds: 45, maxDelaySeconds: 120 };

export async function getSendSettings(supabase: SupabaseClient, userId: string): Promise<SendSettings> {
  const { data } = await supabase.from('excel_send_settings').select('*').eq('user_id', userId).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    dailyCap: data.daily_cap,
    minDelaySeconds: data.min_delay_seconds,
    maxDelaySeconds: data.max_delay_seconds,
  };
}

export async function updateSendSettings(supabase: SupabaseClient, userId: string, settings: Partial<SendSettings>): Promise<void> {
  const { error } = await supabase.from('excel_send_settings').upsert({
    user_id: userId,
    daily_cap: settings.dailyCap ?? DEFAULT_SETTINGS.dailyCap,
    min_delay_seconds: settings.minDelaySeconds ?? DEFAULT_SETTINGS.minDelaySeconds,
    max_delay_seconds: settings.maxDelaySeconds ?? DEFAULT_SETTINGS.maxDelaySeconds,
  }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

function startOfDay(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

/**
 * Enqueue a set of not-yet-sent contacts (each must already have a subject/
 * body draft), respecting the daily cap + jitter delay. Safe to call again
 * later in the day — it accounts for sends already completed today and
 * contacts already queued so a second "Send All" click doesn't collide.
 */
export async function enqueueContacts(
  supabase: SupabaseClient,
  userId: string,
  contactIds: string[],
  now: Date = new Date(),
): Promise<{ queued: number; skipped: number }> {
  if (contactIds.length === 0) return { queued: 0, skipped: 0 };

  // Paged — "Send All" on a company with 1000+ contacts would otherwise
  // silently only enqueue the first 1000 (PostgREST's default row cap).
  const contacts = await selectAllRows<{ id: string; status: string; subject: string | null; body: string | null }>(
    (from, to) => supabase.from('excel_contacts').select('id, status, subject, body').eq('user_id', userId).in('id', contactIds).order('id').range(from, to),
  );

  const eligible = contacts.filter(c => c.status === 'not_sent' && c.subject && c.body);
  const skipped = contactIds.length - eligible.length;
  if (eligible.length === 0) return { queued: 0, skipped };

  const settings = await getSendSettings(supabase, userId);

  const { count: alreadySentToday } = await supabase
    .from('excel_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'sent')
    .gte('sent_at', startOfDay(now));

  const queuedRows = await selectAllRows<{ scheduled_at: string }>(
    (from, to) => supabase.from('excel_contacts').select('scheduled_at').eq('user_id', userId).eq('status', 'queued').not('scheduled_at', 'is', null).order('id').range(from, to),
  );
  const alreadyQueuedTimes = queuedRows.map(r => new Date(r.scheduled_at));

  const times = scheduleSends(eligible.length, {
    dailyCap: settings.dailyCap,
    minDelaySeconds: settings.minDelaySeconds,
    maxDelaySeconds: settings.maxDelaySeconds,
    now,
    alreadySentToday: alreadySentToday || 0,
    alreadyQueuedTimes,
  });

  for (let i = 0; i < eligible.length; i++) {
    await supabase
      .from('excel_contacts')
      .update({ status: 'queued', scheduled_at: times[i].toISOString() })
      .eq('id', eligible[i].id)
      .eq('user_id', userId);
  }

  return { queued: eligible.length, skipped };
}

/**
 * Worker tick: send every contact whose scheduled_at has arrived. No retry
 * loop on failure — a failed send is marked bounced with the error and left
 * for the user to see, per the spec's "don't retry silently" rule.
 */
export async function processDueSendsForUser(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ sent: number; bounced: number; reauthRequired?: boolean }> {
  const due = await selectAllRows<{
    id: string; company_id: string; email: string; subject: string; body: string; application_run_id: string | null;
  }>(
    (from, to) => supabase.from('excel_contacts')
      .select('id, company_id, email, subject, body, application_run_id')
      .eq('user_id', userId).eq('status', 'queued').lte('scheduled_at', now.toISOString()).order('id').range(from, to),
  );

  if (due.length === 0) return { sent: 0, bounced: 0 };

  let sent = 0;
  let bounced = 0;

  for (const contact of due) {
    // Mark 'sending' first so a crash mid-send can't cause a double-send on
    // the next tick — it'll show as stuck in 'sending' rather than being
    // silently re-picked-up as 'queued'.
    await supabase.from('excel_contacts').update({ status: 'sending' }).eq('id', contact.id).eq('user_id', userId);

    try {
      let pdfBase64: string | null = null;
      let companyName = 'Company';
      if (contact.application_run_id) {
        const { data: run } = await supabase
          .from('excel_application_runs')
          .select('resume_version_id')
          .eq('id', contact.application_run_id)
          .single();
        if (run?.resume_version_id) {
          const { data: rv } = await supabase
            .from('excel_resume_versions')
            .select('pdf_base64')
            .eq('id', run.resume_version_id)
            .single();
          pdfBase64 = rv?.pdf_base64 || null;
        }
      }
      const { data: company } = await supabase.from('excel_companies').select('name').eq('id', contact.company_id).single();
      if (company?.name) companyName = company.name;

      if (!pdfBase64) {
        throw new Error('No compiled resume PDF available for this company — generate a resume before sending.');
      }

      const filename = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Resume.pdf`;
      const result = await sendGmailMessage({
        userId,
        to: contact.email,
        subject: contact.subject,
        body: contact.body,
        attachment: { filename, content: Buffer.from(pdfBase64, 'base64'), mimeType: 'application/pdf' },
      });

      await supabase
        .from('excel_contacts')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          gmail_message_id: result.id,
          gmail_thread_id: result.threadId,
          error: null,
        })
        .eq('id', contact.id)
        .eq('user_id', userId);
      sent++;
    } catch (err) {
      if (err instanceof GmailReauthRequiredError) {
        // Not a per-email failure — the Gmail connection itself is dead.
        // Put this contact back to 'queued' (don't falsely mark it
        // "bounced") and stop the batch early since every remaining
        // contact would fail identically against the same dead token.
        await supabase
          .from('excel_contacts')
          .update({ status: 'queued', error: err.message })
          .eq('id', contact.id)
          .eq('user_id', userId);
        return { sent, bounced, reauthRequired: true };
      }

      const message = err instanceof Error ? err.message : 'Send failed.';
      await supabase
        .from('excel_contacts')
        .update({ status: 'bounced', error: message })
        .eq('id', contact.id)
        .eq('user_id', userId);
      bounced++;
    }
  }

  return { sent, bounced };
}

/** Check Gmail for replies on every sent-but-unreplied contact. */
export async function checkRepliesForUser(supabase: SupabaseClient, userId: string): Promise<{ checked: number; replied: number; reauthRequired?: boolean }> {
  const candidates = await selectAllRows<{ id: string; gmail_thread_id: string; gmail_message_id: string }>(
    (from, to) => supabase.from('excel_contacts')
      .select('id, gmail_thread_id, gmail_message_id')
      .eq('user_id', userId).eq('status', 'sent').is('replied_at', null).not('gmail_thread_id', 'is', null)
      .order('id').range(from, to),
  );

  if (candidates.length === 0) return { checked: 0, replied: 0 };

  let replied = 0;
  for (const contact of candidates) {
    try {
      const messageIds = await getThreadMessageIds(userId, contact.gmail_thread_id);
      if (hasReply(messageIds, contact.gmail_message_id)) {
        await supabase
          .from('excel_contacts')
          .update({ replied_at: new Date().toISOString() })
          .eq('id', contact.id)
          .eq('user_id', userId);
        replied++;
      }
    } catch (err) {
      if (err instanceof GmailReauthRequiredError) {
        // Same dead-connection case as the send path — every remaining
        // candidate would fail identically, so stop instead of burning
        // through the whole list against Google one contact at a time.
        return { checked: candidates.length, replied, reauthRequired: true };
      }
      console.warn(`Reply check failed for contact ${contact.id}:`, err);
    }
  }

  return { checked: candidates.length, replied };
}

export interface QueueSummary {
  totalContacts: number;
  notSent: number;
  queued: number;
  sent: number;
  replied: number;
  bounced: number;
  skipped: number;
  nextScheduledAt: string | null;
  replyRate: number;
}

export async function getQueueSummaryForUser(supabase: SupabaseClient, userId: string): Promise<QueueSummary> {
  // Paged — a plain .select() here is exactly what made "Total Contacts"
  // and the other counts flatten out at 1000 (PostgREST's default row cap
  // on unranged selects, applied silently with no error).
  const rows = await selectAllRows<{ status: string; replied_at: string | null; scheduled_at: string | null }>(
    (from, to) => supabase.from('excel_contacts').select('status, replied_at, scheduled_at').eq('user_id', userId).order('id').range(from, to),
  );

  const notSent = rows.filter(r => r.status === 'not_sent').length;
  const queued = rows.filter(r => r.status === 'queued' || r.status === 'sending').length;
  const sent = rows.filter(r => r.status === 'sent').length;
  const bounced = rows.filter(r => r.status === 'bounced' || r.status === 'failed').length;
  const skipped = rows.filter(r => r.status === 'skipped').length;
  const replied = rows.filter(r => r.replied_at).length;

  const upcoming = rows
    .filter(r => (r.status === 'queued') && r.scheduled_at)
    .map(r => r.scheduled_at as string)
    .sort();

  return {
    totalContacts: rows.length,
    notSent,
    queued,
    sent,
    replied,
    bounced,
    skipped,
    nextScheduledAt: upcoming[0] || null,
    replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
  };
}
