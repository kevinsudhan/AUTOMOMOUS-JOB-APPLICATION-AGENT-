import { NextRequest, NextResponse } from 'next/server';
import { chromium, type Browser, type Page, type ElementHandle } from 'playwright';

interface ApplyResult {
  status: 'success' | 'partial' | 'failed';
  message: string;
  steps: string[];
  screenshotUrl?: string;
}

/* ================================================================
   COMPREHENSIVE APPLICANT PROFILE
   Covers all fields found in Workday, Greenhouse, Lever, LinkedIn
   Easy Apply, Naukri, Indeed, Taleo, iCIMS, SmartRecruiters, etc.
   ================================================================ */
function getProfile() {
  return {
    // --- Identity ---
    name: process.env.APPLY_NAME || 'Julian Kevin Sudhan',
    firstName: 'Julian',
    middleName: 'Kevin',
    lastName: 'Sudhan',
    fatherName: 'Patric John Vincent',
    motherName: 'Maria Lumina Sonia',

    // --- Contact ---
    email: process.env.APPLY_EMAIL || '',
    password: process.env.APPLY_PASSWORD || '',
    phone: process.env.APPLY_PHONE || '8939153390',
    altPhone: '9841714427',
    phoneCountryCode: '+91',
    countryCodeLabel: 'India (+91)',

    // --- Address ---
    streetAddress: 'Chennai',
    city: 'Chennai',
    state: 'Tamil Nadu',
    zipCode: '600034',
    country: 'India',

    // --- Online Profiles ---
    linkedin: process.env.APPLY_LINKEDIN || 'https://www.linkedin.com/in/kevin-sudhan-482153263/',
    github: process.env.APPLY_GITHUB || 'https://github.com/kevinsudhan',
    portfolio: process.env.APPLY_PORTFOLIO || 'https://resumekevin.netlify.app/',

    // --- Education ---
    university: 'Anna University',
    college: 'Loyola ICAM College of Engineering and Technology',
    degree: "Bachelor's Degree",
    degreeFullName: 'B.E. in Electronics and Communication Engineering',
    major: 'Electronics and Communication Engineering',
    gpa: '7.8',
    gpaScale: '10',
    gradMonth: 'May',
    gradYear: '2025',
    gradDate: '2025-05-01',
    educationStartYear: '2021',

    // --- Nationality & Legal ---
    nationality: 'Indian',
    citizenship: 'Indian',
    gender: 'Male',
    dateOfBirth: '2004-01-01',
    maritalStatus: 'Single',
    legallyAuthorized: true,
    requireVisa: false,
    willingToRelocate: true,
    willingToTravel: true,
    backgroundCheck: true,
    driversLicense: true,
    veteranStatus: 'I am not a protected veteran',
    disabilityStatus: 'I do not wish to answer',
    race: 'Decline to self-identify',

    // --- Work Preferences ---
    preferredLocations: ['Chennai', 'Bangalore', 'Hyderabad'],
    currentLocation: 'Chennai, Tamil Nadu, India',
    expectedSalary: 'Negotiable',
    expectedCTC: '5-8 LPA',
    noticePeriod: 'Immediate',
    availableStartDate: 'Immediately',
    totalExperience: '1',
    relevantExperience: '1',
    currentCTC: '0',

    // --- Languages ---
    languages: { English: 'Professional', Tamil: 'Native or bilingual', Hindi: 'Conversational' },

    // --- Technology Experience (years, for LinkedIn-style questions) ---
    techExperience: {
      Python: 2, JavaScript: 2, TypeScript: 1, React: 2, 'Node.js': 1,
      SQL: 1, FastAPI: 1, 'REST APIs': 2, Git: 2, AWS: 1,
      Docker: 1, 'Tailwind CSS': 1, 'Next.js': 1, MongoDB: 1,
      PostgreSQL: 1, 'Machine Learning': 1, 'Deep Learning': 1,
      'Computer Vision': 1, 'NLP': 1, Pandas: 1, NumPy: 1,
      default: 0,
    } as Record<string, number>,
  };
}

// Default skills for tag-input fields
const DEFAULT_SKILLS = [
  'Python', 'JavaScript', 'React', 'Node.js', 'SQL', 'FastAPI',
  'REST APIs', 'Git', 'AWS', 'Docker', 'Tailwind CSS', 'TypeScript',
  'LLM Integration', 'RAG Pipelines', 'Pandas', 'NumPy',
];

/* ================================================================
   EXHAUSTIVE FIELD DETECTION PATTERNS
   Ordered by specificity (most specific first to avoid false matches).
   Covers Workday, Greenhouse, Lever, LinkedIn, Naukri, Indeed,
   Taleo, iCIMS, SmartRecruiters, Jobvite, BambooHR, ADP, etc.
   ================================================================ */
const FIELD_PATTERNS: Record<string, string[]> = {
  // --- Auth ---
  confirmPassword: ['confirm.?password', 'retype.?password', 'repeat.?password', 're.?enter.?password', 'password.?confirm', 'verify.?password'],
  password: ['password'],

  // --- Identity (specific before generic) ---
  firstName: ['first.?name', 'fname', 'given.?name', 'first_name', 'forename'],
  lastName: ['last.?name', 'lname', 'surname', 'family.?name', 'last_name'],
  middleName: ['middle.?name', 'mname'],
  fullName: ['full.?name', 'your.?name', 'applicant.?name', 'candidate.?name'],
  fatherName: ['father', 'father.?s?.?name', 'guardian.?name', 'parent.?name'],
  motherName: ['mother', 'mother.?s?.?name'],

  // --- Contact ---
  email: ['email', 'e.?mail', 'email.?address'],
  altPhone: ['alt.?phone', 'alternate.?phone', 'secondary.?phone', 'emergency.?phone', 'home.?phone', 'landline', 'alternate.?number', 'secondary.?number', 'other.?phone'],
  phone: ['phone', 'mobile', 'tel', 'contact.?number', 'phone.?number', 'mobile.?number', 'cell.?phone', 'primary.?phone'],
  phoneCountryCode: ['country.?code', 'phone.?code', 'dial.?code', 'intl.?code'],

  // --- Address ---
  streetAddress: ['street', 'address.?line', 'address1', 'street.?address', 'mailing.?address', 'residential.?address'],
  city: ['city', 'town', 'municipality'],
  state: ['state', 'province', 'region', 'territory'],
  zipCode: ['zip', 'postal', 'pin.?code', 'pincode', 'zip.?code', 'postal.?code'],
  country: ['country', 'nation'],

  // --- Online Profiles ---
  linkedin: ['linkedin', 'linked.?in'],
  github: ['github', 'git.?hub', 'code.?repository'],
  portfolio: ['portfolio', 'personal.?website', 'personal.?site', 'web.?site', 'website.?url', 'blog'],

  // --- Education ---
  university: ['university', 'college', 'school', 'institution', 'alma.?mater'],
  degree: ['degree', 'qualification', 'level.?of.?education', 'education.?level', 'highest.?qualification', 'highest.?degree'],
  major: ['major', 'specialization', 'branch', 'stream', 'field.?of.?study', 'course', 'discipline'],
  gpa: ['gpa', 'cgpa', 'grade.?point', 'percentage', 'marks', 'score'],
  gradYear: ['graduation.?year', 'grad.?year', 'year.?of.?completion', 'passing.?year', 'completion.?year', 'year.?of.?passing', 'end.?year'],
  gradDate: ['graduation.?date', 'completion.?date', 'passing.?date'],
  educationStartYear: ['start.?year', 'from.?year', 'enrollment.?year', 'admission.?year'],

  // --- Work & Experience ---
  currentCompany: ['current.?company', 'current.?employer', 'present.?employer', 'company.?name'],
  currentTitle: ['current.?title', 'current.?role', 'current.?designation', 'current.?position', 'job.?title', 'designation'],
  totalExperience: ['total.?experience', 'years.?of.?experience', 'work.?experience', 'professional.?experience', 'how.?many.?years'],
  relevantExperience: ['relevant.?experience'],
  currentCTC: ['current.?ctc', 'current.?salary', 'present.?salary', 'current.?compensation'],

  // --- Preferences ---
  expectedSalary: ['expected.?salary', 'salary.?expectation', 'expected.?ctc', 'desired.?salary', 'compensation', 'expected.?compensation', 'salary', 'ctc'],
  noticePeriod: ['notice.?period', 'notice', 'joining.?period', 'earliest.?start', 'start.?date', 'availability', 'when.?can.?you.?start', 'available.?to.?start', 'joining.?date'],
  preferredLocation: ['preferred.?location', 'desired.?location', 'work.?location', 'location.?preference'],

  // --- Nationality & Legal ---
  nationality: ['nationality', 'national.?origin'],
  citizenship: ['citizenship', 'citizen'],
  gender: ['gender', 'sex'],
  dateOfBirth: ['date.?of.?birth', 'dob', 'birth.?date', 'birthday'],
  maritalStatus: ['marital', 'relationship.?status'],
  veteranStatus: ['veteran', 'military'],
  disabilityStatus: ['disability', 'disabled', 'handicap'],
  race: ['race', 'ethnicity', 'ethnic'],

  // --- Application Fields ---
  coverLetter: ['cover.?letter', 'motivation.?letter', 'letter.?of.?interest'],
  skills: ['skill', 'skills', 'competenc', 'technologies', 'tech.?stack', 'key.?skills'],
  languages: ['language', 'languages.?known', 'languages.?spoken'],
  referral: ['referral', 'referred.?by', 'hear.?about', 'how.?did.?you.?hear', 'source', 'found.?this.?job'],

  // --- Catch-all name (must be last) ---
  name: ['^name$', 'applicant.?name', 'candidate.?name'],
};

type Profile = ReturnType<typeof getProfile>;

function matchField(element: { name: string; id: string; label: string; placeholder: string; type: string; ariaLabel: string }): string | null {
  const searchText = `${element.name} ${element.id} ${element.label} ${element.placeholder} ${element.ariaLabel}`.toLowerCase();

  if (element.type === 'password') {
    for (const pattern of FIELD_PATTERNS.confirmPassword) {
      if (new RegExp(pattern, 'i').test(searchText)) return 'confirmPassword';
    }
    return 'password';
  }

  for (const [field, patterns] of Object.entries(FIELD_PATTERNS)) {
    if (field === 'password' || field === 'confirmPassword') continue;
    for (const pattern of patterns) {
      if (new RegExp(pattern, 'i').test(searchText)) return field;
    }
  }
  return null;
}

