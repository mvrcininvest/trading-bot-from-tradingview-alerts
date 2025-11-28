"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Wallet, RefreshCw, AlertCircle, Settings, Activity, Bot, X, FileText, Clock, Target, TrendingDown, Percent, DollarSign, Zap, Download, Database, CheckCircle2, XCircle, BarChart3, Award, AlertTriangle } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

interface Balance {
  asset: string;
  free: string;
  locked: string;
  total: string;
}

interface Position {
  symbol: string;
  side: "Buy" | "Sell";
  size: string;
  entryPrice: string;
  markPrice: string;
  leverage: string;
  unrealisedPnl: string;
  takeProfit: string;
  stopLoss: string;
  positionValue: string;
  liqPrice?: string;
}

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

interface BybitStats {
  totalEquity: number;
  totalWalletBalance: number;
  availableBalance: number;
  realisedPnL: number;
  unrealisedPnL: number;
  totalPnL: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  tradingVolume: number;
  avgHoldingTime: number;
}

interface BybitStatsResponse {
  success: boolean;
  stats: BybitStats;
  dataSource: "bybit";
  daysBack: number;
  fetchedAt: string;
}

async function signBybitRequest(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  params: Record<string, any>
): Promise<string> {
  const recvWindow = "5000";
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join("&");
  const signaturePayload = timestamp + apiKey + recvWindow + queryString;
  const crypto = require('crypto');
  const signature = crypto.createHmac('sha256', apiSecret).update(signaturePayload).digest('hex');
  return signature;
}

