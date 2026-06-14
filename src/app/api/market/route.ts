import { NextResponse } from 'next/server';
import { getMajorIndices, getMainFundRank, getSectorRank } from '@/lib/eastmoney';
import { getFastNews, getZTPool } from '@/lib/news';
import { getAllIndexTrends } from '@/lib/trends';

export async function GET() {
  try {
    const [indices, topInflow, topOutflow, hotSectors, ztPool, news, indexTrends] = await Promise.all([
      getMajorIndices(),
      getMainFundRank(10, 'in'),
      getMainFundRank(5, 'out'),
      getSectorRank(20), // 板块取多一点给热力图
      getZTPool().catch(() => []),
      getFastNews(15).catch(() => []),
      getAllIndexTrends().catch(() => []),
    ]);

    return NextResponse.json({
      ok: true,
      date: new Date().toISOString().slice(0, 10),
      indices,
      indexTrends,
      topInflow,
      topOutflow,
      hotSectors: hotSectors.map((s) => ({ name: s.name, change: s.change, code: s.code })),
      ztSummary: {
        total: ztPool.length,
        maxLb: ztPool.reduce((m, s) => Math.max(m, s.lbCount), 0),
        top10: [...ztPool].sort((a, b) => b.lbCount - a.lbCount).slice(0, 10),
      },
      news: news.slice(0, 10).map((n) => ({ title: n.title, time: n.time, url: n.url, digest: n.summary })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