function getFieldValue(field: string, profile: Profile, extras: { coverLetter?: string }): string {
  const map: Record<string, string> = {
    // Auth
    password: profile.password,
    confirmPassword: profile.password,
    // Identity
    firstName: profile.firstName,
    lastName: profile.lastName,
    middleName: profile.middleName,
    fullName: profile.name,
    name: profile.name,
    fatherName: profile.fatherName,
    motherName: profile.motherName,
    // Contact
    email: profile.email,
    phone: profile.phone,
    altPhone: profile.altPhone,
    phoneCountryCode: profile.phoneCountryCode,
    // Address
    streetAddress: profile.streetAddress,
    city: profile.city,
    state: profile.state,
    zipCode: profile.zipCode,
    country: profile.country,
    // Online
    linkedin: profile.linkedin,
    github: profile.github,
    portfolio: profile.portfolio,
    // Education
    university: profile.college,
    degree: profile.degree,
    major: profile.major,
    gpa: profile.gpa,
    gradYear: profile.gradYear,
    gradDate: profile.gradDate,
    educationStartYear: profile.educationStartYear,
    // Work
    currentCompany: 'Fresher',
    currentTitle: 'Software Engineer',
    totalExperience: profile.totalExperience,
    relevantExperience: profile.relevantExperience,
    currentCTC: profile.currentCTC,
    // Preferences
    expectedSalary: profile.expectedSalary,
    noticePeriod: profile.noticePeriod,
    preferredLocation: profile.preferredLocations.join(', '),
    // Legal
    nationality: profile.nationality,
    citizenship: profile.citizenship,
    gender: profile.gender,
    dateOfBirth: profile.dateOfBirth,
    maritalStatus: profile.maritalStatus,
    veteranStatus: profile.veteranStatus,
    disabilityStatus: profile.disabilityStatus,
    race: profile.race,
    // Application
    coverLetter: extras.coverLetter || '',
    referral: 'Job Portal',
    languages: 'English (Professional), Tamil (Native), Hindi (Conversational)',
  };
  return map[field] || '';
}

// Wait helper
async function safeWait(page: Page, ms: number) {
  await page.waitForTimeout(ms);
}

// Handle phone number fields (strip country code prefix, handle intl inputs)
async function fillPhoneField(page: Page, input: ElementHandle, phone: string, steps: string[]): Promise<boolean> {
  try {
    // Check if there's a country code dropdown nearby (common in intl phone inputs)
    const parent = await input.evaluateHandle(el => (el as HTMLElement).closest('.phone-input, .intl-tel-input, [class*="phone"], [class*="tel"]'));
    
    // Clear and type the phone number digit by digit for better compatibility
    await input.click();
    await safeWait(page, 200);
    
    // Select all existing content and delete
    await input.evaluate(el => (el as HTMLInputElement).select());
    await page.keyboard.press('Backspace');
    await safeWait(page, 100);
    
    // Type digit by digit to work with formatted phone inputs
    for (const digit of phone) {
      await page.keyboard.type(digit, { delay: 50 });
    }
    
    steps.push(`Filled phone: ${phone}`);
    return true;
  } catch (err) {
    // Fallback: direct fill
    try {
      await input.fill(phone);
      steps.push(`Filled phone (fallback): ${phone}`);
      return true;
    } catch {
      steps.push(`Phone fill failed: ${(err as Error).message}`);
      return false;
    }
  }
}

// Handle skills tag-input fields (type each skill + Enter)
async function fillSkillsField(page: Page, input: ElementHandle, skills: string[], steps: string[]): Promise<boolean> {
  try {
    await input.click();
    await safeWait(page, 300);
    
    let addedCount = 0;
    for (const skill of skills) {
      await input.fill('');
      await safeWait(page, 100);
      
      // Type the skill
      await page.keyboard.type(skill, { delay: 30 });
      await safeWait(page, 400);
      
      // Try clicking a dropdown suggestion first
      let clickedSuggestion = false;
      const suggestionSelectors = [
        `[class*="option"]:has-text("${skill}")`,
        `[class*="suggestion"]:has-text("${skill}")`,
        `[class*="dropdown"] li:has-text("${skill}")`,
        `[role="option"]:has-text("${skill}")`,
        `[class*="menu"] [class*="item"]:has-text("${skill}")`,
      ];
      
      for (const sel of suggestionSelectors) {
        try {
          const suggestion = await page.$(sel);
          if (suggestion && await suggestion.isVisible()) {
            await suggestion.click();
            clickedSuggestion = true;
            break;
          }
        } catch { /* continue */ }
      }
      
      // If no suggestion clicked, press Enter to confirm the tag
      if (!clickedSuggestion) {
        await page.keyboard.press('Enter');
      }
      
      await safeWait(page, 300);
      addedCount++;
      
      // Stop after 10 skills to avoid overflow
      if (addedCount >= 10) break;
    }
    
    steps.push(`Entered ${addedCount} skills one by one`);
    return true;
  } catch (err) {
    steps.push(`Skills entry failed: ${(err as Error).message}`);
    return false;
  }
}

// Detect and handle login/signup (including confirm password)
async function handleAuth(page: Page, profile: Profile, steps: string[]): Promise<boolean> {
  try {
    // Look for email field
    const loginSelectors = [
      'input[type="email"]', 'input[name="email"]', 'input[id*="email"]',
      'input[type="text"][name*="user"]', 'input[id*="login"]',
    ];

    let emailInput = null;
    for (const sel of loginSelectors) {
      emailInput = await page.$(sel);
      if (emailInput) break;
    }

    if (!emailInput) return false;

    await emailInput.fill(profile.email);
    steps.push(`Entered email: ${profile.email}`);
    await safeWait(page, 500);

    // Fill ALL password fields (password + confirm password)
    const passwordInputs = await page.$$('input[type="password"]');
    for (const pwInput of passwordInputs) {
      const isVisible = await pwInput.isVisible().catch(() => false);
      if (!isVisible) continue;
      
      await pwInput.fill(profile.password);
      await safeWait(page, 200);
    }
    if (passwordInputs.length > 0) {
      steps.push(`Filled ${passwordInputs.length} password field(s) (including confirm)`);
    }

    // Also fill name fields if this is a signup form
    const nameInputs = await page.$$('input[type="text"]:visible');
    for (const nameInput of nameInputs) {
      const nameAttr = await nameInput.getAttribute('name') || '';
      const idAttr = await nameInput.getAttribute('id') || '';
      const placeholderAttr = await nameInput.getAttribute('placeholder') || '';
      const searchText = `${nameAttr} ${idAttr} ${placeholderAttr}`.toLowerCase();
      
      if (/first.?name|fname|given.?name/.test(searchText)) {
        await nameInput.fill(profile.firstName);
        steps.push(`Filled first name: ${profile.firstName}`);
      } else if (/last.?name|lname|surname/.test(searchText)) {
        await nameInput.fill(profile.lastName);
        steps.push(`Filled last name: ${profile.lastName}`);
      } else if (/full.?name|your.?name|^name$/.test(searchText)) {
        await nameInput.fill(profile.name);
        steps.push(`Filled name: ${profile.name}`);
      }
      await safeWait(page, 200);
    }

    // Fill phone if visible during signup
    const phoneSelectors = ['input[type="tel"]', 'input[name*="phone"]', 'input[id*="phone"]', 'input[name*="mobile"]'];
    for (const sel of phoneSelectors) {
      const phoneInput = await page.$(sel);
      if (phoneInput && await phoneInput.isVisible().catch(() => false)) {
        await fillPhoneField(page, phoneInput, profile.phone, steps);
        break;
      }
    }

    await safeWait(page, 500);

    // Look for submit/login/signup button
    const submitBtns = [
      'button[type="submit"]',
      'button:has-text("Sign in")', 'button:has-text("Log in")',
      'button:has-text("Sign up")', 'button:has-text("Create account")',
      'button:has-text("Register")', 'button:has-text("Create Account")',
      'button:has-text("Continue")', 'button:has-text("Next")',
      'input[type="submit"]',
    ];

    for (const sel of submitBtns) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await btn.click();
          steps.push(`Clicked auth button: ${sel}`);
          await safeWait(page, 4000);
          return true;
        }
      } catch { /* continue */ }
    }

    return false;
  } catch (err) {
    steps.push(`Auth handling error: ${(err as Error).message}`);
    return false;
  }
}

/* ================================================================
   COOKIE / POPUP DISMISSAL — reusable, called repeatedly
   ================================================================ */
const POPUP_SELECTORS = [
  'button:has-text("Accept All")', 'button:has-text("Accept all")',
  'button:has-text("Accept all cookies")', 'button:has-text("Accept Cookies")',
  'button:has-text("Accept")', 'button:has-text("Got it")',
  'button:has-text("OK")', 'button:has-text("I agree")',
  'button:has-text("Allow all")', 'button:has-text("Allow All")',
  'button:has-text("Agree")', 'button:has-text("Continue")',
  '[class*="cookie"] button', '[id*="cookie"] button',
  '[class*="consent"] button', '[class*="gdpr"] button',
  '[class*="banner"] button[class*="close"]', '[class*="banner"] button[class*="accept"]',
  '[id*="onetrust"] button#onetrust-accept-btn-handler',
  '[class*="cc-compliance"] a', 'button[class*="cookie-accept"]',
  '.cookie-notice button', '#cookie-banner button',
  'div[role="dialog"] button:has-text("Accept")',
  'div[role="dialog"] button:has-text("OK")',
  'div[role="alertdialog"] button:has-text("Accept")',
];

async function dismissCookiesAndPopups(page: Page, steps: string[]): Promise<void> {
  for (const sel of POPUP_SELECTORS) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        await btn.click();
        steps.push(`Dismissed popup: ${sel.substring(0, 40)}`);
        await safeWait(page, 800);
      }
    } catch { /* continue */ }
  }
  // Also try closing any overlay/modal close buttons
  const closeSelectors = ['button[aria-label="Close"]', 'button[aria-label="close"]', '[class*="modal"] button[class*="close"]', '[class*="overlay"] button[class*="close"]'];
  for (const sel of closeSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        await btn.click();
        await safeWait(page, 500);
      }
    } catch { /* continue */ }
  }
}

