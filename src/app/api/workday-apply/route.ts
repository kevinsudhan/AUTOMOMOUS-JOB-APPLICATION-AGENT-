import { NextRequest, NextResponse } from 'next/server';
import { chromium, type Browser, type Page } from 'playwright';
import { createClient } from '@/lib/supabase/server';

/* ── Types ─────────────────────────────────────────────────── */
interface ApplyResult {
  status: 'success' | 'partial' | 'failed';
  message: string;
  steps: string[];
}

interface Profile {
  firstName: string; middleName: string; lastName: string; name: string;
  email: string; password: string; phone: string; altPhone: string;
  streetAddress: string; city: string; state: string; zipCode: string; country: string;
  linkedin: string; github: string; portfolio: string;
  university: string; college: string; degree: string; degreeFullName: string;
  major: string; gpa: string; gpaScale: string;
  gradYear: string; gradMonth: string; gradDate: string; educationStartYear: string;
  gender: string; nationality: string; citizenship: string;
  veteranStatus: string; disabilityStatus: string; race: string;
  noticePeriod: string; expectedSalary: string; expectedCTC: string;
  totalExperience: string; currentLocation: string;
}

/* ── Profile ────────────────────────────────────────────────── */
async function getProfile(): Promise<Profile> {
  const base: Profile = {
    firstName: 'Julian', middleName: 'Kevin', lastName: 'Sudhan',
    name: 'Julian Kevin Sudhan',
    email: process.env.APPLY_EMAIL || 'kevinsudhan31@gmail.com',
    password: process.env.APPLY_PASSWORD || '',
    phone: '8939153390', altPhone: '9841714427',
    streetAddress: 'Chennai', city: 'Chennai', state: 'Tamil Nadu',
    zipCode: '600034', country: 'India',
    linkedin: 'https://www.linkedin.com/in/kevin-sudhan-482153263/',
    github: 'https://github.com/kevinsudhan',
    portfolio: 'https://resumekevin.netlify.app/',
    university: 'Anna University',
    college: 'Loyola ICAM College of Engineering and Technology',
    degree: "Bachelor's Degree",
    degreeFullName: 'B.E. in Electronics and Communication Engineering',
    major: 'Electronics and Communication Engineering',
    gpa: '7.8', gpaScale: '10',
    gradYear: '2025', gradMonth: 'May', gradDate: '2025-05-01',
    educationStartYear: '2021',
    gender: 'Male', nationality: 'Indian', citizenship: 'Indian',
    veteranStatus: 'I am not a protected veteran',
    disabilityStatus: 'I do not wish to answer',
    race: 'Decline to self-identify',
    noticePeriod: 'Immediate', expectedSalary: 'Negotiable',
    expectedCTC: '5-8 LPA', totalExperience: '1',
    currentLocation: 'Chennai, Tamil Nadu, India',
  };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('personal_details').select('data').eq('user_id', user.id).single();
      if (data?.data) {
        const d = data.data;
        if (d.firstName) base.firstName = d.firstName;
        if (d.lastName) base.lastName = d.lastName;
        if (d.middleName) base.middleName = d.middleName;
        if (d.email) base.email = d.email;
        if (d.phone) base.phone = d.phone;
        if (d.city) base.city = d.city;
        if (d.state) base.state = d.state;
        if (d.country) base.country = d.country;
        if (d.zipCode) base.zipCode = d.zipCode;
        if (d.linkedin) base.linkedin = d.linkedin;
        if (d.github) base.github = d.github;
        if (d.portfolio) base.portfolio = d.portfolio;
        if (d.gpa) base.gpa = d.gpa;
        if (d.gradYear) base.gradYear = d.gradYear;
        if (d.major) base.major = d.major;
        if (d.college) base.college = d.college;
        base.name = `${base.firstName} ${base.middleName} ${base.lastName}`.replace(/\s+/g, ' ').trim();
      }
    }
  } catch { /* use defaults */ }
  return base;
}

/* ── Helpers ────────────────────────────────────────────────── */
const wait = (page: Page, ms: number) => page.waitForTimeout(ms);

function parseSkillsFromLatex(latex: string): string[] {
  const match = latex.match(/\\resumeSkills\{([^}]*)\}/g) || [];
  const result: string[] = [];
  for (const m of match) {
    const inner = m.replace(/\\resumeSkills\{/, '').replace(/\}$/, '');
    inner.split(',').forEach(s => { const t = s.trim(); if (t) result.push(t); });
  }
  if (result.length) return result;
  const items = latex.match(/\\item\s+([^\n\\]+)/g) || [];
  items.forEach(i => { const t = i.replace(/\\item\s+/, '').trim(); if (t.length > 1 && t.length < 40) result.push(t); });
  return result.slice(0, 15);
}

