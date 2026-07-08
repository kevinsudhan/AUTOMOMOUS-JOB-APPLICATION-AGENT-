/**
 * Apply via Excel: spreadsheet parsing + grouping logic.
 * Kept as pure, dependency-light functions (aside from the xlsx read step)
 * so the import/dedupe rules can be unit tested without a database or a
 * real .xlsx file on disk.
 */
import * as XLSX from 'xlsx';

export type SkipReason = 'missing_email' | 'invalid_email' | 'missing_company';

export interface SkippedRow {
  rowNumber: number; // 1-indexed, counting the header row as row 1
  reason: SkipReason;
  raw: Record<string, unknown>;
}

export interface ImportedContactRow {
  name: string | null;
  email: string;
  emailType: string | null;
  domain: string | null;
  linkedin: string | null;
  notes: string | null;
  sourceRow: Record<string, unknown>;
}

export interface GroupedCompany {
  company: string;
  contacts: ImportedContactRow[];
}

export interface GroupResult {
  companies: GroupedCompany[];
  skipped: SkippedRow[];
}

/** Lowercase, trim, and strip anything that isn't a letter/digit so header
 * variants like "Email Address", "email-address", "E-Mail" all collapse to
 * the same key. */
function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

const COLUMN_ALIASES: Record<string, string[]> = {
  company: ['company', 'companyname', 'employer', 'organization', 'org'],
  name: ['name', 'contactname', 'fullname', 'contact', 'person'],
  email: ['email', 'emailaddress', 'contactemail', 'mail'],
  emailType: ['emailtype', 'type', 'emailkind'],
  domain: ['domain', 'website', 'companydomain', 'url'],
  linkedin: ['linkedin', 'linkedinurl', 'linkedinprofile', 'li'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
};

/** Build a normalized-header -> canonical-field lookup once. */
function buildFieldLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) lookup.set(alias, field);
  }
  return lookup;
}

const FIELD_LOOKUP = buildFieldLookup();

/** Map an arbitrary-header spreadsheet row to canonical field names. Unknown
 * columns are silently dropped; known columns are matched case/spacing-insensitively. */
export function mapRowToCanonicalFields(row: Record<string, unknown>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [header, value] of Object.entries(row)) {
    const field = FIELD_LOOKUP.get(normalizeHeader(header));
    if (!field) continue;
    const str = value == null ? '' : String(value).trim();
    if (str) mapped[field] = str;
  }
  return mapped;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Group already-parsed spreadsheet rows (arbitrary-cased headers) by company.
 * Rows without a usable email are skipped (not thrown) with a reason so the
 * import can report "X companies, Y contacts, Z skipped" without aborting.
 */
export function groupRowsByCompany(rows: Record<string, unknown>[]): GroupResult {
  const skipped: SkippedRow[] = [];
  const order: string[] = [];
  const byCompany = new Map<string, ImportedContactRow[]>();

  rows.forEach((raw, i) => {
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing
    const row = mapRowToCanonicalFields(raw);

    const company = row.company?.trim();
    if (!company) {
      skipped.push({ rowNumber, reason: 'missing_company', raw });
      return;
    }

    const email = row.email?.trim();
    if (!email) {
      skipped.push({ rowNumber, reason: 'missing_email', raw });
      return;
    }
    if (!isValidEmail(email)) {
      skipped.push({ rowNumber, reason: 'invalid_email', raw });
      return;
    }

    const key = company.toLowerCase();
    if (!byCompany.has(key)) {
      byCompany.set(key, []);
      order.push(company);
    }

    // Dedupe within this same upload by (company, email) — keep the last
    // occurrence so a re-pasted row further down the sheet wins.
    const contacts = byCompany.get(key)!;
    const emailKey = email.toLowerCase();
    const existingIdx = contacts.findIndex(c => c.email.toLowerCase() === emailKey);
    const contact: ImportedContactRow = {
      name: row.name || null,
      email,
      emailType: row.emailType || null,
      domain: row.domain || null,
      linkedin: row.linkedin || null,
      notes: row.notes || null,
      sourceRow: raw,
    };
    if (existingIdx >= 0) {
      contacts[existingIdx] = contact;
    } else {
      contacts.push(contact);
    }
  });

  return {
    companies: order.map(company => ({ company, contacts: byCompany.get(company.toLowerCase())! })),
    skipped,
  };
}

/** Parse the first sheet of an uploaded .xlsx file into row objects. */
export function parseWorkbookBuffer(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

export interface ImportSummary {
  companiesImported: number;
  contactsImported: number;
  rowsSkipped: number;
  skipped: SkippedRow[];
}

/** Parse + group an uploaded workbook in one step. */
export function parseAndGroupWorkbook(buffer: Buffer): GroupResult {
  const rows = parseWorkbookBuffer(buffer);
  return groupRowsByCompany(rows);
}
