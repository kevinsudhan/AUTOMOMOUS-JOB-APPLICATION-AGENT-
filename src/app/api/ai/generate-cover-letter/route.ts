import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Cover letter generation is under maintenance.' }, { status: 503 });
}
