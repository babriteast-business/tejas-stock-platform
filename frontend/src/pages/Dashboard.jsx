import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useLiveFeed } from "../lib/useLiveFeed.js";
import ChartPanel from "../components/ChartPanel.jsx";
import { useAuth } from "../App.jsx";

const RANGES = ["1D", "1W", "1M", "3M", "ALL"];

function formatPrice(n) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [symbols, setSymbols] = useState([]);
  const [selected, setSelected] = useState("NIFTY50");
  const [history, setHistory] = useState(null);
  const [range, setRange] = useState("1D");
  const [connected, setConnected] = useState(false);
  const chartRef = useRef(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    api.symbols().then((data) => setSymbols(data.symbols));
  }, []);

  useEffect(() => {
    setHistory(null);
    api.history(selected).then((data) => setHistory(data.candles));
  }, [selected]);

  const handleLiveUpdate = useCallback((update) => {
    setConnected(true);
    setSymbols((prev) =>
      prev.map((s) =>
        s.symbol === update.symbol
          ? { ...s, ltp: update.candle.close, changePct: round(((update.candle.close - s.prevClose) / s.prevClose) * 100) }
          : s
      )
    );
    if (update.symbol === selectedRef.current && chartRef.current) {
      chartRef.current.updateLive(update.candle);
    }
  }, []);

  useLiveFeed(handleLiveUpdate);

  function round(n) {
    return Math.round(n * 100) / 100;
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  const current = symbols.find((s) => s.symbol === selected);
  const isUp = current && current.changePct >= 0;

  return (
    <div className="dash">
      <div className="topbar">
        <Link to="/" className="brand"><span className="brand-mark" />Tejas</Link>
        <div className="topbar-right">
          <div className="pill">
            <span className="dot" style={{ background: connected ? "#2fa66b" : "#8b8fa3" }} />
            {connected ? "Live" : "Connecting…"}
          </div>
          <div className="user-chip">
            <div className="avatar">{user?.name?.[0]?.toUpperCase() || "U"}</div>
            {user?.name}
          </div>
          <button className="logout-btn" onClick={handleLogout}>Log out</button>
        </div>
      </div>

      <div className="sidebar">
        <div className="sidebar-label">Watchlist</div>
        {symbols.map((s) => {
          const up = s.changePct >= 0;
          return (
            <div
              key={s.symbol}
              className={`watch-row ${s.symbol === selected ? "active" : ""}`}
              onClick={() => setSelected(s.symbol)}
            >
              <div>
                <span className="sym">{s.symbol}</span>
                <span className="exch">{s.exchange}</span>
              </div>
              <div className="price-block">
                <div className="ltp">{formatPrice(s.ltp)}</div>
                <div className={`chg ${up ? "up" : "down"}`}>
                  {up ? "+" : ""}{s.changePct}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="main">
        <div className="chart-header">
          <div className="chart-title">
            <span className="name">{current?.name || selected}</span>
            <span className="exch-badge">{current?.exchange}</span>
            <div className="price-row">
              <span className="price mono">{formatPrice(current?.ltp)}</span>
              {current && (
                <span className={`change ${isUp ? "up" : "down"}`}>
                  {isUp ? "+" : ""}{current.changePct}%
                </span>
              )}
            </div>
          </div>
          <div className="range-tabs">
            {RANGES.map((r) => (
              <button
                key={r}
                className={`range-tab ${range === r ? "active" : ""}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-card">
          {history && <ChartPanel ref={chartRef} history={history} symbol={selected} />}
        </div>

        <div className="stat-strip">
          <div className="stat-box">
            <div className="label">Open</div>
            <div className="value">{formatPrice(history?.[history.length - 1]?.open)}</div>
          </div>
          <div className="stat-box">
            <div className="label">Day high</div>
            <div className="value">{formatPrice(history && Math.max(...history.slice(-30).map((c) => c.high)))}</div>
          </div>
          <div className="stat-box">
            <div className="label">Day low</div>
            <div className="value">{formatPrice(history && Math.min(...history.slice(-30).map((c) => c.low)))}</div>
          </div>
          <div className="stat-box">
            <div className="label">Prev. close</div>
            <div className="value">{formatPrice(current?.prevClose)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
