/**
 * /api/kline-batch — 批量拉取多只股票的日 K 线（新浪源）
 *
 * GET /api/kline-batch?codes=sh600000,sz000001&days=120
 * 返回：{ ok: true, data: { sh600000: [{ date, open, high, low, close, volume }], ... } }
 *
 * 数据源：money.finance.sina.com.cn（不复权）→ 简单稳定
 * 单 IP 限流：串行 + 80ms 间隔
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Bar } from '@/lib/factors';

/** sh600000/sz000001/600000 → sh600000 (新浪格式) */
function toSinaSymbol(code: string): string | null {
  const c = code.trim().toLowerCase();
  if (/^(sh|sz|bj)\d{6}$/.test(c)) return c;
  if (/^[01]\.\d{6}$/.test(c)) {
    return (c.startsWith('1.') ? 'sh' : 'sz') + c.slice(2);
  }
  if (/^\d{6}$/.test(c)) {
    if (c.startsWith('6') || c.startsWith('5') || c.startsWith('9')) return `sh${c}`;
    return `sz${c}`;
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchKlineSina(symbol: string, days: number): Promise<Bar[]> {
  const url = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${days}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (StockGPT)' },
      cache: 'no-store',
    });
    const arr: any[] = await r.json();
    if (!Array.isArray(arr)) return [];
    // 计算 changePct（新浪不返回涨跌幅，自己算）
    return arr.map((it, i) => {
      const close = parseFloat(it.close);
      const prevClose = i > 0 ? parseFloat(arr[i - 1].close) : close;
      return {
        date: it.day,
        open: parseFloat(it.open),
        close,
        high: parseFloat(it.high),
        low: parseFloat(it.low),
        volume: parseInt(it.volume, 10) / 100, // 新浪是股，转手
        amount: 0,
        changePct: prevClose > 0 ? close / prevClose - 1 : 0,
        turnover: 0,
      } as Bar;
    });
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const codesParam = req.nextUrl.searchParams.get('codes')?.trim();
  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '120', 10), 500);
  if (!codesParam) return NextResponse.json({ ok: false, error: 'codes required' }, { status: 400 });

  const codes = codesParam.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 50);
  const data: Record<string, Bar[]> = {};

  for (const code of codes) {
    const symbol = toSinaSymbol(code);
    if (!symbol) continue;
    data[symbol] = await fetchKlineSina(symbol, days);
    await sleep(80);
  }

  return NextResponse.json({ ok: true, data, count: Object.keys(data).length });
}
