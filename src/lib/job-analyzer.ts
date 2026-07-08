/**
 * Shared job-description analysis logic.
 * Extracted from /api/ai/analyze-job so it can also be called from the
 * Apply via Excel per-company workspace without duplicating the prompt/service.
 */

export interface JobAnalysis {
  company: string;
  role: string;
  location: string;
  salary: string | null;
  type: string;
  experience: string;
  description: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  atsKeywords: string[];
  matchScore: number;
  matchReason: string;
}

function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

/**
 * Scrape a job page URL and return cleaned text content.
 */
async function scrapeJobPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch page: ${res.status} ${res.statusText}`);
    }

    const html = await res.text();

    // Try to extract structured data from JSON-LD first
    const jsonLdMatch = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    let jsonLdText = '';
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        const inner = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
        try {
          const parsed = JSON.parse(inner);
          if (parsed['@type'] === 'JobPosting' || parsed['@type']?.includes?.('JobPosting') || JSON.stringify(parsed).toLowerCase().includes('jobposting')) {
            jsonLdText = JSON.stringify(parsed, null, 2);
            break;
          }
        } catch { /* not valid JSON */ }
      }
    }

    if (jsonLdText) {
      return `[Structured Job Data from page]\n${jsonLdText}`;
    }

    // Fallback: extract text from HTML
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    if (text.length > 12000) {
      text = text.slice(0, 12000) + '\n\n[Content truncated]';
    }

    if (text.length < 100) {
      throw new Error('Could not extract meaningful content from the page. The site may require JavaScript rendering.');
    }

    return `[Scraped from: ${url}]\n\n${text}`;
  } finally {
    clearTimeout(timeout);
  }
}

const SYSTEM_PROMPT = `You are a job description analyzer for an AI career platform. Given a job posting (possibly scraped from a webpage), extract structured data. Return ONLY valid JSON with this exact structure:
{
  "company": "Company Name",
  "role": "Job Title",
  "location": "Location or Remote",
  "salary": "Salary range if found, else null",
  "type": "Full-time / Part-time / Contract / Internship",
  "experience": "Experience level (Entry / Mid / Senior)",
  "description": "2-3 sentence summary of the role",
  "responsibilities": ["responsibility 1", "responsibility 2"],
  "requiredSkills": ["skill 1", "skill 2"],
  "preferredSkills": ["skill 1", "skill 2"],
  "atsKeywords": ["keyword1", "keyword2"],
  "matchScore": 78,
  "matchReason": "Why this candidate might be a good fit based on common SWE background"
}
Rules:
- Extract ALL information you can find, even if the page is noisy with extra text.
- The matchScore should be estimated for a software engineer with React, TypeScript, Node.js, Python, Go, cloud, distributed systems experience.
- If some fields are not found, use reasonable defaults rather than leaving empty.
- requiredSkills and atsKeywords should have at least 5 items each.
- Return ONLY the JSON object, no markdown, no explanation.`;

/**
 * Analyze a job posting (URL or pasted JD text) and return structured data.
 * Throws an Error with a user-facing message on failure.
 */
export async function analyzeJob(jobText: string): Promise<JobAnalysis> {
  if (!jobText || typeof jobText !== 'string' || jobText.trim().length < 10) {
    throw new Error('Please provide a job description or URL.');
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('Claude API key not configured. Add CLAUDE_API_KEY to .env.local');
  }

  let content = jobText.trim();
  if (isUrl(content)) {
    try {
      content = await scrapeJobPage(content);
    } catch (scrapeErr: any) {
      throw new Error(`Could not scrape job page: ${scrapeErr.message}. Try pasting the job description text directly instead.`);
    }
  }

  const models = ['claude-haiku-4-5', 'claude-sonnet-4-6'];
  let lastError = '';

  for (const model of models) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Analyze this job posting and extract structured data:\n\n${content}` }],
        }),
      });

      if (!response.ok) {
        lastError = await response.text();
        continue;
      }

      const data = await response.json();
      const aiText = data.content?.[0]?.text || '';

      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        lastError = 'AI returned non-JSON response';
        continue;
      }

      return JSON.parse(jsonMatch[0]);
    } catch (modelErr: any) {
      lastError = modelErr.message;
      continue;
    }
  }

  throw new Error(`AI analysis failed: ${lastError}`);
}
