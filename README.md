# Tejas — Live Indian Markets Platform

A working starting point: user accounts, a watchlist, live-updating
NSE/BSE candlestick charts (WebSocket ticks, no polling delay), and
buy/sell orders backed by a real Postgres database.

Right now the price feed is a realistic **simulator** — because live
NSE/BSE data legally requires either a broker API subscription (Zerodha
Kite Connect, Upstox, Angel One) or a paid data vendor. Everything else
— charts, auth, orders, wallet, architecture — is built exactly as it
will work with real data. Swapping the simulator for Kite Connect is a
one-file change (see `backend/marketSimulator.js`, top comment).

## What's built

- **Auth**: register/login, JWT sessions, passwords hashed with bcrypt
- **Live charts**: TradingView's own charting library (`lightweight-charts`),
  fed by a WebSocket — ticks land on the chart in well under a second
- **Watchlist**: 10 NSE/BSE symbols (Nifty 50, Sensex, and 8 large-caps)
  with live LTP and % change
- **Buy/sell orders**: market and limit orders, positions with live P&L,
  full order history. Fills happen against the live simulator now; the
  order/position data shapes already match Zerodha Kite Connect's own
  API, so swapping in real broker orders later is a backend-only change
  (see `backend/broker.js`, top comment)
- **Wallet**: every new account gets a ₹1,00,000 signup credit, and can
  top up anytime from the dashboard. This is **virtual funds only** —
  see the compliance note below before connecting any real payment
  gateway to it
- **Postgres-backed**: every user, order, holding, and wallet transaction
  is stored in a real database — survives redeploys and restarts, not
  wiped like a JSON file would be
- **Design**: a distinct visual identity (not a generic template) —
  ink-navy + muted gold, editorial serif headlines, monospace numerals
  for price alignment

## ⚠️ Compliance notes — read before going further

Two separate things this app does NOT do, and why:

1. **It doesn't hold real money.** The wallet here is virtual credit
   the user adds to themselves — no payment gateway is wired in. If you
   connect a real payment gateway (Razorpay, Cashfree, etc.) so users
   can deposit **real rupees** into a balance they then spend later,
   that balance is legally a **Prepaid Payment Instrument (PPI)** under
   RBI rules — the same regulatory category as Paytm Wallet or Amazon
   Pay balance. That needs its own RBI authorization, separate from
   anything below.
2. **It doesn't place real trades.** See `backend/broker.js` and
   `backend/marketSimulator.js` for the two ways to get there: (a) users
   connect their own Zerodha/Upstox/Angel One account and trade through
   it — you never hold their funds, no SEBI broker license needed; or
   (b) you become a SEBI-registered broker yourself and hold client
   funds directly — a multi-crore, multi-year undertaking, not a code
   change.

Neither of these blocks you from building and testing everything else.
They matter the moment real money is involved.

## Run it locally (Windows PowerShell)

You need [Node.js](https://nodejs.org) 18+ and a Postgres database —
easiest option is a free one on Render (see Deploy section below), used
for both local dev and production so you don't need to install Postgres
on your machine.

**Terminal 1 — backend:**
```powershell
cd C:\Users\god\Downloads\stocktrade\backend
npm install
$env:DATABASE_URL="postgres://<your-connection-string>"
npm run dev
```
First run creates all tables automatically. This starts the API +
WebSocket feed on `http://localhost:4000`.

**Terminal 2 — frontend:**
```powershell
cd C:\Users\god\Downloads\stocktrade\frontend
npm install
npm run dev
```
This starts the app on `http://localhost:5173`. Register an account —
you'll land on the dashboard with a ₹1,00,000 starting balance.

## Project structure

```
stocktrade/
  backend/
    server.js            Express API + WebSocket server
    db.js                  Postgres pool + schema (creates tables on boot)
    auth.js               Register/login/JWT logic
    broker.js              Orders, positions, wallet — Postgres-backed
    marketSimulator.js    Live price engine (swap this for Kite Connect)
  frontend/
    src/
      pages/               Landing, Login, Register, Dashboard
      components/
        ChartPanel.jsx      The candlestick chart
        OrderPanel.jsx       Buy/sell + portfolio + wallet
      lib/
        api.js               REST calls to the backend
        useLiveFeed.js       WebSocket hook for live ticks
      styles.css             All visual design/tokens live here
  render.yaml              One-click deploy: backend + frontend + Postgres
```

## Deploying (Render, via the included Blueprint)

`render.yaml` provisions all three pieces — backend, frontend, and a
free Postgres database — and wires the database connection string in
automatically. In the Render dashboard: **New + → Blueprint** → connect
this repo → **Apply**. After the backend deploys, set `VITE_API_URL`
and `VITE_WS_URL` on the frontend service to the backend's URL, then
redeploy the frontend.

For local development against the same database, grab its **External
Database URL** from the Postgres instance's page in Render and use that
as `DATABASE_URL` locally.

## Next steps, in order

1. **Get broker API access.** Sign up for Zerodha Kite Connect
   (₹2,000/month) or Upstox/Angel One. You'll need your own trading
   account with them.
2. **Swap the data source** in `marketSimulator.js` for the broker's
   real WebSocket ticker — the rest of the app doesn't need to change.
3. **Let users connect their own broker account** so real orders route
   through their own funds — see the compliance note above.
4. **If you ever want real-money deposits**, that's the RBI PPI
   conversation, not a code change — talk to a fintech-savvy lawyer
   before building it.

## A note on "AI features" for later

Once real data is flowing, good next additions: a plain-language daily
summary of a stock's move (LLM summarizing the day's candles + news),
a chat panel that answers "why did X move today," or a pattern flagger
on the chart. All of that sits on top of this foundation without
touching the chart/auth/data/orders layer.