interface WorkExp { role: string; company: string; location: string; startDate: string; endDate: string; description: string; }
function parseExperienceFromLatex(latex: string): WorkExp[] {
  const entries: WorkExp[] = [];
  const parts = latex.split(/\\resumeSubheading/i);
  for (const part of parts.slice(1)) {
    const args: string[] = [];
    let rem = part.trimStart();
    for (let i = 0; i < 4; i++) {
      const open = rem.indexOf('{');
      if (open === -1) break;
      let depth = 0, end = open;
      for (let c = open; c < rem.length; c++) {
        if (rem[c] === '{') depth++;
        if (rem[c] === '}') depth--;
        if (depth === 0) { end = c; break; }
      }
      args.push(rem.substring(open + 1, end).replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1').replace(/[\\{}]/g, '').trim());
      rem = rem.substring(end + 1);
    }
    const bullets: string[] = [];
    const bReg = /\\resumeItem\{([\s\S]*?)\}/g;
    let m;
    while ((m = bReg.exec(rem)) !== null) {
      bullets.push(m[1].replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1').replace(/[\\{}]/g, '').trim());
    }
    if (args[0]) {
      entries.push({
        role: args[0] || '', company: args[2] || '', location: args[3] || '',
        startDate: (args[1] || '').split('--')[0].trim(),
        endDate: (args[1] || '').split('--')[1]?.trim() || 'Present',
        description: bullets.join(' | '),
      });
    }
  }
  return entries;
}

/* ── Workday-specific dropdown (custom combobox, not native select) ── */
async function wdDropdown(page: Page, fieldId: string, searchText: string, steps: string[]): Promise<boolean> {
  const selectors = [
    `[data-automation-id="${fieldId}"] input`,
    `input[data-automation-id="${fieldId}"]`,
    `[data-automation-id="${fieldId}"]`,
  ];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el || !await el.isVisible().catch(() => false)) continue;
      await el.scrollIntoViewIfNeeded();
      await el.click();
      await wait(page, 300);
      await el.fill('');
      await page.keyboard.type(searchText, { delay: 40 });
      await wait(page, 1500);

      // Try to click a matching option from the listbox
      const optionSelectors = [
        `[role="option"]:has-text("${searchText}")`,
        `[role="listbox"] li:has-text("${searchText}")`,
        `ul[role="listbox"] [role="option"]:has-text("${searchText}")`,
        `[data-automation-id="promptOption"]:has-text("${searchText}")`,
        `[class*="menu"] [class*="option"]:has-text("${searchText}")`,
      ];
      for (const oSel of optionSelectors) {
        const opt = await page.$(oSel);
        if (opt && await opt.isVisible().catch(() => false)) {
          await opt.click();
          steps.push(`Selected "${searchText}" in ${fieldId}`);
          await wait(page, 400);
          return true;
        }
      }
      // Fallback: first visible option
      const firstOpt = await page.$('[role="option"]:visible, [data-automation-id="promptOption"]:visible');
      if (firstOpt) {
        const text = await firstOpt.textContent().catch(() => '');
        await firstOpt.click();
        steps.push(`Selected first option "${text?.trim()}" in ${fieldId}`);
        await wait(page, 400);
        return true;
      }
      await page.keyboard.press('ArrowDown');
      await wait(page, 200);
      await page.keyboard.press('Enter');
      return true;
    } catch { /* try next */ }
  }
  return false;
}

/* Fill a native <select> or Workday custom dropdown by visible text */
async function wdSelect(page: Page, selector: string, value: string, steps: string[]): Promise<boolean> {
  try {
    const el = await page.$(selector);
    if (!el || !await el.isVisible().catch(() => false)) return false;
    const tag = await el.evaluate(e => e.tagName.toLowerCase());
    if (tag === 'select') {
      const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() })));
      const match = opts.find(o => o.t.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(o.t.toLowerCase()));
      if (match?.v) { await el.selectOption(match.v); steps.push(`Select "${value}" via ${selector}`); return true; }
    } else {
      return wdDropdown(page, selector.replace(/[\[\]"]/g, ''), value, steps);
    }
  } catch { /* skip */ }
  return false;
}

/* Fill a text input only if currently empty */
async function wdFill(page: Page, selector: string, value: string, steps: string[], force = false): Promise<boolean> {
  try {
    const el = await page.$(selector);
    if (!el || !await el.isVisible().catch(() => false)) return false;
    const cur = await el.inputValue().catch(() => '');
    if (!force && cur.length > 0) return true; // already filled
    await el.scrollIntoViewIfNeeded();
    await el.fill(value);
    steps.push(`Filled "${value}" → ${selector}`);
    await wait(page, 200);
    return true;
  } catch { return false; }
}

/* Click a button by partial text */
async function wdClickBtn(page: Page, texts: string[], steps: string[], timeout = 5000): Promise<boolean> {
  for (const text of texts) {
    try {
      const btn = page.getByRole('button', { name: new RegExp(text, 'i') }).first();
      await btn.waitFor({ state: 'visible', timeout }).catch(() => {});
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        steps.push(`Clicked "${text}"`);
        await wait(page, 1500);
        return true;
      }
    } catch { /* try next */ }
  }
  return false;
}

