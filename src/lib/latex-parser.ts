/**
 * Utilities for parsing, extracting, and replacing sections in LaTeX resumes.
 */

export interface ParsedSections {
  experience: string;
  projects: string;
  skills: string;
  full: string;
}

/**
 * Section title patterns — we extract content between consecutive \\section{} commands.
 */
const SECTION_TITLES: Record<string, string> = {
  experience: 'Experience',
  honors: 'Honors and Awards',
  projects: 'Projects',
  skills: 'Technical Skills',
  education: 'Education',
};

/**
 * Extract a named section's LaTeX content from a full resume.
 * Finds content between \\section{Title} and the next \\section{} or \\end{document}.
 */
export function extractSection(latex: string, section: string): string {
  const title = SECTION_TITLES[section];
  if (!title) return '';

  // Find the \\section{Title} command (handle minor variations)
  const sectionPattern = new RegExp(`\\\\section\\{${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^}]*\\}`, 'i');
  const sectionMatch = sectionPattern.exec(latex);
  if (!sectionMatch) return '';

  const startIdx = sectionMatch.index! + sectionMatch[0].length;

  // Find the next \\section{} or \\end{document}
  const remaining = latex.slice(startIdx);
  const nextSectionMatch = remaining.match(/\\section\{/);
  const endIdx = nextSectionMatch ? startIdx + nextSectionMatch.index! : latex.indexOf('\\end{document}', startIdx);

  if (endIdx <= startIdx) return '';

  return latex.slice(startIdx, endIdx).trim();
}

/**
 * Extract the three editable sections from a tailored resume.
 */
export function extractEditableSections(latex: string): ParsedSections {
  return {
    experience: extractSection(latex, 'experience'),
    projects: extractSection(latex, 'projects'),
    skills: extractSection(latex, 'skills'),
    full: latex,
  };
}

/**
 * Replace a section's content in the full LaTeX document.
 * Finds the \\section{Title} command and replaces everything between it and the next \\section{}.
 */
export function replaceSection(latex: string, section: string, newContent: string): string {
  const title = SECTION_TITLES[section];
  if (!title) return latex;

  const sectionPattern = new RegExp(`\\\\section\\{${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^}]*\\}`, 'i');
  const sectionMatch = sectionPattern.exec(latex);
  if (!sectionMatch) return latex;

  const startIdx = sectionMatch.index! + sectionMatch[0].length;

  // Find the next \\section{} or \\end{document}
  const remaining = latex.slice(startIdx);
  const nextSectionMatch = remaining.match(/\\section\{/);
  const endIdx = nextSectionMatch ? startIdx + nextSectionMatch.index! : latex.indexOf('\\end{document}', startIdx);

  if (endIdx <= startIdx) return latex;

  return latex.slice(0, startIdx) + '\n' + newContent + '\n\n' + latex.slice(endIdx);
}

/**
 * Convert LaTeX section content to human-readable bullet list.
 */
export function latexToReadable(latexContent: string): string[] {
  const lines: string[] = [];

  // Extract subheadings (company/role entries)
  const subheadingRe = /\\resumeSubheading\s*\{([^}]*)\}\s*\{([^}]*)\}\s*\{([^}]*)\}\s*\{([^}]*)\}/g;
  let match;
  while ((match = subheadingRe.exec(latexContent)) !== null) {
    lines.push(`**${cleanLatex(match[1])}** | ${cleanLatex(match[3])} | ${cleanLatex(match[2])} | ${cleanLatex(match[4])}`);
  }

  // Extract project headings
  const projRe = /\\resumeProjectHeading\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\s*\{([^}]*)\}/g;
  while ((match = projRe.exec(latexContent)) !== null) {
    lines.push(`**${cleanLatex(match[1])}** (${cleanLatex(match[2])})`);
  }

  // Extract bullet items
  const itemRe = /\\resumeItem\{([\s\S]*?)\}(?=\s*(?:\\resumeItem|\\resumeItemListEnd|\\resumeSubheading|\\resumeProjectHeading|$))/g;
  while ((match = itemRe.exec(latexContent)) !== null) {
    lines.push(`• ${cleanLatex(match[1])}`);
  }

  // Extract skill lines
  const skillRe = /\\textbf\{([^}]*)\}\{:\s*([^}]*)\}/g;
  while ((match = skillRe.exec(latexContent)) !== null) {
    lines.push(`**${cleanLatex(match[1])}**: ${cleanLatex(match[2])}`);
  }

  return lines.length > 0 ? lines : [cleanLatex(latexContent)];
}

/**
 * Extract ONLY the bullet/accomplishment text from a section, deliberately
 * excluding subheadings and \resumeProjectHeading titles. Used for the
 * Apply via Excel email drafter, where the resulting facts must describe
 * what the candidate did, never the name of a project (that's a hard
 * requirement — see lib/email-draft.ts).
 */
export function extractBulletItems(latexContent: string): string[] {
  const items: string[] = [];
  const itemRe = /\\resumeItem\{([\s\S]*?)\}(?=\s*(?:\\resumeItem|\\resumeItemListEnd|\\resumeSubheading|\\resumeProjectHeading|$))/g;
  let match;
  while ((match = itemRe.exec(latexContent)) !== null) {
    const cleaned = cleanLatex(match[1]);
    if (cleaned) items.push(cleaned);
  }
  return items;
}

/**
 * Strip LaTeX commands to produce clean readable text.
 */
function cleanLatex(text: string): string {
  return text
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\textit\{([^}]*)\}/g, '$1')
    .replace(/\\emph\{([^}]*)\}/g, '$1')
    .replace(/\\underline\{([^}]*)\}/g, '$1')
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, '$1')
    .replace(/\$\|\$/g, '|')
    .replace(/\\%/g, '%')
    .replace(/\\&/g, '&')
    .replace(/\\\\/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
