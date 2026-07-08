/**
 * Apply via Excel: send-queue scheduling.
 * Pure scheduling math — no DB/network access — so the rate-limiting rules
 * (daily cap + randomized jitter delay, rollover to the next day) can be
 * unit tested deterministically.
 */

export interface ScheduleOptions {
  /** Max sends per calendar day for this user (spec default: 30). */
  dailyCap: number;
  /** Minimum seconds between consecutive sends (spec default: 45). */
  minDelaySeconds: number;
  /** Maximum seconds between consecutive sends (spec default: 120). */
  maxDelaySeconds: number;
  /** Reference "now" — always pass explicitly so scheduling is deterministic in tests. */
  now: Date;
  /** How many sends this user has already completed on `now`'s calendar day. */
  alreadySentToday: number;
  /** scheduled_at of this user's other not-yet-sent queued contacts, so a
   * second "Send All" click continues the spacing instead of colliding. */
  alreadyQueuedTimes?: Date[];
  /** Injectable RNG in [0, 1) — defaults to Math.random. Tests pass a fixed sequence. */
  random?: () => number;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 9:00 AM local-to-server-clock the day after `d`. */
function nextDayAt9am(d: Date): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next;
}

/**
 * Compute send times for `count` new contacts, respecting the daily cap
 * (overflow rolls to 9am the following day) and a randomized jitter delay
 * between consecutive sends.
 */
export function scheduleSends(count: number, opts: ScheduleOptions): Date[] {
  const rand = opts.random ?? Math.random;
  const results: Date[] = [];

  let cursor = opts.now;
  const queuedTimes = opts.alreadyQueuedTimes ?? [];
  for (const t of queuedTimes) {
    if (t > cursor) cursor = t;
  }

  const countsByDay = new Map<string, number>();
  countsByDay.set(dayKey(opts.now), opts.alreadySentToday);
  for (const t of queuedTimes) {
    const k = dayKey(t);
    countsByDay.set(k, (countsByDay.get(k) ?? 0) + 1);
  }

  const hasPriorActivity = queuedTimes.length > 0;

  for (let i = 0; i < count; i++) {
    if (i > 0 || hasPriorActivity) {
      const jitter = opts.minDelaySeconds + rand() * (opts.maxDelaySeconds - opts.minDelaySeconds);
      cursor = new Date(cursor.getTime() + jitter * 1000);
    }

    let key = dayKey(cursor);
    let countForDay = countsByDay.get(key) ?? 0;
    while (countForDay >= opts.dailyCap) {
      cursor = nextDayAt9am(cursor);
      key = dayKey(cursor);
      countForDay = countsByDay.get(key) ?? 0;
    }

    countsByDay.set(key, countForDay + 1);
    results.push(cursor);
  }

  return results;
}

export type ContactStatus = 'not_sent' | 'queued' | 'sending' | 'sent' | 'bounced' | 'failed' | 'skipped';
export type CompanyStatus = 'not_started' | 'resume_ready' | 'in_progress' | 'completed' | 'skipped';

/**
 * Derive a company's overall status from its contacts + whether a resume
 * has been generated for it. Kept pure so the list-view rollup logic is
 * testable without a database round trip.
 */
export function computeCompanyStatus(
  contacts: { status: ContactStatus }[],
  hasResume: boolean,
  explicitStatus?: 'skipped' | null,
): CompanyStatus {
  if (explicitStatus === 'skipped') return 'skipped';
  if (contacts.length === 0) return hasResume ? 'resume_ready' : 'not_started';

  const relevant = contacts.filter(c => c.status !== 'skipped');
  if (relevant.length === 0) return 'skipped';

  const sentCount = relevant.filter(c => c.status === 'sent').length;
  if (sentCount === relevant.length) return 'completed';
  if (sentCount > 0 || relevant.some(c => c.status === 'queued' || c.status === 'sending' || c.status === 'bounced' || c.status === 'failed')) {
    return 'in_progress';
  }
  return hasResume ? 'resume_ready' : 'not_started';
}

/**
 * A thread has a reply once it contains any message that isn't the one we
 * sent. Kept pure (no Gmail API call here) so it's unit testable — the
 * network fetch lives in lib/gmail.ts's getThreadMessageIds.
 */
export function hasReply(threadMessageIds: string[], ourMessageId: string): boolean {
  return threadMessageIds.some(id => id !== ourMessageId);
}
