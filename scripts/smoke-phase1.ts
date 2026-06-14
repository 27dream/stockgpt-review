/**
 * Phase 1 烟雾测试：跑一次回测看数字合不合理
 */
import { TEMPLATES } from '../src/lib/strategies';
import { backtest, type StockData } from '../src/lib/backtest';

async function main() {
  // 拉数据
  const codes = ['sh600519', 'sz000858', 'sz000001', 'sh601318', 'sh600036'];
  const r = await fetch(`http://localhost:3000/api/kline-batch?codes=${codes.join(',')}&days=120`);
  const json = await r.json();
  const stocks: StockData[] = Object.entries(json.data).map(([code, bars]: any) => ({ code, bars }));
  console.log(`拉到 ${stocks.length} 只股票，每只 ${stocks[0].bars.length} 根K`);

  // 跑 3 个策略对比
  for (const tplId of ['ma_golden_cross', 'macd_cross', 'breakout_high']) {
    const tpl = TEMPLATES.find((t) => t.id === tplId)!;
    const params = Object.fromEntries(tpl.paramSpec.map((p) => [p.key, p.default]));
    const dsl = tpl.build(params);
    const result = backtest(dsl, stocks);
    console.log(`\n=== ${tpl.emoji} ${tpl.name} ===`);
    console.log(`  交易: ${result.totalTrades} 胜率: ${(result.winRate * 100).toFixed(1)}%`);
    console.log(`  累计收益: ${(result.totalReturn * 100).toFixed(2)}%  最大回撤: ${(result.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`  夏普: ${result.sharpe.toFixed(2)}  盈亏比: ${result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)}`);
    if (result.trades.length) {
      const t = result.trades[0];
      console.log(`  示例交易: ${t.code} ${t.buyDate}@${t.buyPrice.toFixed(2)} → ${t.sellDate}@${t.sellPrice.toFixed(2)} = ${(t.pnlPct * 100).toFixed(2)}% (${t.reason})`);
    }
  }
}
main().catch(console.error);
