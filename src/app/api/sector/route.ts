import { NextRequest, NextResponse } from 'next/server';

// 板块成分股 - 按涨跌幅排序
// bk: 板块代码 (e.g. BK0428)
export async function GET(req: NextRequest) {
  const bk = req.nextUrl.searchParams.get('bk')?.trim();
  if (!bk) return NextResponse.json({ ok: false, error: 'bk required' }, { status: 400 });

  try {
    const url = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=80&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${bk}+f:!50&fields=f12,f14,f2,f3,f15,f16,f62,f184`;
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { Referer: 'https://quote.eastmoney.com/' },
    });
    const j = await r.json();
    const diff = j?.data?.diff ?? [];
    const stocks = diff.map((d: Record<string, unknown>) => ({
      code: d.f12 as string,
      name: d.f14 as string,
      price: Number(d.f2) || 0,
      changePct: Number(d.f3) || 0,
      high: Number(d.f15) || 0,
      low: Number(d.f16) || 0,
      mainNet: Number(d.f62) || 0,
    }));
    const total = j?.data?.total || stocks.length;
    const up = stocks.filter((s: { changePct: number }) => s.changePct > 0).length;
    const down = stocks.filter((s: { changePct: number }) => s.changePct < 0).length;
    return NextResponse.json({ ok: true, total, up, down, stocks });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
