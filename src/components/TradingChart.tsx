"use client";

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";

// Dynamically import lightweight-charts types
type IChartApi = any;
type ISeriesApi = any;
type CandlestickData = any;
type Time = any;

interface TradingChartProps {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  openedAt: string;
  closedAt: string;
  side: "Buy" | "Sell";
}

export function TradingChart({
  symbol,
  entryPrice,
  exitPrice,
  openedAt,
  closedAt,
  side,
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartLibLoaded, setChartLibLoaded] = useState(false);

  useEffect(() => {
    // Dynamically import lightweight-charts only on client side
    let isMounted = true;

    const initChart = async () => {
      if (!chartContainerRef.current) return;

      try {
        // Import lightweight-charts dynamically
        const { createChart } = await import("lightweight-charts");
        
        if (!isMounted) return;
        setChartLibLoaded(true);

        // Create chart
        const chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height: 400,
          layout: {
            background: { color: "#0f172a" },
            textColor: "#d1d5db",
          },
          grid: {
            vertLines: { color: "#1e293b" },
            horzLines: { color: "#1e293b" },
          },
          crosshair: {
            mode: 1,
          },
          rightPriceScale: {
            borderColor: "#334155",
          },
          timeScale: {
            borderColor: "#334155",
            timeVisible: true,
            secondsVisible: false,
          },
        });

        chartRef.current = chart;

        // Create candlestick series
        const candlestickSeries = chart.addCandlestickSeries({
          upColor: "#10b981",
          downColor: "#ef4444",
          borderUpColor: "#10b981",
          borderDownColor: "#ef4444",
          wickUpColor: "#10b981",
          wickDownColor: "#ef4444",
        });

        candlestickSeriesRef.current = candlestickSeries;

        // Fetch data
        const fetchChartData = async () => {
          try {
            setLoading(true);
            setError(null);

            const startTime = new Date(openedAt).getTime();
            const endTime = new Date(closedAt).getTime();

            const response = await fetch(
              `/api/bot/chart-data?symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&interval=5`
            );

            const data = await response.json();

            if (!data.success) {
              throw new Error(data.message || "Failed to fetch chart data");
            }

            if (data.klines.length === 0) {
              throw new Error("No chart data available for this time range");
            }

            // Set candlestick data
            candlestickSeries.setData(data.klines);

            // Add entry marker
            const entryTime = Math.floor(new Date(openedAt).getTime() / 1000);
            candlestickSeries.setMarkers([
              {
                time: entryTime,
                position: side === "Buy" ? "belowBar" : "aboveBar",
                color: "#10b981",
                shape: "arrowUp",
                text: `Entry: ${entryPrice.toFixed(4)}`,
              },
              {
                time: Math.floor(new Date(closedAt).getTime() / 1000),
                position: side === "Buy" ? "aboveBar" : "belowBar",
                color: "#ef4444",
                shape: "arrowDown",
                text: `Exit: ${exitPrice.toFixed(4)}`,
              },
            ]);

            // Fit content
            chart.timeScale().fitContent();

            setLoading(false);
          } catch (err: any) {
            console.error("Chart data error:", err);
            setError(err.message || "Failed to load chart");
            setLoading(false);
          }
        };

        fetchChartData();

        // Handle resize
        const handleResize = () => {
          if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
            });
          }
        };

        window.addEventListener("resize", handleResize);

        // Cleanup
        return () => {
          window.removeEventListener("resize", handleResize);
          if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
          }
        };
      } catch (err: any) {
        console.error("Failed to load chart library:", err);
        setError("Failed to load chart library");
        setLoading(false);
      }
    };

    initChart();

    return () => {
      isMounted = false;
    };
  }, [symbol, entryPrice, exitPrice, openedAt, closedAt, side]);

  if (loading) {
    return (
      <div className="w-full h-[400px] bg-slate-950 rounded-lg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Activity className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm text-gray-400">Ładowanie wykresu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[400px] bg-slate-950 rounded-lg flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-red-400">❌ {error}</p>
          <p className="text-xs text-gray-500">Dane wykresu mogą być niedostępne dla tego zakresu czasowego</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-950 rounded-lg p-2">
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}