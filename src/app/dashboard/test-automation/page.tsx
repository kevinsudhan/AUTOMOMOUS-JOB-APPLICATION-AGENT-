'use client';

import { useState, useRef } from 'react';

interface Result {
  status: 'partial' | 'failed';
  message: string;
  steps: string[];
  loginEmail?: string;
  loginPassword?: string;
  jobUrl?: string;
}

export default function WorkdayTestPage() {
  const [jobUrl, setJobUrl]       = useState('');
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfName, setPdfName]     = useState<string | null>(null);
  const [running, setRunning]     = useState(false);
  const [result, setResult]       = useState<Result | null>(null);
  const [saved, setSaved]         = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleStart = async () => {
    if (!jobUrl.trim()) return;
    setRunning(true);
    setResult(null);
    setSaved(false);
    abortRef.current = new AbortController();
    try {
      const res  = await fetch('/api/workday-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobUrl: jobUrl.trim(), pdfBase64 }),
        signal: abortRef.current.signal,
      });
      const data: Result = await res.json();
      setResult(data);

      /* Auto-save to applications list on success */
      if (data.status === 'partial' && data.jobUrl) {
        try {
          const hostname = new URL(data.jobUrl).hostname.replace('www.', '');
          const company  = hostname.split('.')[0];
          await fetch('/api/applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company,
              role: 'Applied via Workday Automation',
              job_url: data.jobUrl,
              status: 'applied',
              platform: 'workday',
              notes: JSON.stringify({
                loginEmail: data.loginEmail,
                loginPassword: data.loginPassword,
              }),
            }),
          });
          setSaved(true);
        } catch { /* non-critical */ }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError')
        setResult({ status: 'failed', message: e.message || 'Request failed', steps: [] });
    } finally {
      setRunning(false);
    }
  };

  const handleStop = () => { abortRef.current?.abort(); setRunning(false); };

  const handlePdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfName(file.name);
    const reader = new FileReader();
    reader.onload = () => { const r = reader.result as string; setPdfBase64(r.split(',')[1] || r); };
    reader.readAsDataURL(file);
  };

  const stepColor = (s: string) =>
    s.startsWith('❌') ? '#ef4444' : s.startsWith('⚠') ? '#f59e0b' :
    s.startsWith('✅') || s.startsWith('🎉') ? '#22c55e' :
    s.startsWith('📋') || s.startsWith('🔄') || s.startsWith('📍') ? '#60a5fa' : '#9ca3af';

  return (
    <div style={{ maxWidth: 680, margin: '40px auto', padding: '0 24px', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ display: 'inline-block', background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Workday Test Page
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>Workday Automation</h1>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>
        Paste a Workday job URL and click Start. A browser window opens, signs in with your email &amp; password, and fills the application automatically.
      </p>

      {/* URL */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Workday Job URL *</label>
        <input type="url" placeholder="https://company.wd5.myworkday.com/..."
          value={jobUrl} onChange={e => setJobUrl(e.target.value)} disabled={running}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', background: running ? '#f9fafb' : '#fff' }}
        />
      </div>

      {/* PDF */}
      <div style={{ marginBottom: 22 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resume PDF (optional)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Choose PDF
            <input type="file" accept=".pdf" onChange={handlePdf} style={{ display: 'none' }} />
          </label>
          {pdfName
            ? <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 500 }}>✔ {pdfName}</span>
            : <span style={{ fontSize: 13, color: '#9ca3af' }}>None — will skip resume upload</span>}
          {pdfName && <button onClick={() => { setPdfBase64(null); setPdfName(null); }} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>}
        </div>
      </div>

      {/* Credentials info */}
      <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 22, fontSize: 13, color: '#166534' }}>
        🔐 Will use the email/name from your saved <strong>Personal Details</strong> — creates a Workday account if needed.
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <button onClick={handleStart} disabled={running || !jobUrl.trim()}
          style={{ padding: '11px 28px', borderRadius: 8, border: 'none', fontSize: 15, fontWeight: 700, cursor: running || !jobUrl.trim() ? 'not-allowed' : 'pointer', background: running || !jobUrl.trim() ? '#9ca3af' : '#2563eb', color: '#fff' }}>
          {running ? '⏳ Automation running...' : '▶ Start Automation'}
        </button>
        {running && (
          <button onClick={handleStop} style={{ padding: '11px 18px', borderRadius: 8, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Stop
          </button>
        )}
      </div>

      {/* Running notice */}
      {running && (
        <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 16, fontSize: 14, color: '#1d4ed8', lineHeight: 1.6 }}>
          <strong>⚡ Automation is running.</strong> A browser window has opened on your screen — switch to it to watch the form being filled. This page updates when done.
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ border: '1px solid', borderColor: result.status === 'failed' ? '#fca5a5' : '#86efac', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', background: result.status === 'failed' ? '#fef2f2' : '#f0fdf4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{result.status === 'failed' ? '❌' : '✅'}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: result.status === 'failed' ? '#991b1b' : '#166534' }}>
                  {result.status === 'failed' ? 'Automation Failed' : 'Automation Complete — Review & Submit in the browser'}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{result.message}</div>
              </div>
            </div>

            {/* Credentials used */}
            {result.loginEmail && (
              <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 7, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Credentials used for this application:</div>
                <div>📧 Email: <code style={{ background: '#e5e7eb', padding: '1px 5px', borderRadius: 3 }}>{result.loginEmail}</code></div>
                <div style={{ marginTop: 4 }}>🔑 Password: <code style={{ background: '#e5e7eb', padding: '1px 5px', borderRadius: 3 }}>{result.loginPassword}</code></div>
              </div>
            )}

            {saved && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#16a34a', fontWeight: 500 }}>
                ✅ Saved to <a href="/dashboard/applications" style={{ color: '#16a34a' }}>Applications list</a> with credentials.
              </div>
            )}
          </div>

          {result.steps.length > 0 && (
            <div style={{ padding: 16, background: '#0f172a', maxHeight: 360, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Step log ({result.steps.length})
              </div>
              {result.steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '3px 0', fontFamily: 'monospace', fontSize: 12, borderBottom: '1px solid #1e293b' }}>
                  <span style={{ color: '#475569', minWidth: 22, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ color: stepColor(s) }}>{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
