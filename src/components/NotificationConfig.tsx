'use client';

import { useEffect, useState } from 'react';
import {
  loadConfigs, saveConfigs, sendNotification,
  type ChannelConfigs, type NotifyChannel,
} from '@/lib/notifier';

interface Props {
  onClose?: () => void;
}

const CHANNELS: { id: NotifyChannel; label: string; emoji: string; doc: string }[] = [
  { id: 'telegram', label: 'Telegram', emoji: '✈️', doc: '@BotFather 创建机器人，获取 Bot Token；私聊机器人后访问 https://api.telegram.org/bot<token>/getUpdates 拿 chat_id' },
  { id: 'serverchan', label: 'Server酱', emoji: '📨', doc: '访问 https://sct.ftqq.com 微信扫码登录，复制 SendKey（SCT 开头）' },
  { id: 'feishu', label: '飞书', emoji: '🚀', doc: '群设置 → 群机器人 → 添加自定义机器人，复制 webhook URL；可选签名校验密钥' },
  { id: 'qq', label: 'QQ Bot', emoji: '🐧', doc: '需自建 napcat/go-cqhttp 服务，填入 baseUrl（如 http://127.0.0.1:5700）+ access_token' },
  { id: 'email', label: '邮箱', emoji: '📧', doc: 'SMTP 配置，Gmail 用应用专用密码，QQ 用授权码' },
];

