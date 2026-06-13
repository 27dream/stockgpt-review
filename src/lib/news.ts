/**
 * 东方财富 - 新闻快讯 & 涨停板池
 */

export interface FastNews {
  title: string;
  summary: string;
  time: string;
  stocks: Array<{ code: string; name: string }>;
}

export interface ZTStock {
  code: string;
  name: string;
  changePct: number;     // 涨跌幅 %
  amount: number;        // 成交额（元）
  turnover: number;      // 换手率 %
  firstSealTime: string; // 首次封板时间 HH:MM
  lastSealTime: string;
  sealFund: number;      // 封单资金
  zbCount: number;       // 炸板次数
  lbCount: number;       // 连板数
  industry: string;      // 所属行业
}

/**
 * 东财 7×24 快讯（最新 N 条）
 */
export async function getFastNews(limit = 15): Promise<FastNews[]> {
  const url = `https://np-listapi.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=${limit}&req_trace=${Date.now()}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Referer: 'https://kuaixun.eastmoney.com/' },
  });
  const json = await res.json();
  const list = json?.data?.fastNewsList ?? [];
  return list.map((n: Record<string, unknown>) => ({
    title: (n.title as string) ?? '',
    summary: (n.summary as string) ?? '',
    time: (n.showTime as string) ?? '',
    stocks: ((n.stockList as Array<Record<string, unknown>>) ?? []).map((s) => ({
      code: (s.code as string) ?? '',
      name: (s.name as string) ?? '',
    })),
  }));
}

/**
 * 涨停板池（当日）
 * 注意：交易日盘中接口返回 qdate=昨日，需取 today
 */
export async function getZTPool(date?: string, limit = 30): Promise<ZTStock[]> {
  const d = date ?? new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const url = `https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=${limit}&sort=fbt:asc&date=${d}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Referer: 'https://quote.eastmoney.com/' },
  });
  const json = await res.json();
  const pool = json?.data?.pool ?? [];
  return pool.map((s: Record<string, unknown>) => {
    const fbt = String(s.fbt ?? '').padStart(6, '0');
    const lbt = String(s.lbt ?? '').padStart(6, '0');
    const fmt = (t: string) => `${t.slice(0, 2)}:${t.slice(2, 4)}`;
    const zttj = (s.zttj as Record<string, unknown>) ?? {};
    return {
      code: (s.c as string) ?? '',
      name: (s.n as string) ?? '',
      changePct: Number(s.zdp) || 0,
      amount: Number(s.amount) || 0,
      turnover: Number(s.hs) || 0,
      firstSealTime: fmt(fbt),
      lastSealTime: fmt(lbt),
      sealFund: Number(s.fund) || 0,
      zbCount: Number(s.zbc) || 0,
      lbCount: Number(zttj.days) || 1,
      industry: (s.hybk as string) ?? '',
    };
  });
}
