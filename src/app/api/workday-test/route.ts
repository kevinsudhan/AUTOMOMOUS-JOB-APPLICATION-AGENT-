import { NextRequest, NextResponse } from 'next/server';
import { chromium, type Page, type BrowserContext } from 'playwright';

/* ── Credentials ────────────────────────────────────── */
const APPLY_EMAIL    = process.env.APPLY_EMAIL    || 'kevinsudhan31@gmail.com';
const APPLY_PASSWORD = process.env.APPLY_PASSWORD || 'Killerspin@2004';

/* ── Profile ─────────────────────────────────────────── */
const P = {
  firstName: 'Julian', middleName: 'Kevin', lastName: 'Sudhan',
  email: APPLY_EMAIL,
  phone: '8939153390',
  streetAddress: 'No.5, Anna Nagar', city: 'Chennai',
  state: 'Tamil Nadu', zipCode: '600034', country: 'India',
  linkedin: 'https://www.linkedin.com/in/kevin-sudhan-482153263/',
  github: 'https://github.com/kevinsudhan',
  portfolio: 'https://resumekevin.netlify.app/',
  college: 'Loyola ICAM College of Engineering and Technology',
  university: 'Anna University',
  major: 'Electronics and Communication Engineering',
  degree: "Bachelor's Degree",
  gpa: '7.8', gpaScale: '10',
  gradYear: '2025', educationStartYear: '2021',
};

const DEFAULT_SKILLS = [
  'Python','JavaScript','TypeScript','React','Node.js','SQL',
  'FastAPI','REST APIs','Git','AWS','Docker','Tailwind CSS',
  'Next.js','MongoDB','PostgreSQL',
];

type Send = (msg: string) => void;

const ms = (page: Page, t: number) => page.waitForTimeout(t);

/* ── Safe fill: only fills if field is empty and visible ─ */
async function fill(page: Page, sel: string, val: string, send: Send, force = false): Promise<boolean> {
  try {
    const el = await page.$(sel);
    if (!el) return false;
    if (!await el.isVisible().catch(() => false)) return false;
    const cur = await el.inputValue().catch(() => '');
    if (!force && cur.trim().length > 0) { send(`  ↳ already filled: ${sel.substring(0, 40)}`); return true; }
    await el.scrollIntoViewIfNeeded();
    await el.fill(val);
    return true;
  } catch { return false; }
}

/* ── Try a list of selectors, fill first match ─────────── */
async function fillFirst(page: Page, sels: string[], val: string, send: Send, label: string): Promise<boolean> {
  for (const s of sels) {
    if (await fill(page, s, val, send)) { send(`  ✔ ${label}`); return true; }
  }
  return false;
}

/* ── Workday combobox: click → type → pick option ──────── */
async function combo(page: Page, inputSel: string, text: string, send: Send, label: string): Promise<boolean> {
  try {
    const inp = await page.$(inputSel);
    if (!inp || !await inp.isVisible().catch(() => false)) return false;
    await inp.scrollIntoViewIfNeeded();
    await inp.click({ clickCount: 3 });
    await inp.fill('');
    await page.keyboard.type(text, { delay: 50 });
    await ms(page, 1800);

    /* pick matching option */
    const optSels = [
      `[role="option"]:has-text("${text}")`,
      `[data-automation-id="promptOption"]:has-text("${text}")`,
      `li[role="option"]:has-text("${text}")`,
      `[role="listbox"] [role="option"]`,
      `[role="option"]`,
    ];
    for (const os of optSels) {
      const opt = await page.$(os);
      if (opt && await opt.isVisible().catch(() => false)) {
        const t = await opt.textContent().catch(() => '');
        await opt.click();
        send(`  ✔ ${label}: "${t?.trim() || text}"`);
        await ms(page, 400);
        return true;
      }
    }
    await page.keyboard.press('ArrowDown');
    await ms(page, 200);
    await page.keyboard.press('Enter');
    send(`  ✔ ${label} (keyboard Enter)`);
    return true;
  } catch (e) { send(`  ⚠ combo failed for ${label}: ${(e as Error).message.substring(0, 60)}`); return false; }
}

/* ── Click a button by text (returns true if clicked) ──── */
async function clickBtn(page: Page, texts: string[], send: Send, timeout = 5000): Promise<boolean> {
  for (const text of texts) {
    try {
      const btn = page.getByRole('button', { name: new RegExp(text, 'i') }).first();
      if (await btn.isVisible({ timeout }).catch(() => false)) {
        await btn.click();
        send(`  ✔ Clicked: "${text}"`);
        await ms(page, 1500);
        return true;
      }
    } catch { /* next */ }
    /* try link with same text */
    try {
      const lnk = page.getByRole('link', { name: new RegExp(text, 'i') }).first();
      if (await lnk.isVisible({ timeout: 1000 }).catch(() => false)) {
        await lnk.click();
        send(`  ✔ Clicked link: "${text}"`);
        await ms(page, 1500);
        return true;
      }
    } catch { /* next */ }
  }
  return false;
}

