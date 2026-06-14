/**
 * 10 个内置策略模板（A1）
 * 用户在 UI 选模板 → 点几个参数 → 立刻可回测/盯盘
 */

import type { StrategyDSL } from './dsl';

export interface Template {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  category: '趋势' | '反转' | '突破' | '量价' | '涨停板';
  build: (params: Record<string, number>) => StrategyDSL;
  paramSpec: { key: string; label: string; default: number; min?: number; max?: number; step?: number }[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'ma_golden_cross',
    name: 'MA 金叉',
    emoji: '📈',
    desc: '5日均线上穿20日均线买入，跌破止损',
    category: '趋势',
    paramSpec: [
      { key: 'fast', label: '短均线', default: 5, min: 3, max: 30 },
      { key: 'slow', label: '长均线', default: 20, min: 10, max: 60 },
      { key: 'stop', label: '止损%', default: 0.05, min: 0.02, max: 0.2, step: 0.01 },
    ],
    build: ({ fast, slow, stop }) => ({
      name: `MA${fast}/${slow} 金叉`,
      desc: `${fast}日均线上穿${slow}日均线买入`,
      entry: {
        and: [
          { op: '>', left: `ma${fast}`, right: `ma${slow}` },
          { op: '<=', left: `ma${fast}_prev`, right: `ma${slow}_prev` },
        ],
      },
      exit: {
        or: [
          { op: '<', left: `ma${fast}`, right: `ma${slow}` },
          { op: '<', left: 'close', right: `entry_price * ${1 - stop}` },
        ],
      },
      stop_loss: stop,
    }),
  },
  {
    id: 'macd_cross',
    name: 'MACD 金叉',
    emoji: '🌊',
    desc: 'DIF 上穿 DEA 买入，下穿卖出',
    category: '趋势',
    paramSpec: [
      { key: 'stop', label: '止损%', default: 0.06, min: 0.02, max: 0.2, step: 0.01 },
      { key: 'profit', label: '止盈%', default: 0.15, min: 0.05, max: 0.5, step: 0.01 },
    ],
    build: ({ stop, profit }) => ({
      name: 'MACD 金叉',
      entry: {
        and: [
          { op: '>', left: 'macd_dif', right: 'macd_dea' },
          { op: '<=', left: 'macd_dif_prev', right: 'macd_dea_prev' },
        ],
      },
      exit: {
        or: [
          { op: '<', left: 'macd_dif', right: 'macd_dea' },
          { op: '<', left: 'close', right: `entry_price * ${1 - stop}` },
          { op: '>', left: 'close', right: `entry_price * ${1 + profit}` },
        ],
      },
      stop_loss: stop,
      take_profit: profit,
    }),
  },
  {
    id: 'rsi_oversold',
    name: 'RSI 超卖反弹',
    emoji: '🔄',
    desc: 'RSI<30 超卖反弹，>70 卖出',
    category: '反转',
    paramSpec: [
      { key: 'rsiBuy', label: 'RSI买入阈值', default: 30, min: 10, max: 40 },
      { key: 'rsiSell', label: 'RSI卖出阈值', default: 70, min: 60, max: 90 },
    ],
    build: ({ rsiBuy, rsiSell }) => ({
      name: `RSI 超卖(${rsiBuy}/${rsiSell})`,
      entry: { op: '<', left: 'rsi_14', right: rsiBuy },
      exit: { op: '>', left: 'rsi_14', right: rsiSell },
    }),
  },
  {
    id: 'kdj_cross',
    name: 'KDJ 金叉',
    emoji: '🎯',
    desc: 'K 上穿 D 且都<50 买入',
    category: '反转',
    paramSpec: [
      { key: 'stop', label: '止损%', default: 0.05, min: 0.02, max: 0.2, step: 0.01 },
    ],
    build: ({ stop }) => ({
      name: 'KDJ 金叉',
      entry: {
        and: [
          { op: '>', left: 'kdj_k', right: 'kdj_d' },
          { op: '<=', left: 'kdj_k_prev', right: 'kdj_d_prev' },
          { op: '<', left: 'kdj_k', right: 50 },
        ],
      },
      exit: { op: '<', left: 'kdj_k', right: 'kdj_d' },
      stop_loss: stop,
    }),
  },
  {
    id: 'breakout_high',
    name: '20日新高突破',
    emoji: '🚀',
    desc: '突破20日最高价 + 放量买入',
    category: '突破',
    paramSpec: [
      { key: 'lookback', label: '回看天数', default: 20, min: 5, max: 60 },
      { key: 'volMul', label: '量比阈值', default: 1.5, min: 1, max: 5, step: 0.1 },
    ],
    build: ({ lookback, volMul }) => ({
      name: `${lookback}日突破`,
      entry: {
        and: [
          { op: '>', left: 'close', right: `high_${lookback}` },
          { op: '>', left: 'volume', right: `ma_vol_5 * ${volMul}` },
        ],
      },
      exit: { op: '<', left: 'close', right: 'ma20' },
    }),
  },
  {
    id: 'pullback_strong',
    name: '强势股回调',
    emoji: '💎',
    desc: '5日涨幅>15% + 回踩20日线 + RSI<60',
    category: '反转',
    paramSpec: [
      { key: 'pct5d', label: '5日涨幅', default: 0.15, min: 0.05, max: 0.5, step: 0.01 },
      { key: 'rsiMax', label: 'RSI上限', default: 60, min: 40, max: 80 },
    ],
    build: ({ pct5d, rsiMax }) => ({
      name: '强势股回调',
      entry: {
        and: [
          { op: '>', left: 'close_pct_5d', right: pct5d },
          { op: '<=', left: 'close', right: 'ma20 * 1.05' },
          { op: '>=', left: 'close', right: 'ma20 * 0.95' },
          { op: '<', left: 'rsi_14', right: rsiMax },
        ],
      },
      exit: {
        or: [
          { op: '<', left: 'close', right: 'ma20' },
          { op: '<', left: 'close', right: 'entry_price * 0.95' },
          { op: '>', left: 'close', right: 'entry_price * 1.10' },
        ],
      },
      stop_loss: 0.05,
      take_profit: 0.10,
    }),
  },
  {
    id: 'volume_surge',
    name: '放量上涨',
    emoji: '🔥',
    desc: '量能>5日均量2倍 + 涨幅>3%',
    category: '量价',
    paramSpec: [
      { key: 'volMul', label: '量比', default: 2, min: 1.2, max: 5, step: 0.1 },
      { key: 'pct', label: '涨幅%', default: 0.03, min: 0.01, max: 0.1, step: 0.005 },
    ],
    build: ({ volMul, pct }) => ({
      name: '放量上涨',
      entry: {
        and: [
          { op: '>', left: 'volume', right: `ma_vol_5 * ${volMul}` },
          { op: '>', left: 'change_pct', right: pct },
        ],
      },
      exit: { op: '<', left: 'close', right: 'ma5' },
    }),
  },
  {
    id: 'first_zt',
    name: '首板涨停',
    emoji: '🟥',
    desc: '昨日涨停 + 今日开盘买入次日卖出（T+1）',
    category: '涨停板',
    paramSpec: [],
    build: () => ({
      name: '首板涨停',
      entry: { op: '==', left: 'is_zt_yesterday', right: 1 },
      exit: { op: '==', left: 'hold_days', right: 1 },
      hold_days: 1,
    }),
  },
  {
    id: 'consec_zt',
    name: '连板接力',
    emoji: '🌟',
    desc: '连续 N 板（含）以上的强势股',
    category: '涨停板',
    paramSpec: [
      { key: 'minBoards', label: '最少连板', default: 2, min: 2, max: 5 },
    ],
    build: ({ minBoards }) => ({
      name: `${minBoards}+ 连板接力`,
      entry: { op: '>=', left: 'consec_zt_days', right: minBoards },
      exit: {
        or: [
          { op: '<', left: 'change_pct', right: 0 },
          { op: '<', left: 'close', right: 'entry_price * 0.93' },
        ],
      },
      stop_loss: 0.07,
    }),
  },
  {
    id: 'bb_lower_bounce',
    name: '布林下轨反弹',
    emoji: '🎈',
    desc: '收盘价触及布林带下轨反弹',
    category: '反转',
    paramSpec: [
      { key: 'tolerance', label: '触线容差%', default: 0.02, min: 0, max: 0.05, step: 0.005 },
    ],
    build: ({ tolerance }) => ({
      name: '布林下轨反弹',
      entry: {
        and: [
          { op: '<=', left: 'close', right: `bb_lower * ${1 + tolerance}` },
          { op: '>', left: 'close', right: 'open' },
        ],
      },
      exit: {
        or: [
          { op: '>', left: 'close', right: 'bb_middle' },
          { op: '<', left: 'close', right: 'entry_price * 0.95' },
        ],
      },
    }),
  },
];
