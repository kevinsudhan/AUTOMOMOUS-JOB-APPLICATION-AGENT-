'use client';

import { use, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Wand2, Loader2, Mail, Send, ChevronDown, ChevronUp,
  CheckCircle2, MailCheck, Sparkles, RotateCcw, Trash2,
} from 'lucide-react';
import ResumePreviewPanel from '@/components/ResumePreviewPanel';
import type { JobAnalysis, TailoredResume, SectionApprovalStatus } from '@/app/dashboard/apply/types';
import type { SectionKey } from '@/components/ResumePreviewPanel';
import styles from './workspace.module.css';

interface ContactRow {
  id: string;
  companyId: string;
  name: string | null;
  email: string;
  status: 'not_sent' | 'queued' | 'sending' | 'sent' | 'bounced' | 'failed' | 'skipped';
  subject: string | null;
  body: string | null;
  repliedAt: string | null;
  replySnippet: string | null;
  error: string | null;
}

interface ResumeVersion {
  id: string;
  latex: string;
  sections: { experience: string; projects: string; skills: string } | null;
  changes: { experience: string[]; projects: string[]; skills: string[] } | null;
  atsScore: number | null;
  resumeScore: number | null;
  pdfBase64: string | null;
}

interface ApplicationRun {
  id: string;
  roleTitle: string | null;
  jobLinkOrJd: string | null;
  createdAt: string;
}

interface Workspace {
  company: { id: string; name: string; status: string };
  contacts: ContactRow[];
  latestResume: ResumeVersion | null;
  runs: ApplicationRun[];
}

const DEFAULT_APPROVALS: Record<SectionKey, SectionApprovalStatus> = {
  experience: 'pending', projects: 'pending', skills: 'pending',
};