/* Upload resume to any visible file input */
async function wdUploadResume(page: Page, pdfBuffer: Buffer, steps: string[]): Promise<boolean> {
  try {
    const inputs = await page.$$('input[type="file"]');
    for (const inp of inputs) {
      const accept = (await inp.getAttribute('accept') || '').toLowerCase();
      const name = (await inp.getAttribute('name') || '').toLowerCase();
      if (name.includes('cover') && !name.includes('resume')) continue;
      if (accept && !accept.includes('pdf') && !accept.includes('*')) continue;
      await inp.setInputFiles({ name: 'Kevin_Sudhan_Resume.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
      steps.push('📄 Uploaded resume PDF');
      await wait(page, 3000);
      return true;
    }
    steps.push('⚠️ No file input found for resume upload');
    return false;
  } catch (e) { steps.push(`Resume upload error: ${(e as Error).message}`); return false; }
}

/* Add a single skill via Workday typeahead */
async function wdAddSkill(page: Page, skill: string, steps: string[]): Promise<boolean> {
  const inputs = [
    '[data-automation-id="skillsTypeaheadInput"] input',
    '[data-automation-id="skillInput"] input',
    'input[placeholder*="skill" i]',
    'input[aria-label*="skill" i]',
  ];
  for (const sel of inputs) {
    try {
      const inp = await page.$(sel);
      if (!inp || !await inp.isVisible().catch(() => false)) continue;
      await inp.fill('');
      await page.keyboard.type(skill, { delay: 40 });
      await wait(page, 1200);
      const opt = await page.$(`[role="option"]:has-text("${skill}"), [data-automation-id="promptOption"]:has-text("${skill}")`);
      if (opt && await opt.isVisible().catch(() => false)) {
        await opt.click();
        steps.push(`➕ Added skill: ${skill}`);
        await wait(page, 400);
        return true;
      }
      const first = await page.$('[role="option"]:visible, [data-automation-id="promptOption"]:visible');
      if (first) { await first.click(); steps.push(`➕ Added skill (closest match): ${skill}`); await wait(page, 400); return true; }
      await inp.press('Escape');
      return false;
    } catch { /* try next */ }
  }
  return false;
}

/* Click Save and Continue / Next on current page */
async function wdClickNext(page: Page, steps: string[]): Promise<boolean> {
  return wdClickBtn(page, ['Save and Continue', 'Save & Continue', 'Next', 'Continue', 'Proceed'], steps, 8000);
}

/* Detect which Workday step we're on */
async function detectStep(page: Page): Promise<string> {
  try {
    const h = await page.evaluate(() => {
      const selectors = ['h1', 'h2', '[data-automation-id*="heading"]', '.css-1k9yrb8', '[aria-current="step"]'];
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el && el.textContent?.trim()) return el.textContent.trim().toLowerCase();
      }
      return document.title.toLowerCase();
    });
    if (/my information|contact info|personal info/i.test(h)) return 'myInformation';
    if (/my experience|work experience/i.test(h)) return 'myExperience';
    if (/application question|questionnaire|additional info/i.test(h)) return 'questions';
    if (/voluntary|disclosure|equal employ|self.?identif/i.test(h)) return 'disclosures';
    if (/review|summary|preview/i.test(h)) return 'review';
  } catch { /* ignore */ }
  return 'unknown';
}