/* ================================================================
   HANDLE "+ ADD" BUTTONS (Workday, Greenhouse, etc.)
   These platforms require clicking "+ phone numbers", "+ skills",
   "+ work experience" etc. to open sub-forms before filling.
   ================================================================ */
async function handleAddButtons(page: Page, profile: Profile, coverLetter: string, jobSkills: string[], steps: string[]): Promise<void> {
  // Map of add-button text patterns to the data we need to fill after clicking
  const addButtonConfigs = [
    {
      patterns: ['phone number', 'add phone', '+ phone'],
      handler: async () => {
        await safeWait(page, 1500);
        // After clicking, look for phone input in the newly opened form/modal
        const phoneInputSelectors = [
          'input[type="tel"]:visible',
          'input[name*="phone"]:visible', 'input[id*="phone"]:visible',
          'input[name*="mobile"]:visible', 'input[placeholder*="phone"]:visible',
          'input[placeholder*="number"]:visible',
          // Workday-specific
          'input[data-automation-id*="phone"]:visible',
          'input[aria-label*="Phone"]:visible', 'input[aria-label*="phone"]:visible',
        ];
        for (const sel of phoneInputSelectors) {
          try {
            const input = await page.$(sel);
            if (input && await input.isVisible()) {
              await fillPhoneField(page, input, profile.phone, steps);
              // Look for a phone type dropdown (Mobile/Home/Work)
              const typeSelectors = ['select[name*="type"]:visible', 'select[id*="type"]:visible', 'select[data-automation-id*="type"]:visible'];
              for (const tSel of typeSelectors) {
                try {
                  const typeSelect = await page.$(tSel);
                  if (typeSelect && await typeSelect.isVisible()) {
                    const opts = await typeSelect.$$eval('option', os => os.map(o => ({ value: o.value, text: (o.textContent || '').toLowerCase() })));
                    const mobile = opts.find(o => /mobile|cell/.test(o.text));
                    if (mobile) await typeSelect.selectOption(mobile.value);
                    break;
                  }
                } catch { /* skip */ }
              }
              // Look for country code dropdown
              const ccSelectors = ['select[name*="country"]:visible', 'select[id*="country"]:visible', 'select[data-automation-id*="country"]:visible'];
              for (const ccSel of ccSelectors) {
                try {
                  const ccSelect = await page.$(ccSel);
                  if (ccSelect && await ccSelect.isVisible()) {
                    const opts = await ccSelect.$$eval('option', os => os.map(o => ({ value: o.value, text: (o.textContent || '').toLowerCase() })));
                    const india = opts.find(o => /india|\+91|91/.test(o.text));
                    if (india) await ccSelect.selectOption(india.value);
                    break;
                  }
                } catch { /* skip */ }
              }
              // Click save/done/add button in the sub-form
              await clickSubFormSave(page, steps);
              return;
            }
          } catch { /* continue */ }
        }
      },
    },
    {
      patterns: ['skill', 'add skill', '+ skill'],
      handler: async () => {
        await safeWait(page, 1500);
        // After clicking, look for skill input
        const skillInputSelectors = [
          'input[name*="skill"]:visible', 'input[id*="skill"]:visible',
          'input[placeholder*="skill"]:visible', 'input[placeholder*="search"]:visible',
          'input[aria-label*="skill"]:visible', 'input[aria-label*="Skill"]:visible',
          'input[data-automation-id*="skill"]:visible',
          'input[type="text"]:visible',
        ];
        const skillsToAdd = jobSkills.length > 0 ? jobSkills : DEFAULT_SKILLS;
        for (const sel of skillInputSelectors) {
          try {
            const input = await page.$(sel);
            if (input && await input.isVisible()) {
              await fillSkillsField(page, input, skillsToAdd, steps);
              await clickSubFormSave(page, steps);
              return;
            }
          } catch { /* continue */ }
        }
        // If no input found, there might be a list of checkboxes for skills
        const skillCheckboxes = await page.$$('input[type="checkbox"]:visible');
        let checked = 0;
        for (const cb of skillCheckboxes) {
          if (checked >= 10) break;
          try {
            const label = await cb.evaluate(el => {
              const lbl = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
              return (lbl?.textContent || '').trim();
            }).catch(() => '');
            // Check if this skill is in our list
            if (skillsToAdd.some(s => label.toLowerCase().includes(s.toLowerCase()))) {
              await cb.check().catch(() => {});
              checked++;
            }
          } catch { /* skip */ }
        }
        if (checked > 0) steps.push(`Checked ${checked} skill checkboxes`);
        await clickSubFormSave(page, steps);
      },
    },
    {
      patterns: ['work experience', 'add experience', '+ experience', 'add work'],
      handler: async () => {
        await safeWait(page, 1500);
        // Fill work experience sub-form
        const fieldMap: Record<string, string> = {
          'job.?title|role|position|designation': 'Software Engineering Intern',
          'company|employer|organization': 'Intern Projects',
          'description|responsibilities|duties': 'Developed full-stack web applications using React, Node.js, and Python. Built RESTful APIs and integrated AI/ML models.',
          'start.?date|from.?date': '2024-06-01',
          'end.?date|to.?date': '2024-12-31',
          'location|city': 'Chennai, India',
        };
        const allInputs = await page.$$('input:visible, textarea:visible');
        for (const input of allInputs) {
          try {
            const attrs = await input.evaluate(el => ({
              name: el.getAttribute('name') || '',
              id: el.id || '',
              placeholder: el.getAttribute('placeholder') || '',
              ariaLabel: el.getAttribute('aria-label') || '',
              type: el.getAttribute('type') || 'text',
            }));
            if (['hidden', 'submit', 'file', 'checkbox', 'radio'].includes(attrs.type)) continue;
            const searchText = `${attrs.name} ${attrs.id} ${attrs.placeholder} ${attrs.ariaLabel}`.toLowerCase();
            for (const [pattern, value] of Object.entries(fieldMap)) {
              if (new RegExp(pattern, 'i').test(searchText)) {
                const current = await input.inputValue().catch(() => '');
                if (!current) {
                  await input.fill(value);
                  steps.push(`Filled work exp field: ${value.substring(0, 30)}...`);
                }
                break;
              }
            }
          } catch { /* skip */ }
        }
        // Check "currently working" checkbox if available
        try {
          const currentCb = await page.$('input[type="checkbox"][name*="current"]:visible, input[type="checkbox"][id*="current"]:visible');
          if (currentCb && !await currentCb.isChecked().catch(() => false)) {
            // Don't check it - this is past experience
          }
        } catch { /* skip */ }
        await clickSubFormSave(page, steps);
      },
    },
    {
      patterns: ['education', 'add education', '+ education'],
      handler: async () => {
        await safeWait(page, 1500);
        const fieldMap: Record<string, string> = {
          'school|university|college|institution': profile.college,
          'degree|qualification': profile.degreeFullName,
          'field|major|study|specialization': profile.major,
          'gpa|grade|cgpa|percentage': profile.gpa,
          'start.?date|from': profile.educationStartYear,
          'end.?date|to|graduation|completion': profile.gradYear,
        };
        const allInputs = await page.$$('input:visible, textarea:visible, select:visible');
        for (const input of allInputs) {
          try {
            const tag = await input.evaluate(el => el.tagName.toLowerCase());
            const attrs = await input.evaluate(el => ({
              name: el.getAttribute('name') || '',
              id: el.id || '',
              placeholder: el.getAttribute('placeholder') || '',
              ariaLabel: el.getAttribute('aria-label') || '',
              type: el.getAttribute('type') || 'text',
            }));
            if (['hidden', 'submit', 'file', 'checkbox', 'radio'].includes(attrs.type)) continue;
            const searchText = `${attrs.name} ${attrs.id} ${attrs.placeholder} ${attrs.ariaLabel}`.toLowerCase();
            for (const [pattern, value] of Object.entries(fieldMap)) {
              if (new RegExp(pattern, 'i').test(searchText)) {
                if (tag === 'select') {
                  const opts = await input.$$eval('option', os => os.map(o => ({ value: o.value, text: o.textContent || '' })));
                  const match = opts.find(o => o.text.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(o.text.toLowerCase()));
                  if (match) await input.selectOption(match.value);
                } else {
                  const current = await input.inputValue().catch(() => '');
                  if (!current) await input.fill(value);
                }
                steps.push(`Filled edu field: ${value.substring(0, 30)}...`);
                break;
              }
            }
          } catch { /* skip */ }
        }
        await clickSubFormSave(page, steps);
      },
    },
    {
      patterns: ['language', 'add language', '+ language'],
      handler: async () => {
        await safeWait(page, 1500);
        const allInputs = await page.$$('input:visible, select:visible');
        for (const input of allInputs) {
          try {
            const tag = await input.evaluate(el => el.tagName.toLowerCase());
            const attrs = await input.evaluate(el => ({
              name: el.getAttribute('name') || '',
              id: el.id || '',
              placeholder: el.getAttribute('placeholder') || '',
              type: el.getAttribute('type') || 'text',
            }));
            const searchText = `${attrs.name} ${attrs.id} ${attrs.placeholder}`.toLowerCase();
            if (/language|lang/.test(searchText) && tag === 'select') {
              const opts = await input.$$eval('option', os => os.map(o => ({ value: o.value, text: o.textContent || '' })));
              const eng = opts.find(o => /english/i.test(o.text));
              if (eng) await input.selectOption(eng.value);
            } else if (/proficiency|level|fluency/.test(searchText) && tag === 'select') {
              const opts = await input.$$eval('option', os => os.map(o => ({ value: o.value, text: o.textContent || '' })));
              const prof = opts.find(o => /professional|fluent|advanced/i.test(o.text));
              if (prof) await input.selectOption(prof.value);
            } else if (/language|lang/.test(searchText)) {
              const current = await input.inputValue().catch(() => '');
              if (!current) await input.fill('English');
            }
          } catch { /* skip */ }
        }
        await clickSubFormSave(page, steps);
      },
    },
  ];

  // Find all "+ Add" style buttons on the page
  const addBtnSelectors = [
    'button:has-text("+")', 'button:has-text("Add")',
    'a:has-text("+")', 'a:has-text("Add")',
    '[class*="add"] button', '[class*="add"] a',
    'button[class*="add"]', 'a[class*="add"]',
    '[data-automation-id*="add"]',
  ];

  for (const sel of addBtnSelectors) {
    try {
      const buttons = await page.$$(sel);
      for (const btn of buttons) {
        try {
          const isVisible = await btn.isVisible().catch(() => false);
          if (!isVisible) continue;

          const btnText = (await btn.textContent() || '').toLowerCase().trim();
          if (!btnText) continue;

          // Find which config matches this button
          for (const config of addButtonConfigs) {
            const matches = config.patterns.some(p => btnText.includes(p.toLowerCase()));
            if (matches) {
              steps.push(`Clicking add button: "${btnText}"`);
              await btn.click();
              await safeWait(page, 1000);
              await dismissCookiesAndPopups(page, steps); // dismiss any popup that appears
              await config.handler();
              await safeWait(page, 500);
              break;
            }
          }
        } catch { /* skip individual button */ }
      }
    } catch { /* continue */ }
  }
}

