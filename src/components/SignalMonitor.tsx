'use client';

import { useEffect, useRef, useState } from 'react';
import { detectSignals, type Signal } from '@/lib/signals';
import type { Bar } from '@/lib/factors';
import { formatSignalMessage, sendNotification } from '@/lib/notifier';

interface QuoteRow {
  code: string;
  name: string;
  price: number;
  change_pct: number;
  volume: number;
  amount: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  prev_close: number;
}

interface MonitorProps {
  watchCodes: string[];
  notifyEnabled: boolean;
  onClose?: () => void;
}

const isMarketOpen = (): boolean => {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return (m >= 570 && m <= 690) || (m >= 780 && m <= 900);
};

export default function SignalMonitor({ watchCodes, notifyEnabled, onClose }: MonitorProps) {
  const [running, setRunning] = useState(false);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [hits, setHits] = useState<Signal[]>([]);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  const [loadingBars, setLoadingBars] = useState(false);
  const barsRef = useRef<Record<string, Bar[]>>({});
  const sentSignalsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 启动时先拉历史 K 线
  useEffect(() => {
    if (!running || !watchCodes.length) return;
    let cancelled = false;
    (async () => {
      setLoadingBars(true);
      try {
        const url = `/api/kline-batch?codes=${watchCodes.join(',')}&days=60`;
        const r = await fetch(url);
        const j = await r.json();
        if (!cancelled && j.ok) {
          barsRef.current = j.data || {};
          setError('');
        } else if (!cancelled) {
          setError(j.error || 'K 线加载失败');
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoadingBars(false);
      }
    })();
    return () => { cancelled = true; };
  }, [running, watchCodes]);

  // 轮询行情
  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const poll = async () => {
      try {
        if (!watchCodes.length) return;
        const url = `/api/quote-batch?codes=${watchCodes.join(',')}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || '行情接口失败');
        const rows: QuoteRow[] = data.data || [];
        setQuotes(rows);
        setTick((t) => t + 1);
        setError('');

        const newHits: Signal[] = [];
        for (const r of rows) {
          const bars = barsRef.current[r.code];
          if (!bars || bars.length < 20) continue;
          const sigs = detectSignals({
            code: r.code,
            name: r.name,
            bars,
            intraday: {
              price: r.price,
              changePct: (r.change_pct || 0) / 100,
              volume: r.volume,
            },
            prevSignals: sentSignalsRef.current,
          });
          for (const s of sigs) {
            sentSignalsRef.current.add(s.id);
            newHits.push({ ...s, price: r.price, changePct: (r.change_pct || 0) / 100 });
          }
        }
        if (newHits.length) {
          setHits((prev) => [...newHits, ...prev].slice(0, 200));
          if (notifyEnabled) {
            const msg = formatSignalMessage(
              newHits.map(h => ({
                code: h.code,
                name: h.name || h.code,
                signalId: h.type,
                signalLabel: h.label,
                emoji: h.emoji,
                price: h.price || 0,
                changePct: h.changePct || 0,
                reason: h.msg,
              }))
            );
            msg.channels = ['telegram', 'serverchan', 'feishu', 'qq', 'email'];
            sendNotification(msg).catch(() => {});
          }
        }
      } catch (e: any) {
        setError(e.message || '轮询失败');
      }
    };
    poll();
    timerRef.current = setInterval(poll, 3000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running, watchCodes, notifyEnabled]);

  const marketOpen = isMarketOpen();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-semibold">📡 信号监控</h3>
          <span className={`px-2 py-0.5 rounded text-xs ${marketOpen ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {marketOpen ? '盘中' : '休市'}
          </span>
          {running && <span className="text-xs text-gray-500">轮询 #{tick} · 监控 {watchCodes.length} 只</span>}
          {loadingBars && <span className="text-xs text-blue-600">加载K线中...</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setRunning((r) => !r)}
            disabled={!watchCodes.length}
            className={`px-3 py-1.5 rounded text-sm ${
              running ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {running ? '⏹ 停止' : '▶ 开始监控'}
          </button>
          {onClose && <button onClick={onClose} className="px-3 py-1.5 rounded text-sm border hover:bg-gray-50">关闭</button>}
        </div>
      </div>

      {error && <div className="px-3 py-2 bg-red-50 text-red-700 text-xs rounded">{error}</div>}
      {!watchCodes.length && (
        <div className="px-3 py-2 bg-yellow-50 text-yellow-800 text-xs rounded">
          ⚠️ 自选为空，请先在自选股添加要监控的代码
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">实时行情 ({quotes.length})</div>
          <div className="border rounded max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-1.5 text-left">代码</th>
                  <th className="p-1.5 text-left">名称</th>
                  <th className="p-1.5 text-right">现价</th>
                  <th className="p-1.5 text-right">涨幅</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.code} className="border-t">
                    <td className="p-1.5 font-mono">{q.code}</td>
                    <td className="p-1.5">{q.name}</td>
                    <td className="p-1.5 text-right">{q.price?.toFixed(2)}</td>
                    <td className={`p-1.5 text-right font-medium ${q.change_pct > 0 ? 'text-red-600' : q.change_pct < 0 ? 'text-green-600' : ''}`}>
                      {q.change_pct > 0 ? '+' : ''}{q.change_pct?.toFixed(2)}%
                    </td>
                  </tr>
                ))}
                {!quotes.length && (
                  <tr><td colSpan={4} className="p-3 text-center text-gray-400">{running ? '加载中...' : '点击开始监控'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1 flex items-center justify-between">
            <span>信号流 ({hits.length})</span>
            {hits.length > 0 && (
              <button onClick={() => { setHits([]); sentSignalsRef.current.clear(); }} className="text-blue-600 hover:underline">清空</button>
            )}
          </div>
          <div className="border rounded max-h-72 overflow-auto">
            {hits.map((h, i) => (
              <div key={`${h.id}_${i}`} className="p-2 border-b text-xs hover:bg-gray-50">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{h.code}</span>
                  <span className="font-medium">{h.name}</span>
                  <span className="text-blue-600">{h.emoji} {h.label}</span>
                  {typeof h.price === 'number' && (
                    <span className={(h.changePct || 0) >= 0 ? 'text-red-600' : 'text-green-600'}>
                      {h.price.toFixed(2)} ({((h.changePct || 0) * 100).toFixed(2)}%)
                    </span>
                  )}
                  <span className="ml-auto text-gray-400">{new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                </div>
                <div className="text-gray-600 mt-0.5">{h.msg}</div>
              </div>
            ))}
            {!hits.length && <div className="p-3 text-center text-gray-400">暂无信号触发</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
