import { NextRequest, NextResponse } from 'next/server';
import {
  getMajorIndices,
  getMainFundRank,
  getSectorRank,
} from '@/lib/eastmoney';
import { getFastNews, getZTPool } from '@/lib/news';
import { getStockQuote, getFundFlow } from '@/lib/stock';
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  MORNING_SYSTEM_PROMPT,
  buildMorningPrompt,
  STOCK_SYSTEM_PROMPT,
  buildStockPrompt,
} from '@/lib/prompt';

export const runtime = 'edge';

type Mode = 'review' | 'morning' | 'stock';

interface ReviewRequest {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  mode?: Mode;
  secid?: string; // mode=stock 时必填
}

export async function POST(req: NextRequest) {
  let body: ReviewRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    apiKey,
    baseUrl = 'https://api.openai.com/v1',
    model = 'gpt-4o-mini',
    mode = 'review',
    secid,
  } = body;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: '请先在「设置」中填入你的 LLM API Key' },
      { status: 400 }
    );
  }

  let systemPrompt = '';
  let userPrompt = '';
  const date = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });

  try {
    if (mode === 'stock') {
      if (!secid) {
        return NextResponse.json({ ok: false, error: '个股诊断需要 secid 参数' }, { status: 400 });
      }
      const [quote, fundFlow] = await Promise.all([
        getStockQuote(secid),
        getFundFlow(secid, 5),
      ]);
      if (!quote) {
        return NextResponse.json({ ok: false, error: '未找到该股票' }, { status: 404 });
      }
      systemPrompt = STOCK_SYSTEM_PROMPT;
      userPrompt = buildStockPrompt({ date, quote, fundFlow });
    } else if (mode === 'morning') {
      const [indices, topInflow, hotSectors, ztPool, news] = await Promise.all([
        getMajorIndices(),
        getMainFundRank(5, 'in'),
        getSectorRank(5),
        getZTPool().catch(() => []),
        getFastNews(15).catch(() => []),
      ]);
      systemPrompt = MORNING_SYSTEM_PROMPT;
      userPrompt = buildMorningPrompt({ date, indices, topInflow, hotSectors, ztPool, news });
    } else {
      const [indices, topInflow, topOutflow, hotSectors, ztPool, news] = await Promise.all([
        getMajorIndices(),
        getMainFundRank(10, 'in'),
        getMainFundRank(5, 'out'),
        getSectorRank(8),
        getZTPool().catch(() => []),
        getFastNews(15).catch(() => []),
      ]);
      systemPrompt = SYSTEM_PROMPT;
      userPrompt = buildUserPrompt({ date, indices, topInflow, topOutflow, hotSectors, ztPool, news });
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: '数据获取失败：' + (e as Error).message },
      { status: 502 }
    );
  }

  const llmRes = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!llmRes.ok || !llmRes.body) {
    const errText = await llmRes.text().catch(() => '');
    return NextResponse.json(
      { ok: false, error: `LLM 调用失败 (${llmRes.status}): ${errText.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = llmRes.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') {
              controller.close();
              return;
            }
            try {
              const obj = JSON.parse(payload);
              const delta = obj?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(new TextEncoder().encode(delta));
            } catch {
              /* ignore parse error */
            }
          }
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Data-Date': date,
      'X-Mode': mode,
    },
  });
}
