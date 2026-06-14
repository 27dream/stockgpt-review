'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';

interface SectorStock {
  code: string;
  name: string;
  price: number;
  changePct: number;
  mainNet: number;
  amount: number;
  market: number;
}

export default function SectorDetailModal({
  open,
  onClose,
  bk,
  sectorName,
  onPickStock,
}: {
  open: boolean;
  onClose: () => void;
  bk: string;
  sectorName: string;
  onPickStock?: (s: { code: string; name: string; market: number }) => void;
}) {
  const [stocks, setStocks] = useState<SectorStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open || !bk) return;
    setLoading(true);
    setErr('');
    fetch(`/api/sector?bk=${bk}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStocks(d.stocks || []);
        else setErr(d.error || '加载失败');
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [open, bk]);

  return (
    <Modal open={open} onClose={onClose} title={`${sectorName} · 成分股涨跌排行`} width="max-w-3xl">
      {loading && <div className="text-center text-sm text-slate-400 py-8">加载中...</div>}
      {err && <div className="text-center text-sm text-red-500 py-8">{err}</div>}
      {!loading && !err && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500 bg-slate-50 dark:bg-slate-700/40">
              <tr>
                <th className="text-left py-2 px-2 font-medium">代码</th>
                <th className="text-left py-2 px-2 font-medium">名称</th>
                <th className="text-right py-2 px-2 font-medium">最新价</th>
                <th className="text-right py-2 px-2 font-medium">涨跌幅</th>
                <th className="text-right py-2 px-2 font-medium">主力净额</th>
                <th className="text-right py-2 px-2 font-medium">成交额</th>
              </tr>
            </thead>
            <tbody>
              {stocks.slice(0, 50).map((s) => (
                <tr
                  key={s.code}
                  className="border-t border-slate-100 dark:border-slate-700 hover:bg-orange-50/40 dark:hover:bg-slate-700/40 cursor-pointer transition"
                  onClick={() => onPickStock?.({ code: s.code, name: s.name, market: s.market })}
                  title="点击查看 K 线"
                >
                  <td className="py-1.5 px-2 font-mono text-slate-500">{s.code}</td>
                  <td className="py-1.5 px-2 font-medium">{s.name}</td>
                  <td className="py-1.5 px-2 text-right">{s.price.toFixed(2)}</td>
                  <td
                    className={`py-1.5 px-2 text-right font-semibold ${
                      s.changePct >= 0 ? 'text-red-500' : 'text-green-500'
                    }`}
                  >
                    {s.changePct >= 0 ? '+' : ''}
                    {s.changePct.toFixed(2)}%
                  </td>
                  <td
                    className={`py-1.5 px-2 text-right ${
                      s.mainNet >= 0 ? 'text-red-500' : 'text-green-500'
                    }`}
                  >
                    {s.mainNet >= 0 ? '+' : ''}
                    {(s.mainNet / 1e4).toFixed(0)}万
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-500">
                    {(s.amount / 1e8).toFixed(2)}亿
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {stocks.length > 50 && (
            <div className="text-center text-xs text-slate-400 mt-2">
              共 {stocks.length} 只，仅显示前 50
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
