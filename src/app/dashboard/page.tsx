'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Wand2, FileText, ArrowRight } from 'lucide-react';
import styles from './page.module.css';

function getCards(appCount: number) {
  return [
    {
      title: 'Job Applications',
      description: 'View and track all your job applications in one place.',
      icon: Briefcase,
      href: '/dashboard/applications',
      count: appCount,
      countLabel: 'Applied',
      color: '#3b82f6',
    },
    {
      title: 'AI Apply Center',
      description: 'Paste a job link and let AI tailor your resume and apply.',
      icon: Wand2,
      href: '/dashboard/apply',
      count: 0,
      countLabel: 'Queue',
      color: '#f59e0b',
    },
    {
      title: 'Resume Studio',
      description: 'Build and compile professional LaTeX resumes instantly.',
      icon: FileText,
      href: '/resume-studio',
      count: 0,
      countLabel: 'Templates',
      color: '#10b981',
    },
  ];
}

export default function DashboardHome() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [appCount, setAppCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/personal-details');
        if (res.ok) {
          const { profileComplete } = await res.json();
          if (!profileComplete) {
            router.replace('/dashboard/personal-details');
            return;
          }
        }
      } catch { /* continue to dashboard */ }

      // Fetch application count
      try {
        const res = await fetch('/api/applications');
        if (res.ok) {
          const { applications } = await res.json();
          setAppCount(applications?.length || 0);
        }
      } catch { /* ignore */ }

      setChecked(true);
    })();
  }, [router]);

  const CARDS = getCards(appCount);

  if (!checked) {
    return (
      <div className={styles.page}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className={styles.heading}>Dashboard</h1>
        <p className={styles.subheading}>
          Welcome back. Here&apos;s your career toolkit.
        </p>
      </motion.div>

      <div className={styles.grid}>
        {CARDS.map((card: ReturnType<typeof getCards>[number], i: number) => (
          <motion.button
            key={card.href}
            className={styles.card}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.5, ease: 'easeOut' }}
            onClick={() => router.push(card.href)}
          >
            <div className={styles.cardTop}>
              <div
                className={styles.cardIcon}
                style={{ background: `${card.color}15`, color: card.color }}
              >
                <card.icon size={22} />
              </div>
              <div className={styles.cardBadge}>
                <span className={styles.badgeCount}>{card.count}</span>
                <span className={styles.badgeLabel}>{card.countLabel}</span>
              </div>
            </div>

            <div className={styles.cardBody}>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </div>

            <div className={styles.cardFooter}>
              <span>Open</span>
              <ArrowRight size={14} />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