/* ── MY INFORMATION ─────────────────────────────────────────── */
async function fillMyInformation(page: Page, profile: Profile, steps: string[]): Promise<void> {
  steps.push('📋 Filling My Information...');

  // "How did you hear about us?" — optional, pick first/any option
  const sourceSelectors = [
    '[data-automation-id="source"]', '[data-automation-id="referralSource"]',
    'select[id*="source" i]', 'select[name*="source" i]',
  ];
  for (const sel of sourceSelectors) {
    const el = await page.$(sel);
    if (el && await el.isVisible().catch(() => false)) {
      const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() }))).catch(() => []);
      const job = opts.find(o => /job board|portal|online|website|internet|linkedin/i.test(o.t));
      if (job?.v) await el.selectOption(job.v).catch(() => {});
      else if (opts.length > 1) await el.selectOption(opts[1].v).catch(() => {});
      steps.push('Selected referral source');
      break;
    }
  }

  // Legal name
  const firstNameSelectors = [
    'input[data-automation-id="legalNameSection_firstName"]',
    'input[data-automation-id="firstName"]',
    'input[name*="firstName" i]', 'input[id*="firstName" i]',
    'input[aria-label*="first name" i]', 'input[placeholder*="first name" i]',
  ];
  for (const sel of firstNameSelectors) { if (await wdFill(page, sel, profile.firstName, steps)) break; }

  const lastNameSelectors = [
    'input[data-automation-id="legalNameSection_lastName"]',
    'input[data-automation-id="lastName"]',
    'input[name*="lastName" i]', 'input[id*="lastName" i]',
    'input[aria-label*="last name" i]', 'input[placeholder*="last name" i]',
  ];
  for (const sel of lastNameSelectors) { if (await wdFill(page, sel, profile.lastName, steps)) break; }

  const middleNameSelectors = [
    'input[data-automation-id="legalNameSection_middleName"]',
    'input[data-automation-id="middleName"]',
    'input[name*="middleName" i]', 'input[id*="middleName" i]',
  ];
  for (const sel of middleNameSelectors) { if (await wdFill(page, sel, profile.middleName, steps)) break; }

  // Address — country first (triggers state/city dropdowns)
  await wait(page, 500);
  const countrySelectors = [
    '[data-automation-id="country"] input', '[data-automation-id="countryDropdown"] input',
    'select[data-automation-id="country"]', '[data-automation-id="addressSection_country"] input',
  ];
  for (const sel of countrySelectors) {
    if (await wdFill(page, sel, 'India', steps)) { await wdDropdown(page, 'country', 'India', steps); break; }
  }
  await wait(page, 1000);

  // Address line
  const addrSelectors = [
    'input[data-automation-id="addressSection_addressLine1"]',
    'input[data-automation-id="addressLine1"]',
    'input[name*="address" i]', 'input[id*="address" i]', 'input[placeholder*="address" i]',
  ];
  for (const sel of addrSelectors) { if (await wdFill(page, sel, profile.streetAddress, steps)) break; }

  // State
  const stateSelectors = [
    '[data-automation-id="addressSection_stateDropdown"] input',
    '[data-automation-id="stateDropdown"] input',
    'select[data-automation-id="state"]', 'input[name*="state" i]',
  ];
  for (const sel of stateSelectors) {
    const el = await page.$(sel);
    if (!el || !await el.isVisible().catch(() => false)) continue;
    await el.fill('Tamil Nadu');
    await wait(page, 1200);
    const opt = await page.$('[role="option"]:has-text("Tamil Nadu"), [role="option"]:has-text("TN")');
    if (opt) { await opt.click(); steps.push('Selected state: Tamil Nadu'); }
    break;
  }

  // City
  const citySelectors = [
    'input[data-automation-id="addressSection_city"]', 'input[data-automation-id="city"]',
    'input[name*="city" i]', 'input[id*="city" i]', 'input[placeholder*="city" i]',
  ];
  for (const sel of citySelectors) { if (await wdFill(page, sel, profile.city, steps)) break; }

  // Zip
  const zipSelectors = [
    'input[data-automation-id="addressSection_postalCode"]', 'input[data-automation-id="postalCode"]',
    'input[name*="zip" i]', 'input[name*="postal" i]', 'input[placeholder*="zip" i]', 'input[placeholder*="postal" i]',
  ];
  for (const sel of zipSelectors) { if (await wdFill(page, sel, profile.zipCode, steps)) break; }

  // Phone
  const phoneSelectors = [
    'input[data-automation-id="phone"]', 'input[data-automation-id="phoneNumber"]',
    'input[type="tel"]', 'input[name*="phone" i]', 'input[placeholder*="phone" i]',
  ];
  for (const sel of phoneSelectors) { if (await wdFill(page, sel, profile.phone, steps)) break; }

  // Phone device type (Mobile)
  const phoneTypeSelectors = [
    'select[data-automation-id="phoneDeviceType"]', 'select[data-automation-id="phoneType"]',
    'select[name*="phoneType" i]',
  ];
  for (const sel of phoneTypeSelectors) {
    const el = await page.$(sel);
    if (el && await el.isVisible().catch(() => false)) {
      const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() }))).catch(() => []);
      const mobile = opts.find(o => /mobile|cell/i.test(o.t));
      if (mobile?.v) { await el.selectOption(mobile.v); steps.push('Selected phone type: Mobile'); }
      break;
    }
  }

  // Email (usually pre-filled by Google auth, but try anyway)
  const emailSelectors = [
    'input[data-automation-id="email"]', 'input[type="email"]',
    'input[name*="email" i]', 'input[placeholder*="email" i]',
  ];
  for (const sel of emailSelectors) { if (await wdFill(page, sel, profile.email, steps)) break; }

  await wait(page, 500);
  steps.push('✅ My Information filled');
}

