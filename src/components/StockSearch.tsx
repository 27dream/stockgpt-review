'use client';

import { useState, useEffect, useRef } from 'react';

export interface StockSuggestion {
  code: string;
  name: string;
  pinyin: string;
  market: string;
  secid: string;
}

interface Props {
  onSelect: (s: StockSuggestion) => void;
}

export default function StockSearch({ onSelect }: Props) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<StockSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setList([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setList(j.results || []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => list.length > 0 && setOpen(true)}
        placeholder="🔍 输入股票代码、名称或拼音（如：茅台 / 600519 / GZMT）"
        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-20">
          {loading && <div className="px-4 py-3 text-sm text-slate-500">搜索中...</div>}
          {!loading && list.length === 0 && q && (
            <div className="px-4 py-3 text-sm text-slate-500">未找到结果</div>
          )}
          {list.map((s) => (
            <button
              key={s.secid}
              onClick={() => {
                onSelect(s);
                setQ(`${s.name}(${s.code})`);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition border-b border-slate-100 dark:border-slate-700 last:border-0"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{s.name}</span>
                  <span className="ml-2 text-sm text-slate-500">{s.code}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {s.market}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
