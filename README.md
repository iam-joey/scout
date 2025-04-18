# Scout Bot 🚀

**TL;DR:** Scout delivers real-time Solana insights and alerts via Telegram.

Scout is a next‑gen Telegram bot delivering lightning‑fast Solana wallet analytics, NFT snapshots, on‑chain metrics, and dynamic alerting.

## 🚀 Docker Setup

Ensure Docker and Docker Compose are installed. To launch Redis and the backend, run:

```bash
docker compose up --build -d
```

This will start Redis on port 6379 and the backend service on port 3000.

## ⚙️ Environment Setup

Copy the `.env.example` to `.env`:
```bash
cp .env.example .env
```

Example `.env`:
```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
VYBE_NETWORK_KEY=""
TG_BOT_TOKEN=""
TELEGRAM_BASE_URL=""
WS_URL=""
```

## 🎯 Problem Statement

Jumping between siloed APIs and dashboards wastes time and risks missing critical on-chain events. Scout delivers live Solana analytics, custom alerts, and a built-in blockchain explorer—all within Telegram.

## ✅ Features

> A snapshot of all core capabilities of Solana Sentinel Bot.

- [✅] 💰 Wallet Balances: Instantly retrieve SOL and token balances for any Solana address, with paginated details for large portfolios.
- [✅] 📈 PnL Overview: Analyze historical performance and profit & loss for any wallet, offering configurable resolution and pagination.
- [✅] 🔖 Labeled Accounts: Lookup and bookmark addresses with custom labels, making it easy to track VIP wallets and favorites.
- [✅] 🎨 NFT Owners: Visualize the current holders of an NFT collection, complete with ownership distribution and pagination.
- [✅] 📁 Programs Data: Deep dive into on-chain program metrics including:
  - Ranking by volume or usage
  - Total Value Locked (TVL)
  - Transaction counts
  - Instruction usage
  - Active user trends
- [✅] 💸 Tokens: Browse curated token lists, inspect top holders, and monitor real-time transfer events.
- [✅] 💹 Prices: Access live price feeds, OHLCV charts, and market data with customizable time ranges and resolutions.
- [✅] 📬 Alerts: Game‑changing real‑time alert engine to keep you ahead of the curve:
  - [✅] Transfer Alerts: Instant notifications on token movements for watched addresses.
  - [✅] Price Alerts: Threshold‑based alerts for price spikes and dips, fully configurable and manageable.
