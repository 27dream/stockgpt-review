/**
 * 策略 DSL（Domain Specific Language）
 * 设计目标：JSON 可序列化、纯函数求值、内置 30+ 因子
 *
 * 表达式形式：
 *   - 字面量: 数字 / 字符串 / 布尔
 *   - 因子名: "close" | "ma5" | "rsi_14" | "volume" ...
 *   - 算术: "ma5 * 1.5" | "entry_price * 0.95"  （字符串中支持 +-*\/ 与因子）
 *   - 比较条件: { op: ">", left: "ma5", right: "ma20" }
 *   - 逻辑: { and: [...] } | { or: [...] } | { not: {...} }
 */

export type Comparator = '>' | '>=' | '<' | '<=' | '==' | '!=';
export type CondLeaf = { op: Comparator; left: string | number; right: string | number };
export type CondNode =
  | CondLeaf
  | { and: CondNode[] }
  | { or: CondNode[] }
  | { not: CondNode };

export interface StrategyDSL {
  name: string;
  desc?: string;
  universe?: string[]; // ["sh000300"] 沪深300 / ["all"] 全A / 自选股代码
  entry: CondNode; // 买入条件
  exit: CondNode; // 卖出条件
  size?: 'equal_weight' | 'fixed_value' | 'kelly';
  max_positions?: number; // 最大持仓数
  capital?: number; // 初始资金
  position_size?: number; // 单仓金额（fixed_value 用）
  stop_loss?: number; // 止损 % (e.g. 0.05)
  take_profit?: number; // 止盈 %
  hold_days?: number; // 强制平仓天数
}

/**
 * 因子上下文：策略执行时所有可用的变量
 * key 形如：close / ma5 / ma20 / rsi_14 / macd / volume / ma_vol_5 / entry_price / hold_days ...
 */
export type FactorContext = Record<string, number>;

/**
 * 解析"算术字符串"或"因子名"为数值
 * 支持: "ma5" / "1.5" / "ma5 * 1.5" / "entry_price * 0.95" / "close - low"
 */
export function evalExpr(expr: string | number, ctx: FactorContext): number {
  if (typeof expr === 'number') return expr;
  const s = String(expr).trim();

  // 纯数字
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);

  // 纯因子名
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
    const v = ctx[s];
    return Number.isFinite(v) ? v : NaN;
  }

  // 算术表达式 — 安全替换因子为数值后用 Function 求值
  // 仅允许 数字、运算符、空格、下划线、字母
  if (!/^[a-zA-Z0-9_+\-*/().\s]+$/.test(s)) return NaN;
  let replaced = s;
  // 用 \b 替换所有标识符为 ctx 值
  const ids = Array.from(new Set(s.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []));
  for (const id of ids) {
    const v = ctx[id];
    if (!Number.isFinite(v)) return NaN;
    replaced = replaced.replace(new RegExp(`\\b${id}\\b`, 'g'), String(v));
  }
  try {
    // eslint-disable-next-line no-new-func
    const r = Function(`"use strict";return (${replaced})`)();
    return Number.isFinite(r) ? r : NaN;
  } catch {
    return NaN;
  }
}

export function evalCond(node: CondNode, ctx: FactorContext): boolean {
  if ('and' in node) return node.and.every((c) => evalCond(c, ctx));
  if ('or' in node) return node.or.some((c) => evalCond(c, ctx));
  if ('not' in node) return !evalCond(node.not, ctx);
  // 叶子比较
  const l = evalExpr(node.left, ctx);
  const r = evalExpr(node.right, ctx);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return false;
  switch (node.op) {
    case '>': return l > r;
    case '>=': return l >= r;
    case '<': return l < r;
    case '<=': return l <= r;
    case '==': return l === r;
    case '!=': return l !== r;
  }
}

/** 把 DSL 转成人类可读的中文描述（UI 展示用） */
export function describeDSL(node: CondNode, depth = 0): string {
  if ('and' in node) return node.and.map((c) => describeDSL(c, depth + 1)).join(' 且 ');
  if ('or' in node) return '(' + node.or.map((c) => describeDSL(c, depth + 1)).join(' 或 ') + ')';
  if ('not' in node) return '非(' + describeDSL(node.not, depth + 1) + ')';
  return `${node.left} ${node.op} ${node.right}`;
}

/** 校验 DSL 合法性（粗校验） */
export function validateDSL(dsl: Partial<StrategyDSL>): { ok: boolean; error?: string } {
  if (!dsl.name) return { ok: false, error: '缺少 name' };
  if (!dsl.entry) return { ok: false, error: '缺少 entry 条件' };
  if (!dsl.exit) return { ok: false, error: '缺少 exit 条件' };
  return { ok: true };
}