// Click save/done/add button inside a sub-form or modal
async function clickSubFormSave(page: Page, steps: string[]): Promise<void> {
  const saveSelectors = [
    'button:has-text("Save")', 'button:has-text("Done")',
    'button:has-text("Add")', 'button:has-text("Apply")',
    'button:has-text("OK")', 'button:has-text("Confirm")',
    'button:has-text("Submit")', 'button[type="submit"]',
    '[class*="modal"] button[class*="primary"]',
    '[class*="dialog"] button[class*="primary"]',
    '[role="dialog"] button[class*="primary"]',
    'button:has-text("Save and close")',
  ];
  for (const sel of saveSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        const text = (await btn.textContent() || '').trim();
        // Don't click "Next" or navigation buttons
        if (/next|continue|cancel|back|close|discard/i.test(text)) continue;
        await btn.click();
        steps.push(`Clicked sub-form save: "${text}"`);
        await safeWait(page, 1500);
        return;
      }
    } catch { /* continue */ }
  }
}

// Find and click the Apply button on a job page
async function findApplyButton(page: Page, steps: string[]): Promise<boolean> {
  const applySelectors = [
    'button:has-text("Apply")', 'a:has-text("Apply")',
    'button:has-text("Apply Now")', 'a:has-text("Apply Now")',
    'button:has-text("Apply now")', 'a:has-text("Apply now")',
    'button:has-text("Quick Apply")', 'a:has-text("Quick Apply")',
    'button:has-text("Easy Apply")', 'a:has-text("Easy Apply")',
    'button:has-text("Submit Application")',
    '[data-testid*="apply"]', '[class*="apply-btn"]',
    'button[id*="apply"]', 'a[id*="apply"]',
  ];

  for (const sel of applySelectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        await btn.click();
        steps.push(`Clicked: ${sel}`);
        await safeWait(page, 3000);
        return true;
      }
    } catch { /* continue */ }
  }

  steps.push('Could not find Apply button');
  return false;
}

