"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Wallet, RefreshCw, AlertCircle, Settings, Activity, Bot, X, FileText, Clock, Target, TrendingDown, Percent, DollarSign, Zap, Download, Database, CheckCircle2, XCircle } from "lucide-react";
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
  // ✅ NOWE: Live SL/TP z Bybit
  liveSlPrice?: number | null;
  liveTp1Price?: number | null;
  liveTp2Price?: number | null;
  liveTp3Price?: number | null;
  // ✅ NOWE: Dane alertu
  alertData?: string | null;
}

// ✅ NOWE: Interfejs dla zamkniętych pozycji z historii
interface HistoryPosition {
  id: number;
  positionId: number | null;
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

export default function DashboardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<ExchangeCredentials | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [botPositions, setBotPositions] = useState<BotPosition[]>([]);
  const [historyPositions, setHistoryPositions] = useState<HistoryPosition[]>([]);
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
  const [importingHistory, setImportingHistory] = useState(false);
  const [historyStats, setHistoryStats] = useState<{
    imported: number;
    skipped: number;
    total: number;
    pages: number;
  } | null>(null);
  const [verifyingImport, setVerifyingImport] = useState(false);
  const [importVerification, setImportVerification] = useState<{
    bybitCount: number;
    dbCount: number;
    missing: number;
    match: boolean;
  } | null>(null);

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

  // ✅ NOWA FUNKCJA: Fetch history positions
  const fetchHistoryPositions = useCallback(async () => {
    try {
      const response = await fetch("/api/bot/history?limit=10");
      const data = await response.json();

      if (data.success && Array.isArray(data.history)) {
        const closedOnly = data.history.filter((p: HistoryPosition) => 
          !p.status || p.status !== 'open'
        );
        setHistoryPositions(closedOnly);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  }, []);

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

  useEffect(() => {
    const stored = localStorage.getItem("exchange_credentials");
    if (stored) {
      const creds = JSON.parse(stored);
      creds.exchange = "bybit";
      creds.environment = "mainnet";
      setCredentials(creds);
      
      fetchBalance(creds);
      fetchPositions(creds);
      fetchBotPositions();
      fetchHistoryPositions(); // ✅ DODANO
      fetchBotStatus();
      fetchSymbolLocks();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!credentials) return;

    const interval = setInterval(() => {
      fetchBotPositions(true);
      fetchPositions(credentials, true);
      fetchBotStatus(true);
      fetchHistoryPositions(); // ✅ DODANO - odświeżaj historię co 2s
    }, 2000);

    return () => clearInterval(interval);
  }, [credentials, fetchBotPositions, fetchPositions, fetchHistoryPositions]);

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

  const signBybitRequest = async (apiKey: string, apiSecret: string, timestamp: number, params: Record<string, any>) => {
    const queryString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join("&");
    
    const signString = timestamp + apiKey + 5000 + queryString;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const messageData = encoder.encode(signString);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    
    return hashHex;
  };

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
        
        // Refresh positions
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

  // ✅ NOWA FUNKCJA: Etykiety powodów zamknięcia
  const getCloseReasonLabel = (reason: string) => {
    const closeReasonLabels: Record<string, string> = {
      sl_hit: "🛑 Stop Loss",
      tp_main_hit: "🎯 Take Profit (Main)",
      tp1_hit: "🎯 TP1",
      tp2_hit: "🎯 TP2", 
      tp3_hit: "🎯 TP3",
      manual_close: "👤 Ręczne zamknięcie",
      manual_close_all: "👤 Ręczne zamknięcie wszystkich",
      closed_on_exchange: "🔄 Zamknięte na giełdzie",
      emergency_override: "⚠️ Emergency Override",
      opposite_direction: "🔄 Odwrócenie kierunku",
      oko_emergency: "👁️ Oko Saurona - Emergency",
      oko_sl_breach: "👁️ Oko - SL Breach",
      oko_account_drawdown: "👁️ Oko - Drawdown",
      oko_time_based_exit: "👁️ Oko - Time Exit",
      ghost_position_cleanup: "👻 Ghost Cleanup",
      emergency_verification_failure: "⚠️ Verification Failure",
      migrated: "🔄 Migracja",
    };
    return closeReasonLabels[reason] || `❓ ${reason}`;
  };

  // ✅ NOWA FUNKCJA: Format czasu trwania
  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours < 24) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  };

