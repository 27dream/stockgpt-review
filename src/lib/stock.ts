// 东财个股数据 —— 搜索 / 行情 / 资金流
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const REFERER = 'https://www.eastmoney.com/';

export interface StockSuggestion {
  code: string;        // 600519
  name: string;        // 贵州茅台
  pinyin: string;      // GZMT
  market: string;      // 沪A / 深A / 创业板
  secid: string;       // 1.600519
}

export interface StockQuote {
  code: string;
  name: string;
  price: number;       // 现价（元）
  changePct: number;   // 涨跌幅 %
  change: number;      // 涨跌额（元）
  open: number;
  high: number;
  low: number;
  preClose: number;
  volume: number;      // 成交量（手）
  amount: number;      // 成交额（元）
  marketCap: number;   // 总市值
  pe: number;          // 市盈率（动态）
  pb: number;          // 市净率
  turnover: number;    // 换手率 %
}

export interface FundFlowDay {
  date: string;
  mainNet: number;     // 主力净流入
  mainPct: number;     // 主力净占比 %
  closePct: number;    // 当日涨跌幅
}

export async function searchStock(input: string): Promise<StockSuggestion[]> {
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(input)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=8`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: REFERER },
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    const data = j?.QuotationCodeTable?.Data || [];
    return data
      .filter((d: { Classify: string }) => d.Classify === 'AStock')
      .map((d: { Code: string; Name: string; PinYin: string; SecurityTypeName: string; QuoteID: string }) => ({
        code: d.Code,
        name: d.Name,
        pinyin: d.PinYin,
        market: d.SecurityTypeName,
        secid: d.QuoteID,
      }));
  } catch {
    return [];
  }
}

export async function getStockQuote(secid: string): Promise<StockQuote | null> {
  const fields = 'f43,f44,f45,f46,f47,f48,f57,f58,f60,f62,f71,f84,f116,f117,f167,f168,f169,f170,f173';
  const hosts = ['push2delay.eastmoney.com', 'push2.eastmoney.com'];
  for (const host of hosts) {
    try {
      const url = `https://${host}/api/qt/stock/get?secid=${secid}&fields=${fields}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: REFERER },
        signal: AbortSignal.timeout(5000),
      });
      const j = await r.json();
      const d = j?.data;
      if (!d) continue;
      // 价格字段需 /100
      const price = (d.f43 || 0) / 100;
      const preClose = (d.f60 || 0) / 100;
      return {
        code: d.f57,
        name: d.f58,
        price,
        preClose,
        change: +(price - preClose).toFixed(2),
        changePct: d.f170 ? d.f170 / 100 : 0,
        open: (d.f46 || 0) / 100,
        high: (d.f44 || 0) / 100,
        low: (d.f45 || 0) / 100,
        volume: d.f47 || 0,
        amount: d.f48 || 0,
        marketCap: d.f116 || 0,
        pe: d.f167 ? d.f167 / 100 : 0,
        pb: d.f173 || 0,
        turnover: d.f168 ? d.f168 / 100 : 0,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function getFundFlow(secid: string, days = 5): Promise<FundFlowDay[]> {
  const url = `https://push2.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=${secid}&lmt=${days}&klt=101&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: REFERER },
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    const klines: string[] = j?.data?.klines || [];
    return klines.map((line) => {
      const cols = line.split(',');
      return {
        date: cols[0],
        mainNet: parseFloat(cols[1]) || 0,
        mainPct: parseFloat(cols[6]) || 0,
        closePct: parseFloat(cols[11]) || 0,
      };
    });
  } catch {
    return [];
  }
}