// Upload resume file
async function uploadResume(page: Page, pdfBuffer: Buffer, steps: string[]): Promise<boolean> {
  try {
    const fileInputs = await page.$$('input[type="file"]');
    if (fileInputs.length === 0) {
      steps.push('No file upload input found');
      return false;
    }

    for (const input of fileInputs) {
      const accept = await input.getAttribute('accept') || '';
      const name = await input.getAttribute('name') || '';
      const id = await input.getAttribute('id') || '';
      const label = `${name} ${id} ${accept}`.toLowerCase();

      if (label.includes('cover') && !label.includes('resume')) continue;

      await input.setInputFiles({
        name: 'Kevin_Sudhan_Resume.pdf',
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      });
      steps.push('Uploaded resume PDF');
      await safeWait(page, 1500);
      return true;
    }

    await fileInputs[0].setInputFiles({
      name: 'Kevin_Sudhan_Resume.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });
    steps.push('Uploaded resume to first file input');
    return true;
  } catch (err) {
    steps.push(`Resume upload failed: ${(err as Error).message}`);
    return false;
  }
}

/* ================================================================
   HIGHLIGHT FIELD FOR HUMAN INTERVENTION
   Adds a pulsing red border + label overlay so the user can see
   which field needs attention in the browser window.
   ================================================================ */
async function highlightField(page: Page, el: ElementHandle, message: string): Promise<void> {
  await el.evaluate((e, msg) => {
    const htmlEl = e as HTMLElement;
    htmlEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    htmlEl.style.outline = '3px solid red';
    htmlEl.style.outlineOffset = '2px';
    htmlEl.style.boxShadow = '0 0 15px rgba(255,0,0,0.5)';
    // Add a floating label
    const label = document.createElement('div');
    label.id = 'cascade-help-label';
    label.textContent = `⚠️ ${msg}`;
    label.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;font-size:16px;font-weight:bold;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:pulse 1.5s infinite';
    // Remove existing label if any
    document.getElementById('cascade-help-label')?.remove();
    document.head.insertAdjacentHTML('beforeend', '<style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}</style>');
    document.body.appendChild(label);
  }, message);
}

async function removeHighlight(page: Page, el: ElementHandle): Promise<void> {
  await el.evaluate(e => {
    const htmlEl = e as HTMLElement;
    htmlEl.style.outline = '';
    htmlEl.style.outlineOffset = '';
    htmlEl.style.boxShadow = '';
    document.getElementById('cascade-help-label')?.remove();
  }).catch(() => {});
}

/* Wait for the user to fill a field. Polls every 2s, up to maxWaitSec. */
async function waitForHumanInput(page: Page, el: ElementHandle, fieldDesc: string, steps: string[], maxWaitSec: number = 60): Promise<boolean> {
  const startTime = Date.now();
  await highlightField(page, el, `Please fill: ${fieldDesc}`);
  steps.push(`⏳ Waiting for human input: ${fieldDesc} (${maxWaitSec}s timeout)`);

  while ((Date.now() - startTime) < maxWaitSec * 1000) {
    await safeWait(page, 2000);
    try {
      const tagName = await el.evaluate(e => (e as HTMLElement).tagName.toLowerCase()).catch(() => '');
      if (tagName === 'select') {
        const val = await el.inputValue().catch(() => '');
        if (val && val !== '' && val !== '--' && val !== 'default') {
          await removeHighlight(page, el);
          steps.push(`✅ Human filled: ${fieldDesc}`);
          return true;
        }
      } else if (tagName === 'input' || tagName === 'textarea') {
        const type = await el.getAttribute('type') || 'text';
        if (type === 'checkbox' || type === 'radio') {
          const checked = await el.isChecked().catch(() => false);
          if (checked) {
            await removeHighlight(page, el);
            steps.push(`✅ Human filled: ${fieldDesc}`);
            return true;
          }
        } else {
          const val = await el.inputValue().catch(() => '');
          if (val && val.length > 0) {
            await removeHighlight(page, el);
            steps.push(`✅ Human filled: ${fieldDesc}`);
            return true;
          }
        }
      }
    } catch { break; } // Element may have been removed from DOM
  }

  await removeHighlight(page, el);
  steps.push(`⏰ Timed out waiting for: ${fieldDesc} — moving on`);
  return false;
}

/* ================================================================
   SEQUENTIAL FORM FILLER — processes ALL elements top-to-bottom
   in DOM order. Handles text, select, radio, checkbox, file,
   and "+" add buttons. Pauses for human if stuck.
   ================================================================ */
async function fillFormSequential(page: Page, profile: Profile, coverLetter: string, jobSkills: string[], pdfBuffer: Buffer | null, steps: string[]): Promise<number> {
  let filledCount = 0;

  try {
    // Collect ALL interactive elements in DOM order
    const elements = await page.$$('input:visible, textarea:visible, select:visible, button:visible, a:visible');

    for (const el of elements) {
      try {
        const info = await el.evaluate(e => {
          const htmlEl = e as HTMLElement;
          const tag = htmlEl.tagName.toLowerCase();
          const type = htmlEl.getAttribute('type') || '';
          const name = htmlEl.getAttribute('name') || '';
          const id = htmlEl.id || '';
          const placeholder = htmlEl.getAttribute('placeholder') || '';
          const ariaLabel = htmlEl.getAttribute('aria-label') || '';
          const text = htmlEl.textContent?.trim().substring(0, 100) || '';
          const required = htmlEl.hasAttribute('required') || htmlEl.getAttribute('aria-required') === 'true';
          const disabled = htmlEl.hasAttribute('disabled') || htmlEl.getAttribute('aria-disabled') === 'true';
          const readonly = htmlEl.hasAttribute('readonly');

          // Get label
          let label = '';
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            if (lbl) label = lbl.textContent?.trim() || '';
          }
          if (!label) {
            const parent = htmlEl.closest('.form-group, .field, .input-group, [class*="field"], [class*="question"], fieldset');
            if (parent) {
              const lbl = parent.querySelector('label, .label, [class*="label"], legend');
              if (lbl) label = lbl.textContent?.trim() || '';
            }
          }
          if (!label) {
            const closestLabel = htmlEl.closest('label');
            if (closestLabel) label = closestLabel.textContent?.trim() || '';
          }

          return { tag, type, name, id, placeholder, ariaLabel, text, label, required, disabled, readonly };
        });

        if (info.disabled || info.readonly) continue;

        // ---- BUTTONS: handle "+" Add buttons ----
        if (info.tag === 'button' || info.tag === 'a') {
          const btnText = info.text.toLowerCase();
          // Only process add-style buttons (skip navigation/submit)
          if (/^(\+\s*)?(add|new)\s/.test(btnText) || /^\+\s/.test(btnText)) {
            // Delegate to handleAddButtons for this specific button
            // (already handled in the multi-step loop, skip here to avoid double-clicking)
          }
          continue;
        }

        // ---- FILE INPUTS ----
        if (info.type === 'file') {
          if (pdfBuffer) {
            const accept = await el.getAttribute('accept') || '';
            const label = `${info.name} ${info.id} ${accept}`.toLowerCase();
            if (!label.includes('cover') || label.includes('resume')) {
              await el.setInputFiles({
                name: 'Kevin_Sudhan_Resume.pdf',
                mimeType: 'application/pdf',
                buffer: pdfBuffer,
              });
              steps.push('📄 Uploaded resume PDF');
              filledCount++;
              await safeWait(page, 1000);
            }
          }
          continue;
        }

        // ---- HIDDEN / SUBMIT / BUTTON type inputs ----
        if (['hidden', 'submit', 'button', 'image', 'reset'].includes(info.type)) continue;

        // ---- RADIO BUTTONS ----
        if (info.type === 'radio') {
          const isChecked = await el.isChecked().catch(() => false);
          if (isChecked) continue;
          // Get the question context for this radio group
          const context = await el.evaluate(e => {
            const group = e.closest('[role="radiogroup"], fieldset, .form-group, .question, [class*="question"], [class*="field"]');
            return group?.textContent?.substring(0, 300) || '';
          }).catch(() => '');
          const answer = getYesNoAnswer(context);
          if (!answer) continue;
          const radioLabel = await el.evaluate(e => {
            const lbl = e.closest('label') || (e.id ? document.querySelector(`label[for="${e.id}"]`) : null);
            return (lbl?.textContent || e.getAttribute('value') || '').toLowerCase().trim();
          }).catch(() => '');
          if (answer === 'yes' && /^(yes|true|i.?agree|i.?accept|i.?consent|i.?do|affirmative)/.test(radioLabel)) {
            await el.check().catch(() => {});
            steps.push(`🔘 Radio YES: ${context.substring(0, 40)}...`);
            filledCount++;
          } else if (answer === 'no' && /^(no|false|i.?don.?t|i.?do.?not|negative)/.test(radioLabel)) {
            await el.check().catch(() => {});
            steps.push(`🔘 Radio NO: ${context.substring(0, 40)}...`);
            filledCount++;
          } else if (answer === 'decline' && /decline|prefer.?not|don.?t.?wish|not.?wish|not.?disclose/.test(radioLabel)) {
            await el.check().catch(() => {});
            steps.push(`🔘 Radio DECLINE: ${context.substring(0, 40)}...`);
            filledCount++;
          }
          continue;
        }

        // ---- CHECKBOXES ----
        if (info.type === 'checkbox') {
          const isChecked = await el.isChecked().catch(() => false);
          if (isChecked) continue;
          const context = (info.label + ' ' + info.name + ' ' + info.id).toLowerCase();
          if (/term|agree|consent|privacy|accept|acknowledge|confirm|certif|i.?have.?read|i.?understand|authorize|background|opt.?in/.test(context)) {
            await el.check().catch(() => {});
            steps.push(`☑️ Checked: ${context.substring(0, 50)}`);
            filledCount++;
          }
          continue;
        }

        // ---- SELECT DROPDOWNS ----
        if (info.tag === 'select') {
          const currentVal = await el.inputValue().catch(() => '');
          if (currentVal && currentVal !== '' && currentVal !== '--' && currentVal !== 'default') continue;

          // First try field matching for profile data
          const fieldMatch = matchField({ name: info.name, id: info.id, label: info.label, placeholder: info.placeholder, type: info.type, ariaLabel: info.ariaLabel });
          if (fieldMatch) {
            const value = getFieldValue(fieldMatch, profile, { coverLetter });
            if (value) {
              const options = await el.$$eval('option', opts => opts.map(o => ({ value: o.value, text: (o.textContent || '').trim() })));
              const match = options.find(o =>
                o.text.toLowerCase().includes(value.toLowerCase()) ||
                value.toLowerCase().includes(o.text.toLowerCase())
              );
              if (match && match.value) {
                await el.selectOption(match.value);
                steps.push(`📝 Selected ${fieldMatch}: ${match.text}`);
                filledCount++;
                await safeWait(page, 300);
                continue;
              }
            }
          }

          // Then try yes/no answering
          const context = info.label + ' ' + info.name + ' ' + info.id;
          const answer = getYesNoAnswer(context);
          if (answer) {
            const options = await el.$$eval('option', opts => opts.map(o => ({ value: o.value, text: (o.textContent || '').toLowerCase().trim() })));
            let target = null;
            if (answer === 'yes') target = options.find(o => /^(yes|true|i agree)/.test(o.text));
            else if (answer === 'no') target = options.find(o => /^(no|false)/.test(o.text));
            else target = options.find(o => /decline|prefer not|not wish/.test(o.text));
            if (target && target.value) {
              await el.selectOption(target.value);
              steps.push(`📝 Dropdown ${answer.toUpperCase()}: ${context.substring(0, 40)}`);
              filledCount++;
              await safeWait(page, 300);
              continue;
            }
          }

          // If required and still unfilled, ask for human help
          if (info.required) {
            const fieldDesc = info.label || info.placeholder || info.name || 'dropdown';
            await waitForHumanInput(page, el, fieldDesc, steps, 45);
          }
          continue;
        }

        // ---- TEXT INPUTS & TEXTAREAS ----
        const currentValue = await el.inputValue().catch(() => '');
        if (currentValue && currentValue.length > 0) continue; // already filled

        const fieldMatch = matchField({ name: info.name, id: info.id, label: info.label, placeholder: info.placeholder, type: info.type, ariaLabel: info.ariaLabel });

        // Skills field — enter one by one
        if (fieldMatch === 'skills') {
          const skillsToAdd = jobSkills.length > 0 ? jobSkills : DEFAULT_SKILLS;
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await fillSkillsField(page, el, skillsToAdd, steps);
          filledCount++;
          await safeWait(page, 300);
          continue;
        }

        // Phone field — digit by digit
        if (fieldMatch === 'phone' || fieldMatch === 'altPhone' || info.type === 'tel') {
          const phoneNum = fieldMatch === 'altPhone' ? profile.altPhone : profile.phone;
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await fillPhoneField(page, el, phoneNum, steps);
          filledCount++;
          await safeWait(page, 300);
          continue;
        }

        if (fieldMatch) {
          const value = getFieldValue(fieldMatch, profile, { coverLetter });
          if (value) {
            await el.scrollIntoViewIfNeeded().catch(() => {});
            if (info.tag === 'textarea') {
              await el.fill(value);
              steps.push(`📝 Filled ${fieldMatch} (textarea)`);
            } else {
              await el.fill(value);
              steps.push(`📝 Filled ${fieldMatch}: ${value.substring(0, 30)}${value.length > 30 ? '...' : ''}`);
            }
            filledCount++;
            await safeWait(page, 300);
            continue;
          }
        }

        // If we reach here and the field is REQUIRED but we couldn't fill it
        // → scroll into view, highlight, and wait for human
        if (info.required && !currentValue) {
          const fieldDesc = info.label || info.placeholder || info.ariaLabel || info.name || 'unknown field';
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await waitForHumanInput(page, el, fieldDesc, steps, 45);
          filledCount++; // count as handled (by human)
        }

        await safeWait(page, 200);
      } catch { /* skip problematic element, continue to next */ }
    }
  } catch (err) {
    steps.push(`Form fill error: ${(err as Error).message}`);
  }

  return filledCount;
}

/* ================================================================
   YES/NO QUESTION ANSWERING
   Maps common application questions to appropriate answers.
   Used for radio buttons, dropdowns, and checkbox yes/no fields.
   ================================================================ */
const YES_PATTERNS = [
  /legally.?authorized/i, /authorized.?to.?work/i, /eligible.?to.?work/i,
  /right.?to.?work/i, /work.?permit/i, /work.?rights/i,
  /willing.?to.?relocate/i, /open.?to.?relocation/i, /relocation/i,
  /willing.?to.?travel/i, /travel.?required/i,
  /background.?check/i, /consent.?to.?background/i,
  /driver.?s?.?licen/i,
  /can.?you.?start/i, /start.?immediately/i, /urgent/i,
  /commut/i, /comfortable.?commut/i,
  /completed.?.*degree/i, /level.?of.?education/i,
  /terms/i, /agree/i, /consent/i, /privacy/i, /acknowledge/i, /accept/i,
  /confirm/i, /certif/i,
  /18.?years/i, /age.?requirement/i,
];

const NO_PATTERNS = [
  /require.?visa/i, /require.?sponsor/i, /need.?sponsor/i, /visa.?sponsor/i,
  /h.?1b/i, /immigration.?sponsor/i,
  /previously.?employed/i, /worked.?here.?before/i,
  /convicted/i, /felony/i, /criminal/i, /arrest/i,
  /non.?compete/i, /restrictive.?covenant/i,
];

const DECLINE_PATTERNS = [
  /gender/i, /sex/i, /race/i, /ethni/i, /veteran/i, /disabilit/i,
  /demographic/i, /eeo/i, /equal.?employment/i, /self.?identify/i,
];

function getYesNoAnswer(questionText: string): 'yes' | 'no' | 'decline' | null {
  for (const p of YES_PATTERNS) { if (p.test(questionText)) return 'yes'; }
  for (const p of NO_PATTERNS) { if (p.test(questionText)) return 'no'; }
  for (const p of DECLINE_PATTERNS) { if (p.test(questionText)) return 'decline'; }
  return null;
}

// Handle radio button groups
async function handleRadioButtons(page: Page, profile: Profile, steps: string[]): Promise<number> {
  let handled = 0;
  try {
    // Find all fieldsets or radio groups
    const radioGroups = await page.$$('[role="radiogroup"], fieldset, [class*="radio"], [class*="question"]');

    for (const group of radioGroups) {
      try {
        const isVisible = await group.isVisible().catch(() => false);
        if (!isVisible) continue;

        // Get the question text from legend, label, or text content
        const questionText = await group.evaluate(el => {
          const legend = el.querySelector('legend');
          if (legend) return legend.textContent || '';
          const label = el.querySelector('label, .label, [class*="label"], [class*="question"]');
          if (label) return label.textContent || '';
          // Get first text node
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let text = '';
          let node;
          while ((node = walker.nextNode())) { text += node.textContent; }
          return text.trim().substring(0, 200);
        }).catch(() => '');

        if (!questionText) continue;

        const answer = getYesNoAnswer(questionText);
        if (!answer) continue;

        const radios = await group.$$('input[type="radio"]');
        if (radios.length === 0) continue;

        // Check if any radio is already selected
        let alreadySelected = false;
        for (const radio of radios) {
          if (await radio.isChecked().catch(() => false)) { alreadySelected = true; break; }
        }
        if (alreadySelected) continue;

        for (const radio of radios) {
          const radioLabel = await radio.evaluate(el => {
            const label = el.closest('label') || el.parentElement?.querySelector('label');
            const forLabel = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
            return (label?.textContent || forLabel?.textContent || el.getAttribute('value') || '').toLowerCase();
          }).catch(() => '');

          if (answer === 'yes' && /^(yes|true|i.?agree|i.?accept|i.?consent|i.?do|affirmative)/.test(radioLabel.trim())) {
            await radio.check().catch(() => {});
            steps.push(`Radio YES: ${questionText.substring(0, 50)}...`);
            handled++;
            break;
          }
          if (answer === 'no' && /^(no|false|i.?don.?t|i.?do.?not|negative)/.test(radioLabel.trim())) {
            await radio.check().catch(() => {});
            steps.push(`Radio NO: ${questionText.substring(0, 50)}...`);
            handled++;
            break;
          }
          if (answer === 'decline' && /decline|prefer.?not|don.?t.?wish|not.?wish|not.?disclose/.test(radioLabel)) {
            await radio.check().catch(() => {});
            steps.push(`Radio DECLINE: ${questionText.substring(0, 50)}...`);
            handled++;
            break;
          }
        }
      } catch { /* skip */ }
    }

    // Also handle standalone radio buttons not in groups
    const standaloneRadios = await page.$$('input[type="radio"]:visible');
    for (const radio of standaloneRadios) {
      try {
        if (await radio.isChecked().catch(() => false)) continue;

        const context = await radio.evaluate(el => {
          const parent = el.closest('.form-group, .question, .field, fieldset, [class*="question"]');
          return parent?.textContent?.substring(0, 300) || '';
        }).catch(() => '');

        if (!context) continue;
        const answer = getYesNoAnswer(context);
        if (!answer) continue;

        const label = await radio.evaluate(el => {
          const lbl = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
          return (lbl?.textContent || el.getAttribute('value') || '').toLowerCase().trim();
        }).catch(() => '');

        if (answer === 'yes' && /^(yes|true|i.?agree|affirmative)/.test(label)) {
          await radio.check().catch(() => {});
          handled++;
        } else if (answer === 'no' && /^(no|false|negative)/.test(label)) {
          await radio.check().catch(() => {});
          handled++;
        }
      } catch { /* skip */ }
    }
  } catch (err) {
    steps.push(`Radio handling error: ${(err as Error).message}`);
  }
  return handled;
}

// Handle yes/no dropdown selects
async function handleYesNoDropdowns(page: Page, steps: string[]): Promise<number> {
  let handled = 0;
  try {
    const selects = await page.$$('select:visible');
    for (const select of selects) {
      try {
        // Skip already-answered selects
        const currentVal = await select.inputValue().catch(() => '');
        if (currentVal && currentVal !== '' && currentVal !== '--') continue;

        const context = await select.evaluate(el => {
          const parent = el.closest('.form-group, .question, .field, [class*="field"]');
          const label = parent?.querySelector('label, .label')?.textContent || '';
          const legend = parent?.closest('fieldset')?.querySelector('legend')?.textContent || '';
          return `${label} ${legend} ${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''}`.substring(0, 300);
        }).catch(() => '');

        const answer = getYesNoAnswer(context);
        if (!answer) continue;

        const options = await select.$$eval('option', opts =>
          opts.map(o => ({ value: o.value, text: (o.textContent || '').toLowerCase().trim() }))
        );

        let targetOption = null;
        if (answer === 'yes') {
          targetOption = options.find(o => /^(yes|true|i agree)/.test(o.text));
        } else if (answer === 'no') {
          targetOption = options.find(o => /^(no|false)/.test(o.text));
        } else if (answer === 'decline') {
          targetOption = options.find(o => /decline|prefer not|not wish|not disclose/.test(o.text));
        }

        if (targetOption) {
          await select.selectOption(targetOption.value);
          steps.push(`Dropdown ${answer.toUpperCase()}: ${context.substring(0, 40)}...`);
          handled++;
        }
      } catch { /* skip */ }
    }
  } catch (err) {
    steps.push(`Dropdown handling error: ${(err as Error).message}`);
  }
  return handled;
}

// Handle all checkboxes on the page
async function handleCheckboxes(page: Page, steps: string[]): Promise<void> {
  try {
    const checkboxes = await page.$$('input[type="checkbox"]:visible');
    for (const cb of checkboxes) {
      try {
        const isChecked = await cb.isChecked().catch(() => false);
        if (isChecked) continue;

        const context = await cb.evaluate(el => {
          const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
          const parent = el.closest('.form-group, .question, .field, [class*="field"]');
          return (label?.textContent || parent?.textContent || el.getAttribute('name') || '').toLowerCase().substring(0, 200);
        }).catch(() => '');

        // Auto-check these checkboxes
        if (/term|agree|consent|privacy|accept|acknowledge|confirm|certif|i.?have.?read|i.?understand|authorize|background|opt.?in/.test(context)) {
          await cb.check().catch(() => {});
          steps.push(`Checked: ${context.substring(0, 50)}...`);
        }
      } catch { /* skip */ }
    }
  } catch { /* continue */ }
}

// Click through multi-step forms
async function handleMultiStepForm(page: Page, profile: Profile, coverLetter: string, jobSkills: string[], pdfBuffer: Buffer | null, overlayData: OverlaySection[], steps: string[], maxSteps: number = 10): Promise<void> {
  for (let step = 0; step < maxSteps; step++) {
    await safeWait(page, 2000);

    // 0. Always dismiss popups/cookies first
    await dismissCookiesAndPopups(page, steps);

    // 0.5 Re-inject overlay (page may have changed after navigating steps)
    await injectHelperOverlay(page, overlayData).catch(() => {});

    // 1. Handle "+ Add" buttons (phone, skills, experience, etc.)
    await handleAddButtons(page, profile, coverLetter, jobSkills, steps);

    // 2. Fill ALL form elements sequentially (top to bottom)
    //    This handles inputs, selects, radios, checkboxes, and file uploads
    await fillFormSequential(page, profile, coverLetter, jobSkills, pdfBuffer, steps);

    // 3. Check for "Next"/"Continue" button (not "Submit")
    const nextBtns = [
      'button:has-text("Next")', 'button:has-text("Continue")',
      'button:has-text("Save and continue")', 'button:has-text("Proceed")',
      'button:has-text("Save & Continue")', 'button:has-text("Save and Continue")',
      'button:has-text("Review")', 'button:has-text("Preview")',
      'a:has-text("Next")', 'a:has-text("Continue")',
    ];

    let clickedNext = false;
    for (const sel of nextBtns) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          const text = (await btn.textContent() || '').toLowerCase();
          // Don't click submit-like buttons
          if (/submit|send|apply|final/.test(text)) continue;
          await btn.click();
          steps.push(`Clicked: ${text.trim()} (step ${step + 1})`);
          clickedNext = true;
          await safeWait(page, 1500);
          break;
        }
      } catch { /* continue */ }
    }

    if (!clickedNext) {
      steps.push(`No more form steps found after step ${step + 1}`);
      break;
    }
  }
}