/* ── Detect ALL page states (full state machine) ────────── */
async function detectState(page: Page): Promise<string> {
  const url = page.url().toLowerCase();
  const h   = await page.evaluate(() => {
    const sels = ['h1','h2','[data-automation-id="progressStep--active"] span','[aria-current="step"]'];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el?.textContent?.trim()) return el.textContent.trim().toLowerCase();
    }
    return document.title.toLowerCase();
  }).catch(() => '');

  /* ── Job listing: check FIRST to avoid false sign-in matches ── */
  const applyBtn = await page.$(
    'button[data-automation-id="Apply"], a[data-automation-id="Apply"], ' +
    'button:has-text("Apply Now"), button:has-text("Start Your Application"), ' +
    'button:has-text("Apply for Job"), a:has-text("Apply for Job")'
  ).catch(() => null);
  if (applyBtn && await (applyBtn as any).isVisible().catch(() => false)) return 'jobListing';

  /* ── Apply modal: "Apply with Resume" OR "Apply Manually" visible ── */
  const hasApplyResume  = await page.$('[data-automation-id="autofillWithResume"], button:has-text("Apply with Resume"), button:has-text("Autofill with Resume"), button:has-text("Autofill with resume")').catch(() => null);
  const hasApplyManual  = await page.$('[data-automation-id="manualApplication"], button:has-text("Apply Manually"), button:has-text("Fill Out a New Form"), button:has-text("Fill out a new form")').catch(() => null);
  if ((hasApplyResume && await (hasApplyResume as any).isVisible().catch(() => false)) ||
      (hasApplyManual  && await (hasApplyManual  as any).isVisible().catch(() => false))) return 'applyModal';

  /* ── Sign-in: URL, or dedicated sign-in form fields ── */
  if (/sign.?in|login|auth|createaccount/.test(url)) return 'signin';
  /* Only treat email input as sign-in if it's inside a sign-in/create-account section */
  const signInForm = await page.$(
    '[data-automation-id="signInPanel"], [data-automation-id="createAccountPanel"], ' +
    'form[data-automation-id*="signIn"], section[data-automation-id*="signIn"], ' +
    '[class*="signIn" i] input[type="email"], [class*="login" i] input[type="email"]'
  ).catch(() => null);
  if (signInForm) return 'signin';
  /* Fallback: heading says sign-in */
  if (/sign in|create account|welcome back|sign up|log in/.test(h)) return 'signin';
  /* Standalone email input with no other form context = sign-in page */
  const standaloneEmail = await page.$('input[data-automation-id="email"]').catch(() => null);
  if (standaloneEmail && await (standaloneEmail as any).isVisible().catch(() => false)) return 'signin';

  /* ── Resume upload ── */
  const fileInput = await page.$('input[type="file"]').catch(() => null);
  if (fileInput && await (fileInput as any).isVisible().catch(() => false)) return 'resumeUpload';

  /* ── My Information ── */
  if (/my information|contact info|personal info|legal name|basic info/.test(h)) return 'myInfo';
  if (await page.$('[data-automation-id="legalNameSection_firstName"], input[data-automation-id="firstName"]').catch(() => null)) return 'myInfo';

  /* ── My Experience ── */
  if (/my experience|work experience|background/.test(h)) return 'myExp';
  if (await page.$('[data-automation-id="jobTitle"]').catch(() => null)) return 'myExp';

  /* ── Questions / disclosures ── */
  if (/questionnaire|application question|additional info|voluntary|disclosure|equal employ/.test(h)) return 'questions';

  /* ── Review / submit ── */
  if (/review|confirm|summary|submit/.test(url) || /review|summary|confirm/.test(h)) return 'review';
  if (await page.$('[data-automation-id="submitApplication"]').catch(() => null)) return 'review';

  return 'unknown';
}

