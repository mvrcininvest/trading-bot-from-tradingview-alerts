"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    abortControllerRef.current = new AbortController();
    
    // Set aggressive timeout - 3 seconds total
    timeoutRef.current = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setLoading(false);
      setError("Timeout - wykres nie załadował się w 3s");
    }, 3000);

    const loadChart = async () => {
      try {
        // Fetch data with abort signal
        const startTime = new Date(openedAt).getTime();
        const endTime = new Date(closedAt).getTime();
        const interval = 5;

        const response = await fetch(
          `/api/bot/chart-data?symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&interval=${interval}`,
          { signal: abortControllerRef.current?.signal }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success || !data.data || data.data.length === 0) {
          throw new Error("Brak danych wykresu");
        }

        // Check if already aborted
        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        // Load library from CDN
        const script = document.createElement("script");
        script.src = "https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js";
        script.async = true;
        
        script.onload = () => {
          if (!chartContainerRef.current || !(window as any).LightweightCharts) {
            setError("Błąd inicjalizacji wykresu");
            setLoading(false);
            return;
          }

          try {
            const chart = (window as any).LightweightCharts.createChart(chartContainerRef.current, {
              width: chartContainerRef.current.clientWidth,
              height: 400,
              layout: {
                background: { color: "#0a0e1a" },
                textColor: "#d1d5db",
              },
              grid: {
                vertLines: { color: "#1f2937" },
                horzLines: { color: "#1f2937" },
              },
              timeScale: {
                borderColor: "#374151",
                timeVisible: true,
                secondsVisible: false,
              },
            });

            const candlestickSeries = chart.addCandlestickSeries({
              upColor: "#10b981",
              downColor: "#ef4444",
              borderUpColor: "#10b981",
              borderDownColor: "#ef4444",
              wickUpColor: "#10b981",
              wickDownColor: "#ef4444",
            });

            candlestickSeries.setData(data.data);

            // Add markers
            const markers = [
              {
                time: Math.floor(startTime / 1000),
                position: side === "Buy" ? "belowBar" : "aboveBar",
                color: side === "Buy" ? "#10b981" : "#ef4444",
                shape: "arrowUp",
                text: `Entry: ${entryPrice.toFixed(4)}`,
              },
              {
                time: Math.floor(endTime / 1000),
                position: side === "Buy" ? "aboveBar" : "belowBar",
                color: side === "Buy" ? "#ef4444" : "#10b981",
                shape: "arrowDown",
                text: `Exit: ${exitPrice.toFixed(4)}`,
              },
            ];

            candlestickSeries.setMarkers(markers as any);
            chart.timeScale().fitContent();

            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            setLoading(false);
            setError(null);
          } catch (err) {
            console.error("Chart creation error:", err);
            setError("Błąd tworzenia wykresu");
            setLoading(false);
          }
        };

        script.onerror = () => {
          setError("Nie udało się załadować biblioteki wykresu");
          setLoading(false);
        };

        document.head.appendChild(script);

      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Timeout already handled
          return;
        }
        console.error("Chart load error:", err);
        setError(err.message || "Błąd ładowania wykresu");
        setLoading(false);
      }
    };

    loadChart();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [symbol, entryPrice, exitPrice, openedAt, closedAt, side]);

  if (loading) {
    return (
      <div className="w-full h-[400px] bg-slate-950 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-gray-400">Ładowanie wykresu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[400px] bg-slate-950 rounded-lg flex items-center justify-center border border-red-500/30">
        <div className="text-center p-6">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-300 mb-2">{error}</p>
          <p className="text-xs text-gray-500">Symbol: {symbol}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={chartContainerRef}
      className="w-full h-[400px] bg-slate-950 rounded-lg"
    />
  );
}