/* ================================================================
   HELPER OVERLAY — injected into the browser page so the user
   can copy profile data, skills, experience, etc. while manually
   filling form fields.
   ================================================================ */
interface OverlaySection {
  title: string;
  items: { label: string; value: string }[];
}

function buildOverlayData(
  profile: Profile,
  skills: string[],
  coverLetter: string,
  resumeSections: { experience?: string; projects?: string; skills?: string },
  jobInfo: { company?: string; role?: string; location?: string },
): OverlaySection[] {
  const sections: OverlaySection[] = [];

  // Job Info
  if (jobInfo.company || jobInfo.role) {
    sections.push({
      title: 'Job Info',
      items: [
        ...(jobInfo.company ? [{ label: 'Company', value: jobInfo.company }] : []),
        ...(jobInfo.role ? [{ label: 'Role', value: jobInfo.role }] : []),
        ...(jobInfo.location ? [{ label: 'Location', value: jobInfo.location }] : []),
      ],
    });
  }

  // Personal
  sections.push({
    title: 'Personal',
    items: [
      { label: 'Full Name', value: profile.name },
      { label: 'First Name', value: profile.firstName },
      { label: 'Middle Name', value: profile.middleName },
      { label: 'Last Name', value: profile.lastName },
      { label: 'Email', value: profile.email },
      { label: 'Phone', value: profile.phone },
      { label: 'Alt Phone', value: profile.altPhone },
      { label: 'Father Name', value: profile.fatherName },
      { label: 'Mother Name', value: profile.motherName },
      { label: 'Date of Birth', value: profile.dateOfBirth },
      { label: 'Gender', value: profile.gender },
      { label: 'Nationality', value: profile.nationality },
      { label: 'Marital Status', value: profile.maritalStatus },
    ],
  });

  // Address
  sections.push({
    title: 'Address',
    items: [
      { label: 'City', value: profile.city },
      { label: 'State', value: profile.state },
      { label: 'Zip Code', value: profile.zipCode },
      { label: 'Country', value: profile.country },
      { label: 'Full Location', value: profile.currentLocation },
    ],
  });

  // Online
  sections.push({
    title: 'Online Profiles',
    items: [
      { label: 'LinkedIn', value: profile.linkedin },
      { label: 'GitHub', value: profile.github },
      { label: 'Portfolio', value: profile.portfolio },
    ],
  });

  // Education
  sections.push({
    title: 'Education',
    items: [
      { label: 'University', value: profile.university },
      { label: 'College', value: profile.college },
      { label: 'Degree', value: profile.degreeFullName },
      { label: 'Major', value: profile.major },
      { label: 'GPA', value: `${profile.gpa} / ${profile.gpaScale}` },
      { label: 'Grad Year', value: profile.gradYear },
      { label: 'Grad Date', value: profile.gradDate },
      { label: 'Start Year', value: profile.educationStartYear },
    ],
  });

  // Work Preferences
  sections.push({
    title: 'Work Preferences',
    items: [
      { label: 'Preferred Locations', value: profile.preferredLocations.join(', ') },
      { label: 'Notice Period', value: profile.noticePeriod },
      { label: 'Available Start', value: profile.availableStartDate },
      { label: 'Expected Salary', value: profile.expectedSalary },
      { label: 'Expected CTC', value: profile.expectedCTC },
      { label: 'Total Experience', value: `${profile.totalExperience} year(s)` },
      { label: 'Current CTC', value: profile.currentCTC },
    ],
  });

  // Skills — each skill is a separate copy-able item
  sections.push({
    title: 'Skills',
    items: skills.map(s => ({ label: 'Skill', value: s })),
  });

  // Helper: clean LaTeX artifacts from text
  function cleanLatex(s: string): string {
    return s
      .replace(/\\%/g, '%')
      .replace(/\\&/g, '&')
      .replace(/\\textbf\{([^}]*)\}/g, '$1')
      .replace(/\\textit\{([^}]*)\}/g, '$1')
      .replace(/\\emph\{([^}]*)\}/g, '$1')
      .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, '$1')
      .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
      .replace(/[\\{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Helper: parse \resumeSubheading blocks into structured entries
  function parseSubheadings(latex: string): { heading: string[]; bullets: string[] }[] {
    const entries: { heading: string[]; bullets: string[] }[] = [];
    // Split on \resumeSubheading
    const parts = latex.split(/\\resumeSubheading/);
    for (const part of parts) {
      if (!part.trim()) continue;
      // Extract brace groups: {arg1}{arg2}{arg3}{arg4}
      const braceArgs: string[] = [];
      let remaining = part;
      for (let b = 0; b < 4; b++) {
        const open = remaining.indexOf('{');
        if (open === -1) break;
        let depth = 0, end = open;
        for (let c = open; c < remaining.length; c++) {
          if (remaining[c] === '{') depth++;
          if (remaining[c] === '}') depth--;
          if (depth === 0) { end = c; break; }
        }
        braceArgs.push(remaining.substring(open + 1, end));
        remaining = remaining.substring(end + 1);
      }
      // Extract \resumeItem bullets
      const bullets: string[] = [];
      const itemRegex = /\\resumeItem\{([\s\S]*?)\}/g;
      let m;
      while ((m = itemRegex.exec(remaining)) !== null) {
        const cleaned = cleanLatex(m[1]);
        if (cleaned.length > 2) bullets.push(cleaned);
      }
      if (braceArgs.length > 0) {
        entries.push({ heading: braceArgs.map(a => cleanLatex(a)).filter(a => a.length > 0), bullets });
      }
    }
    return entries;
  }

  // Experience from tailored resume
  if (resumeSections.experience) {
    const entries = parseSubheadings(resumeSections.experience);
    if (entries.length > 0) {
      const items: { label: string; value: string }[] = [];
      entries.forEach((entry, idx) => {
        // heading[0]=Role, heading[1]=Date, heading[2]=Company, heading[3]=Location
        const role = entry.heading[0] || '';
        const date = entry.heading[1] || '';
        const company = entry.heading[2] || '';
        const location = entry.heading[3] || '';
        const header = [role, company, location].filter(Boolean).join(' | ');
        if (header) items.push({ label: 'Position ' + (idx + 1), value: header });
        if (date) items.push({ label: 'Duration', value: date });
        entry.bullets.forEach(b => items.push({ label: 'Detail', value: b }));
      });
      if (items.length > 0) {
        sections.push({ title: 'Experience', items });
      }
    }
  }

  // Projects from tailored resume
  if (resumeSections.projects) {
    const entries = parseSubheadings(resumeSections.projects);
    if (entries.length > 0) {
      const items: { label: string; value: string }[] = [];
      entries.forEach((entry, idx) => {
        // heading[0]=Title, heading[1]=Date, heading[2]=Tech stack, heading[3]=extra
        const title = entry.heading[0] || '';
        const date = entry.heading[1] || '';
        const tech = entry.heading[2] || '';
        if (title) items.push({ label: 'Project ' + (idx + 1), value: title });
        if (tech) items.push({ label: 'Tech Stack', value: tech });
        if (date) items.push({ label: 'Year', value: date });
        entry.bullets.forEach(b => items.push({ label: 'Detail', value: b }));
      });
      if (items.length > 0) {
        sections.push({ title: 'Projects', items });
      }
    }
  }

  // Cover Letter
  if (coverLetter) {
    // Split into paragraphs for easy copying
    const paragraphs = coverLetter.split(/\n\n+/).filter(p => p.trim().length > 10);
    sections.push({
      title: 'Cover Letter',
      items: [
        { label: 'Full Text', value: coverLetter },
        ...paragraphs.map((p, i) => ({ label: `Paragraph ${i + 1}`, value: p.trim() })),
      ],
    });
  }

  return sections;
}

async function injectHelperOverlay(page: Page, sections: OverlaySection[]): Promise<void> {
  // Build the overlay CSS as a string on the server
  const css = [
    // Glassmorphic container
    '#cascade-overlay{position:fixed;top:12px;right:12px;width:330px;max-height:88vh;' +
      'background:rgba(15,15,25,0.72);backdrop-filter:blur(20px) saturate(1.6);-webkit-backdrop-filter:blur(20px) saturate(1.6);' +
      'color:#e2e8f0;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.35),inset 0 0.5px 0 rgba(255,255,255,0.08);' +
      'z-index:999999;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:13px;' +
      'overflow:hidden;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,0.08);transition:all 0.25s ease}',
    '#cascade-overlay.minimized{width:160px;max-height:42px;border-radius:12px}',
    '#cascade-overlay.minimized .cascade-body,#cascade-overlay.minimized .cascade-search,' +
      '#cascade-overlay.minimized .cascade-fill-btn,#cascade-overlay.minimized .cascade-fill-status{display:none}',
    // Header
    '.cascade-header{padding:10px 14px;display:flex;align-items:center;justify-content:space-between;' +
      'cursor:move;user-select:none;border-bottom:1px solid rgba(255,255,255,0.06)}',
    '.cascade-header h3{margin:0;font-size:13px;color:rgba(255,255,255,0.85);font-weight:500;letter-spacing:0.2px}',
    '.cascade-header-btns{display:flex;gap:2px}',
    '.cascade-header button{background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;' +
      'font-size:14px;padding:3px 7px;border-radius:6px;transition:all 0.15s}',
    '.cascade-header button:hover{background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.8)}',
    // Fill button
    '.cascade-fill-btn{display:block;width:calc(100% - 20px);margin:8px 10px 4px;padding:9px;border:none;' +
      'border-radius:10px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:13px;' +
      'font-weight:600;cursor:pointer;text-align:center;transition:all 0.2s;letter-spacing:0.2px}',
    '.cascade-fill-btn:hover{opacity:0.9;transform:translateY(-1px);box-shadow:0 4px 14px rgba(34,197,94,0.3)}',
    '.cascade-fill-btn:active{transform:translateY(0)}',
    '.cascade-fill-btn.filling{background:linear-gradient(135deg,#f59e0b,#d97706);cursor:wait}',
    '.cascade-fill-btn.done{background:linear-gradient(135deg,#3b82f6,#2563eb)}',
    '.cascade-fill-status{padding:3px 12px 6px;font-size:10px;color:rgba(255,255,255,0.4);text-align:center;display:none}',
    // Search
    '.cascade-search{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.05)}',
    '.cascade-search input{width:100%;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);' +
      'background:rgba(255,255,255,0.05);color:#e2e8f0;font-size:12px;outline:none;box-sizing:border-box;transition:border 0.15s}',
    '.cascade-search input::placeholder{color:rgba(255,255,255,0.25)}',
    '.cascade-search input:focus{border-color:rgba(99,102,241,0.5);background:rgba(255,255,255,0.07)}',
    // Body
    '.cascade-body{overflow-y:auto;max-height:calc(88vh - 130px);padding:2px 0;' +
      'scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent}',
    '.cascade-body::-webkit-scrollbar{width:4px}',
    '.cascade-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px}',
    // Sections
    '.cascade-section{border-bottom:1px solid rgba(255,255,255,0.04)}',
    '.cascade-section-title{padding:7px 14px;font-size:10px;font-weight:600;color:rgba(165,140,255,0.85);' +
      'text-transform:uppercase;letter-spacing:0.8px;cursor:pointer;display:flex;align-items:center;' +
      'justify-content:space-between;transition:background 0.12s}',
    '.cascade-section-title:hover{background:rgba(255,255,255,0.04)}',
    '.cascade-section-title .arrow{transition:transform 0.2s;font-size:9px;opacity:0.5}',
    '.cascade-section.collapsed .cascade-section-items{display:none}',
    '.cascade-section.collapsed .arrow{transform:rotate(-90deg)}',
    // Items
    '.cascade-item{display:flex;align-items:flex-start;padding:4px 14px;gap:6px;' +
      'border-bottom:1px solid rgba(255,255,255,0.02);transition:background 0.1s}',
    '.cascade-item:hover{background:rgba(255,255,255,0.04)}',
    '.cascade-item .ci-label{color:rgba(255,255,255,0.35);font-size:10px;min-width:70px;flex-shrink:0;padding-top:2px;font-weight:500}',
    '.cascade-item .ci-value{flex:1;color:rgba(255,255,255,0.82);word-break:break-word;font-size:12px;' +
      'line-height:1.45;max-height:56px;overflow:hidden;text-overflow:ellipsis}',
    '.cascade-item .ci-copy{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.08);' +
      'color:rgba(255,255,255,0.5);cursor:pointer;font-size:10px;padding:2px 8px;border-radius:6px;' +
      'white-space:nowrap;flex-shrink:0;transition:all 0.15s;font-weight:500}',
    '.cascade-item .ci-copy:hover{background:rgba(99,102,241,0.2);color:rgba(255,255,255,0.9);border-color:rgba(99,102,241,0.3)}',
    '.cascade-item .ci-copy.copied{background:rgba(34,197,94,0.2);color:#4ade80;border-color:rgba(34,197,94,0.3)}',
    '.cascade-item.hidden{display:none}',
  ].join('\n');

  // Build the static HTML skeleton
  const skeletonHtml = '<div id="cascade-overlay">'
    + '<div class="cascade-header" id="cascade-drag-handle">'
    + '<h3>\u2728 Helper Panel</h3>'
    + '<div class="cascade-header-btns">'
    + '<button id="cascade-minimize" title="Minimize">\u2015</button>'
    + '<button id="cascade-close" title="Close">\u2715</button></div>'
    + '</div>'
    + '<button class="cascade-fill-btn" id="cascade-fill-btn">\u26A1 Fill Fields</button>'
    + '<div class="cascade-fill-status" id="cascade-fill-status"></div>'
    + '<div class="cascade-search">'
    + '<input type="text" id="cascade-search-input" placeholder="Search fields\u2026" />'
    + '</div>'
    + '<div class="cascade-body" id="cascade-body"></div>'
    + '</div>';

  const sectionsJson = JSON.stringify(sections);

  await page.evaluate(({ css, skeletonHtml, sectionsJson }: { css: string; skeletonHtml: string; sectionsJson: string }) => {
    document.getElementById('cascade-overlay-root')?.remove();

    var parsedSections = JSON.parse(sectionsJson) as { title: string; items: { label: string; value: string }[] }[];

    var root = document.createElement('div');
    root.id = 'cascade-overlay-root';

    var style = document.createElement('style');
    style.textContent = css;
    root.appendChild(style);

    var container = document.createElement('div');
    container.innerHTML = skeletonHtml;
    root.appendChild(container);
    document.body.appendChild(root);

    var body = document.getElementById('cascade-body')!;

    // Render sections dynamically using DOM APIs (no template literals)
    parsedSections.forEach(function(section, si) {
      var sec = document.createElement('div');
      sec.className = 'cascade-section';
      if (si >= 2) sec.classList.add('collapsed');

      var titleEl = document.createElement('div');
      titleEl.className = 'cascade-section-title';
      var titleSpan = document.createElement('span');
      titleSpan.textContent = section.title + ' (' + section.items.length + ')';
      var arrowSpan = document.createElement('span');
      arrowSpan.className = 'arrow';
      arrowSpan.textContent = '\u25BC';
      titleEl.appendChild(titleSpan);
      titleEl.appendChild(arrowSpan);
      titleEl.onclick = function() { sec.classList.toggle('collapsed'); };
      sec.appendChild(titleEl);

      var itemsDiv = document.createElement('div');
      itemsDiv.className = 'cascade-section-items';

      section.items.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'cascade-item';
        row.dataset.searchText = (item.label + ' ' + item.value).toLowerCase();

        var labelSpan = document.createElement('span');
        labelSpan.className = 'ci-label';
        labelSpan.textContent = item.label;

        var valueSpan = document.createElement('span');
        valueSpan.className = 'ci-value';
        valueSpan.textContent = item.value;
        valueSpan.title = item.value;

        var copyBtn = document.createElement('button');
        copyBtn.className = 'ci-copy';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = function(e) {
          e.stopPropagation();
          var ta = document.createElement('textarea');
          ta.value = item.value;
          ta.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(function() { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1500);
        };

        row.appendChild(labelSpan);
        row.appendChild(valueSpan);
        row.appendChild(copyBtn);
        itemsDiv.appendChild(row);
      });

      sec.appendChild(itemsDiv);
      body.appendChild(sec);
    });

    // Search
    var searchInput = document.getElementById('cascade-search-input') as HTMLInputElement;
    searchInput.addEventListener('input', function() {
      var q = searchInput.value.toLowerCase();
      var items = document.querySelectorAll('.cascade-item');
      for (var i = 0; i < items.length; i++) {
        var el = items[i] as HTMLElement;
        var text = el.dataset.searchText || '';
        el.classList.toggle('hidden', q.length > 0 && text.indexOf(q) === -1);
      }
      if (q.length > 0) {
        var secs = document.querySelectorAll('.cascade-section');
        for (var j = 0; j < secs.length; j++) {
          var hasVisible = secs[j].querySelector('.cascade-item:not(.hidden)');
          (secs[j] as HTMLElement).classList.toggle('collapsed', !hasVisible);
        }
      }
    });

    // Minimize
    document.getElementById('cascade-minimize')!.onclick = function() {
      document.getElementById('cascade-overlay')!.classList.toggle('minimized');
    };

    // Close
    document.getElementById('cascade-close')!.onclick = function() { root.remove(); };

    // Fill Fields button
    var fillBtn = document.getElementById('cascade-fill-btn')!;
    var fillStatus = document.getElementById('cascade-fill-status')!;
    fillBtn.onclick = function() {
      if (fillBtn.classList.contains('filling')) return;
      fillBtn.classList.add('filling');
      fillBtn.textContent = 'Filling...';
      fillStatus.style.display = 'block';
      fillStatus.textContent = 'Running automation on current page...';
      var w = window as any;
      if (typeof w.cascadeFillFields === 'function') {
        w.cascadeFillFields().then(function(count: number) {
          fillBtn.classList.remove('filling');
          fillBtn.classList.add('done');
          fillBtn.textContent = 'Filled ' + count + ' fields!';
          fillStatus.textContent = 'Done. Fill any remaining fields manually. Click again for another pass.';
          setTimeout(function() {
            fillBtn.classList.remove('done');
            fillBtn.textContent = 'Fill Fields';
          }, 4000);
        }).catch(function() {
          fillBtn.classList.remove('filling');
          fillBtn.textContent = 'Fill Fields';
          fillStatus.textContent = 'Error during fill — try again';
        });
      } else {
        fillBtn.classList.remove('filling');
        fillBtn.textContent = 'Fill Fields';
        fillStatus.textContent = 'Fill function not available on this page';
      }
    };

    // Drag — smooth, no transition lag
    var isDragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;
    var overlay = document.getElementById('cascade-overlay')!;
    var handle = document.getElementById('cascade-drag-handle')!;
    handle.addEventListener('mousedown', function(e) {
      isDragging = true;
      startX = e.clientX; startY = e.clientY;
      var rect = overlay.getBoundingClientRect();
      origLeft = rect.left; origTop = rect.top;
      // Disable transition during drag for instant movement
      overlay.style.transition = 'none';
      overlay.style.willChange = 'left, top';
      overlay.style.right = 'auto';
      overlay.style.left = origLeft + 'px';
      overlay.style.top = origTop + 'px';
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      e.preventDefault();
      overlay.style.left = (origLeft + e.clientX - startX) + 'px';
      overlay.style.top = (origTop + e.clientY - startY) + 'px';
    });
    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      // Restore transition and cleanup
      overlay.style.transition = '';
      overlay.style.willChange = '';
      document.body.style.userSelect = '';
    });

  }, { css, skeletonHtml, sectionsJson });
}

