'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import {
  Sparkles,
  LayoutDashboard,
  Briefcase,
  Wand2,
  FileText,
  User,
  LogOut,
  Table2,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { createClient } from '@/lib/supabase/client';
import styles from './layout.module.css';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Applications', href: '/dashboard/applications', icon: Briefcase },
  { label: 'AI Apply', href: '/dashboard/apply', icon: Wand2 },
  { label: 'Apply via Excel', href: '/dashboard/apply-via-excel', icon: Table2 },
  { label: 'Resume Studio', href: '/resume-studio', icon: FileText },
  { label: 'Personal Details', href: '/dashboard/personal-details', icon: User },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }, [router]);

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.brand} onClick={() => router.push('/dashboard')}>
            <Sparkles size={20} />
            <span>JobAI</span>
          </div>

          <nav className={styles.nav}>
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <button
                  key={item.href}
                  className={`${styles.navItem} ${isActive ? styles.navActive : ''}`}
                  onClick={() => router.push(item.href)}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className={styles.sidebarBottom}>
          <ThemeToggle />
          <button className={styles.navItem} onClick={handleSignOut}>
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.content}>{children}</main>
    </div>
  );
}
