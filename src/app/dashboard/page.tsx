"use client";

// FORCE VERCEL REBUILD - Timestamp: 2025-11-25T13:00:00.000Z
// Build Hash: v6.0.0-fix-window-confirm

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Wallet, RefreshCw, AlertCircle, Settings, Activity, Bot, X, FileText, Clock, Target, TrendingDown, Percent, DollarSign, Zap, Download, Database, CheckCircle2, XCircle, BarChart3, Award, AlertTriangle, History } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

interface ExchangeCredentials {
  exchange: "bybit";
  apiKey: string;
  apiSecret: string;
  environment: "mainnet";
  savedAt: string;
}

interface BotPosition {
  id: number;
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  quantity: number;
  leverage: number;
  stopLoss: number;
  mainTpPrice: number;
  unrealisedPnl: number;
  confirmationCount: number;
  openedAt: string;
  status: string;
  liveSlPrice?: number | null;
  liveTp1Price?: number | null;
  liveTp2Price?: number | null;
  liveTp3Price?: number | null;
  alertData?: string | null;
}

interface SymbolLock {
  id: number;
  symbol: string;
  lockReason: string;
  failureCount: number;
  lockedAt: string;
  unlockedAt: string | null;
}

interface HistoryStats {
  totalPositions: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<ExchangeCredentials | null>(null);
  const [isCheckingCredentials, setIsCheckingCredentials] = useState(true);
  const [botPositions, setBotPositions] = useState<BotPosition[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [botEnabled, setBotEnabled] = useState<boolean | null>(null);
  const [symbolLocks, setSymbolLocks] = useState<SymbolLock[]>([]);
  const [loadingSync, setLoadingSync] = useState(false);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [selectedAlertData, setSelectedAlertData] = useState<any>(null);
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [loadingAlertMatch, setLoadingAlertMatch] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyStats, setHistoryStats] = useState<HistoryStats | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [positionToClose, setPositionToClose] = useState<{ symbol: string; positionId: number } | null>(null);