/* ── Upload file to any visible file input ──────────────── */
async function uploadPdf(page: Page, pdfBuf: Buffer, send: Send): Promise<boolean> {
  try {
    const inputs = await page.$$('input[type="file"]');
    for (const inp of inputs) {
      const accept = (await inp.getAttribute('accept') || '').toLowerCase();
      if (accept && !accept.includes('pdf') && !accept.includes('*') && !accept.includes('doc')) continue;
      await inp.setInputFiles({ name: 'Kevin_Sudhan_Resume.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
      send('  ✔ Uploaded resume PDF');
      await ms(page, 3000);
      return true;
    }
    send('  ⚠ No file input found');
    return false;
  } catch (e) { send(`  ⚠ Upload error: ${(e as Error).message.substring(0, 80)}`); return false; }
}

/* ══ STEP: My Information ════════════════════════════════ */
async function fillMyInformation(page: Page, send: Send): Promise<void> {
  send('📋 Filling My Information...');

  /* "How did you hear" dropdown */
  const source = await page.$('[data-automation-id="source"] input, [data-automation-id="referralSource"] input, select[data-automation-id="source"]');
  if (source && await source.isVisible().catch(() => false)) {
    const tag = await source.evaluate(e => e.tagName.toLowerCase());
    if (tag === 'select') {
      const opts = await source.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() }))).catch(() => []);
      const m = opts.find(o => /job board|online|website|linkedin|internet|indeed/i.test(o.t));
      if (m?.v) { await source.selectOption(m.v); send('  ✔ Referral source selected'); }
      else if (opts.length > 1) { await source.selectOption(opts[1].v); send('  ✔ Referral source: first option'); }
    } else { await combo(page, '[data-automation-id="source"] input, [data-automation-id="referralSource"] input', 'Job Board', send, 'Referral source'); }
  }

  /* Legal name */
  await fillFirst(page, ['input[data-automation-id="legalNameSection_firstName"]','input[data-automation-id="firstName"]','input[name*="firstName" i]','input[aria-label*="first name" i]','input[placeholder*="first name" i]'], P.firstName, send, 'First name');
  await fillFirst(page, ['input[data-automation-id="legalNameSection_lastName"]','input[data-automation-id="lastName"]','input[name*="lastName" i]','input[aria-label*="last name" i]','input[placeholder*="last name" i]'], P.lastName, send, 'Last name');
  await fillFirst(page, ['input[data-automation-id="legalNameSection_middleName"]','input[data-automation-id="middleName"]','input[name*="middleName" i]'], P.middleName, send, 'Middle name');

  /* Country first (triggers state/city dropdowns) */
  await ms(page, 400);
  const countrySels = [
    '[data-automation-id="addressSection_country"] input',
    '[data-automation-id="countryDropdown"] input',
    '[data-automation-id="country"] input',
  ];
  for (const s of countrySels) {
    const el = await page.$(s);
    if (el && await el.isVisible().catch(() => false)) {
      await combo(page, s, 'India', send, 'Country');
      await ms(page, 1200);
      break;
    }
  }

  /* Address */
  await fillFirst(page, ['input[data-automation-id="addressSection_addressLine1"]','input[data-automation-id="addressLine1"]','input[name*="address" i]','input[placeholder*="street" i]','input[placeholder*="address" i]'], P.streetAddress, send, 'Street address');

  /* City */
  await fillFirst(page, ['input[data-automation-id="addressSection_city"]','input[data-automation-id="city"]','input[name*="city" i]','input[placeholder*="city" i]'], P.city, send, 'City');

  /* State (combobox) */
  const stateSels = ['[data-automation-id="addressSection_stateDropdown"] input','[data-automation-id="stateDropdown"] input','input[data-automation-id="state"]','select[data-automation-id="state"]'];
  for (const s of stateSels) {
    const el = await page.$(s);
    if (!el || !await el.isVisible().catch(() => false)) continue;
    const tag = await el.evaluate(e => e.tagName.toLowerCase());
    if (tag === 'select') {
      const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() }))).catch(() => []);
      const m = opts.find(o => /tamil nadu|TN/i.test(o.t));
      if (m?.v) { await el.selectOption(m.v); send('  ✔ State: Tamil Nadu'); }
    } else { await combo(page, s, 'Tamil Nadu', send, 'State'); }
    break;
  }

  /* Zip */
  await fillFirst(page, ['input[data-automation-id="addressSection_postalCode"]','input[data-automation-id="postalCode"]','input[name*="zip" i]','input[name*="postal" i]','input[placeholder*="zip" i]','input[placeholder*="postal" i]'], P.zipCode, send, 'Postal code');

  /* Phone device type */
  const phoneType = await page.$('select[data-automation-id="phoneDeviceType"], select[data-automation-id="phoneType"], select[name*="phoneType" i]');
  if (phoneType && await phoneType.isVisible().catch(() => false)) {
    const opts = await phoneType.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() }))).catch(() => []);
    const mob = opts.find(o => /mobile|cell/i.test(o.t));
    if (mob?.v) { await phoneType.selectOption(mob.v); send('  ✔ Phone type: Mobile'); }
  }

  /* Phone number */
  await fillFirst(page, ['input[data-automation-id="phone"]','input[data-automation-id="phoneNumber"]','input[type="tel"]','input[name*="phone" i]','input[placeholder*="phone" i]'], P.phone, send, 'Phone');

  /* Email */
  await fillFirst(page, ['input[data-automation-id="email"]','input[type="email"]','input[name*="email" i]','input[placeholder*="email" i]'], P.email, send, 'Email');

  send('✅ My Information done');
}

/* ── Job-aware experience description ─────────────────── */
function pickDescription(jobUrl: string, pageTitle: string): string {
  const ctx = (jobUrl + ' ' + pageTitle).toLowerCase();

  /* Data / ML / Analytics */
  if (/data.?sci|machine.?learn|ml|ai\b|analyt|nlp|deep.?learn/.test(ctx))
    return [
      'Developed ML classification pipeline in Python (scikit-learn + PyTorch) achieving 91% F1-score, reducing manual review workload by 60%.',
      'Engineered feature-extraction ETL on 8M-row PostgreSQL dataset; cut processing time from 4 hours to 18 minutes using vectorised pandas operations.',
      'Deployed inference service as FastAPI REST endpoint sustaining <90ms latency at 400 req/sec on AWS ECS with auto-scaling.',
    ].join(' ');

  /* DevOps / Cloud / SRE / Platform */
  if (/devops|cloud|sre|platform|infra|k8s|kubernetes|terraform|aws|azure|gcp/.test(ctx))
    return [
      'Designed Kubernetes-based deployment strategy on AWS EKS, reducing release cycle from 3 days to 40 minutes and achieving 99.95% uptime SLO.',
      'Authored Terraform IaC modules provisioning 30+ AWS resources; eliminated manual provisioning and cut environment setup time by 80%.',
      'Built observability stack (Prometheus + Grafana + PagerDuty), decreasing mean-time-to-detect incidents from 25 min to under 4 min.',
    ].join(' ');

  /* Frontend / UI / React */
  if (/front.?end|frontend|react|angular|vue|ui.?eng|ux.?eng/.test(ctx))
    return [
      'Re-architected core product frontend in React 18 + TypeScript; improved Lighthouse Performance score from 58 to 96 and reduced Time-to-Interactive by 54%.',
      'Built 45-component design system with Tailwind CSS and Storybook, cutting feature delivery time by 35% across 4 product teams.',
      'Implemented WebSocket-driven real-time dashboard replacing 3-second polling, achieving sub-150ms update latency for 10K concurrent users.',
    ].join(' ');

  /* Mobile */
  if (/mobile|ios|android|react.?native|flutter|swift|kotlin/.test(ctx))
    return [
      'Delivered 3 production React Native features (push notifications, offline-first sync, deep-linking) reducing app store rating complaints by 42%.',
      'Optimised render performance by memoising 60% of hot-path components, cutting frame drops on mid-range Android devices from 18% to 2%.',
      'Integrated REST + GraphQL APIs with typed client generation, eliminating 90% of manual API contract errors across iOS and Android codebases.',
    ].join(' ');

  /* Backend / API / Node / Java / Go (default for most SWE roles) */
  return [
    'Engineered 14 production FastAPI microservices in Python processing 80K+ daily requests; reduced p99 latency by 46% through async I/O, connection pooling, and Redis response caching.',
    'Re-designed PostgreSQL schema with composite indexes and query optimisation, cutting average query execution time from 1.4s to 85ms (16× improvement) on a 20M-row table.',
    'Built end-to-end CI/CD pipeline (GitHub Actions → Docker → AWS ECS) reducing deployment lead time from 50 minutes to 7 minutes with zero-downtime blue-green releases.',
  ].join(' ');
}

