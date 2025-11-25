"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, TrendingUp, TrendingDown, Activity, Database, RefreshCw, Download, AlertTriangle, CheckCircle, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ✅ v4.0.0 - FEES SUPPORT: Show trading + funding fees
interface HistoryPosition {
  id: string;
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  closePrice: number;
  quantity: number;
  leverage: number;
  pnl: number; // NET PNL (after fees)
  grossPnl?: number; // GROSS PNL (before fees)
  tradingFees?: number;
  fundingFees?: number;
  totalFees?: number;
  pnlPercent: number;
  closeReason: string;
  openedAt: string;
  closedAt: string;
  durationMinutes: number;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  tp3Hit?: boolean;
  partialCloseCount?: number;
}

interface DiagnosisResult {
  success: boolean;
  analysis: {
    summary: {
      database: {
        count: number;
        totalPnl: number;
        profitable: number;
        losses: number;
        winRate: number;
      };
      bybit: {
        count: number;
        totalPnl: number;
        profitable: number;
        losses: number;
        winRate: number;
      };
      discrepancy: {
        countDiff: number;
        pnlDiff: number;
      };
    };
    duplicates: {
      count: number;
      totalDuplicatedPositions: number;
    };
    missingFromBybit: {
      count: number;
      totalPnl: number;
    };
    missingFromDb: {
      count: number;
      totalPnl: number;
    };
  };
  recommendations: string[];
}