  // ✅ POPRAWIONE STATYSTYKI - dodane całkowity PnL
  const totalBalance = balances.reduce((sum, b) => sum + parseFloat(b.total), 0)
  const unrealisedPnL = positions.reduce((sum, p) => sum + parseFloat(p.unrealisedPnl || "0"), 0)
  // NEW: Fetch realised PnL from history
  const [realisedPnL, setRealisedPnL] = useState(0)
  
  useEffect(() => {
    const fetchRealisedPnL = async () => {
      try {
        const response = await fetch("/api/bot/history?limit=1000")
        const data = await response.json()
        if (data.success && data.history) {
          const total = data.history.reduce((sum: number, p: any) => sum + p.pnl, 0)
          setRealisedPnL(total)
        }
      } catch (err) {
        console.error("Failed to fetch realised PnL:", err)
      }
    }
    fetchRealisedPnL()
  }, [])
  
  const totalPnL = realisedPnL + unrealisedPnL

  const handleImportBybitHistory = async () => {
    if (!credentials) {
      toast.error("Brak konfiguracji API Bybit");
      return;
    }

    if (!confirm("Czy chcesz zaimportować historię zamkniętych pozycji z Bybit? To może potrwać kilka minut.")) {
      return;
    }

    setImportingHistory(true);
    
    try {
      const response = await fetch("/api/bot/import-bybit-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          daysBack: 90, // Import last 90 days
        }),
      });

      const data = await response.json();

      if (data.success) {
        setHistoryStats({
          imported: data.imported,
          skipped: data.skipped,
          total: data.total,
          pages: data.pages,
        });
        
        toast.success(`✅ Import zakończony!`, {
          description: `Zaimportowano ${data.imported} nowych pozycji, pominięto ${data.skipped} duplikatów (łącznie ${data.total} pozycji z ${data.pages} stron)`,
        });
      } else {
        toast.error(`❌ Błąd importu: ${data.message}`);
      }
    } catch (err) {
      toast.error(`❌ Błąd: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      setImportingHistory(false);
    }
  };

  const handleVerifyImport = async () => {
    if (!credentials) {
      toast.error("Brak konfiguracji API Bybit");
      return;
    }

    setVerifyingImport(true);
    
    try {
      // Fetch Bybit closed positions count
      const timestamp = Date.now();
      const startTime = timestamp - 90 * 24 * 60 * 60 * 1000; // 90 days
      
      const params: Record<string, any> = {
        category: "linear",
        startTime: startTime.toString(),
        endTime: timestamp.toString(),
        limit: 100,
      };
      
      const signature = await signBybitRequest(
        credentials.apiKey,
        credentials.apiSecret,
        timestamp,
        params
      );
      
      const queryString = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join("&");
      
      const url = `https://api.bybit.com/v5/position/closed-pnl?${queryString}`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-BAPI-API-KEY": credentials.apiKey,
          "X-BAPI-TIMESTAMP": timestamp.toString(),
          "X-BAPI-SIGN": signature,
          "X-BAPI-RECV-WINDOW": "5000",
        },
      });

      const bybitData = await response.json();
      
      // Fetch DB history count
      const historyResponse = await fetch("/api/bot/history?limit=1000");
      const historyData = await historyResponse.json();
      
      const bybitCount = bybitData.result?.list?.length || 0;
      const dbCount = historyData.history?.length || 0;
      const missing = Math.max(0, bybitCount - dbCount);
      const match = missing === 0;
      
      setImportVerification({
        bybitCount,
        dbCount,
        missing,
        match,
      });
      
      if (match) {
        toast.success(`✅ Weryfikacja OK! ${dbCount} pozycji w bazie zgadza się z Bybit`);
      } else {
        toast.warning(`⚠️ Brakuje ${missing} pozycji w bazie (Bybit: ${bybitCount}, DB: ${dbCount})`, {
          description: "Kliknij 'Importuj Historię' aby uzupełnić brakujące pozycje"
        });
      }
    } catch (err) {
      toast.error(`❌ Błąd weryfikacji: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      setVerifyingImport(false);
    }
  };

  if (!credentials) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6">
        <Card className="max-w-2xl w-full border-red-800 bg-gradient-to-br from-red-900/30 to-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-300">
              <AlertCircle className="h-6 w-6" />
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
            </div>

            <Button 
              onClick={() => router.push("/exchange-test")} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
            >
              <Settings className="mr-2 h-5 w-5" />
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
        {/* Symbol Locks Alert */}
        {symbolLocks.length > 0 && (
          <Alert className="border-red-800 bg-red-900/30 text-red-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-medium">⚠️ {symbolLocks.length} symbolów zablokowanych</span>
              </div>
              <p className="text-xs mt-1">
                {symbolLocks.map((lock, i) => (
                  <span key={i} className="inline-block mr-1">
                    {lock.symbol} - {lock.lockReason}
                  </span>
                ))}
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* ✅ NOWY: Import History Stats Banner */}
        {historyStats && (
          <Alert className="border-blue-800 bg-blue-900/30 text-blue-200">
            <Database className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">📊 Historia Bybit zaimportowana</span>
                  <p className="text-xs mt-1">
                    {historyStats.total} pozycji z ostatnich 90 dni ({historyStats.pages} stron API) 
                    • {historyStats.imported} nowych • {historyStats.skipped} duplikatów
                  </p>
                </div>
                <Button
                  onClick={() => setHistoryStats(null)}
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* ✅ NOWY: Import Verification Result */}
        {importVerification && (
          <Alert className={`border-2 ${importVerification.match ? 'border-green-800 bg-green-900/30 text-green-200' : 'border-orange-800 bg-orange-900/30 text-orange-200'}`}>
            {importVerification.match ? (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-orange-400" />
            )}
            <AlertDescription>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">
                    {importVerification.match ? '✅ Import Kompletny' : '⚠️ Import Niekompletny'}
                  </span>
                  <p className="text-xs mt-1">
                    Bybit: {importVerification.bybitCount} pozycji • 
                    Baza danych: {importVerification.dbCount} pozycji • 
                    {importVerification.match ? (
                      <span className="text-green-300 font-semibold"> Wszystko zaimportowane!</span>
                    ) : (
                      <span className="text-orange-300 font-semibold"> Brakuje {importVerification.missing} pozycji</span>
                    )}
                  </p>
                </div>
                <Button
                  onClick={() => setImportVerification(null)}
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* ✅ ROZSZERZONE STATYSTYKI - 4 karty z całkowitym PnL */}
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
              <p className="text-xs text-amber-400">USDT (zrealizowany + niezrealizowany)</p>
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

        {/* ✅ NOWY: Import History Action Card */}
        <Card className="border-blue-800 bg-gradient-to-br from-blue-900/30 to-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Download className="h-5 w-5 text-blue-400" />
              Import Historii z Bybit
            </CardTitle>
            <CardDescription className="text-gray-300">
              Zaimportuj wszystkie zamknięte pozycje z ostatnich 90 dni aby uzupełnić historię bota
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">ℹ️ Co zostanie zaimportowane:</h4>
                <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
                  <li>Wszystkie zamknięte pozycje USDT Perpetual z ostatnich 90 dni</li>
                  <li>Dane: Symbol, kierunek (Long/Short), ceny wejścia/wyjścia, PnL, dźwignia</li>
                  <li>Automatyczne wykrywanie duplikatów (pozycje już w historii będą pominięte)</li>
                  <li>Pełna paginacja - pobiera wszystkie strony z API Bybit (max 5000 pozycji)</li>
                </ul>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={handleImportBybitHistory}
                  disabled={importingHistory}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  size="lg"
                >
                  {importingHistory ? (
                    <>
                      <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                      Importowanie...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-5 w-5" />
                      Importuj Historię (90 dni)
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleVerifyImport}
                  disabled={verifyingImport}
                  variant="outline"
                  size="lg"
                  className="border-purple-700 text-purple-300 hover:bg-purple-900/20"
                >
                  {verifyingImport ? (
                    <>
                      <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                      Weryfikacja...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Weryfikuj Import
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => router.push("/bot-history")}
                  variant="outline"
                  size="lg"
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  <FileText className="mr-2 h-5 w-5" />
                  Zobacz Pełną Historię
                </Button>
              </div>

              {importingHistory && (
                <div className="p-3 rounded-lg bg-blue-900/30 border border-blue-800/50">
                  <div className="flex items-center gap-2 text-sm text-blue-300">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Pobieranie danych z Bybit API... To może potrwać do 2 minut dla dużej liczby pozycji</span>
                  </div>
                </div>
              )}
              
              {verifyingImport && (
                <div className="p-3 rounded-lg bg-purple-900/30 border border-purple-800/50">
                  <div className="flex items-center gap-2 text-sm text-purple-300">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Porównywanie danych Bybit z bazą danych...</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ✅ ULEPSZONA LISTA POZYCJI Z WIĘCEJ DANYMI */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Otwarte Pozycje
              <Badge variant="secondary" className="bg-gray-700 text-gray-200">{positions.length}</Badge>
            </CardTitle>
            <CardDescription className="text-gray-300">
              Twoje aktualne pozycje tradingowe z rozszerzonymi danymi
            </CardDescription>
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
                  const pnl = parseFloat(position.unrealisedPnl || "0")
                  const isProfitable = pnl > 0
                  const posValue = parseFloat(position.positionValue)
                  const entryPrice = parseFloat(position.entryPrice)
                  const markPrice = parseFloat(position.markPrice)
                  const size = parseFloat(position.size)
                  const leverage = parseFloat(position.leverage)
                  const liqPrice = parseFloat(position.liqPrice || "0")
                  
                  const botPos = botPositions.find(bp => bp.symbol === position.symbol && bp.side === (position.side === "Buy" ? "Buy" : "Sell"))

                  // ✅ NOWE OBLICZENIA
                  const priceChange = markPrice - entryPrice
                  const priceChangePercent = ((priceChange / entryPrice) * 100)
                  const roe = (pnl / (posValue / leverage)) * 100 // Return on Equity
                  const margin = posValue / leverage
                  
                  // Czas trwania pozycji
                  const openedAt = botPos ? new Date(botPos.openedAt) : null
                  const durationMs = openedAt ? Date.now() - openedAt.getTime() : 0
                  const durationHours = Math.floor(durationMs / (1000 * 60 * 60))
                  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))
                  const durationText = durationHours > 0 
                    ? `${durationHours}h ${durationMinutes}m` 
                    : `${durationMinutes}m`

                  // Odległość do SL/TP
                  const slPrice = botPos?.liveSlPrice ? parseFloat(String(botPos.liveSlPrice)) : 0
                  const tp1Price = botPos?.liveTp1Price ? parseFloat(String(botPos.liveTp1Price)) : 0
                  
                  const distanceToSl = slPrice > 0 
                    ? position.side === "Buy" 
                      ? ((markPrice - slPrice) / markPrice * 100)
                      : ((slPrice - markPrice) / markPrice * 100)
                    : null
                  
                  const distanceToTp1 = tp1Price > 0
                    ? position.side === "Buy"
                      ? ((tp1Price - markPrice) / markPrice * 100)
                      : ((markPrice - tp1Price) / markPrice * 100)
                    : null

                  // Kolor dla ROE progress bar
                  const roeColor = roe >= 5 ? "bg-green-500" : roe >= 0 ? "bg-green-400" : roe >= -5 ? "bg-orange-400" : "bg-red-500"

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border-2 transition-all hover:shadow-lg ${
                        isProfitable
                          ? "border-green-500/30 bg-gradient-to-br from-green-900/20 via-green-800/10 to-transparent"
                          : "border-red-500/30 bg-gradient-to-br from-red-900/20 via-red-800/10 to-transparent"
                      }`}
                    >
                      {/* HEADER ROW */}
                      <div className="flex items-start justify-between p-4 pb-3 border-b border-gray-700/50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-bold text-2xl text-white">{position.symbol}</span>
                            <Badge
                              variant={position.side === "Buy" ? "default" : "secondary"}
                              className={`text-sm px-2 py-1 ${
                                position.side === "Buy"
                                  ? "bg-green-600 hover:bg-green-700"
                                  : "bg-red-600 hover:bg-red-700"
                              }`}
                            >
                              {position.side === "Buy" ? "LONG" : "SHORT"} {leverage}x
                            </Badge>
                            {botPos && (
                              <Badge variant="outline" className="text-xs text-purple-300 border-purple-500/50 bg-purple-500/10">
                                {botPos.tier}
                              </Badge>
                            )}
                          </div>
                          
                          {/* Czas otwarcia i czas trwania */}
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            {botPos && (
                              <>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>Otwarto: {new Date(botPos.openedAt).toLocaleString("pl-PL", {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Zap className="h-3 w-3" />
                                  <span>Czas trwania: {durationText}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* PNL i przycisk zamknięcia */}
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div
                              className={`text-2xl font-bold mb-1 ${
                                isProfitable ? "text-green-400" : "text-red-400"
                              }`}
                            >
                              {isProfitable ? "+" : ""}
                              {pnl.toFixed(2)} USDT
                            </div>
                            <div className={`text-sm font-semibold ${isProfitable ? "text-green-300" : "text-red-300"}`}>
                              ROE: {roe >= 0 ? "+" : ""}{roe.toFixed(2)}%
                            </div>
                          </div>
                          
                          <Button
                            onClick={() => handleClosePosition(position.symbol)}
                            disabled={closingPosition === position.symbol}
                            size="sm"
                            variant="destructive"
                            className="h-9 w-9 p-0"
                            title="Zamknij pozycję"
                          >
                            {closingPosition === position.symbol ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* ROE PROGRESS BAR */}
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

                      {/* DANE POZYCJI - 3 SEKCJE */}
                      <div className="p-4 space-y-3">
                        
                        {/* Sekcja 1: Ceny i rozmiar */}
                        <div className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/50">
                          <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="h-4 w-4 text-blue-400" />
                            <h4 className="text-xs font-semibold text-gray-300">Ceny i Rozmiar</h4>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <div className="text-gray-400 text-xs">Wejście</div>
                              <div className="font-semibold text-white">{entryPrice.toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Obecna Cena</div>
                              <div className="font-semibold text-white">{markPrice.toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Zmiana</div>
                              <div className={`font-semibold ${priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                              </div>
                              <div className="text-xs text-gray-500">
                                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(4)}
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Rozmiar</div>
                              <div className="font-semibold text-white">{size.toFixed(4)}</div>
                            </div>
                          </div>
                        </div>

                        {/* Sekcja 2: Wartość i margin */}
                        <div className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/50">
                          <div className="flex items-center gap-2 mb-2">
                            <Wallet className="h-4 w-4 text-amber-400" />
                            <h4 className="text-xs font-semibold text-gray-300">Wartość i Margin</h4>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <div className="text-gray-400 text-xs">Wartość Pozycji</div>
                              <div className="font-semibold text-white">{posValue.toFixed(2)} USDT</div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Użyty Margin</div>
                              <div className="font-semibold text-amber-300">{margin.toFixed(2)} USDT</div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Dźwignia</div>
                              <div className="font-semibold text-white">{leverage}x</div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Likwidacja</div>
                              <div className="font-semibold text-red-400">
                                {liqPrice > 0 ? liqPrice.toFixed(4) : "N/A"}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Sekcja 3: SL/TP Levels */}
                        <div className="p-3 rounded-lg bg-gradient-to-br from-gray-800/60 to-gray-800/30 border border-gray-700/50">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Target className="h-4 w-4 text-purple-400" />
                              <h4 className="text-xs font-semibold text-gray-300">Poziomy SL/TP</h4>
                            </div>
                            {botPos?.alertData ? (
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
                            {/* Stop Loss */}
                            <div className="p-2 rounded bg-red-500/10 border border-red-500/30">
                              <div className="text-gray-400 text-xs mb-1">Stop Loss</div>
                              {botPos?.liveSlPrice && parseFloat(String(botPos.liveSlPrice)) > 0 ? (
                                <>
                                  <div className="font-semibold text-red-400">
                                    {parseFloat(String(botPos.liveSlPrice)).toFixed(4)}
                                  </div>
                                  {distanceToSl !== null && (
                                    <div className="text-xs text-red-300 mt-1">
                                      {distanceToSl.toFixed(2)}% distance
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="font-semibold text-gray-500">N/A</div>
                              )}
                            </div>
                            
                            {/* TP1 */}
                            <div className="p-2 rounded bg-green-500/10 border border-green-500/30">
                              <div className="text-gray-400 text-xs mb-1">Take Profit 1</div>
                              {botPos?.liveTp1Price && parseFloat(String(botPos.liveTp1Price)) > 0 ? (
                                <>
                                  <div className="font-semibold text-green-400">
                                    {parseFloat(String(botPos.liveTp1Price)).toFixed(4)}
                                  </div>
                                  {distanceToTp1 !== null && (
                                    <div className="text-xs text-green-300 mt-1">
                                      {distanceToTp1.toFixed(2)}% to target
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="font-semibold text-gray-500">N/A</div>
                              )}
                            </div>
                            
                            {/* TP2 */}
                            <div className="p-2 rounded bg-green-500/10 border border-green-500/30">
                              <div className="text-gray-400 text-xs mb-1">Take Profit 2</div>
                              {botPos?.liveTp2Price && parseFloat(String(botPos.liveTp2Price)) > 0 ? (
                                <div className="font-semibold text-green-400">
                                  {parseFloat(String(botPos.liveTp2Price)).toFixed(4)}
                                </div>
                              ) : (
                                <div className="font-semibold text-gray-500">N/A</div>
                              )}
                            </div>
                            
                            {/* TP3 */}
                            <div className="p-2 rounded bg-green-500/10 border border-green-500/30">
                              <div className="text-gray-400 text-xs mb-1">Take Profit 3</div>
                              {botPos?.liveTp3Price && parseFloat(String(botPos.liveTp3Price)) > 0 ? (
                                <div className="font-semibold text-green-400">
                                  {parseFloat(String(botPos.liveTp3Price)).toFixed(4)}
                                </div>
                              ) : (
                                <div className="font-semibold text-gray-500">N/A</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Dodatkowe metryki jeśli są dane z bota */}
                        {botPos && (
                          <div className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/50">
                            <div className="flex items-center gap-2 mb-2">
                              <Activity className="h-4 w-4 text-cyan-400" />
                              <h4 className="text-xs font-semibold text-gray-300">Dodatkowe Informacje</h4>
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
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ✅ NOWA SEKCJA: Historia Pozycji (ostatnie 10) */}
        <Card className="border-amber-800 bg-gradient-to-br from-amber-900/30 to-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-400" />
                  Historia Pozycji
                  <Badge variant="secondary" className="bg-gray-700 text-gray-200">{historyPositions.length}</Badge>
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Ostatnie 10 zamkniętych pozycji
                </CardDescription>
              </div>
              <Button
                onClick={() => router.push("/bot-history")}
                variant="outline"
                size="sm"
                className="border-amber-700 text-amber-300 hover:bg-amber-900/20"
              >
                Zobacz Wszystkie
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {historyPositions.length === 0 && (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-gray-300">Brak zamkniętych pozycji</p>
              </div>
            )}

            {historyPositions.length > 0 && (
              <div className="space-y-3">
                {historyPositions.map((position) => {
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
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                          <div className="text-xs text-gray-400">
                            Zamknięto: {new Date(position.closedAt).toLocaleString("pl-PL")}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
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

                          {/* ✅ PRZYCISK "ZOBACZ ALERT" */}
                          {position.alertData ? (
                            <Button
                              onClick={() => handleShowAlertData(position.alertData)}
                              size="sm"
                              variant="outline"
                              className="h-9 border-blue-600 text-blue-400 hover:bg-blue-600/20"
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              Zobacz Alert
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-xs text-gray-500 border-gray-600">
                              Brak alertu
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
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
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ✅ NOWY DIALOG: Dane alertu */}
        <Dialog open={showAlertDialog} onOpenChange={setShowAlertDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" />
                Dane Alertu - {selectedAlertData?.symbol}
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Wartości rynkowe z alertu TradingView w momencie otwarcia pozycji
              </DialogDescription>
            </DialogHeader>

            {selectedAlertData && (
              <div className="space-y-4">
                {/* Podstawowe informacje */}
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
                      <div className="text-gray-400">Siła Sygnału</div>
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

                {/* Ceny wejścia i wyjścia */}
                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Ceny Wejścia i Wyjścia</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-gray-400">Entry Price</div>
                      <div className="font-semibold text-green-400">{selectedAlertData.entryPrice}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Stop Loss</div>
                      <div className="font-semibold text-red-400">{selectedAlertData.sl}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Main TP</div>
                      <div className="font-semibold text-green-400">{selectedAlertData.mainTp}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">TP1</div>
                      <div className="font-semibold text-green-300">{selectedAlertData.tp1}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">TP2</div>
                      <div className="font-semibold text-green-300">{selectedAlertData.tp2}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">TP3</div>
                      <div className="font-semibold text-green-300">{selectedAlertData.tp3}</div>
                    </div>
                  </div>
                </div>

                {/* Wskaźniki techniczne */}
                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Wskaźniki Techniczne</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-gray-400">ATR</div>
                      <div className="font-semibold text-white">{selectedAlertData.atr}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Volume Ratio</div>
                      <div className="font-semibold text-white">
                        {selectedAlertData.volumeRatio?.toFixed(2) || "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">MTF Agreement</div>
                      <div className="font-semibold text-blue-400">
                        {(selectedAlertData.mtfAgreement * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">Regime</div>
                      <div className="font-semibold text-white">{selectedAlertData.regime}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Regime Confidence</div>
                      <div className="font-semibold text-blue-400">
                        {(selectedAlertData.regimeConfidence * 100).toFixed(1)}%
                      </div>
                    </div>
                    {selectedAlertData.latency && (
                      <div>
                        <div className="text-gray-400">Latencja</div>
                        <div className="font-semibold text-white">{selectedAlertData.latency}ms</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Order Blocks & FVG */}
                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Order Blocks & FVG</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-gray-400">In OB</div>
                      <Badge variant={selectedAlertData.inOb ? "default" : "secondary"}>
                        {selectedAlertData.inOb ? "Tak" : "Nie"}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-gray-400">OB Score</div>
                      <div className="font-semibold text-white">
                        {selectedAlertData.obScore?.toFixed(2) || "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">In FVG</div>
                      <Badge variant={selectedAlertData.inFvg ? "default" : "secondary"}>
                        {selectedAlertData.inFvg ? "Tak" : "Nie"}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-gray-400">FVG Score</div>
                      <div className="font-semibold text-white">
                        {selectedAlertData.fvgScore?.toFixed(2) || "N/A"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Smart Money Indicators */}
                {(selectedAlertData.institutionalFlow || selectedAlertData.accumulation || selectedAlertData.volumeClimax) && (
                  <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">Smart Money</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      {selectedAlertData.institutionalFlow !== undefined && (
                        <div>
                          <div className="text-gray-400">Institutional Flow</div>
                          <div className="font-semibold text-purple-400">
                            {selectedAlertData.institutionalFlow?.toFixed(2) || "N/A"}
                          </div>
                        </div>
                      )}
                      {selectedAlertData.accumulation !== undefined && (
                        <div>
                          <div className="text-gray-400">Accumulation</div>
                          <div className="font-semibold text-purple-400">
                            {selectedAlertData.accumulation?.toFixed(2) || "N/A"}
                          </div>
                        </div>
                      )}
                      {selectedAlertData.volumeClimax !== undefined && (
                        <div>
                          <div className="text-gray-400">Volume Climax</div>
                          <Badge variant={selectedAlertData.volumeClimax ? "default" : "secondary"}>
                            {selectedAlertData.volumeClimax ? "Tak" : "Nie"}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}