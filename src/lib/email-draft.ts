/**
 * Apply via Excel: per-contact cold-email draft generation.
 * Same fetch-to-Claude pattern as resume-tailor.ts / job-analyzer.ts — no
 * separate LLM client, just the Anthropic Messages API directly.
 */

export interface EmailDraftContact {
  name: string | null;
  email: string;
}

export interface ResumeHighlights {
  experience: string[];
  projects: string[];
  skills: string[];
}

/** Pulled from the candidate's saved Personal Details — never hardcoded or invented. */
export interface CandidateContactInfo {
  phone?: string | null;
  email?: string | null;
  github?: string | null;
  linkedin?: string | null;
  portfolio?: string | null;
}

export interface EmailDraftInput {
  contact: EmailDraftContact;
  companyName: string;
  roleTitle: string | null;
  jobSummary: string | null;
  resumeHighlights: ResumeHighlights;
  candidateName: string;
  contactInfo?: CandidateContactInfo;
}

export interface EmailDraft {
  subject: string;
  body: string;
}

/**
 * Personal Details stores phone as two fields (phoneCountryCode + phone),
 * but some saved records have the full number duplicated into
 * phoneCountryCode (e.g. "+918939153390" instead of just "+91") — naively
 * concatenating the two would print a garbled, duplicated number in the
 * email footer. This detects and collapses that case instead.
 */
export function formatPhoneDisplay(phoneCountryCode?: string | null, phone?: string | null): string | null {
  const code = (phoneCountryCode || '').trim();
  const num = (phone || '').trim();
  if (!code && !num) return null;
  if (!num) return code || null;
  if (num.startsWith('+')) return num;
  if (code && (num.startsWith(code) || code.includes(num))) return code || num;
  return code ? `${code} ${num}` : num;
}

// Rotated (not model-chosen) so consecutive drafts are structurally varied
// rather than relying on the model alone to avoid a mail-merge feel. Every
// variant still complies with the hard rule that sentence one names the role
// being applied for — they only vary the phrasing.
const OPENING_STYLES = [
  'State plainly and directly that you are applying for the role at the company, in your own words rather than a stock phrase.',
  'Lead with the role and company, phrased as if picking up mid-thought rather than a formal announcement.',
  'State that you are reaching out about the specific opening at the company, worded naturally.',
  'Name the role and company in a brief, matter-of-fact first sentence with no throat-clearing before it.',
  'Open with a short, natural sentence that states you are applying for the role at the company, phrased conversationally.',
];

function pickOpeningStyle(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % OPENING_STYLES.length;
  return OPENING_STYLES[idx];
}

// Role/team mailboxes we should never address by a guessed person's name —
// "Hi Info," or "Hi Careers," reads as broken, not personalized.
const GENERIC_LOCAL_PARTS = new Set([
  'info', 'contact', 'contactus', 'hello', 'hi', 'support', 'help', 'admin', 'administrator',
  'hr', 'humanresources', 'careers', 'jobs', 'recruiting', 'recruitment', 'talent', 'talentacquisition',
  'sales', 'marketing', 'team', 'office', 'mail', 'noreply', 'donotreply', 'enquiries', 'inquiries',
  'press', 'media', 'general', 'service', 'services', 'webmaster', 'postmaster', 'careers1',
]);

/**
 * Best-effort first-name (or first + last) guess from an email's local part,
 * for contacts imported without a name — e.g. "jane.doe@acme.com" -> "Jane Doe",
 * "sarah@acme.com" -> "Sarah". Returns null for role/team mailboxes (info@,
 * hr@, careers@, ...) and for anything too short/ambiguous to guess safely,
 * so we fall back to an anonymous greeting rather than a wrong name.
 */
