import { describe, it, expect } from 'vitest';
import { plainTextToHtml } from '../gmail';

describe('plainTextToHtml', () => {
  it('wraps each blank-line-separated paragraph in its own <p> tag', () => {
    const text = 'First paragraph of prose.\n\nSecond paragraph of prose.';
    const html = plainTextToHtml(text);
    expect(html).toContain('<p style="margin:0 0 1em 0;">First paragraph of prose.</p>');
    expect(html).toContain('<p style="margin:0 0 1em 0;">Second paragraph of prose.</p>');
  });

  it('converts a single newline within a block (sign-off) into <br>, not a new paragraph', () => {
    const html = plainTextToHtml('Body paragraph.\n\nBest regards,\nJulian');
    expect(html).toContain('<p style="margin:0 0 1em 0;">Best regards,<br>Julian</p>');
  });

  it('converts the multi-line contact footer into <br>-separated lines within one paragraph', () => {
    const footer = 'Phone: +91 8939153390\nEmail: kevin@example.com\nGitHub: https://github.com/kevin';
    const html = plainTextToHtml(`Body paragraph.\n\n${footer}`);
    expect(html).toContain('Phone: +91 8939153390<br>Email: kevin@example.com<br>GitHub: https://github.com/kevin');
  });

  it('HTML-escapes special characters so they render as literal text, not markup', () => {
    const html = plainTextToHtml('Built with React & TypeScript, using <Widget> components and "quotes".');
    expect(html).toContain('Built with React &amp; TypeScript, using &lt;Widget&gt; components and &quot;quotes&quot;.');
    expect(html).not.toContain('<Widget>');
  });

  it('collapses 3+ consecutive blank lines into a single paragraph boundary', () => {
    const html = plainTextToHtml('One.\n\n\n\nTwo.');
    const paragraphCount = (html.match(/<p /g) || []).length;
    expect(paragraphCount).toBe(2);
  });

  it('is well-formed enough to contain exactly one <html> and <body> wrapper', () => {
    const html = plainTextToHtml('Hello.\n\nBye.');
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect((html.match(/<body/g) || []).length).toBe(1);
    expect((html.match(/<\/html>/g) || []).length).toBe(1);
  });
});
