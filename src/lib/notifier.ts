/**
 * 5 通道推送（前端配置 → 服务端 /api/notify 转发，绕 CORS）
 *
 * 通道：
 *   1) Telegram Bot         botToken + chatId
 *   2) Server酱（微信）     sendKey
 *   3) 飞书自定义机器人      webhook
 *   4) QQ Bot（go-cqhttp/onebot11） baseUrl + token + targetId(group/user)
 *   5) 邮件 SMTP             host + port + user + pass + to
 *
 * 用户配置存 localStorage（钥匙不上服务端），实际推送时整包 POST /api/notify。
 */

export type NotifyChannel = 'telegram' | 'serverchan' | 'feishu' | 'qq' | 'email';

export interface ChannelConfigs {
  telegram?: { botToken: string; chatId: string };
  serverchan?: { sendKey: string };
  feishu?: { webhook: string; secret?: string };
  qq?: { baseUrl: string; token?: string; targetType: 'group' | 'private'; targetId: string };
  email?: { host: string; port: number; secure: boolean; user: string; pass: string; to: string };
}

export interface NotifyMessage {
  title: string;
  body: string; // 纯文本
  markdown?: string; // 优先 markdown
  channels: NotifyChannel[];
}

export interface NotifyResult {
  channel: NotifyChannel;
  ok: boolean;
  error?: string;
}

const LS_KEY = 'stockgpt:notify_configs';

export function loadConfigs(): ChannelConfigs {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveConfigs(cfg: ChannelConfigs) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

/** 通过服务端代理发送，避免 CORS + 隐藏部分密钥（用户依然自己持有，仅请求时透传） */
export async function sendNotification(msg: NotifyMessage): Promise<NotifyResult[]> {
  const configs = loadConfigs();
  const r = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, configs }),
  });
  const j = await r.json();
  return j.results || [];
}

/** 信号 → 推送文本（统一格式化） */
export function formatSignalMessage(signals: Array<{
  code: string;
  name: string;
  signalId: string;
  signalLabel: string;
  emoji?: string;
  price: number;
  changePct: number;
  reason?: string;
}>): NotifyMessage {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const lines = signals.slice(0, 20).map((s) => {
    const pct = (s.changePct * 100).toFixed(2);
    const arrow = s.changePct >= 0 ? '📈' : '📉';
    return `${s.emoji || '🔔'} ${s.name}(${s.code}) ${arrow}${pct}% @${s.price.toFixed(2)}\n   └─ ${s.signalLabel}${s.reason ? ` · ${s.reason}` : ''}`;
  });
  const body = `📡 StockGPT 盯盘提醒 · ${time}\n\n${lines.join('\n\n')}`;
  const markdown = `## 📡 盯盘提醒 · ${time}\n\n` +
    signals.slice(0, 20).map((s) => {
      const pct = (s.changePct * 100).toFixed(2);
      return `- ${s.emoji || '🔔'} **${s.name}**(${s.code}) ${pct}% @${s.price.toFixed(2)} — ${s.signalLabel}`;
    }).join('\n');
  return {
    title: `📡 ${signals.length} 个信号触发`,
    body,
    markdown,
    channels: ['telegram', 'serverchan', 'feishu', 'qq', 'email'],
  };
}
