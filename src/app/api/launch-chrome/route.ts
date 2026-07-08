import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
];

export async function POST(req: Request) {
  const { returnUrl } = await req.json().catch(() => ({}));

  const chromePath = CHROME_PATHS.find(p => existsSync(p));
  if (!chromePath) {
    return NextResponse.json(
      { error: 'Chrome not found. Install Google Chrome or launch it manually with --remote-debugging-port=9222' },
      { status: 404 }
    );
  }

  /* Use a separate profile so it doesn't conflict with running Chrome */
  const profileDir = join(tmpdir(), 'chrome-automation-profile');
  const startUrl   = returnUrl || 'http://localhost:3000/dashboard/test-automation';

  const args = [
    `--remote-debugging-port=9222`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--start-maximized',
    startUrl,
  ];

  spawn(`"${chromePath}"`, args, {
    shell: true,
    detached: true,
    stdio: 'ignore',
  }).unref();

  return NextResponse.json({ success: true, chromePath, profileDir });
}
