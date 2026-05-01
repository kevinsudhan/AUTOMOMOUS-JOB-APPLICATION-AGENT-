'use client';

import { useState } from 'react';

/* ================================================================
   TEST AUTOMATION PAGE
   Hardcoded job URL, skills, and dummy resume/cover letter so we
   can test the auto-apply Playwright automation without calling
   the AI APIs (analyze, tailor, generate-cover-letter).
   DELETE this page once automation is confirmed working.
   ================================================================ */

const TEST_JOB_URL = 'https://www.accenture.com/in-en/careers/jobdetails?id=ATCI-5231445-S1942258_en&title=Custom+Software+Engineer';

const TEST_SKILLS = [
  'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js',
  'SQL', 'FastAPI', 'REST APIs', 'Git', 'AWS',
  'Docker', 'Tailwind CSS', 'Next.js', 'MongoDB',
  'PostgreSQL', 'Machine Learning', 'Deep Learning',
  'Computer Vision', 'NLP', 'Pandas', 'NumPy',
];

const TEST_COVER_LETTER = `Dear Hiring Manager,

I am writing to express my strong interest in the Custom Software Engineer position at Accenture. As a recent B.E. graduate in Electronics and Communication Engineering from Loyola ICAM College of Engineering and Technology (Anna University), I bring a solid foundation in software development and a passion for building impactful solutions.

During my academic career, I have developed proficiency in Python, JavaScript, TypeScript, React, and Node.js. I have hands-on experience with REST APIs, SQL databases, and cloud services like AWS. My projects demonstrate my ability to design and implement full-stack applications, work with machine learning models, and deliver production-quality code.

I am particularly excited about Accenture's commitment to innovation and its work with cutting-edge technologies. I am confident that my technical skills, combined with my eagerness to learn and collaborate, make me a strong candidate for this role.

I am authorized to work in India and available to start immediately. I look forward to the opportunity to contribute to Accenture's success.

Sincerely,
Kevin Sudhan`;

const TEST_RESUME_SECTIONS = {
  experience: `\\resumeSubheading{Software Developer Intern}{Jun 2024 -- Aug 2024}{XYZ Technologies}{Chennai, India}
\\resumeItemListStart
\\resumeItem{Developed RESTful APIs using FastAPI and Python, improving response times by 40\\%}
\\resumeItem{Built responsive front-end components with React and Tailwind CSS}
\\resumeItem{Implemented CI/CD pipelines using Docker and AWS EC2}
\\resumeItemListEnd`,
  projects: `\\resumeSubheading{AI Resume Tailor}{2024}{Next.js, TypeScript, Claude API}{}
\\resumeItemListStart
\\resumeItem{Built a full-stack application that analyzes job descriptions and tailors resumes using AI}
\\resumeItem{Integrated Playwright for browser automation of job applications}
\\resumeItemListEnd

\\resumeSubheading{Smart Attendance System}{2024}{Python, OpenCV, Deep Learning}{}
\\resumeItemListStart
\\resumeItem{Developed a face recognition attendance system using deep learning models}
\\resumeItem{Achieved 98\\% accuracy on the LFW dataset}
\\resumeItemListEnd`,
  skills: `Python, JavaScript, TypeScript, React, Node.js, SQL, FastAPI, REST APIs, Git, AWS, Docker, Tailwind CSS, Next.js, MongoDB, PostgreSQL, Machine Learning, Deep Learning`,
};

const TEST_JOB_INFO = {
  company: 'Accenture',
  role: 'Custom Software Engineer',
  location: 'India',
};

interface AutoApplyResult {
  status: 'success' | 'partial' | 'failed';
  message: string;
  steps: string[];
  screenshotUrl?: string;
  error?: string;
}

