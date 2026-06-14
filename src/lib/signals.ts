/**
 * 16 种信号检测器（实时盯盘用）
 * 输入：当前 quote + 历史 K 线 + 因子上下文
 * 输出：触发的信号列表
 *
 * 类别：价格5 / 量能3 / 技术4 / 涨停板4
 */

import type { FactorContext } from './dsl';
import { calcFactors, type Bar } from './factors';

export type SignalLevel = 'info' | 'warn' | 'strong';
export type SignalCategory = 'price' | 'volume' | 'tech' | 'limit';

export interface Signal {
  id: string; // 信号唯一 ID（用于去重）
  code: string;
  name?: string;
  type: string; // 16 种信号 key
  label: string; // 中文标签
  category: SignalCategory;
  level: SignalLevel;
  emoji: string;
  msg: string; // 推送文案
  price?: number;
  changePct?: number;
  ts: number; // 触发时间戳（ms）
}

export interface SignalConfig {
  enabled: Record<string, boolean>; // type -> on/off
  threshold?: Record<string, number>; // type -> 阈值（如涨幅%）
}

export const DEFAULT_CONFIG: SignalConfig = {
  enabled: {
    price_surge: true, price_drop: true, price_break_high: true, price_break_low: true, price_cross_ma: true,
    volume_surge: true, volume_shrink: true, volume_amplify: true,
    tech_macd_cross: true, tech_kdj_cross: true, tech_rsi_oversold: true, tech_rsi_overbought: true,
    limit_up: true, limit_break: true, limit_seal: true, limit_consec: true,
  },
  threshold: {
    price_surge: 0.05, price_drop: -0.05, // ±5%
    volume_surge: 2, volume_shrink: 0.5,
    tech_rsi_oversold: 30, tech_rsi_overbought: 70,
  },
};

export const SIGNAL_META: Record<string, { label: string; emoji: string; level: SignalLevel; category: SignalCategory }> = {
  price_surge: { label: '快速拉升', emoji: '🚀', level: 'strong', category: 'price' },
  price_drop: { label: '快速跳水', emoji: '📉', level: 'warn', category: 'price' },
  price_break_high: { label: '突破新高', emoji: '⬆️', level: 'strong', category: 'price' },
  price_break_low: { label: '跌破新低', emoji: '⬇️', level: 'warn', category: 'price' },
  price_cross_ma: { label: '上穿MA20', emoji: '📈', level: 'info', category: 'price' },
  volume_surge: { label: '异常放量', emoji: '🔥', level: 'strong', category: 'volume' },
  volume_shrink: { label: '极度缩量', emoji: '🧊', level: 'info', category: 'volume' },
  volume_amplify: { label: '量价齐升', emoji: '💥', level: 'strong', category: 'volume' },
  tech_macd_cross: { label: 'MACD金叉', emoji: '🌊', level: 'strong', category: 'tech' },
  tech_kdj_cross: { label: 'KDJ金叉', emoji: '🎯', level: 'info', category: 'tech' },
  tech_rsi_oversold: { label: 'RSI超卖', emoji: '🔄', level: 'info', category: 'tech' },
  tech_rsi_overbought: { label: 'RSI超买', emoji: '⚠️', level: 'warn', category: 'tech' },
  limit_up: { label: '触及涨停', emoji: '🟥', level: 'strong', category: 'limit' },
  limit_break: { label: '炸板', emoji: '💔', level: 'warn', category: 'limit' },
  limit_seal: { label: '封板', emoji: '🔒', level: 'strong', category: 'limit' },
  limit_consec: { label: '连板加速', emoji: '🌟', level: 'strong', category: 'limit' },
};

interface DetectInput {
  code: string;
  name?: string;
  bars: Bar[]; // 含今天的日 K（最后一根=今天）
  intraday?: { price: number; changePct: number; volume: number; sealFund?: number; isLimit?: boolean; isBreak?: boolean };
  prevSignals?: Set<string>; // 已触发过的信号，用于去重
  config?: SignalConfig;
}

