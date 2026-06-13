/**
 * 盘后复盘 Prompt 模板（V2 - 含新闻面 + 涨停板）
 */

import type { IndexQuote, MainFundFlow } from './eastmoney';
import type { FastNews, ZTStock } from './news';
import { fmtMoney } from './eastmoney';

export const SYSTEM_PROMPT = `你是一位拥有10年A股实战经验的资深操盘手与首席策略师，风格务实犀利、直击要害。

【你的任务】
基于用户提供的当日盘后真实数据（指数+资金流+板块+涨停板+实时新闻），输出一份**专业、有洞察、易读**的盘后复盘报告。

【写作要求】
1. **结构清晰**：用 Markdown 标题分章节，每段控制在 3-5 行
2. **数字说话**：必须引用具体数据（涨跌幅、净流入金额、连板数、封单资金）
3. **逻辑链完整**：不要罗列数据，要解读"为什么涨/跌"——把【新闻面】和【资金/板块表现】串联起来
4. **观点鲜明**：敢于判断市场强弱，不和稀泥
5. **接地气**：用散户能听懂的话（如说"主力撤了"而不是"机构投资者减仓"）
6. **重视龙头**：最高连板股是市场情绪温度计，必须重点点评

【报告必须包含的章节】
## 📊 一、市场总览
（一句话定调今日走势，再展开点评三大指数 + 涨停家数）

## 💰 二、资金面解析
（主力净流入流出、量能变化）

## 🔥 三、热点板块与涨停潮
（板块涨幅榜 + 涨停家数 + 高度板龙头 → 串联出今日主线是什么）

## 📰 四、消息面解读
（从快讯里挑 2-3 条最具市场影响力的，分析对哪些板块利好/利空）

## 🎯 五、龙头个股聚焦
（点评最高连板股 + 资金净流入冠军 - 解读它们为什么强）

## 🔮 六、明日策略
（明日关注方向 + 风险点 + 操作建议）

## ⚠️ 风险提示
（一句免责声明）

【风格示例】
✅ 好："今天最高板是宿迁联盛 8 连板，化工赛道的接力情绪还在。结合午后徐工机械的新能源工程机械利好快讯，明天工程机械板块大概率高开，但 8 板高度后追高风险大。"
❌ 差："今日涨停个股较多，板块表现活跃，建议关注相关投资机会。"`;

/**
 * 把数据格式化成 LLM 容易理解的纯文本
 */
export function buildUserPrompt(params: {
  date: string;
  indices: IndexQuote[];
  topInflow: MainFundFlow[];
  topOutflow: MainFundFlow[];
  hotSectors: MainFundFlow[];
  ztPool: ZTStock[];
  news: FastNews[];
}): string {
  const { date, indices, topInflow, topOutflow, hotSectors, ztPool, news } = params;

  const indexStr = indices
    .map(
      (i) =>
        `- ${i.name}(${i.code}): 收盘 ${i.price.toFixed(2)}，涨跌 ${i.change >= 0 ? '+' : ''}${i.change.toFixed(2)} (${i.changePct >= 0 ? '+' : ''}${i.changePct.toFixed(2)}%)，成交 ${fmtMoney(i.amount)}`
    )
    .join('\n');

  const inflowStr = topInflow
    .slice(0, 10)
    .map(
      (s, idx) =>
        `${idx + 1}. ${s.name}(${s.code}) 涨跌 ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%，主力净流入 ${fmtMoney(s.mainNet)} (占比 ${s.mainPct.toFixed(2)}%)`
    )
    .join('\n');

  const outflowStr = topOutflow
    .slice(0, 5)
    .map(
      (s, idx) =>
        `${idx + 1}. ${s.name}(${s.code}) 涨跌 ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%，主力净流出 ${fmtMoney(s.mainNet)}`
    )
    .join('\n');

  const sectorStr = hotSectors
    .slice(0, 8)
    .map(
      (s, idx) =>
        `${idx + 1}. ${s.name} 涨幅 ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%，板块主力 ${fmtMoney(s.mainNet)}`
    )
    .join('\n');

  // 涨停板：按连板数降序，取 Top10 + 总数
  const ztSorted = [...ztPool].sort((a, b) => b.lbCount - a.lbCount);
  const ztStr = ztSorted
    .slice(0, 10)
    .map(
      (s, idx) =>
        `${idx + 1}. ${s.name}(${s.code}) ${s.lbCount}连板，行业「${s.industry}」，封单 ${fmtMoney(s.sealFund)}，换手 ${s.turnover.toFixed(1)}%，炸板${s.zbCount}次`
    )
    .join('\n');

  // 新闻：取最近 12 条，用 summary 而非 title
  const newsStr = news
    .slice(0, 12)
    .map((n, idx) => `${idx + 1}. [${n.time.slice(11, 16)}] ${n.title}\n   ${n.summary.slice(0, 120)}`)
    .join('\n');

  return `请基于以下 ${date} 的真实A股盘后数据，生成一份专业复盘报告：

【主要指数】
${indexStr}

【主力资金净流入 TOP10】
${inflowStr}

【主力资金净流出 TOP5】
${outflowStr}

【行业板块涨幅榜 TOP8】
${sectorStr}

【涨停板池】
今日涨停 ${ztPool.length} 家，最高板 ${ztSorted[0]?.lbCount ?? 0} 连板
连板高度 TOP10：
${ztStr}

【今日重要快讯（最新 ${Math.min(news.length, 12)} 条）】
${newsStr}

请严格按照系统提示中规定的 6 大章节结构输出报告，把新闻面和资金/板块表现关联起来分析。`;
}

