"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, TrendingUp, TrendingDown, Activity, Database, RefreshCw, Download, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ✅ Dane z Bybit API - synchronizowane automatycznie
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
  source: "bybit" | "database";
}

export default function BotHistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [dataSource, setDataSource] = useState<"database" | "bybit">("bybit"); // ✅ Default to Bybit
  const [daysBack, setDaysBack] = useState<number>(30);

  useEffect(() => {
    fetchHistory();
  }, [dataSource, daysBack]); // ✅ Re-fetch when source or days change

  // ✅ Auto-refresh co 30 sekund (tylko gdy włączone)
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchHistory(true); // silent refresh
    }, 30000); // 30 sekund

    return () => clearInterval(interval);
  }, [autoRefresh, dataSource, daysBack]);

  const fetchHistory = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // ✅ Fetch with source parameter
      const url = `/api/bot/history?limit=100&source=${dataSource}&daysBack=${daysBack}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success && data.history) {
        setHistory(data.history);
        setLastRefresh(new Date());
        if (!silent) {
          const sourceLabel = dataSource === "bybit" ? "Bybit API (prawdziwe dane)" : "lokalnej bazy";
          toast.success(`✅ Pobrano ${data.history.length} pozycji z ${sourceLabel}`);
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

  // ✅ NOWA FUNKCJA: Import pełnych danych z Bybit
  const importFromBybit = async () => {
    setImporting(true);
    try {
      toast.loading("Importowanie danych z Bybit...", { id: "import" });
      
      // Pobierz credentials z API
      const credResponse = await fetch('/api/bot/credentials');
      const credData = await credResponse.json();
      
      if (!credData.success || !credData.credentials?.apiKey) {
        toast.error("Brak konfiguracji API Bybit", { id: "import" });
        return;
      }

      // Importuj ostatnie 30 dni historii z Bybit
      const importResponse = await fetch('/api/bot/import-bybit-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: credData.credentials.apiKey,
          apiSecret: credData.credentials.apiSecret,
          daysBack: 30,
        }),
      });

      const importData = await importResponse.json();

      if (importData.success) {
        toast.success(
          `✅ Zaimportowano ${importData.imported} nowych pozycji z Bybit (${importData.skipped} już w bazie)`,
          { id: "import", duration: 5000 }
        );
        // Odśwież listę po imporcie
        await fetchHistory();
      } else {
        toast.error(`❌ Import nie powiódł się: ${importData.message}`, { id: "import" });
      }
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Błąd importu danych z Bybit", { id: "import" });
    } finally {
      setImporting(false);
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
                {dataSource === "bybit" ? (
                  <>
                    <Wifi className="h-4 w-4 text-green-400" />
                    <span className="text-green-400 font-semibold">PRAWDZIWE DANE z Bybit API</span>
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 text-blue-400" />
                    Dane z lokalnej bazy
                  </>
                )}
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

        {/* Kontrolki źródła danych */}
        <Card className="border-blue-700 bg-blue-900/20">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-blue-100">⚙️ Ustawienia Źródła Danych</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Source selector */}
              <div className="space-y-2">
                <label className="text-sm text-gray-300">Źródło danych:</label>
                <Select value={dataSource} onValueChange={(v) => setDataSource(v as "database" | "bybit")}>
                  <SelectTrigger className="bg-gray-900/60 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bybit">
                      <div className="flex items-center gap-2">
                        <Wifi className="h-4 w-4 text-green-400" />
                        <span>Bybit API (prawdziwe)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="database">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-blue-400" />
                        <span>Lokalna baza danych</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Days back selector (only for Bybit) */}
              {dataSource === "bybit" && (
                <div className="space-y-2">
                  <label className="text-sm text-gray-300">Okres:</label>
                  <Select value={daysBack.toString()} onValueChange={(v) => setDaysBack(parseInt(v))}>
                    <SelectTrigger className="bg-gray-900/60 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Ostatnie 7 dni</SelectItem>
                      <SelectItem value="30">Ostatnie 30 dni</SelectItem>
                      <SelectItem value="90">Ostatnie 90 dni</SelectItem>
                      <SelectItem value="180">Ostatnie 180 dni</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

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
                <label className="text-sm text-gray-300">Akcje:</label>
                <Button 
                  onClick={() => fetchHistory()} 
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Odśwież
                </Button>
              </div>
            </div>

            {/* Info text */}
            <div className="mt-4 text-sm text-gray-400">
              {dataSource === "bybit" ? (
                <>
                  <Wifi className="inline h-4 w-4 text-green-400 mr-1" />
                  <strong>Bybit API:</strong> Pobiera prawdziwe dane bezpośrednio z giełdy Bybit. 
                  Zawsze aktualne, zawiera wszystkie pozycje z konta.
                </>
              ) : (
                <>
                  <Database className="inline h-4 w-4 text-blue-400 mr-1" />
                  <strong>Lokalna baza:</strong> Pozycje zapisane przez bota podczas działania. 
                  Kliknij "Import z Bybit" poniżej aby zsynchronizować.
                </>
              )}
              {lastRefresh && ` • Ostatnia aktualizacja: ${lastRefresh.toLocaleTimeString('pl-PL')}`}
            </div>
          </CardContent>
        </Card>

        {/* Info o synchronizacji (tylko dla database mode) */}
        {dataSource === "database" && (
          <Alert className="border-purple-700 bg-purple-900/20">
            <Download className="h-4 w-4 text-purple-400" />
            <AlertDescription className="text-sm text-purple-200">
              💡 <strong>Import danych:</strong> Baza lokalna może być niekompletna. 
              Kliknij <strong>"Import z Bybit"</strong> poniżej aby zsynchronizować pełną historię z giełdy.
              <Button 
                onClick={importFromBybit} 
                disabled={importing}
                className="ml-4 bg-purple-600 hover:bg-purple-700"
                size="sm"
              >
                <Download className={`mr-2 h-4 w-4 ${importing ? 'animate-bounce' : ''}`} />
                {importing ? "Importowanie..." : "Import z Bybit"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

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
                <p className="text-sm text-gray-300">
                  Ładowanie danych z {dataSource === "bybit" ? "Bybit API" : "lokalnej bazy"}...
                </p>
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
                {dataSource === "bybit" && (
                  <Badge className="ml-2 bg-green-600">
                    <Wifi className="h-3 w-3 mr-1" />
                    LIVE DATA
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {dataSource === "bybit" 
                  ? `Prawdziwe dane z Bybit API - ostatnie ${daysBack} dni`
                  : "Dane z lokalnej bazy - może wymagać synchronizacji"}
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
                <p className="text-lg text-gray-400">
                  {dataSource === "bybit" 
                    ? "Brak zamkniętych pozycji w wybranym okresie na Bybit"
                    : "Brak historii pozycji w bazie danych"}
                </p>
                {dataSource === "database" && (
                  <>
                    <p className="text-sm text-gray-500">Kliknij "Import z Bybit" aby pobrać historię z Bybit API</p>
                    <Button 
                      onClick={importFromBybit} 
                      disabled={importing}
                      className="mt-4 bg-purple-600 hover:bg-purple-700"
                    >
                      <Download className={`mr-2 h-4 w-4 ${importing ? 'animate-bounce' : ''}`} />
                      {importing ? "Importowanie..." : "Import z Bybit"}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}