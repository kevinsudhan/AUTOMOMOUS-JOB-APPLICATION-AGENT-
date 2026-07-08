'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  User, MapPin, GraduationCap, Briefcase, Globe, Shield,
  Save, CheckCircle2, Plus, X, Code, Languages, FileText, FolderOpen, ChevronDown, ChevronUp,
} from 'lucide-react';
import { type ProjectEntry } from '@/data/projects';
import styles from './page.module.css';

interface CustomField {
  key: string;
  value: string;
}

interface PersonalDetails {
  // Identity
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  fatherName: string;
  motherName: string;
  maritalStatus: string;

  // Contact
  email: string;
  phone: string;
  altPhone: string;
  phoneCountryCode: string;

  // Address
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  currentLocation: string;

  // Online Profiles
  linkedin: string;
  github: string;
  portfolio: string;

  // Education
  university: string;
  college: string;
  degree: string;
  degreeFullName: string;
  major: string;
  gpa: string;
  gpaScale: string;
  gradMonth: string;
  gradYear: string;
  educationStartYear: string;

  // Legal
  nationality: string;
  citizenship: string;
  legallyAuthorized: boolean;
  requireVisa: boolean;
  willingToRelocate: boolean;
  willingToTravel: boolean;
  backgroundCheck: boolean;
  driversLicense: boolean;
  veteranStatus: string;
  disabilityStatus: string;
  race: string;

  // Work Preferences
  preferredLocations: string[];
  expectedSalary: string;
  expectedCTC: string;
  noticePeriod: string;
  availableStartDate: string;
  totalExperience: string;
  relevantExperience: string;
  currentCTC: string;

  // Languages
  languages: Record<string, string>;

  // Tech Experience
  techExperience: Record<string, number>;

  // Custom Fields
  customFields: CustomField[];

  // Base Resume LaTeX
  baseResume: string;

  // Projects
  projects: ProjectEntry[];
}

// Deliberately blank — this is a shared, multi-tenant deployment now, not a
// single-person tool. Every field starts empty so a new user never sees (or
// unknowingly submits) another user's real name, contact info, resume, or
// work history. Each signed-in user's own saved data (loaded from Supabase
// in the effect below) fills this in, and persists per-account from there.
const DEFAULT_DETAILS: PersonalDetails = {
  firstName: '',
  middleName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  fatherName: '',
  motherName: '',
  maritalStatus: '',

  email: '',
  phone: '',
  altPhone: '',
  phoneCountryCode: '+91',

  streetAddress: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  currentLocation: '',

  linkedin: '',
  github: '',
  portfolio: '',

  university: '',
  college: '',
  degree: '',
  degreeFullName: '',
  major: '',
  gpa: '',
  gpaScale: '10',
  gradMonth: '',
  gradYear: '',
  educationStartYear: '',

  nationality: '',
  citizenship: '',
  legallyAuthorized: true,
  requireVisa: false,
  willingToRelocate: true,
  willingToTravel: true,
  backgroundCheck: true,
  driversLicense: true,
  veteranStatus: 'I am not a protected veteran',
  disabilityStatus: 'I do not wish to answer',
  race: 'Decline to self-identify',

  preferredLocations: [],
  expectedSalary: 'Negotiable',
  expectedCTC: '',
  noticePeriod: 'Immediate',
  availableStartDate: 'Immediately',
  totalExperience: '',
  relevantExperience: '',
  currentCTC: '',

  languages: {},

  techExperience: {},

  customFields: [],

  baseResume: '',

  projects: [],
};

