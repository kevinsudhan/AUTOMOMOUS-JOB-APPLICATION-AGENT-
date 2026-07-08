/**
 * Apply via Excel: Supabase data-access helpers for companies/contacts.
 * Kept separate from the API routes so the route handlers stay thin and the
 * upsert/dedupe rules live in one place.
 *
 * Every function takes an explicit `supabase` client + `userId` rather than
 * resolving its own session, so the same functions work both from a
 * request-scoped route handler (cookie-based client, current user) and from
 * the cron-triggered send-queue worker (service-role admin client, explicit
 * user id, no session) — see lib/supabase/admin.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseAndGroupWorkbook, type ImportSummary } from '@/lib/excel-import';
import { computeCompanyStatus, type ContactStatus, type CompanyStatus } from '@/lib/send-queue';
import { selectAllRows } from '@/lib/supabase-pagination';

export interface CompanyListItem {
  id: string;
  name: string;
  status: CompanyStatus;
  contactCount: number;
  createdAt: string;
}

export interface ContactRow {
  id: string;
  companyId: string;
  name: string | null;
  email: string;
  emailType: string | null;
  domain: string | null;
  linkedin: string | null;
  notes: string | null;
  status: ContactStatus;
  applicationRunId: string | null;
  subject: string | null;
  body: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  error: string | null;
  repliedAt: string | null;
  replySnippet: string | null;
  createdAt: string;
}

export interface ResumeVersionRow {
  id: string;
  companyId: string;
  latex: string;
  sections: { experience: string; projects: string; skills: string } | null;
  changes: { experience: string[]; projects: string[]; skills: string[] } | null;
  atsScore: number | null;
  resumeScore: number | null;
  pdfBase64: string | null;
  createdAt: string;
}

export interface ApplicationRunRow {
  id: string;
  companyId: string;
  jobLinkOrJd: string | null;
  roleTitle: string | null;
  resumeVersionId: string | null;
  createdAt: string;
}

export interface CompanyWorkspace {
  company: { id: string; name: string; status: string; createdAt: string };
  contacts: ContactRow[];
  latestResume: ResumeVersionRow | null;
  runs: ApplicationRunRow[];
}

/**
 * Parse an uploaded workbook and upsert companies/contacts for this user.
 * Batched into a handful of round trips (one upsert for all companies, then
 * chunked upserts for all contacts) rather than one request per row — a
 * sequential per-row loop was slow enough on larger sheets to exceed the
 * hosting platform's serverless function timeout, which surfaces to the
 * browser as an HTML error page ("Unexpected token '<' ... not valid JSON")
 * even though the writes had already gone through by then.
 */
export async function importWorkbookForUser(
  supabase: SupabaseClient,
  userId: string,
  buffer: Buffer,
): Promise<ImportSummary> {
  const { companies, skipped } = parseAndGroupWorkbook(buffer);

  if (companies.length === 0) {
    return { companiesImported: 0, contactsImported: 0, rowsSkipped: skipped.length, skipped };
  }

  const { data: companyRows, error: companyErr } = await supabase
    .from('excel_companies')
    .upsert(
      companies.map(g => ({ user_id: userId, name: g.company })),
      { onConflict: 'user_id,name' },
    )
    .select('id, name');
  if (companyErr || !companyRows) {
    throw new Error(`Failed to import companies: ${companyErr?.message}`);
  }

  const companyIdByName = new Map(companyRows.map(c => [c.name, c.id as string]));

  // Only the descriptive fields are written on conflict — status/sent_at/
  // scheduled_at/gmail_* are intentionally omitted so a re-upload can't
  // reset in-flight progress or cause a double-send.
  const allContactRows = companies.flatMap(group => {
    const companyId = companyIdByName.get(group.company);
    if (!companyId) return [];
    return group.contacts.map(contact => ({
      company_id: companyId,
      user_id: userId,
      name: contact.name,
      email: contact.email,
      email_type: contact.emailType,
      domain: contact.domain,
      linkedin: contact.linkedin,
      notes: contact.notes,
      source_row: contact.sourceRow,
    }));
  });

  const CHUNK_SIZE = 500;
  let contactsImported = 0;
  for (let i = 0; i < allContactRows.length; i += CHUNK_SIZE) {
    const chunk = allContactRows.slice(i, i + CHUNK_SIZE);
    const { error: contactErr } = await supabase
      .from('excel_contacts')
      .upsert(chunk, { onConflict: 'company_id,email' });
    if (contactErr) {
      throw new Error(`Failed to import contacts: ${contactErr.message}`);
    }
    contactsImported += chunk.length;
  }

  return {
    companiesImported: companies.length,
    contactsImported,
    rowsSkipped: skipped.length,
    skipped,
  };
}