export default function DashboardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<ExchangeCredentials | null>(null);
  const [isCheckingCredentials, setIsCheckingCredentials] = useState(true);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [botPositions, setBotPositions] = useState<BotPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [botEnabled, setBotEnabled] = useState<boolean | null>(null);
  const [symbolLocks, setSymbolLocks] = useState<SymbolLock[]>([]);
  const [loadingSync, setLoadingSync] = useState(false);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [selectedAlertData, setSelectedAlertData] = useState<any>(null);
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [autoImporting, setAutoImporting] = useState(false);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [loadingAlertMatch, setLoadingAlertMatch] = useState(false);
  const [bybitStats, setBybitStats] = useState<BybitStats | null>(null);
  const [loadingBybitStats, setLoadingBybitStats] = useState(false);

  const autoMatchAlertsToOpen = useCallback(async () => {
    console.log("[Dashboard] Checking if open positions need alert matching...");
    
    try {
      const response = await fetch("/api/bot/match-alerts-to-open", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success && data.matched > 0) {
        console.log(`[Dashboard] ✅ Auto-matched ${data.matched} alerts to open positions`);
        toast.success(`🔗 Dopasowano ${data.matched} alertów do otwartych pozycji`, {
          description: `${data.unmatched} pozycji bez dopasowania`
        });
        
        await fetchBotPositions();
      } else if (data.success) {
        console.log(`[Dashboard] All open positions already have alerts`);
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

  const fetchBalance = async (creds?: ExchangeCredentials) => {
    const credsToUse = creds || credentials;
    if (!credsToUse) return;

    setLoading(true);
    setError(null);

    try {
      const timestamp = Date.now();
      const params: Record<string, any> = {
        accountType: "UNIFIED"
      };
      
      const signature = await signBybitRequest(
        credsToUse.apiKey,
        credsToUse.apiSecret,
        timestamp,
        params
      );
      
      const baseUrl = "https://api.bybit.com";
      
      const queryString = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join("&");
      
      const url = `${baseUrl}/v5/account/wallet-balance?${queryString}`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-BAPI-API-KEY": credsToUse.apiKey,
          "X-BAPI-TIMESTAMP": timestamp.toString(),
          "X-BAPI-SIGN": signature,
          "X-BAPI-RECV-WINDOW": "5000",
        },
      });

      const data = await response.json();

      if (data.retCode === 0 && data.result?.list) {
        const walletData = data.result.list[0];
        if (walletData?.coin) {
          const filteredBalances = walletData.coin
            .filter((c: any) => parseFloat(c.walletBalance || 0) > 0)
            .map((c: any) => ({
              asset: c.coin,
              free: c.availableToWithdraw || "0",
              locked: (parseFloat(c.walletBalance || 0) - parseFloat(c.availableToWithdraw || 0)).toFixed(8),
              total: c.walletBalance || "0"
            }));
          
          setBalances(filteredBalances);
          setError(null);
        } else {
          setError("Brak danych o saldzie w odpowiedzi API");
        }
      } else {
        setError(`Bybit API error: ${data.retMsg || "Nieznany błąd"}`);
      }
    } catch (err) {
      setError(`Błąd połączenia: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      setLoading(false);
    }
  };

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

  const fetchPositions = useCallback(async (creds?: ExchangeCredentials, silent = false) => {
    const credsToUse = creds || credentials;
    if (!credsToUse) return;

    if (!silent) setLoadingPositions(true);
    setPositionsError(null);

    try {
      const timestamp = Date.now();
      const params: Record<string, any> = {
        category: "linear",
        settleCoin: "USDT"
      };
      
      const signature = await signBybitRequest(
        credsToUse.apiKey,
        credsToUse.apiSecret,
        timestamp,
        params
      );
      
      const baseUrl = "https://api.bybit.com";
      
      const queryString = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join("&");
      
      const url = `${baseUrl}/v5/position/list?${queryString}`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-BAPI-API-KEY": credsToUse.apiKey,
          "X-BAPI-TIMESTAMP": timestamp.toString(),
          "X-BAPI-SIGN": signature,
          "X-BAPI-RECV-WINDOW": "5000",
        },
      });

      const data = await response.json();

      if (data.retCode === 0 && data.result?.list) {
        const openPositions = data.result.list
          .filter((p: any) => parseFloat(p.size) > 0)
          .map((p: any) => ({
            symbol: p.symbol,
            side: p.side,
            size: p.size,
            entryPrice: p.avgPrice,
            markPrice: p.markPrice,
            leverage: p.leverage,
            unrealisedPnl: p.unrealisedPnl,
            takeProfit: p.takeProfit || "0",
            stopLoss: p.stopLoss || "0",
            positionValue: p.positionValue,
            liqPrice: p.liqPrice || "0",
          }));
        
        setPositions(openPositions);
        setPositionsError(null);
      } else {
        setPositionsError(`Bybit API error: ${data.retMsg || "Nieznany błąd"}`);
      }
    } catch (err) {
      setPositionsError(`Błąd połączenia: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      if (!silent) setLoadingPositions(false);
    }
  }, [credentials]);

  const fetchBybitStats = useCallback(async () => {
    if (!credentials) return;
    
    setLoadingBybitStats(true);
    try {
      const response = await fetch('/api/analytics/bybit-stats?days=30');
      const data: BybitStatsResponse = await response.json();
      
      if (data.success) {
        setBybitStats(data.stats);
      } else {
        console.error("Failed to fetch Bybit stats:", data.message);
      }
    } catch (err) {
      console.error("Failed to fetch Bybit stats:", err);
    } finally {
      setLoadingBybitStats(false);
    }
  }, [credentials]);

  useEffect(() => {
    const checkCredentials = async () => {
      setIsCheckingCredentials(true);
      
      const stored = localStorage.getItem("exchange_credentials");
      
      if (stored) {
        const creds = JSON.parse(stored);
        creds.exchange = "bybit";
        creds.environment = "mainnet";
        setCredentials(creds);
        
        fetchBalance(creds);
        fetchPositions(creds);
        fetchBotPositions();
        fetchBotStatus();
        fetchSymbolLocks();
        autoMatchAlertsToOpen();
        fetchBybitStats();
        
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
          fetchBalance(creds);
          fetchPositions(creds);
          fetchBotPositions();
          fetchBotStatus();
          fetchSymbolLocks();
          autoMatchAlertsToOpen();
          fetchBybitStats();
        }
      } catch (err) {
        console.error("[Dashboard] Błąd pobierania credentials z bazy:", err);
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
      fetchPositions(credentials, true);
      fetchBotStatus(true);
    }, 2000);

    return () => clearInterval(interval);
  }, [credentials, fetchBotPositions, fetchPositions]);

  useEffect(() => {
    if (!credentials) return;

    const statsInterval = setInterval(() => {
      fetchBybitStats();
    }, 60000);

    return () => clearInterval(statsInterval);
  }, [credentials, fetchBybitStats]);

  const handleSyncPositions = async () => {
    setLoadingSync(true);
    try {
      const response = await fetch("/api/bot/sync-positions", {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        await fetchBotPositions();
        await fetchPositions(credentials || undefined);
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

  const handleClosePosition = async (symbol: string) => {
    if (!confirm(`Czy na pewno chcesz zamknąć pozycję ${symbol}?`)) {
      return
    }

    setClosingPosition(symbol)
    
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
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`✅ Pozycja ${symbol} zamknięta!`, {
          description: `PnL: ${data.data.pnl >= 0 ? '+' : ''}${data.data.pnl.toFixed(2)} USDT`
        })
        
        await fetchPositions(credentials || undefined)
        await fetchBotPositions()
      } else {
        toast.error(`❌ Błąd: ${data.message}`)
      }
    } catch (err) {
      toast.error(`❌ Błąd: ${err instanceof Error ? err.message : "Nieznany błąd"}`)
    } finally {
      setClosingPosition(null)
    }
  }

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
      console.error("Failed to parse alert data:", error);
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
          toast.success(`🔗 Dopasowano ${data.matched} alertów!`, {
            description: `${data.unmatched} pozycji bez dopasowania (brak alertu w oknie ±30s)`
          });
          
          await fetchBotPositions();
        } else {
          toast.info("✅ Wszystkie otwarte pozycje mają już przypisane alerty", {
            description: "Nie znaleziono pozycji do dopasowania"
          });
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

  const totalBalance = balances.reduce((sum, b) => sum + parseFloat(b.total), 0)
  const unrealisedPnL = positions.reduce((sum, p) => sum + parseFloat(p.unrealisedPnl || "0"), 0)
  const realisedPnL = bybitStats?.realisedPnL || 0
  const totalPnL = realisedPnL + unrealisedPnL

  if (isCheckingCredentials) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <Card className="max-w-md w-full border-gray-800 bg-gray-900/80 backdrop-blur-sm shadow-2xl">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
              <p className="text-lg font-medium text-white mb-2">Sprawdzanie konfiguracji...</p>
              <p className="text-sm text-gray-400">
                Wczytuję klucze API z localStorage i bazy danych
              </p>
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
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-900/40 border-2 border-red-700">
                <p className="text-lg font-bold text-red-200 mb-2">
                  🔍 Nie znaleziono kluczy API Bybit
                </p>
                <p className="text-sm text-gray-200">
                  Musisz skonfigurować klucze API Bybit Mainnet aby korzystać z bota.
                </p>
              </div>
              
              <Alert className="border-yellow-800 bg-yellow-900/30">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <AlertDescription className="text-yellow-200 text-sm">
                  <strong>Instrukcja:</strong>
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Kliknij przycisk poniżej</li>
                    <li>Wprowadź swoje klucze API z Bybit</li>
                    <li>Przetestuj połączenie</li>
                    <li>Zapisz i wróć tutaj</li>
                  </ol>
                </AlertDescription>
              </Alert>
            </div>

            <Button 
              onClick={() => router.push("/exchange-test")} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-lg py-6"
              size="lg"
            >
              <Settings className="mr-2 h-6 w-6" />
              Konfiguracja API (Kliknij tutaj!)
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        
        {bybitStats && !loadingBybitStats && (
          <Card className="border-purple-800 bg-gradient-to-br from-purple-900/30 to-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Database className="h-5 w-5 text-purple-400" />
                    Statystyki Tradingowe (ostatnie 30 dni)
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Dane live z Bybit API - kliknij aby zobaczyć pełną analizę
                  </CardDescription>
                </div>
                <Button
                  onClick={() => router.push("/statystyki")}
                  variant="outline"
                  size="sm"
                  className="border-purple-700 text-purple-300 hover:bg-purple-900/20"
                >
                  Pełne Statystyki
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="p-4 rounded-lg bg-gradient-to-br from-green-900/20 to-green-800/30 border border-green-800/20">
                  <CardDescription className="text-sm text-green-300 mb-1">Całkowite Saldo</CardDescription>
                  <CardTitle className="text-2xl font-bold text-green-100">{totalBalance.toFixed(2)}</CardTitle>
                  <p className="text-xs text-green-400">USDT</p>
                </div>
                <div className="p-4 rounded-lg bg-gradient-to-br from-blue-900/20 to-blue-800/30 border border-blue-800/20">
                  <CardDescription className="text-sm text-blue-300 mb-1">Niezrealizowany PnL</CardDescription>
                  <CardTitle className={`text-2xl font-bold ${unrealisedPnL >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                    {unrealisedPnL >= 0 ? '+' : ''}{unrealisedPnL.toFixed(2)}
                  </CardTitle>
                  <p className="text-xs text-blue-400">USDT (otwarte)</p>
                </div>
                <div className="p-4 rounded-lg bg-gradient-to-br from-amber-900/20 to-amber-800/30 border border-amber-800/20">
                  <CardDescription className="text-sm text-amber-300 mb-1">Całkowity PnL</CardDescription>
                  <CardTitle className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                    {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
                  </CardTitle>
                  <p className="text-xs text-amber-400">USDT (Bybit live)</p>
                </div>
                <div className="p-4 rounded-lg bg-gradient-to-br from-purple-900/20 to-purple-800/30 border border-purple-800/20">
                  <CardDescription className="text-sm text-purple-300 mb-1">Status Bota</CardDescription>
                  <CardTitle className={`text-2xl font-bold ${botEnabled ? 'text-green-100' : 'text-red-100'}`}>
                    {botEnabled ? 'Aktywny' : 'Wyłączony'}
                  </CardTitle>
                  <p className="text-xs text-purple-400">
                    <div className={`h-2 w-2 rounded-full inline-block mr-1 ${botEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
                    {botEnabled ? 'Działa' : 'Zatrzymany'}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-gradient-to-br from-cyan-900/20 to-cyan-800/30 border border-cyan-800/20">
                  <CardDescription className="text-sm text-cyan-300 mb-1">Otwarte Pozycje</CardDescription>
                  <CardTitle className="text-2xl font-bold text-cyan-100">{positions.length}</CardTitle>
                  <p className="text-xs text-cyan-400">aktualne</p>
                </div>
                <div className="p-4 rounded-lg bg-gradient-to-br from-orange-900/20 to-orange-800/30 border border-orange-800/20">
                  <CardDescription className="text-sm text-orange-300 mb-1">Zamknięte Pozycje</CardDescription>
                  <CardTitle className="text-2xl font-bold text-orange-100">0</CardTitle>
                  <p className="text-xs text-orange-400">dane nie dostępne</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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

        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-gradient-to-br from-green-900/30 to-green-800/50 border border-green-800/30 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-green-300">Całkowite Saldo</h3>
                <Wallet className="h-4 w-4 text-green-400" />
              </div>
              <p className="text-2xl font-bold text-green-100">
                {totalBalance.toFixed(2)}
              </p>
              <p className="text-xs text-green-400">USDT</p>
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-blue-900/30 to-blue-800/50 border border-blue-800/30 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-blue-300">Niezrealizowany PnL</h3>
                <TrendingUp className="h-4 w-4 text-blue-400" />
              </div>
              <p className={`text-2xl font-bold ${unrealisedPnL >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                {unrealisedPnL >= 0 ? '+' : ''}{unrealisedPnL.toFixed(2)}
              </p>
              <p className="text-xs text-blue-400">USDT (otwarte)</p>
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-amber-900/30 to-amber-800/50 border border-amber-800/30 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-amber-300">Całkowity PnL</h3>
                <TrendingUp className="h-4 w-4 text-amber-400" />
              </div>
              <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
              </p>
              <p className="text-xs text-amber-400">USDT (Bybit live)</p>
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-purple-900/30 to-purple-800/50 border border-purple-800/30 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-purple-300">Status Bota</h3>
                <Bot className="h-4 w-4 text-purple-400" />
              </div>
              <p className={`text-2xl font-bold ${botEnabled ? 'text-green-100' : 'text-red-100'}`}>
                {botEnabled ? 'Aktywny' : 'Wyłączony'}
              </p>
              <p className="text-xs text-purple-400">
                <div className={`h-2 w-2 rounded-full inline-block mr-1 ${botEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
                {botEnabled ? 'Działa' : 'Zatrzymany'}
              </p>
            </div>
          </div>
        </div>

        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Otwarte Pozycje
                  <Badge variant="secondary" className="bg-gray-700 text-gray-200">{positions.length}</Badge>
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Twoje aktualne pozycje tradingowe z rozszerzonymi danymi
                </CardDescription>
              </div>
              
              {positions.length > 0 && (
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

            {!loadingPositions && positions.length === 0 && (
              <div className="text-center py-8">
                <Activity className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-gray-300">
                  Brak otwartych pozycji
                </p>
              </div>
            )}

            {!loadingPositions && positions.length > 0 && (
              <div className="space-y-4">
                {positions.map((position, idx) => {
                  const pnl = parseFloat(position.unrealisedPnl || "0");
                  const isProfitable = pnl > 0;
                  
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        isProfitable
                          ? "border-green-500/30 bg-green-900/10"
                          : "border-red-500/30 bg-red-900/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-white">{position.symbol}</span>
                            <Badge variant={position.side === "Buy" ? "default" : "secondary"}>
                              {position.side === "Buy" ? "LONG" : "SHORT"}
                            </Badge>
                            <span className="text-sm text-gray-400">{position.leverage}x</span>
                          </div>
                          <div className="text-xs text-gray-400">
                            Entry: {parseFloat(position.entryPrice).toFixed(4)} · Size: {position.size}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xl font-bold ${isProfitable ? "text-green-400" : "text-red-400"}`}>
                            {isProfitable ? "+" : ""}{pnl.toFixed(2)} USDT
                          </div>
                        </div>
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