export default function PersonalDetailsPage() {
  const [details, setDetails] = useState<PersonalDetails>(DEFAULT_DETAILS);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newLangName, setNewLangName] = useState('');
  const [newTechName, setNewTechName] = useState('');
  const [newLocInput, setNewLocInput] = useState('');
  const [showResume, setShowResume] = useState(false);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);

  // Load from Supabase on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/personal-details');
        if (res.ok) {
          const { details: stored } = await res.json();
          if (stored) {
            setDetails({ ...DEFAULT_DETAILS, ...stored });
          }
        }
      } catch { /* use defaults */ }
      setLoading(false);
    })();
  }, []);

  const update = useCallback(<K extends keyof PersonalDetails>(key: K, value: PersonalDetails[K]) => {
    setDetails(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/personal-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ details, profileComplete: true }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch { /* save failed */ }
    setSaving(false);
  }, [details]);

  const addCustomField = () => {
    update('customFields', [...details.customFields, { key: '', value: '' }]);
  };

  const updateCustomField = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...details.customFields];
    updated[index] = { ...updated[index], [field]: val };
    update('customFields', updated);
  };

  const removeCustomField = (index: number) => {
    update('customFields', details.customFields.filter((_, i) => i !== index));
  };

  const addLanguage = () => {
    if (!newLangName.trim()) return;
    update('languages', { ...details.languages, [newLangName.trim()]: 'Conversational' });
    setNewLangName('');
  };

  const removeLanguage = (lang: string) => {
    const updated = { ...details.languages };
    delete updated[lang];
    update('languages', updated);
  };

  const addTech = () => {
    if (!newTechName.trim()) return;
    update('techExperience', { ...details.techExperience, [newTechName.trim()]: 0 });
    setNewTechName('');
  };

  const removeTech = (tech: string) => {
    const updated = { ...details.techExperience };
    delete updated[tech];
    update('techExperience', updated);
  };

  // Project helpers
  const addProject = () => {
    const newProj: ProjectEntry = { name: '', tech: [], category: [], bullets: [''], latex: '' };
    update('projects', [...details.projects, newProj]);
    setExpandedProject(details.projects.length);
  };

  const updateProject = (index: number, field: keyof ProjectEntry, value: any) => {
    const updated = [...details.projects];
    updated[index] = { ...updated[index], [field]: value };
    update('projects', updated);
  };

  const removeProject = (index: number) => {
    update('projects', details.projects.filter((_, i) => i !== index));
    if (expandedProject === index) setExpandedProject(null);
  };

  const addBullet = (projIdx: number) => {
    const updated = [...details.projects];
    updated[projIdx] = { ...updated[projIdx], bullets: [...updated[projIdx].bullets, ''] };
    update('projects', updated);
  };

  const updateBullet = (projIdx: number, bulletIdx: number, val: string) => {
    const updated = [...details.projects];
    const bullets = [...updated[projIdx].bullets];
    bullets[bulletIdx] = val;
    updated[projIdx] = { ...updated[projIdx], bullets };
    update('projects', updated);
  };

  const removeBullet = (projIdx: number, bulletIdx: number) => {
    const updated = [...details.projects];
    updated[projIdx] = { ...updated[projIdx], bullets: updated[projIdx].bullets.filter((_, i) => i !== bulletIdx) };
    update('projects', updated);
  };

  const addPreferredLocation = () => {
    if (!newLocInput.trim()) return;
    update('preferredLocations', [...details.preferredLocations, newLocInput.trim()]);
    setNewLocInput('');
  };

  const removePreferredLocation = (index: number) => {
    update('preferredLocations', details.preferredLocations.filter((_, i) => i !== index));
  };

  const Field = ({ label, value, onChange, placeholder, type = 'text', fullWidth = false }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; fullWidth?: boolean;
  }) => (
    <div className={`${styles.fieldGroup} ${fullWidth ? styles.formGridFull : ''}`}>
      <label className={styles.fieldLabel}>{label}</label>
      <input
        className={styles.fieldInput}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );

  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <div className={styles.toggleRow}>
      <button
        type="button"
        className={`${styles.toggle} ${value ? styles.toggleActive : ''}`}
        onClick={() => onChange(!value)}
      />
      <span className={styles.toggleLabel}>{label}</span>
    </div>
  );

  if (loading) {
    return (
      <div className={styles.page}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
          Loading your details...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.heading}>Personal Details</h1>
            <p className={styles.subheading}>Manage the information used for auto-filling job applications.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {saved && <span className={styles.savedMsg}><CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />Saved</span>}
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              <Save size={16} />{saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Identity */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><User size={18} className={styles.sectionIcon} />Identity</h2>
        </div>
        <div className={styles.formGrid}>
          <Field label="First Name" value={details.firstName} onChange={v => update('firstName', v)} />
          <Field label="Middle Name" value={details.middleName} onChange={v => update('middleName', v)} />
          <Field label="Last Name" value={details.lastName} onChange={v => update('lastName', v)} />
          <Field label="Date of Birth" value={details.dateOfBirth} onChange={v => update('dateOfBirth', v)} type="date" />
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Gender</label>
            <select className={styles.fieldSelect} value={details.gender} onChange={e => update('gender', e.target.value)}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Marital Status</label>
            <select className={styles.fieldSelect} value={details.maritalStatus} onChange={e => update('maritalStatus', e.target.value)}>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
          <Field label="Father's Name" value={details.fatherName} onChange={v => update('fatherName', v)} />
          <Field label="Mother's Name" value={details.motherName} onChange={v => update('motherName', v)} />
        </div>
      </motion.div>

      {/* Contact */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><Globe size={18} className={styles.sectionIcon} />Contact</h2>
        </div>
        <div className={styles.formGrid}>
          <Field label="Email" value={details.email} onChange={v => update('email', v)} type="email" />
          <Field label="Phone Country Code" value={details.phoneCountryCode} onChange={v => update('phoneCountryCode', v)} placeholder="+91" />
          <Field label="Phone" value={details.phone} onChange={v => update('phone', v)} type="tel" />
          <Field label="Alternate Phone" value={details.altPhone} onChange={v => update('altPhone', v)} type="tel" />
        </div>
      </motion.div>

      {/* Address */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><MapPin size={18} className={styles.sectionIcon} />Address</h2>
        </div>
        <div className={styles.formGrid}>
          <Field label="Street Address" value={details.streetAddress} onChange={v => update('streetAddress', v)} />
          <Field label="City" value={details.city} onChange={v => update('city', v)} />
          <Field label="State" value={details.state} onChange={v => update('state', v)} />
          <Field label="ZIP Code" value={details.zipCode} onChange={v => update('zipCode', v)} />
          <Field label="Country" value={details.country} onChange={v => update('country', v)} />
          <Field label="Current Location" value={details.currentLocation} onChange={v => update('currentLocation', v)} placeholder="City, State, Country" />
        </div>
      </motion.div>

      {/* Online Profiles */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><Globe size={18} className={styles.sectionIcon} />Online Profiles</h2>
        </div>
        <div className={styles.formGrid}>
          <Field label="LinkedIn" value={details.linkedin} onChange={v => update('linkedin', v)} fullWidth />
          <Field label="GitHub" value={details.github} onChange={v => update('github', v)} />
          <Field label="Portfolio" value={details.portfolio} onChange={v => update('portfolio', v)} />
        </div>
      </motion.div>

      {/* Education */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><GraduationCap size={18} className={styles.sectionIcon} />Education</h2>
        </div>
        <div className={styles.formGrid}>
          <Field label="University" value={details.university} onChange={v => update('university', v)} />
          <Field label="College" value={details.college} onChange={v => update('college', v)} />
          <Field label="Degree" value={details.degree} onChange={v => update('degree', v)} />
          <Field label="Full Degree Name" value={details.degreeFullName} onChange={v => update('degreeFullName', v)} />
          <Field label="Major" value={details.major} onChange={v => update('major', v)} />
          <Field label="GPA" value={details.gpa} onChange={v => update('gpa', v)} />
          <Field label="GPA Scale" value={details.gpaScale} onChange={v => update('gpaScale', v)} />
          <Field label="Graduation Month" value={details.gradMonth} onChange={v => update('gradMonth', v)} />
          <Field label="Graduation Year" value={details.gradYear} onChange={v => update('gradYear', v)} />
          <Field label="Education Start Year" value={details.educationStartYear} onChange={v => update('educationStartYear', v)} />
        </div>
      </motion.div>

      {/* Work Preferences */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><Briefcase size={18} className={styles.sectionIcon} />Work Preferences</h2>
        </div>
        <div className={styles.formGrid}>
          <Field label="Expected Salary" value={details.expectedSalary} onChange={v => update('expectedSalary', v)} />
          <Field label="Expected CTC" value={details.expectedCTC} onChange={v => update('expectedCTC', v)} />
          <Field label="Notice Period" value={details.noticePeriod} onChange={v => update('noticePeriod', v)} />
          <Field label="Available Start Date" value={details.availableStartDate} onChange={v => update('availableStartDate', v)} />
          <Field label="Total Experience (years)" value={details.totalExperience} onChange={v => update('totalExperience', v)} />
          <Field label="Relevant Experience (years)" value={details.relevantExperience} onChange={v => update('relevantExperience', v)} />
          <Field label="Current CTC" value={details.currentCTC} onChange={v => update('currentCTC', v)} />
          <div className={`${styles.fieldGroup} ${styles.formGridFull}`}>
            <label className={styles.fieldLabel}>Preferred Locations</label>
            <div className={styles.tagInput}>
              {details.preferredLocations.map((loc, i) => (
                <span key={i} className={styles.tag}>
                  {loc}
                  <button className={styles.tagRemove} onClick={() => removePreferredLocation(i)}><X size={12} /></button>
                </span>
              ))}
              <input
                className={styles.tagField}
                placeholder="Add location..."
                value={newLocInput}
                onChange={e => setNewLocInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPreferredLocation(); } }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Legal & Compliance */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><Shield size={18} className={styles.sectionIcon} />Legal &amp; Compliance</h2>
        </div>
        <div className={styles.formGrid}>
          <Field label="Nationality" value={details.nationality} onChange={v => update('nationality', v)} />
          <Field label="Citizenship" value={details.citizenship} onChange={v => update('citizenship', v)} />
          <div className={styles.formGridFull} style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <Toggle label="Legally Authorized to Work" value={details.legallyAuthorized} onChange={v => update('legallyAuthorized', v)} />
            <Toggle label="Require Visa Sponsorship" value={details.requireVisa} onChange={v => update('requireVisa', v)} />
            <Toggle label="Willing to Relocate" value={details.willingToRelocate} onChange={v => update('willingToRelocate', v)} />
            <Toggle label="Willing to Travel" value={details.willingToTravel} onChange={v => update('willingToTravel', v)} />
            <Toggle label="Background Check Consent" value={details.backgroundCheck} onChange={v => update('backgroundCheck', v)} />
            <Toggle label="Driver's License" value={details.driversLicense} onChange={v => update('driversLicense', v)} />
          </div>
          <Field label="Veteran Status" value={details.veteranStatus} onChange={v => update('veteranStatus', v)} />
          <Field label="Disability Status" value={details.disabilityStatus} onChange={v => update('disabilityStatus', v)} />
          <Field label="Race / Ethnicity" value={details.race} onChange={v => update('race', v)} />
        </div>
      </motion.div>

      {/* Languages */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><Languages size={18} className={styles.sectionIcon} />Languages</h2>
        </div>
        <div className={styles.formGrid}>
          {Object.entries(details.languages).map(([lang, level]) => (
            <div key={lang} className={styles.customFieldRow}>
              <div className={styles.fieldGroup} style={{ flex: 1 }}>
                <label className={styles.fieldLabel}>{lang}</label>
                <select className={styles.fieldSelect} value={level} onChange={e => update('languages', { ...details.languages, [lang]: e.target.value })}>
                  <option value="Native or bilingual">Native or bilingual</option>
                  <option value="Professional">Professional</option>
                  <option value="Conversational">Conversational</option>
                  <option value="Elementary">Elementary</option>
                </select>
              </div>
              <button className={styles.removeFieldBtn} onClick={() => removeLanguage(lang)}><X size={14} /></button>
            </div>
          ))}
        </div>
        <div className={styles.customFieldRow} style={{ marginTop: 12, maxWidth: 300 }}>
          <div className={styles.fieldGroup} style={{ flex: 1 }}>
            <input
              className={styles.fieldInput}
              placeholder="Add language..."
              value={newLangName}
              onChange={e => setNewLangName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLanguage(); } }}
            />
          </div>
          <button className={styles.removeFieldBtn} style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }} onClick={addLanguage}><Plus size={14} /></button>
        </div>
      </motion.div>

      {/* Technology Experience */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><Code size={18} className={styles.sectionIcon} />Technology Experience</h2>
        </div>
        <div className={styles.techGrid}>
          {Object.entries(details.techExperience).map(([tech, years]) => (
            <div key={tech} className={styles.techRow}>
              <span className={styles.techName}>{tech}</span>
              <input
                className={styles.techYears}
                type="number"
                min={0}
                max={30}
                value={years}
                onChange={e => update('techExperience', { ...details.techExperience, [tech]: parseInt(e.target.value) || 0 })}
              />
              <span className={styles.techUnit}>yr</span>
              <button className={styles.tagRemove} onClick={() => removeTech(tech)}><X size={12} /></button>
            </div>
          ))}
        </div>
        <div className={styles.customFieldRow} style={{ marginTop: 12, maxWidth: 300 }}>
          <div className={styles.fieldGroup} style={{ flex: 1 }}>
            <input
              className={styles.fieldInput}
              placeholder="Add technology..."
              value={newTechName}
              onChange={e => setNewTechName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTech(); } }}
            />
          </div>
          <button className={styles.removeFieldBtn} style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }} onClick={addTech}><Plus size={14} /></button>
        </div>
      </motion.div>

      {/* Base Resume LaTeX */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><FileText size={18} className={styles.sectionIcon} />Base Resume (LaTeX)</h2>
          <button
            className={styles.addFieldBtn}
            style={{ marginTop: 0 }}
            onClick={() => setShowResume(!showResume)}
          >
            {showResume ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showResume ? 'Collapse' : 'Expand Editor'}
          </button>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: '0 0 12px 0' }}>
          Your base LaTeX resume template. AI uses this as the starting point when tailoring resumes for each job.
        </p>
        {showResume && (
          <textarea
            className={styles.fieldTextarea}
            style={{ minHeight: 400, fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.5 }}
            value={details.baseResume}
            onChange={e => update('baseResume', e.target.value)}
          />
        )}
        {!showResume && (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
            {details.baseResume.substring(0, 200).replace(/\n/g, ' ')}...
          </div>
        )}
      </motion.div>

      {/* Projects */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><FolderOpen size={18} className={styles.sectionIcon} />Projects</h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{details.projects.length} projects</span>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: '0 0 16px 0' }}>
          AI selects the most relevant projects for each job application from this pool.
        </p>

        {details.projects.map((proj, i) => (
          <div key={i} className={styles.projectCard}>
            <div className={styles.projectHeader} onClick={() => setExpandedProject(expandedProject === i ? null : i)}>
              <div className={styles.projectName}>
                {expandedProject === i ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>{proj.name || 'Untitled Project'}</span>
                <span className={styles.projectTechBadge}>{proj.tech.length} tech</span>
                <span className={styles.projectTechBadge}>{proj.bullets.length} bullet{proj.bullets.length !== 1 ? 's' : ''}</span>
              </div>
              <button className={styles.removeFieldBtn} onClick={(e) => { e.stopPropagation(); removeProject(i); }}><X size={14} /></button>
            </div>

            {expandedProject === i && (
              <div className={styles.projectBody}>
                <div className={styles.formGrid}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Project Name</label>
                    <input className={styles.fieldInput} value={proj.name} onChange={e => updateProject(i, 'name', e.target.value)} placeholder="e.g. AI Career Platform" />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Technologies (comma separated)</label>
                    <input className={styles.fieldInput} value={proj.tech.join(', ')} onChange={e => updateProject(i, 'tech', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="React, Python, AWS" />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Categories (comma separated)</label>
                    <input className={styles.fieldInput} value={proj.category.join(', ')} onChange={e => updateProject(i, 'category', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="AI/ML, Full Stack" />
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <label className={styles.fieldLabel}>Bullet Points</label>
                  {proj.bullets.map((bullet, bi) => (
                    <div key={bi} className={styles.customFieldRow} style={{ marginTop: 6 }}>
                      <input className={styles.fieldInput} style={{ flex: 1 }} value={bullet} onChange={e => updateBullet(i, bi, e.target.value)} placeholder="Describe what you built..." />
                      <button className={styles.removeFieldBtn} onClick={() => removeBullet(i, bi)}><X size={14} /></button>
                    </div>
                  ))}
                  <button className={styles.addFieldBtn} onClick={() => addBullet(i)} style={{ marginTop: 8 }}>
                    <Plus size={12} />Add Bullet
                  </button>
                </div>

                <div style={{ marginTop: 14 }}>
                  <label className={styles.fieldLabel}>LaTeX Code (optional, auto-generated if empty)</label>
                  <textarea
                    className={styles.fieldTextarea}
                    style={{ minHeight: 120, fontFamily: 'monospace', fontSize: '0.78rem' }}
                    value={proj.latex}
                    onChange={e => updateProject(i, 'latex', e.target.value)}
                    placeholder="\\resumeProjectHeading..."
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        <button className={styles.addFieldBtn} onClick={addProject}>
          <Plus size={14} />Add Project
        </button>
      </motion.div>

      {/* Custom Fields */}
      <motion.div className={styles.section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}><Plus size={18} className={styles.sectionIcon} />Custom Fields</h2>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: '0 0 16px 0' }}>
          Add any additional fields that job applications might ask for.
        </p>
        {details.customFields.map((cf, i) => (
          <div key={i} className={styles.customFieldRow} style={{ marginBottom: 10 }}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Field Name</label>
              <input
                className={styles.fieldInput}
                value={cf.key}
                onChange={e => updateCustomField(i, 'key', e.target.value)}
                placeholder="e.g. LinkedIn Headline"
              />
            </div>
            <div className={styles.fieldGroup} style={{ flex: 2 }}>
              <label className={styles.fieldLabel}>Value</label>
              <input
                className={styles.fieldInput}
                value={cf.value}
                onChange={e => updateCustomField(i, 'value', e.target.value)}
                placeholder="Your answer..."
              />
            </div>
            <button className={styles.removeFieldBtn} onClick={() => removeCustomField(i)}><X size={14} /></button>
          </div>
        ))}
        <button className={styles.addFieldBtn} onClick={addCustomField}>
          <Plus size={14} />Add Custom Field
        </button>
      </motion.div>

      {/* Bottom save */}
      <motion.div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, paddingBottom: 40 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
        {saved && <span className={styles.savedMsg} style={{ marginRight: 12 }}><CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />All changes saved</span>}
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          <Save size={16} />{saving ? 'Saving...' : 'Save Changes'}
        </button>
      </motion.div>
    </div>
  );
}