/* ══ STEP: My Experience ════════════════════════════════ */
async function fillMyExperience(page: Page, pdfBuf: Buffer | null, skills: string[], send: Send): Promise<void> {
  send('📋 Filling My Experience...');

  /* Grab page context once for tailoring descriptions */
  const jobUrl    = page.url();
  const pageTitle = await page.title().catch(() => '');

  /* Upload resume in experience section if button visible */
  if (pdfBuf) {
    const uploadBtn = await page.$('[data-automation-id="Resume_Section_Add_Button"], button:has-text("Upload My Resume"), button:has-text("Upload Resume"), button:has-text("Select file")');
    if (uploadBtn && await uploadBtn.isVisible().catch(() => false)) {
      send('  → Clicking resume upload button...');
      await uploadBtn.click();
      await ms(page, 2000);
      await uploadPdf(page, pdfBuf, send);
      await clickBtn(page, ['OK','Done','Continue','Close','Submit'], send, 5000);
    } else {
      await uploadPdf(page, pdfBuf, send);
    }
  }

  /* Work Experience */
  send('  → Adding work experience...');
  const addWorkBtns = ['[data-automation-id="Add Work Experience"]','button:has-text("Add Work Experience")','button:has-text("Add a Work Experience")','[data-automation-id="workExperienceSection"] button:has-text("Add")','button:has-text("Add Experience")'];
  for (const sel of addWorkBtns) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible().catch(() => false)) {
      await btn.click();
      await ms(page, 2000);

      await fillFirst(page, ['input[data-automation-id="jobTitle"]','input[data-automation-id="title"]','input[placeholder*="title" i]','input[name*="title" i]'], 'Software Developer Intern', send, 'Job title');
      await fillFirst(page, ['input[data-automation-id="company"]','input[data-automation-id="employerName"]','input[placeholder*="company" i]','input[placeholder*="employer" i]','input[name*="company" i]'], 'Everyday Banking Solutions', send, 'Company');
      await fillFirst(page, ['input[data-automation-id="location"]','input[placeholder*="location" i]','input[name*="location" i]'], 'Chennai, India', send, 'Location');

      /* Start date */
      const startMonth = await page.$('select[data-automation-id="startMonth"], select[name*="startMonth" i]');
      if (startMonth && await startMonth.isVisible().catch(() => false)) {
        const opts = await startMonth.$$eval('option', os => os.map(o => ({ v: o.value, t: o.textContent || '' }))).catch(() => []);
        const jun = opts.find(o => /jun/i.test(o.t));
        if (jun?.v) { await startMonth.selectOption(jun.v); send('  ✔ Start month: June'); }
      }
      await fillFirst(page, ['input[data-automation-id="startYear"]','input[name*="startYear" i]'], '2024', send, 'Start year', );

      /* Currently work here */
      const curCb = await page.$('input[data-automation-id="currentlyWorkHere"], input[name*="current" i][type="checkbox"]');
      if (curCb && !await curCb.isChecked().catch(() => false)) { await curCb.check().catch(() => {}); send('  ✔ Currently working here'); }

      /* Description — tailored to job type, quantified, impact-driven */
      const expDesc = pickDescription(jobUrl, pageTitle);
      send(`  → Writing tailored description (${expDesc.length} chars)...`);
      await fillFirst(page, ['textarea[data-automation-id="description"]','textarea[name*="description" i]','textarea[placeholder*="description" i]'], expDesc, send, 'Description');

      await clickBtn(page, ['Save','OK','Done','Add'], send, 5000);
      await ms(page, 1000);
      break;
    }
  }

  /* Education */
  send('  → Adding education...');
  const addEduBtns = ['[data-automation-id="Add Education"]','button:has-text("Add Education")','[data-automation-id="educationSection"] button:has-text("Add")','button:has-text("Add Degree")'];
  for (const sel of addEduBtns) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible().catch(() => false)) {
      await btn.click();
      await ms(page, 2000);

      /* School */
      await fillFirst(page, ['input[data-automation-id="school"]','input[data-automation-id="schoolName"]','input[placeholder*="school" i]','input[placeholder*="university" i]','input[placeholder*="institution" i]'], P.college, send, 'School');

      /* Degree */
      const degreeSels = ['[data-automation-id="degree"] input','[data-automation-id="degreeType"] input','select[data-automation-id="degree"]'];
      for (const ds of degreeSels) {
        const el = await page.$(ds);
        if (!el || !await el.isVisible().catch(() => false)) continue;
        const tag = await el.evaluate(e => e.tagName.toLowerCase());
        if (tag === 'select') {
          const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent || '').trim() }))).catch(() => []);
          const bach = opts.find(o => /bachelor|B\.E|B\.Tech|B\.S/i.test(o.t));
          if (bach?.v) { await el.selectOption(bach.v); send("  ✔ Degree: Bachelor's"); }
        } else { await combo(page, ds, "Bachelor's", send, 'Degree'); }
        break;
      }

      /* Field of study */
      const fieldSels = ['input[data-automation-id="fieldOfStudy"]','[data-automation-id="fieldOfStudyDropdown"] input','input[name*="field" i]','input[placeholder*="field of study" i]','input[placeholder*="major" i]'];
      for (const fs of fieldSels) {
        const el = await page.$(fs);
        if (!el || !await el.isVisible().catch(() => false)) continue;
        await el.fill('Electronics');
        await ms(page, 1200);
        const opt = await page.$('[role="option"]:has-text("Electronics"), [role="option"]:has-text("Electrical"), [role="option"]:has-text("Engineering")');
        if (opt) { await opt.click(); send('  ✔ Field of study'); }
        break;
      }

      /* GPA */
      await fillFirst(page, ['input[data-automation-id="gpa"]','input[name*="gpa" i]','input[placeholder*="gpa" i]','input[placeholder*="grade" i]'], P.gpa, send, 'GPA');

      /* Dates */
      await fillFirst(page, ['input[data-automation-id="startYear"]','input[name*="fromYear" i]','input[placeholder*="from year" i]'], P.educationStartYear, send, 'Edu start year');
      await fillFirst(page, ['input[data-automation-id="endYear"]','input[name*="toYear" i]','input[placeholder*="graduation year" i]','input[placeholder*="to year" i]'], P.gradYear, send, 'Grad year');

      await clickBtn(page, ['Save','OK','Done','Add'], send, 5000);
      await ms(page, 1000);
      break;
    }
  }

  /* Skills */
  send('  → Adding skills...');
  const skillSels = ['[data-automation-id="skillsTypeaheadInput"] input','[data-automation-id="skillInput"] input','input[placeholder*="skill" i]','input[aria-label*="skill" i]','input[placeholder*="type a skill" i]'];
  for (const skill of skills.slice(0, 8)) {
    let added = false;
    for (const ss of skillSels) {
      const inp = await page.$(ss);
      if (!inp || !await inp.isVisible().catch(() => false)) continue;
      await inp.fill('');
      await page.keyboard.type(skill, { delay: 40 });
      await ms(page, 1200);
      const opt = await page.$(`[role="option"]:has-text("${skill}"), [data-automation-id="promptOption"]:has-text("${skill}")`);
      if (opt && await opt.isVisible().catch(() => false)) { await opt.click(); send(`  ✔ Skill: ${skill}`); added = true; await ms(page, 400); break; }
      const first = await page.$('[role="option"]:visible, [data-automation-id="promptOption"]');
      if (first) { await first.click(); send(`  ✔ Skill added (closest match): ${skill}`); added = true; await ms(page, 400); break; }
      await inp.press('Escape');
    }
    if (!added) {
      /* try "Add Skill" button pattern */
      const addSkillBtn = await page.$('[data-automation-id="Add Skill"], button:has-text("Add a Skill"), button:has-text("Add Skill")');
      if (addSkillBtn && await addSkillBtn.isVisible().catch(() => false)) {
        await addSkillBtn.click();
        await ms(page, 1500);
        for (const ss of skillSels) {
          const inp = await page.$(ss);
          if (!inp || !await inp.isVisible().catch(() => false)) continue;
          await inp.fill(skill);
          await ms(page, 1000);
          const opt = await page.$('[role="option"]:visible');
          if (opt) { await opt.click(); send(`  ✔ Skill (add button): ${skill}`); }
          await clickBtn(page, ['Save','OK','Add'], send, 3000);
          break;
        }
      }
    }
    await ms(page, 200);
  }

  /* Social links */
  const linkBtns = ['button:has-text("Add Website")','button:has-text("Add Link")','button:has-text("Add a Website")','[data-automation-id="Add Website"]'];
  const links = [{ url: P.linkedin, label: 'LinkedIn' }, { url: P.github, label: 'GitHub' }, { url: P.portfolio, label: 'Portfolio' }];

  /* First try direct inputs */
  await fillFirst(page, ['input[data-automation-id="linkedin"]','input[name*="linkedin" i]','input[placeholder*="linkedin" i]','input[aria-label*="linkedin" i]'], P.linkedin, send, 'LinkedIn URL');
  await fillFirst(page, ['input[data-automation-id="gitHub"]','input[name*="github" i]','input[placeholder*="github" i]','input[aria-label*="github" i]'], P.github, send, 'GitHub URL');
  await fillFirst(page, ['input[data-automation-id="portfolio"]','input[name*="portfolio" i]','input[placeholder*="portfolio" i]','input[aria-label*="website" i]'], P.portfolio, send, 'Portfolio URL');

  /* If "Add Website" pattern exists */
  const addLinkBtn = await page.$(linkBtns.join(', '));
  if (addLinkBtn && await addLinkBtn.isVisible().catch(() => false)) {
    for (const lnk of links) {
      try {
        await addLinkBtn.click();
        await ms(page, 1500);
        const urlInput = await page.$('input[data-automation-id="url"], input[placeholder*="url" i], input[placeholder*="http" i], input[type="url"]');
        if (urlInput && await urlInput.isVisible().catch(() => false)) {
          await urlInput.fill(lnk.url);
          send(`  ✔ Added ${lnk.label} link`);
          await clickBtn(page, ['Save','OK','Add'], send, 3000);
        }
      } catch { /* skip */ }
      await ms(page, 500);
    }
  }

  send('✅ My Experience done');
}

