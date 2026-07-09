'use client';

/**
 * Client for the LOCAL auto-apply automation service (automation-service/).
 * The deployed site's serverless functions can't launch a browser, so
 * LLM-driven browser automation (browser-use) runs as a small FastAPI
 * service on the user's own machine; the browser talks to it directly at
 * localhost (http://localhost is a secure context, so this works even from
 * the https deployed site).
 */

const SERVICE_URL = 'http://localhost:8765';

export const SERVICE_START_HINT =
  'Local automation service is not running. Start it on your machine: open a terminal in the project\'s "automation-service" folder and run: .venv\\Scripts\\python -m uvicorn main:app --port 8765';

export interface AutomationRun {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'needs_human';
  jobUrl: string;
  steps: string[];
  stepCount: number;
  result: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export async function checkAutomationService(): Promise<{ ok: boolean; hasApiKey?: boolean; model?: string }> {
  try {
    const res = await fetch(`${SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}

export async function startAutomationRun(params: {
  jobUrl: string;
  profile: Record<string, unknown>;
  resumePdfBase64: string | null;
  autoSubmit?: boolean;
}): Promise<string> {
  const res = await fetch(`${SERVICE_URL}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoSubmit: true, ...params }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to start automation run.');
  return data.runId;
}

export async function getAutomationRun(runId: string): Promise<AutomationRun> {
  const res = await fetch(`${SERVICE_URL}/status/${runId}`);
  if (!res.ok) throw new Error('Failed to fetch run status.');
  return res.json();
}

/** Polls until the run reaches a terminal state, reporting progress. */
export async function waitForAutomationRun(
  runId: string,
  onProgress: (run: AutomationRun) => void,
): Promise<AutomationRun> {
  // Generous ceiling: browser automation is slow, but never poll forever if
  // the service dies mid-run.
  for (let i = 0; i < 600; i++) {
    await new Promise(r => setTimeout(r, 3000));
    let run: AutomationRun;
    try {
      run = await getAutomationRun(runId);
    } catch {
      continue; // transient — service busy driving the browser
    }
    onProgress(run);
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'needs_human') {
      return run;
    }
  }
  throw new Error('Automation run timed out after 30 minutes.');
}
