'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import Modal from './Modal';
import { backtest, type BacktestResult, type StockData } from '@/lib/backtest';
import type { StrategyDSL } from '@/lib/dsl';
import type { Bar } from '@/lib/factors';

const DEFAULT_CODES =
  'sh600519,sh601318,sh600036,sh600276,sh601166,sh600030,sh601012,sh600887,sh601398,sh600000,sz000001,sz000002,sz000333,sz000651,sz000725,sz000858,sz002415,sz002594,sz300059,sz300750';

export default function BacktestPanel({
  open,
  onClose,
  dsl,
}: {
  open: boolean;
  onClose: () => void;
  dsl: StrategyDSL | null;
}) {
  const [codes, setCodes] = useState(DEFAULT_CODES);
  const [days, setDays] = useState(120);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);

  // 渲染净值曲线
  useEffect(() => {
    if (!result || !chartRef.current) return;
    if (!chartInst.current) {
      chartInst.current = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    }
    const dates = result.equity.map((p) => p.date);
    const values = result.equity.map((p) => p.value);
    chartInst.current.setOption({
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 } },
      series: [
        {
          type: 'line',
          data: values,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#a855f7', width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(168,85,247,0.4)' },
                { offset: 1, color: 'rgba(168,85,247,0.02)' },
              ],
            },
          },
        },
      ],
    });
    const onResize = () => chartInst.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [result]);

  useEffect(() => {
    if (!open) {
      chartInst.current?.dispose();
      chartInst.current = null;
    }
  }, [open]);

  async function runBacktest() {
    if (!dsl) {
      setError('请先在策略实验室生成 DSL');
      return;
    }
    setLoading(true);
    setError('');
    setProgress('拉取 K 线数据...');
    setResult(null);
    try {
      const codeList = codes.split(/[,，\s]+/).map((c) => c.trim()).filter(Boolean);
      if (codeList.length === 0) throw new Error('股票代码为空');
      const r = await fetch(`/api/kline-batch?codes=${codeList.join(',')}&days=${days}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'K 线接口失败');
      const stocks: StockData[] = [];
      for (const code of codeList) {
        const bars: Bar[] = j.data?.[code] || [];
        if (bars.length >= 60) stocks.push({ code, bars });
      }
      if (stocks.length === 0) throw new Error('有效股票不足（每只至少 60 根 K 线）');
      setProgress(`回测中（${stocks.length} 只）...`);
      const res = backtest(dsl, stocks);
      setResult(res);
      setProgress('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="📊 策略回测" width="max-w-5xl">
      <div className="p-5 space-y-4 overflow-y-auto">
        {/* 输入区 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-slate-500 dark:text-slate-400">股票池（逗号分隔）</label>
            <textarea
              value={codes}
              onChange={(e) => setCodes(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">回测天数</label>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
            />
            <button
              onClick={runBacktest}
              disabled={loading || !dsl}
              className="w-full mt-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {loading ? progress || '回测中...' : '🚀 开始回测'}
            </button>
          </div>
        </div>

        {!dsl && (
          <div className="text-sm text-amber-600 dark:text-amber-400">
            ⚠️ 当前无策略 DSL，请先打开「🧪 策略实验室」生成
          </div>
        )}
        {error && (
          <div className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded">
            ❌ {error}
          </div>
        )}

        {/* 结果区 */}
        {result && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="总收益" value={`${(result.totalReturn * 100).toFixed(2)}%`} positive={result.totalReturn >= 0} />
              <Stat label="胜率" value={`${(result.winRate * 100).toFixed(1)}%`} />
              <Stat label="最大回撤" value={`${(result.maxDrawdown * 100).toFixed(2)}%`} negative />
              <Stat label="夏普" value={result.sharpe.toFixed(2)} />
              <Stat label="盈亏比" value={isFinite(result.profitFactor) ? result.profitFactor.toFixed(2) : '∞'} />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              交易次数 {result.totalTrades} · 年化 {(result.annualReturn * 100).toFixed(2)}% · 平均盈 {(result.avgWin * 100).toFixed(2)}% / 亏 {(result.avgLoss * 100).toFixed(2)}%
            </div>
            <div ref={chartRef} className="w-full h-64 rounded-lg border border-slate-200 dark:border-slate-700" />

            {/* 交易明细 */}
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-600 dark:text-slate-300 py-1">
                📋 交易明细（{result.trades.length} 笔）
              </summary>
              <div className="max-h-64 overflow-y-auto mt-2">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700">
                    <tr>
                      <th className="px-2 py-1 text-left">代码</th>
                      <th className="px-2 py-1 text-left">买入</th>
                      <th className="px-2 py-1 text-right">买价</th>
                      <th className="px-2 py-1 text-left">卖出</th>
                      <th className="px-2 py-1 text-right">卖价</th>
                      <th className="px-2 py-1 text-right">收益</th>
                      <th className="px-2 py-1 text-left">原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                        <td className="px-2 py-1 font-mono">{t.code}</td>
                        <td className="px-2 py-1">{t.buyDate}</td>
                        <td className="px-2 py-1 text-right">{t.buyPrice.toFixed(2)}</td>
                        <td className="px-2 py-1">{t.sellDate}</td>
                        <td className="px-2 py-1 text-right">{t.sellPrice.toFixed(2)}</td>
                        <td className={`px-2 py-1 text-right ${t.pnlPct >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {(t.pnlPct * 100).toFixed(2)}%
                        </td>
                        <td className="px-2 py-1 text-slate-500">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  const color = positive ? 'text-rose-500' : negative ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
