import React, { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";

const ChartPanel = forwardRef(function ChartPanel({ history, symbol }, ref) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useImperativeHandle(ref, () => ({
    updateLive: (candle) => {
      if (seriesRef.current) seriesRef.current.update(candle);
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b8fa3",
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1c2030" },
        horzLines: { color: "#1c2030" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#3a3f52", labelBackgroundColor: "#232735" },
        horzLine: { color: "#3a3f52", labelBackgroundColor: "#232735" },
      },
      rightPriceScale: { borderColor: "#262b3a" },
      timeScale: { borderColor: "#262b3a", timeVisible: true, secondsVisible: false },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#2fa66b",
      downColor: "#d15c4f",
      borderUpColor: "#2fa66b",
      borderDownColor: "#d15c4f",
      wickUpColor: "#2fa66b",
      wickDownColor: "#d15c4f",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !history) return;
    seriesRef.current.setData(history);
    chartRef.current.timeScale().fitContent();
  }, [symbol, history]);

  return <div ref={containerRef} className="chart-container" />;
});

export default ChartPanel;
