'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Upload, Mail, MailCheck, Clock, Send, AlertTriangle, CheckCircle2,
  Inbox, Loader2, Building2, XCircle,
} from 'lucide-react';
import styles from './page.module.css';

interface CompanyListItem {
  id: string;
  name: string;
  status: 'not_started' | 'resume_ready' | 'in_progress' | 'completed' | 'skipped';
  contactCount: number;
  createdAt: string;
}

interface QueueSummary {
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

interface ImportSummary {
  companiesImported: number;
  contactsImported: number;
  rowsSkipped: number;
  skipped: { rowNumber: number; reason: string }[];
}

const STATUS_LABELS: Record<CompanyListItem['status'], string> = {
  not_started: 'Not Started',
  resume_ready: 'Resume Ready',
  in_progress: 'In Progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

export default function ApplyViaExcelPage() {
  return (
    <Suspense fallback={<div className={styles.page}><Loader2 size={28} className={styles.spin} /></div>}>
      <ApplyViaExcelContent />
    </Suspense>
  );
}

// useSearchParams() (used for the Gmail OAuth redirect feedback below)
// requires a Suspense boundary above it for Next.js's static prerendering —
// without the wrapper above, `next build` fails with "useSearchParams()
// should be wrapped in a suspense boundary".
function ApplyViaExcelContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [companiesRes, summaryRes, gmailRes] = await Promise.all([
        fetch('/api/excel/companies'),
        fetch('/api/excel/queue/summary'),
        fetch('/api/excel/gmail-status'),
      ]);
      if (companiesRes.ok) setCompanies((await companiesRes.json()).companies || []);
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (gmailRes.ok) setGmail(await gmailRes.json());
    } catch { /* ignore, keep last known state */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Gmail OAuth redirect feedback
  useEffect(() => {
    const gmailParam = searchParams.get('gmail');
    if (gmailParam === 'connected') fetchAll();
    if (gmailParam === 'error') setError('Failed to connect Gmail. Please try again.');
    if (gmailParam === 'not_configured') {
      setError('Gmail isn\'t set up yet: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing from .env.local. Set those up in Google Cloud Console first, then restart the dev server.');
    }
  }, [searchParams, fetchAll]);

  // Drive the rate-limited send queue + reply checker while this page is
  // open (see lib/excel-queue.ts; vercel.json cron covers the closed-tab case).
  useEffect(() => {
    const tick = async () => {
      try {
        const [processRes, repliesRes] = await Promise.all([
          fetch('/api/excel/queue/process', { method: 'POST' }),
          fetch('/api/excel/queue/check-replies', { method: 'POST' }),
        ]);
        const [processData, repliesData] = await Promise.all([processRes.json().catch(() => ({})), repliesRes.json().catch(() => ({}))]);
        if (processData.reauthRequired || repliesData.reauthRequired) {
          setError('Your Gmail connection expired or was revoked. Reconnect Gmail below — anything mid-send was left "Queued" and will resume automatically once you reconnect.');
        }
      } catch { /* best-effort */ }
      fetchAll();
    };
    const interval = setInterval(tick, 25000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setImportSummary(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/excel/import', { method: 'POST', body: form });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        // The hosting platform (not our code) returned a non-JSON error
        // page — most commonly a serverless function timeout on a large
        // sheet. The import itself may well have completed server-side
        // before the response timed out, so don't assume it failed outright.
        throw new Error('The server took too long to respond (likely a large file). Check the company list below before re-uploading — it may have gone through anyway.');
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed.');
      setImportSummary(data);
      fetchAll();
    } catch (err: any) {
      setError(err.message || 'Import failed.');
      fetchAll(); // reflect whatever actually landed, even after an error above
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const statCards = summary ? [
    { icon: Inbox, label: 'Total Contacts', value: summary.totalContacts },
    { icon: Clock, label: 'Not Sent', value: summary.notSent },
    { icon: Send, label: 'Queued', value: summary.queued },
    { icon: CheckCircle2, label: 'Sent', value: summary.sent },
    { icon: MailCheck, label: 'Replied', value: `${summary.replied} (${summary.replyRate}%)` },
    { icon: XCircle, label: 'Bounced', value: summary.bounced },
  ] : [];

  return (
    <div className={styles.page}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.heading}>Apply via Excel</h1>
            <p className={styles.subheading}>Import contacts, tailor a resume per company, and send personalized emails — tracked end to end.</p>
          </div>
          {gmail && (
            gmail.connected ? (
              <div className={`${styles.gmailStatus} ${styles.gmailConnected}`}>
                <MailCheck size={16} /> Gmail connected{gmail.email ? ` (${gmail.email})` : ''}
              </div>
            ) : (
              <button className={styles.gmailConnectBtn} onClick={() => { window.location.href = '/api/gmail/connect'; }}>
                <Mail size={16} /> Connect Gmail
              </button>
            )
          )}
        </div>
      </motion.div>

      {summary && (
        <motion.div className={styles.statsRow} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
          {statCards.map((s, i) => (
            <div key={i} className={styles.statCard}>
              <s.icon size={16} />
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          ))}
        </motion.div>
      )}
      {summary?.nextScheduledAt && (
        <div className={styles.nextSend}>
          <Clock size={14} /> Next scheduled send: {new Date(summary.nextScheduledAt).toLocaleString()}
        </div>
      )}

      <motion.div className={styles.uploadCard} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
        <Upload size={22} />
        <div className={styles.uploadInfo}>
          <h3>Import contacts from Excel</h3>
          <p>Columns: Company, Name, Email, Email Type, Domain, LinkedIn, Notes. Re-uploading updates contacts without resetting send progress.</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
        />
        <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={16} className={styles.spin} /> : <Upload size={16} />}
          {uploading ? 'Importing...' : 'Upload .xlsx'}
        </button>
      </motion.div>

      {error && (
        <div className={styles.errorBanner}><AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{error}</div>
      )}

      {importSummary && (
        <div className={styles.importSummary}>
          Imported <strong>{importSummary.companiesImported}</strong> companies, <strong>{importSummary.contactsImported}</strong> contacts.
          {importSummary.rowsSkipped > 0 && <> Skipped <strong>{importSummary.rowsSkipped}</strong> rows.</>}
          {importSummary.skipped.length > 0 && (
            <div className={styles.skippedList}>
              {importSummary.skipped.map((s, i) => (
                <div key={i}>Row {s.rowNumber}: {s.reason.replace(/_/g, ' ')}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <motion.div className={styles.tableSection} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
        <h3 className={styles.sectionTitle}>Companies</h3>
        {loading ? (
          <div className={styles.emptyState}><Loader2 size={28} className={styles.spin} /></div>
        ) : companies.length === 0 ? (
          <div className={styles.emptyState}>
            <Building2 size={36} />
            <h3>No companies yet</h3>
            <p>Upload a spreadsheet above to build your queue.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Company</th><th>Contacts</th><th>Status</th></tr>
              </thead>
              <tbody>
                {companies.map(c => (
                  <tr key={c.id} className={styles.row} onClick={() => router.push(`/dashboard/apply-via-excel/${c.id}`)}>
                    <td className={styles.companyName}>{c.name}</td>
                    <td>{c.contactCount}</td>
                    <td><span className={`${styles.statusBadge} ${styles[`status_${c.status}`]}`}>{STATUS_LABELS[c.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