export function guessNameFromEmail(email: string): string | null {
  const local = (email.split('@')[0] || '').trim().toLowerCase();
  if (!local) return null;

  if (GENERIC_LOCAL_PARTS.has(local.replace(/[^a-z]/g, ''))) return null;

  const parts = local
    .split(/[._\-+0-9]+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (parts.length === 0) return null;
  if (parts.length === 1 && parts[0].length < 3) return null;
  if (GENERIC_LOCAL_PARTS.has(parts.join(''))) return null;

  const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return parts.slice(0, 2).map(titleCase).join(' ');
}

const SYSTEM_PROMPT = `You are an AI assistant responsible for generating professional job application emails to employers, on behalf of a specific candidate. You are NOT writing a mail-merge template — every email must read as personally written for this exact company, role, and contact.

Always follow these rules:

1. Keep the email concise. The entire body (greeting through sign-off) must be between 80 and 140 words.
2. Use a professional, confident, and respectful tone.
3. Begin with a polite greeting.
4. In the opening sentence, clearly mention the role being applied for at the company. This must be the very first sentence, not buried later.
5. In one or two sentences, explain why the candidate is a strong fit by highlighting the most relevant fact(s) from RESUME HIGHLIGHTS below. Avoid generic statements like "I am a hard worker" — be specific to the facts given. Reference at most one or two highlights, not all of them.
6. NEVER mention the name/title of any project. The highlights given to you already describe only what was built or the problem solved, with no project name attached, so reference them exactly as given, describing the work, never a name.
7. Tailor every email to the specific company and role. Avoid generic templates, and reflect the job description wherever possible.
8. Do not invent qualifications, experience, projects, achievements, skills, technologies, or certifications. Only use information explicitly available in the provided resume highlights, job description, or supporting context.
9. Mention that the resume is attached along with all relevant professional links, IF at least one contact detail was provided to you as available (see CONTACT DETAILS AVAILABLE below). Do not print any actual phone number, email address, or URL yourself, they are appended automatically after your text as a contact footer. If no contact details are listed as available, only mention the attached resume.
10. Do not fabricate, guess, or hardcode any contact detail (phone, email, GitHub, portfolio, LinkedIn) yourself under any circumstance, even a placeholder. The real values, pulled from the candidate's Personal Details, are appended automatically after your text.
11. End with a polite expression of interest in discussing the opportunity, and thank the recipient for their time.
12. Include a professional closing followed by the candidate's first name only, on its own line (e.g. "Best regards,\\nJane").
13. Maintain clean spacing with short, readable paragraphs (2 short paragraphs of full sentences between the greeting and the closing) and consistent spacing throughout.
14. Do not use bullet points, numbered lists, emojis, excessive enthusiasm, or unnecessary adjectives.
15. Do not use hyphens, double hyphens, em dashes, or en dashes ("-", "--", "–", "—") anywhere in the subject or body. Use a comma or period instead, or split into two sentences.
16. Do not use filler phrases such as "I hope this email finds you well" or "I am writing to express my interest."
17. Avoid repeating information already implied by the resume, do not narrate that a resume is attached beyond the one required mention in rule 9, and do not pad the email restating the role/company more than once.
18. Use proper grammar, punctuation, and professional business email etiquette throughout.
19. The email should read as though it was written personally by the candidate, not generated by AI. It must feel personally written, not a template.
20. Return ONLY valid JSON, no markdown, no explanation, no notes, no code blocks, in this exact shape: {"subject": "...", "body": "..."}. The "body" value is the email body only, nothing else.

# FORMATTING REQUIREMENTS (apply to the "body" value)
- Never insert a manual line break within a paragraph. A paragraph must be output as one single continuous line of text, however long.
- Insert exactly one blank line between paragraphs (i.e. two "\\n" characters, no more, no less), and nowhere else.
- Do not wrap text at a fixed width. Do not break a line just because it is getting long.
- Do not insert a newline character anywhere except to separate paragraphs (and the one line break before the sign-off name).
- Do not add a line break right after a comma or a conjunction ("and", "but", "so", etc.) either, that is still a manual line break and is forbidden.
- The email client renders the wrapping. Your job is only to produce correct paragraph and blank-line structure, nothing else.
- The output must be plain text: no HTML tags, no markdown formatting, no asterisks, just clean paragraphs separated by a single blank line.

If the contact has no name, address them naturally without a name (e.g. "Hi there," or open directly with no greeting name) — do not invent one.`;

/**
 * Deterministic footer, not model-generated, so every value is exactly what
 * the candidate saved in Personal Details, never fabricated or hardcoded by
 * the model. Order matches the spec: Phone, Email, GitHub, Portfolio, LinkedIn.
 */
function buildContactFooter(info?: CandidateContactInfo): string {
  const lines: string[] = [];
  if (info?.phone) lines.push(`Phone: ${info.phone}`);
  if (info?.email) lines.push(`Email: ${info.email}`);
  if (info?.github) lines.push(`GitHub: ${info.github}`);
  if (info?.portfolio) lines.push(`Portfolio: ${info.portfolio}`);
  if (info?.linkedin) lines.push(`LinkedIn: ${info.linkedin}`);
  return lines.join('\n');
}

/** Removes a previously-appended contact footer so a revision pass only sees the message itself. */
function stripContactFooter(body: string): string {
  const label = '(?:Phone|Email|GitHub|Portfolio|LinkedIn)';
  return body.replace(new RegExp(`\\n\\n${label}:[^\\n]*(?:\\n${label}:[^\\n]*)*\\s*$`), '').trimEnd();
}

/**
 * Deterministic safety net for two things prompting alone doesn't reliably
 * prevent: models sometimes hard-wrap prose (breaking a line after a comma,
 * a conjunction, or just to hit a fixed column width, every word can end up
 * on its own line in the rendered email), and sometimes use an em/en dash as
 * a clause separator despite being told not to. This collapses *any*
 * mid-paragraph line break back into a space regardless of what precedes
 * it, so it isn't reliant on the model actually following that rule. Both
 * are fixed here in code rather than trusted to compliance.
 */
export function sanitizeDraftBody(text: string): string {
  const withoutDashes = text
    // A dash used as a clause separator becomes a comma; a bare hyphen
    // inside a word (e.g. "well-suited") is left alone.
    .replace(/\s*--\s*/g, ', ')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/ - /g, ', ')
    .replace(/,\s*,/g, ',');

  const blocks = withoutDashes.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);

  const normalized = blocks.map((block, i) => {
    const isLast = i === blocks.length - 1;
    // The sign-off ("Best,\nJane") is intentionally two short lines — leave
    // its internal break alone. Everything else gets any mid-paragraph hard
    // wrap collapsed back into one flowing line.
    if (isLast && block.length <= 40 && block.includes('\n')) {
      return block.replace(/[ \t]+/g, ' ');
    }
    return block.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ');
  });

  return normalized.join('\n\n');
}

