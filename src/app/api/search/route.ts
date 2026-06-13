import { NextRequest, NextResponse } from 'next/server';
import { searchStock } from '@/lib/stock';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ ok: false, results: [] });
  const results = await searchStock(q);
  return NextResponse.json({ ok: true, results });
}