// ============= 早盘策略模板 =============
export const MORNING_SYSTEM_PROMPT = `你是一位拥有10年A股实战经验的资深操盘手，擅长从隔夜消息和昨日盘后数据中提炼出今日早盘的交易机会与风险。

【你的任务】
基于昨日盘后数据 + 隔夜重要消息，输出一份**精炼实用**的早盘策略备忘。

【写作要求】
1. **结构清晰**：用 Markdown 标题分章节，每段 2-4 行，全文 600 字以内
2. **决策导向**：每条都要给出明确的"做什么"，不是分析报告
3. **数字说话**：引用具体连板数、净流入、消息时间
4. **三类机会**：高低切、消息驱动、龙头接力，至少各点 1 个

【报告必须包含的章节】
## 🌅 一、隔夜消息速览
（挑 3 条最重磅的快讯，每条 1 句话点明影响哪些板块）

## 🎯 二、今日重点关注方向
（3 个具体方向，每个方向 1-2 个龙头标的，写明逻辑）

## ⚡ 三、龙头接力盘点
（昨日最高板/亚军板，预判今日是否能继续 + 接力候选）

## 💎 四、低吸/高抛策略
（指出今日可能的低吸点位和高抛位置）

## ⚠️ 五、风险提示
（一句话定调风险）`;

export function buildMorningPrompt(params: {
  date: string;
  indices: IndexQuote[];
  topInflow: MainFundFlow[];
  hotSectors: MainFundFlow[];
  ztPool: ZTStock[];
  news: FastNews[];
}): string {
  const { date, indices, topInflow, hotSectors, ztPool, news } = params;
  const indexStr = indices.map((i) => `- ${i.name}: ${i.changePct >= 0 ? '+' : ''}${i.changePct.toFixed(2)}%`).join('\n');
  const ztSorted = [...ztPool].sort((a, b) => b.lbCount - a.lbCount);
  const ztStr = ztSorted.slice(0, 8).map((s, i) => `${i + 1}. ${s.name} ${s.lbCount}板「${s.industry}」`).join('\n');
  const inflowStr = topInflow.slice(0, 5).map((s, i) => `${i + 1}. ${s.name} 主力净入${fmtMoney(s.mainNet)}`).join('\n');
  const sectorStr = hotSectors.slice(0, 5).map((s) => `${s.name} ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%`).join('、');
  const newsStr = news.slice(0, 10).map((n, i) => `${i + 1}. [${n.time.slice(11, 16)}] ${n.title}`).join('\n');
  return `请基于以下昨日盘后 + 隔夜消息，生成 ${date} 的早盘策略备忘：

【昨日指数】
${indexStr}

【昨日热门板块】${sectorStr}

【昨日涨停龙头】
${ztStr}

【昨日资金净流入 TOP5】
${inflowStr}

【隔夜/最新快讯】
${newsStr}

请严格按 5 大章节输出，全文控制在 600 字内，决策导向。`;
}

// ============= 个股诊断模板 =============
export const STOCK_SYSTEM_PROMPT = `你是一位资深 A 股操盘手，擅长结合行情、资金流、估值给出**犀利的个股诊断**。

【你的任务】
基于一只股票的实时行情和近 5 日资金流，输出**简短有用**的个股诊断报告。

【写作要求】
1. **总分总结构**：先给一句话结论，再分点展开，最后给操作建议
2. **数据说话**：必须引用具体数字（涨跌幅、PE、换手、资金净流入）
3. **不和稀泥**：明确说"看好/看空/观望"
4. **300-500 字**：简洁犀利

【报告章节】
## 🎯 一句话结论
（看好/看空/观望，配核心理由）

## 📊 二、行情解读
（现价 + 涨跌 + 量价配合）

## 💰 三、资金流向
（近 5 日主力净流入趋势 + 占比）

## 📈 四、估值评估
（PE / PB / 市值 - 在行业内位置）

## 🎲 五、操作建议
（明确买/卖/持有，给具体点位）

## ⚠️ 风险提示`;

export function buildStockPrompt(params: {
  date: string;
  quote: { code: string; name: string; price: number; preClose: number; change: number; changePct: number; open: number; high: number; low: number; volume: number; amount: number; marketCap: number; pe: number; pb: number; turnover: number };
  fundFlow: Array<{ date: string; mainNet: number; mainPct: number; closePct: number }>;
}): string {
  const { date, quote: q, fundFlow } = params;
  const flowStr = fundFlow
    .map((f) => `- ${f.date}: 涨跌 ${f.closePct >= 0 ? '+' : ''}${f.closePct.toFixed(2)}%，主力净额 ${fmtMoney(f.mainNet)} (占比 ${f.mainPct.toFixed(2)}%)`)
    .join('\n');
  return `请基于以下 ${date} 的真实数据，对个股【${q.name}(${q.code})】出诊断报告：

【实时行情】
- 现价：${q.price.toFixed(2)} 元（${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%）
- 今开/最高/最低：${q.open.toFixed(2)} / ${q.high.toFixed(2)} / ${q.low.toFixed(2)}
- 昨收：${q.preClose.toFixed(2)}
- 成交额：${fmtMoney(q.amount)}，换手率 ${q.turnover.toFixed(2)}%
- 总市值：${fmtMoney(q.marketCap)}
- PE(动)：${q.pe.toFixed(2)}，PB：${q.pb.toFixed(2)}

【近 5 日主力资金流】
${flowStr || '(数据缺失)'}

请按 6 大章节输出，300-500 字，犀利不和稀泥。`;
}
