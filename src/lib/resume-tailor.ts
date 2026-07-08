/**
 * Shared resume-tailoring logic.
 * Extracted from /api/ai/tailor-resume so it can also be called from the
 * Apply via Excel per-company workspace without a second implementation.
 */
import { extractSection, replaceSection } from '@/lib/latex-parser';
import { createClient } from '@/lib/supabase/server';
import type { JobAnalysis } from '@/lib/job-analyzer';

export interface TailoredResume {
  latex: string;
  changes: {
    experience: string[];
    projects: string[];
    skills: string[];
  };
  atsScore: number;
  resumeScore: number;
  sections: {
    experience: string;
    projects: string;
    skills: string;
  };
}

export type TailorMode = 'conservative' | 'balanced' | 'stronger' | undefined;

/**
 * Tailor the current user's base resume for a given job analysis.
 * Loads the user's own saved base resume/projects from Supabase — there is
 * no fallback to a shared default. Without those saved, this throws rather
 * than silently tailoring and submitting someone else's real resume/work
 * history on this user's behalf.
 */
export async function tailorResume(jobAnalysis: JobAnalysis, mode?: TailorMode): Promise<TailoredResume> {
  if (!jobAnalysis) {
    throw new Error('Job analysis data is required.');
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('Claude API key not configured.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('You must be signed in to generate a tailored resume.');
  }

  const { data: personalDetailsRow } = await supabase
    .from('personal_details')
    .select('data')
    .eq('user_id', user.id)
    .single();

  const userBaseResume: string | undefined = personalDetailsRow?.data?.baseResume;
  if (!userBaseResume || userBaseResume.trim().length <= 50) {
    throw new Error('Add your base resume in Personal Details before generating a tailored resume.');
  }

  const userProjects: any[] | undefined = personalDetailsRow?.data?.projects;
  if (!userProjects || !Array.isArray(userProjects) || userProjects.length === 0) {
    throw new Error('Add at least one project in Personal Details before generating a tailored resume.');
  }

  const projectsForPrompt = userProjects.map((p: any, i: number) =>
    `PROJECT ${i + 1}: ${p.name}\nTech: ${p.tech.join(', ')}\nCategories: ${p.category.join(', ')}\nLaTeX snippet:\n${p.latex}`
  ).join('\n\n');

  // Only the 3 sections that ever change are sent to/returned from the
  // model — the rest of the document (preamble, heading, honors, education)
  // is spliced back in unchanged via replaceSection() below. Previously the
  // model had to echo the ENTIRE document back on every call, which made
  // this call slow enough to occasionally exceed the hosting platform's
  // serverless function timeout (a 504 to the browser) for no benefit, since
  // that unchanged content was never going to differ anyway.
  const currentExperienceSection = extractSection(userBaseResume, 'experience');
  const currentSkillsSection = extractSection(userBaseResume, 'skills');

  const modeInstructions = mode === 'conservative'
    ? 'CONSERVATIVE MODE: Make minimal changes. Only lightly rephrase experience bullets to include a few ATS keywords. Keep wording very close to original. Reorder skills slightly.'
    : mode === 'stronger'
    ? 'STRONGER MODE: Maximize ATS keyword alignment. Aggressively optimize bullet wording with strong action verbs while staying 100% truthful to what was actually done.'
    : 'BALANCED MODE: Moderate rewording of experience bullets with natural ATS keyword inclusion. Good balance of optimization and readability.';

  const systemPrompt = `You are an expert ATS resume optimization engine. You edit exactly three sections of a candidate's LaTeX resume: Experience, Projects, and Technical Skills. You are given ONLY the current content of those three sections (not the rest of the document) and return ONLY your edited versions of them — the rest of the resume (preamble, heading, honors, education) is unrelated to this task and is preserved separately, untouched, in code.

# MOST IMPORTANT RULE
Do NOT redesign anything. Do NOT modify any LaTeX formatting, macros, spacing commands, or structure — only edit the human-readable text content (bullet wording, project selection, skill ordering) within each section you're given. Every LaTeX command, macro, and comment in what you return must be preserved exactly as given except where these rules explicitly say to change the text.

# MODE
${modeInstructions}

# EXPERIENCE SECTION RULES
- This is the CURRENT EXPERIENCE SECTION given below — keep the exact same companies, locations, job titles, and dates it already contains. Do not invent, remove, or reorder roles.
- Keep the same number of bullets per role and similar bullet length.
- Do NOT invent fake work or replace real experience. Do NOT drastically change responsibilities.
- ONLY optimize wording by naturally including relevant ATS keywords from the job description.
- Example: "Built REST APIs for CRUD workflows" → "Built scalable RESTful APIs for secure CRUD workflow automation"
- Use strong verbs: Built, Developed, Designed, Implemented, Optimized, Automated, Engineered, Scaled

# PROJECTS SECTION RULES
- Select the 3 projects MOST RELEVANT to the target job description from the AVAILABLE PROJECTS list below
- Use the LaTeX snippet provided for each selected project as the base content
- You may lightly rephrase project bullets to better align with the JD, but stay truthful
- Each bullet point MUST be short, technical, and brief — use concise engineering language, no fluff or filler words
- If a project's bullets do not mention specific technologies or frameworks, incorporate relevant ones from the job description or ones that logically make sense for that project (e.g. mention the database, cloud provider, or framework actually used)
- Keep exactly 3 projects with the same formatting style as the projects given as examples
- Keep the \\vspace{-8pt} between projects and \\vspace{-5pt} after the section heading, matching the format of the example snippets
- Do NOT invent projects, fake tech stacks, or fake metrics

# TECHNICAL SKILLS SECTION RULES
- This is the CURRENT SKILLS SECTION given below — reorder its categories and items based on JD relevance (most relevant first). Do not remove the section structure.
- Example: If backend job → Languages, Backend & APIs, Database, Cloud, Frontend, AI
- Example: If AI job → Languages, AI & Pipelines, Backend, Cloud, Database, Frontend
- Do NOT add skills the candidate doesn't already have listed
- You may include adjacent/related tools only if clearly believable from existing experience
- Keep the section compact with the same formatting

# FORMATTING IS HIGHEST PRIORITY
- The final resume MUST remain ONE PAGE — these three sections combined should be similar in length to what was given, not longer
- Preserve the original visual layout exactly: same spacing rhythm, bullet density, line balance
- If content becomes too long: shorten wording, remove redundancy, tighten bullets
- NEVER change formatting to fix overflow — only shorten content

# ATS OPTIMIZATION
- Extract keywords, frameworks, responsibilities, domain language from the JD
- Naturally include those keywords in Experience bullets, Project bullets, and Skills ordering
- Do NOT keyword stuff — make it read naturally

# OUTPUT FORMAT
Return ONLY valid JSON (no markdown, no explanation) with this structure:
{
  "experienceSection": "your edited Experience section content, same LaTeX structure as given, only bullet wording changed",
  "projectsSection": "your 3 selected/edited projects, same LaTeX structure as the example snippets",
  "skillsSection": "your reordered Skills section content, same LaTeX structure as given",
  "changes": {
    "experience": ["description of each change made to experience bullets"],
    "projects": ["Selected: ProjectName1", "Selected: ProjectName2", "Selected: ProjectName3"],
    "skills": ["description of reordering changes"]
  },
  "atsScore": 85,
  "resumeScore": 88
}

Each section value must contain ONLY that section's content (the LaTeX between where \\section{...} ends and the next \\section{} would begin) — do NOT include the \\section{...} command itself, and do NOT include any other section.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `CURRENT EXPERIENCE SECTION:\n${currentExperienceSection}\n\n---\n\nCURRENT SKILLS SECTION:\n${currentSkillsSection}\n\n---\n\nAVAILABLE PROJECTS TO CHOOSE FROM (select the 3 most relevant, use their LaTeX snippets):\n\n${projectsForPrompt}\n\n---\n\nTARGET JOB ANALYSIS:\n${JSON.stringify(jobAnalysis, null, 2)}\n\nTailor these three sections for the job. Return only the JSON object described in the system prompt — experienceSection, projectsSection, skillsSection, changes, atsScore, resumeScore.`,
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Claude tailor error:', errText);
    throw new Error('AI resume tailoring failed.');
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse tailored resume.');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.experienceSection || !parsed.projectsSection || !parsed.skillsSection) {
    throw new Error('Failed to parse tailored resume.');
  }

  // Splice the three edited sections back into the untouched original
  // document rather than trusting the model to reproduce the rest verbatim.
  let latex = userBaseResume;
  latex = replaceSection(latex, 'experience', parsed.experienceSection);
  latex = replaceSection(latex, 'projects', parsed.projectsSection);
  latex = replaceSection(latex, 'skills', parsed.skillsSection);

  return {
    latex,
    changes: parsed.changes,
    atsScore: parsed.atsScore,
    resumeScore: parsed.resumeScore,
    sections: {
      experience: parsed.experienceSection,
      projects: parsed.projectsSection,
      skills: parsed.skillsSection,
    },
  };
}