export async function POST(req: NextRequest) {
  let browser: Browser | null = null;

  try {
    const { jobUrl, coverLetter, pdfBase64, jobSkills, resumeSections, jobInfo } = await req.json();

    if (!jobUrl) {
      return NextResponse.json({ error: 'Job URL is required.' }, { status: 400 });
    }

    const profile = getProfile();
    const steps: string[] = [];
    const pdfBuffer = pdfBase64 ? Buffer.from(pdfBase64, 'base64') : null;
    const skills: string[] = jobSkills || DEFAULT_SKILLS;
    const cl = coverLetter || '';

    // Build overlay data from profile + resume sections
    const overlayData = buildOverlayData(profile, skills, cl, resumeSections || {}, jobInfo || {});

    // Launch browser — visible so user can navigate, login, etc.
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 900 },
    });

    const page = await context.newPage();
    steps.push('Browser launched');

    // -----------------------------------------------------------
    // HELPER: Set up overlay + fill function on any page (tab).
    // Called for the initial page AND every new tab that opens.
    // -----------------------------------------------------------
    const setupPages = new Set<Page>();

    async function setupPage(p: Page) {
      if (setupPages.has(p)) return;
      setupPages.add(p);

      // Expose the fill function so the overlay button can call it
      try {
        await p.exposeFunction('cascadeFillFields', async () => {
          const fillSteps: string[] = [];
          try {
            await dismissCookiesAndPopups(p, fillSteps);
            await handleAddButtons(p, profile, cl, skills, fillSteps);
            const count = await fillFormSequential(p, profile, cl, skills, pdfBuffer, fillSteps);
            fillSteps.forEach(s => steps.push(s));
            return count;
          } catch (err) {
            fillSteps.push('Fill error: ' + (err as Error).message);
            fillSteps.forEach(s => steps.push(s));
            return 0;
          }
        });
      } catch { /* already exposed */ }

      // Wait for page to be ready then inject overlay
      try {
        await p.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await dismissCookiesAndPopups(p, []).catch(() => {});
        await injectHelperOverlay(p, overlayData).catch(() => {});
      } catch { /* page may have closed */ }
    }

    // Listen for ANY new tab/popup opened in this browser context
    context.on('page', async (newPage) => {
      steps.push('New tab detected: ' + newPage.url());
      await setupPage(newPage);
    });

    // Set up the initial page
    await setupPage(page);

    // Navigate to job page
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    steps.push('Navigated to: ' + jobUrl);
    await safeWait(page, 3000);

    // Close cookie banners / popups (first pass)
    await dismissCookiesAndPopups(page, steps);

    // Inject overlay with "Fill Fields" button + copy helpers
    await injectHelperOverlay(page, overlayData);
    steps.push('Injected helper overlay with Fill Fields button');

    // Try to find and click Apply button (best effort, non-blocking)
    await findApplyButton(page, steps);

    // Re-inject overlay after potential page navigation from Apply click
    await safeWait(page, 2000);
    await injectHelperOverlay(page, overlayData).catch(() => {});

    // -----------------------------------------------------------
    // KEEP-ALIVE LOOP
    // Every 5s, iterate ALL open pages in the context and
    // re-inject overlay if missing. Works across tabs/popups.
    // Browser stays open for 15 minutes.
    // -----------------------------------------------------------
    const keepAliveMs = 15 * 60 * 1000;
    const keepAliveStart = Date.now();
    const keepAliveInterval = 5000;

    // Run keep-alive in background (don't await — return response now)
    (async () => {
      while (Date.now() - keepAliveStart < keepAliveMs) {
        await new Promise(r => setTimeout(r, keepAliveInterval));
        try {
          // Iterate all open pages in this browser context
          const allPages = context.pages();
          for (const p of allPages) {
            try {
              // Ensure page is set up (fill function exposed)
              await setupPage(p);
              // Check if overlay exists, re-inject if not
              const hasOverlay = await p.evaluate(() => !!document.getElementById('cascade-overlay-root')).catch(() => false);
              if (!hasOverlay) {
                await injectHelperOverlay(p, overlayData).catch(() => {});
              }
              // Dismiss popups
              await dismissCookiesAndPopups(p, []).catch(() => {});
            } catch { /* page may have closed */ }
          }
        } catch {
          // Context/browser likely closed
          break;
        }
      }
      // Close browser after keep-alive period
      try { if (browser) await browser.close(); } catch { /* already closed */ }
    })();

    // Return immediately — browser stays open, user uses Fill Fields button
    return NextResponse.json({
      status: 'partial',
      message: 'Browser opened with Helper Panel. Navigate to the application form, log in if needed, then click "Fill Fields" to auto-fill. Works across all tabs. Browser stays open for 15 minutes.',
      steps,
    });
  } catch (err: any) {
    console.error('Auto-apply error:', err);
    setTimeout(async () => {
      try { if (browser) await browser.close(); } catch { /* ignore */ }
    }, 300000);
    return NextResponse.json({
      status: 'failed',
      message: err.message || 'Failed to launch browser.',
      steps: [],
    }, { status: 500 });
  }
}
