'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X, FileText, Brain, MessageSquare, Target,
  CheckCircle2, RefreshCw, Zap,
  Loader2, FileSignature, Rocket, Eye, Copy, Check,
} from 'lucide-react';
import { PendingJob, CoverLetter, ApplyResult } from './types';
import ResumePreviewPanel, { type ResumeUpdatePatch, type SectionKey } from '@/components/ResumePreviewPanel';
import { checkAutomationService, startAutomationRun, waitForAutomationRun, SERVICE_START_HINT } from '@/lib/automation-client';
import styles from './drawer.module.css';

// Auto Apply is built (local automation-service + browser-use pipeline) but
// held back until it's been tuned on real portals — flip to true to re-enable
// the button. Everything behind it (handleAutoApply, automation-client) is
// wired and stays intact.
const AUTO_APPLY_ENABLED = false;

type Tab = 'jd' | 'resume' | 'cover' | 'screening' | 'match';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'jd', label: 'Job Description', icon: FileText },
  { id: 'resume', label: 'AI Resume', icon: Brain },
  { id: 'cover', label: 'Cover Letter', icon: FileSignature },
  { id: 'screening', label: 'Screening', icon: MessageSquare },
  { id: 'match', label: 'Match Analysis', icon: Target },
];

const SCREENING_QS = [
  { q: 'Why do you want this role?', a: 'I am passionate about building scalable systems and this role aligns perfectly with my experience in distributed backend architecture and cloud deployment.' },
  { q: 'Notice period', a: '30 days' },
  { q: 'Expected salary', a: 'Negotiable, aligned with market standards for my experience level.' },
  { q: 'Years of experience', a: '3+ years in software engineering with focus on full stack development.' },
  { q: 'Work authorization', a: 'Yes, authorized to work in India. Open to relocation.' },
];

interface Props {
  job: PendingJob;
  onClose: () => void;
  onUpdate: (job: PendingJob) => void;
}

