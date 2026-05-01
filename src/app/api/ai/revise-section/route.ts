import { NextRequest, NextResponse } from 'next/server';
import { replaceSection, extractEditableSections } from '@/lib/latex-parser';

export async function POST(req: NextRequest) {
  try {
    const { section, sectionLatex, fullLatex, feedback, jobAnalysis } = await req.json();

    if (!section || !sectionLatex || !feedback) {
      return NextResponse.json({ error: 'Section, LaTeX content, and feedback are required.' }, { status: 400 });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Claude API key not configured.' }, { status: 500 });
    }

    const systemPrompt = `You are an expert resume editor. The user has rejected a specific section of their AI-tailored resume and provided feedback on what to change.

Your task:
1. Revise ONLY the specified section based on the user's feedback.
2. Keep the EXACT same LaTeX formatting, commands, and macros (\\resumeSubHeadingListStart, \\resumeItemListStart, \\resumeItem, etc.).
3. Do NOT fabricate experience, skills, companies, or achievements.
4. Maintain similar length to avoid page overflow.
5. Use strong action verbs and ATS-friendly language.
6. Return the revised LaTeX content for that section only (the content between the section header and the next section marker).
7. Do NOT include the \\section{} command or comment markers, just the inner content.

Return ONLY valid JSON:
{
  "revisedContent": "the revised LaTeX section content (inner content only)",
  "changesSummary": "brief description of what was changed"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `SECTION NAME: ${section}\n\nCURRENT LATEX CONTENT OF THIS SECTION:\n${sectionLatex}\n\nJOB CONTEXT:\n${JSON.stringify(jobAnalysis || {})}\n\nUSER FEEDBACK:\n${feedback}\n\nPlease revise this section. Return ONLY valid JSON with "revisedContent" and "changesSummary" keys. Make sure all LaTeX backslashes are properly escaped as \\\\ in the JSON string.`,
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude revise error:', errText);
      return NextResponse.json({ error: 'AI revision failed.' }, { status: 502 });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Robust JSON extraction — try multiple approaches
    let parsed: { revisedContent?: string; changesSummary?: string; updatedLatex?: string; updatedSections?: Record<string, string> } | null = null;

    // Approach 1: direct JSON parse of the whole response (if AI returned clean JSON)
    try {
      parsed = JSON.parse(content.trim());
    } catch { /* not clean JSON */ }

    // Approach 2: extract JSON from markdown code block
    if (!parsed) {
      const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        try { parsed = JSON.parse(codeBlockMatch[1].trim()); } catch { /* nope */ }
      }
    }

    // Approach 3: greedy brace match
    if (!parsed) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { /* nope */ }
      }
    }

    // Approach 4: manually extract revisedContent between markers
    if (!parsed) {
      const revisedMatch = content.match(/"revisedContent"\s*:\s*"([\s\S]*?)"\s*,\s*"changesSummary"/);
      const summaryMatch = content.match(/"changesSummary"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/);
      if (revisedMatch) {
        parsed = {
          revisedContent: revisedMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          changesSummary: summaryMatch ? summaryMatch[1] : 'Section revised.',
        };
      }
    }

    // Approach 5: treat the whole response as revised content (last resort)
    if (!parsed || !parsed.revisedContent) {
      // Strip any JSON wrapper attempts and use raw content
      const stripped = content
        .replace(/^```[\s\S]*?```$/gm, '')
        .replace(/"revisedContent"\s*:/g, '')
        .replace(/"changesSummary"\s*:.*$/gm, '')
        .replace(/^\s*[\{"\}]\s*$/gm, '')
        .trim();
      if (stripped.length > 20) {
        parsed = { revisedContent: stripped, changesSummary: 'Section revised based on your feedback.' };
      }
    }

    if (!parsed || !parsed.revisedContent) {
      console.error('Failed to parse revision response:', content.substring(0, 500));
      return NextResponse.json({ error: 'Failed to parse revision.' }, { status: 500 });
    }

    // If full LaTeX was provided, inject the revised section back and return the updated full LaTeX
    if (fullLatex && parsed.revisedContent) {
      const updatedLatex = replaceSection(fullLatex, section, parsed.revisedContent);
      const updatedSections = extractEditableSections(updatedLatex);
      parsed.updatedLatex = updatedLatex;
      parsed.updatedSections = {
        experience: updatedSections.experience,
        projects: updatedSections.projects,
        skills: updatedSections.skills,
      };
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('Revise section error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
