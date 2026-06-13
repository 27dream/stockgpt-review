/**
 * 东方财富 - 指数分时数据
 * 三大指数 secid 映射：
 *   上证指数: 1.000001 / 深证成指: 0.399001 / 创业板指: 0.399006
 */

export interface TrendPoint {
  time: string;       // "HH:MM"
  price: number;      // 当前价（用 f53 收盘价）
  avgPrice: number;   // 均价（f58）
  volume: number;     // 成交量
}

export interface IndexTrend {
  code: string;
  name: string;
  preClose: number;
  trends: TrendPoint[];
}

const INDEX_LIST = [
  { code: '000001', secid: '1.000001', name: '上证指数' },
  { code: '399001', secid: '0.399001', name: '深证成指' },
  { code: '399006', secid: '0.399006', name: '创业板指' },
];

async function fetchTrend(secid: string, name: string, code: string): Promise<IndexTrend> {
  const hosts = ['push2delay.eastmoney.com', 'push2his.eastmoney.com'];
  let json: { data?: { preClose?: number; trends?: string[] } } | null = null;
  for (const host of hosts) {
    try {
      const url = `https://${host}/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=1`;
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      json = await res.json();
      if (json?.data?.trends?.length) break;
    } catch {
      // try next host
    }
  }
  const data = json?.data ?? {};
  const rawTrends: string[] = data.trends ?? [];
  const trends: TrendPoint[] = rawTrends.map((row) => {
    // 格式: "YYYY-MM-DD HH:MM,open,close,high,low,volume,amount,avgPrice"
    const parts = row.split(',');
    return {
      time: parts[0].slice(11, 16),
      price: Number(parts[2]) || 0,
      avgPrice: Number(parts[7]) || 0,
      volume: Number(parts[5]) || 0,
    };
  });
  return {
    code,
    name,
    preClose: Number(data.preClose) || 0,
    trends,
  };
}

export async function getAllIndexTrends(): Promise<IndexTrend[]> {
  return Promise.all(INDEX_LIST.map((i) => fetchTrend(i.secid, i.name, i.code)));
}
