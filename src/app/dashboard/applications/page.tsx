'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ExternalLink,
  Calendar,
  Building2,
  Trash2,
  Inbox,
} from 'lucide-react';
import styles from './page.module.css';

type Status = 'applied' | 'interview' | 'offer' | 'rejected' | 'pending';

interface Application {
  id: string;
  company: string;
  role: string;
  job_url: string;
  status: Status;
  match_score: number | null;
  ats_score: number | null;
  platform: string;
  applied_at: string;
  notes: string;
}

const STATUS_LABELS: Record<Status, string> = {
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  pending: 'Pending',
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch('/api/applications');
      if (res.ok) {
        const { applications } = await res.json();
        setApps(applications || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const updateStatus = useCallback(async (id: string, status: Status) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    await fetch('/api/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
  }, []);

  const deleteApp = useCallback(async (id: string) => {
    setApps(prev => prev.filter(a => a.id !== id));
    await fetch(`/api/applications?id=${id}`, { method: 'DELETE' });
  }, []);

  const stats = {
    total: apps.length,
    interview: apps.filter((a) => a.status === 'interview').length,
    offer: apps.filter((a) => a.status === 'offer').length,
    rejected: apps.filter((a) => a.status === 'rejected').length,
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
          Loading applications...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className={styles.heading}>Job Applications</h1>
        <p className={styles.subheading}>
          Track every application you&apos;ve sent.
        </p>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        className={styles.statsBar}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
      >
        <div className={styles.stat}>
          <span className={styles.statValue}>{stats.total}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.statValue} ${styles.interviewColor}`}>{stats.interview}</span>
          <span className={styles.statLabel}>Interviews</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.statValue} ${styles.offerColor}`}>{stats.offer}</span>
          <span className={styles.statLabel}>Offers</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.statValue} ${styles.rejectedColor}`}>{stats.rejected}</span>
          <span className={styles.statLabel}>Rejected</span>
        </div>
      </motion.div>

      {/* Empty State */}
      {apps.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', color: 'var(--text-tertiary)', gap: 12, textAlign: 'center' }}
        >
          <Inbox size={48} strokeWidth={1.2} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>No applications yet</h3>
          <p style={{ fontSize: '0.88rem', maxWidth: 360, margin: 0 }}>
            Applications will appear here once you apply to jobs via the AI Apply Center or LinkedIn Automation.
          </p>
        </motion.div>
      )}

      {/* Table */}
      {apps.length > 0 && (
        <motion.div
          className={styles.tableWrap}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Platform</th>
                <th>Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className={styles.row}>
                  <td>
                    <div className={styles.company}>
                      <Building2 size={16} />
                      <span>{app.company || '—'}</span>
                    </div>
                  </td>
                  <td className={styles.role}>{app.role || '—'}</td>
                  <td>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                      {app.platform || 'job-link'}
                    </span>
                  </td>
                  <td>
                    <div className={styles.date}>
                      <Calendar size={13} />
                      {formatDate(app.applied_at)}
                    </div>
                  </td>
                  <td>
                    <select
                      className={`${styles.statusBadge} ${styles[app.status] || ''}`}
                      value={app.status}
                      onChange={e => updateStatus(app.id, e.target.value as Status)}
                      style={{ cursor: 'pointer', border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', padding: '4px 8px' }}
                    >
                      {Object.entries(STATUS_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {app.job_url && (
                        <a href={app.job_url} target="_blank" rel="noopener noreferrer" className={styles.viewBtn}>
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button className={styles.viewBtn} onClick={() => deleteApp(app.id)} title="Remove">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}