export default function JobDrawer({ job, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('jd');
  const [generatingCover, setGeneratingCover] = useState(false);
  const [autoApplying, setAutoApplying] = useState(false);
  const [copiedCover, setCopiedCover] = useState(false);

  // Keep a ref to always access the latest job (avoids stale closures)
  const jobRef = useRef(job);
  useEffect(() => { jobRef.current = job; }, [job]);

  const a = job.analysis;
  const r = job.resume;

  const handleResumeUpdate = (patch: ResumeUpdatePatch) => {
    onUpdate({
      ...jobRef.current,
      ...(patch.resume !== undefined ? { resume: patch.resume } : {}),
      ...(patch.pdfUrl !== undefined ? { pdfUrl: patch.pdfUrl } : {}),
      ...(patch.pdfBlob !== undefined ? { pdfBlob: patch.pdfBlob } : {}),
    });
  };

  const handleSectionApprovalsUpdate = (approvals: Record<SectionKey, PendingJob['sectionApprovals'][SectionKey]>) => {
    onUpdate({ ...jobRef.current, sectionApprovals: approvals });
  };

  const allApproved = job.sectionApprovals.experience === 'approved' && job.sectionApprovals.projects === 'approved' && job.sectionApprovals.skills === 'approved';

  const handleFinalApproval = () => {
    onUpdate({ ...job, status: 'approved' });
  };

  const handleGenerateCoverLetter = async () => {
    if (generatingCover || !a) return;
    setGeneratingCover(true);
    try {
      const res = await fetch('/api/ai/generate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobAnalysis: a, resumeLatex: r?.latex }),
      });
      if (res.ok) {
        const data = await res.json();
        const coverLetter: CoverLetter = { text: data.coverLetter, summary: data.summary, approved: false };
        onUpdate({ ...job, coverLetter });
      }
    } catch (e) {
      console.error('Cover letter generation failed:', e);
    } finally {
      setGeneratingCover(false);
    }
  };

  const handleApproveCoverLetter = () => {
    if (!job.coverLetter) return;
    onUpdate({ ...job, coverLetter: { ...job.coverLetter, approved: true } });
  };

  const handleCopyCoverLetter = () => {
    if (!job.coverLetter) return;
    navigator.clipboard.writeText(job.coverLetter.text);
    setCopiedCover(true);
    setTimeout(() => setCopiedCover(false), 2000);
  };

  const handleAutoApply = async () => {
    if (autoApplying || !job.pdfBlob) return;

    const jobUrl = job.jobText?.trim() || '';
    if (!/^https?:\/\//i.test(jobUrl)) {
      onUpdate({
        ...job,
        applyResult: { status: 'failed', message: 'Auto-apply needs the job posting URL. This job was added from pasted text — apply manually and use "Mark as Applied".', steps: [] },
      });
      return;
    }

    setAutoApplying(true);
    onUpdate({ ...job, status: 'applying' });

    try {
      // The automation runs in a local service (browser-use + Chrome) — the
      // deployed site's serverless functions can't launch a browser.
      const health = await checkAutomationService();
      if (!health.ok) throw new Error(SERVICE_START_HINT);
      if (!health.hasApiKey) throw new Error('The local automation service is running but has no Claude API key. Add CLAUDE_API_KEY to the project\'s .env.local and restart it.');

      // Load the signed-in user's saved profile to fill the application with.
      const profileRes = await fetch('/api/personal-details');
      const profileData = await profileRes.json();
      const profile: Record<string, unknown> = profileData?.details || {};
      if (!profile.automationEmail && profile.email) profile.automationEmail = profile.email;
      if (!profile.firstName) {
        throw new Error('Fill in your Personal Details (at least name and contact info) before auto-applying.');
      }

      const arrayBuffer = await job.pdfBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const pdfBase64 = btoa(binary);

      const runId = await startAutomationRun({
        jobUrl,
        profile,
        resumePdfBase64: pdfBase64,
        autoSubmit: true,
      });

      onUpdate({
        ...jobRef.current,
        applyResult: { status: 'partial', message: 'Automation running — a Chrome window has opened on your machine. Watch it work; step in only if it pauses.', steps: [] },
      });

      const finalRun = await waitForAutomationRun(runId, run => {
        onUpdate({
          ...jobRef.current,
          applyResult: {
            status: 'partial',
            message: `Automation ${run.status} — ${run.stepCount} steps so far...`,
            steps: run.steps.slice(-8),
          },
        });
      });

      const result: ApplyResult = finalRun.status === 'completed'
        ? { status: 'success', message: finalRun.result || 'Application submitted.', steps: finalRun.steps.slice(-10) }
        : finalRun.status === 'needs_human'
        ? { status: 'partial', message: `${finalRun.result || 'Needs your help'} — finish this step in the open Chrome window.`, steps: finalRun.steps.slice(-10) }
        : { status: 'failed', message: finalRun.error || finalRun.result || 'Automation failed.', steps: finalRun.steps.slice(-10) };

      const newStatus = result.status === 'success' ? 'applied' : result.status === 'partial' ? 'applying' : 'failed';
      onUpdate({ ...jobRef.current, applyResult: result, status: newStatus as any });

      // Save to Supabase applications table
      if (newStatus === 'applied') {
        try {
          await fetch('/api/applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company: job.analysis?.company || '',
              role: job.analysis?.role || '',
              job_url: job.jobText || '',
              status: 'applied',
              match_score: job.analysis?.matchScore || null,
              ats_score: job.resume?.atsScore || null,
              platform: 'job-link',
            }),
          });
        } catch { /* non-critical */ }
      }
    } catch (e: any) {
      onUpdate({
        ...jobRef.current,
        applyResult: { status: 'failed', message: e.message || 'Auto-apply failed', steps: [] },
        status: 'failed',
      });
    } finally {
      setAutoApplying(false);
    }
  };

  const handleManualApplied = useCallback(async () => {
    const current = jobRef.current;
    onUpdate({ ...current, status: 'applied' as any });

    // Save to Supabase applications table
    try {
      await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: current.analysis?.company || '',
          role: current.analysis?.role || '',
          job_url: current.jobText || '',
          status: 'applied',
          match_score: current.analysis?.matchScore || null,
          ats_score: current.resume?.atsScore || null,
          platform: 'job-link',
        }),
      });
    } catch { /* non-critical */ }

    onClose();
  }, [onUpdate, onClose]);

  const readyToApply = allApproved && job.pdfBlob && (job.coverLetter ? job.coverLetter.approved : true);

  const downloadFilename = (() => {
    const company = (a?.company || 'Company').replace(/[^a-zA-Z0-9]/g, '');
    const role = (a?.role || 'Role').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    return `${company}_${role}_KevinSudhan_Resume.pdf`;
  })();

  return (
    <motion.div className={styles.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className={styles.drawer} initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div>
            <h2>{a?.role || 'Processing...'}</h2>
            <p>{a?.company} · {a?.location}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
              <t.icon size={15} /><span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className={styles.drawerBody}>
          {/* JD Tab */}
          {tab === 'jd' && a && (
            <div className={styles.tabContent}>
              <div className={styles.section}><h4>Description</h4><p>{a.description}</p></div>
              <div className={styles.section}>
                <h4>Responsibilities</h4>
                <ul>{a.responsibilities.map((resp, i) => <li key={i}>{resp}</li>)}</ul>
              </div>
              <div className={styles.section}>
                <h4>Required Skills</h4>
                <div className={styles.skillTags}>{a.requiredSkills.map((s, i) => <span key={i} className={styles.tag}>{s}</span>)}</div>
              </div>
              {a.preferredSkills.length > 0 && (
                <div className={styles.section}>
                  <h4>Preferred Skills</h4>
                  <div className={styles.skillTags}>{a.preferredSkills.map((s, i) => <span key={i} className={styles.tagAlt}>{s}</span>)}</div>
                </div>
              )}
              <div className={styles.metaRow}>
                {a.salary && <span>Salary: {a.salary}</span>}
                <span>Location: {a.location}</span>
                <span>Level: {a.experience}</span>
              </div>
            </div>
          )}

          {/* Resume Tab with Section Approval */}
          {tab === 'resume' && r && (
            <div className={styles.tabContent}>
              <ResumePreviewPanel
                analysis={a}
                resume={r}
                pdfUrl={job.pdfUrl}
                pdfBlob={job.pdfBlob}
                sectionApprovals={job.sectionApprovals}
                onResumeUpdate={handleResumeUpdate}
                onSectionApprovalsUpdate={handleSectionApprovalsUpdate}
                downloadFilename={downloadFilename}
              />
            </div>
          )}

          {/* Screening Tab — maintenance */}
          {tab === 'screening' && (
            <div className={styles.tabContent}>
              <div className={styles.maintenanceBanner}>
                <span className={styles.maintenanceIcon}>🔧</span>
                <h4>Under Maintenance</h4>
                <p>Screening Q&amp;A is temporarily unavailable while we improve this feature.</p>
              </div>
            </div>
          )}

          {/* Cover Letter Tab */}
          {tab === 'cover' && (
            <div className={styles.tabContent}>
              {!job.coverLetter ? (
                <div className={styles.coverEmpty}>
                  <FileSignature size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
                  <h4>Generate Cover Letter</h4>
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginBottom: 16, textAlign: 'center' }}>AI will generate a tailored cover letter based on the job description and your resume.</p>
                  <button className={styles.primaryBtn} onClick={handleGenerateCoverLetter} disabled={generatingCover || !a}>
                    {generatingCover ? <><Loader2 size={14} className={styles.spin} /> Generating...</> : <><Zap size={14} /> Generate Cover Letter</>}
                  </button>
                </div>
              ) : (
                <div className={styles.coverContent}>
                  <div className={styles.coverHeader}>
                    <div>
                      <h4 style={{ margin: 0 }}>Cover Letter</h4>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{job.coverLetter.summary}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className={styles.actionBtnAlt} onClick={handleCopyCoverLetter}>
                        {copiedCover ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                      </button>
                      <button className={styles.actionBtnAlt} onClick={handleGenerateCoverLetter} disabled={generatingCover}>
                        {generatingCover ? <Loader2 size={13} className={styles.spin} /> : <RefreshCw size={13} />} Regenerate
                      </button>
                    </div>
                  </div>
                  <div className={styles.coverText}>
                    {job.coverLetter.text.split('\n\n').map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                  <div className={styles.coverActions}>
                    {!job.coverLetter.approved ? (
                      <button className={styles.primaryBtn} onClick={handleApproveCoverLetter}>
                        <CheckCircle2 size={14} /> Approve Cover Letter
                      </button>
                    ) : (
                      <div className={styles.approvedLabel}><CheckCircle2 size={14} /> Cover Letter Approved</div>
                    )}
                  </div>
                </div>
              )}

              {/* Auto-Apply Result */}
              {job.applyResult && (
                <div className={styles.applyResult}>
                  <h4 style={{ margin: '0 0 8px' }}>
                    {job.applyResult.status === 'success' ? 'Application Submitted' : job.applyResult.status === 'partial' ? 'Application In Progress' : 'Application Failed'}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>{job.applyResult.message}</p>
                  {job.applyResult.steps.length > 0 && (
                    <div className={styles.applySteps}>
                      {job.applyResult.steps.map((step, i) => (
                        <div key={i} className={styles.applyStep}>
                          <CheckCircle2 size={11} /> {step}
                        </div>
                      ))}
                    </div>
                  )}
                  {job.applyResult.screenshotUrl && (
                    <div className={styles.screenshotWrap}>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: '8px 0 4px' }}>Browser Screenshot (review form before manual submit):</p>
                      <img src={job.applyResult.screenshotUrl} alt="Application form" className={styles.screenshot} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Match Tab — maintenance */}
          {tab === 'match' && (
            <div className={styles.tabContent}>
              <div className={styles.maintenanceBanner}>
                <span className={styles.maintenanceIcon}>🔧</span>
                <h4>Under Maintenance</h4>
                <p>Match analysis is temporarily unavailable while we improve this feature.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={styles.drawerFooter}>
          {!allApproved ? (
            <button className={styles.primaryBtn} disabled>
              <CheckCircle2 size={16} /> Approve All Sections First
            </button>
          ) : job.status === 'approved' || readyToApply ? (
            <button
              className={styles.applyBtn}
              onClick={handleAutoApply}
              disabled={!AUTO_APPLY_ENABLED || autoApplying || job.status === 'applied'}
              title={AUTO_APPLY_ENABLED ? undefined : 'Auto Apply is temporarily disabled while we tune it — apply manually and use "Mark as Applied".'}
            >
              {autoApplying ? (
                <><Loader2 size={16} className={styles.spin} /> Auto-Applying...</>
              ) : job.status === 'applied' ? (
                <><CheckCircle2 size={16} /> Applied</>
              ) : AUTO_APPLY_ENABLED ? (
                <><Rocket size={16} /> Auto Apply Now</>
              ) : (
                <><Rocket size={16} /> Auto Apply (Coming Soon)</>
              )}
            </button>
          ) : (
            <button className={styles.primaryBtn} onClick={handleFinalApproval} disabled={!allApproved}>
              <CheckCircle2 size={16} /> Approve Resume
            </button>
          )}
          {job.status !== 'applied' && (
            <button className={styles.manualAppliedBtn} onClick={handleManualApplied}>
              <CheckCircle2 size={16} /> Mark as Applied
            </button>
          )}
          <button className={styles.ghostBtn} onClick={onClose}>Close</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