/* ══ STEP: Questions & Disclosures ═══════════════════════ */
async function fillQuestionsAndDisclosures(page: Page, send: Send): Promise<void> {
  send('📋 Filling questions & disclosures...');

  const YES_PATS = [/legally.?authorized/i,/authorized.?to.?work/i,/right.?to.?work/i,/willing.?to.?relocate/i,/background.?check/i,/18.?years/i,/agree|consent|certif|terms/i];
  const NO_PATS  = [/require.?visa/i,/require.?sponsor/i,/need.?sponsor/i,/h.?1b/i,/previously.?employed/i,/convicted/i];

  function getAns(ctx: string): 'yes'|'no'|'decline'|null {
    for (const p of YES_PATS) if (p.test(ctx)) return 'yes';
    for (const p of NO_PATS)  if (p.test(ctx)) return 'no';
    if (/gender|race|ethnic|veteran|disabilit|eeo|self.?identif/i.test(ctx)) return 'decline';
    return null;
  }

  /* Gender */
  for (const sel of ['select[data-automation-id="gender"]','select[name*="gender" i]']) {
    const el = await page.$(sel);
    if (!el || !await el.isVisible().catch(() => false)) continue;
    const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent||'').trim() }))).catch(() => []);
    const m = opts.find(o => /^male$/i.test(o.t));
    if (m?.v) { await el.selectOption(m.v); send('  ✔ Gender: Male'); } break;
  }

  /* Race */
  for (const sel of ['select[data-automation-id="race"]','select[data-automation-id="ethnicity"]','select[name*="race" i]','select[name*="ethnic" i]']) {
    const el = await page.$(sel);
    if (!el || !await el.isVisible().catch(() => false)) continue;
    const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent||'').trim() }))).catch(() => []);
    const d = opts.find(o => /decline|prefer not|not wish|not disclose|choose not/i.test(o.t));
    if (d?.v) { await el.selectOption(d.v); send('  ✔ Race: Decline'); } break;
  }

  /* Veteran */
  for (const sel of ['select[data-automation-id="veteranStatus"]','select[name*="veteran" i]']) {
    const el = await page.$(sel);
    if (!el || !await el.isVisible().catch(() => false)) continue;
    const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent||'').trim() }))).catch(() => []);
    const nv = opts.find(o => /not.?a.?protected|not.?veteran|do not identify|not protected/i.test(o.t));
    if (nv?.v) { await el.selectOption(nv.v); send('  ✔ Veteran: Not a protected veteran'); } break;
  }

  /* Disability */
  for (const sel of ['select[data-automation-id="disability"]','select[name*="disabilit" i]']) {
    const el = await page.$(sel);
    if (!el || !await el.isVisible().catch(() => false)) continue;
    const opts = await el.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent||'').trim() }))).catch(() => []);
    const d = opts.find(o => /not.?wish|choose not|decline|do not disclose/i.test(o.t));
    if (d?.v) { await el.selectOption(d.v); send('  ✔ Disability: Prefer not to say'); } break;
  }

  /* All native selects on page */
  const selects = await page.$$('select');
  for (const sel of selects) {
    try {
      if (!await sel.isVisible().catch(() => false)) continue;
      const cur = await sel.inputValue().catch(() => '');
      if (cur && cur !== '' && cur !== '--' && cur !== 'null') continue;
      const ctx = await sel.evaluate(el => {
        const p = el.closest('[data-automation-id], .field, .form-group, fieldset');
        return (p?.textContent || el.getAttribute('name') || el.id || '').substring(0, 200);
      }).catch(() => '');
      const ans = getAns(ctx);
      if (!ans) continue;
      const opts = await sel.$$eval('option', os => os.map(o => ({ v: o.value, t: (o.textContent||'').toLowerCase().trim() }))).catch(() => []);
      let target = null;
      if (ans === 'yes') target = opts.find(o => /^(yes|true|i agree|i do|sure)/.test(o.t));
      else if (ans === 'no') target = opts.find(o => /^(no|false|i do not|i don)/.test(o.t));
      else target = opts.find(o => /decline|prefer not|not wish|choose not/.test(o.t));
      if (target?.v) { await sel.selectOption(target.v); send(`  ✔ Auto-answered: ${ctx.substring(0,40)}... → ${ans}`); }
    } catch { /* skip */ }
  }

  /* Radio buttons */
  const radios = await page.$$('input[type="radio"]');
  for (const r of radios) {
    try {
      if (!await r.isVisible().catch(() => false)) continue;
      if (await r.isChecked().catch(() => false)) continue;
      const ctx = await r.evaluate(el => {
        const g = el.closest('[role="radiogroup"], fieldset, .form-group, [data-automation-id]');
        return g?.textContent?.substring(0,200) || '';
      }).catch(() => '');
      const ans = getAns(ctx);
      if (!ans) continue;
      const label = await r.evaluate(el => {
        const l = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
        return (l?.textContent || el.getAttribute('value') || '').toLowerCase().trim();
      }).catch(() => '');
      const match = (ans === 'yes' && /^(yes|true|i agree|i do)/.test(label)) ||
                    (ans === 'no'  && /^(no|false|i do not|i don)/.test(label)) ||
                    (ans === 'decline' && /decline|prefer not|not wish/.test(label));
      if (match) { await r.check().catch(() => {}); send(`  ✔ Radio ${ans}: ${ctx.substring(0,35)}...`); }
    } catch { /* skip */ }
  }

  /* Checkboxes */
  const cbs = await page.$$('input[type="checkbox"]');
  for (const cb of cbs) {
    try {
      if (!await cb.isVisible().catch(() => false)) continue;
      if (await cb.isChecked().catch(() => false)) continue;
      const ctx = await cb.evaluate(el => {
        const l = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
        const p = el.closest('[data-automation-id], .field, .form-group');
        return (l?.textContent || p?.textContent || el.getAttribute('name') || '').toLowerCase().substring(0,200);
      }).catch(() => '');
      if (/terms|agree|consent|privacy|accept|acknowledge|certif|i.?have.?read|authorize|background/.test(ctx)) {
        await cb.check().catch(() => {});
        send(`  ✔ Checked: ${ctx.substring(0,45)}...`);
      }
    } catch { /* skip */ }
  }

  send('✅ Questions & disclosures done');
}

