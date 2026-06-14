/**
 * 因子计算器 — 输入 K 线序列，输出每个 bar 的因子上下文
 * 内置 30+ 因子，支持 _prev 后缀访问前一根 K 的同名因子
 */

import type { FactorContext } from './dsl';

export interface Bar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // 手
  amount?: number; // 元
  changePct?: number; // 涨跌幅 %
  turnover?: number; // 换手率 %
  isZT?: boolean; // 是否涨停
  consecZT?: number; // 连板天数
}

const sma = (arr: number[], n: number, end: number): number => {
  const start = Math.max(0, end - n + 1);
  if (end < n - 1) return NaN;
  let sum = 0;
  for (let i = start; i <= end; i++) sum += arr[i];
  return sum / (end - start + 1);
};

const ema = (arr: number[], n: number): number[] => {
  const k = 2 / (n + 1);
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) out.push(arr[i]);
    else out.push(arr[i] * k + out[i - 1] * (1 - k));
  }
  return out;
};

const rsi = (closes: number[], n: number): number[] => {
  const out: number[] = [NaN];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = Math.max(d, 0);
    const loss = Math.max(-d, 0);
    if (i <= n) {
      avgGain += gain / n;
      avgLoss += loss / n;
      out.push(i === n ? (avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)) : NaN);
    } else {
      avgGain = (avgGain * (n - 1) + gain) / n;
      avgLoss = (avgLoss * (n - 1) + loss) / n;
      out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
  }
  return out;
};

const macd = (closes: number[], fast = 12, slow = 26, signal = 9) => {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const dif = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const dea = ema(dif, signal);
  const hist = dif.map((d, i) => (d - dea[i]) * 2);
  return { dif, dea, hist };
};

const kdj = (highs: number[], lows: number[], closes: number[], n = 9) => {
  const k: number[] = [], d: number[] = [], j: number[] = [];
  let lastK = 50, lastD = 50;
  for (let i = 0; i < closes.length; i++) {
    const start = Math.max(0, i - n + 1);
    let hi = -Infinity, lo = Infinity;
    for (let p = start; p <= i; p++) {
      if (highs[p] > hi) hi = highs[p];
      if (lows[p] < lo) lo = lows[p];
    }
    const rsv = hi === lo ? 50 : ((closes[i] - lo) / (hi - lo)) * 100;
    lastK = (2 / 3) * lastK + (1 / 3) * rsv;
    lastD = (2 / 3) * lastD + (1 / 3) * lastK;
    k.push(lastK);
    d.push(lastD);
    j.push(3 * lastK - 2 * lastD);
  }
  return { k, d, j };
};

const bbands = (closes: number[], n = 20, mult = 2) => {
  const middle: number[] = [], upper: number[] = [], lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) { middle.push(NaN); upper.push(NaN); lower.push(NaN); continue; }
    let sum = 0;
    for (let p = i - n + 1; p <= i; p++) sum += closes[p];
    const m = sum / n;
    let v = 0;
    for (let p = i - n + 1; p <= i; p++) v += (closes[p] - m) ** 2;
    const std = Math.sqrt(v / n);
    middle.push(m); upper.push(m + mult * std); lower.push(m - mult * std);
  }
  return { middle, upper, lower };
};

/** 主入口：给一段 K 线，返回每个 bar 的 FactorContext */
export function calcFactors(bars: Bar[]): FactorContext[] {
  const closes = bars.map((b) => b.close);
  const opens = bars.map((b) => b.open);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const vols = bars.map((b) => b.volume);

  const ma5 = closes.map((_, i) => sma(closes, 5, i));
  const ma10 = closes.map((_, i) => sma(closes, 10, i));
  const ma20 = closes.map((_, i) => sma(closes, 20, i));
  const ma60 = closes.map((_, i) => sma(closes, 60, i));
  const maVol5 = vols.map((_, i) => sma(vols, 5, i));
  const maVol10 = vols.map((_, i) => sma(vols, 10, i));

  const rsi14 = rsi(closes, 14);
  const macdR = macd(closes);
  const kdjR = kdj(highs, lows, closes);
  const bb = bbands(closes);

  return bars.map((b, i) => {
    const ctx: FactorContext = {
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      amount: b.amount ?? 0,
      change_pct: b.changePct ?? (i > 0 ? (b.close / closes[i - 1] - 1) : 0),
      turnover: b.turnover ?? 0,
      is_zt: b.isZT ? 1 : 0,
      is_zt_yesterday: i > 0 && bars[i - 1].isZT ? 1 : 0,
      consec_zt_days: b.consecZT ?? 0,
      ma5: ma5[i], ma10: ma10[i], ma20: ma20[i], ma60: ma60[i],
      ma_vol_5: maVol5[i], ma_vol_10: maVol10[i],
      rsi_14: rsi14[i],
      macd_dif: macdR.dif[i], macd_dea: macdR.dea[i], macd_hist: macdR.hist[i],
      kdj_k: kdjR.k[i], kdj_d: kdjR.d[i], kdj_j: kdjR.j[i],
      bb_upper: bb.upper[i], bb_middle: bb.middle[i], bb_lower: bb.lower[i],
      // 5/10/20 日涨跌幅
      close_pct_5d: i >= 5 ? b.close / closes[i - 5] - 1 : 0,
      close_pct_10d: i >= 10 ? b.close / closes[i - 10] - 1 : 0,
      close_pct_20d: i >= 20 ? b.close / closes[i - 20] - 1 : 0,
      // 突破因子：N日最高/最低
      high_5: i >= 4 ? Math.max(...highs.slice(i - 4, i + 1)) : highs[i],
      high_20: i >= 19 ? Math.max(...highs.slice(i - 19, i + 1)) : highs[i],
      high_60: i >= 59 ? Math.max(...highs.slice(i - 59, i + 1)) : highs[i],
      low_5: i >= 4 ? Math.min(...lows.slice(i - 4, i + 1)) : lows[i],
      low_20: i >= 19 ? Math.min(...lows.slice(i - 19, i + 1)) : lows[i],
    };
    // _prev 后缀：上一根 bar 的同名因子（金叉/死叉判定必备）
    if (i > 0) {
      ctx.ma5_prev = ma5[i - 1];
      ctx.ma10_prev = ma10[i - 1];
      ctx.ma20_prev = ma20[i - 1];
      ctx.macd_dif_prev = macdR.dif[i - 1];
      ctx.macd_dea_prev = macdR.dea[i - 1];
      ctx.kdj_k_prev = kdjR.k[i - 1];
      ctx.kdj_d_prev = kdjR.d[i - 1];
      ctx.rsi_14_prev = rsi14[i - 1];
      ctx.close_prev = closes[i - 1];
    }
    return ctx;
  });
}