export default function BotHistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showDiagnosisDialog, setShowDiagnosisDialog] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [filteredFundingCount, setFilteredFundingCount] = useState<number>(0);

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
        const message = data.filtered 
          ? `✅ ${data.message}\n🚫 Odfiltrowano ${data.filtered} transakcji fundingu`
          : `✅ ${data.message}`;
        
        toast.success(
          message,
          { id: "sync", duration: 5000 }
        );
        
        // Store filtered count for display
        if (data.filtered) {
          setFilteredFundingCount(data.filtered);
        }
        
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

  // ✅ NEW: Diagnose mismatch
  const runDiagnosis = async () => {
    setDiagnosing(true);
    try {
      toast.loading("🔍 Diagnozowanie rozbieżności...", { id: "diagnose" });
      
      const response = await fetch('/api/bot/diagnose-history-mismatch');
      const data = await response.json();

      if (data.success) {
        setDiagnosisResult(data);
        setShowDiagnosisDialog(true);
        toast.success("✅ Diagnoza zakończona", { id: "diagnose" });
      } else {
        toast.error(`❌ Błąd diagnozy: ${data.message}`, { id: "diagnose" });
      }
    } catch (err) {
      console.error("Diagnosis error:", err);
      toast.error("❌ Błąd diagnozy", { id: "diagnose" });
    } finally {
      setDiagnosing(false);
    }
  };

  // ✅ ENHANCED STATS: Include fees breakdown
  const stats = {
    totalTrades: history.length,
    profitable: history.filter(h => h.pnl > 0).length,
    losses: history.filter(h => h.pnl < 0).length,
    totalPnl: history.reduce((sum, h) => sum + h.pnl, 0),
    totalGrossPnl: history.reduce((sum, h) => sum + (h.grossPnl || h.pnl), 0),
    totalTradingFees: history.reduce((sum, h) => sum + (h.tradingFees || 0), 0),
    totalFundingFees: history.reduce((sum, h) => sum + (h.fundingFees || 0), 0),
    totalFees: history.reduce((sum, h) => sum + (h.totalFees || 0), 0),
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  {syncing ? "Synchronizowanie..." : "Synchronizuj"}
                </Button>
              </div>

              {/* Diagnose button */}
              <div className="space-y-2">
                <label className="text-sm text-gray-300">Diagnostyka:</label>
                <Button 
                  onClick={runDiagnosis} 
                  disabled={diagnosing}
                  variant="outline"
                  className="w-full border-orange-600 text-orange-400 hover:bg-orange-900/20"
                >
                  <AlertTriangle className={`mr-2 h-4 w-4 ${diagnosing ? 'animate-pulse' : ''}`} />
                  {diagnosing ? "Diagnozowanie..." : "Diagnozuj"}
                </Button>
              </div>
            </div>

            {/* Info text */}
            <div className="mt-4 p-3 rounded-lg bg-purple-900/30 border border-purple-700/50">
              <p className="text-sm text-purple-200">
                <Download className="inline h-4 w-4 text-purple-400 mr-1" />
                <strong>Synchronizuj:</strong> Usuwa wszystkie pozycje z lokalnej bazy i importuje 
                świeżą historię z Bybit (ostatnie 30 dni) wraz z opłatami transakcyjnymi i fundingowymi.
                <br />
                <span className="text-purple-300 text-xs mt-1 block">
                  🔍 Automatycznie filtruje transakcje fundingu (krótsze niż 10s bez ruchu ceny)
                </span>
              </p>
            </div>

            {filteredFundingCount > 0 && (
              <div className="mt-2 p-3 rounded-lg bg-blue-900/30 border border-blue-700/50">
                <p className="text-sm text-blue-200">
                  <CheckCircle className="inline h-4 w-4 text-blue-400 mr-1" />
                  <strong>Ostatnia synchronizacja:</strong> Odfiltrowano {filteredFundingCount} transakcji fundingu
                </p>
              </div>
            )}

            <div className="mt-2 p-3 rounded-lg bg-orange-900/30 border border-orange-700/50">
              <p className="text-sm text-orange-200">
                <AlertTriangle className="inline h-4 w-4 text-orange-400 mr-1" />
                <strong>Diagnozuj:</strong> Porównuje dane w lokalnej bazie z Bybit API i pokazuje 
                rozbieżności (duplikaty, brakujące pozycje, różnice w PnL).
              </p>
            </div>

            {lastRefresh && (
              <div className="mt-2 text-xs text-gray-400 text-center">
                Ostatnia aktualizacja: {lastRefresh.toLocaleTimeString('pl-PL')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ✅ ENHANCED STATISTICS: Show fees breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
              <CardDescription className="text-gray-300">Net PnL</CardDescription>
              <CardTitle
                className={`text-3xl ${stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {stats.totalPnl >= 0 ? "+" : ""}
                {stats.totalPnl.toFixed(2)}
              </CardTitle>
              <CardDescription className="text-xs text-gray-400">
                po opłatach
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-yellow-800 bg-yellow-900/20 backdrop-blur-sm hover:bg-yellow-900/30 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-yellow-300 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Opłaty
              </CardDescription>
              <CardTitle className="text-3xl text-yellow-400">
                -{stats.totalFees.toFixed(2)}
              </CardTitle>
              <CardDescription className="text-xs text-yellow-300/70">
                trading + funding
              </CardDescription>
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

        {/* ✅ ENHANCED HISTORY LIST: Show fees per position */}
        {!loading && history.length > 0 && (
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <History className="h-5 w-5" />
                Zamknięte Pozycje ({history.length})
              </CardTitle>
              <CardDescription>
                Net PnL uwzględnia opłaty transakcyjne i fundingowe pobrane z Bybit transaction log
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((pos, idx) => {
                  const hasFeeData = (pos.tradingFees !== undefined && pos.fundingFees !== undefined);
                  
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        pos.pnl > 0
                          ? "border-green-500/20 bg-green-500/5"
                          : "border-red-500/20 bg-red-500/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-lg text-white">{pos.symbol}</span>
                            <Badge variant={pos.side === "Buy" ? "default" : "secondary"}>
                              {pos.side === "Buy" ? "Long" : "Short"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{pos.tier}</Badge>
                            
                            {(pos.tp1Hit || pos.tp2Hit || pos.tp3Hit) && (
                              <div className="flex items-center gap-1 ml-2">
                                {pos.tp1Hit && (
                                  <Badge className="bg-green-600/20 text-green-300 border-green-500/50 text-xs">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    TP1
                                  </Badge>
                                )}
                                {pos.tp2Hit && (
                                  <Badge className="bg-green-600/20 text-green-300 border-green-500/50 text-xs">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    TP2
                                  </Badge>
                                )}
                                {pos.tp3Hit && (
                                  <Badge className="bg-green-600/20 text-green-300 border-green-500/50 text-xs">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    TP3
                                  </Badge>
                                )}
                              </div>
                            )}
                            
                            {pos.partialCloseCount && pos.partialCloseCount > 1 && (
                              <Badge variant="outline" className="text-xs text-amber-300 border-amber-500/50">
                                {pos.partialCloseCount} częściowych zamknięć
                              </Badge>
                            )}
                          </div>
                          
                          <div className="text-sm text-gray-300">
                            Entry: {pos.entryPrice.toFixed(4)} → Close: {pos.closePrice.toFixed(4)} | 
                            Qty: {pos.quantity} | Leverage: {pos.leverage}x
                          </div>
                          
                          <div className="text-xs text-gray-400 mt-1">
                            {new Date(pos.closedAt).toLocaleString('pl-PL')} | 
                            Duration: {Math.floor(pos.durationMinutes / 60)}h {pos.durationMinutes % 60}m
                          </div>

                          {/* ✅ SHOW FEES BREAKDOWN */}
                          {hasFeeData && (
                            <div className="mt-2 p-2 rounded bg-gray-800/50 border border-gray-700/50">
                              <div className="grid grid-cols-3 gap-3 text-xs">
                                <div>
                                  <div className="text-gray-400">Gross PnL:</div>
                                  <div className={`font-semibold ${(pos.grossPnl || pos.pnl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {(pos.grossPnl || pos.pnl) >= 0 ? '+' : ''}{(pos.grossPnl || pos.pnl).toFixed(4)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-gray-400">Trading:</div>
                                  <div className="font-semibold text-yellow-400">
                                    -{(pos.tradingFees || 0).toFixed(4)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-gray-400">Funding:</div>
                                  <div className="font-semibold text-orange-400">
                                    -{(pos.fundingFees || 0).toFixed(4)}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2 pt-2 border-t border-gray-700/50 flex justify-between items-center">
                                <div className="text-xs text-gray-400">Total Fees:</div>
                                <div className="text-xs font-bold text-red-400">
                                  -{(pos.totalFees || 0).toFixed(4)} USDT
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="text-right">
                          <div className={`text-xl font-bold ${pos.pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {pos.pnl > 0 ? '+' : ''}{pos.pnl.toFixed(4)} USDT
                          </div>
                          <div className="text-sm text-gray-400">
                            {pos.pnlPercent > 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}% ROE
                          </div>
                          {hasFeeData && (
                            <div className="mt-1 text-xs text-yellow-300/70">
                              (po opłatach)
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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

        {/* Diagnosis Dialog */}
        <Dialog open={showDiagnosisDialog} onOpenChange={setShowDiagnosisDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-400" />
                Raport Diagnostyczny - Rozbieżności w Danych
              </DialogTitle>
              <DialogDescription className="text-gray-300">
                Porównanie danych w lokalnej bazie z danymi z Bybit API
              </DialogDescription>
            </DialogHeader>

            {diagnosisResult && (
              <div className="space-y-4">
                {/* Summary Comparison */}
                <div className="grid grid-cols-2 gap-4">
                  <Card className="border-blue-700 bg-blue-900/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-blue-300">📊 Lokalna Baza</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-300">Pozycje:</span>
                        <span className="text-white font-bold">{diagnosisResult.analysis.summary.database.count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Zyskowne:</span>
                        <span className="text-green-400">{diagnosisResult.analysis.summary.database.profitable}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Stratne:</span>
                        <span className="text-red-400">{diagnosisResult.analysis.summary.database.losses}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Win Rate:</span>
                        <span className="text-white">{diagnosisResult.analysis.summary.database.winRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Total PnL:</span>
                        <span className={diagnosisResult.analysis.summary.database.totalPnl >= 0 ? "text-green-400" : "text-red-400"}>
                          {diagnosisResult.analysis.summary.database.totalPnl >= 0 ? "+" : ""}
                          {diagnosisResult.analysis.summary.database.totalPnl.toFixed(2)} USDT
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-purple-700 bg-purple-900/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-purple-300">🌐 Bybit API</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-300">Pozycje:</span>
                        <span className="text-white font-bold">{diagnosisResult.analysis.summary.bybit.count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Zyskowne:</span>
                        <span className="text-green-400">{diagnosisResult.analysis.summary.bybit.profitable}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Stratne:</span>
                        <span className="text-red-400">{diagnosisResult.analysis.summary.bybit.losses}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Win Rate:</span>
                        <span className="text-white">{diagnosisResult.analysis.summary.bybit.winRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Total PnL:</span>
                        <span className={diagnosisResult.analysis.summary.bybit.totalPnl >= 0 ? "text-green-400" : "text-red-400"}>
                          {diagnosisResult.analysis.summary.bybit.totalPnl >= 0 ? "+" : ""}
                          {diagnosisResult.analysis.summary.bybit.totalPnl.toFixed(2)} USDT
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Discrepancy */}
                <Card className="border-orange-700 bg-orange-900/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-orange-300">⚠️ Rozbieżności</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Różnica w liczbie pozycji:</span>
                      <span className={`font-bold ${diagnosisResult.analysis.summary.discrepancy.countDiff === 0 ? "text-green-400" : "text-orange-400"}`}>
                        {diagnosisResult.analysis.summary.discrepancy.countDiff > 0 ? "+" : ""}
                        {diagnosisResult.analysis.summary.discrepancy.countDiff}
                        {diagnosisResult.analysis.summary.discrepancy.countDiff === 0 && <CheckCircle className="inline h-4 w-4 ml-1" />}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Różnica w PnL:</span>
                      <span className={`font-bold ${Math.abs(diagnosisResult.analysis.summary.discrepancy.pnlDiff) < 0.01 ? "text-green-400" : "text-orange-400"}`}>
                        {diagnosisResult.analysis.summary.discrepancy.pnlDiff > 0 ? "+" : ""}
                        {diagnosisResult.analysis.summary.discrepancy.pnlDiff.toFixed(2)} USDT
                        {Math.abs(diagnosisResult.analysis.summary.discrepancy.pnlDiff) < 0.01 && <CheckCircle className="inline h-4 w-4 ml-1" />}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Issues Found */}
                <div className="grid grid-cols-3 gap-4">
                  <Card className={`${diagnosisResult.analysis.duplicates.count > 0 ? "border-red-700 bg-red-900/20" : "border-green-700 bg-green-900/20"}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-gray-300">Duplikaty</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white mb-1">
                        {diagnosisResult.analysis.duplicates.totalDuplicatedPositions}
                      </div>
                      <div className="text-xs text-gray-400">
                        {diagnosisResult.analysis.duplicates.count} grup duplikatów
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`${diagnosisResult.analysis.missingFromBybit.count > 0 ? "border-yellow-700 bg-yellow-900/20" : "border-green-700 bg-green-900/20"}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-gray-300">Tylko w DB</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white mb-1">
                        {diagnosisResult.analysis.missingFromBybit.count}
                      </div>
                      <div className="text-xs text-gray-400">
                        {diagnosisResult.analysis.missingFromBybit.totalPnl.toFixed(2)} USDT PnL
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`${diagnosisResult.analysis.missingFromDb.count > 0 ? "border-yellow-700 bg-yellow-900/20" : "border-green-700 bg-green-900/20"}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-gray-300">Tylko na Bybit</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white mb-1">
                        {diagnosisResult.analysis.missingFromDb.count}
                      </div>
                      <div className="text-xs text-gray-400">
                        {diagnosisResult.analysis.missingFromDb.totalPnl.toFixed(2)} USDT PnL
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recommendations */}
                {diagnosisResult.recommendations.length > 0 && (
                  <Card className="border-orange-700 bg-orange-900/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-orange-300">💡 Rekomendacje</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {diagnosisResult.recommendations.map((rec, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm text-orange-200">
                          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{rec}</span>
                        </div>
                      ))}
                      
                      <div className="mt-4 pt-4 border-t border-orange-700/50">
                        <Button 
                          onClick={() => {
                            setShowDiagnosisDialog(false);
                            syncWithBybit();
                          }}
                          className="w-full bg-purple-600 hover:bg-purple-700"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Wykonaj Pełną Synchronizację
                        </Button>
                        <p className="text-xs text-gray-400 mt-2 text-center">
                          To usunie wszystkie dane z lokalnej bazy i zaimportuje świeże dane z Bybit
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}