/** Shared Claude call + JSON parse for both fresh drafts and revisions. */
async function callClaudeForDraft(system: string, userMessage: string): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('Claude API key not configured.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Claude email-draft error:', errText);
    throw new Error('AI email draft generation failed.');
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse generated email draft.');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.subject || !parsed.body) {
    throw new Error('Generated email draft is missing a subject or body.');
  }
  return {
    subject: parsed.subject.replace(/\s*--\s*/g, ', ').replace(/\s*[–—]\s*/g, ', ').replace(/ - /g, ', '),
    body: sanitizeDraftBody(parsed.body),
  };
}

export async function generateEmailDraft(input: EmailDraftInput): Promise<EmailDraft> {
  const openingStyle = pickOpeningStyle(input.contact.email + input.companyName);
  const contactName = input.contact.name || guessNameFromEmail(input.contact.email);

  // Deliberately joined as plain sentences (not a bulleted/dashed list) so
  // there's no list formatting for the model to copy verbatim into the email.
  const highlightLines = [
    ...input.resumeHighlights.experience,
    ...input.resumeHighlights.projects,
    ...input.resumeHighlights.skills,
  ].map(h => h.replace(/^[-*•]\s*/, '').trim()).filter(Boolean).join('. ')
    || '(no specific highlights provided — keep the email general and role-focused)';

  const userMessage = `CANDIDATE NAME: ${input.candidateName}
COMPANY: ${input.companyName}
ROLE: ${input.roleTitle || '(not specified — refer to it generically as "a role" or "an opening" at the company)'}
JOB SUMMARY: ${input.jobSummary || '(not provided)'}
CONTACT NAME: ${contactName || '(unknown — no name available)'}
CONTACT EMAIL: ${input.contact.email}

RESUME HIGHLIGHTS (already stripped of any project name — describe the work, never name it):
${highlightLines}

CONTACT DETAILS AVAILABLE: ${[
    input.contactInfo?.phone && 'phone',
    input.contactInfo?.email && 'email',
    input.contactInfo?.github && 'GitHub',
    input.contactInfo?.portfolio && 'portfolio',
    input.contactInfo?.linkedin && 'LinkedIn',
  ].filter(Boolean).join(', ') || '(none provided)'}
Per rules 9-10: mention that the resume is attached along with relevant professional links, only if at least one item above is available. Do NOT print any actual phone number, email address, or URL yourself, the real values are appended automatically after your text as a contact footer. If none are listed above, only mention the attached resume.

OPENING STYLE FOR THIS EMAIL (sentence 1 must still name the role at the company): ${openingStyle}

Write the subject + body now. Return only the JSON object.`;

  const parsed = await callClaudeForDraft(SYSTEM_PROMPT, userMessage);
  const footer = buildContactFooter(input.contactInfo);
  const body = footer ? `${parsed.body}\n\n${footer}` : parsed.body;

  return { subject: parsed.subject, body };
}

