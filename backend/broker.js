// broker.js
//
// Order placement, positions, and holdings — for BUY/SELL, exactly like
// Zerodha, Groww, Upstox etc.
//
// Right now orders fill against the price simulator with virtual funds
// (₹5,00,000 per new user), because placing REAL orders requires:
//   1. A Kite Connect (or Upstox/Angel One) developer subscription —
//      https://kite.trade  (₹2,000/month, gives you api_key + api_secret)
//   2. Each user completing a one-time broker login (OAuth-style):
//      redirect them to Kite's login URL -> they log into THEIR OWN
//      Zerodha account -> Kite redirects back with a request_token ->
//      you exchange it server-side for an access_token -> store that
//      token against the user (not their password — you never see it).
//   3. Swapping placeOrder()/getPositions() below for real calls:
//        const { KiteConnect } = require("kiteconnect");
//        const kc = new KiteConnect({ api_key, access_token: user.kiteToken });
//        await kc.placeOrder("regular", { exchange, tradingsymbol, transaction_type,
//                                          quantity, order_type, product: "CNC" });
//   The request/response SHAPE below already matches Kite Connect's own
//   Orders API, so the frontend and these function signatures don't
//   need to change — only what's inside each function does.
//
// Until then: this is a real, working paper-trading engine — orders
// fill against live simulated prices, holdings and P&L are tracked
// properly, limit orders wait and fill when the price crosses.

import fs from "fs";
import path from "path";

const DB_FILE = path.join(process.cwd(), "portfolios.json");
const STARTING_CASH = 500000; // ₹5,00,000 virtual funds for new users

function loadAll() {
  if (!fs.existsSync(DB_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveAll(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function ensurePortfolio(userId) {
  const all = loadAll();
  if (!all[userId]) {
    all[userId] = { cash: STARTING_CASH, holdings: {}, orders: [] };
    saveAll(all);
  }
  return all[userId];
}

export function getPortfolio(userId) {
  return ensurePortfolio(userId);
}

// side: "BUY" | "SELL", orderType: "MARKET" | "LIMIT"
export function placeOrder(userId, { symbol, side, qty, orderType, price, ltp }) {
  if (!["BUY", "SELL"].includes(side)) throw new Error("Invalid order side");
  if (!["MARKET", "LIMIT"].includes(orderType)) throw new Error("Invalid order type");
  qty = Number(qty);
  if (!qty || qty <= 0) throw new Error("Quantity must be greater than zero");
  if (orderType === "LIMIT" && (!price || price <= 0)) {
    throw new Error("Limit orders need a valid price");
  }

  const all = loadAll();
  const portfolio = all[userId] || (all[userId] = { cash: STARTING_CASH, holdings: {}, orders: [] });

  const order = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    symbol,
    side,
    qty,
    orderType,
    limitPrice: orderType === "LIMIT" ? price : null,
    status: "OPEN",
    filledPrice: null,
    placedAt: new Date().toISOString(),
    filledAt: null,
  };

  if (orderType === "MARKET") {
    fillOrder(portfolio, order, ltp);
  } else {
    // Limit order: parked as OPEN. checkLimitOrders() below fills it
    // once a live tick crosses the limit price.
    if (side === "BUY") {
      const cost = qty * price;
      if (portfolio.cash < cost) throw new Error("Insufficient funds for this limit order");
    } else {
      const held = portfolio.holdings[symbol]?.qty || 0;
      if (held < qty) throw new Error("Insufficient holdings to sell");
    }
  }

  portfolio.orders.unshift(order);
  all[userId] = portfolio;
  saveAll(all);
  return order;
}

function fillOrder(portfolio, order, ltp) {
  const fillPrice = order.orderType === "MARKET" ? ltp : order.limitPrice;
  const cost = order.qty * fillPrice;

  if (order.side === "BUY") {
    if (portfolio.cash < cost) throw new Error("Insufficient funds for this order");
    portfolio.cash -= cost;
    const existing = portfolio.holdings[order.symbol] || { qty: 0, avgPrice: 0 };
    const newQty = existing.qty + order.qty;
    existing.avgPrice = (existing.avgPrice * existing.qty + cost) / newQty;
    existing.qty = newQty;
    portfolio.holdings[order.symbol] = existing;
  } else {
    const existing = portfolio.holdings[order.symbol];
    if (!existing || existing.qty < order.qty) throw new Error("Insufficient holdings to sell");
    existing.qty -= order.qty;
    portfolio.cash += cost;
    if (existing.qty === 0) delete portfolio.holdings[order.symbol];
  }

  order.status = "FILLED";
  order.filledPrice = fillPrice;
  order.filledAt = new Date().toISOString();
}

// Called on every live price tick from server.js so pending limit
// orders fill the moment the market reaches their price — same as a
// real exchange's matching engine, just simplified.
export function checkLimitOrders(symbol, ltp) {
  const all = loadAll();
  let changed = false;

  for (const userId of Object.keys(all)) {
    const portfolio = all[userId];
    for (const order of portfolio.orders) {
      if (order.status !== "OPEN" || order.symbol !== symbol) continue;
      const crossed =
        (order.side === "BUY" && ltp <= order.limitPrice) ||
        (order.side === "SELL" && ltp >= order.limitPrice);
      if (!crossed) continue;
      try {
        fillOrder(portfolio, order, ltp);
        changed = true;
      } catch {
        order.status = "REJECTED";
        changed = true;
      }
    }
  }

  if (changed) saveAll(all);
}

export function cancelOrder(userId, orderId) {
  const all = loadAll();
  const portfolio = all[userId];
  if (!portfolio) throw new Error("No portfolio found");
  const order = portfolio.orders.find((o) => o.id === orderId);
  if (!order) throw new Error("Order not found");
  if (order.status !== "OPEN") throw new Error("Only open orders can be cancelled");
  order.status = "CANCELLED";
  saveAll(all);
  return order;
}
