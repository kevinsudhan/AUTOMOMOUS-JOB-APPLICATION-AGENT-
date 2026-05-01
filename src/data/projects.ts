export interface ProjectEntry {
  name: string;
  tech: string[];
  category: string[];
  bullets: string[];
  latex: string;
}

export const ALL_PROJECTS: ProjectEntry[] = [
  {
    name: 'DynaBraille',
    tech: ['Python', 'TensorFlow', 'OpenCV', 'YOLO', 'Raspberry Pi', 'ESP32'],
    category: ['AI/ML', 'Hardware', 'Computer Vision'],
    bullets: [
      'Engineered real time object detection system converting visual input to Braille output using YOLO models.',
      'Built custom hardware interface with Raspberry Pi controlling servo actuated Braille cells.',
      'Achieved 94% detection accuracy across 80 object classes with optimized inference pipeline.',
    ],
    latex: `\\resumeProjectHeading
      {\\textbf{DynaBraille} $|$ \\emph{Python, TensorFlow, OpenCV, Raspberry Pi}}{2024}
      \\resumeItemListStart
        \\resumeItem{Engineered real time object detection system converting visual input to Braille output using YOLO models.}
        \\resumeItem{Built custom hardware interface with Raspberry Pi controlling servo actuated Braille cells.}
        \\resumeItem{Achieved 94\\% detection accuracy across 80 object classes with optimized inference pipeline.}
      \\resumeItemListEnd`,
  },
  {
    name: 'AI Career Platform',
    tech: ['Next.js', 'TypeScript', 'Claude API', 'LaTeX', 'React'],
    category: ['Full Stack', 'AI/ML', 'Frontend'],
    bullets: [
      'Developed AI powered job application platform with automated resume tailoring using LLM APIs.',
      'Built LaTeX compilation engine generating ATS optimized resumes with PDF preview.',
      'Implemented intelligent job matching system with skill gap analysis and application tracking.',
    ],
    latex: `\\resumeProjectHeading
      {\\textbf{AI Career Platform} $|$ \\emph{Next.js, TypeScript, Claude API, LaTeX}}{2024}
      \\resumeItemListStart
        \\resumeItem{Developed AI powered job application platform with automated resume tailoring using LLM APIs.}
        \\resumeItem{Built LaTeX compilation engine generating ATS optimized resumes with PDF preview.}
        \\resumeItem{Implemented intelligent job matching system with skill gap analysis and application tracking.}
      \\resumeItemListEnd`,
  },
  {
    name: 'Financial Data Scraper',
    tech: ['Python', 'Scrapy', 'PostgreSQL', 'Docker', 'AWS'],
    category: ['Backend', 'Data Engineering', 'Cloud'],
    bullets: [
      'Built distributed web scraping system collecting financial data from 50+ sources daily.',
      'Designed PostgreSQL schema with optimized queries processing 1M+ records efficiently.',
      'Containerized with Docker and deployed on AWS EC2 with automated scheduling via cron.',
    ],
    latex: `\\resumeProjectHeading
      {\\textbf{Financial Data Scraper} $|$ \\emph{Python, Scrapy, PostgreSQL, Docker}}{2023}
      \\resumeItemListStart
        \\resumeItem{Built distributed web scraping system collecting financial data from 50+ sources daily.}
        \\resumeItem{Designed PostgreSQL schema with optimized queries processing 1M+ records efficiently.}
        \\resumeItem{Containerized with Docker and deployed on AWS EC2 with automated scheduling via cron.}
      \\resumeItemListEnd`,
  },
  {
    name: 'STAMS',
    tech: ['Python', 'Multi-Agent Systems', 'Computer Vision', 'IoT'],
    category: ['AI/ML', 'Computer Vision', 'IoT'],
    bullets: [
      'Developed multi agent traffic and accident management system in collaboration with IIT Madras and Renault Nissan.',
      'Secured research grant of INR 5,00,000 for scalable deployment of intelligent traffic monitoring.',
      'Built real time vehicle detection and accident classification pipeline using computer vision models.',
    ],
    latex: `\\resumeProjectHeading
      {\\textbf{STAMS: Traffic \\& Accident Management} $|$ \\emph{Python, Multi-Agent Systems, OpenCV}}{2024}
      \\resumeItemListStart
        \\resumeItem{Developed multi agent traffic and accident management system in collaboration with IIT Madras and Renault Nissan.}
        \\resumeItem{Secured research grant of INR 5,00,000 for scalable deployment of intelligent traffic monitoring.}
        \\resumeItem{Built real time vehicle detection and accident classification pipeline using computer vision models.}
      \\resumeItemListEnd`,
  },
  {
    name: 'Whistle',
    tech: ['Blockchain', 'Solidity', 'React', 'Node.js', 'LLM APIs'],
    category: ['Full Stack', 'Blockchain', 'AI/ML'],
    bullets: [
      'Built blockchain based decentralized peer to peer lending platform eliminating banking intermediaries.',
      'Integrated LLMs to auto categorize financial reports and automate decision workflows.',
      'Implemented smart contracts in Solidity handling trustless lending with escrow mechanisms.',
    ],
    latex: `\\resumeProjectHeading
      {\\textbf{Whistle: P2P Lending Platform} $|$ \\emph{Blockchain, Solidity, React, Node.js}}{2024}
      \\resumeItemListStart
        \\resumeItem{Built blockchain based decentralized peer to peer lending platform eliminating banking intermediaries.}
        \\resumeItem{Integrated LLMs to auto categorize financial reports and automate decision workflows.}
        \\resumeItem{Implemented smart contracts in Solidity handling trustless lending with escrow mechanisms.}
      \\resumeItemListEnd`,
  },
  {
    name: 'Mithra',
    tech: ['Python', 'Jetson Nano', 'LLM', 'Edge AI', 'Multi-Agent'],
    category: ['AI/ML', 'Healthcare', 'Edge Computing'],
    bullets: [
      'Built AI powered edge healthcare assistant using Jetson Nano and local LLMs for real time diagnostics.',
      'Designed multi agent architecture enabling private patient monitoring with sentiment aware triage.',
      'Enabled multilingual AI assistant with voice interaction and privacy focused on device processing.',
    ],
    latex: `\\resumeProjectHeading
      {\\textbf{Mithra: Edge Healthcare AI} $|$ \\emph{Python, Jetson Nano, LLMs, Multi-Agent}}{2024}
      \\resumeItemListStart
        \\resumeItem{Built AI powered edge healthcare assistant using Jetson Nano and local LLMs for real time diagnostics.}
        \\resumeItem{Designed multi agent architecture enabling private patient monitoring with sentiment aware triage.}
        \\resumeItem{Enabled multilingual AI assistant with voice interaction and privacy focused on device processing.}
      \\resumeItemListEnd`,
  },
  {
    name: 'News Bot',
    tech: ['Python', 'Gemini API', 'Web Scraping', 'Cloud', 'NLP'],
    category: ['AI/ML', 'Backend', 'Data Engineering'],
    bullets: [
      'Built agent powered news scraper and synthesizer gathering market impacting news using Gemini LLM.',
      'Deployed cloud based pipeline used by traders for actionable financial alerts and summaries.',
      'Automated end to end news collection, deduplication, and relevance scoring across 30+ sources.',
    ],
    latex: `\\resumeProjectHeading
      {\\textbf{News Bot: AI News Synthesizer} $|$ \\emph{Python, Gemini API, Cloud, NLP}}{2024}
      \\resumeItemListStart
        \\resumeItem{Built agent powered news scraper and synthesizer gathering market impacting news using Gemini LLM.}
        \\resumeItem{Deployed cloud based pipeline used by traders for actionable financial alerts and summaries.}
        \\resumeItem{Automated end to end news collection, deduplication, and relevance scoring across 30+ sources.}
      \\resumeItemListEnd`,
  },
  {
    name: 'EduGen',
    tech: ['Python', 'Three.js', 'LLM APIs', 'Voice AI', 'React'],
    category: ['AI/ML', 'Frontend', 'EdTech'],
    bullets: [
      'Created 3D interactive AI tutor for school children with cartoon style avatar and voice integration.',
      'Implemented LLM powered conceptual learning system adapting difficulty based on student responses.',
      'Built React frontend with Three.js rendering delivering engaging educational experiences.',
    ],
    latex: `\\resumeProjectHeading
      {\\textbf{EduGen: 3D AI EdTech Agent} $|$ \\emph{React, Three.js, LLM APIs, Voice AI}}{2024}
      \\resumeItemListStart
        \\resumeItem{Created 3D interactive AI tutor for school children with cartoon style avatar and voice integration.}
        \\resumeItem{Implemented LLM powered conceptual learning system adapting difficulty based on student responses.}
        \\resumeItem{Built React frontend with Three.js rendering delivering engaging educational experiences.}
      \\resumeItemListEnd`,
  },
  {
    name: 'Portfolio Talk',
    tech: ['Python', 'React', 'Monte Carlo', 'LLM APIs', 'Finance'],
    category: ['AI/ML', 'Full Stack', 'Finance'],
    bullets: [
      'Developed finance portfolio dashboard with integrated Monte Carlo simulations and Sharpe optimization.',
      'Built conversational AI agent enabling users to analyze personal portfolio performance via natural language.',
      'Implemented real time portfolio tracking with automated rebalancing suggestions.',
    ],
    latex: `\\resumeProjectHeading
      {\\textbf{Portfolio Talk: Finance AI Assistant} $|$ \\emph{Python, React, Monte Carlo, LLM APIs}}{2024}
      \\resumeItemListStart
        \\resumeItem{Developed finance portfolio dashboard with integrated Monte Carlo simulations and Sharpe optimization.}
        \\resumeItem{Built conversational AI agent enabling users to analyze personal portfolio performance via natural language.}
        \\resumeItem{Implemented real time portfolio tracking with automated rebalancing suggestions.}
      \\resumeItemListEnd`,
  },
  {
    name: 'Pyaari Sevika',
    tech: ['Python', 'LLM APIs', 'Voice AI', 'Healthcare', 'NLP'],
    category: ['AI/ML', 'Healthcare', 'NLP'],
    bullets: [
      'Designed AI health assistant for rural India with native language support and diagnosis guidance.',
      'Integrated voice query support with backend medical knowledge base for accessible healthcare.',
      'Built multilingual NLP pipeline handling regional languages with medical terminology mapping.',
    ],
    latex: `\\resumeProjectHeading
      {\\textbf{Pyaari Sevika: Rural Health AI} $|$ \\emph{Python, LLM APIs, Voice AI, NLP}}{2024}
      \\resumeItemListStart
        \\resumeItem{Designed AI health assistant for rural India with native language support and diagnosis guidance.}
        \\resumeItem{Integrated voice query support with backend medical knowledge base for accessible healthcare.}
        \\resumeItem{Built multilingual NLP pipeline handling regional languages with medical terminology mapping.}
      \\resumeItemListEnd`,
  },
];
