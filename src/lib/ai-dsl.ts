/**
 * 自然语言 → DSL（A3）
 * 调用户自带的 LLM API Key（OpenAI / DeepSeek / 国产兼容）
 * 仅用于把"日线突破20日新高且MA5上穿MA20时买入，跌5%止损"翻成可执行 JSON DSL
 *
 * 设计要点：
 *  1) 用户 Key 走前端 fetch，不落服务端（隐私优先）
 *  2) System Prompt 内置 DSL 语法 + 因子白名单 + few-shot
 *  3) 强制返回 JSON（response_format / 截 ```json）
 *  4) 失败回退：用关键词规则匹配最相近模板
 */

import type { StrategyDSL } from './dsl';
import { TEMPLATES } from './strategies';

export type LLMProvider = 'openai' | 'deepseek' | 'moonshot' | 'custom';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string; // custom 必填
  model?: string;
}

const PROVIDER_DEFAULTS: Record<LLMProvider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  moonshot: { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  custom: { baseUrl: '', model: '' },
};

const SYSTEM_PROMPT = `你是 A 股策略翻译官。把用户的中文/英文需求翻译成下面定义的 JSON DSL，**只输出 JSON，不要任何解释文字**。

## DSL 语法
\`\`\`ts
{
  "name": "策略名",
  "desc": "一句话描述",
  "universe": ["all"] | ["sh000300"] | ["sh600519","sz000001",...],
  "entry": <CondNode>,        // 买入条件
  "exit":  <CondNode>,        // 卖出条件
  "size": "equal_weight" | "fixed_value",
  "max_positions": 5,
  "capital": 100000,
  "stop_loss": 0.05,           // 5% 止损（可选）
  "take_profit": 0.10,         // 10% 止盈（可选）
  "hold_days": 10              // 最长持仓天数（可选）
}
\`\`\`

CondNode 有三种形态：
- 比较: \`{"op": ">", "left": "ma5", "right": "ma20"}\`   （op ∈ >, >=, <, <=, ==, !=）
- 与:   \`{"and": [<CondNode>, <CondNode>, ...]}\`
- 或:   \`{"or":  [<CondNode>, <CondNode>, ...]}\`
- 非:   \`{"not": <CondNode>}\`

left/right 可以是：数字字面量 / 因子名 / 算术表达式字符串（如 "ma20 * 1.05"）。

## 可用因子（白名单）
价格: open / high / low / close / pre_close / change_pct
均线: ma5 / ma10 / ma20 / ma30 / ma60
量能: volume / ma_vol_5 / ma_vol_10 / volume_ratio
技术: rsi_14 / macd / macd_signal / macd_hist / kdj_k / kdj_d / kdj_j / boll_up / boll_mid / boll_low / atr_14
涨停板: is_zt / is_dt / zt_days / limit_up_pct
持仓: hold_days / entry_price / pnl_pct
带 _prev 后缀表示昨日值，例如 ma5_prev、close_prev（用于"上穿/下穿"判定）。

## few-shot
用户: 5日均线上穿20日均线时买入，跌破20日均线卖出，5%止损
输出:
{"name":"MA5上穿MA20","universe":["all"],"entry":{"and":[{"op":">","left":"ma5","right":"ma20"},{"op":"<=","left":"ma5_prev","right":"ma20_prev"}]},"exit":{"op":"<","left":"close","right":"ma20"},"size":"equal_weight","max_positions":5,"capital":100000,"stop_loss":0.05}

用户: 涨停后第二天高开2%买入，持有3天
输出:
{"name":"涨停次日高开","universe":["all"],"entry":{"and":[{"op":"==","left":"is_zt_prev","right":1},{"op":">=","left":"open","right":"pre_close * 1.02"}]},"exit":{"op":">=","left":"hold_days","right":3},"size":"equal_weight","max_positions":3,"capital":100000,"hold_days":3}
`;

/** 截出第一个 JSON 对象（容忍 ```json 包裹与前后空白） */
function extractJSON(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

/** 关键词回退：找不到 LLM 时根据关键词匹配最相近模板 */
function fallbackByKeyword(query: string): StrategyDSL | null {
  const q = query.toLowerCase();
  const score = (kw: string[]) => kw.reduce((s, k) => s + (q.includes(k) ? 1 : 0), 0);
  const ranked = TEMPLATES.map((t) => {
    const kw: string[] = [t.name, t.desc || ''].join(' ').toLowerCase().split(/[\s,。、]+/).filter(Boolean);
    return { t, score: score(kw) };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const tpl = ranked[0].t;
  const params = Object.fromEntries(tpl.paramSpec.map((p) => [p.key, p.default]));
  return tpl.build(params);
}

export async function nl2dsl(query: string, cfg: LLMConfig): Promise<StrategyDSL> {
  const def = PROVIDER_DEFAULTS[cfg.provider];
  const baseUrl = (cfg.baseUrl || def.baseUrl).replace(/\/$/, '');
  const model = cfg.model || def.model;
  if (!baseUrl || !model || !cfg.apiKey) {
    const fb = fallbackByKeyword(query);
    if (fb) return fb;
    throw new Error('LLM 配置不完整，且关键词回退也未命中');
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' as const },
  };

  let raw = '';
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    raw = j.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    // OpenAI/DeepSeek 兼容；某些 provider 不支持 response_format，退化重试一次
    const r2 = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ ...body, response_format: undefined }),
    });
    if (!r2.ok) throw new Error(`LLM ${r2.status}: ${(await r2.text()).slice(0, 200)} / firstErr=${(e as Error).message}`);
    const j2 = await r2.json();
    raw = j2.choices?.[0]?.message?.content ?? '';
  }

  const json = extractJSON(raw);
  if (!json) throw new Error(`LLM 未返回 JSON: ${raw.slice(0, 200)}`);
  let parsed: StrategyDSL;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`JSON 解析失败: ${(e as Error).message} / ${json.slice(0, 200)}`);
  }
  // 最小校验
  if (!parsed.entry || !parsed.exit) throw new Error('DSL 缺少 entry/exit');
  if (!parsed.name) parsed.name = '自然语言策略';
  if (!parsed.universe?.length) parsed.universe = ['all'];
  if (!parsed.capital) parsed.capital = 100000;
  if (!parsed.size) parsed.size = 'equal_weight';
  if (!parsed.max_positions) parsed.max_positions = 5;
  return parsed;
}
