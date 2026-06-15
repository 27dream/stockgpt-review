# 🔗 与 mx-trader-bridge 联动 — 从"看报告"到"自动下单"

StockGPT Review 是**只读复盘**工具，但配合 [mx-trader-bridge](https://github.com/27dream/mx-trader-bridge) 可以打通"AI 决策 → 妙想模拟盘自动下单"的闭环。

## 🧠 整体架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│ StockGPT Review │───▶│  你 / LLM 决策    │───▶│  mx-trader-bridge   │
│ (云端 Web 看板)  │    │  (人审核 or 全自动)│    │ (本机 Flask + 妙想)  │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
        ▲                                                  │
        │                                                  ▼
        └──────────────── 东方财富免费 API ──────────  妙想模拟炒股账号
```

| 组件 | 部署 | 职责 |
|---|---|---|
| `stockgpt-review` | Vercel / 任意静态托管 | 看报告、找标的、出策略 |
| `mx-trader-bridge` | 本机（**必须本地**，需妙想 cookie） | 把策略落地为真实下单 |
| `mx-risk-guard` | 本机（被 bridge 调用） | 下单前过风控护栏 |

## 🚀 三步打通闭环

### 1️⃣ 部署 mx-trader-bridge（本机）

```bash
git clone https://github.com/27dream/mx-trader-bridge.git
cd mx-trader-bridge
pip install -e .
export MX_COOKIE='你的妙想 cookie'  # 浏览器 F12 抓
python -m mx_trader_bridge.server  # 默认 :7788
```

### 2️⃣ 在 StockGPT Review 里看报告

打开 [Live Demo](https://stockgpt-review-three.vercel.app) 或本地 `pnpm dev`，
点"一键生成"拿到今日复盘 → 让 AI 总结"明天值得关注的 3 只票"。

### 3️⃣ 把决策喂给 trader-bridge

```bash
# 假设 AI 推荐：明天开盘买 002015 协鑫能科 1 手（试探仓）
curl -X POST http://localhost:7788/order \
  -H 'Content-Type: application/json' \
  -d '{
    "code": "002015",
    "side": "buy",
    "qty": 100,
    "price_type": "limit",
    "price": 8.88
  }'

# 返回 {"rc": 0, "order_id": "..."}  → 真实下单成功
# 返回 {"rc": -1, "msg": "risk_guard: ..."} → 被风控拦下
```

## 💡 自动化模式（高阶）

写一个 cron 脚本：

```python
# strategy.py - 每天 09:25 跑
import requests, json

# 1. 从 stockgpt-review 拉今日策略 JSON
report = requests.get("https://stockgpt-review-three.vercel.app/api/strategy").json()

# 2. 给 LLM 决策（也可以直接用规则）
picks = report["recommended"]  # [{"code": "002015", "qty": 100}, ...]

# 3. 推到 trader-bridge 下单
for pick in picks:
    r = requests.post("http://localhost:7788/order", json={**pick, "side": "buy"})
    print(pick["code"], r.json())
```

配 cron：
```cron
25 9 * * 1-5  cd /path/to && python strategy.py
```

## ⚠️ 风险提示

- **A 股 T+1**：今日买入次日才能卖
- **妙想是模拟盘**：练手用，**真盘需自行接券商接口**
- **下单成功必须校验 `rc=0`**：HTTP 200 不代表下单成功
- **凭证用后即删**：不要把 cookie / API Key 提交到任何代码仓库

## 🛡️ 三件套的完整组合

| 项目 | 角色 | 链接 |
|---|---|---|
| 📊 stockgpt-review | 看报告 / 找标的 / 出策略 | [github.com/27dream/stockgpt-review](https://github.com/27dream/stockgpt-review) |
| 📡 mcp-eastmoney | 给 Claude/Cursor 提供数据底座 | [github.com/27dream/mcp-eastmoney](https://github.com/27dream/mcp-eastmoney) |
| 🚀 mx-trader-bridge | 决策落地为真实下单 | [github.com/27dream/mx-trader-bridge](https://github.com/27dream/mx-trader-bridge) |
| 🛡️ mx-risk-guard | 下单前过风控护栏 | [github.com/27dream/mx-risk-guard](https://github.com/27dream/mx-risk-guard) |

四个开源项目协同 = **完整的 A 股量化自用闭环** 🎯
