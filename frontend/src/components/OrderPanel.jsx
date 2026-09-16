import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

function fmt(n) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrderPanel({ symbol, ltp }) {
  const [side, setSide] = useState("BUY");
  const [orderType, setOrderType] = useState("MARKET");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [portfolio, setPortfolio] = useState(null);

  const refreshPortfolio = useCallback(() => {
    api.portfolio().then(setPortfolio).catch(() => {});
  }, []);

  useEffect(() => {
    refreshPortfolio();
    const id = setInterval(refreshPortfolio, 3000);
    return () => clearInterval(id);
  }, [refreshPortfolio]);

  useEffect(() => {
    setMsg(null);
  }, [symbol, side, orderType]);

  const effectivePrice = orderType === "MARKET" ? ltp : Number(price) || 0;
  const estimatedCost = effectivePrice * (Number(qty) || 0);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const { order } = await api.placeOrder({
        symbol,
        side,
        qty: Number(qty),
        orderType,
        price: orderType === "LIMIT" ? Number(price) : undefined,
      });
      setMsg({ type: "ok", text: order.status === "FILLED" ? `Filled at ₹${fmt(order.filledPrice)}` : "Limit order placed — waiting to fill" });
      refreshPortfolio();
    } catch (err) {
      setMsg({ type: "err", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(orderId) {
    try {
      await api.cancelOrder(orderId);
      refreshPortfolio();
    } catch {
      // ignore — order likely already filled/cancelled
    }
  }

  return (
    <div className="trade-panel">
      <div className="panel-card">
        <div className="panel-title">Place order — {symbol}</div>

        <div className="side-toggle">
          <button className={`side-btn buy ${side === "BUY" ? "active" : ""}`} onClick={() => setSide("BUY")}>Buy</button>
          <button className={`side-btn sell ${side === "SELL" ? "active" : ""}`} onClick={() => setSide("SELL")}>Sell</button>
        </div>

        <div className="order-type-toggle">
          <button className={`order-type-btn ${orderType === "MARKET" ? "active" : ""}`} onClick={() => setOrderType("MARKET")}>Market</button>
          <button className={`order-type-btn ${orderType === "LIMIT" ? "active" : ""}`} onClick={() => setOrderType("LIMIT")}>Limit</button>
        </div>

        <div className="trade-field">
          <label>Quantity</label>
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>

        {orderType === "LIMIT" && (
          <div className="trade-field">
            <label>Limit price (₹)</label>
            <input type="number" min="0" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={fmt(ltp)} />
          </div>
        )}

        <div className="order-summary">
          <span>Est. {orderType === "MARKET" ? "at market" : "value"}</span>
          <span className="val">₹{fmt(estimatedCost)}</span>
        </div>

        {msg && <div className={`order-msg ${msg.type === "err" ? "err" : "ok"}`}>{msg.text}</div>}

        <button
          className={`btn submit-order ${side === "BUY" ? "buy" : "sell"}`}
          onClick={submit}
          disabled={busy || !qty || (orderType === "LIMIT" && !price)}
        >
          {busy ? "Placing…" : `${side === "BUY" ? "Buy" : "Sell"} ${symbol}`}
        </button>
      </div>

      <div className="panel-card">
        <div className="panel-title">Portfolio</div>
        <div className="funds-row">
          <span className="label">Available cash</span>
          <span className="val">₹{fmt(portfolio?.cash)}</span>
        </div>

        {portfolio?.positions?.length ? (
          portfolio.positions.map((p) => (
            <div className="holding-row" key={p.symbol}>
              <div className="top">
                <span className="sym">{p.symbol}</span>
                <span className={p.pnl >= 0 ? "up" : "down"}>{p.pnl >= 0 ? "+" : ""}₹{fmt(p.pnl)}</span>
              </div>
              <div className="sub">
                <span>{p.qty} @ ₹{fmt(p.avgPrice)}</span>
                <span>LTP ₹{fmt(p.ltp)}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-note">No open positions yet.</div>
        )}
      </div>

      <div className="panel-card">
        <div className="panel-title">Recent orders</div>
        {portfolio?.orders?.length ? (
          portfolio.orders.slice(0, 8).map((o) => (
            <div className="order-row" key={o.id}>
              <div className="top">
                <span className="sym">{o.side} {o.symbol}</span>
                <span className={`status-badge ${o.status}`}>{o.status}</span>
              </div>
              <div className="sub">
                <span>{o.qty} · {o.orderType}{o.orderType === "LIMIT" ? ` @ ₹${fmt(o.limitPrice)}` : ""}</span>
                <span>{o.filledPrice ? `₹${fmt(o.filledPrice)}` : "—"}</span>
              </div>
              {o.status === "OPEN" && (
                <button className="logout-btn" style={{ marginTop: 4 }} onClick={() => handleCancel(o.id)}>
                  Cancel
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="empty-note">No orders yet.</div>
        )}
      </div>
    </div>
  );
}
