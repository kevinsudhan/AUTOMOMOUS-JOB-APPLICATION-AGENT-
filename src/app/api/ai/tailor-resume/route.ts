import { NextRequest, NextResponse } from 'next/server';
import { tailorResume } from '@/lib/resume-tailor';

export async function POST(req: NextRequest) {
  try {
    const { jobAnalysis, mode } = await req.json();
    const parsed = await tailorResume(jobAnalysis, mode);
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('Tailor resume error:', err);
    const status = /required/.test(err.message) ? 400
      : /API key not configured/.test(err.message) ? 500
      : /tailoring failed/.test(err.message) ? 502
      : /Failed to parse/.test(err.message) ? 500
      : 500;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status });
  }
}
