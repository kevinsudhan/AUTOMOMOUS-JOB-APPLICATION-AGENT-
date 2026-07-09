import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { jobAnalysis, resumeLatex } = await req.json();

    if (!jobAnalysis) {
      return NextResponse.json({ error: 'Job analysis data is required.' }, { status: 400 });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Claude API key not configured.' }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in to generate a cover letter.' }, { status: 401 });
    }

    // Load the signed-in user's own saved details — never a shared default,
    // so one user's name/contact info can't leak into another's cover letter.
    const { data: personalDetailsRow } = await supabase
      .from('personal_details')
      .select('data')
      .eq('user_id', user.id)
      .single();
    const details = personalDetailsRow?.data || {};
    const applicantName = [details.firstName, details.lastName].filter(Boolean).join(' ');
    const applicantEmail = details.email || user.email || '';
    const applicantPhone = details.phone || '';

    const systemPrompt = `You are an expert cover letter writer. Generate a professional, concise cover letter for a job application.

RULES:
1. Keep it to 3-4 paragraphs maximum. Do NOT exceed one page when printed.
2. Opening paragraph: State the role you are applying for and a brief hook about why you are a strong fit.
3. Middle paragraph(s): Highlight 2-3 specific achievements/experiences from the resume that directly match the job requirements. Use concrete details and metrics where available.
4. Closing paragraph: Express enthusiasm, mention you have attached your resume, and include a call to action.
5. Tone: Professional, confident, not generic. Avoid cliches like "I am writing to express my interest" or "I believe I am a perfect fit."
6. Do NOT fabricate any experience or skills. Only reference what is in the resume.
7. Do NOT use emojis or decorative formatting.
8. Address to "Hiring Manager" if no specific name is available.
9. Keep sentences punchy and impactful.
10. Sign off with the applicant's name${applicantName ? '' : " — if no name is provided below, end with just 'Sincerely,' and no name"}.

APPLICANT DETAILS:
- Name: ${applicantName || '(not provided)'}
- Email: ${applicantEmail || '(not provided)'}
- Phone: ${applicantPhone || '(not provided)'}

Return ONLY valid JSON with this structure:
{
  "coverLetter": "The full cover letter text with proper paragraph breaks using \\n\\n",
  "summary": "One-line summary of the key angle/theme of this cover letter"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `JOB DETAILS:\nCompany: ${jobAnalysis.company || 'Unknown'}\nRole: ${jobAnalysis.role || 'Unknown'}\nLocation: ${jobAnalysis.location || 'Unknown'}\nRequired Skills: ${(jobAnalysis.requiredSkills || []).join(', ')}\nJob Summary: ${jobAnalysis.description || ''}\n\nRESUME CONTEXT:\n${resumeLatex ? resumeLatex.substring(0, 4000) : 'Not provided'}\n\nGenerate a tailored cover letter. Return JSON only.`,
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude cover letter error:', errText);
      return NextResponse.json({ error: 'Cover letter generation failed.' }, { status: 502 });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse cover letter response.' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('Cover letter error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
