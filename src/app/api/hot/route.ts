import { NextResponse } from 'next/server';

// 东财人气榜（实时）
export async function GET() {
  try {
    const url = `https://emappdata.eastmoney.com/stockrank/getAllCurrentList`;
    const r = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://guba.eastmoney.com/',
      },
      body: JSON.stringify({ appId: 'appId01', globalId: '786e4c21-70dc-435a-93bb-38', marketType: '', pageNo: 1, pageSize: 20 }),
    });
    const j = await r.json();
    const rawList: Array<{ sc: string; rk: number }> = j?.data ?? [];
    if (rawList.length === 0) return NextResponse.json({ ok: true, list: [] });

    // 拉行情
    const secids = rawList
      .map((s) => {
        const code = s.sc.replace(/^(SH|SZ|BJ)/i, '');
        const prefix = /^(SH|sh)/.test(s.sc) ? '1' : /^(SZ|sz)/.test(s.sc) ? '0' : '0';
        return `${prefix}.${code}`;
      })
      .join(',');
    const qurl = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=f2,f3,f12,f14&fltt=2&invt=2`;
    const qr = await fetch(qurl, { cache: 'no-store' });
    const qj = await qr.json();
    const diff = qj?.data?.diff ?? [];
    const map = new Map<string, { name: string; price: number; changePct: number }>();
    diff.forEach((d: Record<string, unknown>) => {
      map.set(d.f12 as string, {
        name: d.f14 as string,
        price: Number(d.f2) || 0,
        changePct: Number(d.f3) || 0,
      });
    });

    const list = rawList.slice(0, 15).map((s) => {
      const code = s.sc.replace(/^(SH|SZ|BJ)/i, '');
      const q = map.get(code);
      return {
        rank: s.rk,
        code,
        name: q?.name ?? code,
        price: q?.price ?? 0,
        changePct: q?.changePct ?? 0,
      };
    });
    return NextResponse.json({ ok: true, list });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
