import { NextRequest, NextResponse } from 'next/server';
import { getStockQuote, getFundFlow } from '@/lib/stock';

export async function GET(req: NextRequest) {
  const secid = req.nextUrl.searchParams.get('secid')?.trim();
  if (!secid) return NextResponse.json({ ok: false, error: 'secid required' }, { status: 400 });

  const [quote, fundFlow] = await Promise.all([
    getStockQuote(secid),
    getFundFlow(secid, 5),
  ]);

  if (!quote) return NextResponse.json({ ok: false, error: '未找到该股票' }, { status: 404 });
  return NextResponse.json({ ok: true, quote, fundFlow });
}
