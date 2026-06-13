'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface Sector {
  name: string;
  change: number;
  mainNet?: number;
}

export default function SectorHeatmap({ sectors }: { sectors: Sector[] }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  if (!sectors?.length) return null;

  const colorOf = (chg: number) => {
    if (chg >= 5) return '#dc2626';
    if (chg >= 2) return '#ef4444';
    if (chg >= 0) return '#fca5a5';
    if (chg >= -2) return '#86efac';
    if (chg >= -5) return '#22c55e';
    return '#15803d';
  };

  const data = sectors.map((s) => ({
    name: s.name,
    value: Math.abs(s.change) + 1,
    change: s.change,
    itemStyle: { color: colorOf(s.change) },
  }));

  const borderColor = isDark ? '#0b1220' : '#fff';
  const tooltipBg = isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)';
  const tooltipColor = isDark ? '#e2e8f0' : '#0f172a';

  const option = {
    tooltip: {
      backgroundColor: tooltipBg,
      borderWidth: 0,
      textStyle: { color: tooltipColor, fontSize: 12 },
      formatter: (info: { data: { name: string; change: number } }) =>
        `<b>${info.data.name}</b><br/>涨跌幅: ${info.data.change >= 0 ? '+' : ''}${info.data.change.toFixed(2)}%`,
    },
    series: [
      {
        type: 'treemap',
        data,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          formatter: (info: { data: { name: string; change: number } }) =>
            `{name|${info.data.name}}\n{val|${info.data.change >= 0 ? '+' : ''}${info.data.change.toFixed(2)}%}`,
          rich: {
            name: { fontSize: 13, color: '#fff', fontWeight: 'bold' },
            val: { fontSize: 11, color: '#fff', padding: [3, 0, 0, 0] },
          },
        },
        itemStyle: { borderColor, borderWidth: 2, gapWidth: 2 },
      },
    ],
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