/** 主检测：返回新触发的信号（已去过重） */
export function detectSignals(input: DetectInput): Signal[] {
  const { code, name, bars, intraday, prevSignals, config = DEFAULT_CONFIG } = input;
  if (bars.length < 20) return [];
  const factors = calcFactors(bars);
  const ctx = factors[factors.length - 1];
  const ctxPrev = factors[factors.length - 2];
  const todayBar = bars[bars.length - 1];
  const yBar = bars[bars.length - 2];

  const out: Signal[] = [];
  const now = Date.now();
  const push = (type: string, msg: string, extra: Partial<Signal> = {}) => {
    if (!config.enabled[type]) return;
    const meta = SIGNAL_META[type];
    const id = `${code}_${type}_${todayBar.date}`;
    if (prevSignals?.has(id)) return;
    out.push({
      id, code, name, type,
      label: meta.label, emoji: meta.emoji, level: meta.level, category: meta.category,
      msg, ts: now, ...extra,
    });
  };

  const price = intraday?.price ?? todayBar.close;
  const changePct = intraday?.changePct ?? ctx.change_pct;
  const volume = intraday?.volume ?? todayBar.volume;

  // === 价格类 5 ===
  if (changePct >= (config.threshold?.price_surge ?? 0.05)) {
    push('price_surge', `${name || code} 快速拉升 ${(changePct * 100).toFixed(2)}% → ${price.toFixed(2)}`, { price, changePct });
  }
  if (changePct <= (config.threshold?.price_drop ?? -0.05)) {
    push('price_drop', `${name || code} 快速跳水 ${(changePct * 100).toFixed(2)}% → ${price.toFixed(2)}`, { price, changePct });
  }
  if (price > ctx.high_20 && yBar.close <= ctx.high_20) {
    push('price_break_high', `${name || code} 突破20日新高 → ${price.toFixed(2)}`, { price });
  }
  if (price < ctx.low_20 && yBar.close >= ctx.low_20) {
    push('price_break_low', `${name || code} 跌破20日新低 → ${price.toFixed(2)}`, { price });
  }
  if (ctxPrev && yBar.close < ctxPrev.ma20 && price > ctx.ma20) {
    push('price_cross_ma', `${name || code} 上穿MA20 → ${price.toFixed(2)}`, { price });
  }

  // === 量能类 3 ===
  if (volume > ctx.ma_vol_5 * (config.threshold?.volume_surge ?? 2)) {
    push('volume_surge', `${name || code} 异常放量（${(volume / ctx.ma_vol_5).toFixed(1)}倍5日均量）`, { price });
  }
  if (volume < ctx.ma_vol_5 * (config.threshold?.volume_shrink ?? 0.5)) {
    push('volume_shrink', `${name || code} 极度缩量（${(volume / ctx.ma_vol_5).toFixed(2)}倍）`, { price });
  }
  if (changePct > 0.02 && volume > ctx.ma_vol_5 * 1.5) {
    push('volume_amplify', `${name || code} 量价齐升 ${(changePct * 100).toFixed(2)}%`, { price, changePct });
  }

  // === 技术类 4 ===
  if (ctxPrev && ctxPrev.macd_dif <= ctxPrev.macd_dea && ctx.macd_dif > ctx.macd_dea) {
    push('tech_macd_cross', `${name || code} MACD金叉`, { price });
  }
  if (ctxPrev && ctxPrev.kdj_k <= ctxPrev.kdj_d && ctx.kdj_k > ctx.kdj_d && ctx.kdj_k < 50) {
    push('tech_kdj_cross', `${name || code} KDJ低位金叉`, { price });
  }
  if (ctx.rsi_14 < (config.threshold?.tech_rsi_oversold ?? 30)) {
    push('tech_rsi_oversold', `${name || code} RSI超卖（${ctx.rsi_14.toFixed(1)}）`, { price });
  }
  if (ctx.rsi_14 > (config.threshold?.tech_rsi_overbought ?? 70)) {
    push('tech_rsi_overbought', `${name || code} RSI超买（${ctx.rsi_14.toFixed(1)}）`, { price });
  }

  // === 涨停板类 4 ===
  const isZT = intraday?.isLimit ?? (changePct >= 0.0995); // 10cm
  const isBreak = intraday?.isBreak ?? false;
  if (isZT) {
    push('limit_up', `${name || code} 🟥 涨停 ${price.toFixed(2)}`, { price, changePct });
  }
  if (isBreak) {
    push('limit_break', `${name || code} 💔 炸板 → ${price.toFixed(2)}`, { price, changePct });
  }
  if (intraday?.sealFund && intraday.sealFund > 1e8) {
    push('limit_seal', `${name || code} 封单 ${(intraday.sealFund / 1e8).toFixed(2)}亿`, { price });
  }
  if ((todayBar.consecZT ?? 0) >= 2 && isZT) {
    push('limit_consec', `${name || code} 🌟 ${todayBar.consecZT}连板`, { price });
  }

  return out;
}
