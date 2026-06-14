/**
 * /api/quote-batch — 一次性获取 N 只股票的实时行情
 * 用东财 push2 ulist.np 接口，一次最多 50 只
 *
 * GET /api/quote-batch?codes=sh600000,sz000001,...
 * 返回：{ ok: true, quotes: [{ code, name, price, changePct, volume, ...}] }
 */

import { NextRequest, NextResponse } from 'next/server';

interface QuoteItem {
  code: string;
  secid: string;
  name: string;
  price: number;
  changePct: number;
  change: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  amount: number;
  turnover: number;
  isLimit: boolean;
  ts: number;
}

/** 把用户输入的代码（sh600000 / 600000 / 1.600000）规范化为东财 secid 格式（1.xxx / 0.xxx） */
function toSecid(code: string): string | null {
  const c = code.trim().toLowerCase();
  if (/^[01]\.\d{6}$/.test(c)) return c;
  if (/^sh\d{6}$/.test(c)) return `1.${c.slice(2)}`;
  if (/^sz\d{6}$/.test(c)) return `0.${c.slice(2)}`;
  if (/^bj\d{6}$/.test(c)) return `0.${c.slice(2)}`; // 北交所兼容
  if (/^\d{6}$/.test(c)) {
    // 推断市场
    if (c.startsWith('6') || c.startsWith('5') || c.startsWith('9')) return `1.${c}`;
    return `0.${c}`;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const codesParam = req.nextUrl.searchParams.get('codes')?.trim();
  if (!codesParam) {
    return NextResponse.json({ ok: false, error: 'codes required (逗号分隔)' }, { status: 400 });
  }
  const codes = codesParam.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 50);
  const secids = codes.map(toSecid).filter((s): s is string => !!s);
  if (!secids.length) return NextResponse.json({ ok: false, error: 'no valid code' }, { status: 400 });

  // 东财批量行情接口
  // f1=昨收 f2=最新价 f3=涨跌幅 f4=涨跌额 f5=成交量(手) f6=成交额 f7=振幅
  // f8=换手率 f10=量比 f12=代码 f13=市场 f14=名称 f15=最高 f16=最低 f17=今开 f18=昨收
  const fields = 'f1,f2,f3,f4,f5,f6,f8,f10,f12,f13,f14,f15,f16,f17,f18';
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${encodeURIComponent(secids.join(','))}&fields=${fields}&fltt=2&_=${Date.now()}`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (StockGPT)',
        'Referer': 'https://quote.eastmoney.com/',
      },
      // 3 秒一帧足矣
      cache: 'no-store',
    });
    const json = await r.json();
    const list: any[] = json?.data?.diff || [];

    const quotes: QuoteItem[] = list.map((it: any) => {
      const secid = `${it.f13}.${it.f12}`;
      const market = it.f13 === 1 ? 'sh' : 'sz';
      const code = `${market}${it.f12}`;
      const price = Number(it.f2) || 0;
      const prevClose = Number(it.f18) || 0;
      const ztPrice = +(prevClose * 1.1).toFixed(2);
      return {
        code,
        secid,
        name: String(it.f14 || ''),
        price,
        changePct: (Number(it.f3) || 0) / 100, // 转成小数
        change: Number(it.f4) || 0,
        volume: Number(it.f5) || 0,
        amount: Number(it.f6) || 0,
        turnover: (Number(it.f8) || 0) / 100,
        open: Number(it.f17) || 0,
        high: Number(it.f15) || 0,
        low: Number(it.f16) || 0,
        prevClose,
        isLimit: prevClose > 0 && Math.abs(price - ztPrice) < 0.01,
        ts: Date.now(),
      };
    });

    return NextResponse.json({ ok: true, quotes, count: quotes.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'fetch failed' }, { status: 500 });
  }
}
