/**
 * 东方财富免费数据接口封装
 * 数据源：push2delay.eastmoney.com（延时15分钟，免费）
 */

const BASE = 'https://push2delay.eastmoney.com';

export interface MainFundFlow {
  code: string;
  name: string;
  price: number;
  change: number;          // 涨跌幅 %
  mainNet: number;         // 主力净流入 (元)
  mainPct: number;         // 主力净占比 %
  superNet: number;        // 超大单净流入
  superPct: number;
  bigNet: number;          // 大单净流入
  bigPct: number;
  midNet: number;          // 中单净流入
  midPct: number;
  smallNet: number;        // 小单净流入
  smallPct: number;
}

export interface IndexQuote {
  code: string;
  name: string;
  price: number;
  change: number;          // 涨跌点数
  changePct: number;       // 涨跌幅 %
  amount: number;          // 成交额 (元)
}

/**
 * 主力资金流向排行（默认按主力净流入降序）
 * @param limit  返回条数
 * @param sort   'in' 净流入 | 'out' 净流出
 */
export async function getMainFundRank(
  limit = 20,
  sort: 'in' | 'out' = 'in'
): Promise<MainFundFlow[]> {
  const po = sort === 'in' ? 1 : 0;
  const url = `${BASE}/api/qt/clist/get?fid=f62&po=${po}&pz=${limit}&pn=1&np=1&fltt=2&invt=2&fs=m:0+t:6+f:!2,m:0+t:13+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2,m:0+t:7+f:!2&fields=f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  const diff = json?.data?.diff ?? [];
  return diff.map((d: Record<string, unknown>) => ({
    code: d.f12 as string,
    name: d.f14 as string,
    price: Number(d.f2) || 0,
    change: Number(d.f3) || 0,
    mainNet: Number(d.f62) || 0,
    mainPct: Number(d.f184) || 0,
    superNet: Number(d.f66) || 0,
    superPct: Number(d.f69) || 0,
    bigNet: Number(d.f72) || 0,
    bigPct: Number(d.f75) || 0,
    midNet: Number(d.f78) || 0,
    midPct: Number(d.f81) || 0,
    smallNet: Number(d.f84) || 0,
    smallPct: Number(d.f87) || 0,
  }));
}

/**
 * 主要指数实时行情：上证 / 深证 / 创业板 / 沪深300 / 科创50
 */
export async function getMajorIndices(): Promise<IndexQuote[]> {
  const codes = [
    '1.000001', // 上证指数
    '0.399001', // 深证成指
    '0.399006', // 创业板指
    '1.000300', // 沪深300
    '1.000688', // 科创50
  ];
  const secid = codes.join(',');
  const url = `${BASE}/api/qt/ulist.np/get?secids=${secid}&fields=f2,f3,f4,f6,f12,f14&fltt=2&invt=2`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  const diff = json?.data?.diff ?? [];
  return diff.map((d: Record<string, unknown>) => ({
    code: d.f12 as string,
    name: d.f14 as string,
    price: Number(d.f2) || 0,
    change: Number(d.f4) || 0,
    changePct: Number(d.f3) || 0,
    amount: Number(d.f6) || 0,
  }));
}

/**
 * 板块（行业）涨跌幅排行
 */
export async function getSectorRank(limit = 10): Promise<MainFundFlow[]> {
  const url = `${BASE}/api/qt/clist/get?pn=1&pz=${limit}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2+f:!50&fields=f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  const diff = json?.data?.diff ?? [];
  return diff.map((d: Record<string, unknown>) => ({
    code: d.f12 as string,
    name: d.f14 as string,
    price: Number(d.f2) || 0,
    change: Number(d.f3) || 0,
    mainNet: Number(d.f62) || 0,
    mainPct: Number(d.f184) || 0,
    superNet: Number(d.f66) || 0,
    superPct: Number(d.f69) || 0,
    bigNet: Number(d.f72) || 0,
    bigPct: Number(d.f75) || 0,
    midNet: Number(d.f78) || 0,
    midPct: Number(d.f81) || 0,
    smallNet: Number(d.f84) || 0,
    smallPct: Number(d.f87) || 0,
  }));
}

/** 把元转成"亿"或"万" */
export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
  return n.toFixed(0);
}
