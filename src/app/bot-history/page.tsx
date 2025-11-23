"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, TrendingUp, TrendingDown, Activity, Filter, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface HistoryPosition {
  id: number;
  positionId: number;
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
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  confirmationCount: number;
  openedAt: string;
  closedAt: string;
  durationMinutes: number;
  status?: string;
}

export default function BotHistoryPage() {
  const [positions, setPositions] = useState<HistoryPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "profitable" | "loss">("all");
  const [closeReasonFilter, setCloseReasonFilter] = useState<string>("all");
  const [importingHistory, setImportingHistory] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const positionsResponse = await fetch("/api/bot/history");
      const positionsData = await positionsResponse.json();

      if (positionsData.success && Array.isArray(positionsData.history)) {
        const closedOnly = positionsData.history.filter((p: HistoryPosition) => 
          !p.status || p.status !== 'open'
        );
        setPositions(closedOnly);
        console.log(`[Historia] Załadowano ${closedOnly.length} zamkniętych pozycji (odfiltrowano ${positionsData.history.length - closedOnly.length} otwartych)`);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleImportBybitHistory = async () => {
    setImportingHistory(true);
    try {
      // Get credentials from localStorage
      const stored = localStorage.getItem("exchange_credentials");
      if (!stored) {
        toast.error("❌ Brak konfiguracji API Bybit");
        return;
      }

      const creds = JSON.parse(stored);
      if (!creds.apiKey || !creds.apiSecret) {
        toast.error("❌ Nieprawidłowe dane API");
        return;
      }

      toast.info("🔄 Importowanie historii z Bybit...");

      const response = await fetch("/api/bot/import-bybit-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          daysBack: 30, // Last 30 days
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(
          `✅ Import zakończony!\n${data.imported} nowych pozycji\n${data.skipped} już w historii`
        );
        await fetchHistory(); // Refresh history
      } else {
        toast.error(`❌ Błąd: ${data.message}`);
      }
    } catch (err) {
      toast.error(`❌ Błąd importu: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      setImportingHistory(false);
    }
  };

  // Calculate statistics
  const stats = {
    totalTrades: positions.length,
    profitable: positions.filter((p) => p.pnl > 0).length,
    losses: positions.filter((p) => p.pnl < 0).length,
    totalPnl: positions.reduce((sum, p) => sum + p.pnl, 0),
    winRate:
      positions.length > 0
        ? (positions.filter((p) => p.pnl > 0).length / positions.length) * 100
        : 0,
  };

  // Filter positions
  const filteredPositions = positions.filter((p) => {
    if (filter === "profitable" && p.pnl <= 0) return false;
    if (filter === "loss" && p.pnl >= 0) return false;
    if (closeReasonFilter !== "all" && p.closeReason !== closeReasonFilter) return false;
    return true;
  });

  // Get unique close reasons
  const closeReasons = Array.from(new Set(positions.map((p) => p.closeReason)));

  // ✅ ULEPSZONE ETYKIETY - dokładniejszy opis
  const closeReasonLabels: Record<string, string> = {
    // TP/SL Reasons
    sl_hit: "🛑 Stop Loss",
    tp_main_hit: "🎯 Take Profit (Main)",
    tp1_hit: "🎯 TP1",
    tp2_hit: "🎯 TP2", 
    tp3_hit: "🎯 TP3",
    
    // Manual Closes
    manual_close: "👤 Ręczne zamknięcie",
    manual_close_all: "👤 Ręczne zamknięcie wszystkich",
    closed_on_exchange: "🔄 Zamknięte na giełdzie (ręcznie)",
    
    // Alert-driven Closes
    emergency_override: "⚠️ Emergency Override (silniejszy alert przejął kontrolę)",
    opposite_direction: "🔄 Odwrócenie kierunku (alert w przeciwną stronę)",
    
    // Oko Saurona Actions
    oko_emergency: "👁️ Oko Saurona - Emergency Close",
    oko_sl_breach: "👁️ Oko Saurona - SL Breach Detection",
    oko_account_drawdown: "👁️ Oko Saurona - Account Drawdown Protection",
    oko_time_based_exit: "👁️ Oko Saurona - Time-Based Exit",
    
    // System Actions
    ghost_position_cleanup: "👻 Ghost Position Cleanup",
    emergency_verification_failure: "⚠️ Emergency Verification Failure",
    migrated: "🔄 Migracja danych",
  };

  const getCloseReasonLabel = (reason: string) => {
    return closeReasonLabels[reason] || `❓ ${reason}`;
  };

  // ✅ POPRAWIONY FORMAT CZASU
  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours < 24) {
      if (mins > 0) {
        return `${hours}h ${mins}min`;
      }
      return `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return `${days}d ${remainingHours}h`;
    }
    return `${days}d`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-600/30 to-amber-900/20 border border-amber-500/30">
              <History className="h-8 w-8 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Historia Pozycji
              </h1>
              <p className="text-gray-200">
                Zamknięte pozycje tradingowe
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleImportBybitHistory} 
              disabled={importingHistory}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Download className="mr-2 h-4 w-4" />
              {importingHistory ? "Importowanie..." : "Import z Bybit"}
            </Button>
            <Button onClick={fetchHistory} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
              <History className="mr-2 h-4 w-4" />
              Odśwież
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
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
                {stats.totalPnl.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-white">
                <Filter className="h-5 w-5" />
                Filtry
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter("all");
                  setCloseReasonFilter("all");
                }}
                className="border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-200"
              >
                Wyczyść
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block text-gray-200">Typ</label>
                <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    <SelectItem value="profitable">Tylko Zyskowne</SelectItem>
                    <SelectItem value="loss">Tylko Stratne</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block text-gray-200">Powód Zamknięcia</label>
                <Select value={closeReasonFilter} onValueChange={setCloseReasonFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    {closeReasons.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {getCloseReasonLabel(reason)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Closed Positions */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Activity className="h-5 w-5" />
              Zamknięte Pozycje
              <Badge variant="secondary" className="bg-gray-700 text-gray-200">{filteredPositions.length}</Badge>
            </CardTitle>
            <CardDescription className="text-gray-300">
              Historia zamkniętych pozycji (tylko closed positions)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="text-center py-8">
                <Activity className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-500" />
                <p className="text-sm text-gray-300">Ładowanie...</p>
              </div>
            )}

            {!loading && filteredPositions.length === 0 && (
              <div className="text-center py-8">
                <History className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-gray-300">
                  Brak pozycji
                </p>
              </div>
            )}

            {!loading && filteredPositions.length > 0 && (
              <div className="space-y-3">
                {filteredPositions.map((position) => {
                  const isProfitable = position.pnl > 0;

                  const tierColors: Record<string, string> = {
                    Platinum: "bg-purple-500/10 text-purple-300 border-purple-500/50",
                    Premium: "bg-blue-500/10 text-blue-300 border-blue-500/50",
                    Standard: "bg-green-500/10 text-green-300 border-green-500/50",
                    Quick: "bg-orange-500/10 text-orange-300 border-orange-500/50",
                    Emergency: "bg-red-500/10 text-red-300 border-red-500/50",
                  };

                  return (
                    <div
                      key={position.id}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        isProfitable
                          ? "border-green-500/20 bg-green-500/5"
                          : "border-red-500/20 bg-red-500/5"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-white">{position.symbol}</span>
                            <Badge variant="outline" className={tierColors[position.tier] || ""}>
                              {position.tier}
                            </Badge>
                            <Badge
                              variant={position.side === "Buy" ? "default" : "secondary"}
                              className={
                                position.side === "Buy"
                                  ? "bg-green-500"
                                  : "bg-red-500"
                              }
                            >
                              {position.side === "Buy" ? "LONG" : "SHORT"} {position.leverage}x
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-300 mb-1">
                            {getCloseReasonLabel(position.closeReason)}
                          </div>
                          {/* ✅ NOWE: Czas otwarcia */}
                          <div className="text-xs text-gray-400">
                            Otwarto: {new Date(position.openedAt).toLocaleString("pl-PL")}
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`text-xl font-bold ${
                              isProfitable ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {isProfitable ? "+" : ""}
                            {position.pnl.toFixed(4)} USDT
                          </div>
                          <div
                            className={`text-sm font-semibold ${
                              isProfitable ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            ({isProfitable ? "+" : ""}
                            {position.pnlPercent.toFixed(2)}%)
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                        <div>
                          <div className="text-gray-300">Wejście</div>
                          <div className="font-semibold text-white">{position.entryPrice.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-gray-300">Wyjście</div>
                          <div className="font-semibold text-white">
                            {position.closePrice && position.closePrice > 0 
                              ? position.closePrice.toFixed(4) 
                              : "N/A"}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-300">Rozmiar</div>
                          <div className="font-semibold text-white">
                            {position.quantity && position.quantity > 0 
                              ? position.quantity.toFixed(4) 
                              : "N/A"}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-300">Czas</div>
                          <div className="font-semibold text-white">
                            {formatDuration(position.durationMinutes)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-300">
                        <span>
                          Zamknięto: {new Date(position.closedAt).toLocaleString("pl-PL")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}