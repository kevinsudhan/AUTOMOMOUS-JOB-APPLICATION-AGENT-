'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Sparkles,
  FileText,
  Search,
  Zap,
  Mail,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

/* ───────────── Floating Background Paths ───────────── */

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className={styles.pathContainer}>
      <svg className={styles.pathSvg} viewBox="0 0 696 316" fill="none">
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}
      </svg>
    </div>
  );
}

/* ───────────── Landing Page ───────────── */

export default function LandingPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError('');
    setAuthSuccess('');

    const supabase = createClient();

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setIsLoading(false);
      if (error) {
        setAuthError(error.message);
      } else {
        setAuthSuccess('Check your email for a confirmation link!');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setIsLoading(false);
      if (error) {
        setAuthError(error.message);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    }
  };

  return (
    <div className={styles.page}>
      {/* Background */}
      <div className={styles.bgPaths}>
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      {/* Top Bar */}
      <nav className={styles.topBar}>
        <div className={styles.navLogo}>
          <Sparkles size={18} />
          <span>JobAI</span>
        </div>
        <ThemeToggle />
      </nav>

      {/* Split Layout Container */}
      <main className={styles.splitContainer}>
        {/* Left: Hero Content — shrinks via CSS transition */}
        <div className={`${styles.heroSide} ${showLogin ? styles.heroHalf : ''}`}>
          <div className={styles.heroInner}>
            {/* Badge */}
            <motion.a
              href="#"
              className={styles.badge}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              <span className={styles.badgeTag}>NEW</span>
              <span>AI resume tailoring is live</span>
              <ArrowRight size={12} />
            </motion.a>

            {/* Title */}
            <motion.h1
              className={styles.title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7, ease: 'easeOut' }}
            >
              Your AI-Powered
              <br />
              Career Toolkit
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              className={styles.subtitle}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.7 }}
            >
              Discover matching jobs, tailor your resume with AI,
              and apply smarter — all from one place.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              className={styles.ctas}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.7 }}
            >
              {!showLogin && (
                <button
                  className={styles.ctaPrimary}
                  onClick={() => setShowLogin(true)}
                >
                  Get Started
                  <ArrowRight size={16} />
                </button>
              )}
              <button
                className={styles.ctaOutline}
                onClick={() => router.push('/resume-studio')}
              >
                <FileText size={16} />
                Resume Studio
              </button>
            </motion.div>

            {/* Feature Pills */}
            <motion.div
              className={styles.features}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.7 }}
            >
              <div className={styles.featurePill}>
                <Search size={14} />
                <span>Smart Job Discovery</span>
              </div>
              <div className={styles.featurePill}>
                <FileText size={14} />
                <span>AI Resume Builder</span>
              </div>
              <div className={styles.featurePill}>
                <Zap size={14} />
                <span>One-Click Apply</span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Right: Login Panel — slides in via transform (GPU composited) */}
        <div className={`${styles.loginSide} ${showLogin ? styles.loginVisible : ''}`}>
          <motion.div
            className={styles.loginInner}
            key={showLogin ? 'visible' : 'hidden'}
            initial={false}
            animate={showLogin ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{
              duration: 0.5,
              delay: showLogin ? 0.35 : 0,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
                {/* Close / Back */}
                <button
                  className={styles.backBtn}
                  onClick={() => setShowLogin(false)}
                >
                  <ArrowRight size={16} style={{ transform: 'rotate(180deg)' }} />
                  Back
                </button>

                <div className={styles.loginCard}>
                  <div className={styles.loginHeader}>
                    <h2>{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
                    <p>{isSignUp ? 'Sign up to get started' : 'Sign in to continue'}</p>
                  </div>

                  {authError && (
                    <div className={styles.authError}>{authError}</div>
                  )}
                  {authSuccess && (
                    <div className={styles.authSuccess}>{authSuccess}</div>
                  )}

                  <form onSubmit={handleLogin} className={styles.loginForm}>
                    <div className={styles.inputGroup}>
                      <Mail size={18} className={styles.inputIcon} />
                      <input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={styles.input}
                        required
                      />
                    </div>

                    <div className={styles.inputGroup}>
                      <Lock size={18} className={styles.inputIcon} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={styles.input}
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        className={styles.eyeBtn}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    {!isSignUp && (
                      <div className={styles.loginOptions}>
                        <label className={styles.remember}>
                          <input type="checkbox" />
                          <span>Remember me</span>
                        </label>
                        <a href="#" className={styles.forgot}>Forgot password?</a>
                      </div>
                    )}

                    <button
                      type="submit"
                      className={styles.loginBtn}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <motion.div
                          className={styles.spinnerSmall}
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        />
                      ) : (
                        <>
                          {isSignUp ? 'Create Account' : 'Sign In'}
                          {isSignUp ? <UserPlus size={18} /> : <ArrowRight size={18} />}
                        </>
                      )}
                    </button>
                  </form>

                  <div className={styles.divider}><span>or</span></div>

                  <p className={styles.signupText}>
                    {isSignUp ? (
                      <>Already have an account?{' '}<a href="#" onClick={(e) => { e.preventDefault(); setIsSignUp(false); setAuthError(''); setAuthSuccess(''); }}>Sign in</a></>
                    ) : (
                      <>Don&apos;t have an account?{' '}<a href="#" onClick={(e) => { e.preventDefault(); setIsSignUp(true); setAuthError(''); setAuthSuccess(''); }}>Create one</a></>
                    )}
                  </p>
                </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
