# Tejas — Live Indian Markets Platform

A working starting point: user accounts, a watchlist, and live-updating
NSE/BSE candlestick charts with no polling delay (ticks pushed over
WebSocket straight into the chart).

Right now the price feed is a realistic **simulator** — because live
NSE/BSE data legally requires either a broker API subscription (Zerodha
Kite Connect, Upstox, Angel One) or a paid data vendor, and you'll need
to pick one and get API keys before going live. Everything else —
charts, auth, watchlist, architecture — is built exactly as it will
work with real data. Swapping the simulator for Kite Connect is a
one-file change (see `backend/marketSimulator.js`, top comment).

## What's built

- **Auth**: register/login, JWT sessions, passwords hashed with bcrypt
- **Live charts**: TradingView's own charting library (`lightweight-charts`),
  fed by a WebSocket — ticks land on the chart in well under a second
- **Watchlist**: 10 NSE/BSE symbols (Nifty 50, Sensex, and 8 large-caps)
  with live LTP and % change
- **Design**: a distinct visual identity (not a generic template) —
  ink-navy + muted gold, editorial serif headlines, monospace numerals
  for price alignment

## Run it locally (Windows PowerShell)

You need [Node.js](https://nodejs.org) 18+ installed first.

**Terminal 1 — backend:**
```powershell
cd C:\Users\god\yourcloud\stocktrade\backend
npm install
npm run dev
```
This starts the API + WebSocket feed on `http://localhost:4000`.

**Terminal 2 — frontend:**
```powershell
cd C:\Users\god\yourcloud\stocktrade\frontend
npm install
npm run dev
```
This starts the app on `http://localhost:5173`. Open that URL in your
browser — register an account, and you'll land on the live dashboard.

(Adjust the `cd` paths above to wherever you unzip this folder.)

## Project structure

```
stocktrade/
  backend/
    server.js            Express API + WebSocket server
    auth.js               Register/login/JWT logic
    marketSimulator.js    Live price engine (swap this for Kite Connect)
    users.json             Created automatically on first signup
  frontend/
    src/
      pages/               Landing, Login, Register, Dashboard
      components/
        ChartPanel.jsx      The candlestick chart itself
      lib/
        api.js               REST calls to the backend
        useLiveFeed.js       WebSocket hook for live ticks
      styles.css             All visual design/tokens live here
```

## Next steps, in order

1. **Get broker API access.** Sign up for Zerodha Kite Connect
   (₹2,000/month, cleanest docs) or Upstox/Angel One (often free tiers
   for developers). You'll need your own trading account with them.
2. **Swap the data source.** Replace the simulator's tick loop in
   `marketSimulator.js` with the broker's WebSocket ticker — the rest
   of the app (chart, REST history endpoint, frontend) needs no
   changes, since they only care about the `{time, open, high, low,
   close}` candle shape.
3. **Let users connect their own broker account** (OAuth-style flow
   Kite Connect provides) so they can place real orders through their
   own account — you never touch their money, so no SEBI broker
   license is needed for this.
4. **Move `users.json` to a real database** (Postgres) before you have
   more than a handful of users — the JSON file is fine for testing,
   not for production. This matters especially on Render's free tier:
   the filesystem is wiped on every redeploy and on restarts after
   idle sleep, so registered accounts will periodically disappear
   until this is a real database.
5. **Deploy**: backend to a small VM or Render/Railway, frontend to
   Vercel/Netlify. Point `VITE_API_URL` and `VITE_WS_URL` (frontend
   `.env`) at your deployed backend.

## A note on "AI features" for later

Once real data is flowing, good next additions: a plain-language daily
summary of a stock's move (LLM summarizing the day's candles + news),
a chat panel that answers "why did X move today," or a pattern flagger
on the chart. All of that sits on top of this foundation without
touching the chart/auth/data layer.
