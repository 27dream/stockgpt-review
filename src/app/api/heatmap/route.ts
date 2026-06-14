import { NextResponse } from 'next/server';

// 全行业板块热力图 - 东财 m:90+t:2 = 86 个一级行业板块
// f3=涨跌幅 f6=成交额 f62=主力净流入 f12=板块代码 f14=板块名
export async function GET() {
  try {
    const url = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=200&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f3,f6,f62,f104,f105,f128,f140`;
    // f104=上涨家数 f105=下跌家数 f128=领涨股名 f140=领涨股代码
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { Referer: 'https://quote.eastmoney.com/' },
    });
    const j = await r.json();
    const diff = j?.data?.diff ?? [];
    type Raw = Record<string, unknown>;
    const sectors = diff.map((d: Raw) => ({
      code: d.f12 as string,
      name: d.f14 as string,
      changePct: Number(d.f3) || 0,
      amount: Number(d.f6) || 0,
      mainNet: Number(d.f62) || 0,
      upCount: Number(d.f104) || 0,
      downCount: Number(d.f105) || 0,
      leadName: (d.f128 as string) || '',
      leadCode: (d.f140 as string) || '',
    }));
    return NextResponse.json({ ok: true, total: sectors.length, sectors });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
