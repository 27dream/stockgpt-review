'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // 避免 hydration mismatch
  useEffect(() => setMounted(true), []);

  const cur = mounted ? (resolvedTheme ?? theme) : 'light';
  const isDark = cur === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="切换主题"
      title={isDark ? '切换到浅色' : '切换到深色'}
      className="press w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-md flex items-center justify-center text-lg"
    >
      {mounted ? (isDark ? '☀️' : '🌙') : '🌓'}
    </button>
  );
}
