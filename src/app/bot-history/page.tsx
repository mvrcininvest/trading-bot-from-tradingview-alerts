"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, TrendingUp, TrendingDown, Activity, Database, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ✅ Dane z bazy - automatycznie zapisywane przez bota podczas działania
interface HistoryPosition {
  id: string;
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  closePrice: number;
  quantity: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  closeReason: string;
  openedAt: string;
  closedAt: string;
  durationMinutes: number;
  source: "bybit";
}

export default function BotHistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  // ✅ Auto-refresh co 10 sekund
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchHistory(true); // silent refresh (bez toastu)
    }, 10000); // 10 sekund

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchHistory = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // ✅ Pobierz dane z bazy (bot automatycznie zapisuje pozycje podczas działania)
      const response = await fetch('/api/bot/history?limit=100');
      const data = await response.json();
      
      if (data.success && data.history) {
        setHistory(data.history);
        setLastRefresh(new Date());
        if (!silent) {
          toast.success(`Pobrano ${data.history.length} pozycji z bazy danych`);
        }
      } else {
        if (!silent) {
          toast.error(data.message || "Błąd pobierania historii");
        }
      }
    } catch (err) {
      console.error("Nie udało się pobrać historii:", err);
      if (!silent) {
        toast.error("Błąd pobierania historii");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Obliczenia statystyk
  const stats = {
    totalTrades: history.length,
    profitable: history.filter(h => h.pnl > 0).length,
    losses: history.filter(h => h.pnl < 0).length,
    totalPnl: history.reduce((sum, h) => sum + h.pnl, 0),
    winRate: history.length > 0 ? (history.filter(h => h.pnl > 0).length / history.length) * 100 : 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-600/30 to-amber-900/20 border border-amber-500/30">
              <History className="h-8 w-8 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Historia Pozycji Bota
              </h1>
              <p className="text-gray-200">
                Automatycznie synchronizowane z Bybit podczas działania bota
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => setAutoRefresh(!autoRefresh)}
              variant={autoRefresh ? "default" : "outline"}
              className={autoRefresh ? "bg-green-600 hover:bg-green-700" : ""}
            >
              <Activity className={`mr-2 h-4 w-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
              Auto-odświeżanie {autoRefresh ? "ON" : "OFF"}
            </Button>
            <Button 
              onClick={() => fetchHistory()} 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Odśwież teraz
            </Button>
            <Button onClick={() => router.push("/dashboard")} variant="outline">
              <Activity className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </div>
        </div>

        {/* Info o źródle danych */}
        <Alert className="border-green-700 bg-green-900/20">
          <Database className="h-4 w-4 text-green-400" />
          <AlertDescription className="text-sm text-green-200">
            ✅ Pozycje zapisywane automatycznie podczas działania bota (dane zgodne z Bybit).
            {lastRefresh && ` Ostatnia aktualizacja: ${lastRefresh.toLocaleTimeString('pl-PL')}`}
            {autoRefresh && " • Auto-odświeżanie co 10 sekund"}
          </AlertDescription>
        </Alert>

        {/* Podstawowe Statystyki */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Łącznie</CardDescription>
              <CardTitle className="text-3xl text-white">{stats.totalTrades}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Zyskowne</CardDescription>
              <CardTitle className="text-3xl text-green-400 flex items-center gap-2">
                <TrendingUp className="h-6 w-6" />
                {stats.profitable}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Stratne</CardDescription>
              <CardTitle className="text-3xl text-red-400 flex items-center gap-2">
                <TrendingDown className="h-6 w-6" />
                {stats.losses}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Win Rate</CardDescription>
              <CardTitle className="text-3xl text-white">{stats.winRate.toFixed(1)}%</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Łączny PnL</CardDescription>
              <CardTitle
                className={`text-3xl ${stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {stats.totalPnl >= 0 ? "+" : ""}
                {stats.totalPnl.toFixed(2)} USDT
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Loading */}
        {loading && (
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-3">
                <Activity className="h-8 w-8 animate-spin text-blue-400" />
                <p className="text-sm text-gray-300">Ładowanie historii pozycji...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* History List */}
        {!loading && history.length > 0 && (
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <History className="h-5 w-5" />
                Zamknięte Pozycje
              </CardTitle>
              <CardDescription>
                Dane z bazy - automatycznie zapisywane podczas działania bota
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((pos, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border-2 transition-colors ${
                      pos.pnl > 0
                        ? "border-green-500/20 bg-green-500/5"
                        : "border-red-500/20 bg-red-500/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-lg text-white">{pos.symbol}</span>
                          <Badge variant={pos.side === "Buy" ? "default" : "secondary"}>
                            {pos.side === "Buy" ? "Long" : "Short"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{pos.tier}</Badge>
                        </div>
                        <div className="text-sm text-gray-300">
                          Entry: {pos.entryPrice.toFixed(4)} → Close: {pos.closePrice.toFixed(4)} | 
                          Qty: {pos.quantity} | Leverage: {pos.leverage}x
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(pos.closedAt).toLocaleString('pl-PL')} | 
                          Duration: {Math.floor(pos.durationMinutes / 60)}h {pos.durationMinutes % 60}m
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${pos.pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {pos.pnl > 0 ? '+' : ''}{pos.pnl.toFixed(4)} USDT
                        </div>
                        <div className="text-sm text-gray-400">
                          {pos.pnlPercent > 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}% ROE
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading && history.length === 0 && (
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-3">
                <History className="h-12 w-12 text-gray-600" />
                <p className="text-lg text-gray-400">Brak historii pozycji w bazie danych</p>
                <p className="text-sm text-gray-500">Pozycje będą zapisywane automatycznie gdy bot zamknie pozycję</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}