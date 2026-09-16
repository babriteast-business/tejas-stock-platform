import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { registerUser, loginUser, findUserById, issueToken, requireAuth } from "./auth.js";
import { startSimulator, listSymbols, getHistory, getLtp, SYMBOLS } from "./marketSimulator.js";
import { getPortfolio, placeOrder, checkLimitOrders, cancelOrder } from "./broker.js";

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Auth routes ----------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const user = await registerUser(name, email, password);
    const token = issueToken(user);
    res.json({ user, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await loginUser(email, password);
    const token = issueToken(user);
    res.json({ user, token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = findUserById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

// ---------- Market data routes ----------

app.get("/api/symbols", (req, res) => {
  res.json({ symbols: listSymbols() });
});

app.get("/api/history/:symbol", (req, res) => {
  const history = getHistory(req.params.symbol.toUpperCase());
  if (!history) return res.status(404).json({ error: "Unknown symbol" });
  res.json({ symbol: req.params.symbol.toUpperCase(), candles: history });
});

// ---------- Trading routes (paper-filled until a real broker is wired in) ----------

app.get("/api/portfolio", requireAuth, (req, res) => {
  const portfolio = getPortfolio(req.userId);
  const positions = Object.entries(portfolio.holdings).map(([symbol, h]) => {
    const ltp = getLtp(symbol) ?? h.avgPrice;
    const pnl = (ltp - h.avgPrice) * h.qty;
    return { symbol, qty: h.qty, avgPrice: round(h.avgPrice), ltp, pnl: round(pnl) };
  });
  res.json({ cash: round(portfolio.cash), positions, orders: portfolio.orders.slice(0, 50) });
});

app.post("/api/orders", requireAuth, (req, res) => {
  try {
    const { symbol, side, qty, orderType, price } = req.body;
    const ltp = getLtp((symbol || "").toUpperCase());
    if (ltp == null) return res.status(400).json({ error: "Unknown symbol" });
    const order = placeOrder(req.userId, {
      symbol: symbol.toUpperCase(),
      side,
      qty,
      orderType,
      price: price ? Number(price) : null,
      ltp,
    });
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/orders/:id/cancel", requireAuth, (req, res) => {
  try {
    const order = cancelOrder(req.userId, req.params.id);
    res.json({ order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function round(n) {
  return Math.round(n * 100) / 100;
}

// ---------- Server + live WebSocket feed ----------

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "symbols", symbols: SYMBOLS.map((s) => s.symbol) }));
  ws.on("close", () => clients.delete(ws));
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

startSimulator((update) => {
  broadcast(update);
  checkLimitOrders(update.symbol, update.candle.close);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`StockTrade backend running on http://localhost:${PORT}`);
  console.log(`WebSocket feed on ws://localhost:${PORT}/ws`);
});
