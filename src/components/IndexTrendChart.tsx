'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import type { IndexTrend } from '@/lib/trends';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function IndexTrendChart({ trends }: { trends: IndexTrend[] }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  if (!trends?.length) return null;

  const xAxis = trends[0].trends.map((p) => p.time);

  const series = trends.map((idx) => {
    const data = idx.trends.map((p) =>
      idx.preClose ? +(((p.price - idx.preClose) / idx.preClose) * 100).toFixed(3) : 0
    );
    return {
      name: idx.name,
      type: 'line',
      data,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 1.8 },
      emphasis: { focus: 'series' },
    };
  });

  const axisColor = isDark ? '#475569' : '#cbd5e1';
  const labelColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipBg = isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)';
  const tooltipColor = isDark ? '#e2e8f0' : '#0f172a';

  const option = {
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    legend: {
      data: trends.map((t) => t.name),
      textStyle: { color: labelColor, fontSize: 12 },
      top: 8,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg,
      borderWidth: 0,
      textStyle: { color: tooltipColor, fontSize: 12 },
      valueFormatter: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
    },
    xAxis: {
      type: 'category',
      data: xAxis,
      boundaryGap: false,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: {
        color: labelColor,
        fontSize: 10,
        interval: (idx: number, val: string) =>
          ['09:30', '10:30', '11:30', '13:30', '14:30', '15:00'].includes(val),
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: labelColor,
        fontSize: 10,
        formatter: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
      },
      splitLine: { lineStyle: { color: splitColor, type: 'dashed' } },
    },
    color: ['#ef4444', '#f59e0b', '#3b82f6'],
    series,
  };

  return (
    <ReactECharts
      key={isDark ? 'dark' : 'light'}
      option={option}
      style={{ height: 280 }}
      notMerge
      lazyUpdate
    />
  );
}
