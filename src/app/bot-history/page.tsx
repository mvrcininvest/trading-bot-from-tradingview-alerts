"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, TrendingUp, TrendingDown, Activity, Database, RefreshCw, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// ✅ v3.0.0 - SIMPLIFIED: One button, local database only
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
}

export default function BotHistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  // ✅ Auto-refresh co 30 sekund (tylko gdy włączone)
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchHistory(true); // silent refresh
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchHistory = async (silent = false) => {
    if (!silent) setLoading(true);
    
    try {
      // ✅ ALWAYS fetch from local database
      const response = await fetch('/api/bot/history?limit=100&source=database');
      const data = await response.json();
      
      if (data.success && data.history) {
        setHistory(data.history);
        setLastRefresh(new Date());
        if (!silent) {
          toast.success(`✅ Pobrano ${data.history.length} pozycji z lokalnej bazy`);
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

  // ✅ NEW: Full sync with Bybit (delete all + import fresh)
  const syncWithBybit = async () => {
    setSyncing(true);
    try {
      toast.loading("🔄 Synchronizacja z Bybit...", { id: "sync" });
      
      const response = await fetch('/api/bot/sync-bybit-history', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        toast.success(
          `✅ ${data.message}`,
          { id: "sync", duration: 5000 }
        );
        // Refresh list
        await fetchHistory();
      } else {
        toast.error(`❌ Synchronizacja nie powiodła się: ${data.message}`, { id: "sync" });
      }
    } catch (err) {
      console.error("Sync error:", err);
      toast.error("❌ Błąd synchronizacji z Bybit", { id: "sync" });
    } finally {
      setSyncing(false);
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
              <p className="text-gray-200 flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-400" />
                Dane z lokalnej bazy danych
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => router.push("/dashboard")} variant="outline">
              <Activity className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </div>
        </div>

        {/* Kontrolki */}
        <Card className="border-blue-700 bg-blue-900/20">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-blue-100">⚙️ Ustawienia i Synchronizacja</CardTitle>
            <CardDescription className="text-gray-300">
              Lokalna baza zawiera pozycje zapisane przez bota lub zsynchronizowane z Bybit
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Auto-refresh toggle */}
              <div className="space-y-2">
                <label className="text-sm text-gray-300">Auto-odświeżanie:</label>
                <Button 
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  variant={autoRefresh ? "default" : "outline"}
                  className={`w-full ${autoRefresh ? "bg-green-600 hover:bg-green-700" : ""}`}
                >
                  <Activity className={`mr-2 h-4 w-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
                  {autoRefresh ? "ON (30s)" : "OFF"}
                </Button>
              </div>

              {/* Refresh button */}
              <div className="space-y-2">
                <label className="text-sm text-gray-300">Odśwież dane:</label>
                <Button 
                  onClick={() => fetchHistory()} 
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Odśwież
                </Button>
              </div>

              {/* Sync with Bybit button */}
              <div className="space-y-2">
                <label className="text-sm text-gray-300">Synchronizacja:</label>
                <Button 
                  onClick={syncWithBybit} 
                  disabled={syncing}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Download className={`mr-2 h-4 w-4 ${syncing ? 'animate-bounce' : ''}`} />
                  {syncing ? "Synchronizowanie..." : "Synchronizuj z Bybit"}
                </Button>
              </div>
            </div>

            {/* Info text */}
            <div className="mt-4 p-3 rounded-lg bg-purple-900/30 border border-purple-700/50">
              <p className="text-sm text-purple-200">
                <Download className="inline h-4 w-4 text-purple-400 mr-1" />
                <strong>Synchronizuj z Bybit:</strong> Usuwa wszystkie pozycje z lokalnej bazy i importuje 
                świeżą historię z giełdy Bybit (ostatnie 30 dni). Użyj tego gdy chcesz zaktualizować dane 
                z prawdziwej giełdy.
              </p>
            </div>

            {lastRefresh && (
              <div className="mt-2 text-xs text-gray-400 text-center">
                Ostatnia aktualizacja: {lastRefresh.toLocaleTimeString('pl-PL')}
              </div>
            )}
          </CardContent>
        </Card>

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
                <p className="text-sm text-gray-300">Ładowanie danych z lokalnej bazy...</p>
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
                Zamknięte Pozycje ({history.length})
              </CardTitle>
              <CardDescription>
                Pozycje z lokalnej bazy danych - kliknij "Synchronizuj z Bybit" aby zaktualizować
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
                <p className="text-sm text-gray-500">Kliknij "Synchronizuj z Bybit" aby pobrać historię z giełdy</p>
                <Button 
                  onClick={syncWithBybit} 
                  disabled={syncing}
                  className="mt-4 bg-purple-600 hover:bg-purple-700"
                >
                  <Download className={`mr-2 h-4 w-4 ${syncing ? 'animate-bounce' : ''}`} />
                  {syncing ? "Synchronizowanie..." : "Synchronizuj z Bybit"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}