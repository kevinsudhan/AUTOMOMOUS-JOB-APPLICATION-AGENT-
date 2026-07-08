'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wand2, Link2, Loader2, CheckCircle2, XCircle,
  Clock, TrendingUp, BarChart3, Zap, List, AlertTriangle,
  RotateCcw, Trash2, BriefcaseBusiness, Globe,
  Play, Square, ExternalLink, CircleDot,
} from 'lucide-react';
import { JobStatus, JobAnalysis, TailoredResume, PendingJob, PipelineStep } from './types';
import JobDrawer from './JobDrawer';
import { parseJsonResponse } from '@/lib/client-fetch';
import { compileWithAutoShrink } from '@/lib/client-compile';
import styles from './page.module.css';

const INITIAL_PIPELINE: PipelineStep[] = [
  { label: 'Extracting Job Description', status: 'waiting' },
  { label: 'Matching Skills', status: 'waiting' },
  { label: 'Building Tailored Resume', status: 'waiting' },
  { label: 'Compiling PDF', status: 'waiting' },
];

type AutomationTab = 'job-link' | 'linkedin' | 'naukri';

export default function ApplyPage() {
  const [activeTab, setActiveTab] = useState<AutomationTab>('job-link');
  const [jobLink, setJobLink] = useState('');
  const [jobs, setJobs] = useState<PendingJob[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStep[]>(INITIAL_PIPELINE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<PendingJob | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkLinks, setBulkLinks] = useState('');
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const pipelineRef = useRef(INITIAL_PIPELINE);

  // LinkedIn automation state
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [linkedinMaxJobs, setLinkedinMaxJobs] = useState(5);
  const [linkedinRunning, setLinkedinRunning] = useState(false);
  const [linkedinLogs, setLinkedinLogs] = useState<Array<{ type: string; message: string; time: string }>>([]);
  const [linkedinStats, setLinkedinStats] = useState({ applied: 0, skipped: 0, total: 0 });
  const linkedinAbortRef = useRef<AbortController | null>(null);

  const updatePipelineStep = (index: number, status: PipelineStep['status']) => {
    pipelineRef.current = pipelineRef.current.map((s, i) => i === index ? { ...s, status } : s);
    setPipeline([...pipelineRef.current]);
  };

  const processJob = useCallback(async (text: string) => {
    setIsProcessing(true);
    pipelineRef.current = INITIAL_PIPELINE.map(s => ({ ...s, status: 'waiting' }));
    setPipeline([...pipelineRef.current]);
    setPipelineError(null);

    const jobId = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    const newJob: PendingJob = {
      id: jobId, jobText: text, status: 'analyzing',
      analysis: null, resume: null, pdfUrl: null, pdfBlob: null,
      sectionApprovals: { experience: 'pending', projects: 'pending', skills: 'pending' },
      coverLetter: null, applyResult: null,
      createdAt: new Date().toISOString(),
    };
    setJobs(prev => [newJob, ...prev]);

    try {
      // Step 1: Analyze JD
      updatePipelineStep(0, 'active');
      const analyzeRes = await fetch('/api/ai/analyze-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobText: text }),
      });
      if (!analyzeRes.ok) {
        const err = await parseJsonResponse(analyzeRes).catch(e => ({ error: e.message }));
        throw new Error(err.error || 'Job analysis failed');
      }
      const analysis: JobAnalysis = await parseJsonResponse(analyzeRes);
      updatePipelineStep(0, 'done');

      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, analysis, status: 'tailoring' } : j));

      // Step 2: Match skills
      updatePipelineStep(1, 'active');
      await new Promise(r => setTimeout(r, 600));
      updatePipelineStep(1, 'done');

      // Step 3: Tailor resume
      updatePipelineStep(2, 'active');
      const tailorRes = await fetch('/api/ai/tailor-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobAnalysis: analysis }),
      });
      if (!tailorRes.ok) {
        const err = await parseJsonResponse(tailorRes).catch(e => ({ error: e.message }));
        throw new Error(err.error || 'Resume tailoring failed');
      }
      const resume: TailoredResume = await parseJsonResponse(tailorRes);
      updatePipelineStep(2, 'done');

      // Step 4: Compile PDF (auto-shrinking whichever section overflows past 1 page)
      updatePipelineStep(3, 'active');
      let pdfUrl: string | null = null;
      let pdfBlob: Blob | null = null;
      try {
        const compiled = await compileWithAutoShrink(resume.latex, resume.sections, analysis);
        pdfUrl = compiled.pdfUrl;
        pdfBlob = compiled.pdfBlob;
        resume.latex = compiled.latex;
        resume.sections = compiled.sections;
      } catch { /* PDF compilation optional */ }
      updatePipelineStep(3, 'done');

      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, resume, pdfUrl, pdfBlob, status: 'ready' } : j));
      setJobLink('');
    } catch (err: any) {
      const failedStep = pipelineRef.current.findIndex(s => s.status === 'active');
      if (failedStep >= 0) updatePipelineStep(failedStep, 'error');
      const errorMsg = err.message || 'Processing failed';
      setPipelineError(errorMsg);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed', error: errorMsg } : j));
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleAnalyze = useCallback(() => {
    if (!jobLink.trim() || isProcessing) return;
    processJob(jobLink.trim());
  }, [jobLink, isProcessing, processJob]);

  const handleBulkSubmit = useCallback(() => {
    const links = bulkLinks.split('\n').map(l => l.trim()).filter(l => l.length > 20);
    if (links.length === 0) return;
    setBulkLinks('');
    setShowBulk(false);
    // Process first link immediately, queue rest
    processJob(links[0]);
  }, [bulkLinks, processJob]);

  const handleRetry = useCallback((job: PendingJob) => {
    setJobs(prev => prev.filter(j => j.id !== job.id));
    processJob(job.jobText);
  }, [processJob]);

  const handleRemove = useCallback((jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
  }, []);

  const updateJob = useCallback((updatedJob: PendingJob) => {
    setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
    setSelectedJob(updatedJob);
  }, []);

  // ---- LinkedIn automation handlers ----
  const startLinkedinAutomation = useCallback(async () => {
    if (!linkedinUrl.trim() || linkedinRunning) return;
    setLinkedinRunning(true);
    setLinkedinLogs([]);
    setLinkedinStats({ applied: 0, skipped: 0, total: 0 });

    // Load profile from Supabase
    let profile: any = {};
    try {
      const pdRes = await fetch('/api/personal-details');
      if (pdRes.ok) {
        const { details } = await pdRes.json();
        if (details) profile = details;
      }
    } catch { /* use empty */ }

    const abortController = new AbortController();
    linkedinAbortRef.current = abortController;

    try {
      const res = await fetch('/api/linkedin-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedinUrl: linkedinUrl.trim(),
          maxJobs: linkedinMaxJobs,
          profile,
        }),
        signal: abortController.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const time = new Date().toLocaleTimeString();
            setLinkedinLogs(prev => [...prev, { type: data.type, message: data.message, time }]);

            if (data.type === 'applied') {
              setLinkedinStats(prev => ({ ...prev, applied: prev.applied + 1 }));
              // Save to Supabase
              try {
                fetch('/api/applications', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    company: data.company || '',
                    role: data.role || '',
                    job_url: data.jobUrl || linkedinUrl,
                    status: 'applied',
                    platform: 'linkedin',
                  }),
                });
              } catch { /* non-critical */ }
            } else if (data.type === 'skipped') {
              setLinkedinStats(prev => ({ ...prev, skipped: prev.skipped + 1 }));
            }
            if (data.totalJobs) {
              setLinkedinStats(prev => ({ ...prev, total: data.totalJobs }));
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setLinkedinLogs(prev => [...prev, { type: 'error', message: err.message || 'Connection failed', time: new Date().toLocaleTimeString() }]);
      }
    } finally {
      setLinkedinRunning(false);
      linkedinAbortRef.current = null;
    }
  }, [linkedinUrl, linkedinMaxJobs, linkedinRunning]);

  const stopLinkedinAutomation = useCallback(() => {
    linkedinAbortRef.current?.abort();
    setLinkedinRunning(false);
  }, []);

  const stats = {
    pending: jobs.filter(j => j.status === 'ready').length,
    approved: jobs.filter(j => j.status === 'approved').length,
    applied: jobs.filter(j => j.status === 'applied').length,
    rate: jobs.length > 0 ? Math.round((jobs.filter(j => j.status === 'applied').length / jobs.length) * 100) : 0,
  };

  const statusBadge = (s: JobStatus) => {
    const map: Record<JobStatus, { label: string; cls: string }> = {
      analyzing: { label: 'Analyzing', cls: styles.statusAnalyzing },
      tailoring: { label: 'Tailoring', cls: styles.statusTailoring },
      ready: { label: 'Ready', cls: styles.statusReady },
      approved: { label: 'Approved', cls: styles.statusApproved },
      applying: { label: 'Applying', cls: styles.statusTailoring },
      applied: { label: 'Applied', cls: styles.statusApplied },
      failed: { label: 'Failed', cls: styles.statusFailed },
    };
    return map[s];
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.heading}>AI Apply Center</h1>
            <p className={styles.subheading}>Choose an automation mode and let AI handle your applications.</p>
          </div>
        </div>
      </motion.div>

      {/* Automation Tabs */}
      <motion.div className={styles.tabBar} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.5 }}>
        {[
          { id: 'job-link' as AutomationTab, label: 'Job Link', icon: Link2, desc: 'Paste any job URL' },
          { id: 'linkedin' as AutomationTab, label: 'LinkedIn', icon: BriefcaseBusiness, desc: 'Auto-apply on LinkedIn' },
          { id: 'naukri' as AutomationTab, label: 'Naukri', icon: Globe, desc: 'Auto-apply on Naukri' },
        ].map(tab => (
          <button
            key={tab.id}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={18} />
            <div className={styles.tabBtnText}>
              <span className={styles.tabBtnLabel}>{tab.label}</span>
              <span className={styles.tabBtnDesc}>{tab.desc}</span>
            </div>
          </button>
        ))}
      </motion.div>

      {/* === Job Link Automation Tab === */}
      {activeTab === 'job-link' && (<>

      {/* Stats */}
      <motion.div className={styles.statsRow} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
        {[
          { icon: Clock, label: 'Pending', value: stats.pending, color: '#f59e0b' },
          { icon: CheckCircle2, label: 'Approved Today', value: stats.approved, color: '#10b981' },
          { icon: TrendingUp, label: 'Applied This Week', value: stats.applied, color: '#3b82f6' },
          { icon: BarChart3, label: 'Success Rate', value: `${stats.rate}%`, color: '#8b5cf6' },
        ].map((s, i) => (
          <div key={i} className={styles.statCard}>
            <s.icon size={18} style={{ color: s.color }} />
            <div className={styles.statInfo}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Job Link Input */}
      <motion.div className={styles.inputCard} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
        <div className={styles.inputRow}>
          <Link2 size={18} className={styles.inputIcon} />
          <input
            className={styles.jobInput}
            placeholder="Paste LinkedIn / Workday / Greenhouse / Lever / Company Careers URL or JD text..."
            value={jobLink}
            onChange={e => setJobLink(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
            disabled={isProcessing}
          />
          <button className={styles.bulkBtn} onClick={() => setShowBulk(!showBulk)} title="Bulk Add Links">
            <List size={16} />
          </button>
          <button className={styles.analyzeBtn} onClick={handleAnalyze} disabled={!jobLink.trim() || isProcessing}>
            {isProcessing ? <Loader2 size={16} className={styles.spin} /> : <Wand2 size={16} />}
            {isProcessing ? 'Processing...' : 'Analyze Job'}
          </button>
        </div>

        {/* Bulk Links Area */}
        <AnimatePresence>
          {showBulk && (
            <motion.div className={styles.bulkArea} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
              <textarea
                className={styles.bulkTextarea}
                placeholder="Paste multiple job links, one per line..."
                value={bulkLinks}
                onChange={e => setBulkLinks(e.target.value)}
                rows={4}
              />
              <div className={styles.bulkActions}>
                <span className={styles.bulkCount}>{bulkLinks.split('\n').filter(l => l.trim().length > 20).length} valid links</span>
                <button className={styles.analyzeBtn} onClick={handleBulkSubmit} disabled={isProcessing}>
                  <Wand2 size={14} />Process First
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pipeline Progress */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div className={styles.pipeline} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
              {pipeline.map((step, i) => (
                <div key={i} className={`${styles.pipelineStep} ${styles[`step_${step.status}`]}`}>
                  {step.status === 'active' && <Loader2 size={14} className={styles.spin} />}
                  {step.status === 'done' && <CheckCircle2 size={14} />}
                  {step.status === 'error' && <XCircle size={14} />}
                  {step.status === 'waiting' && <div className={styles.stepDot} />}
                  <span>{step.label}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pipeline Error */}
        <AnimatePresence>
          {pipelineError && !isProcessing && (
            <motion.div className={styles.pipelineError} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <AlertTriangle size={14} />
              <span>{pipelineError}</span>
              <button className={styles.dismissBtn} onClick={() => setPipelineError(null)}><XCircle size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Pending Jobs Table */}
      {jobs.length > 0 && (
        <motion.div className={styles.tableSection} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
          <h3 className={styles.sectionTitle}>Jobs Queue</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Company</th><th>Role</th><th>Match</th><th>ATS</th><th>Status</th><th>Date</th><th></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => {
                  const badge = statusBadge(job.status);
                  const isClickable = job.status !== 'analyzing' && job.status !== 'tailoring';
                  return (
                    <tr key={job.id} className={`${styles.row} ${!isClickable ? styles.rowDisabled : ''}`} onClick={() => isClickable && job.status !== 'failed' && setSelectedJob(job)}>
                      <td className={styles.company}>{job.analysis?.company || '—'}</td>
                      <td>{job.analysis?.role || 'Processing...'}</td>
                      <td><span className={styles.scoreBadge}>{job.analysis?.matchScore != null ? `${job.analysis.matchScore}%` : '—'}</span></td>
                      <td><span className={styles.scoreBadge}>{job.resume?.atsScore != null ? `${job.resume.atsScore}%` : '—'}</span></td>
                      <td><span className={`${styles.statusBadge} ${badge.cls}`}>{badge.label}</span></td>
                      <td className={styles.dateCol}>{new Date(job.createdAt).toLocaleDateString()}</td>
                      <td className={styles.actionsCol} onClick={e => e.stopPropagation()}>
                        {job.status === 'failed' && (
                          <button className={styles.retryBtn} onClick={() => handleRetry(job)} title="Retry"><RotateCcw size={13} /></button>
                        )}
                        <button className={styles.removeBtn} onClick={() => handleRemove(job.id)} title="Remove"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {jobs.length === 0 && !isProcessing && (
        <motion.div className={styles.emptyState} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <Zap size={40} />
          <h3>No jobs in queue</h3>
          <p>Paste a job link above to get started.</p>
        </motion.div>
      )}

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedJob && (
          <JobDrawer job={selectedJob} onClose={() => setSelectedJob(null)} onUpdate={updateJob} />
        )}
      </AnimatePresence>

      </>)}

      {/* === LinkedIn Automation Tab === */}
      {activeTab === 'linkedin' && (<>
        {/* LinkedIn Stats */}
        <motion.div className={styles.statsRow} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
          {[
            { icon: CircleDot, label: 'Total Jobs', value: linkedinStats.total, color: '#3b82f6' },
            { icon: CheckCircle2, label: 'Applied', value: linkedinStats.applied, color: '#10b981' },
            { icon: XCircle, label: 'Skipped', value: linkedinStats.skipped, color: '#f59e0b' },
            { icon: BarChart3, label: 'Success Rate', value: linkedinStats.total > 0 ? `${Math.round((linkedinStats.applied / linkedinStats.total) * 100)}%` : '—', color: '#8b5cf6' },
          ].map((s, i) => (
            <div key={i} className={styles.statCard}>
              <s.icon size={18} style={{ color: s.color }} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{s.value}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </div>
            </div>
          ))}
        </motion.div>

        {/* LinkedIn URL Input + Controls */}
        <motion.div className={styles.inputCard} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
          <div className={styles.inputRow}>
            <BriefcaseBusiness size={18} className={styles.inputIcon} />
            <input
              className={styles.jobInput}
              placeholder="Paste LinkedIn jobs search URL (e.g. linkedin.com/jobs/search/?keywords=...)"
              value={linkedinUrl}
              onChange={e => setLinkedinUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startLinkedinAutomation()}
              disabled={linkedinRunning}
            />
            <div className={styles.linkedinControls}>
              <label className={styles.maxJobsLabel}>
                Max
                <input
                  className={styles.maxJobsInput}
                  type="number"
                  min={1}
                  max={50}
                  value={linkedinMaxJobs}
                  onChange={e => setLinkedinMaxJobs(parseInt(e.target.value) || 5)}
                  disabled={linkedinRunning}
                />
              </label>
              {!linkedinRunning ? (
                <button className={styles.analyzeBtn} onClick={startLinkedinAutomation} disabled={!linkedinUrl.trim()}>
                  <Play size={16} />Start
                </button>
              ) : (
                <button className={`${styles.analyzeBtn} ${styles.stopBtn}`} onClick={stopLinkedinAutomation}>
                  <Square size={14} />Stop
                </button>
              )}
            </div>
          </div>

          {/* Instructions */}
          {!linkedinRunning && linkedinLogs.length === 0 && (
            <div className={styles.linkedinInstructions}>
              <p><strong>How it works:</strong></p>
              <ol>
                <li>Log into LinkedIn in your browser first</li>
                <li>Search for jobs with your desired filters</li>
                <li>Copy the URL and paste it above</li>
                <li>Set the number of jobs to apply to and click Start</li>
              </ol>
              <p className={styles.linkedinNote}>
                <AlertTriangle size={13} style={{ verticalAlign: -2 }} /> Make sure your details are filled in the{' '}
                <a href="/dashboard/personal-details" className={styles.linkedinLink}>Personal Details</a> page.
              </p>
            </div>
          )}
        </motion.div>

        {/* Live Log */}
        {linkedinLogs.length > 0 && (
          <motion.div className={styles.linkedinLogSection} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
            <div className={styles.sectionHeader} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className={styles.sectionTitle}>
                {linkedinRunning && <Loader2 size={14} className={styles.spin} style={{ marginRight: 6 }} />}
                Activity Log
              </h3>
              {!linkedinRunning && (
                <button className={styles.bulkBtn} onClick={() => setLinkedinLogs([])} title="Clear log" style={{ width: 32, height: 32 }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <div className={styles.linkedinLog}>
              {linkedinLogs.map((log, i) => (
                <div key={i} className={`${styles.logEntry} ${styles[`log_${log.type}`] || ''}`}>
                  <span className={styles.logTime}>{log.time}</span>
                  <span className={styles.logIcon}>
                    {log.type === 'applied' && <CheckCircle2 size={13} />}
                    {log.type === 'skipped' && <XCircle size={13} />}
                    {log.type === 'error' && <AlertTriangle size={13} />}
                    {log.type === 'tailoring' && <Wand2 size={13} />}
                    {log.type === 'applying' && <Loader2 size={13} className={styles.spin} />}
                    {log.type === 'job_found' && <CircleDot size={13} />}
                    {log.type === 'form_step' && <List size={13} />}
                    {log.type === 'done' && <CheckCircle2 size={13} />}
                  </span>
                  <span className={styles.logMsg}>{log.message}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </>)}

      {/* === Naukri Automation Tab === */}
      {activeTab === 'naukri' && (
        <motion.div className={styles.comingSoon} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className={styles.comingSoonIcon}>
            <Globe size={48} />
          </div>
          <h2 className={styles.comingSoonTitle}>Naukri Automation</h2>
          <p className={styles.comingSoonDesc}>
            Automate job applications on Naukri.com. Set your preferences, upload your profile, and let AI apply to matching positions.
          </p>
          <div className={styles.comingSoonBadge}>Coming Soon</div>
        </motion.div>
      )}
    </div>
  );
}
