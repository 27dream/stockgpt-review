import { NextRequest, NextResponse } from 'next/server';

// 涨停池 - 东财官方接口
// 字段: c=代码 m=市场 n=名称 p=价格(×1000) zdp=涨幅% amount=成交额(元)
//       lbc=连板数 fbt=首封时间(HHMMSS) lbt=最后封板 fund=封板资金 zbc=炸板次数
//       hybk=所属行业 zttj.days=N天Y板的N
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || todayStr();
  try {
    const url = `https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fbt%3Aasc&date=${date}`;
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { Referer: 'https://quote.eastmoney.com/' },
    });
    const j = await r.json();
    const pool = j?.data?.pool ?? [];
    type Raw = {
      c: string; m: number; n: string; p: number; zdp: number; amount: number;
      lbc: number; fbt: number; lbt: number; fund: number; zbc: number;
      hybk?: string; zttj?: { days: number; ct: number };
      ltsz?: number; hs?: number;
    };
    const stocks = pool.map((d: Raw) => ({
      code: d.c,
      name: d.n,
      market: d.m,
      price: d.p / 1000,
      changePct: d.zdp,
      amount: d.amount,
      boardCount: d.lbc,
      firstSealTime: fmtTime(d.fbt),
      lastSealTime: fmtTime(d.lbt),
      sealFund: d.fund,
      breakCount: d.zbc,
      industry: d.hybk || '',
      ndays: d.zttj?.days || d.lbc,
      turnover: d.hs || 0,
      circulation: d.ltsz || 0,
    }));
    // 默认按连板数 desc, 然后按封板时间 asc
    stocks.sort((a: { boardCount: number; firstSealTime: string }, b: { boardCount: number; firstSealTime: string }) => {
      if (b.boardCount !== a.boardCount) return b.boardCount - a.boardCount;
      return a.firstSealTime.localeCompare(b.firstSealTime);
    });
    return NextResponse.json({ ok: true, date, total: stocks.length, stocks });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function fmtTime(t: number) {
  const s = String(t).padStart(6, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}
