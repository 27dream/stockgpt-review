'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { TEMPLATES, type Template } from '@/lib/strategies';
import type { StrategyDSL } from '@/lib/dsl';
import { validateDSL } from '@/lib/dsl';
import { nl2dsl, type LLMConfig, type LLMProvider } from '@/lib/ai-dsl';

interface AppSettings { apiKey: string; baseUrl: string; model: string }

function detectProvider(baseUrl: string): LLMProvider {
  if (baseUrl.includes('deepseek')) return 'deepseek';
  if (baseUrl.includes('moonshot')) return 'moonshot';
  if (baseUrl.includes('openai')) return 'openai';
  return 'custom';
}

export default function StrategyLab({
  open,
  onClose,
  onRunBacktest,
  onAddToMonitor,
  initialDSL,
}: {
  open: boolean;
  onClose: () => void;
  onRunBacktest: (dsl: StrategyDSL) => void;
  onAddToMonitor: (dsl: StrategyDSL) => void;
  initialDSL?: StrategyDSL | null;
}) {
  const [selectedId, setSelectedId] = useState<string>(TEMPLATES[0].id);
  const [paramValues, setParamValues] = useState<Record<string, number>>({});
  const [dslText, setDslText] = useState('');
  const [nlQuery, setNlQuery] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [error, setError] = useState('');

  const tpl: Template = useMemo(
    () => TEMPLATES.find((t) => t.id === selectedId) || TEMPLATES[0],
    [selectedId]
  );

  // 初始化模板参数 + 默认 DSL
  useEffect(() => {
    const defs = Object.fromEntries(tpl.paramSpec.map((p) => [p.key, p.default]));
    setParamValues(defs);
    setDslText(JSON.stringify(tpl.build(defs), null, 2));
    setError('');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // initialDSL 优先（外部传入时）
  useEffect(() => {
    if (open && initialDSL) {
      setDslText(JSON.stringify(initialDSL, null, 2));
    }
  }, [open, initialDSL]);

  const updateParam = (key: string, val: number) => {
    const next = { ...paramValues, [key]: val };
    setParamValues(next);
    setDslText(JSON.stringify(tpl.build(next), null, 2));
  };

  const parseDSL = (): StrategyDSL | null => {
    try {
      const j = JSON.parse(dslText) as StrategyDSL;
      const v = validateDSL(j);
      if (!v.ok) {
        setError('DSL 校验失败：' + v.error);
        return null;
      }
      setError('');
      return j;
    } catch (e) {
      setError('JSON 解析失败：' + (e as Error).message);
      return null;
    }
  };

  const onNl2Dsl = async () => {
    if (!nlQuery.trim()) return;
    setNlLoading(true);
    setError('');
    try {
      let cfg: LLMConfig;
      const llm = localStorage.getItem('stockgpt:llm_config');
      if (llm) {
        cfg = JSON.parse(llm);
      } else {
        const raw = localStorage.getItem('stockgpt-settings');
        if (!raw) {
          setError('未配置 LLM API Key，请先在主页 ⚙️ 设置中填入');
          setNlLoading(false);
          return;
        }
        const s = JSON.parse(raw) as AppSettings;
        cfg = {
          provider: detectProvider(s.baseUrl),
          apiKey: s.apiKey,
          baseUrl: s.baseUrl,
          model: s.model,
        };
      }
      const dsl = await nl2dsl(nlQuery, cfg);
      setDslText(JSON.stringify(dsl, null, 2));
    } catch (e) {
      setError('AI 生成失败：' + (e as Error).message);
    }
    setNlLoading(false);
  };

  const onRun = () => {
    const dsl = parseDSL();
    if (!dsl) return;
    onRunBacktest(dsl);
  };
  const onMonitor = () => {
    const dsl = parseDSL();
    if (!dsl) return;
    onAddToMonitor(dsl);
  };

  return (
    <Modal open={open} onClose={onClose} title="🧪 策略实验室" width="max-w-6xl">
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* 左：模板列表 */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-700">
            内置模板（{TEMPLATES.length}）
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-3 py-2 border-b border-slate-100 dark:border-slate-700/60 transition ${
                  selectedId === t.id
                    ? 'bg-orange-50 dark:bg-orange-900/30 border-l-4 border-l-orange-500'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                }`}
              >
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {t.emoji} {t.name}
                  <span className="ml-1 text-[10px] text-slate-400">{t.category}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 右：参数 + DSL */}
        <div className="space-y-3">
          {/* 参数面板 */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/40 dark:bg-slate-700/20">
            <div className="text-xs text-slate-500 mb-2">参数（点选模板自动填入，修改后右侧 DSL 实时同步）</div>
            {tpl.paramSpec.length === 0 ? (
              <div className="text-xs text-slate-400 py-2">该模板无参数</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {tpl.paramSpec.map((p) => (
                  <div key={p.key}>
                    <label className="text-[11px] text-slate-500">
                      {p.label}（{p.key}）
                    </label>
                    <input
                      type="number"
                      step={p.step ?? 1}
                      min={p.min}
                      max={p.max}
                      value={paramValues[p.key] ?? p.default}
                      onChange={(e) => updateParam(p.key, parseFloat(e.target.value))}
                      className="w-full mt-0.5 px-2 py-1 text-sm rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DSL JSON */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">JSON DSL（可直接编辑）</span>
              <button
                onClick={() => {
                  const defs = Object.fromEntries(tpl.paramSpec.map((p) => [p.key, p.default]));
                  setParamValues(defs);
                  setDslText(JSON.stringify(tpl.build(defs), null, 2));
                }}
                className="text-[11px] text-orange-500 hover:underline"
              >
                重置
              </button>
            </div>
            <textarea
              value={dslText}
              onChange={(e) => setDslText(e.target.value)}
              spellCheck={false}
              className="w-full h-56 px-3 py-2 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-200"
            />
          </div>

          {/* 自然语言 → DSL */}
          <div className="border border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">🤖 自然语言生成（调用你配置的 LLM Key）</div>
            <div className="flex gap-2">
              <input
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                placeholder="例：5日均线上穿20日线买入，跌5%止损"
                className="flex-1 px-3 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800"
              />
              <button
                onClick={onNl2Dsl}
                disabled={nlLoading || !nlQuery.trim()}
                className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-purple-500 to-indigo-500 text-white disabled:opacity-50"
              >
                {nlLoading ? '生成中...' : 'AI 生成'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 rounded-md p-2 text-xs">
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onRun}
              className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium shadow hover:shadow-lg transition"
            >
              📊 运行回测
            </button>
            <button
              onClick={onMonitor}
              className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium shadow hover:shadow-lg transition"
            >
              📡 加入盯盘
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
