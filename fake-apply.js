#!/usr/bin/env node
// fake-apply.js — run with: node fake-apply.js

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const BLUE   = '\x1b[34m';
const MAGENTA= '\x1b[35m';
const WHITE  = '\x1b[37m';

const spin  = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
const dots  = ['   ','·  ','·· ','···'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function spinner(msg, duration, color = CYAN) {
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < duration) {
    process.stdout.write(`\r${color}${spin[i % spin.length]}${RESET}  ${msg}   `);
    i++;
    await sleep(80);
  }
  process.stdout.write(`\r${GREEN}✔${RESET}  ${msg}   \n`);
}

async function dotLoader(msg, duration, color = DIM) {
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < duration) {
    process.stdout.write(`\r${color}${dots[i % dots.length]}${RESET}  ${msg}`);
    i++;
    await sleep(300);
  }
  process.stdout.write(`\r   ${msg}\n`);
}

function log(msg, color = WHITE) {
  console.log(`${color}${msg}${RESET}`);
}

function section(title, color = BOLD + BLUE) {
  console.log(`\n${color}${'─'.repeat(55)}${RESET}`);
  console.log(`${color}  ${title}${RESET}`);
  console.log(`${color}${'─'.repeat(55)}${RESET}\n`);
}

function tag(label, value, lc = YELLOW, vc = WHITE) {
  console.log(`  ${lc}${label.padEnd(22)}${RESET}${vc}${value}${RESET}`);
}

// ── JOBS ─────────────────────────────────────────────────
const JOBS = [
  {
    platform: 'LinkedIn',
    color: BLUE,
    icon: '🔵',
    jobs: [
      { title: 'Software Engineer II',        company: 'Flipkart',         loc: 'Bengaluru' },
      { title: 'Full Stack Developer',        company: 'Razorpay',         loc: 'Remote'    },
      { title: 'Backend Engineer (Python)',   company: 'Zepto',            loc: 'Mumbai'    },
    ],
  },
  {
    platform: 'Naukri',
    color: MAGENTA,
    icon: '🟣',
    jobs: [
      { title: 'Software Developer',          company: 'Infosys',          loc: 'Chennai'   },
      { title: 'React Developer',             company: 'Zoho Corporation', loc: 'Chennai'   },
      { title: 'Python Developer',            company: 'Freshworks',       loc: 'Hyderabad' },
    ],
  },
  {
    platform: 'Career Site (Workday)',
    color: CYAN,
    icon: '🟢',
    jobs: [
      { title: 'Associate Software Engineer', company: 'Walmart Global',   loc: 'Bengaluru' },
      { title: 'Software Dev Engineer I',     company: 'Amazon',           loc: 'Hyderabad' },
      { title: 'Graduate Software Engineer',  company: 'SAP Labs India',   loc: 'Bengaluru' },
    ],
  },
];

// ── MAIN ─────────────────────────────────────────────────
(async () => {
  console.clear();
  log(`\n${BOLD}${GREEN}  ╔══════════════════════════════════════════╗${RESET}`);
  log(`${BOLD}${GREEN}  ║    🤖  JOB APPLICATION AUTOMATOR v2.3   ║${RESET}`);
  log(`${BOLD}${GREEN}  ╚══════════════════════════════════════════╝${RESET}\n`);

  await sleep(600);
  log(`${DIM}  Initialising browser context...${RESET}`);
  await spinner('Launching headless Chromium', 1800);
  await spinner('Loading user profile & cookies', 1200);
  await spinner('Injecting resume data', 900);
  log(`\n  ${GREEN}✔${RESET}  Engine ready. Processing ${BOLD}9 job listings${RESET} across 3 platforms.\n`);
  await sleep(500);

  for (const platform of JOBS) {
    section(`${platform.icon}  ${platform.platform}`, BOLD + platform.color);

    await spinner(`Navigating to ${platform.platform}`, 1400, platform.color);
    await spinner('Authenticating session', 1100, platform.color);
    await sleep(200);

    for (let idx = 0; idx < platform.jobs.length; idx++) {
      const job = platform.jobs[idx];
      const num = `[${idx + 1}/${platform.jobs.length}]`;

      log(`\n  ${platform.color}${num}${RESET} ${BOLD}${job.title}${RESET} ${DIM}@ ${job.company} · ${job.loc}${RESET}`);

      await dotLoader('  Opening job listing page', 600);
      await spinner('  Detecting application form', 900, platform.color);
      await spinner('  Filling personal details', 800, platform.color);
      await spinner('  Uploading resume PDF', 1000, platform.color);
      await spinner('  Answering screening questions', 1300, platform.color);

      // Occasionally simulate a captcha / extra step
      if (Math.random() > 0.6) {
        await spinner('  Handling CAPTCHA challenge', 700, YELLOW);
      }

      await spinner('  Submitting application', 700, platform.color);
      await sleep(120);
      const mins = Math.floor(Math.random() * 3) + 2;
      const secs = Math.floor(Math.random() * 59).toString().padStart(2, '0');
      log(`  ${GREEN}✔  Application submitted successfully${RESET}  ${DIM}(${mins}m ${secs}s)${RESET}`);
      await sleep(350);
    }

    log(`\n  ${GREEN}✔  ${platform.platform} — all jobs applied.${RESET}`);
    await sleep(400);
  }

  // ── SUMMARY ─────────────────────────────────────────────
  section('📊  SESSION SUMMARY', BOLD + GREEN);
  tag('Total platforms',    '3');
  tag('Jobs applied',       '9');
  tag('Success rate',       '100%');
  tag('Avg time / job',     '6.2 s');
  tag('Total session time', `${(Math.random()*8+54).toFixed(0)}s`);
  tag('Credentials used',   'kevinsudhan31@gmail.com');
  tag('Resume version',     'Kevin_Sudhan_Resume_v4.pdf');

  console.log();
  log(`${BOLD}${GREEN}  ✅  All 9 applications filed. Good luck! 🚀${RESET}\n`);
})();
