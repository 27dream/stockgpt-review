'use client';

import { useState, useEffect, useRef } from 'react';
import IndexTrendChart from '@/components/IndexTrendChart';
import SectorHeatmap from '@/components/SectorHeatmap';
import ThemeToggle from '@/components/ThemeToggle';
import StockSearch, { type StockSuggestion } from '@/components/StockSearch';
import HistoryDrawer from '@/components/HistoryDrawer';
import Modal from '@/components/Modal';
import StockChartModal from '@/components/StockChartModal';
import SectorDetailModal from '@/components/SectorDetailModal';
import ZTPoolModal from '@/components/ZTPoolModal';
import HeatmapModal from '@/components/HeatmapModal';
import StrategyLab from '@/components/StrategyLab';
import BacktestPanel from '@/components/BacktestPanel';
import SignalMonitor from '@/components/SignalMonitor';
import NotificationConfig from '@/components/NotificationConfig';
import type { StrategyDSL } from '@/lib/dsl';
import { saveHistory, type HistoryItem } from '@/lib/history';
import { exportNodeToPdf } from '@/lib/pdf';
import type { IndexTrend } from '@/lib/trends';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Tab = 'review' | 'morning' | 'stock';
const TABS: Array<{ id: Tab; label: string; emoji: string; desc: string }> = [
  { id: 'review', label: '盘后复盘', emoji: '📊', desc: '收盘后AI复盘当日行情' },
  { id: 'morning', label: '早盘策略', emoji: '🌅', desc: '基于隔夜消息的早盘备忘' },
  { id: 'stock', label: '个股诊断', emoji: '🔍', desc: '搜索任意A股 → AI 出具诊断' },
];

interface StockQuote {
  code: string; name: string; price: number; preClose: number;
  change: number; changePct: number; open: number; high: number; low: number;
  volume: number; amount: number; marketCap: number; pe: number; pb: number; turnover: number;
}
interface FundFlowDay { date: string; mainNet: number; mainPct: number; closePct: number; }

interface Settings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface MarketSnapshot {
  date: string;
  indices: Array<{ name: string; price: number; changePct: number }>;
  indexTrends: IndexTrend[];
  ztSummary: {
    total: number;
    maxLb: number;
    top10: Array<{ name: string; lbCount: number; industry: string; sealFund: number }>;
  };
  hotSectors: Array<{ name: string; change: number; code?: string }>;
  news: Array<{ title: string; time: string; url?: string; digest?: string }>;
}

const PRESETS = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
];

