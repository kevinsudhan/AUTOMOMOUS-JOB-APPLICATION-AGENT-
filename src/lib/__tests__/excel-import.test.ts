import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  groupRowsByCompany,
  mapRowToCanonicalFields,
  isValidEmail,
  parseAndGroupWorkbook,
} from '../excel-import';

describe('isValidEmail', () => {
  it('accepts well-formed emails', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.domain.co')).toBe(true);
  });

  it('rejects malformed emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('@nodomain.com')).toBe(false);
  });
});

describe('mapRowToCanonicalFields', () => {
  it('is tolerant of header casing and naming variants', () => {
    const row = {
      'Company Name': 'Acme',
      'Contact Name': 'Jane Doe',
      'E-Mail': 'jane@acme.com',
      'Email Type': 'work',
      'Website': 'acme.com',
      'LinkedIn Profile': 'linkedin.com/in/jane',
      'Comments': 'met at conference',
    };
    expect(mapRowToCanonicalFields(row)).toEqual({
      company: 'Acme',
      name: 'Jane Doe',
      email: 'jane@acme.com',
      emailType: 'work',
      domain: 'acme.com',
      linkedin: 'linkedin.com/in/jane',
      notes: 'met at conference',
    });
  });

  it('ignores unrecognized columns and blank cells', () => {
    const row = { Company: 'Acme', Email: 'a@acme.com', 'Random Column': 'x', Notes: '' };
    const mapped = mapRowToCanonicalFields(row);
    expect(mapped.company).toBe('Acme');
    expect(mapped.email).toBe('a@acme.com');
    expect(mapped.notes).toBeUndefined();
    expect((mapped as any).randomcolumn).toBeUndefined();
  });
});

describe('groupRowsByCompany', () => {
  it('groups contacts under their company, allowing blank names', () => {
    const rows = [
      { Company: 'Acme', Name: 'Jane Doe', Email: 'jane@acme.com' },
      { Company: 'Acme', Name: '', Email: 'info@acme.com' },
      { Company: 'Globex', Name: 'John Roe', Email: 'john@globex.com' },
    ];
    const { companies, skipped } = groupRowsByCompany(rows);
    expect(skipped).toHaveLength(0);
    expect(companies).toHaveLength(2);
    expect(companies[0]).toEqual({
      company: 'Acme',
      contacts: [
        { name: 'Jane Doe', email: 'jane@acme.com', emailType: null, domain: null, linkedin: null, notes: null, sourceRow: rows[0] },
        { name: null, email: 'info@acme.com', emailType: null, domain: null, linkedin: null, notes: null, sourceRow: rows[1] },
      ],
    });
    expect(companies[1].company).toBe('Globex');
  });

  it('skips rows without a usable email but keeps processing the rest', () => {
    const rows = [
      { Company: 'Acme', Name: 'No Email' },
      { Company: 'Acme', Name: 'Bad Email', Email: 'not-an-email' },
      { Company: '', Name: 'No Company', Email: 'x@y.com' },
      { Company: 'Acme', Name: 'Good', Email: 'good@acme.com' },
    ];
    const { companies, skipped } = groupRowsByCompany(rows);
    expect(companies).toHaveLength(1);
    expect(companies[0].contacts).toHaveLength(1);
    expect(companies[0].contacts[0].email).toBe('good@acme.com');

    expect(skipped).toHaveLength(3);
    expect(skipped.map(s => s.reason)).toEqual(['missing_email', 'invalid_email', 'missing_company']);
    // Row numbers account for the header row (row 1) + 1-indexing.
    expect(skipped[0].rowNumber).toBe(2);
  });

  it('dedupes by (company, email) within a single upload, keeping the last row', () => {
    const rows = [
      { Company: 'Acme', Name: 'Old Name', Email: 'jane@ACME.com' },
      { Company: 'acme', Name: 'New Name', Email: 'jane@acme.com' },
    ];
    const { companies } = groupRowsByCompany(rows);
    expect(companies).toHaveLength(1);
    expect(companies[0].contacts).toHaveLength(1);
    expect(companies[0].contacts[0].name).toBe('New Name');
  });

  it('does not crash on malformed rows mixed with valid ones', () => {
    const rows: Record<string, unknown>[] = [
      {},
      { Company: 'Acme', Email: 'ok@acme.com' },
      { Company: 'Acme', Email: 123 as unknown as string },
    ];
    expect(() => groupRowsByCompany(rows)).not.toThrow();
    const { companies, skipped } = groupRowsByCompany(rows);
    expect(companies[0].contacts).toHaveLength(1);
    expect(skipped).toHaveLength(2);
  });
});

describe('parseAndGroupWorkbook (end-to-end with a real .xlsx buffer)', () => {
  it('parses a workbook built in-memory and groups it correctly', () => {
    const worksheet = XLSX.utils.json_to_sheet([
      { Company: 'Acme', Name: 'Jane Doe', Email: 'jane@acme.com', 'Email Type': 'work', Domain: 'acme.com', LinkedIn: 'li.com/jane', Notes: 'n/a' },
      { Company: 'Acme', Name: '', Email: 'info@acme.com' },
      { Company: 'Globex', Name: 'John Roe', Email: 'not-valid' },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const { companies, skipped } = parseAndGroupWorkbook(buffer);
    expect(companies).toHaveLength(1);
    expect(companies[0].company).toBe('Acme');
    expect(companies[0].contacts).toHaveLength(2);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('invalid_email');
  });
});
