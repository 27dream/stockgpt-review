'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface Sector {
  code: string; name: string;
  changePct: number; amount: number; mainNet: number;
  upCount: number; downCount: number;
  leadName: string; leadCode: string;
}

export default function HeatmapModal({
  open, onClose, onPickSector,
}: {
  open: boolean;
  onClose: () => void;
  onPickSector?: (s: { code: string; name: string }) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  useEffect(() => {
    if (!open) return;
    setLoading(true); setErr('');
    fetch('/api/heatmap')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setSectors(d.sectors || []);
        else setErr(d.error || '加载失败');
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  const stats = useMemo(() => {
    if (!sectors.length) return null;
    const up = sectors.filter((s) => s.changePct > 0).length;
    const down = sectors.filter((s) => s.changePct < 0).length;
    const flat = sectors.length - up - down;
    return { up, down, flat, total: sectors.length };
  }, [sectors]);

  const option = useMemo(() => {
    if (!sectors.length) return null;
    // Treemap：成交额定方块大小，涨跌幅定颜色
    const colorOf = (pct: number) => {
      if (pct >= 5) return '#b91c1c';
      if (pct >= 3) return '#dc2626';
      if (pct >= 1) return '#ef4444';
      if (pct > 0) return '#f87171';
      if (pct === 0) return '#94a3b8';
      if (pct > -1) return '#86efac';
      if (pct > -3) return '#22c55e';
      if (pct > -5) return '#16a34a';
      return '#15803d';
    };
    const data = sectors.map((s) => ({
      name: s.name,
      value: s.amount, // 大小
      changePct: s.changePct,
      mainNet: s.mainNet,
      code: s.code,
      leadName: s.leadName,
      itemStyle: { color: colorOf(s.changePct) },
      label: {
        show: true,
        formatter: () =>
          `{a|${s.name}}\n{b|${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%}`,
        rich: {
          a: { fontSize: 12, fontWeight: 600, color: '#fff', lineHeight: 16 },
          b: { fontSize: 11, color: '#fff', opacity: 0.9, lineHeight: 14 },
        },
      },
    }));
    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: isDark ? '#e2e8f0' : '#0f172a', fontSize: 12 },
        formatter: (p: { name: string; data: { changePct: number; value: number; mainNet: number; leadName: string } }) => {
          const d = p.data;
          if (!d) return '';
          const color = d.changePct >= 0 ? '#ef4444' : '#22c55e';
          return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>
            <div>涨跌幅: <span style="color:${color}">${d.changePct >= 0 ? '+' : ''}${d.changePct.toFixed(2)}%</span></div>
            <div>成交额: ${(d.value / 1e8).toFixed(2)} 亿</div>
            <div>主力净流入: <span style="color:${d.mainNet >= 0 ? '#ef4444' : '#22c55e'}">${(d.mainNet / 1e8).toFixed(2)} 亿</span></div>
            <div>领涨股: ${d.leadName || '-'}</div>
            <div style="color:#94a3b8;margin-top:4px;font-size:10px">点击查看成分股</div>`;
        },
      },
      series: [{
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        upperLabel: { show: false },
        itemStyle: { borderColor: isDark ? '#0f172a' : '#fff', borderWidth: 2, gapWidth: 2 },
        label: { show: true },
        data,
      }],
    };
  }, [sectors, isDark]);

  return (
    <Modal open={open} onClose={onClose} title="🌡️ 行业板块热力图" width="max-w-6xl">
      {loading && <div className="text-center text-sm text-slate-400 py-12">加载中...</div>}
      {err && <div className="text-center text-sm text-red-500 py-12">{err}</div>}
      {!loading && !err && stats && option && (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded px-2 py-1.5">
              <div className="text-slate-400 text-[10px]">板块总数</div>
              <div className="font-semibold">{stats.total}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded px-2 py-1.5">
              <div className="text-slate-400 text-[10px]">上涨</div>
              <div className="font-semibold text-red-500">{stats.up}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded px-2 py-1.5">
              <div className="text-slate-400 text-[10px]">下跌</div>
              <div className="font-semibold text-green-500">{stats.down}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded px-2 py-1.5">
              <div className="text-slate-400 text-[10px]">平盘</div>
              <div className="font-semibold text-slate-500">{stats.flat}</div>
            </div>
          </div>
          <ReactECharts
            option={option}
            style={{ height: 480 }}
            notMerge
            onEvents={{
              click: (params: { data?: { code?: string; name?: string } }) => {
                if (params?.data?.code && params.data.name) {
                  onPickSector?.({ code: params.data.code, name: params.data.name });
                }
              },
            }}
          />
          <div className="text-xs text-slate-400 mt-2 text-center">
            方块大小代表成交额，颜色深浅代表涨跌幅 · 点击板块查看成分股
          </div>
        </>
      )}
    </Modal>
  );
}
