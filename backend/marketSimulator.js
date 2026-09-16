// marketSimulator.js
//
// Generates realistic OHLC candle data and streams live ticks.
// This is a stand-in for a real market data feed.
//
// TO SWITCH TO REAL DATA (Zerodha Kite Connect):
//   1. npm install kiteconnect
//   2. Replace `startSimulator()` below with a KiteTicker WebSocket
//      subscription (see https://kite.trade/docs/connect/v3/websocket/).
//   3. On every tick from Kite, call `ingestTick(symbol, ltp, timestamp)`
//      instead of the simulator's internal `nextTick()`.
//   4. Everything downstream (candle aggregation, WS broadcast to
//      frontend, REST history endpoint) stays exactly the same —
//      the frontend never knows the difference.

const SYMBOLS = [
  { symbol: "NIFTY50", name: "Nifty 50", base: 24850, vol: 0.0009, exchange: "NSE" },
  { symbol: "SENSEX", name: "Sensex", base: 81400, vol: 0.0009, exchange: "BSE" },
  { symbol: "RELIANCE", name: "Reliance Industries", base: 2945, vol: 0.0016, exchange: "NSE" },
  { symbol: "TCS", name: "Tata Consultancy Services", base: 4120, vol: 0.0013, exchange: "NSE" },
  { symbol: "HDFCBANK", name: "HDFC Bank", base: 1685, vol: 0.0014, exchange: "NSE" },
  { symbol: "INFY", name: "Infosys", base: 1845, vol: 0.0015, exchange: "NSE" },
  { symbol: "ICICIBANK", name: "ICICI Bank", base: 1275, vol: 0.0014, exchange: "NSE" },
  { symbol: "SBIN", name: "State Bank of India", base: 825, vol: 0.0018, exchange: "NSE" },
  { symbol: "TATAMOTORS", name: "Tata Motors", base: 965, vol: 0.0022, exchange: "NSE" },
  { symbol: "ITC", name: "ITC Limited", base: 468, vol: 0.0012, exchange: "NSE" },
];

// One simulated "market minute" completes every CANDLE_MS of real time,
// so the chart feels alive without waiting for real market minutes.
const CANDLE_MS = 4000;
const TICK_MS = 400; // intra-candle price updates
const BACKFILL_CANDLES = 180;

const state = new Map(); // symbol -> { price, candles: [...], current }

function seedRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function backfill(def) {
  const rand = seedRandom(def.symbol);
  let price = def.base;
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - BACKFILL_CANDLES * 60;

  for (let i = 0; i < BACKFILL_CANDLES; i++) {
    const open = price;
    let high = open;
    let low = open;
    const steps = 6;
    for (let s = 0; s < steps; s++) {
      const drift = gaussian(rand) * def.vol * open;
      price = Math.max(price + drift, open * 0.5);
      high = Math.max(high, price);
      low = Math.min(low, price);
    }
    const close = price;
    candles.push({
      time: startTime + i * 60,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
    });
  }
  return { candles, price };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

export function initSimulator() {
  for (const def of SYMBOLS) {
    const { candles, price } = backfill(def);
    state.set(def.symbol, {
      def,
      price,
      candles,
      current: null,
      rand: seedRandom(def.symbol + "-live"),
      prevClose: candles[candles.length - 2]?.close ?? candles[candles.length - 1].open,
    });
  }
}

export function listSymbols() {
  return SYMBOLS.map((s) => {
    const st = state.get(s.symbol);
    const last = st.candles[st.candles.length - 1];
    return {
      symbol: s.symbol,
      name: s.name,
      exchange: s.exchange,
      ltp: last.close,
      prevClose: st.prevClose,
      changePct: round(((last.close - st.prevClose) / st.prevClose) * 100),
    };
  });
}

export function getLtp(symbol) {
  const st = state.get(symbol);
  if (!st) return null;
  return st.current ? st.current.close : st.candles[st.candles.length - 1].close;
}

export function getHistory(symbol) {
  const st = state.get(symbol);
  if (!st) return null;
  return st.candles.slice(-BACKFILL_CANDLES);
}

// Advances one symbol's live price by one tick, updating the
// in-progress candle. Returns { type: 'tick'|'candle_close', ... }
function nextTick(symbol) {
  const st = state.get(symbol);
  const { def } = st;
  const drift = gaussian(st.rand) * def.vol * st.price;
  st.price = Math.max(st.price + drift, def.base * 0.4);
  const t = Math.floor(Date.now() / 1000);

  if (!st.current || t - st.current.time >= 60 || st.current.forceClose) {
    if (st.current) {
      st.candles.push(st.current);
      if (st.candles.length > BACKFILL_CANDLES) st.candles.shift();
      st.prevClose = st.current.close;
    }
    st.current = {
      time: t,
      open: round(st.price),
      high: round(st.price),
      low: round(st.price),
      close: round(st.price),
    };
    return { type: "candle_new", symbol, candle: { ...st.current } };
  }

  st.current.close = round(st.price);
  st.current.high = round(Math.max(st.current.high, st.price));
  st.current.low = round(Math.min(st.current.low, st.price));
  return { type: "tick", symbol, candle: { ...st.current } };
}

// Force-closes the current candle on a timer so candles complete on
// a predictable cadence for the demo, regardless of real clock minutes.
export function startSimulator(onUpdate) {
  initSimulator();

  for (const def of SYMBOLS) {
    setInterval(() => {
      const update = nextTick(def.symbol);
      onUpdate(update);
    }, TICK_MS + Math.floor(Math.random() * 150));

    setInterval(() => {
      const st = state.get(def.symbol);
      if (st.current) st.current.forceClose = true;
    }, CANDLE_MS + Math.floor(Math.random() * 400));
  }
}

export { SYMBOLS };
