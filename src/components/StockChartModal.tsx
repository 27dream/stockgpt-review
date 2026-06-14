'use client';

import { useState } from 'react';
import Modal from './Modal';
import KlineChart from './KlineChart';
import MinuteChart from './MinuteChart';

export default function StockChartModal({
  open, onClose, secid, name,
}: {
  open: boolean;
  onClose: () => void;
  secid: string;
  name: string;
}) {
  const [tab, setTab] = useState<'minute' | 'kline'>('minute');
  return (
    <Modal open={open} onClose={onClose} title={`${name} · 行情`} width="max-w-4xl">
      <div className="flex gap-1 mb-3 text-xs">
        {([
          ['minute', '分时'],
          ['kline', 'K 线'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded transition ${
              tab === k
                ? 'bg-orange-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'minute' ? (
        <MinuteChart secid={secid} name={name} />
      ) : (
        <KlineChart secid={secid} name={name} />
      )}
    </Modal>
  );
}
