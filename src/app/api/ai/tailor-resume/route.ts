import { NextRequest, NextResponse } from 'next/server';
import { BASE_RESUME_LATEX } from '@/data/base-resume';
import { ALL_PROJECTS } from '@/data/projects';
import { extractEditableSections } from '@/lib/latex-parser';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { jobAnalysis, mode } = await req.json();

    if (!jobAnalysis) {
      return NextResponse.json({ error: 'Job analysis data is required.' }, { status: 400 });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Claude API key not configured.' }, { status: 500 });
    }

    // Fetch user's saved base resume and projects from Supabase
    let userBaseResume = BASE_RESUME_LATEX;
    let userProjects = ALL_PROJECTS;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('personal_details')
          .select('data')
          .eq('user_id', user.id)
          .single();
        if (data?.data) {
          if (data.data.baseResume && data.data.baseResume.trim().length > 50) {
            userBaseResume = data.data.baseResume;
          }
          if (data.data.projects && Array.isArray(data.data.projects) && data.data.projects.length > 0) {
            userProjects = data.data.projects;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch user profile for tailoring, using defaults:', e);
    }

    // Build project options with full LaTeX snippets for AI to pick from
    const projectsForPrompt = userProjects.map((p: any, i: number) =>
      `PROJECT ${i + 1}: ${p.name}\nTech: ${p.tech.join(', ')}\nCategories: ${p.category.join(', ')}\nLaTeX snippet:\n${p.latex}`
    ).join('\n\n');

    const modeInstructions = mode === 'conservative'
      ? 'CONSERVATIVE MODE: Make minimal changes. Only lightly rephrase experience bullets to include a few ATS keywords. Keep wording very close to original. Reorder skills slightly.'
      : mode === 'stronger'
      ? 'STRONGER MODE: Maximize ATS keyword alignment. Aggressively optimize bullet wording with strong action verbs while staying 100% truthful to what was actually done.'
      : 'BALANCED MODE: Moderate rewording of experience bullets with natural ATS keyword inclusion. Good balance of optimization and readability.';

    const systemPrompt = `You are an expert ATS resume optimization engine. Your task is to generate a tailored resume by editing ONLY the content of the existing LaTeX base resume.

# MOST IMPORTANT RULE
Do NOT redesign the resume.
Do NOT modify ANY LaTeX formatting, structure, spacing commands, margins, macros, section order.
Do NOT add new sections or remove existing sections.
You must ONLY edit the textual content already inside the existing LaTeX code.
The output must preserve the original template EXACTLY — every LaTeX command, every spacing command, every macro definition, every comment.

# MODE
${modeInstructions}

# BASE RESUME STRUCTURE (preserve exactly)
1. Heading (DO NOT EDIT)
2. Experience (EDIT bullet text only)
3. Honors and Awards (DO NOT EDIT)
4. Projects (REPLACE with 3 best projects from provided list)
5. Technical Skills (REORDER and optimize)
6. Education (DO NOT EDIT)

# EXPERIENCE SECTION RULES
- Keep SAME companies: "Everyday Banking Solutions" and "Alibi Technologies LLP"
- Keep SAME locations, job titles, dates
- Keep SAME number of roles and similar bullet count
- Keep similar bullet length
- Do NOT invent fake work or replace real experience
- Do NOT drastically change responsibilities
- ONLY optimize wording by naturally including relevant ATS keywords from the JD
- Example: "Built REST APIs for CRUD workflows" → "Built scalable RESTful APIs for secure CRUD workflow automation"
- Use strong verbs: Built, Developed, Designed, Implemented, Optimized, Automated, Engineered, Scaled

# PROJECTS SECTION RULES
- Select the 3 projects MOST RELEVANT to the target job description from the AVAILABLE PROJECTS list
- Use the LaTeX snippet provided for each selected project as the base content
- You may lightly rephrase project bullets to better align with the JD, but stay truthful
- Each bullet point MUST be short, technical, and brief — use concise engineering language, no fluff or filler words
- If a project's bullets do not mention specific technologies or frameworks, incorporate relevant ones from the job description or ones that logically make sense for that project (e.g. mention the database, cloud provider, or framework actually used)
- Keep exactly 3 projects with the same formatting style as the base resume projects section
- Keep the \\vspace{-8pt} between projects and \\vspace{-5pt} after section heading
- Do NOT invent projects, fake tech stacks, or fake metrics

# TECHNICAL SKILLS SECTION RULES
- Reorder skill categories and items based on JD relevance (most relevant first)
- Example: If backend job → Languages, Backend & APIs, Database, Cloud, Frontend, AI
- Example: If AI job → Languages, AI & Pipelines, Backend, Cloud, Database, Frontend
- Do NOT add skills the candidate doesn't have
- You may include adjacent/related tools only if clearly believable from existing experience
- Keep the section compact with same formatting

# DO NOT EDIT AT ALL
- Name, contact details, phone, email, links
- Honors and Awards section (leave completely unchanged)
- Education section (leave completely unchanged)
- ALL LaTeX preamble (documentclass, usepackage, newcommand definitions)
- ALL formatting commands, margins, spacing commands
- ALL section titles and their formatting
- ALL comment lines (preserve every % comment exactly)

# FORMATTING IS HIGHEST PRIORITY
- The final resume MUST remain ONE PAGE
- Preserve the original visual layout exactly
- Same spacing rhythm, bullet density, line balance, section proportions
- If content becomes too long: shorten wording, remove redundancy, tighten bullets
- NEVER change formatting to fix overflow — only shorten content

# ATS OPTIMIZATION
- Extract keywords, frameworks, responsibilities, domain language from the JD
- Naturally include those keywords in Experience bullets, Project bullets, and Skills ordering
- Do NOT keyword stuff — make it read naturally

# OUTPUT FORMAT
Return ONLY valid JSON (no markdown, no explanation) with this structure:
{
  "latex": "THE COMPLETE LaTeX source code from \\\\documentclass to \\\\end{document} with only content edits applied",
  "changes": {
    "experience": ["description of each change made to experience bullets"],
    "projects": ["Selected: ProjectName1", "Selected: ProjectName2", "Selected: ProjectName3"],
    "skills": ["description of reordering changes"]
  },
  "atsScore": 85,
  "resumeScore": 88
}

The "latex" field must contain the FULL document — not a partial snippet. It must compile without errors.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `HERE IS MY BASE RESUME (preserve all formatting exactly):\n\n${userBaseResume}\n\n---\n\nAVAILABLE PROJECTS TO CHOOSE FROM (select the 3 most relevant, use their LaTeX snippets):\n\n${projectsForPrompt}\n\n---\n\nTARGET JOB ANALYSIS:\n${JSON.stringify(jobAnalysis, null, 2)}\n\nTailor this resume for the job. Edit ONLY Experience bullets, Projects (pick 3), and Skills ordering. Return the full LaTeX in JSON format.`,
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude tailor error:', errText);
      return NextResponse.json({ error: 'AI resume tailoring failed.' }, { status: 502 });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse tailored resume.' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract parsed sections from the tailored LaTeX
    const sections = extractEditableSections(parsed.latex || '');
    parsed.sections = {
      experience: sections.experience,
      projects: sections.projects,
      skills: sections.skills,
    };

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('Tailor resume error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
