'use client';

/**
 * Resume preview + section-approval + chat-revise panel.
 * Extracted out of dashboard/apply/JobDrawer.tsx's "AI Resume" tab so both
 * the main Apply flow (JobDrawer) and the Apply via Excel per-company
 * workspace render the exact same review UI instead of two implementations.
 * Calls the same, unmodified endpoints the main flow always has:
 * /api/ai/tailor-resume, /api/ai/revise-section, /api/compile.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Download, Send, Loader2, ChevronDown, ChevronUp, Zap, Shield,
  RotateCcw, CheckCircle2, XCircle,
} from 'lucide-react';
import { latexToReadable } from '@/lib/latex-parser';
import type { JobAnalysis, TailoredResume, SectionApprovalStatus } from '@/app/dashboard/apply/types';
import styles from './ResumePreviewPanel.module.css';

export type SectionKey = 'experience' | 'projects' | 'skills';

export const SECTION_LABELS: Record<SectionKey, string> = {
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Technical Skills',
};

export interface ResumeUpdatePatch {
  resume?: TailoredResume;
  pdfUrl?: string | null;
  pdfBlob?: Blob | null;
}

interface Props {
  analysis: JobAnalysis | null;
  resume: TailoredResume | null;
  pdfUrl: string | null;
  pdfBlob: Blob | null;
  sectionApprovals: Record<SectionKey, SectionApprovalStatus>;
  onResumeUpdate: (patch: ResumeUpdatePatch) => void;
  onSectionApprovalsUpdate: (approvals: Record<SectionKey, SectionApprovalStatus>) => void;
  downloadFilename?: string;
}

export default function ResumePreviewPanel({
  analysis, resume, pdfUrl, pdfBlob, sectionApprovals,
  onResumeUpdate, onSectionApprovalsUpdate, downloadFilename,
}: Props) {
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>(null);
  const [chatSection, setChatSection] = useState<SectionKey | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [recompiling, setRecompiling] = useState(false);

  // Avoid stale closures when chat/regenerate handlers fire after a prop update.
  const latest = useRef({ resume, pdfUrl, sectionApprovals });
  useEffect(() => { latest.current = { resume, pdfUrl, sectionApprovals }; }, [resume, pdfUrl, sectionApprovals]);

  const getSectionContent = useCallback((sec: SectionKey): string[] => {
    if (!resume?.sections?.[sec]) return [];
    return latexToReadable(resume.sections[sec]);
  }, [resume]);

  const toggleSection = (sec: SectionKey) => setExpandedSection(prev => prev === sec ? null : sec);

  const handleSectionApproval = (section: SectionKey, status: 'approved' | 'rejected') => {
    onSectionApprovalsUpdate({ ...sectionApprovals, [section]: status });
    if (status === 'rejected') {
      setChatSection(section);
      setChatMessages([{ role: 'system', text: `What changes would you like for the ${SECTION_LABELS[section]} section?` }]);
    } else if (status === 'approved' && chatSection === section) {
      setChatSection(null);
      setChatMessages([]);
    }
  };

  const resetSectionApproval = (section: SectionKey) => {
    onSectionApprovalsUpdate({ ...sectionApprovals, [section]: 'pending' });
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
          if (latest.current.pdfUrl) URL.revokeObjectURL(latest.current.pdfUrl);
          const pdfUrl = URL.createObjectURL(pdfBlob);
          onResumeUpdate({ pdfUrl, pdfBlob });
        }
      }
    } catch (e) {
      console.error('Recompile failed:', e);
    } finally {
      setRecompiling(false);
    }
  }, [onResumeUpdate]);

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !chatSection || !resume) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatLoading(true);

    try {
      const currentResume = latest.current.resume;
      if (!currentResume) { setChatLoading(false); return; }

      const res = await fetch('/api/ai/revise-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: chatSection,
          sectionLatex: currentResume.sections[chatSection],
          fullLatex: currentResume.latex,
          feedback: msg,
          jobAnalysis: analysis,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, { role: 'ai', text: data.changesSummary || 'Section revised. Please review the updated content.' }]);

        if (data.updatedLatex && data.updatedSections) {
          const updatedResume: TailoredResume = {
            ...(latest.current.resume || currentResume),
            latex: data.updatedLatex,
            sections: data.updatedSections,
          };
          onResumeUpdate({ resume: updatedResume });
          onSectionApprovalsUpdate({ ...latest.current.sectionApprovals, [chatSection]: 'pending' });
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
    if (regenerating || !analysis) return;
    setRegenerating(true);

    try {
      const res = await fetch('/api/ai/tailor-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobAnalysis: analysis, mode }),
      });

      if (res.ok) {
        const newResume: TailoredResume = await res.json();
        let newPdfUrl: string | null = null;
        let newPdfBlob: Blob | null = null;
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
              newPdfBlob = new Blob([ab], { type: 'application/pdf' });
              if (latest.current.pdfUrl) URL.revokeObjectURL(latest.current.pdfUrl);
              newPdfUrl = URL.createObjectURL(newPdfBlob);
            }
          }
        } catch { /* PDF compilation optional */ }

        onResumeUpdate({ resume: newResume, pdfUrl: newPdfUrl, pdfBlob: newPdfBlob });
        onSectionApprovalsUpdate({ experience: 'pending', projects: 'pending', skills: 'pending' });
      }
    } catch (e) {
      console.error('Regenerate failed:', e);
    } finally {
      setRegenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!pdfBlob) return;
    const name = downloadFilename || 'Tailored_Resume.pdf';
    const showSaveFilePicker = (window as Window & {
      showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
    }).showSaveFilePicker;
    if (showSaveFilePicker) {
      try {
        const h = await showSaveFilePicker({ suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
        const w = await h.createWritable(); await w.write(pdfBlob); await w.close(); return;
      } catch (e) { if (e instanceof Error && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(new File([pdfBlob], name, { type: 'application/pdf' }));
    const el = document.createElement('a'); el.href = url; el.download = name; el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!resume) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.scoreRow}>
        <div className={styles.scoreCard}><span className={styles.scoreNum}>{resume.atsScore}%</span><span>ATS Score</span></div>
        <div className={styles.scoreCard}><span className={styles.scoreNum}>{resume.resumeScore}%</span><span>Resume Score</span></div>
        {analysis && <div className={styles.scoreCard}><span className={styles.scoreNum}>{analysis.matchScore}%</span><span>Match Score</span></div>}
      </div>

      {pdfUrl ? (
        <div className={styles.pdfWrap}>
          {recompiling && (
            <div className={styles.pdfOverlay}>
              <Loader2 size={24} className={styles.spin} />
              <span>Recompiling PDF...</span>
            </div>
          )}
          <iframe src={pdfUrl} className={styles.pdfFrame} title="Resume Preview" />
        </div>
      ) : (
        <div className={styles.pdfEmpty}>PDF preview unavailable — compilation may have failed. Try regenerating.</div>
      )}

      <div className={styles.resumeActions}>
        <button className={styles.actionBtn} onClick={handleDownload} disabled={!pdfBlob}>
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

      <div className={styles.sectionApproval}>
        <h4>Section Approval</h4>
        <p className={styles.sectionHint}>Review each section below. Expand to see content, then approve or request changes.</p>

        {(['experience', 'projects', 'skills'] as const).map(sec => {
          const content = getSectionContent(sec);
          const isExpanded = expandedSection === sec;
          const status = sectionApprovals[sec];

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

      <div className={styles.section}>
        <h4>AI Changes Made</h4>
        <ul>{resume.changes.experience.map((c, i) => <li key={`e${i}`}><CheckCircle2 size={12} /> {c}</li>)}</ul>
        <ul>{resume.changes.projects.map((c, i) => <li key={`p${i}`}><CheckCircle2 size={12} /> {c}</li>)}</ul>
        <ul>{resume.changes.skills.map((c, i) => <li key={`s${i}`}><CheckCircle2 size={12} /> {c}</li>)}</ul>
      </div>
    </div>
  );
}
