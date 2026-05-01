export const BASE_RESUME_LATEX = `%-------------------------
% Resume in Latex
% Author : Jake Gutierrez
% Based off of: https://github.com/sb2nov/resume
% License : MIT
%------------------------

\\documentclass[letterpaper,11pt]{article}

\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\usepackage{fontawesome5}
\\usepackage{multicol}
\\setlength{\\multicolsep}{-3.0pt}
\\setlength{\\columnsep}{-1pt}
\\input{glyphtounicode}


%----------FONT OPTIONS----------
% sans-serif
% \\usepackage[sfdefault]{FiraSans}
% \\usepackage[sfdefault]{roboto}
% \\usepackage[sfdefault]{noto-sans}
% \\usepackage[default]{sourcesanspro}

% serif
% \\usepackage{CormorantGaramond}
% \\usepackage{charter}


\\pagestyle{fancy}
\\fancyhf{} % clear all header and footer fields
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

% Adjust margins
\\addtolength{\\oddsidemargin}{-0.6in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1.19in}
\\addtolength{\\topmargin}{-.7in}
\\addtolength{\\textheight}{1.4in}

\\urlstyle{same}

\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

% Sections formatting
\\titleformat{\\section}{
  \\vspace{-4pt}\\scshape\\raggedright\\large\\bfseries
}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]

% Ensure that generate pdf is machine readable/ATS parsable
\\pdfgentounicode=1

%-------------------------
% Custom commands
\\newcommand{\\resumeItem}[1]{
  \\item\\small{
    {#1 \\vspace{-2pt}}
  }
}

\\newcommand{\\classesList}[4]{
    \\item\\small{
        {#1 #2 #3 #4 \\vspace{-2pt}}
  }
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-2pt}\\item
    \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & \\textbf{\\small #2} \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeSubSubheading}[2]{
    \\item
    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\textit{\\small#1} & \\textit{\\small #2} \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
    \\item
    \\begin{tabular*}{1.001\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\small#1 & \\textbf{\\small #2}\\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeSubItem}[1]{\\resumeItem{#1}\\vspace{-4pt}}

\\renewcommand\\labelitemi{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.0in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

\\newcommand{\\resumeAwardHeading}[1]{
  \\item \\textbf{#1}\\vspace{-6pt}
}
\\usepackage{graphicx}
\\usepackage{tikz}

%-------------------------------------------
%%%%%%  RESUME STARTS HERE  %%%%%%%%%%%%%%%%%%%%%%%%%%%%


\\begin{document}


%----------HEADING----------
\\begin{center}
    {\\Huge \\scshape Kevin Sudhan} \\\\ \\vspace{4pt}
    \\small Chennai, India \\\\ \\vspace{4pt}
    \\small
    Phone: 8939153390 \\;|\\;
    Email: \\href{mailto:kevinsudhan31@gmail.com}{kevinsudhan31@gmail.com} \\;|\\;
    LinkedIn: \\href{https://www.linkedin.com/in/kevin-sudhan-482153263/}{linkedin.com/in/kevin-sudhan-482153263} \\\\ \\vspace{2pt}
    GitHub: \\href{https://github.com/kevinsudhan}{github.com/kevinsudhan} \\;|\\;
    Portfolio: \\href{https://resumekevin.netlify.app/}{resumekevin.netlify.app}
    \\vspace{-10pt}
\\end{center}


%-----------EXPERIENCE-----------
%-----------EXPERIENCE-----------
%-----------EXPERIENCE-----------
\\section{Experience}
\\resumeSubHeadingListStart

\\resumeSubheading
{Everyday Banking Solutions}{Chennai, India}
{Software Development Intern}{Jan 2024 -- Feb 2025}

\\resumeItemListStart
\\resumeItem{Built and scaled a \\textbf{full-stack CRM platform} using \\textbf{React and ASP.NET}, handling \\textbf{1,000,000+ customer records} across \\textbf{30+ branches} with optimized data retrieval and clean component architecture.}
\\resumeItem{Designed and consumed \\textbf{RESTful APIs} for auth, CRUD, and workflow management, wrote clean, modular backend code with reusable service layers.}
\\resumeItem{Debugged and optimized \\textbf{SQL Server queries} and \\textbf{event-driven pipelines}, improving system reliability and reducing manual intervention across branch operations.}
\\resumeItemListEnd

\\vspace{6pt}

\\resumeSubheading
{Alibi Technologies LLP}{Chennai, India}
{Software Engineering Intern}{Mar 2024 -- Apr 2024}

\\resumeItemListStart
\\resumeItem{Built \\textbf{Python pipelines} with modular, maintainable design to collect, clean, and structure datasets across \\textbf{300+ cyber investigation cases}.}
\\resumeItem{Deployed \\textbf{LLaMA 2 (70B)} locally via Ollama, replacing manual workflows with an automated retrieval-augmented generation pipeline.}
\\resumeItem{Exposed outputs via \\textbf{documented API endpoints}, enabling downstream tools to query structured data programmatically at low latency.}
\\resumeItemListEnd

\\resumeSubHeadingListEnd
\\vspace{-16pt}

%honors and awards
\\section{Honors and Awards}
\\resumeSubHeadingListStart

\\item \\small{\\textbf{IIT Madras \\& Renault Nissan Grant} --- Received \\textbf{Rupees 5,00,000} for developing an AI-based road safety system.}

\\item \\small{\\textbf{Best Innovation Award} --- Recognized by Dr. Agarwal's Institute of Optometry for spearheading project DynaBraille.}


\\resumeSubHeadingListEnd
\\vspace{-14pt}






%projectssssssssssssss
\\section{Projects}
\\vspace{-5pt}
\\resumeSubHeadingListStart

\\resumeProjectHeading
{\\textbf{Accident Detection and Traffic Management System} $|$ \\emph{Python, OpenCV, Multi-Agent Systems, PostgreSQL}}{}
\\resumeItemListStart
\\resumeItem{Built a \\textbf{distributed traffic analytics system} to process surveillance feeds and detect accidents in real time.}
\\resumeItem{Implemented \\textbf{parallel pipelines} for video metadata ingestion, event logging, and fast query execution.}
\\resumeItem{Developed \\textbf{agent coordination logic} for automated alert routing and traffic response handling.}
\\resumeItemListEnd

\\vspace{-8pt}

\\resumeProjectHeading
{\\textbf{Financial News Scraping and Alerting System} $|$ \\emph{Python, REST APIs, PostgreSQL, AsyncIO, Cloud}}{}
\\resumeItemListStart
\\resumeItem{Developed a \\textbf{distributed scraping pipeline} to collect real-time financial news from APIs and web sources.}
\\resumeItem{Built \\textbf{async processing services} for normalization, deduplication, and event classification with low latency.}
\\resumeItem{Deployed a \\textbf{cloud alerting service} to trigger notifications for high-impact market events.}
\\resumeItemListEnd

\\vspace{-8pt}

\\resumeProjectHeading
{\\textbf{Dynamic Braille Assistive System with Edge AI} $|$ \\emph{Python, YOLO, Raspberry Pi, ESP32}}{}
\\resumeItemListStart
\\resumeItem{Built a \\textbf{real-time edge system} converting camera input into tactile Braille output.}
\\resumeItem{Implemented a \\textbf{YOLO inference pipeline} optimized for Raspberry Pi low-latency execution.}
\\resumeItem{Developed \\textbf{Raspberry Pi--ESP32 communication} for synchronized actuator control and feedback output.}
\\resumeItemListEnd

\\resumeSubHeadingListEnd
\\vspace{-15pt}

\\section{Technical Skills}
\\begin{itemize}[leftmargin=0.15in, label={}]
\\small{\\item{
\\textbf{Languages}{: Python, JavaScript, C, SQL, R} \\\\
\\textbf{Frontend}{: React, React Native, Tailwind CSS, responsive UI, component architecture} \\\\
\\textbf{Backend \\& APIs}{: Node.js, FastAPI, Flask, ASP.NET, RESTful APIs, clean code design} \\\\
\\textbf{Database}{: SQL Server, relational schema design, query optimization} \\\\
\\textbf{Cloud \\& DevOps}{: Git, AWS basics, GCP basics, CI/CD, agile development} \\\\
\\textbf{AI \\& Pipelines}{: LLM integration, RAG pipelines, event-driven automation, Pandas, NumPy} \\\\
}}
\\end{itemize}
\\vspace{-16pt}

%-----------EDUCATION-----------
\\section{Education}
  \\resumeSubHeadingListStart
    \\resumeSubheading
      { Loyola ICAM College of Engineering and Technology}{September 2021 -- May 2025}
      {B.E. in Electronics and Communication Engineering
}{Chennai, India}
  \\resumeSubHeadingListEnd

\\end{document}`;