function base64ToBlob(base64: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function CompanyWorkspacePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = use(params);
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobLinkOrJd, setJobLinkOrJd] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [resume, setResume] = useState<TailoredResume | null>(null);
  const [resumeVersionId, setResumeVersionId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [sectionApprovals, setSectionApprovals] = useState(DEFAULT_APPROVALS);

  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [expandedContact, setExpandedContact] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [savingContact, setSavingContact] = useState<string | null>(null);
  const [sendingContact, setSendingContact] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState<Record<string, string>>({});
  const [revisingContact, setRevisingContact] = useState<string | null>(null);
  const [resettingContact, setResettingContact] = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
  const [deletingContact, setDeletingContact] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    const res = await fetch(`/api/excel/companies/${companyId}`);
    if (res.ok) {
      const data: Workspace = await res.json();
      setWorkspace(data);
      if (data.latestResume) {
        setResumeVersionId(data.latestResume.id);
        setResume({
          latex: data.latestResume.latex,
          sections: data.latestResume.sections || { experience: '', projects: '', skills: '' },
          changes: data.latestResume.changes || { experience: [], projects: [], skills: [] },
          atsScore: data.latestResume.atsScore ?? 0,
          resumeScore: data.latestResume.resumeScore ?? 0,
        });
        if (data.latestResume.pdfBase64) {
          const blob = base64ToBlob(data.latestResume.pdfBase64);
          setPdfBlob(blob);
          setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
        }
        if (data.runs[0]?.jobLinkOrJd) setJobLinkOrJd(data.runs[0].jobLinkOrJd);
      }
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchWorkspace(); }, [fetchWorkspace]);

  // Drive the send queue + reply checker while this workspace is open.
  useEffect(() => {
    const tick = async () => {
      try {
        const [processRes, repliesRes] = await Promise.all([
          fetch('/api/excel/queue/process', { method: 'POST' }),
          fetch('/api/excel/queue/check-replies', { method: 'POST' }),
        ]);
        const [processData, repliesData] = await Promise.all([processRes.json().catch(() => ({})), repliesRes.json().catch(() => ({}))]);
        if (processData.reauthRequired || repliesData.reauthRequired) {
          setDraftError('Your Gmail connection expired or was revoked. Go to Apply via Excel and reconnect Gmail — anything mid-send was left "Queued" and will resume automatically once you reconnect.');
        }
      } catch { /* best-effort */ }
      fetchWorkspace();
    };
    const interval = setInterval(tick, 25000);
    return () => clearInterval(interval);
  }, [fetchWorkspace]);

  const allApproved = sectionApprovals.experience === 'approved' && sectionApprovals.projects === 'approved' && sectionApprovals.skills === 'approved';

  const handleGenerateResume = async () => {
    if (!jobLinkOrJd.trim() || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/excel/companies/${companyId}/generate-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobLinkOrJd: jobLinkOrJd.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resume generation failed.');

      setAnalysis(data.analysis);
      setResume(data.resume);
      setResumeVersionId(data.resumeVersionId);
      setSectionApprovals({ experience: 'pending', projects: 'pending', skills: 'pending' });
      if (data.pdfBase64) {
        const blob = base64ToBlob(data.pdfBase64);
        setPdfBlob(blob);
        setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
      } else {
        setPdfBlob(null);
        setPdfUrl(null);
      }
      fetchWorkspace();
    } catch (err: any) {
      setGenError(err.message || 'Resume generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  // Persist any panel-driven change (regenerate / chat-revise / recompile)
  // back onto the saved resume version so a refresh doesn't lose it.
  const handleResumeUpdate = async (patch: { resume?: TailoredResume; pdfUrl?: string | null; pdfBlob?: Blob | null }) => {
    if (patch.resume !== undefined) setResume(patch.resume);
    if (patch.pdfUrl !== undefined) setPdfUrl(patch.pdfUrl);
    if (patch.pdfBlob !== undefined) setPdfBlob(patch.pdfBlob);

    if (!resumeVersionId) return;
    const body: Record<string, unknown> = {};
    if (patch.resume) {
      body.latex = patch.resume.latex;
      body.sections = patch.resume.sections;
      body.changes = patch.resume.changes;
      body.atsScore = patch.resume.atsScore;
      body.resumeScore = patch.resume.resumeScore;
    }
    if (patch.pdfBlob) body.pdfBase64 = await blobToBase64(patch.pdfBlob);
    if (Object.keys(body).length === 0) return;

    try {
      await fetch(`/api/excel/resume-versions/${resumeVersionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { /* non-critical, resume still usable this session */ }
  };

  const downloadFilename = useMemo(() => {
    const name = (workspace?.company.name || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
    return `${name}_Resume.pdf`;
  }, [workspace?.company.name]);

  const handleGenerateDrafts = async () => {
    setGeneratingDrafts(true);
    setDraftError(null);
    try {
      const res = await fetch(`/api/excel/companies/${companyId}/generate-drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Draft generation failed.');
      if (data.failed?.length) setDraftError(`${data.failed.length} draft(s) failed to generate.`);
      fetchWorkspace();
    } catch (err: any) {
      setDraftError(err.message || 'Draft generation failed.');
    } finally {
      setGeneratingDrafts(false);
    }
  };

  const toggleContact = (contact: ContactRow) => {
    setExpandedContact(prev => prev === contact.id ? null : contact.id);
    if (!draftEdits[contact.id]) {
      setDraftEdits(prev => ({ ...prev, [contact.id]: { subject: contact.subject || '', body: contact.body || '' } }));
    }
  };

  const handleSaveDraft = async (contactId: string) => {
    const edit = draftEdits[contactId];
    if (!edit) return;
    setSavingContact(contactId);
    try {
      await fetch(`/api/excel/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: edit.subject, body: edit.body }),
      });
      fetchWorkspace();
    } finally {
      setSavingContact(null);
    }
  };

  const handleReviseDraft = async (contactId: string) => {
    const feedback = revisionFeedback[contactId]?.trim();
    if (!feedback || revisingContact) return;
    setRevisingContact(contactId);
    setDraftError(null);
    try {
      const res = await fetch(`/api/excel/contacts/${contactId}/revise-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revise draft.');
      setDraftEdits(prev => ({ ...prev, [contactId]: { subject: data.subject, body: data.body } }));
      setRevisionFeedback(prev => ({ ...prev, [contactId]: '' }));
      fetchWorkspace();
    } catch (err: any) {
      setDraftError(err.message || 'Failed to revise draft.');
    } finally {
      setRevisingContact(null);
    }
  };

  const handleSendContact = async (contactId: string) => {
    setSendingContact(contactId);
    try {
      const res = await fetch(`/api/excel/contacts/${contactId}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchWorkspace();
    } catch (err: any) {
      setDraftError(err.message || 'Failed to enqueue send.');
    } finally {
      setSendingContact(null);
    }
  };

  const handleSendAll = async () => {
    setSendingAll(true);
    try {
      const res = await fetch(`/api/excel/companies/${companyId}/send-all`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchWorkspace();
    } catch (err: any) {
      setDraftError(err.message || 'Failed to enqueue sends.');
    } finally {
      setSendingAll(false);
    }
  };

  // Resets a contact back to "Not Sent" — clears the old send/error/reply
  // tracking so it can be drafted and sent again (e.g. after testing).
  const handleResetContact = async (contactId: string) => {
    setResettingContact(contactId);
    setDraftError(null);
    try {
      const res = await fetch(`/api/excel/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'not_sent' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchWorkspace();
    } catch (err: any) {
      setDraftError(err.message || 'Failed to reset contact.');
    } finally {
      setResettingContact(null);
    }
  };

  const handleResetAll = async () => {
    setResettingAll(true);
    setDraftError(null);
    try {
      const res = await fetch(`/api/excel/companies/${companyId}/reset-contacts`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchWorkspace();
    } catch (err: any) {
      setDraftError(err.message || 'Failed to reset contacts.');
    } finally {
      setResettingAll(false);
    }
  };

  const handleDeleteContact = async (contactId: string, label: string) => {
    if (!window.confirm(`Remove ${label} from this company? This can't be undone.`)) return;
    setDeletingContact(contactId);
    setDraftError(null);
    try {
      const res = await fetch(`/api/excel/contacts/${contactId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExpandedContact(prev => prev === contactId ? null : prev);
      fetchWorkspace();
    } catch (err: any) {
      setDraftError(err.message || 'Failed to remove contact.');
    } finally {
      setDeletingContact(null);
    }
  };

  if (loading) {
    return <div className={styles.page}><Loader2 size={28} className={styles.spin} /></div>;
  }
  if (!workspace) {
    return <div className={styles.page}>Company not found.</div>;
  }

  const readyContacts = workspace.contacts.filter(c => c.status === 'not_sent' && c.subject && c.body);
  const resettableContacts = workspace.contacts.filter(c => c.status !== 'not_sent' && c.status !== 'sending');

  return (
    <div className={styles.page}>
      <button className={styles.backLink} onClick={() => router.push('/dashboard/apply-via-excel')}>
        <ArrowLeft size={14} /> Back to companies
      </button>

      <div className={styles.headerRow}>
        <h1 className={styles.heading}>{workspace.company.name}</h1>
        <span className={styles.statusBadge}>{workspace.contacts.length} contacts</span>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Job Link or Description</h3>
        <textarea
          className={styles.jdTextarea}
          placeholder="Paste a job posting URL or the full job description text..."
          value={jobLinkOrJd}
          onChange={e => setJobLinkOrJd(e.target.value)}
        />
        <div className={styles.actionRow}>
          <button className={styles.primaryBtn} onClick={handleGenerateResume} disabled={!jobLinkOrJd.trim() || generating}>
            {generating ? <Loader2 size={15} className={styles.spin} /> : <Wand2 size={15} />}
            {generating ? 'Generating...' : resume ? 'Regenerate Tailored Resume' : 'Generate Tailored Resume'}
          </button>
        </div>
        {genError && <p className={styles.errorText}>{genError}</p>}
      </div>

      {resume && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Review Tailored Resume</h3>
          <ResumePreviewPanel
            analysis={analysis}
            resume={resume}
            pdfUrl={pdfUrl}
            pdfBlob={pdfBlob}
            sectionApprovals={sectionApprovals}
            onResumeUpdate={handleResumeUpdate}
            onSectionApprovalsUpdate={setSectionApprovals}
            downloadFilename={downloadFilename}
          />
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.headerRow}>
          <h3 className={styles.cardTitle}>Contacts ({workspace.contacts.length})</h3>
          <div className={styles.actionRow} style={{ marginTop: 0 }}>
            <button className={styles.secondaryBtn} onClick={handleGenerateDrafts} disabled={!resume || !allApproved || generatingDrafts}>
              {generatingDrafts ? <Loader2 size={14} className={styles.spin} /> : <Mail size={14} />}
              Generate Drafts
            </button>
            <button className={styles.primaryBtn} onClick={handleSendAll} disabled={readyContacts.length === 0 || sendingAll}>
              {sendingAll ? <Loader2 size={14} className={styles.spin} /> : <Send size={14} />}
              Send All ({readyContacts.length})
            </button>
            {resettableContacts.length > 0 && (
              <button className={styles.secondaryBtn} onClick={handleResetAll} disabled={resettingAll} title="Reset every sent/bounced/skipped contact back to Not Sent so they can be drafted and sent again">
                {resettingAll ? <Loader2 size={14} className={styles.spin} /> : <RotateCcw size={14} />}
                Reset All ({resettableContacts.length})
              </button>
            )}
          </div>
        </div>
        {!resume && <p className={styles.hint}>Generate and approve a tailored resume above before drafting emails.</p>}
        {resume && !allApproved && <p className={styles.hint}>Approve all resume sections above to unlock draft generation.</p>}
        {draftError && <p className={styles.errorText}>{draftError}</p>}

        {workspace.contacts.length === 0 ? (
          <div className={styles.emptyState}>No contacts imported for this company.</div>
        ) : (
          <div className={styles.contactList}>
            {workspace.contacts.map(contact => {
              const isExpanded = expandedContact === contact.id;
              const edit = draftEdits[contact.id] || { subject: contact.subject || '', body: contact.body || '' };
              return (
                <div key={contact.id} className={styles.contactRow}>
                  <div className={styles.contactHead} onClick={() => toggleContact(contact)}>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <div className={styles.contactMeta}>
                      <span className={styles.contactName}>{contact.name || '(no name)'}</span>
                      <span className={styles.contactEmail}>{contact.email}</span>
                    </div>
                    {contact.repliedAt && <span className={styles.repliedBadge}><MailCheck size={11} style={{ verticalAlign: -1 }} /> Replied</span>}
                    <span className={`${styles.contactBadge} ${styles[`cstatus_${contact.status}`]}`}>{contact.status.replace(/_/g, ' ')}</span>
                    {contact.status !== 'not_sent' && contact.status !== 'sending' && (
                      <button
                        className={styles.resetIconBtn}
                        onClick={e => { e.stopPropagation(); handleResetContact(contact.id); }}
                        disabled={resettingContact === contact.id}
                        title="Reset to Not Sent so this contact can be drafted and sent again"
                      >
                        {resettingContact === contact.id ? <Loader2 size={13} className={styles.spin} /> : <RotateCcw size={13} />}
                      </button>
                    )}
                    {contact.status !== 'sending' && (
                      <button
                        className={styles.resetIconBtn}
                        onClick={e => { e.stopPropagation(); handleDeleteContact(contact.id, contact.name || contact.email); }}
                        disabled={deletingContact === contact.id}
                        title="Remove this contact from the company"
                      >
                        {deletingContact === contact.id ? <Loader2 size={13} className={styles.spin} /> : <Trash2 size={13} />}
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className={styles.draftBody} onClick={e => e.stopPropagation()}>
                      {contact.error && <p className={styles.errorText}>{contact.error}</p>}
                      {contact.replySnippet && <p className={styles.replySnippet}>&ldquo;{contact.replySnippet}&rdquo;</p>}
                      <input
                        className={styles.draftInput}
                        placeholder="Subject"
                        value={edit.subject}
                        disabled={contact.status !== 'not_sent'}
                        onChange={e => setDraftEdits(prev => ({ ...prev, [contact.id]: { ...edit, subject: e.target.value } }))}
                      />
                      <textarea
                        className={styles.draftTextarea}
                        placeholder="Email body will appear here after generating drafts."
                        value={edit.body}
                        disabled={contact.status !== 'not_sent'}
                        onChange={e => setDraftEdits(prev => ({ ...prev, [contact.id]: { ...edit, body: e.target.value } }))}
                      />
                      {contact.status === 'not_sent' && edit.subject && edit.body && (
                        <div className={styles.reviseRow}>
                          <input
                            className={styles.draftInput}
                            placeholder='Revise with your own pointers — e.g. "make it shorter" or "mention my notice period is 2 weeks"'
                            value={revisionFeedback[contact.id] || ''}
                            onChange={e => setRevisionFeedback(prev => ({ ...prev, [contact.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && handleReviseDraft(contact.id)}
                          />
                          <button
                            className={styles.smallBtn}
                            onClick={() => handleReviseDraft(contact.id)}
                            disabled={revisingContact === contact.id || !(revisionFeedback[contact.id] || '').trim()}
                          >
                            {revisingContact === contact.id ? <Loader2 size={13} className={styles.spin} /> : <Sparkles size={13} />}
                            Revise with AI
                          </button>
                        </div>
                      )}
                      {contact.status === 'not_sent' && (
                        <div className={styles.draftActions}>
                          <button className={styles.smallBtn} onClick={() => handleSaveDraft(contact.id)} disabled={savingContact === contact.id}>
                            {savingContact === contact.id ? <Loader2 size={13} className={styles.spin} /> : <CheckCircle2 size={13} />}
                            Save
                          </button>
                          <button
                            className={styles.smallBtnPrimary}
                            onClick={() => handleSendContact(contact.id)}
                            disabled={sendingContact === contact.id || !edit.subject || !edit.body}
                          >
                            {sendingContact === contact.id ? <Loader2 size={13} className={styles.spin} /> : <Send size={13} />}
                            Send
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
