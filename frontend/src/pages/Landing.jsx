import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createChart, ColorType } from "lightweight-charts";
import { api } from "../lib/api.js";
import { useLiveFeed } from "../lib/useLiveFeed.js";

function HeroChart() {
  const containerRef = useRef(null);
  const seriesRef = useRef(null);
  const [meta, setMeta] = useState({ price: null, changePct: null });

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b8fa3", fontFamily: "IBM Plex Mono, monospace", fontSize: 10 },
      grid: { vertLines: { color: "#1c2030" }, horzLines: { color: "#1c2030" } },
      rightPriceScale: { borderColor: "#262b3a" },
      timeScale: { borderColor: "#262b3a", timeVisible: true },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#2fa66b", downColor: "#d15c4f",
      borderUpColor: "#2fa66b", borderDownColor: "#d15c4f",
      wickUpColor: "#2fa66b", wickDownColor: "#d15c4f",
    });
    seriesRef.current = series;

    const resize = () => containerRef.current && chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current);

    api.history("NIFTY50").then((data) => {
      series.setData(data.candles);
      chart.timeScale().fitContent();
      const last = data.candles[data.candles.length - 1];
      setMeta({ price: last.close, changePct: null });
    });

    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  useLiveFeed((update) => {
    if (update.symbol !== "NIFTY50" || !seriesRef.current) return;
    seriesRef.current.update(update.candle);
    setMeta((m) => ({ ...m, price: update.candle.close }));
  });

  return (
    <div className="hero-panel">
      <div className="hero-panel-head">
        <div className="name">Nifty 50 · Live</div>
        <div className="price mono">{meta.price ? meta.price.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}</div>
      </div>
      <div ref={containerRef} className="hero-chart" />
    </div>
  );
}

export default function Landing() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="brand"><span className="brand-mark" />Tejas</div>
        <div className="landing-nav-links">
          <Link to="/login">Log in</Link>
          <Link to="/register" className="btn btn-gold">Open free account</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <h1>Watch the tape move, in real time.</h1>
          <p>
            Live NSE and BSE candlestick charts with no lag between the market
            and your screen. Track Nifty, Sensex, and the stocks that make
            them — built for people who watch price action closely.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-gold">Create free account</Link>
            <Link to="/login" className="btn btn-ghost">I already have one</Link>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="num">10</div>
              <div className="label">Indices &amp; large-caps tracked</div>
            </div>
            <div className="hero-stat">
              <div className="num">&lt;1s</div>
              <div className="label">Tick-to-chart latency</div>
            </div>
            <div className="hero-stat">
              <div className="num">NSE / BSE</div>
              <div className="label">Exchange coverage</div>
            </div>
          </div>
        </div>
        <HeroChart />
      </section>

      <section className="features">
        <div className="feature">
          <div className="idx">Live data</div>
          <h3>Charts that don't wait</h3>
          <p>Ticks stream over a persistent connection straight into the candle you're watching form — no polling, no refresh.</p>
        </div>
        <div className="feature">
          <div className="idx">Your account, your capital</div>
          <h3>Trade through your own broker</h3>
          <p>Connect Zerodha, Upstox, or Angel One. Your funds stay in your account — we never hold your money.</p>
        </div>
        <div className="feature">
          <div className="idx">Built for depth</div>
          <h3>A workspace, not a widget</h3>
          <p>A watchlist, a real chart, and room to grow — into screeners, alerts, and AI read-outs as you need them.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Tejas — a Gravrel Cloud product</span>
        <span>Market data simulated for demo purposes</span>
      </footer>
    </div>
  );
}
