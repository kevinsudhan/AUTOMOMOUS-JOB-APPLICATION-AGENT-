'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FileText, Brain, MessageSquare, Target,
  CheckCircle2, XCircle, Download, RefreshCw,
  Send, Loader2, ChevronDown, ChevronUp, Zap, Shield,
  RotateCcw, FileSignature, Rocket, Eye, Copy, Check,
} from 'lucide-react';
import { PendingJob, TailoredResume, CoverLetter, ApplyResult } from './types';
import { latexToReadable } from '@/lib/latex-parser';
import styles from './drawer.module.css';

type Tab = 'jd' | 'resume' | 'cover' | 'screening' | 'match';
type SectionKey = 'experience' | 'projects' | 'skills';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'jd', label: 'Job Description', icon: FileText },
  { id: 'resume', label: 'AI Resume', icon: Brain },
  { id: 'cover', label: 'Cover Letter', icon: FileSignature },
  { id: 'screening', label: 'Screening', icon: MessageSquare },
  { id: 'match', label: 'Match Analysis', icon: Target },
];

const SECTION_LABELS: Record<SectionKey, string> = {
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Technical Skills',
};

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
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>(null);
  const [chatSection, setChatSection] = useState<SectionKey | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [recompiling, setRecompiling] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [autoApplying, setAutoApplying] = useState(false);
  const [copiedCover, setCopiedCover] = useState(false);

  // Keep a ref to always access the latest job (avoids stale closures)
  const jobRef = useRef(job);
  useEffect(() => { jobRef.current = job; }, [job]);

  const a = job.analysis;
  const r = job.resume;

  const getSectionContent = useCallback((sec: SectionKey): string[] => {
    if (!r?.sections?.[sec]) return [];
    return latexToReadable(r.sections[sec]);
  }, [r]);

  const toggleSection = (sec: SectionKey) => {
    setExpandedSection(prev => prev === sec ? null : sec);
  };

  const handleSectionApproval = (section: SectionKey, status: 'approved' | 'rejected') => {
    const updated = { ...job, sectionApprovals: { ...job.sectionApprovals, [section]: status } };
    onUpdate(updated);
    if (status === 'rejected') {
      setChatSection(section);
      setChatMessages([{ role: 'system', text: `What changes would you like for the ${SECTION_LABELS[section]} section?` }]);
    } else if (status === 'approved' && chatSection === section) {
      setChatSection(null);
      setChatMessages([]);
    }
  };

  const resetSectionApproval = (section: SectionKey) => {
    const updated = { ...job, sectionApprovals: { ...job.sectionApprovals, [section]: 'pending' as const } };
    onUpdate(updated);
    if (chatSection === section) {
      setChatSection(null);
      setChatMessages([]);
    }
  };

  const recompilePdf = useCallback(async (latex: string) => {
    setRecompiling(true);
    try {
      const compileRes = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: latex }),
      });
      if (compileRes.ok) {
        const ct = compileRes.headers.get('content-type') || '';
        if (ct.includes('application/pdf')) {
          const ab = await compileRes.arrayBuffer();
          const pdfBlob = new Blob([ab], { type: 'application/pdf' });
          const current = jobRef.current;
          if (current.pdfUrl) URL.revokeObjectURL(current.pdfUrl);
          const pdfUrl = URL.createObjectURL(pdfBlob);
          onUpdate({ ...current, pdfUrl, pdfBlob });
        }
      }
    } catch (e) {
      console.error('Recompile failed:', e);
    } finally {
      setRecompiling(false);
    }
  }, [onUpdate]);

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !chatSection || !r) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatLoading(true);

    try {
      // Read the LATEST job state from the ref to avoid stale closures
      const currentJob = jobRef.current;
      const currentResume = currentJob.resume;
      if (!currentResume) { setChatLoading(false); return; }

      const res = await fetch('/api/ai/revise-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: chatSection,
          sectionLatex: currentResume.sections[chatSection],
          fullLatex: currentResume.latex,
          feedback: msg,
          jobAnalysis: currentJob.analysis,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, { role: 'ai', text: data.changesSummary || 'Section revised. Please review the updated content.' }]);

        // Update the resume with revised content — re-read ref for latest state
        if (data.updatedLatex && data.updatedSections) {
          const latestJob = jobRef.current;
          const updatedResume: TailoredResume = {
            ...(latestJob.resume || currentResume),
            latex: data.updatedLatex,
            sections: data.updatedSections,
          };
          const updated: PendingJob = {
            ...latestJob,
            resume: updatedResume,
            sectionApprovals: { ...latestJob.sectionApprovals, [chatSection]: 'pending' as const },
          };
          onUpdate(updated);

          // Recompile PDF with updated LaTeX
          await recompilePdf(data.updatedLatex);
        }
      } else {
        setChatMessages(prev => [...prev, { role: 'ai', text: 'Failed to revise. Please try again.' }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Error connecting to AI. Please retry.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleRegenerate = async (mode: 'stronger' | 'conservative') => {
    if (regenerating || !a) return;
    setRegenerating(true);

    try {
      const res = await fetch('/api/ai/tailor-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobAnalysis: a, mode }),
      });

      if (res.ok) {
        const newResume: TailoredResume = await res.json();

        // Compile PDF
        let pdfUrl: string | null = null;
        let pdfBlob: Blob | null = null;
        try {
          const compileRes = await fetch('/api/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: newResume.latex }),
          });
          if (compileRes.ok) {
            const ct = compileRes.headers.get('content-type') || '';
            if (ct.includes('application/pdf')) {
              const ab = await compileRes.arrayBuffer();
              pdfBlob = new Blob([ab], { type: 'application/pdf' });
              if (job.pdfUrl) URL.revokeObjectURL(job.pdfUrl);
              pdfUrl = URL.createObjectURL(pdfBlob);
            }
          }
        } catch { /* PDF compilation optional */ }

        onUpdate({
          ...job,
          resume: newResume,
          pdfUrl,
          pdfBlob,
          sectionApprovals: { experience: 'pending', projects: 'pending', skills: 'pending' },
        });
      }
    } catch (e) {
      console.error('Regenerate failed:', e);
    } finally {
      setRegenerating(false);
    }
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
    setAutoApplying(true);
    onUpdate({ ...job, status: 'applying' });

    try {
      // Convert PDF blob to base64
      const arrayBuffer = await job.pdfBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const pdfBase64 = btoa(binary);

      const res = await fetch('/api/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobUrl: job.jobText,
          coverLetter: job.coverLetter?.text || '',
          pdfBase64,
          jobSkills: [
            ...(job.resume?.changes?.skills || []),
            ...(job.analysis?.requiredSkills || []),
          ].filter((s, i, a) => a.indexOf(s) === i),
          resumeSections: {
            experience: job.resume?.sections?.experience || '',
            projects: job.resume?.sections?.projects || '',
            skills: job.resume?.sections?.skills || '',
          },
          jobInfo: {
            company: job.analysis?.company || '',
            role: job.analysis?.role || '',
            location: job.analysis?.location || '',
          },
        }),
      });

      const result: ApplyResult = await res.json();
      const newStatus = result.status === 'success' ? 'applied' : result.status === 'partial' ? 'applying' : 'failed';
      onUpdate({ ...job, applyResult: result, status: newStatus as any });

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
        ...job,
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

  const handleDownload = async () => {
    if (!job.pdfBlob) return;
    const company = (a?.company || 'Company').replace(/[^a-zA-Z0-9]/g, '');
    const role = (a?.role || 'Role').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const name = `${company}_${role}_KevinSudhan_Resume.pdf`;
    if ('showSaveFilePicker' in window) {
      try {
        const h = await (window as any).showSaveFilePicker({ suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
        const w = await h.createWritable(); await w.write(job.pdfBlob); await w.close(); return;
      } catch (e: any) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(new File([job.pdfBlob], name, { type: 'application/pdf' }));
    const el = document.createElement('a'); el.href = url; el.download = name; el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
              <div className={styles.scoreRow}>
                <div className={styles.scoreCard}><span className={styles.scoreNum}>{r.atsScore}%</span><span>ATS Score</span></div>
                <div className={styles.scoreCard}><span className={styles.scoreNum}>{r.resumeScore}%</span><span>Resume Score</span></div>
                <div className={styles.scoreCard}><span className={styles.scoreNum}>{a?.matchScore}%</span><span>Match Score</span></div>
              </div>

              {/* PDF Preview */}
              {job.pdfUrl && (
                <div className={styles.pdfWrap}>
                  {recompiling && (
                    <div className={styles.pdfOverlay}>
                      <Loader2 size={24} className={styles.spin} />
                      <span>Recompiling PDF...</span>
                    </div>
                  )}
                  <iframe src={job.pdfUrl} className={styles.pdfFrame} title="Resume Preview" />
                </div>
              )}

              <div className={styles.resumeActions}>
                <button className={styles.actionBtn} onClick={handleDownload} disabled={!job.pdfBlob}>
                  <Download size={14} />Download PDF
                </button>
                <button className={styles.actionBtnAlt} onClick={() => handleRegenerate('stronger')} disabled={regenerating}>
                  {regenerating ? <Loader2 size={14} className={styles.spin} /> : <Zap size={14} />}
                  Stronger
                </button>
                <button className={styles.actionBtnAlt} onClick={() => handleRegenerate('conservative')} disabled={regenerating}>
                  {regenerating ? <Loader2 size={14} className={styles.spin} /> : <Shield size={14} />}
                  Conservative
                </button>
              </div>

              {/* Section-by-Section Approval */}
              <div className={styles.sectionApproval}>
                <h4>Section Approval</h4>
                <p className={styles.sectionHint}>Review each section below. Expand to see content, then approve or request changes.</p>

                {(['experience', 'projects', 'skills'] as const).map(sec => {
                  const content = getSectionContent(sec);
                  const isExpanded = expandedSection === sec;
                  const status = job.sectionApprovals[sec];

                  return (
                    <div key={sec} className={`${styles.sectionBlock} ${status === 'approved' ? styles.sectionApprovedBg : status === 'rejected' ? styles.sectionRejectedBg : ''}`}>
                      <div className={styles.approvalRow} onClick={() => toggleSection(sec)}>
                        <div className={styles.secNameRow}>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          <span className={styles.secName}>{SECTION_LABELS[sec]}</span>
                        </div>
                        <div className={styles.approvalBtns} onClick={e => e.stopPropagation()}>
                          {status === 'approved' ? (
                            <div className={styles.statusGroup}>
                              <span className={styles.approvedLabel}><CheckCircle2 size={14} /> Approved</span>
                              <button className={styles.resetBtn} onClick={() => resetSectionApproval(sec)} title="Reset"><RotateCcw size={12} /></button>
                            </div>
                          ) : status === 'rejected' ? (
                            <div className={styles.statusGroup}>
                              <span className={styles.rejectedLabel}><XCircle size={14} /> Needs Changes</span>
                              <button className={styles.resetBtn} onClick={() => resetSectionApproval(sec)} title="Reset"><RotateCcw size={12} /></button>
                            </div>
                          ) : (
                            <>
                              <button className={styles.appBtn} onClick={() => handleSectionApproval(sec, 'approved')} title="Approve"><CheckCircle2 size={13} /></button>
                              <button className={styles.rejBtn} onClick={() => handleSectionApproval(sec, 'rejected')} title="Request Changes"><XCircle size={13} /></button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded section content */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            className={styles.sectionContent}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            {content.length > 0 ? (
                              <div className={styles.bulletList}>
                                {content.map((line, i) => (
                                  <div key={i} className={styles.bulletLine} dangerouslySetInnerHTML={{
                                    __html: line
                                      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                                      .replace(/^• /, '<span class="' + styles.bullet + '">•</span> ')
                                  }} />
                                ))}
                              </div>
                            ) : (
                              <p className={styles.noContent}>Section content not available. Approve or regenerate the resume.</p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Chat for this specific rejected section */}
                      {chatSection === sec && status === 'rejected' && (
                        <div className={styles.chatBox}>
                          <div className={styles.chatMessages}>
                            {chatMessages.map((m, i) => (
                              <div key={i} className={`${styles.chatMsg} ${styles[`chat_${m.role}`]}`}>{m.text}</div>
                            ))}
                            {chatLoading && <div className={styles.chatMsg}><Loader2 size={14} className={styles.spin} /> Revising section...</div>}
                          </div>
                          <div className={styles.chatInputRow}>
                            <input className={styles.chatInput} placeholder={`Describe changes for ${SECTION_LABELS[sec]}...`} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChatSend()} disabled={chatLoading} />
                            <button className={styles.chatSend} onClick={handleChatSend} disabled={chatLoading || !chatInput.trim()}><Send size={14} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Changes Summary */}
              <div className={styles.section}>
                <h4>AI Changes Made</h4>
                <ul>{r.changes.experience.map((c, i) => <li key={`e${i}`}><CheckCircle2 size={12} /> {c}</li>)}</ul>
                <ul>{r.changes.projects.map((c, i) => <li key={`p${i}`}><CheckCircle2 size={12} /> {c}</li>)}</ul>
                <ul>{r.changes.skills.map((c, i) => <li key={`s${i}`}><CheckCircle2 size={12} /> {c}</li>)}</ul>
              </div>
            </div>
          )}

          {/* Screening Tab */}
          {tab === 'screening' && (
            <div className={styles.tabContent}>
              {SCREENING_QS.map((q, i) => (
                <div key={i} className={styles.qaCard}>
                  <label className={styles.qaLabel}>{q.q}</label>
                  <textarea className={styles.qaTextarea} defaultValue={q.a} rows={2} />
                </div>
              ))}
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

          {/* Match Tab */}
          {tab === 'match' && a && (
            <div className={styles.tabContent}>
              <div className={styles.matchCard}>
                <div className={styles.bigScore}>{a.matchScore}%</div>
                <p>Overall Match</p>
              </div>
              <div className={styles.section}><h4>Why AI Selected This Job</h4><p>{a.matchReason}</p></div>
              <div className={styles.section}>
                <h4>ATS Keywords Covered</h4>
                <div className={styles.skillTags}>{a.atsKeywords.map((k, i) => <span key={i} className={styles.tag}>{k}</span>)}</div>
              </div>
              <div className={styles.section}>
                <h4>Required Skills</h4>
                <div className={styles.skillTags}>{a.requiredSkills.map((s, i) => <span key={i} className={styles.tag}>{s}</span>)}</div>
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
            <button className={styles.applyBtn} onClick={handleAutoApply} disabled={autoApplying || job.status === 'applied'}>
              {autoApplying ? (
                <><Loader2 size={16} className={styles.spin} /> Auto-Applying...</>
              ) : job.status === 'applied' ? (
                <><CheckCircle2 size={16} /> Applied</>
              ) : (
                <><Rocket size={16} /> Auto Apply Now</>
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
