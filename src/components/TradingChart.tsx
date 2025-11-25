"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, AlertCircle } from "lucide-react";

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
  const chartRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartLibLoaded, setChartLibLoaded] = useState(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const initChart = async () => {
      if (!chartContainerRef.current) return;

      try {
        // ✅ Set aggressive timeout - 8 seconds total
        loadingTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && loading) {
            console.error("⏱️ Chart loading timeout");
            setError("Timeout ładowania wykresu");
            setLoading(false);
          }
        }, 8000);

        // Load lightweight-charts from CDN
        if (!(window as any).LightweightCharts) {
          console.log("📊 Loading chart library from CDN...");
          
          try {
            await new Promise<void>((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://unpkg.com/lightweight-charts@4.2.1/dist/lightweight-charts.standalone.production.js';
              script.async = true;
              
              const scriptTimeout = setTimeout(() => {
                reject(new Error('CDN timeout'));
              }, 5000);
              
              script.onload = () => {
                clearTimeout(scriptTimeout);
                console.log("✅ Chart library loaded");
                resolve();
              };
              
              script.onerror = () => {
                clearTimeout(scriptTimeout);
                console.error("❌ Failed to load chart library");
                reject(new Error('Failed to load from CDN'));
              };
              
              document.head.appendChild(script);
            });
          } catch (cdnError) {
            throw new Error('CDN unavailable');
          }
        }
        
        if (!mountedRef.current) return;
        setChartLibLoaded(true);

        const { createChart } = (window as any).LightweightCharts;

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

        // Fetch data
        const fetchChartData = async () => {
          try {
            console.log(`📊 Fetching chart data for ${symbol}...`);

            const startTime = new Date(openedAt).getTime();
            const endTime = new Date(closedAt).getTime();

            const controller = new AbortController();
            const fetchTimeout = setTimeout(() => controller.abort(), 6000);

            const response = await fetch(
              `/api/bot/chart-data?symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&interval=5`,
              { signal: controller.signal }
            );

            clearTimeout(fetchTimeout);

            if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            console.log(`📊 Chart data response:`, data);

            if (!data.success) {
              throw new Error(data.message || "Failed to fetch chart data");
            }

            if (!data.klines || data.klines.length === 0) {
              throw new Error("No chart data available");
            }

            if (!mountedRef.current) return;

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

            console.log("✅ Chart loaded successfully");
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
            }
            setLoading(false);
          } catch (err: any) {
            console.error("❌ Chart data error:", err);
            if (mountedRef.current) {
              if (err.name === 'AbortError') {
                setError("Timeout pobierania danych");
              } else {
                setError(err.message || "Błąd ładowania danych");
              }
              setLoading(false);
            }
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
        console.error("❌ Failed to initialize chart:", err);
        if (mountedRef.current) {
          setError(err.message || "Błąd inicjalizacji wykresu");
          setLoading(false);
        }
      }
    };

    initChart();

    return () => {
      mountedRef.current = false;
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [symbol, entryPrice, exitPrice, openedAt, closedAt, side]);

  if (loading) {
    return (
      <div className="w-full h-[400px] bg-slate-950 rounded-lg flex items-center justify-center border border-gray-800">
        <div className="flex flex-col items-center gap-3">
          <Activity className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm text-gray-400">Ładowanie wykresu...</p>
          <p className="text-xs text-gray-500">
            {chartLibLoaded ? "Pobieranie danych..." : "Ładowanie biblioteki..."}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[400px] bg-slate-950 rounded-lg flex items-center justify-center border border-red-800/30">
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-400 font-semibold">Błąd wykresu</p>
          <p className="text-xs text-gray-400 max-w-md">{error}</p>
          <p className="text-xs text-gray-500 mt-2">
            Dane wykresu mogą być niedostępne dla tego zakresu czasowego
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-950 rounded-lg p-2 border border-gray-800">
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}