export default function NotificationConfig({ onClose }: Props) {
  const [configs, setConfigs] = useState<ChannelConfigs>({});
  const [enabled, setEnabled] = useState<Record<NotifyChannel, boolean>>({
    telegram: false, serverchan: false, feishu: false, qq: false, email: false,
  });
  const [testing, setTesting] = useState<NotifyChannel | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const cfg = loadConfigs();
    setConfigs(cfg);
    setEnabled({
      telegram: !!cfg.telegram?.botToken,
      serverchan: !!cfg.serverchan?.sendKey,
      feishu: !!cfg.feishu?.webhook,
      qq: !!cfg.qq?.baseUrl,
      email: !!cfg.email?.host,
    });
  }, []);

  const update = <K extends NotifyChannel>(ch: K, patch: Partial<NonNullable<ChannelConfigs[K]>>) => {
    setConfigs(prev => ({ ...prev, [ch]: { ...(prev[ch] as any), ...patch } }));
  };

  const handleSave = () => {
    saveConfigs(configs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async (ch: NotifyChannel) => {
    setTesting(ch);
    setResults(r => ({ ...r, [ch]: { ok: false } }));
    try {
      saveConfigs(configs);
      const res = await sendNotification({
        title: '🧪 StockGPT 测试',
        body: `这是一条来自 StockGPT 的测试消息\n时间：${new Date().toLocaleString('zh-CN')}`,
        markdown: `## 🧪 测试消息\n\n这是一条来自 **StockGPT** 的测试消息\n\n- 通道: ${ch}\n- 时间: ${new Date().toLocaleString('zh-CN')}`,
        channels: [ch],
      });
      const r = res.find(x => x.channel === ch);
      setResults(rr => ({ ...rr, [ch]: { ok: !!r?.ok, error: r?.error } }));
    } catch (e: any) {
      setResults(rr => ({ ...rr, [ch]: { ok: false, error: e.message } }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">🔔 通知配置</h3>
          <p className="text-xs text-gray-500">所有密钥仅存于本地 localStorage，发送时透传不持久化</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700">
            {saved ? '✓ 已保存' : '💾 保存'}
          </button>
          {onClose && <button onClick={onClose} className="px-3 py-1.5 rounded text-sm border hover:bg-gray-50">关闭</button>}
        </div>
      </div>

      <div className="space-y-3">
        {CHANNELS.map(ch => {
          const result = results[ch.id];
          return (
            <details key={ch.id} className="border rounded" open={enabled[ch.id]}>
              <summary className="p-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enabled[ch.id]}
                    onChange={(e) => setEnabled(p => ({ ...p, [ch.id]: e.target.checked }))}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="font-medium">{ch.emoji} {ch.label}</span>
                  {result && (
                    <span className={`text-xs px-2 py-0.5 rounded ${result.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {result.ok ? '✓ 成功' : `✗ ${result.error?.slice(0, 30) || '失败'}`}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); handleTest(ch.id); }}
                  disabled={testing === ch.id}
                  className="px-2 py-1 text-xs rounded border hover:bg-gray-100 disabled:opacity-40"
                >
                  {testing === ch.id ? '发送中...' : '测试'}
                </button>
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <p className="text-xs text-gray-500">{ch.doc}</p>

                {ch.id === 'telegram' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input className="border rounded px-2 py-1 text-sm" placeholder="Bot Token (123:ABC...)"
                      value={configs.telegram?.botToken || ''}
                      onChange={(e) => update('telegram', { botToken: e.target.value })} />
                    <input className="border rounded px-2 py-1 text-sm" placeholder="Chat ID"
                      value={configs.telegram?.chatId || ''}
                      onChange={(e) => update('telegram', { chatId: e.target.value })} />
                  </div>
                )}

                {ch.id === 'serverchan' && (
                  <input className="border rounded px-2 py-1 text-sm w-full" placeholder="SendKey (SCT...)"
                    value={configs.serverchan?.sendKey || ''}
                    onChange={(e) => update('serverchan', { sendKey: e.target.value })} />
                )}

                {ch.id === 'feishu' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input className="border rounded px-2 py-1 text-sm" placeholder="Webhook URL"
                      value={configs.feishu?.webhook || ''}
                      onChange={(e) => update('feishu', { webhook: e.target.value })} />
                    <input className="border rounded px-2 py-1 text-sm" placeholder="签名密钥（可选）"
                      value={configs.feishu?.secret || ''}
                      onChange={(e) => update('feishu', { secret: e.target.value })} />
                  </div>
                )}

                {ch.id === 'qq' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input className="border rounded px-2 py-1 text-sm" placeholder="Base URL (http://127.0.0.1:5700)"
                      value={configs.qq?.baseUrl || ''}
                      onChange={(e) => update('qq', { baseUrl: e.target.value })} />
                    <input className="border rounded px-2 py-1 text-sm" placeholder="Access Token (可选)"
                      value={configs.qq?.token || ''}
                      onChange={(e) => update('qq', { token: e.target.value })} />
                    <select className="border rounded px-2 py-1 text-sm"
                      value={configs.qq?.targetType || 'group'}
                      onChange={(e) => update('qq', { targetType: e.target.value as any })}>
                      <option value="group">群</option>
                      <option value="private">私聊</option>
                    </select>
                    <input className="border rounded px-2 py-1 text-sm" placeholder="目标 ID（群号/QQ号）"
                      value={configs.qq?.targetId || ''}
                      onChange={(e) => update('qq', { targetId: e.target.value })} />
                  </div>
                )}

                {ch.id === 'email' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input className="border rounded px-2 py-1 text-sm" placeholder="SMTP Host (smtp.qq.com)"
                      value={configs.email?.host || ''}
                      onChange={(e) => update('email', { host: e.target.value })} />
                    <input type="number" className="border rounded px-2 py-1 text-sm" placeholder="Port (465)"
                      value={configs.email?.port || 465}
                      onChange={(e) => update('email', { port: parseInt(e.target.value) || 465 })} />
                    <input className="border rounded px-2 py-1 text-sm" placeholder="账号"
                      value={configs.email?.user || ''}
                      onChange={(e) => update('email', { user: e.target.value })} />
                    <input type="password" className="border rounded px-2 py-1 text-sm" placeholder="密码/授权码"
                      value={configs.email?.pass || ''}
                      onChange={(e) => update('email', { pass: e.target.value })} />
                    <input className="border rounded px-2 py-1 text-sm md:col-span-2" placeholder="收件人 (多个用逗号)"
                      value={configs.email?.to || ''}
                      onChange={(e) => update('email', { to: e.target.value })} />
                    <label className="flex items-center gap-2 text-sm md:col-span-2">
                      <input type="checkbox"
                        checked={configs.email?.secure ?? true}
                        onChange={(e) => update('email', { secure: e.target.checked })} />
                      使用 SSL/TLS (端口 465)
                    </label>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
