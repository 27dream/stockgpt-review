/**
 * /api/notify — 5 通道推送代理
 * POST { message, configs }
 *
 * 服务端只透传，不存任何密钥。
 * 邮件用 nodemailer（可选依赖）；其他都是 fetch。
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ChannelConfigs, NotifyChannel, NotifyMessage, NotifyResult } from '@/lib/notifier';

export const runtime = 'nodejs'; // 邮件需要 node API

interface Body {
  message: NotifyMessage;
  configs: ChannelConfigs;
}

async function sendTelegram(msg: NotifyMessage, cfg: NonNullable<ChannelConfigs['telegram']>): Promise<void> {
  if (!cfg.botToken || !cfg.chatId) throw new Error('botToken/chatId 缺失');
  const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: cfg.chatId,
      text: msg.markdown || msg.body,
      parse_mode: msg.markdown ? 'Markdown' : undefined,
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) throw new Error(`TG ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const j = await r.json();
  if (!j.ok) throw new Error(`TG: ${j.description}`);
}

async function sendServerChan(msg: NotifyMessage, cfg: NonNullable<ChannelConfigs['serverchan']>): Promise<void> {
  if (!cfg.sendKey) throw new Error('sendKey 缺失');
  const url = `https://sctapi.ftqq.com/${cfg.sendKey}.send`;
  const fd = new URLSearchParams();
  fd.set('title', msg.title);
  fd.set('desp', msg.markdown || msg.body);
  const r = await fetch(url, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`Server酱 ${r.status}`);
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Server酱: ${j.message}`);
}

async function sendFeishu(msg: NotifyMessage, cfg: NonNullable<ChannelConfigs['feishu']>): Promise<void> {
  if (!cfg.webhook) throw new Error('webhook 缺失');
  const payload: any = {
    msg_type: 'interactive',
    card: {
      header: { title: { tag: 'plain_text', content: msg.title }, template: 'blue' },
      elements: [{ tag: 'markdown', content: msg.markdown || msg.body }],
    },
  };
  if (cfg.secret) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const crypto = await import('crypto');
    const stringToSign = `${ts}\n${cfg.secret}`;
    const sign = crypto.createHmac('sha256', stringToSign).update('').digest('base64');
    payload.timestamp = ts;
    payload.sign = sign;
  }
  const r = await fetch(cfg.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`飞书 ${r.status}`);
  const j = await r.json();
  if (j.code && j.code !== 0) throw new Error(`飞书: ${j.msg}`);
}

async function sendQQ(msg: NotifyMessage, cfg: NonNullable<ChannelConfigs['qq']>): Promise<void> {
  if (!cfg.baseUrl || !cfg.targetId) throw new Error('baseUrl/targetId 缺失');
  const endpoint = cfg.targetType === 'group' ? '/send_group_msg' : '/send_private_msg';
  const idKey = cfg.targetType === 'group' ? 'group_id' : 'user_id';
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${endpoint}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`;
  const r = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ [idKey]: cfg.targetId, message: msg.body }),
  });
  if (!r.ok) throw new Error(`QQ ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const j = await r.json();
  if (j.status === 'failed') throw new Error(`QQ: ${j.msg || j.wording}`);
}

async function sendEmail(msg: NotifyMessage, cfg: NonNullable<ChannelConfigs['email']>): Promise<void> {
  if (!cfg.host || !cfg.user || !cfg.to) throw new Error('host/user/to 缺失');
  let nodemailer: any;
  try {
    nodemailer = await import('nodemailer');
  } catch {
    throw new Error('未安装 nodemailer，请执行 pnpm add nodemailer');
  }
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  const html = msg.markdown
    ? msg.markdown.replace(/\n/g, '<br/>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    : msg.body.replace(/\n/g, '<br/>');
  await transporter.sendMail({
    from: cfg.user,
    to: cfg.to,
    subject: msg.title,
    text: msg.body,
    html,
  });
}

const SENDERS: Record<NotifyChannel, (m: NotifyMessage, c: any) => Promise<void>> = {
  telegram: sendTelegram,
  serverchan: sendServerChan,
  feishu: sendFeishu,
  qq: sendQQ,
  email: sendEmail,
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const { message, configs } = body;
  if (!message?.title || !message?.channels?.length) {
    return NextResponse.json({ ok: false, error: 'message.title/channels required' }, { status: 400 });
  }

  const results: NotifyResult[] = await Promise.all(
    message.channels.map(async (ch): Promise<NotifyResult> => {
      const cfg = (configs as any)?.[ch];
      if (!cfg) return { channel: ch, ok: false, error: '未配置' };
      try {
        await SENDERS[ch](message, cfg);
        return { channel: ch, ok: true };
      } catch (e: any) {
        return { channel: ch, ok: false, error: e?.message || String(e) };
      }
    })
  );

  return NextResponse.json({ ok: results.some((r) => r.ok), results });
}
