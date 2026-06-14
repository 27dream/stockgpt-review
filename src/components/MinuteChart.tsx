'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface Trend {
  time: string; price: number; avg: number; volume: number; amount: number;
}

// 分时数据格式: "2026-06-14 09:30,price,?,avg,volume,amount,price"
// fields2: f51=time f52=price f53=avg(?) f54 f55=volume f56=amount f57 f58
export default function MinuteChart({ secid, name, preClose }: {
  secid: string; name: string; preClose?: number;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<Trend[]>([]);
  const [pc, setPc] = useState<number>(preClose || 0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  useEffect(() => {
    if (!secid) return;
    setLoading(true); setErr('');
    const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f17&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=1&secid=${secid}&_=${Date.now()}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const dd = d?.data || {};
        if (dd.preClose) setPc(dd.preClose);
        const trends: string[] = dd.trends || [];
        setData(
          trends.map((s) => {
            const p = s.split(',');
            return {
              time: p[0].slice(11, 16),
              price: +p[1],
              avg: +p[7],
              volume: +p[5],
              amount: +p[6],
            };
          })
        );
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [secid]);

  const option = useMemo(() => {
    if (!data.length) return null;
    const labelColor = isDark ? '#94a3b8' : '#64748b';
    const splitColor = isDark ? '#1e293b' : '#e2e8f0';
    const times = data.map((d) => d.time);
    const prices = data.map((d) => d.price);
    const avgs = data.map((d) => d.avg);
    const vols = data.map((d) => ({
      value: d.volume,
      itemStyle: { color: d.price >= pc ? '#ef4444' : '#22c55e' },
    }));
    const min = Math.min(...prices, pc);
    const max = Math.max(...prices, pc);
    const range = Math.max(max - pc, pc - min);
    const yMin = +(pc - range).toFixed(2);
    const yMax = +(pc + range).toFixed(2);
    const pctMin = ((yMin - pc) / pc * 100).toFixed(2);
    const pctMax = ((yMax - pc) / pc * 100).toFixed(2);

    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: isDark ? '#e2e8f0' : '#0f172a', fontSize: 12 },
        formatter: (params: Array<{ axisValue: string; seriesName: string; value: number }>) => {
          const t = params[0].axisValue;
          const price = params.find((p) => p.seriesName === '价格')?.value || 0;
          const avg = params.find((p) => p.seriesName === '均价')?.value || 0;
          const vol = params.find((p) => p.seriesName === '量')?.value || 0;
          const pct = ((price - pc) / pc * 100).toFixed(2);
          const color = price >= pc ? '#ef4444' : '#22c55e';
          return `<div style="font-weight:500">${t}</div>
            <div>价格: <span style="color:${color}">${price.toFixed(2)}</span> (${pct}%)</div>
            <div>均价: ${avg.toFixed(2)}</div>
            <div>成交量: ${(vol / 100).toFixed(0)}手</div>`;
        },
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: 50, right: 16, top: 16, height: 200 },
        { left: 50, right: 16, top: 240, height: 64 },
      ],
      xAxis: [
        { type: 'category', data: times, gridIndex: 0,
          axisLabel: { show: false }, axisLine: { lineStyle: { color: splitColor } },
          splitLine: { show: true, lineStyle: { color: splitColor, type: 'dashed' as const } } },
        { type: 'category', data: times, gridIndex: 1,
          axisLabel: { color: labelColor, fontSize: 10, interval: Math.floor(times.length / 6) },
          axisLine: { lineStyle: { color: splitColor } } },
      ],
      yAxis: [
        { gridIndex: 0, scale: true, min: yMin, max: yMax, splitNumber: 4,
          axisLabel: { color: labelColor, fontSize: 10, formatter: (v: number) => v.toFixed(2) },
          splitLine: { lineStyle: { color: splitColor, type: 'dashed' as const } },
          // 0 线（昨收）
          axisLine: { show: false } },
        { gridIndex: 1, axisLabel: { color: labelColor, fontSize: 10 },
          splitLine: { show: false }, axisLine: { lineStyle: { color: splitColor } } },
      ],
      series: [
        { name: '价格', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: prices,
          symbol: 'none', lineStyle: { color: '#3b82f6', width: 1.5 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.2)' },
              { offset: 1, color: isDark ? 'rgba(59,130,246,0.02)' : 'rgba(59,130,246,0.01)' },
            ] } },
          markLine: { silent: true, symbol: 'none', data: [{ yAxis: pc, label: { show: false },
            lineStyle: { color: labelColor, type: 'dashed' as const, width: 1 } }] } },
        { name: '均价', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: avgs,
          symbol: 'none', lineStyle: { color: '#f59e0b', width: 1 } },
        { name: '量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: vols,
          barWidth: '70%' },
      ],
      graphic: [
        { type: 'text', left: 4, top: 4, style: { text: `${pctMax}%`, fill: '#ef4444', fontSize: 10 } },
        { type: 'text', left: 4, top: 200, style: { text: `${pctMin}%`, fill: '#22c55e', fontSize: 10 } },
        { type: 'text', left: 4, top: 100, style: { text: `${pc.toFixed(2)}`, fill: labelColor, fontSize: 10 } },
      ],
    };
  }, [data, pc, isDark]);

  if (loading) return <div className="text-center text-sm text-slate-400 py-12">加载中...</div>;
  if (err) return <div className="text-center text-sm text-red-500 py-12">加载失败: {err}</div>;
  if (!data.length || !option) return <div className="text-center text-sm text-slate-400 py-12">无数据</div>;

  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">
        {name} · 分时 · 昨收 {pc.toFixed(2)}
      </div>
      <ReactECharts option={option} style={{ height: 320 }} notMerge />
    </div>
  );
}