export default function Home() {
  const [settings, setSettings] = useState<Settings>({
    apiKey: '',
    baseUrl: PRESETS[1].baseUrl,
    model: PRESETS[1].model,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showStrategyLab, setShowStrategyLab] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [showMonitor, setShowMonitor] = useState(false);
  const [showNotifyConfig, setShowNotifyConfig] = useState(false);
  const [currentDSL, setCurrentDSL] = useState<StrategyDSL | null>(null);
  const [monitorCodes, setMonitorCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>('review');
  const [stock, setStock] = useState<StockSuggestion | null>(null);
  const [stockData, setStockData] = useState<{ quote: StockQuote; fundFlow: FundFlowDay[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // 弹层状态
  const [sectorModal, setSectorModal] = useState<{ bk: string; name: string } | null>(null);
  const [newsModal, setNewsModal] = useState<{ title: string; time: string; url?: string; digest?: string } | null>(null);
  const [klineModal, setKlineModal] = useState<{ secid: string; name: string } | null>(null);
  const [ztPoolOpen, setZtPoolOpen] = useState(false);
  const [heatmapOpen, setHeatmapOpen] = useState(false);

  // 页面加载即拉一次行情快照（不需要 LLM Key）
  useEffect(() => {
    fetch('/api/market')
      .then((r) => r.json())
      .then((d) => d.ok && setSnapshot(d))
      .catch(() => {});
  }, []);

  // 从 localStorage 加载（永不上传服务端）
  useEffect(() => {
    const saved = localStorage.getItem('stockgpt-settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch {}
    } else {
      setShowSettings(true);
    }
  }, []);

  const saveSettings = (s: Settings) => {
    setSettings(s);
    localStorage.setItem('stockgpt-settings', JSON.stringify(s));
    setShowSettings(false);
  };

  // 切个股时拉行情
  const onSelectStock = async (s: StockSuggestion) => {
    setStock(s);
    setStockData(null);
    setError('');
    try {
      const r = await fetch(`/api/stock?secid=${s.secid}`);
      const j = await r.json();
      if (j.ok) setStockData({ quote: j.quote, fundFlow: j.fundFlow });
      else setError(j.error || '行情拉取失败');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const generate = async () => {
    if (!settings.apiKey) {
      setShowSettings(true);
      setError('请先填入 LLM API Key');
      return;
    }
    if (tab === 'stock' && !stock) {
      setError('请先搜索并选择一只股票');
      return;
    }
    setLoading(true);
    setError('');
    setReport('');
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          mode: tab,
          secid: tab === 'stock' ? stock?.secid : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(j.error || `请求失败 ${res.status}`);
        setLoading(false);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setReport(acc);
      }
      // 完成后存历史
      if (acc.trim().length > 0) {
        const title =
          tab === 'review' ? `盘后复盘 ${new Date().toLocaleDateString('zh-CN')}`
          : tab === 'morning' ? `早盘策略 ${new Date().toLocaleDateString('zh-CN')}`
          : `${stock?.name || '个股'} 诊断`;
        saveHistory({ mode: tab, title, content: acc });
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  const onPickHistory = (item: HistoryItem) => {
    setTab(item.mode);
    setReport(item.content);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onExportPdf = async () => {
    if (!reportRef.current) return;
    setPdfLoading(true);
    try {
      const ts = new Date().toISOString().slice(0, 10);
      const name =
        tab === 'review' ? `盘后复盘-${ts}.pdf`
        : tab === 'morning' ? `早盘策略-${ts}.pdf`
        : `${stock?.name || '个股'}-诊断-${ts}.pdf`;
      await exportNodeToPdf(reportRef.current, name);
    } catch (e) {
      setError('PDF 导出失败：' + (e as Error).message);
    }
    setPdfLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-6 sm:mb-8 anim-in delay-1">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold gradient-text">
              📈 StockGPT Review
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              AI 盘后复盘助手 · 数据来自东方财富
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <button
              onClick={() => setShowStrategyLab(true)}
              aria-label="策略实验室"
              title="策略实验室 + 回测 + 盯盘"
              className="press w-10 h-10 sm:w-auto sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm hover:shadow-md flex items-center justify-center"
            >
              <span className="sm:hidden">🧪</span>
              <span className="hidden sm:inline">🧪 策略</span>
            </button>
            <button
              onClick={() => setShowHistory(true)}
              aria-label="历史"
              className="press w-10 h-10 sm:w-auto sm:px-4 sm:py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm hover:shadow-md flex items-center justify-center"
            >
              <span className="sm:hidden">📜</span>
              <span className="hidden sm:inline">📜 历史</span>
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              aria-label="设置"
              className="press w-10 h-10 sm:w-auto sm:px-4 sm:py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm hover:shadow-md flex items-center justify-center"
            >
              <span className="sm:hidden">⚙️</span>
              <span className="hidden sm:inline">⚙️ 设置</span>
            </button>
          </div>
        </header>

        {/* Tab 切换 */}
        <div className="grid grid-cols-3 gap-2 mb-4 sm:mb-6 anim-in delay-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setReport(''); setError(''); }}
              className={`press py-2.5 sm:py-3 rounded-xl border text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white border-transparent shadow-md shadow-orange-500/20'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-orange-300'
              }`}
            >
              <div className="text-base sm:text-lg">{t.emoji} <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.label}</span></div>
              <div className={`text-[10px] sm:text-xs mt-0.5 ${tab === t.id ? 'text-white/85' : 'text-slate-400'}`}>{t.desc}</div>
            </button>
          ))}
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 mb-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              🔑 LLM API 配置
              <span className="text-xs text-green-600 dark:text-green-400 font-normal">
                · Key 仅存浏览器本地，永不上传服务端
              </span>
            </h2>
            <div className="grid gap-3">
              <div>
                <label className="text-xs text-slate-500">服务商预设</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() =>
                        setSettings({ ...settings, baseUrl: p.baseUrl, model: p.model })
                      }
                      className={`px-3 py-1 text-xs rounded-md border transition ${
                        settings.baseUrl === p.baseUrl
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Base URL</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm"
                  value={settings.baseUrl}
                  onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">模型</label>
                  <input
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm"
                    value={settings.model}
                    onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">API Key</label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm"
                    value={settings.apiKey}
                    onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                  />
                </div>
              </div>
              <button
                onClick={() => saveSettings(settings)}
                className="px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition"
              >
                保存配置
              </button>
            </div>
          </div>
        )}

        {/* Market Snapshot - 大盘 / 早盘 共用 */}
        {tab !== 'stock' && snapshot && (
          <div className="grid md:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6 anim-in delay-2">
            {/* 指数 + 涨停 */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                📊 今日大盘 <span className="text-xs text-slate-400 font-normal">{snapshot.date}</span>
              </h3>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {snapshot.indices.slice(0, 3).map((i) => (
                  <div key={i.name} className="text-center">
                    <div className="text-xs text-slate-500">{i.name}</div>
                    <div className="text-lg font-bold mt-1">{i.price.toFixed(2)}</div>
                    <div className={`text-xs font-medium ${i.changePct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {i.changePct >= 0 ? '+' : ''}{i.changePct.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                <div className="flex items-center justify-between text-xs mb-2">
                  <button
                    onClick={() => setZtPoolOpen(true)}
                    className="text-slate-500 hover:text-orange-500 transition flex items-center gap-1"
                    title="点击查看完整涨停池"
                  >
                    🔥 涨停板池 <span className="text-[10px] opacity-60">详情→</span>
                  </button>
                  <span className="font-semibold text-orange-500">
                    {snapshot.ztSummary.total} 家 · 最高 {snapshot.ztSummary.maxLb} 连板
                  </span>
                </div>
                <div className="space-y-1.5">
                  {snapshot.ztSummary.top10.slice(0, 4).map((s) => (
                    <div key={s.name} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-orange-50/50 dark:hover:bg-slate-700/40 px-1 -mx-1 rounded transition"
                      onClick={() => setZtPoolOpen(true)}>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 font-bold min-w-[36px] text-center">
                        {s.lbCount}板
                      </span>
                      <span className="font-medium">{s.name}</span>
                      <span className="text-slate-400 truncate">{s.industry}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 新闻 + 板块 */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                📰 实时快讯
                <span className="text-xs text-slate-400 font-normal">东财 7×24</span>
              </h3>
              <div className="space-y-2 mb-4 max-h-32 overflow-y-auto">
                {snapshot.news.slice(0, 5).map((n, i) => (
                  <div
                    key={i}
                    className="text-xs leading-relaxed cursor-pointer hover:bg-orange-50/50 dark:hover:bg-slate-700/40 px-1 py-0.5 -mx-1 rounded transition"
                    onClick={() => setNewsModal(n)}
                    title="点击查看详情"
                  >
                    <span className="text-orange-500 font-mono mr-1.5">
                      {n.time?.slice(11, 16) || '--:--'}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">{n.title}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setHeatmapOpen(true)}
                    className="text-xs text-slate-500 hover:text-orange-500 transition flex items-center gap-1"
                    title="查看全行业板块热力图"
                  >
                    🚀 热门板块 <span className="text-[10px] opacity-60">热力图→</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {snapshot.hotSectors.slice(0, 6).map((s) => (
                    <button
                      key={s.name}
                      onClick={() => s.code && setSectorModal({ bk: s.code, name: s.name })}
                      disabled={!s.code}
                      className={`px-2 py-0.5 rounded-md text-xs transition hover:scale-105 ${
                        s.change >= 0
                          ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50'
                          : 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50'
                      } ${s.code ? 'cursor-pointer' : 'cursor-default'}`}
                      title={s.code ? '点击查看成分股' : ''}
                    >
                      {s.name} {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Charts - 分时图 + 板块热力图（仅 review/morning） */}
        {tab !== 'stock' && snapshot && (snapshot.indexTrends?.length > 0 || snapshot.hotSectors?.length > 0) && (
          <div className="grid md:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6 anim-in delay-3">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                📉 三大指数分时
                <span className="text-xs text-slate-400 font-normal">相对昨收涨跌幅</span>
              </h3>
              <IndexTrendChart trends={snapshot.indexTrends} />
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                🌡️ 板块热力图
                <span className="text-xs text-slate-400 font-normal">块大小 = 涨跌幅强度</span>
              </h3>
              <SectorHeatmap sectors={snapshot.hotSectors} />
            </div>
          </div>
        )}

        {/* 个股诊断 Tab */}
        {tab === 'stock' && (
          <div className="space-y-4 mb-4 sm:mb-6 anim-in delay-2">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">🔍 选择股票</h3>
              <StockSearch onSelect={onSelectStock} />
            </div>
            {stockData && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-baseline justify-between mb-4">
                  <div>
                    <span className="text-lg font-bold">{stockData.quote.name}</span>
                    <span className="ml-2 text-sm text-slate-400">{stockData.quote.code}</span>
                  </div>
                  <div className={`text-2xl font-bold ${stockData.quote.changePct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {stockData.quote.price.toFixed(2)}
                    <span className="text-sm ml-2">
                      {stockData.quote.changePct >= 0 ? '+' : ''}{stockData.quote.changePct.toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><div className="text-slate-400">今开</div><div className="font-medium">{stockData.quote.open.toFixed(2)}</div></div>
                  <div><div className="text-slate-400">最高</div><div className="font-medium text-red-500">{stockData.quote.high.toFixed(2)}</div></div>
                  <div><div className="text-slate-400">最低</div><div className="font-medium text-green-500">{stockData.quote.low.toFixed(2)}</div></div>
                  <div><div className="text-slate-400">昨收</div><div className="font-medium">{stockData.quote.preClose.toFixed(2)}</div></div>
                  <div><div className="text-slate-400">换手率</div><div className="font-medium">{stockData.quote.turnover.toFixed(2)}%</div></div>
                  <div><div className="text-slate-400">PE(动)</div><div className="font-medium">{stockData.quote.pe.toFixed(2)}</div></div>
                  <div><div className="text-slate-400">PB</div><div className="font-medium">{stockData.quote.pb.toFixed(2)}</div></div>
                  <div><div className="text-slate-400">市值</div><div className="font-medium">{(stockData.quote.marketCap / 1e8).toFixed(1)}亿</div></div>
                </div>
                {stockData.fundFlow.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-slate-700 mt-4 pt-3">
                    <div className="text-xs text-slate-500 mb-2">💰 近 5 日主力资金</div>
                    <div className="space-y-1">
                      {stockData.fundFlow.map((f) => (
                        <div key={f.date} className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-mono">{f.date}</span>
                          <span className={f.closePct >= 0 ? 'text-red-500' : 'text-green-500'}>
                            {f.closePct >= 0 ? '+' : ''}{f.closePct.toFixed(2)}%
                          </span>
                          <span className={`font-medium ${f.mainNet >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {f.mainNet >= 0 ? '+' : ''}{(f.mainNet / 1e4).toFixed(0)}万
                          </span>
                          <span className="text-slate-400 w-14 text-right">{f.mainPct.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="text-center mb-6 anim-in delay-4">
          <button
            onClick={generate}
            disabled={loading}
            className="press px-6 sm:px-8 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold shadow-lg hover:shadow-xl hover:shadow-orange-500/30 disabled:opacity-50 transition-all w-full sm:w-auto"
          >
            {loading
              ? '🤖 AI 正在分析中...'
              : tab === 'review'
                ? '✨ 一键生成今日盘后复盘'
                : tab === 'morning'
                  ? '🌅 生成今日早盘策略'
                  : stock
                    ? `🔍 诊断 ${stock.name}`
                    : '🔍 请先选择股票'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg p-3 mb-4 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Report */}
        {report && (
          <>
            <div className="flex items-center justify-end gap-2 mb-2 anim-in">
              <button
                onClick={onExportPdf}
                disabled={pdfLoading}
                className="press text-xs sm:text-sm px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-orange-400 disabled:opacity-50 transition"
              >
                {pdfLoading ? '⏳ 导出中...' : '📥 导出 PDF'}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(report)}
                className="press text-xs sm:text-sm px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-orange-400 transition"
              >
                📋 复制
              </button>
            </div>
            <article ref={reportRef} className="anim-in bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="md-body text-sm sm:text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
              </div>
            </article>
          </>
        )}

        {!report && !loading && !error && (
          <div className="text-center text-slate-400 text-sm mt-12">
            💡 点击上方按钮，AI 将自动拉取今日 A 股盘后数据，<br/>
            生成专业的市场复盘报告（指数 / 资金面 / 板块 / 个股 / 明日策略）
          </div>
        )}

        <footer className="text-center text-xs text-slate-400 mt-12">
          数据来源：东方财富延时行情（免费） · 仅供参考，不构成投资建议<br/>
          <a href="https://github.com/27dream/stockgpt-review" className="hover:text-orange-500">GitHub</a>
          {' · '}Powered by your own LLM API Key
        </footer>
      </div>
      <HistoryDrawer open={showHistory} onClose={() => setShowHistory(false)} onPick={onPickHistory} />

      {sectorModal && (
        <SectorDetailModal
          open={true}
          bk={sectorModal.bk}
          sectorName={sectorModal.name}
          onPickStock={(s) => setKlineModal({ secid: `${s.market}.${s.code}`, name: s.name })}
          onClose={() => setSectorModal(null)}
        />
      )}

      {newsModal && (
        <Modal open={true} title={newsModal.title} onClose={() => setNewsModal(null)}>
          <div className="text-xs text-slate-400 mb-2">{newsModal.time}</div>
          <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
            {newsModal.digest || '（无摘要）'}
          </div>
          {newsModal.url && (
            <a href={newsModal.url} target="_blank" rel="noreferrer" className="inline-block mt-4 text-sm text-orange-500 hover:underline">
              查看原文 →
            </a>
          )}
        </Modal>
      )}

      {klineModal && (
        <StockChartModal
          open={true}
          secid={klineModal.secid}
          name={klineModal.name}
          onClose={() => setKlineModal(null)}
        />
      )}

      <ZTPoolModal
        open={ztPoolOpen}
        onClose={() => setZtPoolOpen(false)}
        onPickStock={(s) => {
          setZtPoolOpen(false);
          setKlineModal({ secid: `${s.market}.${s.code}`, name: s.name });
        }}
      />

      <HeatmapModal
        open={heatmapOpen}
        onClose={() => setHeatmapOpen(false)}
        onPickSector={(s) => {
          setHeatmapOpen(false);
          setSectorModal({ bk: s.code, name: s.name });
        }}
      />

      {/* 🧪 策略实验室套件 */}
      <StrategyLab
        open={showStrategyLab}
        onClose={() => setShowStrategyLab(false)}
        onRunBacktest={(dsl) => {
          setCurrentDSL(dsl);
          setShowStrategyLab(false);
          setShowBacktest(true);
        }}
        onAddToMonitor={(dsl) => {
          setCurrentDSL(dsl);
          setShowStrategyLab(false);
          setShowMonitor(true);
        }}
        initialDSL={currentDSL}
      />
      <BacktestPanel
        open={showBacktest}
        onClose={() => setShowBacktest(false)}
        dsl={currentDSL}
      />
      <Modal open={showMonitor} onClose={() => setShowMonitor(false)} title="📡 实时盯盘" width="max-w-5xl">
        <div className="space-y-3">
          <div className="flex gap-2 text-xs">
            <input
              className="flex-1 border rounded px-2 py-1"
              placeholder="代码用逗号分隔，如 sh600519,sz000001"
              value={monitorCodes.join(',')}
              onChange={(e) => setMonitorCodes(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
            <button
              onClick={() => setShowNotifyConfig(true)}
              className="px-2 py-1 border rounded hover:bg-gray-50"
            >🔔 配置推送</button>
          </div>
          <SignalMonitor
            watchCodes={monitorCodes}
            notifyEnabled={true}
          />
        </div>
      </Modal>
      <Modal open={showNotifyConfig} onClose={() => setShowNotifyConfig(false)} title="🔔 通知配置" width="max-w-5xl">
        <NotificationConfig onClose={() => setShowNotifyConfig(false)} />
      </Modal>
    </div>
  );
}
