// Types for the Apply page
export type JobStatus = 'analyzing' | 'tailoring' | 'ready' | 'approved' | 'applying' | 'applied' | 'failed';

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

export type SectionApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface CoverLetter {
  text: string;
  summary: string;
  approved: boolean;
}

export interface ApplyResult {
  status: 'success' | 'partial' | 'failed';
  message: string;
  steps: string[];
  screenshotUrl?: string;
}

export interface PendingJob {
  id: string;
  jobText: string;
  status: JobStatus;
  analysis: JobAnalysis | null;
  resume: TailoredResume | null;
  pdfUrl: string | null;
  pdfBlob: Blob | null;
  sectionApprovals: {
    experience: SectionApprovalStatus;
    projects: SectionApprovalStatus;
    skills: SectionApprovalStatus;
  };
  coverLetter: CoverLetter | null;
  applyResult: ApplyResult | null;
  createdAt: string;
  error?: string;
}

export interface PipelineStep {
  label: string;
  status: 'waiting' | 'active' | 'done' | 'error';
}
