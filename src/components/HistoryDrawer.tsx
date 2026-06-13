'use client';

import { useEffect, useState } from 'react';
import { loadHistory, removeHistory, clearHistory, type HistoryItem } from '@/lib/history';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (item: HistoryItem) => void;
}

const MODE_LABEL: Record<HistoryItem['mode'], string> = {
  review: '📊 盘后',
  morning: '🌅 早盘',
  stock: '🔍 个股',
};

export default function HistoryDrawer({ open, onClose, onPick }: Props) {
  const [list, setList] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (open) setList(loadHistory());
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:w-96 h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 overflow-y-auto shadow-2xl anim-in"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="font-semibold flex items-center gap-2">📜 历史报告 <span className="text-xs text-slate-400">最近 {list.length}</span></h3>
          <div className="flex items-center gap-2">
            {list.length > 0 && (
              <button
                onClick={() => { clearHistory(); setList([]); }}
                className="text-xs text-red-500 hover:underline"
              >清空</button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            暂无历史记录<br />
            <span className="text-xs">每次生成报告会自动保存最近 10 份</span>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {list.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 hover:border-orange-400 dark:hover:border-orange-500 transition cursor-pointer group"
                onClick={() => { onPick(item); onClose(); }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300">
                    {MODE_LABEL[item.mode]}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setList(removeHistory(item.id));
                    }}
                    className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500 transition"
                  >删除</button>
                </div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{item.title}</div>
                <div className="text-xs text-slate-400 mt-1">{item.date}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                  {item.content.slice(0, 80).replace(/\n/g, ' ')}...
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
