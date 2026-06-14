/**
 * 浏览器回测引擎（B1）
 * 输入：DSL 策略 + 多只股票的 K 线
 * 输出：交易明细 / 净值曲线 / 胜率 / 最大回撤 / 夏普
 */

import type { StrategyDSL, FactorContext } from './dsl';
import { evalCond } from './dsl';
import { calcFactors, type Bar } from './factors';

export interface Trade {
  code: string;
  name?: string;
  buyDate: string;
  buyPrice: number;
  sellDate: string;
  sellPrice: number;
  pnlPct: number; // 单笔收益率
  pnl: number; // 单笔盈亏（按 1 手计）
  reason: 'signal' | 'stop_loss' | 'take_profit' | 'hold_days' | 'end';
  holdDays: number;
}

export interface BacktestResult {
  trades: Trade[];
  equity: { date: string; value: number }[]; // 日级净值曲线
  winRate: number; // 胜率
  totalReturn: number; // 累计收益率
  annualReturn: number;
  maxDrawdown: number; // 最大回撤
  sharpe: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

export interface StockData {
  code: string;
  name?: string;
  bars: Bar[];
}

export function backtest(dsl: StrategyDSL, stocks: StockData[], opts?: {
  startCapital?: number;
  commission?: number; // 手续费率（双边）
}): BacktestResult {
  const startCapital = opts?.startCapital ?? 100000;
  const commission = opts?.commission ?? 0.001; // 0.1% 双边
  const trades: Trade[] = [];

  // 单股回测，所有 trade 汇总
  for (const stock of stocks) {
    if (stock.bars.length < 60) continue;
    const factors = calcFactors(stock.bars);
    let position: { buyDate: string; buyPrice: number; buyIdx: number } | null = null;

    for (let i = 0; i < stock.bars.length; i++) {
      const bar = stock.bars[i];
      const ctx = factors[i];
      if (!position) {
        // 寻找买点
        if (evalCond(dsl.entry, ctx)) {
          // 次日开盘买入（避免未来函数）
          if (i + 1 < stock.bars.length) {
            const nextBar = stock.bars[i + 1];
            position = { buyDate: nextBar.date, buyPrice: nextBar.open, buyIdx: i + 1 };
          }
        }
      } else {
        // 寻找卖点
        const holdDays = i - position.buyIdx;
        const ctxWithEntry: FactorContext = {
          ...ctx,
          entry_price: position.buyPrice,
          hold_days: holdDays,
          pnl_pct: bar.close / position.buyPrice - 1,
        };
        let shouldSell = false;
        let reason: Trade['reason'] = 'signal';

        // 强制平仓优先级最高
        if (dsl.hold_days && holdDays >= dsl.hold_days) {
          shouldSell = true; reason = 'hold_days';
        } else if (dsl.stop_loss && bar.low / position.buyPrice - 1 <= -dsl.stop_loss) {
          shouldSell = true; reason = 'stop_loss';
        } else if (dsl.take_profit && bar.high / position.buyPrice - 1 >= dsl.take_profit) {
          shouldSell = true; reason = 'take_profit';
        } else if (evalCond(dsl.exit, ctxWithEntry)) {
          shouldSell = true; reason = 'signal';
        }

        if (shouldSell) {
          const sellPrice = reason === 'stop_loss' ? position.buyPrice * (1 - (dsl.stop_loss || 0))
                          : reason === 'take_profit' ? position.buyPrice * (1 + (dsl.take_profit || 0))
                          : bar.close;
          const pnlPct = sellPrice / position.buyPrice - 1 - commission;
          trades.push({
            code: stock.code,
            name: stock.name,
            buyDate: position.buyDate,
            buyPrice: position.buyPrice,
            sellDate: bar.date,
            sellPrice,
            pnlPct,
            pnl: pnlPct * position.buyPrice * 100,
            reason,
            holdDays,
          });
          position = null;
        }
      }
    }
    // 收盘强平
    if (position) {
      const lastBar = stock.bars[stock.bars.length - 1];
      const pnlPct = lastBar.close / position.buyPrice - 1 - commission;
      trades.push({
        code: stock.code,
        name: stock.name,
        buyDate: position.buyDate,
        buyPrice: position.buyPrice,
        sellDate: lastBar.date,
        sellPrice: lastBar.close,
        pnlPct,
        pnl: pnlPct * position.buyPrice * 100,
        reason: 'end',
        holdDays: stock.bars.length - 1 - position.buyIdx,
      });
    }
  }

  // 净值曲线（按 trade 串行模拟）
  trades.sort((a, b) => a.buyDate.localeCompare(b.buyDate));
  let equity = startCapital;
  const equityCurve: { date: string; value: number }[] = [{ date: 'start', value: startCapital }];
  for (const t of trades) {
    equity *= 1 + t.pnlPct;
    equityCurve.push({ date: t.sellDate, value: equity });
  }

  // 指标
  const wins = trades.filter((t) => t.pnlPct > 0);
  const losses = trades.filter((t) => t.pnlPct <= 0);
  const winRate = trades.length ? wins.length / trades.length : 0;
  const totalReturn = equity / startCapital - 1;

  // 年化（按交易期跨度估算）
  const days = trades.length > 0
    ? (new Date(trades[trades.length - 1].sellDate).getTime() - new Date(trades[0].buyDate).getTime()) / 86400000
    : 1;
  const annualReturn = days > 0 ? Math.pow(1 + totalReturn, 365 / Math.max(days, 1)) - 1 : 0;

  // 最大回撤
  let peak = startCapital, maxDD = 0;
  for (const e of equityCurve) {
    if (e.value > peak) peak = e.value;
    const dd = (peak - e.value) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // 夏普比率（用每笔收益率作为 daily proxy）
  const rets = trades.map((t) => t.pnlPct);
  const meanRet = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const stdRet = rets.length
    ? Math.sqrt(rets.reduce((s, r) => s + (r - meanRet) ** 2, 0) / rets.length)
    : 0;
  const sharpe = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(252 / Math.max(days / Math.max(trades.length, 1), 1)) : 0;

  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
  const profitFactor = losses.length && avgLoss < 0
    ? Math.abs(wins.reduce((s, t) => s + t.pnlPct, 0) / losses.reduce((s, t) => s + t.pnlPct, 0))
    : wins.length ? Infinity : 0;

  return {
    trades,
    equity: equityCurve,
    winRate,
    totalReturn,
    annualReturn,
    maxDrawdown: maxDD,
    sharpe,
    totalTrades: trades.length,
    avgWin,
    avgLoss,
    profitFactor,
  };
}
