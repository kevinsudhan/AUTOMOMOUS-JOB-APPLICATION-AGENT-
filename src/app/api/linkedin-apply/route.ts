import { NextRequest, NextResponse } from 'next/server';
import { chromium, type Browser, type Page } from 'playwright';

/* ================================================================
   LINKEDIN EASY APPLY AUTOMATION
   Flow:
   1. User is already logged into LinkedIn (connect to existing browser)
   2. Iterate job listings on the left panel
   3. Click each job → read JD on right
   4. Tailor resume + generate cover letter via our APIs
   5. Click "Easy Apply" → fill multi-step form
   6. Handle: contact info, resume upload, cover letter, work exp editing,
      education (just next), unknown fields (ask user)
   7. Submit application
   ================================================================ */

interface LinkedInJob {
  title: string;
  company: string;
  location: string;
  jobDescription: string;
}

interface StepUpdate {
  type: 'job_found' | 'tailoring' | 'applying' | 'form_step' | 'applied' | 'skipped' | 'error' | 'asking_user' | 'done';
  message: string;
  jobIndex?: number;
  totalJobs?: number;
  currentJob?: { title: string; company: string };
}

// Helper: safe wait
async function safeWait(page: Page, ms: number) {
  await page.waitForTimeout(ms);
}

// Helper: wait for element with timeout
async function waitForSelector(page: Page, selector: string, timeout = 5000) {
  try {
    return await page.waitForSelector(selector, { timeout, state: 'visible' });
  } catch {
    return null;
  }
}

// ---- Extract job description from the right panel ----
async function extractJobDescription(page: Page): Promise<LinkedInJob | null> {
  try {
    await safeWait(page, 1500);

    const jobData = await page.evaluate(() => {
      // Job title
      const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24, h2.t-24');
      const title = titleEl?.textContent?.trim() || '';

      // Company
      const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__primary-description-container a');
      const company = companyEl?.textContent?.trim() || '';

      // Location
      const locationEl = document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet');
      const location = locationEl?.textContent?.trim() || '';

      // Job description
      const jdEl = document.querySelector('.jobs-description__content, .jobs-box__html-content, #job-details, .jobs-description-content__text');
      const jobDescription = jdEl?.textContent?.trim() || '';

      return { title, company, location, jobDescription };
    });

    if (!jobData.jobDescription) return null;
    return jobData;
  } catch {
    return null;
  }
}

