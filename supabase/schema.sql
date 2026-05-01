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