/* ── MY EXPERIENCE ──────────────────────────────────────────── */
async function fillMyExperience(
  page: Page, profile: Profile, pdfBuffer: Buffer | null,
  skills: string[], resumeSections: { experience?: string; projects?: string },
  steps: string[]
): Promise<void> {
  steps.push('📋 Filling My Experience...');

  // 1. Upload resume (if upload section is visible here)
  const resumeUploadBtn = await page.$('[data-automation-id="Resume_Section_Add_Button"], [data-automation-id="upload-resume-button"], button:has-text("Upload My Resume"), button:has-text("Upload Resume")');
  if (resumeUploadBtn && pdfBuffer && await resumeUploadBtn.isVisible().catch(() => false)) {
    await resumeUploadBtn.click();
    await wait(page, 1500);
    await wdUploadResume(page, pdfBuffer, steps);
    await wdClickBtn(page, ['OK', 'Done', 'Continue', 'Close'], steps, 5000);
  } else if (pdfBuffer) {
    await wdUploadResume(page, pdfBuffer, steps);
  }

  // 2. Work Experience — add entries from tailored resume
  const workExps = resumeSections.experience ? parseExperienceFromLatex(resumeSections.experience) : [];

  const addWorkBtns = [
    '[data-automation-id="Add Work Experience"]',
    'button:has-text("Add Work Experience")',
    'button:has-text("Add a Work Experience")',
    '[data-automation-id="workExperienceSection"] button:has-text("Add")',
  ];

  for (let ei = 0; ei < Math.min(workExps.length, 2); ei++) {
    const exp = workExps[ei];
    let clicked = false;
    for (const sel of addWorkBtns) {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible().catch(() => false)) { await btn.click(); clicked = true; break; }
    }
    if (!clicked) break;
    await wait(page, 2000);

    // Job title
    const titleSels = ['input[data-automation-id="jobTitle"]', 'input[data-automation-id="title"]', 'input[placeholder*="title" i]', 'input[name*="title" i]'];
    for (const s of titleSels) { if (await wdFill(page, s, exp.role || 'Software Engineer Intern', steps)) break; }

    // Company
    const companySels = ['input[data-automation-id="company"]', 'input[data-automation-id="employerName"]', 'input[placeholder*="company" i]', 'input[name*="company" i]', 'input[name*="employer" i]'];
    for (const s of companySels) { if (await wdFill(page, s, exp.company || 'Intern Project', steps)) break; }

    // Location
    const locSels = ['input[data-automation-id="location"]', 'input[placeholder*="location" i]', 'input[name*="location" i]'];
    for (const s of locSels) { if (await wdFill(page, s, exp.location || 'Chennai, India', steps)) break; }

    // Start date (month/year)
    const startParts = exp.startDate.split(/[\s,/-]/);
    const startYear = startParts.find(p => /^\d{4}$/.test(p)) || '2024';
    const startMonthSels = ['select[data-automation-id="startMonth"]', 'select[name*="startMonth" i]'];
    for (const s of startMonthSels) {
      const el = await page.$(s);
      if (el && await el.isVisible().catch(() => false)) {
        const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: o.textContent || '' }))).catch(() => []);
        const m = opts.find(o => /jun|june/i.test(o.t));
        if (m?.v) await el.selectOption(m.v);
        break;
      }
    }
    const startYearSels = ['input[data-automation-id="startYear"]', 'input[name*="startYear" i]', 'input[placeholder*="year" i]'];
    for (const s of startYearSels) { if (await wdFill(page, s, startYear, steps, true)) break; }

    // "Currently work here" checkbox → only if most recent
    if (ei === 0) {
      const currentCb = await page.$('input[data-automation-id="currentlyWorkHere"], input[name*="current" i][type="checkbox"]');
      if (currentCb && !await currentCb.isChecked().catch(() => false)) {
        await currentCb.check().catch(() => {});
        steps.push('Checked "Currently work here"');
      }
    }

    // Description
    const descSels = ['textarea[data-automation-id="description"]', 'textarea[name*="description" i]', 'textarea[placeholder*="description" i]', 'textarea[placeholder*="responsibilit" i]'];
    for (const s of descSels) { if (await wdFill(page, s, exp.description || 'Developed software applications using modern technologies.', steps)) break; }

    await wdClickBtn(page, ['Save', 'OK', 'Done', 'Add'], steps, 5000);
    await wait(page, 1000);
  }

  // 3. Education
  const addEduBtns = [
    '[data-automation-id="Add Education"]', 'button:has-text("Add Education")',
    '[data-automation-id="educationSection"] button:has-text("Add")',
  ];
  let addedEdu = false;
  for (const sel of addEduBtns) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible().catch(() => false)) { await btn.click(); addedEdu = true; break; }
  }
  if (addedEdu) {
    await wait(page, 2000);

    // School name
    const schoolSels = ['input[data-automation-id="school"]', 'input[data-automation-id="schoolName"]', 'input[placeholder*="school" i]', 'input[placeholder*="university" i]', 'input[name*="school" i]'];
    for (const s of schoolSels) { if (await wdFill(page, s, profile.college, steps)) break; }

    // Degree
    await wdDropdown(page, 'degree', "Bachelor's", steps);

    // Field of study
    const majorSels = ['input[data-automation-id="fieldOfStudy"]', '[data-automation-id="fieldOfStudyDropdown"] input', 'input[name*="field" i]', 'input[placeholder*="field of study" i]', 'input[placeholder*="major" i]'];
    for (const s of majorSels) {
      const el = await page.$(s);
      if (!el || !await el.isVisible().catch(() => false)) continue;
      await el.fill('Electronics');
      await wait(page, 1200);
      const opt = await page.$('[role="option"]:has-text("Electronics"), [role="option"]:has-text("Electrical"), [role="option"]:has-text("Engineering")');
      if (opt) { await opt.click(); steps.push('Selected field of study'); }
      break;
    }

    // GPA
    const gpaSels = ['input[data-automation-id="gpa"]', 'input[name*="gpa" i]', 'input[placeholder*="gpa" i]', 'input[placeholder*="grade" i]'];
    for (const s of gpaSels) { if (await wdFill(page, s, profile.gpa, steps)) break; }

    // Start & end year
    const eduStartSels = ['input[data-automation-id="startYear"]', 'input[name*="fromYear" i]', 'input[placeholder*="from year" i]'];
    for (const s of eduStartSels) { if (await wdFill(page, s, profile.educationStartYear, steps, true)) break; }
    const eduEndSels = ['input[data-automation-id="endYear"]', 'input[name*="toYear" i]', 'input[placeholder*="to year" i]', 'input[placeholder*="graduation year" i]'];
    for (const s of eduEndSels) { if (await wdFill(page, s, profile.gradYear, steps, true)) break; }

    await wdClickBtn(page, ['Save', 'OK', 'Done', 'Add'], steps, 5000);
    await wait(page, 1000);
  }

  // 4. Skills
  const skillsToAdd = skills.slice(0, 10);
  for (const skill of skillsToAdd) {
    const added = await wdAddSkill(page, skill, steps);
    if (!added) {
      // Try clicking "Add a Skill" button first
      const addSkillBtn = await page.$('[data-automation-id="Add Skill"], button:has-text("Add a Skill"), button:has-text("Add Skill")');
      if (addSkillBtn && await addSkillBtn.isVisible().catch(() => false)) {
        await addSkillBtn.click();
        await wait(page, 1500);
        await wdAddSkill(page, skill, steps);
        await wdClickBtn(page, ['Save', 'OK', 'Add'], steps, 3000);
      }
    }
    await wait(page, 300);
  }

  // 5. Social links
  const linkConfigs = [
    { id: 'linkedin', value: profile.linkedin, label: 'LinkedIn' },
    { id: 'gitHub', value: profile.github, label: 'GitHub' },
    { id: 'portfolio', value: profile.portfolio, label: 'Portfolio' },
  ];
  for (const lc of linkConfigs) {
    const inputSels = [
      `input[data-automation-id="${lc.id}"]`,
      `input[name*="${lc.id}" i]`, `input[placeholder*="${lc.label}" i]`,
      `input[aria-label*="${lc.label}" i]`,
    ];
    for (const s of inputSels) { if (await wdFill(page, s, lc.value, steps)) break; }
  }

  // "Add" buttons for links section
  const addLinkBtn = await page.$('[data-automation-id="Add Website"] , button:has-text("Add Website"), button:has-text("Add Link"), button:has-text("Add a Website")');
  if (addLinkBtn && await addLinkBtn.isVisible().catch(() => false)) {
    for (const lc of linkConfigs) {
      await addLinkBtn.click().catch(() => {});
      await wait(page, 1500);
      const urlInput = await page.$('input[data-automation-id="url"], input[placeholder*="url" i], input[placeholder*="http" i], input[type="url"]');
      if (urlInput && await urlInput.isVisible().catch(() => false)) {
        await urlInput.fill(lc.value);
        steps.push(`Added ${lc.label} link`);
        await wdClickBtn(page, ['Save', 'Add', 'OK'], steps, 3000);
      }
      await wait(page, 500);
    }
  }

  steps.push('✅ My Experience filled');
}

