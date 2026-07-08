import { NextRequest, NextResponse } from 'next/server';
import { analyzeJob } from '@/lib/job-analyzer';

export async function POST(req: NextRequest) {
  try {
    const { jobText } = await req.json();
    const parsed = await analyzeJob(jobText);
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('Analyze job error:', err);
    const status = /Claude API key not configured/.test(err.message) ? 500
      : /provide a job description/.test(err.message) ? 400
      : /Could not scrape/.test(err.message) ? 400
      : /AI analysis failed/.test(err.message) ? 502
      : 500;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status });
  }
}
