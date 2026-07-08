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

interface SectionResult {
  content: string;
  changes: string[];
  atsScore: number;
  resumeScore: number;
}

/**
 * LaTeX is full of backslash commands (\resumeItem, \textbf, \newcommand...)
 * that can't be reliably embedded in a JSON string — the model would have
 * to double-escape every backslash, and it doesn't do that consistently,
 * producing invalid JSON ("Bad escaped character") that's ambiguous to
 * repair after the fact (a raw "\r" or "\n" is indistinguishable from an
 * intentional JSON escape once it's already broken). So sections are
 * requested and parsed as plain text between markers instead of JSON —
 * this sidesteps the escaping problem entirely rather than patching it.
 */
function parseSectionResponse(text: string): SectionResult {
  const cleaned = text.replace(/```[a-z]*\n?/gi, '');
  const contentMatch = cleaned.match(/===CONTENT===\s*\n([\s\S]*?)\s*\n===CHANGES===/);
  const changesMatch = cleaned.match(/===CHANGES===\s*\n([\s\S]*?)\s*\n===SCORES===/);
  const scoresMatch = cleaned.match(/===SCORES===\s*\n([\s\S]*?)(?:\n===END===|$)/);

  if (!contentMatch) {
    throw new Error('Failed to parse tailored resume.');
  }

  const changes = (changesMatch ? changesMatch[1] : '')
    .split('\n')
    .map(line => line.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean);

  const scoresText = scoresMatch ? scoresMatch[1] : '';
  const atsMatch = scoresText.match(/ats\s*:\s*(\d+)/i);
  const resumeMatch = scoresText.match(/resume\s*:\s*(\d+)/i);

  return {
    content: contentMatch[1].trim(),
    changes,
    atsScore: atsMatch ? parseInt(atsMatch[1], 10) : 80,
    resumeScore: resumeMatch ? parseInt(resumeMatch[1], 10) : 80,
  };
}

/**
 * Runs one small, focused Claude call for a single resume section. Kept
 * deliberately small (one section, a low max_tokens ceiling) so it finishes
 * quickly — this app is hosted on a Netlify plan with a hard 10s
 * synchronous function timeout and no background-function option, so three
 * of these are run in parallel (see tailorResume below) instead of one
 * large call that regenerates the whole resume, which was slow enough to
 * 504.
 */
async function callClaudeForSection(apiKey: string, systemPrompt: string, userMessage: string, maxTokens: number): Promise<SectionResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Claude tailor error:', errText);
    throw new Error('AI resume tailoring failed.');
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  return parseSectionResponse(text);
}

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
  const currentProjectsSection = extractSection(userBaseResume, 'projects');

  const modeInstructions = mode === 'conservative'
    ? 'CONSERVATIVE MODE: Make minimal changes. Only lightly rephrase experience bullets to include a few ATS keywords. Keep wording very close to original. Reorder skills slightly.'
    : mode === 'stronger'
    ? 'STRONGER MODE: Maximize ATS keyword alignment. Aggressively optimize bullet wording with strong action verbs while staying 100% truthful to what was actually done.'
    : 'BALANCED MODE: Moderate rewording of experience bullets with natural ATS keyword inclusion. Good balance of optimization and readability.';

  const commonRules = `Do NOT redesign anything. Do NOT modify any LaTeX formatting, macros, spacing commands, or structure — only edit the human-readable text content. Every LaTeX command, macro, and comment must be preserved exactly as given except where these rules explicitly say to change the text.

# MODE
${modeInstructions}

# ATS OPTIMIZATION
- Extract keywords, frameworks, responsibilities, domain language from the job description
- Naturally include those keywords in the edited text
- Do NOT keyword stuff — make it read naturally

# FORMATTING IS HIGHEST PRIORITY
- The final resume MUST remain ONE PAGE — your output should be similar in length to the input, not longer
- Preserve the original visual layout exactly: same spacing rhythm, bullet density, line balance
- If content becomes too long: shorten wording, remove redundancy, tighten bullets
- NEVER change formatting to fix overflow — only shorten content

# OUTPUT FORMAT
Do NOT use JSON and do NOT use markdown code fences — the content is LaTeX full of backslashes that break JSON escaping. Return your response as plain text in EXACTLY this format, with these markers each on their own line and nothing before or after:

===CONTENT===
your edited section content, copied verbatim with no escaping — only that section's body (the LaTeX between where \\section{...} ends and the next \\section{} would begin), do NOT include the \\section{...} command itself
===CHANGES===
one short plain-text description per line of each change you made
===SCORES===
ats: a number from 0 to 100
resume: a number from 0 to 100
===END===`;

  const experienceSystemPrompt = `You are an expert ATS resume optimization engine. You edit ONLY the Experience section of a candidate's LaTeX resume. You are given the current content of that section and return only your edited version of it — the rest of the resume is handled separately and is not your concern.

# EXPERIENCE SECTION RULES
- Keep the exact same companies, locations, job titles, and dates already present. Do not invent, remove, or reorder roles.
- Keep the same number of bullets per role and similar bullet length.
- Do NOT invent fake work or replace real experience. Do NOT drastically change responsibilities.
- ONLY optimize wording by naturally including relevant ATS keywords from the job description.
- Example: "Built REST APIs for CRUD workflows" → "Built scalable RESTful APIs for secure CRUD workflow automation"
- Use strong verbs: Built, Developed, Designed, Implemented, Optimized, Automated, Engineered, Scaled

${commonRules}`;

  const projectsSystemPrompt = `You are an expert ATS resume optimization engine. You select and edit ONLY the Projects section of a candidate's LaTeX resume from a list of their available projects. You return only your selected/edited section — the rest of the resume is handled separately and is not your concern.

# PROJECTS SECTION RULES
- You are given the CURRENT PROJECTS SECTION below — it shows the exact wrapper structure you MUST preserve (e.g. \\resumeSubHeadingListStart at the start, \\resumeSubHeadingListEnd at the end, and any \\vspace commands around it). Only swap out which \\resumeProjectHeading blocks are inside that wrapper — never drop, move, or omit the wrapper itself. \\resumeProjectHeading internally emits a LaTeX \\item, which is only legal inside that list environment — omitting the wrapper produces a fatal "Lonely \\item" compile error.
- Select the 3 projects MOST RELEVANT to the target job description from the AVAILABLE PROJECTS list given
- Use the LaTeX snippet provided for each selected project as the base content for each \\resumeProjectHeading block
- You may lightly rephrase project bullets to better align with the JD, but stay truthful
- Each bullet point MUST be short, technical, and brief — use concise engineering language, no fluff or filler words
- If a project's bullets do not mention specific technologies or frameworks, incorporate relevant ones from the job description or ones that logically make sense for that project (e.g. mention the database, cloud provider, or framework actually used)
- Keep exactly 3 projects, in the same wrapper, with the same \\vspace{-8pt} spacing between them as shown in the current section
- Do NOT invent projects, fake tech stacks, or fake metrics
- Under ===CHANGES===, list which projects you selected, one per line, e.g. "Selected: ProjectName1"

${commonRules}`;

  const skillsSystemPrompt = `You are an expert ATS resume optimization engine. You edit ONLY the Technical Skills section of a candidate's LaTeX resume. You are given the current content of that section and return only your edited version of it — the rest of the resume is handled separately and is not your concern.

# TECHNICAL SKILLS SECTION RULES
- Reorder categories and items based on JD relevance (most relevant first). Do not remove the section structure.
- Example: If backend job → Languages, Backend & APIs, Database, Cloud, Frontend, AI
- Example: If AI job → Languages, AI & Pipelines, Backend, Cloud, Database, Frontend
- Do NOT add skills the candidate doesn't already have listed
- You may include adjacent/related tools only if clearly believable from existing experience
- Keep the section compact with the same formatting

${commonRules}`;

  const jobAnalysisText = `TARGET JOB ANALYSIS:\n${JSON.stringify(jobAnalysis, null, 2)}`;

  // Three small, focused calls run in parallel instead of one large call
  // that regenerates the whole resume — see callClaudeForSection's comment.
  const [experienceResult, projectsResult, skillsResult] = await Promise.all([
    callClaudeForSection(
      apiKey,
      experienceSystemPrompt,
      `CURRENT EXPERIENCE SECTION:\n${currentExperienceSection}\n\n---\n\n${jobAnalysisText}\n\nTailor this section for the job.`,
      2000,
    ),
    callClaudeForSection(
      apiKey,
      projectsSystemPrompt,
      `CURRENT PROJECTS SECTION (preserve this wrapper structure exactly):\n${currentProjectsSection}\n\n---\n\nAVAILABLE PROJECTS TO CHOOSE FROM (select the 3 most relevant, use their LaTeX snippets):\n\n${projectsForPrompt}\n\n---\n\n${jobAnalysisText}\n\nSelect and tailor 3 projects for the job.`,
      2800,
    ),
    callClaudeForSection(
      apiKey,
      skillsSystemPrompt,
      `CURRENT SKILLS SECTION:\n${currentSkillsSection}\n\n---\n\n${jobAnalysisText}\n\nTailor this section for the job.`,
      1200,
    ),
  ]);

  // Splice the three edited sections back into the untouched original
  // document rather than trusting the model to reproduce the rest verbatim.
  let latex = userBaseResume;
  latex = replaceSection(latex, 'experience', experienceResult.content);
  latex = replaceSection(latex, 'projects', projectsResult.content);
  latex = replaceSection(latex, 'skills', skillsResult.content);

  return {
    latex,
    changes: {
      experience: experienceResult.changes,
      projects: projectsResult.changes,
      skills: skillsResult.changes,
    },
    atsScore: Math.round((experienceResult.atsScore + projectsResult.atsScore + skillsResult.atsScore) / 3),
    resumeScore: Math.round((experienceResult.resumeScore + projectsResult.resumeScore + skillsResult.resumeScore) / 3),
    sections: {
      experience: experienceResult.content,
      projects: projectsResult.content,
      skills: skillsResult.content,
    },
  };
}
