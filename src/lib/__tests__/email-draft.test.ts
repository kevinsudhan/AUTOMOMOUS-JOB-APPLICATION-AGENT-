import { describe, it, expect } from 'vitest';
import { guessNameFromEmail, sanitizeDraftBody, formatPhoneDisplay } from '../email-draft';

describe('guessNameFromEmail', () => {
  it('splits firstname.lastname style addresses into a title-cased name', () => {
    expect(guessNameFromEmail('jane.doe@acme.com')).toBe('Jane Doe');
    expect(guessNameFromEmail('John_Smith@acme.com')).toBe('John Smith');
    expect(guessNameFromEmail('mary-jones@acme.com')).toBe('Mary Jones');
  });

  it('strips trailing digits from name-like tokens', () => {
    expect(guessNameFromEmail('jane.doe123@acme.com')).toBe('Jane Doe');
  });

  it('guesses a single first name when there is no separator', () => {
    expect(guessNameFromEmail('sarah@acme.com')).toBe('Sarah');
  });

  it('returns null for role/team mailboxes rather than fabricating a name', () => {
    expect(guessNameFromEmail('info@acme.com')).toBeNull();
    expect(guessNameFromEmail('hr@acme.com')).toBeNull();
    expect(guessNameFromEmail('careers@acme.com')).toBeNull();
    expect(guessNameFromEmail('no-reply@acme.com')).toBeNull();
    expect(guessNameFromEmail('contact.us@acme.com')).toBeNull();
  });

  it('returns null for very short/ambiguous single tokens (likely initials)', () => {
    expect(guessNameFromEmail('jd@acme.com')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(guessNameFromEmail('')).toBeNull();
    expect(guessNameFromEmail('@acme.com')).toBeNull();
  });
});

describe('sanitizeDraftBody', () => {
  it('collapses a mid-paragraph hard wrap (every-line-a-fragment) back into one flowing line', () => {
    const wrapped = 'The focus on taking models from prototype to production caught my\nattention, that gap is where a lot of AI work\nquietly falls apart,\nand it is something I have been thinking about a lot\nlately.';
    const result = sanitizeDraftBody(wrapped);
    expect(result).toBe('The focus on taking models from prototype to production caught my attention, that gap is where a lot of AI work quietly falls apart, and it is something I have been thinking about a lot lately.');
  });

  it('preserves real paragraph breaks (blank line between paragraphs)', () => {
    const twoParagraphs = 'First paragraph here.\n\nSecond paragraph here.';
    expect(sanitizeDraftBody(twoParagraphs)).toBe('First paragraph here.\n\nSecond paragraph here.');
  });

  it('collapses a line break placed right after a comma or conjunction', () => {
    const wrapped = 'I built scalable systems,\nand I also worked on the frontend,\nbut backend is my focus.';
    expect(sanitizeDraftBody(wrapped)).toBe('I built scalable systems, and I also worked on the frontend, but backend is my focus.');
  });

  it('collapses more than one blank line between paragraphs down to exactly one', () => {
    const extraBlank = 'First paragraph.\n\n\n\nSecond paragraph.';
    expect(sanitizeDraftBody(extraBlank)).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('replaces em dashes and en dashes used as clause separators with a comma', () => {
    expect(sanitizeDraftBody('I liked the role — especially the ML focus.')).toBe('I liked the role, especially the ML focus.');
    expect(sanitizeDraftBody('Great fit – let me know.')).toBe('Great fit, let me know.');
  });

  it('replaces a spaced hyphen used as a dash substitute', () => {
    expect(sanitizeDraftBody('Happy to chat - whenever works.')).toBe('Happy to chat, whenever works.');
  });

  it('replaces a double hyphen used as a dash substitute', () => {
    expect(sanitizeDraftBody('Great fit--let me know.')).toBe('Great fit, let me know.');
    expect(sanitizeDraftBody('Great fit -- let me know.')).toBe('Great fit, let me know.');
  });

  it('leaves a hyphen inside a compound word alone', () => {
    expect(sanitizeDraftBody('I think I am well-suited for this.')).toBe('I think I am well-suited for this.');
  });

  it('preserves the two-line sign-off instead of merging it into one line', () => {
    const withSignoff = 'Body paragraph here.\n\nBest,\nJane';
    expect(sanitizeDraftBody(withSignoff)).toBe('Body paragraph here.\n\nBest,\nJane');
  });
});

describe('formatPhoneDisplay', () => {
  it('joins a normal country code and number', () => {
    expect(formatPhoneDisplay('+91', '8939153390')).toBe('+91 8939153390');
  });

  it('collapses a mis-saved record where phoneCountryCode already holds the full number', () => {
    expect(formatPhoneDisplay('+918939153390', '8939153390')).toBe('+918939153390');
  });

  it('uses the phone as-is if it already includes a country code', () => {
    expect(formatPhoneDisplay('+91', '+918939153390')).toBe('+918939153390');
  });

  it('falls back to whichever single field is present', () => {
    expect(formatPhoneDisplay(null, '8939153390')).toBe('8939153390');
    expect(formatPhoneDisplay('+91', null)).toBe('+91');
  });

  it('returns null when both are missing', () => {
    expect(formatPhoneDisplay(null, null)).toBeNull();
    expect(formatPhoneDisplay('', '')).toBeNull();
  });
});