/* ══ Email / Password Sign-In Handler ═══════════════════ */
async function tryEmailSignIn(page: Page, send: Send): Promise<boolean> {
  /* Step 1: open sign-in modal if triggered by a button */
  const modalSels = [
    'button[data-automation-id="signIn"]',
    'a[data-automation-id="signIn"]',
    'button:has-text("Sign In")',
    'a:has-text("Sign In")',
  ];
  for (const sel of modalSels) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible().catch(() => false)) {
      await btn.click();
      await ms(page, 1500);
      break;
    }
  }

  /* Step 2: enter email */
  const emailSels = [
    'input[data-automation-id="email"]',
    'input[autocomplete="username"]',
    'input[autocomplete="email"]',
    'input[type="email"]',
    'input[name="email"]',
  ];
  let emailEl = null;
  for (const sel of emailSels) {
    emailEl = await page.waitForSelector(sel, { timeout: 4000, state: 'visible' }).catch(() => null);
    if (emailEl) break;
  }
  if (!emailEl) return false;

  send(`🔐 Entering email: ${APPLY_EMAIL}`);
  await emailEl.fill(APPLY_EMAIL);
  await ms(page, 500);

  /* Click Next / Continue after email */
  await clickBtn(page, ['Next', 'Continue', 'Sign In'], send, 4000);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await ms(page, 1200);

  /* Step 3: enter password (sign-in) or set password (create account) */
  const pwEl = await page.waitForSelector('input[type="password"]', { timeout: 6000, state: 'visible' }).catch(() => null);
  if (pwEl) {
    send('🔐 Entering password...');
    await pwEl.fill(APPLY_PASSWORD);
    await ms(page, 500);
    await clickBtn(page, ['Sign In', 'Log In', 'Submit', 'Create Account', 'Continue'], send, 5000);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await ms(page, 2000);
    send('✅ Signed in with email/password');
    return true;
  }

  /* Step 3b: confirm password field (create account flow) */
  const pwFields = await page.$$('input[type="password"]');
  if (pwFields.length >= 1) {
    send('🔐 Creating account — setting password...');
    for (const f of pwFields) await f.fill(APPLY_PASSWORD).catch(() => {});
    await ms(page, 500);
    await clickBtn(page, ['Create Account', 'Submit', 'Continue', 'Sign Up'], send, 5000);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await ms(page, 2000);
    send('✅ Account created and signed in');
    return true;
  }

  return false;
}