/* ── DISCLOSURES & YES/NO QUESTIONS ─────────────────────────── */
async function fillDisclosuresAndQuestions(page: Page, profile: Profile, steps: string[]): Promise<void> {
  steps.push('📋 Filling disclosures & application questions...');
  const YES_PAT = [/legally.?authorized/i, /authorized.?to.?work/i, /right.?to.?work/i, /willing.?to.?relocate/i, /background.?check/i, /18.?years/i, /complete.*degree/i, /terms/i, /agree/i, /consent/i];
  const NO_PAT = [/require.?visa/i, /require.?sponsor/i, /need.?sponsor/i, /h.?1b/i, /previously.?employed/i, /convicted/i];
  const DECLINE_PAT = [/gender/i, /race/i, /ethnic/i, /veteran/i, /disabilit/i, /eeo/i, /self.?identif/i];

  function answer(ctx: string): 'yes' | 'no' | 'decline' | null {
    for (const p of YES_PAT) if (p.test(ctx)) return 'yes';
    for (const p of NO_PAT) if (p.test(ctx)) return 'no';
    for (const p of DECLINE_PAT) if (p.test(ctx)) return 'decline';
    return null;
  }

  // Gender (Workday disclosure)
  const genderSels = ['select[data-automation-id="gender"]', 'select[name*="gender" i]'];
  for (const sel of genderSels) {
    const el = await page.$(sel);
    if (!el || !await el.isVisible().catch(() => false)) continue;
    const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() }))).catch(() => []);
    const m = opts.find(o => /^male$/i.test(o.t));
    if (m?.v) { await el.selectOption(m.v); steps.push('Selected gender: Male'); }
    break;
  }

  // Race/ethnicity — decline
  const raceSels = ['select[data-automation-id="race"]', 'select[data-automation-id="ethnicity"]', 'select[name*="race" i]', 'select[name*="ethnic" i]'];
  for (const sel of raceSels) {
    const el = await page.$(sel);
    if (!el || !await el.isVisible().catch(() => false)) continue;
    const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() }))).catch(() => []);
    const d = opts.find(o => /decline|prefer not|not wish|not disclose|choose not/i.test(o.t));
    if (d?.v) { await el.selectOption(d.v); steps.push('Selected race: Decline'); }
    break;
  }

  // Veteran — not a protected veteran
  const vetSels = ['select[data-automation-id="veteranStatus"]', 'select[name*="veteran" i]'];
  for (const sel of vetSels) {
    const el = await page.$(sel);
    if (!el || !await el.isVisible().catch(() => false)) continue;
    const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() }))).catch(() => []);
    const nv = opts.find(o => /not.?a.?protected|not.?veteran|do not identify/i.test(o.t));
    if (nv?.v) { await el.selectOption(nv.v); steps.push('Selected veteran: Not a protected veteran'); }
    break;
  }

  // Disability — choose not to self-identify
  const disSels = ['select[data-automation-id="disability"]', 'select[name*="disabilit" i]'];
  for (const sel of disSels) {
    const el = await page.$(sel);
    if (!el || !await el.isVisible().catch(() => false)) continue;
    const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() }))).catch(() => []);
    const d = opts.find(o => /not.?wish|choose not|decline|do not disclose/i.test(o.t));
    if (d?.v) { await el.selectOption(d.v); steps.push('Selected disability: Prefer not to say'); }
    break;
  }

  // All selects on page
  const selects = await page.$$('select:visible');
  for (const sel of selects) {
    try {
      const cur = await sel.inputValue().catch(() => '');
      if (cur && cur !== '' && cur !== '--') continue;
      const ctx = await sel.evaluate(el => {
        const p = el.closest('.field, .form-group, [data-automation-id]');
        return (p?.textContent || el.getAttribute('name') || el.id || '').substring(0, 200);
      }).catch(() => '');
      const ans = answer(ctx);
      if (!ans) continue;
      const opts = await sel.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').toLowerCase().trim() }))).catch(() => []);
      let target = null;
      if (ans === 'yes') target = opts.find(o => /^(yes|true|i agree)/.test(o.t));
      else if (ans === 'no') target = opts.find(o => /^(no|false)/.test(o.t));
      else target = opts.find(o => /decline|prefer not|not wish/.test(o.t));
      if (target?.v) { await sel.selectOption(target.v); steps.push(`✅ Answered: ${ctx.substring(0, 30)}... → ${ans}`); }
    } catch { /* skip */ }
  }

  // Radio buttons
  const radios = await page.$$('input[type="radio"]:visible');
  for (const r of radios) {
    try {
      if (await r.isChecked().catch(() => false)) continue;
      const ctx = await r.evaluate(el => { const g = el.closest('[role="radiogroup"], fieldset, .form-group'); return g?.textContent?.substring(0, 200) || ''; }).catch(() => '');
      const ans = answer(ctx);
      if (!ans) continue;
      const label = await r.evaluate(el => { const l = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null); return (l?.textContent || el.getAttribute('value') || '').toLowerCase().trim(); }).catch(() => '');
      if ((ans === 'yes' && /^(yes|true|i.?agree)/.test(label)) ||
          (ans === 'no' && /^(no|false)/.test(label)) ||
          (ans === 'decline' && /decline|prefer.?not|not.?wish/.test(label))) {
        await r.check().catch(() => {});
        steps.push(`🔘 Radio ${ans}: ${ctx.substring(0, 30)}...`);
      }
    } catch { /* skip */ }
  }

  // Checkboxes (terms, consent, etc.)
  const checkboxes = await page.$$('input[type="checkbox"]:visible');
  for (const cb of checkboxes) {
    try {
      if (await cb.isChecked().catch(() => false)) continue;
      const ctx = await cb.evaluate(el => { const l = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null); const p = el.closest('.field, .form-group'); return (l?.textContent || p?.textContent || el.getAttribute('name') || '').toLowerCase().substring(0, 200); }).catch(() => '');
      if (/term|agree|consent|privacy|accept|acknowledge|certif|i.?have.?read|authorize|background/.test(ctx)) {
        await cb.check().catch(() => {});
        steps.push(`☑️ Checked: ${ctx.substring(0, 40)}...`);
      }
    } catch { /* skip */ }
  }

  steps.push('✅ Disclosures filled');
}

