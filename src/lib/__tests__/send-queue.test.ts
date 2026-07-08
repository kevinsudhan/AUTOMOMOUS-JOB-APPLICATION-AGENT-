import { describe, it, expect } from 'vitest';
import { scheduleSends, computeCompanyStatus, hasReply } from '../send-queue';

const BASE_OPTS = {
  dailyCap: 30,
  minDelaySeconds: 45,
  maxDelaySeconds: 120,
};

describe('scheduleSends', () => {
  it('schedules the first send immediately (no prior activity)', () => {
    const now = new Date('2026-07-06T10:00:00Z');
    const [first] = scheduleSends(1, { ...BASE_OPTS, now, alreadySentToday: 0, random: () => 0 });
    expect(first.getTime()).toBe(now.getTime());
  });

  it('spaces consecutive sends within [minDelay, maxDelay] jitter bounds', () => {
    const now = new Date('2026-07-06T10:00:00Z');
    // Deterministic RNG cycling through a few fixed values in [0, 1).
    const values = [0, 0.5, 1 - 1e-9, 0.25];
    let i = 0;
    const random = () => values[i++ % values.length];

    const times = scheduleSends(5, { ...BASE_OPTS, now, alreadySentToday: 0, random });
    for (let idx = 1; idx < times.length; idx++) {
      const gapSeconds = (times[idx].getTime() - times[idx - 1].getTime()) / 1000;
      expect(gapSeconds).toBeGreaterThanOrEqual(BASE_OPTS.minDelaySeconds);
      expect(gapSeconds).toBeLessThanOrEqual(BASE_OPTS.maxDelaySeconds);
    }
  });

  it('never schedules more than dailyCap sends on the same calendar day', () => {
    const now = new Date('2026-07-06T10:00:00Z');
    const times = scheduleSends(35, { ...BASE_OPTS, dailyCap: 30, now, alreadySentToday: 0, random: () => 0.5 });

    const perDay = new Map<string, number>();
    for (const t of times) {
      const key = t.toISOString().slice(0, 10);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    for (const count of perDay.values()) {
      expect(count).toBeLessThanOrEqual(30);
    }
    // 35 requested with a cap of 30 must roll at least 5 over to a later day.
    expect(perDay.size).toBeGreaterThan(1);
  });

  it('accounts for sends already completed today when applying the cap', () => {
    const now = new Date('2026-07-06T10:00:00Z');
    const times = scheduleSends(5, { ...BASE_OPTS, dailyCap: 3, now, alreadySentToday: 3, random: () => 0 });
    // Cap already reached for today -> every new send rolls to tomorrow 9am or later.
    for (const t of times) {
      expect(t.toISOString().slice(0, 10)).not.toBe('2026-07-06');
    }
  });

  it('continues spacing after already-queued sends instead of colliding with them', () => {
    const now = new Date('2026-07-06T10:00:00Z');
    const alreadyQueuedTimes = [new Date('2026-07-06T10:05:00Z')];
    const [first] = scheduleSends(1, { ...BASE_OPTS, now, alreadySentToday: 0, alreadyQueuedTimes, random: () => 0 });
    expect(first.getTime()).toBeGreaterThanOrEqual(alreadyQueuedTimes[0].getTime() + BASE_OPTS.minDelaySeconds * 1000);
  });

  it('rolls overflow to 9am the next day, not just +24h from the cap-hitting send', () => {
    const now = new Date('2026-07-06T23:50:00Z');
    const times = scheduleSends(2, { ...BASE_OPTS, dailyCap: 1, now, alreadySentToday: 0, random: () => 0 });
    expect(times[0].toISOString().slice(0, 10)).toBe('2026-07-06');
    expect(times[1].getHours()).toBe(9);
    expect(times[1].getTime()).toBeGreaterThan(times[0].getTime());
  });
});

describe('computeCompanyStatus', () => {
  it('is not_started with no contacts and no resume', () => {
    expect(computeCompanyStatus([], false)).toBe('not_started');
  });

  it('is resume_ready once a resume exists but nothing has been sent', () => {
    expect(computeCompanyStatus([{ status: 'not_sent' }, { status: 'not_sent' }], true)).toBe('resume_ready');
  });

  it('is in_progress when some but not all contacts are sent', () => {
    expect(computeCompanyStatus([{ status: 'sent' }, { status: 'not_sent' }], true)).toBe('in_progress');
  });

  it('is in_progress while sends are queued/bounced even before any succeed', () => {
    expect(computeCompanyStatus([{ status: 'queued' }, { status: 'not_sent' }], true)).toBe('in_progress');
    expect(computeCompanyStatus([{ status: 'bounced' }], true)).toBe('in_progress');
  });

  it('is completed once every non-skipped contact is sent', () => {
    expect(computeCompanyStatus([{ status: 'sent' }, { status: 'sent' }, { status: 'skipped' }], true)).toBe('completed');
  });

  it('respects an explicit skipped override', () => {
    expect(computeCompanyStatus([{ status: 'not_sent' }], true, 'skipped')).toBe('skipped');
  });

  it('is skipped when every contact has been individually skipped', () => {
    expect(computeCompanyStatus([{ status: 'skipped' }, { status: 'skipped' }], true)).toBe('skipped');
  });
});

describe('hasReply', () => {
  it('is false when the thread only contains our own sent message', () => {
    expect(hasReply(['our-msg-1'], 'our-msg-1')).toBe(false);
  });

  it('is true when the thread contains a message beyond our own', () => {
    expect(hasReply(['our-msg-1', 'reply-msg-2'], 'our-msg-1')).toBe(true);
  });

  it('is false for an empty thread (defensive — should not happen in practice)', () => {
    expect(hasReply([], 'our-msg-1')).toBe(false);
  });

  it('is true if our own message id is missing but others are present', () => {
    expect(hasReply(['someone-elses-msg'], 'our-msg-1')).toBe(true);
  });
});
