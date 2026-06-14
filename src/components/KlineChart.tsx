'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

// secid 格式: "1.600519"(沪) / "0.000001"(深) / "1.000001"(指数上证) / "0.399001"(深证)
type Klt = 101 | 102 | 103; // 日 / 周 / 月

interface Kline {
  date: string; open: number; close: number; low: number; high: number;
  volume: number; amount: number; pct: number;
}

export default function KlineChart({ secid, name }: { secid: string; name: string }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [klt, setKlt] = useState<Klt>(101);
  const [data, setData] = useState<Kline[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  useEffect(() => {
    if (!secid) return;
    setLoading(true);
    setErr('');
    // 浏览器直连东财（CORS 放开）
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=1&end=20500101&lmt=120&_=${Date.now()}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const lines = d?.data?.klines || [];
        setData(
          lines.map((s: string) => {
            const [date, open, close, high, low, volume, amount, , pct] = s.split(',');
            return {
              date,
              open: +open,
              close: +close,
              high: +high,
              low: +low,
              volume: +volume,
              amount: +amount,
              pct: +pct,
            };
          })
        );
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [secid, klt]);

  if (loading) return <div className="text-center text-sm text-slate-400 py-12">加载中...</div>;
  if (err) return <div className="text-center text-sm text-red-500 py-12">加载失败: {err}</div>;
  if (!data.length) return <div className="text-center text-sm text-slate-400 py-12">无数据</div>;

  const dates = data.map((d) => d.date);
  // ECharts candlestick: [open, close, low, high]
  const ohlc = data.map((d) => [d.open, d.close, d.low, d.high]);
  const vol = data.map((d, i) => ({
    value: d.volume,
    itemStyle: { color: d.close >= d.open ? '#ef4444' : '#22c55e' },
  }));

  const ma = (n: number) =>
    data.map((_, i) => {
      if (i < n - 1) return null;
      const sum = data.slice(i - n + 1, i + 1).reduce((a, b) => a + b.close, 0);
      return +(sum / n).toFixed(2);
    });

  const labelColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipBg = isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)';
  const tooltipColor = isDark ? '#e2e8f0' : '#0f172a';

  const option = {
    animation: false,
    grid: [
      { left: 50, right: 20, top: 30, height: '60%' },
      { left: 50, right: 20, top: '78%', height: '15%' },
    ],
    legend: { textStyle: { color: labelColor, fontSize: 11 }, top: 4, data: ['MA5', 'MA10', 'MA20'] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: tooltipBg,
      borderWidth: 0,
      textStyle: { color: tooltipColor, fontSize: 11 },
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    xAxis: [
      { type: 'category', data: dates, axisLabel: { color: labelColor, fontSize: 10 }, axisLine: { lineStyle: { color: splitColor } } },
      { type: 'category', gridIndex: 1, data: dates, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
    ],
    yAxis: [
      { scale: true, axisLabel: { color: labelColor, fontSize: 10 }, splitLine: { lineStyle: { color: splitColor, type: 'dashed' } } },
      { scale: true, gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], start: 60, end: 100 }],
    series: [
      {
        name: 'K线', type: 'candlestick', data: ohlc,
        itemStyle: { color: '#ef4444', color0: '#22c55e', borderColor: '#ef4444', borderColor0: '#22c55e' },
      },
      { name: 'MA5', type: 'line', data: ma(5), smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#f59e0b' } },
      { name: 'MA10', type: 'line', data: ma(10), smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#3b82f6' } },
      { name: 'MA20', type: 'line', data: ma(20), smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#a855f7' } },
      { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: vol },
    ],
  };

  const last = data[data.length - 1];
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm">
          <span className="font-semibold">{name}</span>
          <span className="ml-3 text-slate-400">{last.date}</span>
          <span className={`ml-3 font-bold ${last.pct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
            {last.close.toFixed(2)} ({last.pct >= 0 ? '+' : ''}{last.pct.toFixed(2)}%)
          </span>
        </div>
        <div className="flex gap-1 text-xs">
          {([
            [101, '日K'], [102, '周K'], [103, '月K'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKlt(k as Klt)}
              className={`px-2 py-0.5 rounded ${
                klt === k
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ReactECharts
        key={isDark ? 'dark' : 'light'}
        option={option}
        style={{ height: 360 }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