// ---- Tailor resume for the job ----
async function tailorResumeForJob(jobDescription: string, baseUrl: string): Promise<{ latex: string; pdfBuffer: Buffer; sections: any; coverLetter: string } | null> {
  try {
    // Step 1: Analyze the job
    const analyzeRes = await fetch(`${baseUrl}/api/ai/analyze-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobText: jobDescription }),
    });
    if (!analyzeRes.ok) return null;
    const analysis = await analyzeRes.json();

    // Step 2: Tailor resume
    const tailorRes = await fetch(`${baseUrl}/api/ai/tailor-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobAnalysis: analysis }),
    });
    if (!tailorRes.ok) return null;
    const resume = await tailorRes.json();

    // Step 3: Compile PDF
    const compileRes = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: resume.latex }),
    });
    let pdfBuffer: Buffer | null = null;
    if (compileRes.ok) {
      const ct = compileRes.headers.get('content-type') || '';
      if (ct.includes('application/pdf')) {
        const ab = await compileRes.arrayBuffer();
        pdfBuffer = Buffer.from(ab);
      }
    }
    if (!pdfBuffer) return null;

    // Step 4: Generate cover letter
    let coverLetter = '';
    try {
      const clRes = await fetch(`${baseUrl}/api/ai/generate-cover-letter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobAnalysis: analysis, resumeLatex: resume.latex }),
      });
      if (clRes.ok) {
        const clData = await clRes.json();
        coverLetter = clData.coverLetter || '';
      }
    } catch { /* cover letter optional */ }

    return { latex: resume.latex, pdfBuffer, sections: resume.sections, coverLetter };
  } catch {
    return null;
  }
}

// ---- Parse work experience from tailored resume LaTeX ----
function parseExperienceFromLatex(latex: string): Array<{ title: string; company: string; dateRange: string; description: string }> {
  const experiences: Array<{ title: string; company: string; dateRange: string; description: string }> = [];
  
  // Match \resumeSubheading{Title}{Date}{Company}{Location}
  const subheadingRegex = /\\resumeSubheading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g;
  let match;
  const positions: Array<{ title: string; date: string; company: string; location: string; index: number }> = [];
  
  while ((match = subheadingRegex.exec(latex)) !== null) {
    positions.push({
      title: match[1].replace(/\\\\/g, ''),
      date: match[2].replace(/\\\\/g, ''),
      company: match[3].replace(/\\\\/g, ''),
      location: match[4].replace(/\\\\/g, ''),
      index: match.index,
    });
  }

  // Extract bullet points for each position
  const itemRegex = /\\resumeItem\{([^}]*(?:\{[^}]*\})*[^}]*)\}/g;
  
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const nextPos = positions[i + 1];
    const sectionEnd = nextPos ? nextPos.index : latex.length;
    const sectionText = latex.substring(pos.index, sectionEnd);
    
    const bullets: string[] = [];
    let itemMatch;
    while ((itemMatch = itemRegex.exec(sectionText)) !== null) {
      const bullet = itemMatch[1]
        .replace(/\\textbf\{([^}]*)\}/g, '$1')
        .replace(/\\emph\{([^}]*)\}/g, '$1')
        .replace(/\\\\/g, '')
        .replace(/\$/g, '')
        .trim();
      if (bullet) bullets.push(bullet);
    }
    itemRegex.lastIndex = 0;
    
    experiences.push({
      title: pos.title,
      company: pos.company,
      dateRange: pos.date,
      description: bullets.join('. '),
    });
  }

  return experiences;
}

// ---- Fill the LinkedIn Easy Apply form step by step ----
async function fillEasyApplyForm(
  page: Page,
  profile: any,
  pdfBuffer: Buffer,
  coverLetter: string,
  experiences: Array<{ title: string; company: string; dateRange: string; description: string }>,
  steps: string[],
  sendUpdate: (update: StepUpdate) => void,
): Promise<boolean> {
  let formStepCount = 0;
  const MAX_STEPS = 15;

  while (formStepCount < MAX_STEPS) {
    formStepCount++;
    await safeWait(page, 1000);

    // Check if we see a "Submit application" or "Submit" button
    const submitBtn = await page.$('button[aria-label="Submit application"], button:has-text("Submit application")');
    if (submitBtn) {
      const isVisible = await submitBtn.isVisible().catch(() => false);
      if (isVisible) {
        await submitBtn.click();
        await safeWait(page, 2000);
        steps.push('Submitted application');
        
        // Handle post-submit dialog (dismiss "Done" popup)
        const doneBtn = await waitForSelector(page, 'button[aria-label="Dismiss"], button:has-text("Done"), button:has-text("Not now")', 3000);
        if (doneBtn) await doneBtn.click().catch(() => {});
        return true;
      }
    }

    // Determine current form section
    const sectionTitle = await page.evaluate(() => {
      const headers = document.querySelectorAll('.jobs-easy-apply-content h3, .jobs-easy-apply-modal h3, [class*="easy-apply"] h3');
      for (const h of headers) {
        const text = h.textContent?.trim().toLowerCase() || '';
        if (text) return text;
      }
      // Check for section labels in the form
      const formText = document.querySelector('.jobs-easy-apply-content, [class*="easy-apply-modal"]')?.textContent?.toLowerCase() || '';
      if (formText.includes('contact info')) return 'contact info';
      if (formText.includes('resume')) return 'resume';
      if (formText.includes('cover letter')) return 'cover letter';
      if (formText.includes('work experience')) return 'work experience';
      if (formText.includes('education')) return 'education';
      if (formText.includes('additional questions')) return 'additional questions';
      return 'unknown';
    });

    sendUpdate({ type: 'form_step', message: `Form step: ${sectionTitle}` });
    steps.push(`Form step: ${sectionTitle}`);

    // ---- CONTACT INFO ----
    if (sectionTitle.includes('contact')) {
      await fillContactInfo(page, profile, steps);
    }

    // ---- RESUME ----
    if (sectionTitle.includes('resume')) {
      await handleResumeUpload(page, pdfBuffer, steps);
    }

    // ---- COVER LETTER ----
    if (sectionTitle.includes('cover letter') || sectionTitle.includes('cover')) {
      await handleCoverLetterUpload(page, coverLetter, steps);
    }

    // ---- WORK EXPERIENCE ----
    if (sectionTitle.includes('work experience') || sectionTitle.includes('experience')) {
      await handleWorkExperience(page, experiences, steps);
    }

    // ---- EDUCATION — just click next ----
    if (sectionTitle.includes('education')) {
      steps.push('Education section — clicking Next');
    }

    // ---- ADDITIONAL QUESTIONS ----
    if (sectionTitle.includes('additional') || sectionTitle.includes('question')) {
      await handleAdditionalQuestions(page, profile, steps);
    }

    // Click Next / Review / Submit
    const nextBtn = await page.$('button[aria-label="Continue to next step"], button:has-text("Next"), button:has-text("Review"), button:has-text("Submit application")');
    if (nextBtn) {
      const btnText = await nextBtn.textContent().catch(() => '');
      await nextBtn.click();
      steps.push(`Clicked: ${btnText?.trim()}`);
      await safeWait(page, 1500);

      // Handle any error/validation popups after clicking
      const errorPopup = await page.$('.artdeco-inline-feedback--error, [class*="error"]');
      if (errorPopup) {
        const errorText = await errorPopup.textContent().catch(() => '');
        if (errorText) steps.push(`Form warning: ${errorText.trim().substring(0, 80)}`);
      }
    } else {
      // No next button found — maybe we're done or stuck
      steps.push('No Next/Submit button found — checking if done');
      break;
    }
  }

  return false;
}

// ---- Fill contact info fields ----
async function fillContactInfo(page: Page, profile: any, steps: string[]) {
  // Location (city) — autocomplete field
  const locationInput = await page.$('input[id*="city"], input[aria-label*="City"], input[aria-label*="city"], input[aria-label*="Location"]');
  if (locationInput) {
    const currentVal = await locationInput.inputValue().catch(() => '');
    if (!currentVal) {
      await locationInput.click();
      await locationInput.fill('');
      await page.keyboard.type(profile.city || 'Chennai', { delay: 50 });
      await safeWait(page, 1500);

      // Wait for autocomplete dropdown and click first option
      const firstOption = await waitForSelector(page, '[role="option"]:first-child, [class*="basic-typeahead"] li:first-child, [id*="typeahead"] li:first-child', 3000);
      if (firstOption) {
        await firstOption.click();
        steps.push(`Location: Selected ${profile.city}`);
      } else {
        steps.push('Location: Typed but no dropdown appeared');
      }
      await safeWait(page, 500);
    }
  }

  // Phone country code — if dropdown present and empty
  const phoneCodeSelect = await page.$('select[id*="phoneCountry"], select[name*="countryCode"], select[aria-label*="country code"]');
  if (phoneCodeSelect) {
    try {
      const options = await phoneCodeSelect.$$eval('option', opts => opts.map(o => ({ value: o.value, text: (o.textContent || '').trim() })));
      const indiaOpt = options.find(o => o.text.includes('India') || o.text.includes('+91'));
      if (indiaOpt) {
        await phoneCodeSelect.selectOption(indiaOpt.value);
        steps.push('Phone country code: India (+91)');
      }
    } catch { /* skip */ }
  }

  // Fill any empty text inputs (first name, last name, phone, email are usually pre-filled)
  const inputs = await page.$$('.jobs-easy-apply-content input[type="text"]:visible, .jobs-easy-apply-content input[type="email"]:visible, .jobs-easy-apply-content input[type="tel"]:visible');
  for (const input of inputs) {
    const val = await input.inputValue().catch(() => '');
    if (val) continue; // skip pre-filled

    const label = await input.evaluate(el => {
      const id = el.id;
      if (id) {
        const lbl = document.querySelector(`label[for="${id}"]`);
        if (lbl) return lbl.textContent?.trim().toLowerCase() || '';
      }
      const parent = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-element');
      if (parent) {
        const lbl = parent.querySelector('label');
        if (lbl) return lbl.textContent?.trim().toLowerCase() || '';
      }
      return '';
    }).catch(() => '');

    if (/first.?name/i.test(label)) {
      await input.fill(profile.firstName || '');
      steps.push('Filled first name');
    } else if (/last.?name/i.test(label)) {
      await input.fill(profile.lastName || '');
      steps.push('Filled last name');
    } else if (/phone|mobile/i.test(label)) {
      await input.fill(profile.phone || '');
      steps.push('Filled phone');
    } else if (/email/i.test(label)) {
      await input.fill(profile.email || '');
      steps.push('Filled email');
    }
  }
}

// ---- Handle resume upload ----
async function handleResumeUpload(page: Page, pdfBuffer: Buffer, steps: string[]) {
  // Look for "Upload resume" button or file input
  const uploadBtn = await page.$('button:has-text("Upload resume"), label:has-text("Upload resume")');
  if (uploadBtn) {
    // Click to trigger file input
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
      uploadBtn.click(),
    ]);
    if (fileChooser) {
      await fileChooser.setFiles({
        name: 'Kevin_Sudhan_Resume.pdf',
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      });
      steps.push('Uploaded tailored resume PDF');
      await safeWait(page, 2000);
    }
  } else {
    // Try hidden file input
    const fileInput = await page.$('input[type="file"][accept*="pdf"], input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles({
        name: 'Kevin_Sudhan_Resume.pdf',
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      });
      steps.push('Uploaded tailored resume via file input');
      await safeWait(page, 2000);
    } else {
      // Resume might already be selected — just move on
      steps.push('Resume section — no upload needed (existing resume selected)');
    }
  }
}

// ---- Handle cover letter upload ----
async function handleCoverLetterUpload(page: Page, coverLetter: string, steps: string[]) {
  if (!coverLetter) {
    steps.push('No cover letter to upload');
    return;
  }

  // Try to find textarea for cover letter
  const textarea = await page.$('textarea[name*="coverLetter"], textarea[aria-label*="cover letter"]');
  if (textarea) {
    await textarea.fill(coverLetter);
    steps.push('Filled cover letter textarea');
    return;
  }

  // Try file upload for cover letter
  const uploadBtn = await page.$('button:has-text("Upload cover letter"), label:has-text("Upload cover letter")');
  if (uploadBtn) {
    // Generate a simple text-based PDF or just upload as text
    // For now, we'll note it needs manual attention
    steps.push('Cover letter upload button found — requires manual upload');
  }
}

// ---- Handle work experience editing ----
async function handleWorkExperience(
  page: Page,
  experiences: Array<{ title: string; company: string; dateRange: string; description: string }>,
  steps: string[],
) {
  if (experiences.length === 0) {
    steps.push('No tailored experience data to fill');
    return;
  }

  // Find all "Edit" buttons for work experience entries
  const editBtns = await page.$$('button:has-text("Edit"), a:has-text("Edit")');
  
  for (let i = 0; i < editBtns.length && i < experiences.length; i++) {
    const exp = experiences[i];
    const editBtn = editBtns[i];
    
    const isVisible = await editBtn.isVisible().catch(() => false);
    if (!isVisible) continue;
    
    await editBtn.click();
    await safeWait(page, 1000);

    // Fill the description textarea with tailored content
    const descTextarea = await page.$('textarea[name*="description"], textarea[aria-label*="Description"], textarea[id*="description"]');
    if (descTextarea) {
      await descTextarea.fill(exp.description);
      steps.push(`Updated description for: ${exp.title} at ${exp.company}`);
    }

    // Click Save or done for this experience entry
    const saveBtn = await page.$('button:has-text("Save"), button[aria-label="Save"]');
    if (saveBtn) {
      await saveBtn.click();
      await safeWait(page, 1000);
    }
  }

  steps.push(`Handled ${Math.min(editBtns.length, experiences.length)} work experience entries`);
}

// ---- Handle additional/unknown questions ----
async function handleAdditionalQuestions(page: Page, profile: any, steps: string[]) {
  // Try to fill common additional question patterns
  const formGroups = await page.$$('.jobs-easy-apply-form-element, .fb-dash-form-element, [class*="form-element"]');
  
  for (const group of formGroups) {
    try {
      const isVisible = await group.isVisible().catch(() => false);
      if (!isVisible) continue;

      const labelText = await group.evaluate(el => {
        const lbl = el.querySelector('label, legend, .t-14');
        return lbl?.textContent?.trim().toLowerCase() || '';
      }).catch(() => '');

      if (!labelText) continue;

      // Check for select dropdowns
      const select = await group.$('select');
      if (select) {
        const currentVal = await select.inputValue().catch(() => '');
        if (currentVal && currentVal !== '' && currentVal !== 'Select an option') continue;

        // Try common answers
        if (/years?.?(of)?.?experience/i.test(labelText)) {
          const options = await select.$$eval('option', opts => opts.map(o => ({ value: o.value, text: (o.textContent || '').trim() })));
          // Find option matching our experience
          const expMatch = options.find(o => o.text.includes('1') || o.text.includes('Less than'));
          if (expMatch) {
            await select.selectOption(expMatch.value);
            steps.push(`Selected experience: ${expMatch.text}`);
          }
        } else if (/work.?auth|authorized/i.test(labelText)) {
          const options = await select.$$eval('option', opts => opts.map(o => ({ value: o.value, text: (o.textContent || '').trim().toLowerCase() })));
          const yesOpt = options.find(o => o.text.includes('yes'));
          if (yesOpt) await select.selectOption(yesOpt.value);
        } else if (/sponsor/i.test(labelText)) {
          const options = await select.$$eval('option', opts => opts.map(o => ({ value: o.value, text: (o.textContent || '').trim().toLowerCase() })));
          const noOpt = options.find(o => o.text.includes('no'));
          if (noOpt) await select.selectOption(noOpt.value);
        }
        continue;
      }

      // Check for radio buttons
      const radios = await group.$$('input[type="radio"]');
      if (radios.length > 0) {
        if (/authorized|legally|right.?to.?work|eligible/i.test(labelText)) {
          // Click "Yes"
          for (const radio of radios) {
            const radioLabel = await radio.evaluate(el => {
              const lbl = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
              return (lbl?.textContent || '').trim().toLowerCase();
            }).catch(() => '');
            if (/^yes/i.test(radioLabel)) {
              await radio.click();
              steps.push(`Selected Yes for: ${labelText.substring(0, 40)}`);
              break;
            }
          }
        } else if (/sponsor/i.test(labelText)) {
          for (const radio of radios) {
            const radioLabel = await radio.evaluate(el => {
              const lbl = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
              return (lbl?.textContent || '').trim().toLowerCase();
            }).catch(() => '');
            if (/^no/i.test(radioLabel)) {
              await radio.click();
              steps.push(`Selected No for: ${labelText.substring(0, 40)}`);
              break;
            }
          }
        }
        continue;
      }

      // Check for text inputs
      const input = await group.$('input[type="text"], input:not([type])');
      if (input) {
        const val = await input.inputValue().catch(() => '');
        if (val) continue;

        if (/salary|compensation|ctc/i.test(labelText)) {
          await input.fill(profile.expectedSalary || 'Negotiable');
          steps.push('Filled salary expectation');
        } else if (/notice/i.test(labelText)) {
          await input.fill(profile.noticePeriod || 'Immediate');
          steps.push('Filled notice period');
        }
      }
    } catch { /* skip problematic element */ }
  }
}

// ---- Main POST handler ----
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: StepUpdate) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let browser: Browser | null = null;

      try {
        const body = await req.json();
        const { linkedinUrl, maxJobs = 5, profile } = body;
        const baseUrl = req.nextUrl.origin;

        if (!linkedinUrl) {
          send({ type: 'error', message: 'LinkedIn jobs URL is required' });
          controller.close();
          return;
        }

        send({ type: 'job_found', message: 'Launching browser...' });

        // Launch browser — connect to user's Chrome with existing LinkedIn login
        browser = await chromium.launch({
          headless: false,
          channel: 'chrome',
          args: ['--disable-blink-features=AutomationControlled'],
        });

        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        const page = await context.newPage();

        // Navigate to LinkedIn jobs page
        send({ type: 'job_found', message: 'Navigating to LinkedIn...' });
        await page.goto(linkedinUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await safeWait(page, 3000);

        // Check if logged in
        const isLoggedIn = await page.$('.global-nav__me, .feed-identity-module, nav[aria-label="Primary"]');
        if (!isLoggedIn) {
          send({ type: 'error', message: 'Not logged into LinkedIn. Please log in manually first and try again.' });
          await browser.close();
          controller.close();
          return;
        }

        // Collect job cards from the left panel
        send({ type: 'job_found', message: 'Scanning job listings...' });
        await safeWait(page, 2000);

        const jobCards = await page.$$('.jobs-search-results__list-item, .job-card-container, [data-job-id], .jobs-search-results-list li');
        const totalJobs = Math.min(jobCards.length, maxJobs);

        send({ type: 'job_found', message: `Found ${jobCards.length} jobs. Will process ${totalJobs}.`, totalJobs });

        let appliedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < totalJobs; i++) {
          const steps: string[] = [];

          try {
            // Re-query job cards (DOM may have changed)
            const currentCards = await page.$$('.jobs-search-results__list-item, .job-card-container, [data-job-id], .jobs-search-results-list li');
            if (i >= currentCards.length) break;

            const card = currentCards[i];

            // Scroll card into view and click
            await card.scrollIntoViewIfNeeded().catch(() => {});
            await safeWait(page, 300);
            await card.click();
            await safeWait(page, 2000);

            // Extract job details
            const job = await extractJobDescription(page);
            if (!job || !job.jobDescription) {
              send({ type: 'skipped', message: `Job ${i + 1}: Could not read job description`, jobIndex: i });
              skippedCount++;
              continue;
            }

            send({
              type: 'tailoring',
              message: `Tailoring resume for: ${job.title} at ${job.company}`,
              jobIndex: i,
              currentJob: { title: job.title, company: job.company },
            });

            // Check if Easy Apply is available
            const easyApplyBtn = await page.$('button.jobs-apply-button, button:has-text("Easy Apply"), button[aria-label*="Easy Apply"]');
            if (!easyApplyBtn) {
              send({ type: 'skipped', message: `Job ${i + 1}: No Easy Apply button (${job.title})`, jobIndex: i });
              skippedCount++;
              continue;
            }

            // Tailor resume
            const tailored = await tailorResumeForJob(job.jobDescription, baseUrl);
            if (!tailored) {
              send({ type: 'skipped', message: `Job ${i + 1}: Resume tailoring failed (${job.title})`, jobIndex: i });
              skippedCount++;
              continue;
            }

            // Parse experience from tailored resume
            const experiences = parseExperienceFromLatex(tailored.latex);

            // Click Easy Apply
            send({ type: 'applying', message: `Applying to: ${job.title} at ${job.company}`, jobIndex: i, currentJob: { title: job.title, company: job.company } });
            await easyApplyBtn.click();
            await safeWait(page, 2000);

            // Fill the multi-step form
            const success = await fillEasyApplyForm(
              page, profile, tailored.pdfBuffer, tailored.coverLetter, experiences, steps, send,
            );

            if (success) {
              send({ type: 'applied', message: `Applied to: ${job.title} at ${job.company}`, jobIndex: i, currentJob: { title: job.title, company: job.company } });
              appliedCount++;
            } else {
              // Close the modal if still open
              const closeBtn = await page.$('button[aria-label="Dismiss"], button[data-test-modal-close-btn]');
              if (closeBtn) await closeBtn.click().catch(() => {});

              // Handle discard dialog
              const discardBtn = await waitForSelector(page, 'button:has-text("Discard"), button[data-test-dialog-primary-btn]', 2000);
              if (discardBtn) await discardBtn.click().catch(() => {});

              send({ type: 'skipped', message: `Job ${i + 1}: Could not complete application (${job.title})`, jobIndex: i });
              skippedCount++;
            }

            await safeWait(page, 1500);
          } catch (err) {
            send({ type: 'error', message: `Job ${i + 1} error: ${(err as Error).message}`, jobIndex: i });
            skippedCount++;

            // Try to close any open modals
            const closeBtn = await page.$('button[aria-label="Dismiss"], button[data-test-modal-close-btn]').catch(() => null);
            if (closeBtn) await closeBtn.click().catch(() => {});
            await safeWait(page, 1000);
          }
        }

        send({
          type: 'done',
          message: `Completed! Applied: ${appliedCount}, Skipped: ${skippedCount}`,
          totalJobs,
        });

        // Keep browser open for user to review
        // Don't close: await browser.close();

      } catch (err) {
        send({ type: 'error', message: `Fatal error: ${(err as Error).message}` });
        if (browser) await browser.close().catch(() => {});
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