/* ── MAIN ORCHESTRATOR ──────────────────────────────────────── */
async function runWorkdayAutomation(opts: {
  jobUrl: string; pdfBase64?: string; coverLetter?: string;
  jobSkills?: string[]; resumeSections?: { experience?: string; projects?: string; skills?: string };
  jobInfo?: { company?: string; role?: string };
}): Promise<ApplyResult> {
  const steps: string[] = [];
  let browser: Browser | null = null;

  try {
    const profile = await getProfile();
    const pdfBuffer = opts.pdfBase64 ? Buffer.from(opts.pdfBase64, 'base64') : null;

    // Skills: prefer tailored resume skills → fallback to job required skills → defaults
    const latexSkills = opts.resumeSections?.skills ? parseSkillsFromLatex(opts.resumeSections.skills) : [];
    const skills = latexSkills.length > 0 ? latexSkills : (opts.jobSkills || ['Python', 'JavaScript', 'React', 'Node.js', 'TypeScript', 'SQL', 'Git', 'AWS', 'Docker']);

    // Try CDP connection first (if Chrome is running with --remote-debugging-port=9222)
    let usingCDP = false;
    try {
      browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 2000 });
      usingCDP = true;
      steps.push('✅ Connected to your Chrome browser (same window)');
    } catch {
      browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--start-maximized', '--no-sandbox'],
      });
      steps.push('🌐 Opened new browser window for automation');
    }

    const context = usingCDP ? (browser.contexts()[0] || await (browser as any).newContext()) : await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1400, height: 900 },
    });

    // If CDP: check if the job URL is already open in a tab
    let page: Page | null = null;
    if (usingCDP) {
      const pages = context.pages();
      for (const p of pages) {
        const url = p.url();
        if (url.includes(new URL(opts.jobUrl).hostname)) { page = p; break; }
      }
    }
    if (!page) {
      page = await context.newPage();
      await page.goto(opts.jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    steps.push(`🌐 Navigated to: ${opts.jobUrl}`);
    await wait(page, 3000);

    // Dismiss cookie banners
    const cookieBtns = ['button:has-text("Accept All")', 'button:has-text("Accept")', 'button:has-text("Got it")', '#onetrust-accept-btn-handler'];
    for (const sel of cookieBtns) {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible().catch(() => false)) { await btn.click(); await wait(page, 800); break; }
    }

    // ── Step 1: Find and click Apply ────────────────────────────
    steps.push('🔍 Looking for Apply button...');
    const applySelectors = [
      '[data-automation-id="Apply"]', '[data-automation-id="Start Your Application"]',
      'button:has-text("Start Your Application")', 'a:has-text("Start Your Application")',
      'button:has-text("Apply Now")', 'a:has-text("Apply Now")',
      'button:has-text("Apply")', 'a:has-text("Apply")',
    ];
    let clickedApply = false;
    for (const sel of applySelectors) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible().catch(() => false)) {
          await btn.click();
          steps.push('✅ Clicked Apply button');
          clickedApply = true;
          await wait(page, 3000);
          break;
        }
      } catch { /* continue */ }
    }
    if (!clickedApply) steps.push('⚠️ Apply button not found — may already be on application form');

    // ── Step 2: Handle Apply popup / modal ──────────────────────
    // Look for "Autofill with Resume" option
    const autofillBtn = await page.$('button:has-text("Autofill with Resume"), button:has-text("Autofill with resume"), [data-automation-id="autofillWithResume"]');
    if (autofillBtn && pdfBuffer && await autofillBtn.isVisible().catch(() => false)) {
      steps.push('📄 Found "Autofill with Resume" — uploading resume...');
      await autofillBtn.click();
      await wait(page, 2000);
      await wdUploadResume(page, pdfBuffer, steps);
      await wdClickBtn(page, ['Continue', 'Next', 'OK', 'Submit'], steps, 8000);
      await wait(page, 4000);
      steps.push('✅ Resume uploaded for autofill — waiting for parsing...');
    } else {
      // Try "Use a new form" or direct continue
      await wdClickBtn(page, ['Fill out a new form', 'Apply Manually', 'Continue'], steps, 3000);
    }

    // ── Step 3: Authentication ───────────────────────────────────
    await wait(page, 2000);
    const googleSignIn = await page.$('button:has-text("Sign in with Google"), a:has-text("Sign in with Google"), [data-automation-id="signInWithGoogle"]');
    if (googleSignIn && await googleSignIn.isVisible().catch(() => false)) {
      steps.push('🔐 Clicking "Sign in with Google"...');
      const [popup] = await Promise.all([
        context.waitForEvent('page', { timeout: 8000 }).catch(() => null),
        googleSignIn.click(),
      ]);
      if (popup) {
        steps.push('🔐 Google auth popup opened — please complete sign-in (waiting up to 2 min)...');
        await popup.waitForEvent('close', { timeout: 120000 }).catch(() => {});
        steps.push('✅ Auth window closed — continuing...');
      }
      await wait(page, 5000);
    }

    // Email/password login as fallback
    const emailSignIn = await page.$('button:has-text("Sign In"), a:has-text("Sign In"), button:has-text("Log In")');
    if (emailSignIn && await emailSignIn.isVisible().catch(() => false)) {
      await emailSignIn.click();
      await wait(page, 1500);
      const emailInput = await page.$('input[type="email"]');
      const pwInput = await page.$('input[type="password"]');
      if (emailInput) { await emailInput.fill(profile.email); steps.push('Entered email'); }
      if (pwInput) { await pwInput.fill(profile.password); steps.push('Entered password'); }
      if (emailInput || pwInput) await wdClickBtn(page, ['Sign In', 'Log In', 'Submit', 'Continue'], steps);
      await wait(page, 3000);
    }

    // ── Step 4: Loop through form pages ─────────────────────────
    steps.push('🔄 Starting multi-step form fill...');
    for (let stepNum = 0; stepNum < 8; stepNum++) {
      await wait(page, 2000);
      const currentStep = await detectStep(page);
      steps.push(`📍 Detected step: ${currentStep}`);

      if (currentStep === 'myInformation') {
        await fillMyInformation(page, profile, steps);
        await wait(page, 500);
        await wdClickNext(page, steps);
      } else if (currentStep === 'myExperience') {
        await fillMyExperience(page, profile, pdfBuffer, skills, opts.resumeSections || {}, steps);
        await wait(page, 500);
        await wdClickNext(page, steps);
      } else if (currentStep === 'questions' || currentStep === 'disclosures') {
        await fillDisclosuresAndQuestions(page, profile, steps);
        await wait(page, 500);
        await wdClickNext(page, steps);
      } else if (currentStep === 'review') {
        steps.push('👀 Reached Review page — stopping for your review. Submit when ready.');
        break;
      } else {
        // Unknown step — try to fill visible fields and advance
        await fillDisclosuresAndQuestions(page, profile, steps);
        const advanced = await wdClickNext(page, steps);
        if (!advanced) { steps.push('⚠️ Could not advance — stopping here'); break; }
      }
    }

    steps.push('🎉 Workday automation complete! Please review and submit.');
    return { status: 'partial', message: 'Automation complete. Please review the form and click Submit.', steps };
  } catch (err: any) {
    console.error('Workday automation error:', err);
    steps.push(`❌ Error: ${err.message}`);
    return { status: 'failed', message: err.message || 'Workday automation failed', steps };
  }
  // Note: browser stays open intentionally so user can review and submit
}

/* ── POST Handler ───────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.jobUrl) return NextResponse.json({ status: 'failed', message: 'jobUrl is required', steps: [] }, { status: 400 });
    const result = await runWorkdayAutomation(body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ status: 'failed', message: err.message || 'Internal error', steps: [] }, { status: 500 });
  }
}