export async function listCompaniesForUser(supabase: SupabaseClient, userId: string): Promise<CompanyListItem[]> {
  // Every one of these can exceed PostgREST's default 1000-row cap for a
  // heavy user, so they're paged with selectAllRows rather than a plain
  // .select() — otherwise contact counts/status silently flatten past 1000.
  const [companies, contacts, resumes] = await Promise.all([
    selectAllRows<{ id: string; name: string; status: string; created_at: string }>(
      (from, to) => supabase.from('excel_companies').select('id, name, status, created_at').eq('user_id', userId).order('id').range(from, to),
    ),
    selectAllRows<{ company_id: string; status: string }>(
      (from, to) => supabase.from('excel_contacts').select('company_id, status').eq('user_id', userId).order('id').range(from, to),
    ),
    selectAllRows<{ company_id: string }>(
      (from, to) => supabase.from('excel_resume_versions').select('company_id').eq('user_id', userId).order('id').range(from, to),
    ),
  ]);

  const contactsByCompany = new Map<string, { status: ContactStatus }[]>();
  for (const c of contacts) {
    const list = contactsByCompany.get(c.company_id) || [];
    list.push({ status: c.status as ContactStatus });
    contactsByCompany.set(c.company_id, list);
  }
  const companiesWithResume = new Set(resumes.map(r => r.company_id));

  return companies
    .map(c => {
      const companyContacts = contactsByCompany.get(c.id) || [];
      const explicit = c.status === 'skipped' ? 'skipped' as const : null;
      return {
        id: c.id,
        name: c.name,
        status: computeCompanyStatus(companyContacts, companiesWithResume.has(c.id), explicit),
        contactCount: companyContacts.length,
        createdAt: c.created_at,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface ContactDbRow {
  id: string; company_id: string; name: string | null; email: string;
  email_type: string | null; domain: string | null; linkedin: string | null; notes: string | null;
  status: ContactStatus; application_run_id: string | null; subject: string | null; body: string | null;
  scheduled_at: string | null; sent_at: string | null; error: string | null;
  replied_at: string | null; reply_snippet: string | null; created_at: string;
}

interface ResumeVersionDbRow {
  id: string; company_id: string; latex: string;
  sections: { experience: string; projects: string; skills: string } | null;
  changes: { experience: string[]; projects: string[]; skills: string[] } | null;
  ats_score: number | null; resume_score: number | null; pdf_base64: string | null; created_at: string;
}

function mapContact(row: ContactDbRow): ContactRow {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    email: row.email,
    emailType: row.email_type,
    domain: row.domain,
    linkedin: row.linkedin,
    notes: row.notes,
    status: row.status,
    applicationRunId: row.application_run_id,
    subject: row.subject,
    body: row.body,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    error: row.error,
    repliedAt: row.replied_at,
    replySnippet: row.reply_snippet,
    createdAt: row.created_at,
  };
}

function mapResumeVersion(row: ResumeVersionDbRow): ResumeVersionRow {
  return {
    id: row.id,
    companyId: row.company_id,
    latex: row.latex,
    sections: row.sections,
    changes: row.changes,
    atsScore: row.ats_score,
    resumeScore: row.resume_score,
    pdfBase64: row.pdf_base64,
    createdAt: row.created_at,
  };
}

export async function getCompanyWorkspace(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<CompanyWorkspace | null> {
  const { data: company, error: companyErr } = await supabase
    .from('excel_companies')
    .select('id, name, status, created_at')
    .eq('user_id', userId)
    .eq('id', companyId)
    .single();
  if (companyErr || !company) return null;

  const [contacts, { data: resumes }, { data: runs }] = await Promise.all([
    selectAllRows<ContactDbRow>(
      (from, to) => supabase.from('excel_contacts').select('*').eq('user_id', userId).eq('company_id', companyId)
        .order('name', { ascending: true, nullsFirst: false }).order('id').range(from, to),
    ),
    supabase.from('excel_resume_versions').select('*').eq('user_id', userId).eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('excel_application_runs').select('*').eq('user_id', userId).eq('company_id', companyId).order('created_at', { ascending: false }),
  ]);

  return {
    company: { id: company.id, name: company.name, status: company.status, createdAt: company.created_at },
    contacts: contacts.map(mapContact),
    latestResume: resumes && resumes.length > 0 ? mapResumeVersion(resumes[0]) : null,
    runs: (runs || []).map(r => ({
      id: r.id,
      companyId: r.company_id,
      jobLinkOrJd: r.job_link_or_jd,
      roleTitle: r.role_title,
      resumeVersionId: r.resume_version_id,
      createdAt: r.created_at,
    })),
  };
}

export async function setCompanyStatus(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
  status: 'not_started' | 'skipped',
): Promise<void> {
  const { error } = await supabase
    .from('excel_companies')
    .update({ status })
    .eq('user_id', userId)
    .eq('id', companyId);
  if (error) throw new Error(error.message);
}