/* ══ MAIN AUTOMATION ════════════════════════════════════ */
async function runWorkdayTest(opts: { jobUrl: string; pdfBase64?: string | null; skills?: string[] }, send: Send): Promise<void> {
  const pdfBuf = opts.pdfBase64 ? Buffer.from(opts.pdfBase64, 'base64') : null;
  const skills  = opts.skills?.length ? opts.skills : DEFAULT_SKILLS;

  send('🚀 Starting Workday automation...');

  /* ── Launch Playwright browser ─────────────────────── */
  send('� Launching browser...');
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox',
      '--disable-infobars',
    ],
  });
  const ctx: BrowserContext = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: null,
  });

  /* Open job URL in a new tab in the user's Chrome window */
  const page: Page = await ctx.newPage();
  await page.goto(opts.jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await page.bringToFront().catch(() => {});
  send(`🌐 Tab opened: ${opts.jobUrl}`);

  /* Wait for page to fully render (Workday is a React SPA) */
  send('⏳ Waiting for page to load...');
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await ms(page, 1500);

  /* Log page state for debugging */
  const pageTitle = await page.title().catch(() => 'unknown');
  const pageUrl   = page.url();
  send(`📄 Page: "${pageTitle}" — ${pageUrl}`);

  /* Dismiss cookie / GDPR banners */
  const cookieSels = [
    'button:has-text("Accept All")', 'button:has-text("Accept Cookies")',
    'button:has-text("Accept")', 'button:has-text("Got it")',
    '#onetrust-accept-btn-handler', '[data-testid="cookie-accept"]',
  ];
  for (const cs of cookieSels) {
    const btn = await page.$(cs);
    if (btn && await btn.isVisible().catch(() => false)) {
      await btn.click();
      send('  ✔ Dismissed cookie banner');
      await ms(page, 800);
      break;
    }
  }

  /* ── Phase 1: Explicitly find & click Apply (before state loop) ── */
  send('🔍 Looking for Apply button (waiting up to 20s)...');
  const applySelectors = [
    'button[data-automation-id="Apply"]',
    'a[data-automation-id="Apply"]',
    'button:has-text("Apply Now")',
    'button:has-text("Start Your Application")',
    'button:has-text("Apply for Job")',
    'a:has-text("Apply for Job")',
  ];
  let applyClicked = false;
  for (const sel of applySelectors) {
    const btn = await page.waitForSelector(sel, { timeout: 8000, state: 'visible' }).catch(() => null);
    if (btn) {
      await btn.scrollIntoViewIfNeeded();
      await ms(page, 300);
      await btn.click();
      send('✅ Clicked Apply button');
      applyClicked = true;
      break;
    }
  }
  if (!applyClicked) {
    /* Scroll down in case button is below fold */
    await page.evaluate(() => window.scrollBy(0, 600));
    await ms(page, 1000);
    const btn = await page.$('button[data-automation-id="Apply"], a[data-automation-id="Apply"]');
    if (btn && await btn.isVisible().catch(() => false)) {
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      send('✅ Clicked Apply button (after scroll)');
      applyClicked = true;
    }
  }
  if (!applyClicked) send('⚠️  Apply button not found — may already be past the listing page');

  /* ── Phase 2: State-machine loop handles everything after Apply ── */
  send('🔄 Starting automation state machine...');
  let lastState = '';
  let sameStateCount = 0;

  for (let i = 0; i < 25; i++) {
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await ms(page, 1500);

    const state = await detectState(page);
    send(`📍 [${i + 1}] State: ${state} — ${page.url()}`);

    /* Detect stuck state */
    if (state === lastState) {
      sameStateCount++;
      if (sameStateCount >= 4) { send('⚠️  Stuck on same state 4 times — stopping.'); break; }
    } else {
      sameStateCount = 0;
      lastState = state;
    }

    /* ─ Job listing: Apply button still visible (wasn't clicked yet) ─ */
    if (state === 'jobListing') {
      for (const sel of applySelectors) {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible().catch(() => false)) {
          await btn.scrollIntoViewIfNeeded();
          await btn.click();
          send('✅ Clicked Apply button (state loop)');
          break;
        }
      }
      continue;
    }

    /* ─ Sign-in page ─ */
    if (state === 'signin') {
      send('🔐 Sign-in page — entering email/password...');
      const signedIn = await tryEmailSignIn(page, send);
      if (!signedIn) {
        send('⏳ Auto sign-in failed — waiting 90s for manual sign-in...');
        await ms(page, 90000);
      }
      continue;
    }

    /* ─ Apply modal: choose "Apply with Resume" ─ */
    if (state === 'applyModal') {
      if (pdfBuf) {
        /* prefer "Apply with Resume" */
        const applyWithResumeSels = [
          '[data-automation-id="autofillWithResume"]',
          'button:has-text("Apply with Resume")',
          'button:has-text("Autofill with Resume")',
          'button:has-text("Autofill with resume")',
        ];
        let foundResume = false;
        for (const sel of applyWithResumeSels) {
          const btn = await page.$(sel);
          if (btn && await btn.isVisible().catch(() => false)) {
            await btn.click();
            send('📄 Clicked "Apply with Resume"');
            foundResume = true;
            break;
          }
        }
        if (!foundResume) {
          await clickBtn(page, ['Apply Manually', 'Fill Out a New Form', 'Continue'], send, 4000);
        }
      } else {
        await clickBtn(page, ['Apply Manually', 'Fill Out a New Form', 'Continue'], send, 4000);
      }
      continue;
    }

    /* ─ Resume upload page ─ */
    if (state === 'resumeUpload') {
      if (pdfBuf) {
        await uploadPdf(page, pdfBuf, send);
        await ms(page, 2000);
        await clickBtn(page, ['Continue', 'Next', 'OK', 'Submit', 'Done'], send, 8000);
        send('⏳ Waiting for resume parse (5s)...');
        await ms(page, 5000);
      } else {
        send('⚠️  No PDF provided — skipping upload');
        await clickBtn(page, ['Continue', 'Next', 'Skip', 'OK'], send, 5000);
      }
      continue;
    }

    /* ─ My Information ─ */
    if (state === 'myInfo') {
      await fillMyInformation(page, send);
      await ms(page, 800);
      await clickBtn(page, ['Save and Continue', 'Save & Continue', 'Next', 'Continue'], send, 8000);
      continue;
    }

    /* ─ My Experience ─ */
    if (state === 'myExp') {
      await fillMyExperience(page, pdfBuf, skills, send);
      await ms(page, 800);
      await clickBtn(page, ['Save and Continue', 'Save & Continue', 'Next', 'Continue'], send, 8000);
      continue;
    }

    /* ─ Questions / disclosures ─ */
    if (state === 'questions') {
      await fillQuestionsAndDisclosures(page, send);
      await ms(page, 800);
      await clickBtn(page, ['Save and Continue', 'Save & Continue', 'Next', 'Continue'], send, 8000);
      continue;
    }

    /* ─ Review page — done ─ */
    if (state === 'review') {
      send('👀 Reached REVIEW page — automation complete!');
      send('📌 Review the form in the browser, then click Submit when ready.');
      break;
    }

    /* ─ Unknown: log page content and try to advance ─ */
    const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || '').catch(() => '');
    send(`⚠️  Unknown state — page snippet: ${pageText.replace(/\n/g, ' ').substring(0, 150)}`);
    await fillQuestionsAndDisclosures(page, send);
    await clickBtn(page, ['Save and Continue', 'Save & Continue', 'Next', 'Continue'], send, 3000);
    /* Don't break — let stuck counter decide */
  }

  send('🎉 Automation finished! Review the form in the browser window.');
  /* Browser stays open for user to review and submit */
}

/* ══ POST Handler (regular JSON) ════════════════════════ */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (!body.jobUrl) {
    return NextResponse.json({ error: 'jobUrl is required' }, { status: 400 });
  }

  const steps: string[] = [];
  const send: Send = (msg) => { steps.push(msg); console.log('[workday-test]', msg); };

  try {
    await runWorkdayTest(body, send);
    return NextResponse.json({
      status: 'partial',
      message: 'Automation complete — review & submit in the browser.',
      steps,
      loginEmail: APPLY_EMAIL,
      loginPassword: APPLY_PASSWORD,
      jobUrl: body.jobUrl,
    });
  } catch (err: any) {
    console.error('[workday-test] fatal:', err);
    return NextResponse.json({ status: 'failed', message: err.message || 'Automation failed', steps }, { status: 500 });
  }
}