export interface EmailDraftRevisionInput {
  currentSubject: string;
  currentBody: string;
  /** The user's own pointers for how to change the draft, e.g. "make it shorter" or "mention my notice period is 2 weeks". */
  feedback: string;
  candidateName: string;
  contactInfo?: CandidateContactInfo;
}

const REVISION_SYSTEM_PROMPT = `You revise an existing professional job-application email based on the candidate's own instructions. You are NOT writing from scratch — apply the requested changes to the existing draft while keeping everything else about it intact unless the instructions imply otherwise. The original draft already follows this spec; preserve that unless the feedback says otherwise:

1. The entire body (greeting through sign-off) must stay between 80 and 140 words, unless the feedback explicitly asks for more or less detail.
2. Professional, confident, respectful tone.
3. Keep the polite greeting.
4. The opening sentence must still clearly name the role being applied for at the company.
5. Only reference facts already in the current draft or explicitly stated in the candidate's feedback below. Never invent experience, metrics, projects, or claims beyond that.
6. Never introduce a project name if one wasn't already there. Describe work, never name it.
7. Do not fabricate qualifications, experience, or technologies not present in the current draft or the feedback.
8. Keep the one mention of the resume being attached (and professional links, if the current draft already mentions them) intact unless the feedback asks to change it. Never print an actual phone number, email address, or URL yourself, a contact footer is appended automatically after your text.
9. Keep the polite closing interest + thanks.
10. Keep the professional sign off with just the candidate's first name, on its own line.
11. Clean spacing: 2 short paragraphs of full sentences, separated by a single blank line.
12. No bullet points, numbered lists, emojis, excessive enthusiasm, or unnecessary adjectives.
13. Do not use hyphens, double hyphens, em dashes, or en dashes ("-", "--", "–", "—") anywhere. Use a comma or period instead, or split into two sentences.
14. No filler phrases such as "I hope this email finds you well."
15. Do not pad by repeating information already stated.
16. Keep it feeling personally written for this company and contact.
17. Proper grammar and punctuation throughout.
18. Return ONLY valid JSON, no markdown, no explanation: {"subject": "...", "body": "..."}. The "body" value is the email body only.

# FORMATTING REQUIREMENTS (apply to the "body" value)
- Never insert a manual line break within a paragraph, even if the current draft already has one, fix it. A paragraph is one single continuous line of text, however long.
- Insert exactly one blank line between paragraphs, and nowhere else. Do not wrap at a fixed width, and never break a line right after a comma or conjunction.
- Plain text only: no HTML tags, no markdown, no asterisks.`;

/** Revises an existing draft using the user's own free-text pointers (e.g. "shorten it", "mention I'm open to relocating"). */
export async function reviseEmailDraft(input: EmailDraftRevisionInput): Promise<EmailDraft> {
  const currentBodyWithoutFooter = stripContactFooter(input.currentBody);

  const userMessage = `CANDIDATE NAME: ${input.candidateName}

CURRENT SUBJECT: ${input.currentSubject}

CURRENT BODY:
${currentBodyWithoutFooter}

CANDIDATE'S REVISION INSTRUCTIONS (apply these):
${input.feedback}

Rewrite the subject + body applying the instructions above. Return only the JSON object.`;

  const parsed = await callClaudeForDraft(REVISION_SYSTEM_PROMPT, userMessage);
  const footer = buildContactFooter(input.contactInfo);
  const body = footer ? `${parsed.body}\n\n${footer}` : parsed.body;

  return { subject: parsed.subject, body };
}