export default function TestAutomationPage() {
  const [jobUrl, setJobUrl] = useState(TEST_JOB_URL);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AutoApplyResult | null>(null);
  const [useDummyPdf, setUseDummyPdf] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);

    try {
      // Check if a real PDF was uploaded
      const uploadedPdf = (window as unknown as Record<string, string>).__testPdfBase64 || null;

      const body: Record<string, unknown> = {
        jobUrl,
        coverLetter: TEST_COVER_LETTER,
        jobSkills: TEST_SKILLS,
        resumeSections: TEST_RESUME_SECTIONS,
        jobInfo: TEST_JOB_INFO,
        pdfBase64: useDummyPdf ? null : uploadedPdf,
      };

      const res = await fetch('/api/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data: AutoApplyResult = await res.json();
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setResult({ status: 'failed', message: msg, steps: [] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', marginBottom: 24, color: '#92400e', fontSize: 14 }}>
        <strong>TEST PAGE</strong> — This page bypasses AI APIs. Delete after testing. Located at <code>/dashboard/test-automation</code>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Automation Test Runner</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Tests the auto-apply Playwright automation with hardcoded data. No AI API calls are made.
      </p>

      {/* Job URL */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Job URL</label>
        <input
          type="text"
          value={jobUrl}
          onChange={e => setJobUrl(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>

      {/* Options */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <input type="checkbox" checked={useDummyPdf} onChange={e => setUseDummyPdf(e.target.checked)} />
          Skip resume PDF upload (no PDF)
        </label>
      </div>

      {/* Data preview */}
      <details style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>View test data being sent</summary>
        <div style={{ marginTop: 12 }}>
          <h4 style={{ margin: '8px 0 4px', fontSize: 13, color: '#6b7280' }}>Skills ({TEST_SKILLS.length})</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {TEST_SKILLS.map(s => (
              <span key={s} style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{s}</span>
            ))}
          </div>

          <h4 style={{ margin: '12px 0 4px', fontSize: 13, color: '#6b7280' }}>Cover Letter</h4>
          <pre style={{ background: '#f9fafb', padding: 8, borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto' }}>
            {TEST_COVER_LETTER}
          </pre>

          <h4 style={{ margin: '12px 0 4px', fontSize: 13, color: '#6b7280' }}>Resume Sections</h4>
          <pre style={{ background: '#f9fafb', padding: 8, borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto' }}>
            {JSON.stringify(TEST_RESUME_SECTIONS, null, 2)}
          </pre>

          <h4 style={{ margin: '12px 0 4px', fontSize: 13, color: '#6b7280' }}>Job Info</h4>
          <pre style={{ background: '#f9fafb', padding: 8, borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(TEST_JOB_INFO, null, 2)}
          </pre>
        </div>
      </details>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={running || !jobUrl}
        style={{
          padding: '10px 24px', borderRadius: 8, border: 'none', fontSize: 15, fontWeight: 600,
          cursor: running ? 'wait' : 'pointer',
          background: running ? '#9ca3af' : '#2563eb', color: '#fff',
          marginBottom: 24,
        }}
      >
        {running ? 'Running Automation...' : 'Run Auto-Apply Test'}
      </button>

      {running && (
        <div style={{ padding: 16, background: '#f0f9ff', borderRadius: 8, marginBottom: 16, border: '1px solid #bae6fd' }}>
          <p style={{ margin: 0, color: '#0369a1' }}>
            Browser is launching... Watch the Playwright window that opens. The automation will fill forms sequentially.
            If it highlights a field in red, fill it manually within 45 seconds.
          </p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          border: '1px solid',
          borderColor: result.status === 'success' ? '#22c55e' : result.status === 'partial' ? '#f59e0b' : '#ef4444',
          borderRadius: 8, padding: 16, marginBottom: 24,
          background: result.status === 'success' ? '#f0fdf4' : result.status === 'partial' ? '#fffbeb' : '#fef2f2',
        }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>
            {result.status === 'success' ? 'Success' : result.status === 'partial' ? 'Partial — Review Needed' : 'Failed'}
          </h3>
          <p style={{ margin: '0 0 12px', color: '#374151', fontSize: 14 }}>{result.message}</p>

          {result.steps && result.steps.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#6b7280' }}>Steps ({result.steps.length})</h4>
              <div style={{ maxHeight: 300, overflow: 'auto', background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb', padding: 8 }}>
                {result.steps.map((step, i) => (
                  <div key={i} style={{ padding: '3px 0', fontSize: 13, borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace' }}>
                    <span style={{ color: '#9ca3af', marginRight: 8 }}>{String(i + 1).padStart(2, '0')}</span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.screenshotUrl && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#6b7280' }}>Screenshot</h4>
              <img
                src={result.screenshotUrl}
                alt="Automation screenshot"
                style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </div>
          )}
        </div>
      )}

      {/* PDF upload for real resume */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Upload a real resume PDF (optional)</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
          If you have a compiled PDF from a previous run, upload it here to include in the automation test.
        </p>
        <PdfUploader onPdfReady={(base64) => {
          // Store it so next run includes it
          (window as unknown as Record<string, string>).__testPdfBase64 = base64;
          setUseDummyPdf(false);
        }} />
      </div>
    </div>
  );
}

function PdfUploader({ onPdfReady }: { onPdfReady: (base64: string) => void }) {
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix to get raw base64
      const base64 = result.split(',')[1] || result;
      onPdfReady(base64);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input type="file" accept=".pdf" onChange={handleFile} />
      {fileName && <span style={{ marginLeft: 8, fontSize: 13, color: '#059669' }}>Loaded: {fileName}</span>}
    </div>
  );
}
