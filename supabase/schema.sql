-- Run this in the Supabase SQL editor to create the required tables

-- Personal details table (1 row per user)
-- The `data` JSONB column stores everything:
--   identity, contact, address, education, work preferences, legal,
--   languages, techExperience, customFields,
--   baseResume (LaTeX string), projects (array of ProjectEntry)
CREATE TABLE IF NOT EXISTS personal_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  data JSONB NOT NULL DEFAULT '{}',
  profile_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE personal_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own details"
  ON personal_details FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own details"
  ON personal_details FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own details"
  ON personal_details FOR UPDATE
  USING (auth.uid() = user_id);

-- Applications table (track real jobs applied to)
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company TEXT,
  role TEXT,
  job_url TEXT,
  status TEXT DEFAULT 'applied',
  match_score INTEGER,
  ats_score INTEGER,
  platform TEXT DEFAULT 'job-link',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own applications"
  ON applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own applications"
  ON applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own applications"
  ON applications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own applications"
  ON applications FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_personal_details_updated_at
  BEFORE UPDATE ON personal_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Apply via Excel feature
-- Companies/contacts imported from a spreadsheet, worked through as a queue:
-- import -> per-company tailored resume -> per-contact email draft -> Gmail send
-- ============================================================================

-- One row per imported company (unique per user).
CREATE TABLE IF NOT EXISTS excel_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  -- Explicit override only; the "computed" statuses (Resume Ready / In Progress /
  -- Completed) are derived at read time from excel_contacts + excel_resume_versions.
  -- This column mainly carries 'not_started' (default) and 'skipped' (manual).
  status TEXT NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)
);

-- One row per imported contact. Dedupe key is (company_id, email).
CREATE TABLE IF NOT EXISTS excel_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES excel_companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  email TEXT NOT NULL,
  email_type TEXT,
  domain TEXT,
  linkedin TEXT,
  notes TEXT,
  -- not_sent | queued | sending | sent | bounced | failed | skipped
  status TEXT NOT NULL DEFAULT 'not_sent',
  -- Links the draft/send back to the resume+JD it was generated for.
  application_run_id UUID,
  subject TEXT,
  body TEXT,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error TEXT,
  source_row JSONB,
  -- Reply tracking: set when a send succeeds, checked against the thread by
  -- the send-queue's check-replies worker to detect a reply.
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  replied_at TIMESTAMPTZ,
  reply_snippet TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, email)
);

-- Reuses the same tailoring output shape as TailoredResume (latex/sections/scores),
-- plus a compiled PDF snapshot so the send queue doesn't need to recompile per email.
CREATE TABLE IF NOT EXISTS excel_resume_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES excel_companies(id) ON DELETE CASCADE NOT NULL,
  latex TEXT NOT NULL,
  sections JSONB,
  changes JSONB,
  ats_score INTEGER,
  resume_score INTEGER,
  pdf_base64 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per "generate a resume for this company/role" run — the history
-- shown when a company is revisited.
CREATE TABLE IF NOT EXISTS excel_application_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES excel_companies(id) ON DELETE CASCADE NOT NULL,
  job_link_or_jd TEXT,
  role_title TEXT,
  resume_version_id UUID REFERENCES excel_resume_versions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE excel_contacts
  ADD CONSTRAINT excel_contacts_application_run_id_fkey
  FOREIGN KEY (application_run_id) REFERENCES excel_application_runs(id) ON DELETE SET NULL;

-- One connected Gmail account per user. Refresh token is encrypted (AES-256-GCM)
-- at the application layer before being stored here — never stored in plaintext.
CREATE TABLE IF NOT EXISTS gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT,
  encrypted_refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user send-queue configuration (daily cap + jitter delay bounds).
CREATE TABLE IF NOT EXISTS excel_send_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_cap INTEGER NOT NULL DEFAULT 30,
  min_delay_seconds INTEGER NOT NULL DEFAULT 45,
  max_delay_seconds INTEGER NOT NULL DEFAULT 120,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE excel_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE excel_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE excel_resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE excel_application_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE excel_send_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own excel companies" ON excel_companies
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own excel contacts" ON excel_contacts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own excel resume versions" ON excel_resume_versions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own excel application runs" ON excel_application_runs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own gmail account" ON gmail_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own send settings" ON excel_send_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_excel_companies_updated_at
  BEFORE UPDATE ON excel_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_excel_contacts_updated_at
  BEFORE UPDATE ON excel_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_accounts_updated_at
  BEFORE UPDATE ON gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_excel_contacts_company_id ON excel_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_excel_contacts_status_scheduled ON excel_contacts(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_excel_contacts_user_status ON excel_contacts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_excel_application_runs_company_id ON excel_application_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_excel_contacts_reply_check ON excel_contacts(status, replied_at) WHERE gmail_thread_id IS NOT NULL;
