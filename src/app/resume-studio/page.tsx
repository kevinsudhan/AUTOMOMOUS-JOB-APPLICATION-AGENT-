'use client';

import { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Download, FileText, AlertCircle, Loader2, Pencil } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import styles from './page.module.css';

const DEFAULT_TEX = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{geometry}
\\geometry{a4paper, margin=1in}

\\title{My First LaTeX Document}
\\author{LaTeX Studio User}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Welcome to your new modern LaTeX editor. You can use this environment to write, compile, and instantly preview your PDF documents right in your browser.

\\section{Features}
\\begin{itemize}
    \\item Syntax highlighting via Monaco Editor
    \\item Live PDF preview
    \\item One-click downloads
    \\item Fast cloud compilation
\\end{itemize}

\\section{Mathematics}
Here is an example of a beautiful equation:
\\begin{equation}
E = mc^2
\\end{equation}

And another slightly more complex formula:
\\begin{equation}
f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi)\\,e^{2 \\pi i \\xi x} \\,d\\xi
\\end{equation}

\\end{document}`;

export default function Home() {
  const [code, setCode] = useState(DEFAULT_TEX);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  const [pdfName, setPdfName] = useState('document');
  const [isEditingName, setIsEditingName] = useState(false);

  const handleCompile = useCallback(async () => {
    setIsCompiling(true);
    setError(null);
    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: code }),
      });

      if (!response.ok) {
        // The API may return JSON error or plain text error
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to compile');
        } else {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to compile');
        }
      }

      // Verify the response is actually a PDF and not an HTML error page
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/pdf')) {
        const text = await response.text();
        throw new Error(text || 'Compilation did not produce a valid PDF.');
      }

      // Read as ArrayBuffer first, then create blob with explicit PDF MIME type
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      // Cleanup old URL to avoid memory leaks
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      
      setPdfBlob(blob);
      setPdfUrl(url);
    } catch (err: any) {
      setError(err.message || 'An error occurred during compilation.');
    } finally {
      setIsCompiling(false);
    }
  }, [code, pdfUrl]);

  const handleDownload = async () => {
    if (!pdfBlob) return;
    const fileName = `${pdfName.trim() || 'document'}.pdf`;

    // Use the File System Access API for a native "Save As" dialog.
    // This guarantees the correct filename and .pdf extension.
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'PDF Document',
            accept: { 'application/pdf': ['.pdf'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(pdfBlob);
        await writable.close();
        return;
      } catch (e: any) {
        // User cancelled the dialog
        if (e.name === 'AbortError') return;
        // API failed, fall through to legacy method
      }
    }

    // Fallback for browsers without File System Access API:
    // Use the File constructor to give the blob a proper name.
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  // Keyboard shortcut (Ctrl+S or Cmd+S to compile)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleCompile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [code, handleCompile]); 

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <FileText className={styles.logoIcon} />
          <span>LaTeX Studio</span>
        </div>

        {/* Editable PDF Filename */}
        <div className={styles.fileNameWrapper}>
          {isEditingName ? (
            <input
              className={styles.fileNameInput}
              value={pdfName}
              onChange={(e) => setPdfName(e.target.value)}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingName(false); }}
              autoFocus
              spellCheck={false}
            />
          ) : (
            <button className={styles.fileNameDisplay} onClick={() => setIsEditingName(true)}>
              <span>{pdfName || 'document'}</span>
              <span className={styles.fileExt}>.pdf</span>
              <Pencil size={14} className={styles.editIcon} />
            </button>
          )}
        </div>

        <div className={styles.actions}>
          <ThemeToggle />
          <button 
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleCompile}
            disabled={isCompiling}
          >
            {isCompiling ? <Loader2 className={styles.spinner} size={18} /> : <Play size={18} />}
            {isCompiling ? 'Compiling...' : 'Compile'}
          </button>
          
          <button 
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={handleDownload}
            disabled={!pdfBlob || isCompiling}
          >
            <Download size={18} />
            Download PDF
          </button>
        </div>
      </header>

      {/* Main Split Layout */}
      <main className={styles.main}>
        {/* Editor Pane */}
        <div className={`${styles.pane} ${styles.editorPane}`}>
          <Editor
            height="100%"
            defaultLanguage="latex"
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            value={code}
            onChange={(value) => setCode(value || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              padding: { top: 24, bottom: 24 },
            }}
          />
        </div>

        {/* PDF Preview Pane */}
        <div className={`${styles.pane} ${styles.previewPane}`}>
          {isCompiling && (
            <div className={styles.loadingOverlay}>
              <Loader2 className={styles.spinner} size={32} />
              <p>Compiling Document...</p>
            </div>
          )}
          
          {error && !isCompiling && (
            <div className={`${styles.emptyState} ${styles.errorState}`}>
              <AlertCircle size={48} />
              <h3>Compilation Error</h3>
              <p style={{ whiteSpace: 'pre-wrap', textAlign: 'left', marginTop: '1rem', fontSize: '0.875rem' }}>
                {error}
              </p>
            </div>
          )}

          {!pdfUrl && !error && !isCompiling && (
            <div className={styles.emptyState}>
              <FileText size={48} opacity={0.5} />
              <p>Click "Compile" or press Ctrl+S to preview your PDF</p>
            </div>
          )}

          {pdfUrl && !error && (
            <iframe
              src={pdfUrl}
              className={styles.pdfObject}
              title="PDF Preview"
            />
          )}
        </div>
      </main>
    </div>
  );
}