  const fetchHistoryStats = useCallback(async (silent = false) => {
    if (!silent) setLoadingHistory(true);
    
    try {
      const response = await fetch("/api/bot/history?limit=1000&source=database");
      const data = await response.json();
      
      if (data.success && data.stats) {
        setHistoryStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch history stats:", err);
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  }, []);

  const autoMatchAlertsToOpen = useCallback(async () => {
    try {
      const response = await fetch("/api/bot/match-alerts-to-open", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success && data.matched > 0) {
        toast.success(`🔗 Dopasowano ${data.matched} alertów do otwartych pozycji`);
        await fetchBotPositions();
      }
    } catch (err) {
      console.error("[Dashboard] Błąd dopasowania alertów:", err);
    }
  }, []);

  const fetchBotPositions = useCallback(async (silent = false) => {
    if (!silent) setLoadingPositions(true);

    try {
      const response = await fetch("/api/bot/positions");
      const data = await response.json();

      if (data.success && Array.isArray(data.positions)) {
        const openPositions = data.positions.filter((p: BotPosition) => p.status === 'open');
        setBotPositions(openPositions);
      }
    } catch (err) {
      console.error("Failed to fetch bot positions:", err);
    } finally {
      if (!silent) setLoadingPositions(false);
    }
  }, []);

  const fetchSymbolLocks = async () => {
    try {
      const response = await fetch("/api/bot/diagnostics/locks");
      const data = await response.json();
      if (data.success) {
        const activeLocks = data.locks.filter((lock: SymbolLock) => !lock.unlockedAt);
        setSymbolLocks(activeLocks);
      }
    } catch (error) {
      console.error("Failed to fetch symbol locks:", error);
    }
  };

  const fetchBotStatus = async (silent = false) => {
    try {
      const response = await fetch("/api/bot/settings");
      const data = await response.json();
      
      if (data.success && data.settings) {
        setBotEnabled(data.settings.botEnabled);
      }
    } catch (err) {
      if (!silent) {
        console.error("Failed to fetch bot status:", err);
      }
    }
  };

  useEffect(() => {
    const checkCredentials = async () => {
      setIsCheckingCredentials(true);
      
      const stored = localStorage.getItem("exchange_credentials");
      
      if (stored) {
        try {
          const creds = JSON.parse(stored);
          creds.exchange = "bybit";
          creds.environment = "mainnet";
          setCredentials(creds);
          
          fetchBotPositions();
          fetchBotStatus();
          fetchSymbolLocks();
          autoMatchAlertsToOpen();
          fetchHistoryStats();
        } catch (err) {
          console.error("Failed to parse credentials:", err);
          localStorage.removeItem("exchange_credentials");
        }
        
        setIsCheckingCredentials(false);
        return;
      }
      
      try {
        const response = await fetch("/api/bot/credentials");
        const data = await response.json();
        
        if (data.success && data.credentials && data.credentials.apiKey) {
          const creds = {
            exchange: "bybit" as const,
            environment: "mainnet" as const,
            apiKey: data.credentials.apiKey,
            apiSecret: data.credentials.apiSecret,
            savedAt: data.credentials.savedAt || new Date().toISOString()
          };
          
          localStorage.setItem("exchange_credentials", JSON.stringify(creds));
          
          setCredentials(creds);
          fetchBotPositions();
          fetchBotStatus();
          fetchSymbolLocks();
          autoMatchAlertsToOpen();
          fetchHistoryStats();
        }
      } catch (err) {
        console.error("[Dashboard] Credential fetch error:", err);
      } finally {
        setIsCheckingCredentials(false);
      }
    };
    
    checkCredentials();
  }, []);

  useEffect(() => {
    if (!credentials) return;

    const interval = setInterval(() => {
      fetchBotPositions(true);
      fetchBotStatus(true);
      fetchHistoryStats(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [credentials, fetchBotPositions, fetchHistoryStats]);

  const handleSyncPositions = async () => {
    setLoadingSync(true);
    try {
      const response = await fetch("/api/bot/sync-positions", {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        await fetchBotPositions();
        toast.success(`✅ Synchronizacja: Sprawdzono ${data.results.checked}, Zamknięto ${data.results.closed}`);
      } else {
        toast.error(`❌ Błąd: ${data.message}`);
      }
    } catch (err) {
      toast.error(`❌ Błąd: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      setLoadingSync(false);
    }
  };

  const handleClosePosition = async (symbol: string, positionId: number) => {
    setPositionToClose({ symbol, positionId });
    setShowCloseConfirm(true);
  };

  const confirmClosePosition = async () => {
    if (!positionToClose) return;

    const { symbol, positionId } = positionToClose;
    setClosingPosition(symbol);
    setShowCloseConfirm(false);
    
    try {
      const response = await fetch("/api/exchange/close-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: credentials?.exchange || "bybit",
          apiKey: credentials?.apiKey,
          apiSecret: credentials?.apiSecret,
          symbol,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`✅ Pozycja ${symbol} zamknięta!`);
        await fetchBotPositions();
      } else {
        toast.error(`❌ Błąd: ${data.message}`);
      }
    } catch (err) {
      toast.error(`❌ Błąd: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      setClosingPosition(null);
      setPositionToClose(null);
    }
  };

  const handleShowAlertData = (alertDataString: string | null | undefined) => {
    if (!alertDataString) {
      toast.error("Brak danych alertu dla tej pozycji");
      return;
    }

    try {
      const alertData = JSON.parse(alertDataString);
      setSelectedAlertData(alertData);
      setShowAlertDialog(true);
    } catch (error) {
      toast.error("Nie można odczytać danych alertu");
    }
  };

  const handleMatchAlertsManually = async () => {
    setLoadingAlertMatch(true);
    
    try {
      const response = await fetch("/api/bot/match-alerts-to-open", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        if (data.matched > 0) {
          toast.success(`🔗 Dopasowano ${data.matched} alertów!`);
          await fetchBotPositions();
        } else {
          toast.info("✅ Wszystkie otwarte pozycje mają już przypisane alerty");
        }
      } else {
        toast.error("❌ Błąd dopasowywania alertów");
      }
    } catch (err) {
      toast.error(`❌ Błąd: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      setLoadingAlertMatch(false);
    }
  };

  const unrealisedPnL = botPositions.reduce((sum, p) => sum + (p.unrealisedPnl || 0), 0);

  if (isCheckingCredentials) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <Card className="max-w-md w-full border-gray-800 bg-gray-900/80 backdrop-blur-sm shadow-2xl">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
              <p className="text-lg font-medium text-white mb-2">Sprawdzanie konfiguracji...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <Card className="max-w-2xl w-full border-red-800 bg-gradient-to-br from-red-900/30 to-gray-900/80 backdrop-blur-sm shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-300 text-2xl">
              <AlertCircle className="h-8 w-8" />
              ⚠️ Brak konfiguracji Bybit!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Button 
              onClick={() => router.push("/exchange-test")} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-lg py-6"
              size="lg"
            >
              <Settings className="mr-2 h-6 w-6" />
              Konfiguracja API
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">

        {symbolLocks.length > 0 && (
          <Alert className="border-red-800 bg-red-900/30 text-red-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-medium">⚠️ {symbolLocks.length} symbolów zablokowanych</span>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-gradient-to-br from-blue-900/30 to-blue-800/50 border border-blue-800/30 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-blue-300">PnL Niezrealizowany</h3>
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <p className={`text-2xl font-bold ${unrealisedPnL >= 0 ? 'text-green-100' : 'text-red-100'}`}>
              {unrealisedPnL >= 0 ? '+' : ''}{unrealisedPnL.toFixed(2)}
            </p>
            <p className="text-xs text-blue-400">USDT (otwarte)</p>
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-amber-900/30 to-amber-800/50 border border-amber-800/30 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-amber-300">Otwarte Pozycje</h3>
              <Activity className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-100">
              {botPositions.length}
            </p>
            <p className="text-xs text-amber-400">aktywnych</p>
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-green-900/30 to-green-800/50 border border-green-800/30 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-green-300">Total PnL</h3>
              <History className="h-4 w-4 text-green-400" />
            </div>
            {loadingHistory ? (
              <div className="h-8 flex items-center">
                <RefreshCw className="h-4 w-4 animate-spin text-green-400" />
              </div>
            ) : historyStats ? (
              <>
                <p className={`text-2xl font-bold ${historyStats.totalPnl >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                  {historyStats.totalPnl >= 0 ? '+' : ''}{historyStats.totalPnl.toFixed(2)}
                </p>
                <p className="text-xs text-green-400">
                  {historyStats.totalPositions} zamkniętych
                </p>
              </>
            ) : (
              <p className="text-2xl font-bold text-gray-500">---</p>
            )}
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-purple-900/30 to-purple-800/50 border border-purple-800/30 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-purple-300">Win Rate</h3>
              <Award className="h-4 w-4 text-purple-400" />
            </div>
            {loadingHistory ? (
              <div className="h-8 flex items-center">
                <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
              </div>
            ) : historyStats ? (
              <>
                <p className="text-2xl font-bold text-purple-100">
                  {historyStats.winRate.toFixed(1)}%
                </p>
                <p className="text-xs text-purple-400">
                  skuteczność
                </p>
              </>
            ) : (
              <p className="text-2xl font-bold text-gray-500">---</p>
            )}
          </div>
        </div>

        <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Bot className={`h-5 w-5 ${botEnabled ? 'text-green-400' : 'text-red-400'}`} />
                <span className="text-sm text-gray-300">
                  Status Bota: <span className={`font-semibold ${botEnabled ? 'text-green-400' : 'text-red-400'}`}>
                    {botEnabled ? 'Aktywny' : 'Wyłączony'}
                  </span>
                </span>
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={() => router.push("/bot-history")}
                  variant="outline"
                  size="sm"
                  className="border-blue-700 text-blue-300 hover:bg-blue-900/20"
                >
                  <History className="h-4 w-4 mr-1" />
                  Historia
                </Button>
                <Button
                  onClick={() => router.push("/ustawienia-bota")}
                  variant="outline"
                  size="sm"
                  className="border-purple-700 text-purple-300 hover:bg-purple-900/20"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Ustawienia
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Otwarte Pozycje
                  <Badge variant="secondary" className="bg-gray-700 text-gray-200">{botPositions.length}</Badge>
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Dane z lokalnej bazy (odświeżane co 5 sekund)
                </CardDescription>
              </div>
              
              {botPositions.length > 0 && (
                <Button
                  onClick={handleMatchAlertsManually}
                  disabled={loadingAlertMatch}
                  variant="outline"
                  size="sm"
                  className="border-green-700 text-green-300 hover:bg-green-900/20"
                >
                  {loadingAlertMatch ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      Dopasowywanie...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-1" />
                      Dopasuj Alerty
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingPositions && (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-500" />
                <p className="text-sm text-gray-300">Ładowanie...</p>
              </div>
            )}

            {!loadingPositions && botPositions.length === 0 && (
              <div className="text-center py-8">
                <Activity className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-gray-300 mb-4">Brak otwartych pozycji</p>
                {historyStats && historyStats.totalPositions > 0 && (
                  <Button
                    onClick={() => router.push("/bot-history")}
                    variant="outline"
                    className="border-blue-700 text-blue-300 hover:bg-blue-900/20"
                  >
                    <History className="h-4 w-4 mr-2" />
                    Zobacz Historię ({historyStats.totalPositions} pozycji)
                  </Button>
                )}
              </div>
            )}

            {!loadingPositions && botPositions.length > 0 && (
              <div className="space-y-4">
                {botPositions.map((botPos, idx) => {
                  const pnl = botPos.unrealisedPnl || 0;
                  const isProfitable = pnl > 0;
                  const entryPrice = botPos.entryPrice;
                  const quantity = botPos.quantity;
                  const leverage = botPos.leverage;
                  const posValue = entryPrice * quantity;
                  const margin = posValue / leverage;
                  
                  const roe = (pnl / margin) * 100;
                  
                  const openedAt = new Date(botPos.openedAt);
                  const durationMs = Date.now() - openedAt.getTime();
                  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
                  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                  const durationText = durationHours > 0 
                    ? `${durationHours}h ${durationMinutes}m` 
                    : `${durationMinutes}m`;

                  const slPrice = botPos.liveSlPrice || botPos.stopLoss || 0;
                  const tp1Price = botPos.liveTp1Price || botPos.mainTpPrice || 0;
                  const tp2Price = botPos.liveTp2Price || 0;
                  const tp3Price = botPos.liveTp3Price || 0;
                  
                  const roeColor = roe >= 5 ? "bg-green-500" : roe >= 0 ? "bg-green-400" : roe >= -5 ? "bg-orange-400" : "bg-red-500";

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border-2 transition-all hover:shadow-lg ${
                        isProfitable
                          ? "border-green-500/30 bg-gradient-to-br from-green-900/20 via-green-800/10 to-transparent"
                          : "border-red-500/30 bg-gradient-to-br from-red-900/20 via-red-800/10 to-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between p-4 pb-3 border-b border-gray-700/50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-bold text-2xl text-white">{botPos.symbol}</span>
                            <Badge
                              variant={botPos.side === "Buy" ? "default" : "secondary"}
                              className={`text-sm px-2 py-1 ${
                                botPos.side === "Buy"
                                  ? "bg-green-600 hover:bg-green-700"
                                  : "bg-red-600 hover:bg-red-700"
                              }`}
                            >
                              {botPos.side === "Buy" ? "LONG" : "SHORT"} {leverage}x
                            </Badge>
                            <Badge variant="outline" className="text-xs text-purple-300 border-purple-500/50 bg-purple-500/10">
                              {botPos.tier}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>Otwarto: {openedAt.toLocaleString("pl-PL", {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              <span>Czas: {durationText}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className={`text-2xl font-bold mb-1 ${isProfitable ? "text-green-400" : "text-red-400"}`}>
                              {isProfitable ? "+" : ""}
                              {pnl.toFixed(2)} USDT
                            </div>
                            <div className={`text-sm font-semibold ${isProfitable ? "text-green-300" : "text-red-300"}`}>
                              ROE: {roe >= 0 ? "+" : ""}{roe.toFixed(2)}%
                            </div>
                          </div>
                          
                          <Button
                            onClick={() => handleClosePosition(botPos.symbol, botPos.id)}
                            disabled={closingPosition === botPos.symbol}
                            size="sm"
                            variant="destructive"
                            className="h-9 w-9 p-0"
                          >
                            {closingPosition === botPos.symbol ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="px-4 pt-3 pb-2">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                          <span className="flex items-center gap-1">
                            <Percent className="h-3 w-3" />
                            Return on Equity (ROE)
                          </span>
                          <span className={`font-semibold ${isProfitable ? "text-green-400" : "text-red-400"}`}>
                            {roe >= 0 ? "+" : ""}{roe.toFixed(2)}%
                          </span>
                        </div>
                        <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${roeColor} transition-all duration-500`}
                            style={{ width: `${Math.min(Math.abs(roe), 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/50">
                          <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="h-4 w-4 text-blue-400" />
                            <h4 className="text-xs font-semibold text-gray-300">Ceny i Rozmiar</h4>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                            <div>
                              <div className="text-gray-400 text-xs">Wejście</div>
                              <div className="font-semibold text-white">{entryPrice.toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Rozmiar</div>
                              <div className="font-semibold text-white">{quantity.toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Wartość</div>
                              <div className="font-semibold text-white">{posValue.toFixed(2)} USDT</div>
                            </div>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-gradient-to-br from-gray-800/60 to-gray-800/30 border border-gray-700/50">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Target className="h-4 w-4 text-purple-400" />
                              <h4 className="text-xs font-semibold text-gray-300">Poziomy SL/TP</h4>
                            </div>
                            {botPos.alertData ? (
                              <Button
                                onClick={() => handleShowAlertData(botPos.alertData)}
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-blue-600 text-blue-400 hover:bg-blue-600/20"
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                Zobacz Alert
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-xs text-gray-500 border-gray-600">
                                Brak danych alertu
                              </Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div className="p-2 rounded bg-red-500/10 border border-red-500/30">
                              <div className="text-gray-400 text-xs mb-1">Stop Loss</div>
                              {slPrice > 0 ? (
                                <div className="font-semibold text-red-400">
                                  {slPrice.toFixed(4)}
                                </div>
                              ) : (
                                <div className="font-semibold text-gray-500">N/A</div>
                              )}
                            </div>
                            
                            <div className="p-2 rounded bg-green-500/10 border border-green-500/30">
                              <div className="text-gray-400 text-xs mb-1">TP1</div>
                              {tp1Price > 0 ? (
                                <div className="font-semibold text-green-400">
                                  {tp1Price.toFixed(4)}
                                </div>
                              ) : (
                                <div className="font-semibold text-gray-500">N/A</div>
                              )}
                            </div>
                            
                            <div className="p-2 rounded bg-green-500/10 border border-green-500/30">
                              <div className="text-gray-400 text-xs mb-1">TP2</div>
                              {tp2Price > 0 ? (
                                <div className="font-semibold text-green-400">
                                  {tp2Price.toFixed(4)}
                                </div>
                              ) : (
                                <div className="font-semibold text-gray-500">N/A</div>
                              )}
                            </div>
                            
                            <div className="p-2 rounded bg-green-500/10 border border-green-500/30">
                              <div className="text-gray-400 text-xs mb-1">TP3</div>
                              {tp3Price > 0 ? (
                                <div className="font-semibold text-green-400">
                                  {tp3Price.toFixed(4)}
                                </div>
                              ) : (
                                <div className="font-semibold text-gray-500">N/A</div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/50">
                          <div className="flex items-center gap-2 mb-2">
                            <Activity className="h-4 w-4 text-cyan-400" />
                            <h4 className="text-xs font-semibold text-gray-300">Informacje</h4>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                            <div>
                              <div className="text-gray-400 text-xs">Status</div>
                              <Badge variant="outline" className="text-xs mt-1">
                                {botPos.status === 'open' ? 'Otwarta' : botPos.status === 'partial_close' ? 'Częściowo zamknięta' : botPos.status}
                              </Badge>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Potwierdzenia</div>
                              <div className="font-semibold text-white">{botPos.confirmationCount}</div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">ID Pozycji</div>
                              <div className="font-semibold text-cyan-300">#{botPos.id}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ✅ CLOSE POSITION CONFIRMATION DIALOG */}
        <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
          <DialogContent className="bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                Zamknąć pozycję?
              </DialogTitle>
              <DialogDescription className="text-gray-300">
                Czy na pewno chcesz zamknąć pozycję <span className="font-bold text-white">{positionToClose?.symbol}</span>?
                <br />
                Tej operacji nie można cofnąć.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCloseConfirm(false);
                  setPositionToClose(null);
                }}
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                Anuluj
              </Button>
              <Button
                variant="destructive"
                onClick={confirmClosePosition}
                className="bg-red-600 hover:bg-red-700"
              >
                Zamknij Pozycję
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAlertDialog} onOpenChange={setShowAlertDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" />
                Dane Alertu - {selectedAlertData?.symbol}
              </DialogTitle>
            </DialogHeader>

            {selectedAlertData && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Podstawowe Informacje</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-gray-400">Symbol</div>
                      <div className="font-semibold text-white">{selectedAlertData.symbol}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Kierunek</div>
                      <Badge variant={selectedAlertData.side === "Buy" ? "default" : "secondary"}>
                        {selectedAlertData.side === "Buy" ? "LONG" : "SHORT"}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-gray-400">Tier</div>
                      <Badge variant="outline" className="text-gray-300">
                        {selectedAlertData.tier}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-gray-400">Siła</div>
                      <div className="font-semibold text-blue-400">
                        {(selectedAlertData.strength * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">Dźwignia</div>
                      <div className="font-semibold text-white">{selectedAlertData.leverage}x</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Sesja</div>
                      <div className="font-semibold text-white">{selectedAlertData.session}</div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Ceny</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-gray-400">Entry</div>
                      <div className="font-semibold text-green-400">{selectedAlertData.entryPrice}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">SL</div>
                      <div className="font-semibold text-red-400">{selectedAlertData.sl}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Main TP</div>
                      <div className="font-semibold text-green-400">{selectedAlertData.mainTp}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}