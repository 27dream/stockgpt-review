'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';

interface ZTStock {
  code: string; name: string; market: number;
  price: number; changePct: number; amount: number;
  boardCount: number; firstSealTime: string; lastSealTime: string;
  sealFund: number; breakCount: number;
  industry: string; ndays: number; turnover: number;
}

export default function ZTPoolModal({
  open, onClose, onPickStock,
}: {
  open: boolean;
  onClose: () => void;
  onPickStock?: (s: { code: string; name: string; market: number }) => void;
}) {
  const [stocks, setStocks] = useState<ZTStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'all' | 'multi' | 'first'>('all');

  useEffect(() => {
    if (!open) return;
    setLoading(true); setErr('');
    fetch('/api/zt-pool')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStocks(d.stocks || []);
        else setErr(d.error || '加载失败');
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = stocks.filter((s) => {
    if (tab === 'multi') return s.boardCount >= 2;
    if (tab === 'first') return s.boardCount === 1;
    return true;
  });

  const stats = {
    total: stocks.length,
    multi: stocks.filter((s) => s.boardCount >= 2).length,
    first: stocks.filter((s) => s.boardCount === 1).length,
    maxBoard: stocks[0]?.boardCount || 0,
    broken: stocks.filter((s) => s.breakCount > 0).length,
  };

  return (
    <Modal open={open} onClose={onClose} title="🔥 涨停池 · 实时" width="max-w-5xl">
      {loading && <div className="text-center text-sm text-slate-400 py-8">加载中...</div>}
      {err && <div className="text-center text-sm text-red-500 py-8">{err}</div>}
      {!loading && !err && (
        <>
          {/* 概览 */}
          <div className="grid grid-cols-5 gap-2 mb-3 text-xs">
            <Stat label="涨停总数" value={stats.total} color="text-red-500" />
            <Stat label="连板数" value={stats.multi} color="text-orange-500" />
            <Stat label="首板" value={stats.first} color="text-rose-400" />
            <Stat label="最高板" value={`${stats.maxBoard}板`} color="text-red-600" />
            <Stat label="炸板" value={stats.broken} color="text-green-500" />
          </div>
          {/* tab */}
          <div className="flex gap-1 mb-2 text-xs">
            {(['all', 'multi', 'first'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-2.5 py-1 rounded transition ${
                  tab === k
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {k === 'all' ? `全部 ${stats.total}` : k === 'multi' ? `连板 ${stats.multi}` : `首板 ${stats.first}`}
              </button>
            ))}
          </div>
          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500 bg-slate-50 dark:bg-slate-700/40">
                <tr>
                  <th className="text-left py-2 px-2 font-medium">代码</th>
                  <th className="text-left py-2 px-2 font-medium">名称</th>
                  <th className="text-center py-2 px-2 font-medium">连板</th>
                  <th className="text-right py-2 px-2 font-medium">最新价</th>
                  <th className="text-right py-2 px-2 font-medium">涨幅</th>
                  <th className="text-center py-2 px-2 font-medium">首封</th>
                  <th className="text-right py-2 px-2 font-medium">封板资金</th>
                  <th className="text-center py-2 px-2 font-medium">炸板</th>
                  <th className="text-right py-2 px-2 font-medium">成交额</th>
                  <th className="text-left py-2 px-2 font-medium">行业</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((s) => (
                  <tr
                    key={s.code}
                    className="border-t border-slate-100 dark:border-slate-700 hover:bg-orange-50/40 dark:hover:bg-slate-700/40 cursor-pointer transition"
                    onClick={() => onPickStock?.({ code: s.code, name: s.name, market: s.market })}
                    title="点击查看 K 线 / 分时"
                  >
                    <td className="py-1.5 px-2 font-mono text-slate-500">{s.code}</td>
                    <td className="py-1.5 px-2 font-medium">{s.name}</td>
                    <td className="py-1.5 px-2 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-white text-[10px] ${
                        s.boardCount >= 5 ? 'bg-red-700' :
                        s.boardCount >= 3 ? 'bg-red-500' :
                        s.boardCount >= 2 ? 'bg-orange-500' : 'bg-rose-300'
                      }`}>
                        {s.boardCount}板
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right text-red-500 font-medium">{s.price.toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-right text-red-500 font-semibold">
                      +{s.changePct.toFixed(2)}%
                    </td>
                    <td className="py-1.5 px-2 text-center text-slate-500">{s.firstSealTime}</td>
                    <td className="py-1.5 px-2 text-right text-orange-500">
                      {(s.sealFund / 1e8).toFixed(2)}亿
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {s.breakCount > 0
                        ? <span className="text-green-500">{s.breakCount}次</span>
                        : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-500">
                      {(s.amount / 1e8).toFixed(2)}亿
                    </td>
                    <td className="py-1.5 px-2 text-slate-500 text-[11px]">{s.industry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <div className="text-center text-xs text-slate-400 mt-2">
                共 {filtered.length} 只，仅显示前 100
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/40 rounded px-2 py-1.5">
      <div className="text-slate-400 text-[10px]">{label}</div>
      <div className={`font-semibold ${color}`}>{value}</div>
    </div>
  );
}
