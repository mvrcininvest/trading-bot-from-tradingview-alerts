"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Wallet, RefreshCw, AlertCircle, Settings, Activity, ArrowUpRight, ArrowDownRight, Bell, Bot, History, BarChart3, FileText, Zap, DollarSign, Power, AlertTriangle, Wrench, XCircle, Eye, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  positionIM?: string;
  positionMM?: string;
  cumRealisedPnl?: string;
  bustPrice?: string;
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
  tp1Price: number | null;
  tp2Price: number | null;
  tp3Price: number | null;
  mainTpPrice: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  currentSl: number;
  positionValue: number;
  initialMargin: number;
  unrealisedPnl: number;
  confirmationCount: number;
  confidenceScore: number;
  openedAt: string;
  status: string;
  liveSlPrice?: number | null;
  liveTp1Price?: number | null;
  liveTp2Price?: number | null;
  liveTp3Price?: number | null;
}

interface SymbolLock {
  id: number;
  symbol: string;
  lockReason: string;
  failureCount: number;
  lockedAt: string;
  unlockedAt: string | null;
}

interface OkoAction {
  id: number;
  positionId: number | null;
  actionType: string;
  reason: string;
  checkCount: number;
  createdAt: string;
  metadata: any;
  position: {
    symbol: string;
    side: string;
    tier: string;
    entryPrice: number;
    unrealisedPnl: number;
  } | null;
}

interface OkoStats {
  total: number;
  closures: number;
  repairs: number;
  byType: Record<string, number>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<ExchangeCredentials | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [botPositions, setBotPositions] = useState<BotPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [loadingBotPositions, setLoadingBotPositions] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);
  const [loadingFixTpSl, setLoadingFixTpSl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [botPositionsError, setBotPositionsError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [botEnabled, setBotEnabled] = useState<boolean | null>(null);
  const [credentialsSynced, setCredentialsSynced] = useState(false);
  const [symbolLocks, setSymbolLocks] = useState<SymbolLock[]>([]);
  const [loadingLocks, setLoadingLocks] = useState(false);
  const [closeAllDialogOpen, setCloseAllDialogOpen] = useState(false);
  const [loadingCloseAll, setLoadingCloseAll] = useState(false);
  const [closePositionDialogOpen, setClosePositionDialogOpen] = useState(false);
  const [positionToClose, setPositionToClose] = useState<Position | null>(null);
  const [loadingClosePosition, setLoadingClosePosition] = useState(false);
  const [balanceCollapsed, setBalanceCollapsed] = useState(false);
  const [okoActions, setOkoActions] = useState<OkoAction[]>([]);
  const [okoStats, setOkoStats] = useState<OkoStats | null>(null);
  const [loadingOko, setLoadingOko] = useState(false);
  const [okoTimeRange, setOkoTimeRange] = useState<24 | 48 | 168>(24);
  const [syncingCredentials, setSyncingCredentials] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchBotPositions = useCallback(async (silent = false) => {
    if (!silent) {
      setLoadingBotPositions(true);
    }
    setBotPositionsError(null);

    try {
      const response = await fetch("/api/bot/positions");
      const data = await response.json();

      if (data.success && Array.isArray(data.positions)) {
        const openPositions = data.positions.filter((p: BotPosition) => p.status === 'open');
        setBotPositions(openPositions);
      } else {
        setBotPositionsError("Nie udało się pobrać pozycji bota");
      }
    } catch (err) {
      setBotPositionsError(`Błąd połączenia: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      if (!silent) {
        setLoadingBotPositions(false);
      }
    }
  }, []);

  const fetchPositions = useCallback(async (creds?: ExchangeCredentials, silent = false) => {
    const credsToUse = creds || credentials;
    if (!credsToUse) return;

    if (!silent) {
      setLoadingPositions(true);
    }
    setPositionsError(null);

    try {
      // Only Bybit is supported
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
            positionIM: p.positionIM || "0",
            positionMM: p.positionMM || "0",
            cumRealisedPnl: p.cumRealisedPnl || "0",
            bustPrice: p.bustPrice || "0"
          }));
        
        setPositions(openPositions);
        setPositionsError(null);
      } else {
        setPositionsError(`Bybit API error: ${data.retMsg || "Nieznany błąd"}`);
      }
    } catch (err) {
      setPositionsError(`Błąd połączenia: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      if (!silent) {
        setLoadingPositions(false);
      }
    }
  }, [credentials]);

  const fetchOkoActions = useCallback(async (silent = false) => {
    if (!silent) setLoadingOko(true);
    
    try {
      const response = await fetch(`/api/bot/oko-actions?hours=${okoTimeRange}&limit=50`);
      const data = await response.json();
      
      if (data.success) {
        setOkoActions(data.actions);
        setOkoStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch Oko actions:', error);
    } finally {
      if (!silent) setLoadingOko(false);
    }
  }, [okoTimeRange]);

  useEffect(() => {
    const stored = localStorage.getItem("exchange_credentials");
    if (stored) {
      const creds = JSON.parse(stored);
      
      // Force Bybit mainnet
      creds.exchange = "bybit";
      creds.environment = "mainnet";
      
      setCredentials(creds);
      
      if (!credentialsSynced) {
        syncCredentialsToDatabase(creds);
        setCredentialsSynced(true);
      }
      
      fetchBalance(creds);
      fetchPositions(creds);
      fetchBotPositions();
      fetchBotStatus();
      fetchSymbolLocks();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!credentials) return;

    const interval = setInterval(() => {
      fetchBotPositions(true);
      fetchBotStatus(true);
    }, 2000);

    return () => clearInterval(interval);
  }, [credentials, fetchBotPositions]);

  useEffect(() => {
    if (!credentials) return;

    const autoFixInterval = setInterval(async () => {
      try {
        console.log("🔍 [Background] Running position monitor...");
        const response = await fetch("/api/bot/monitor-positions", {
          method: "POST",
        });
        const data = await response.json();

        if (data.success && data.result) {
          const { tpHits, slAdjustments, slTpFixed } = data.result;
          if (tpHits > 0 || slAdjustments > 0 || slTpFixed > 0) {
            console.log(`✅ [Background] Monitor: TP hits ${tpHits}, SL adj ${slAdjustments}, Fixed ${slTpFixed}`);
            fetchBotPositions(true);
            fetchPositions(credentials, true);
          }
        }
      } catch (error) {
        console.error("❌ [Background] Monitor failed:", error);
      }
    }, 10000);

    return () => clearInterval(autoFixInterval);
  }, [credentials, fetchBotPositions, fetchPositions]);

  useEffect(() => {
    if (!credentials) return;

    const interval = setInterval(() => {
      fetchPositions(credentials, true);
    }, 500);

    return () => clearInterval(interval);
  }, [credentials, fetchPositions]);

  useEffect(() => {
    if (!credentials) return;
    
    fetchOkoActions(true);
    
    const interval = setInterval(() => {
      fetchOkoActions(true);
    }, 10000);
    
    return () => clearInterval(interval);
  }, [credentials, fetchOkoActions]);

  const fetchSymbolLocks = async () => {
    setLoadingLocks(true);
    try {
      const response = await fetch("/api/bot/diagnostics/locks");
      const data = await response.json();
      if (data.success) {
        // Filter only active locks
        const activeLocks = data.locks.filter((lock: SymbolLock) => !lock.unlockedAt);
        setSymbolLocks(activeLocks);
      }
    } catch (error) {
      console.error("Failed to fetch symbol locks:", error);
    } finally {
      setLoadingLocks(false);
    }
  };

  const syncCredentialsToDatabase = async (credsOverride?: ExchangeCredentials) => {
    const credsToUse = credsOverride || credentials;
    if (!credsToUse) {
      toast.error("Brak credentials do synchronizacji");
      return;
    }

    setSyncingCredentials(true);
    try {
      console.log("🔄 Syncing credentials to database:", {
        exchange: "bybit",
        environment: "mainnet",
        apiKeyPreview: credsToUse.apiKey.substring(0, 8) + "..."
      });

      const response = await fetch("/api/bot/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: credsToUse.apiKey,
          apiSecret: credsToUse.apiSecret,
          exchange: "bybit",
          environment: "mainnet"
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`✅ Credentials Bybit zapisane do bazy danych!`);
        console.log("✅ Database sync successful");
      } else {
        toast.error(`❌ Błąd zapisu: ${data.error}`);
        console.error("❌ Database sync failed:", data);
      }
    } catch (error) {
      toast.error(`❌ Błąd połączenia: ${error instanceof Error ? error.message : "Nieznany błąd"}`);
      console.error("❌ Sync error:", error);
    } finally {
      setSyncingCredentials(false);
    }
  };

  const clearLocalStorageAndReconfigure = () => {
    localStorage.removeItem("exchange_credentials");
    toast.success("✅ localStorage wyczyszczony! Przekierowuję do konfiguracji...");
    setTimeout(() => {
      router.push("/exchange-test");
    }, 1000);
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
      // Fetch balance directly from Bybit API (client-side)
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
        // Refresh bot positions after sync
        await fetchBotPositions();
        await fetchPositions(credentials || undefined);
        alert(`Synchronizacja ukończona!\n\nSprawdzono: ${data.results.checked}\nZamknięto: ${data.results.closed}\nNadal otwarte: ${data.results.stillOpen}`);
      } else {
        alert(`Błąd synchronizacji: ${data.message}`);
      }
    } catch (err) {
      alert(`Błąd połączenia: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      setLoadingSync(false);
    }
  };

  const handleFixMissingTpSl = async () => {
    setLoadingFixTpSl(true);
    try {
      const response = await fetch("/api/bot/fix-missing-tpsl", {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        // Refresh bot positions after fix
        await fetchBotPositions();
        await fetchPositions(credentials || undefined);
        
        const { results } = data;
        let message = `🔧 Naprawa SL/TP ukończona!\n\n`;
        message += `✅ Sprawdzono: ${results.checked} pozycji\n`;
        
        if (results.fixed > 0) {
          message += `🔧 Naprawiono: ${results.fixed}\n`;
        }
        if (results.closed > 0) {
          message += `🚫 Zamknięto: ${results.closed} (SL/TP już osiągnięte)\n`;
        }
        if (results.skipped > 0) {
          message += `⚠️ Pominięto: ${results.skipped} (wymaga manualnej konfiguracji)\n`;
        }
        if (results.errors.length > 0) {
          message += `\n❌ Błędy: ${results.errors.length}\n`;
          message += results.errors.slice(0, 3).join('\n');
          if (results.errors.length > 3) {
            message += `\n... i ${results.errors.length - 3} więcej`;
          }
        }
        
        if (results.details && results.details.length > 0) {
          message += `\n\n📋 Szczegóły:\n`;
          results.details.slice(0, 5).forEach((detail: any) => {
            message += `• ${detail.symbol} ${detail.side}: ${detail.action} - ${detail.reason}\n`;
          });
        }
        
        alert(message);
      } else {
        alert(`❌ Błąd naprawy SL/TP: ${data.message}`);
      }
    } catch (err) {
      alert(`❌ Błąd połączenia: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      setLoadingFixTpSl(false);
    }
  };

  const handleCloseAllPositions = async () => {
    if (!credentials) {
      toast.error("Brak konfiguracji API");
      return;
    }

    setLoadingCloseAll(true);
    try {
      const response = await fetch("/api/exchange/close-all-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: credentials.exchange,
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          environment: credentials.environment
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`✅ Zamknięto ${data.results.positionsClosed} pozycji i anulowano ${data.results.ordersCancelled} orderów!`);
        
        // Refresh data
        await fetchBotPositions();
        await fetchPositions(credentials);
        
        setCloseAllDialogOpen(false);
      } else {
        toast.error(`❌ Błąd: ${data.message}`);
      }
    } catch (error: any) {
      toast.error(`❌ Błąd połączenia: ${error.message}`);
    } finally {
      setLoadingCloseAll(false);
    }
  };

  const handleClosePosition = async (position: Position) => {
    if (!credentials) {
      toast.error("Brak konfiguracji API");
      return;
    }

    setLoadingClosePosition(true);
    try {
      const response = await fetch("/api/exchange/close-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: credentials.exchange,
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          environment: credentials.environment,
          symbol: position.symbol,
          cancelOrders: true
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`✅ Zamknięto pozycję ${position.symbol}${data.ordersCancelled > 0 ? ` i anulowano ${data.ordersCancelled} orderów` : ''}!`);
        
        // Refresh data
        await fetchBotPositions();
        await fetchPositions(credentials);
        
        setClosePositionDialogOpen(false);
        setPositionToClose(null);
      } else {
        toast.error(`❌ Błąd: ${data.message}`);
      }
    } catch (error: any) {
      toast.error(`❌ Błąd połączenia: ${error.message}`);
    } finally {
      setLoadingClosePosition(false);
    }
  };

  const TPBadge = ({ 
    label, 
    price, 
    livePrice, 
    isHit 
  }: { 
    label: string; 
    price: number | null; 
    livePrice: number | null | undefined; 
    isHit: boolean;
  }) => {
    if (!livePrice && !price) return null;
    
    return (
      <Badge 
        variant={isHit ? "default" : "outline"} 
        className={
          isHit 
            ? "bg-green-600 text-white" 
            : livePrice
              ? "border-green-700 text-green-300"
              : "border-gray-600 text-gray-400"
        }
      >
        {label}: {(livePrice || price)?.toFixed(4)} 
        {isHit ? " ✓" : livePrice ? " 🟢" : ""}
      </Badge>
    );
  };

  // Calculate stats
  const totalBalance = balances.reduce((sum, b) => sum + parseFloat(b.total), 0);
  const totalPnL = [...positions, ...botPositions.map(bp => ({
    unrealisedPnl: bp.unrealisedPnl.toString()
  }))].reduce((sum, p) => sum + parseFloat(p.unrealisedPnl || "0"), 0);
  const botPnL = botPositions.reduce((sum, bp) => sum + bp.unrealisedPnl, 0);
  const winningPositions = [...positions, ...botPositions].filter(p => {
    const pnl = typeof p.unrealisedPnl === 'number' ? p.unrealisedPnl : parseFloat(p.unrealisedPnl || "0");
    return pnl > 0;
  }).length;
  const totalPositionsCount = positions.length;

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

              <div className="p-4 rounded-lg bg-blue-900/40 border-2 border-blue-700">
                <p className="text-base font-bold text-blue-200 mb-3">
                  💡 CO ROBIĆ:
                </p>
                <ol className="space-y-2 text-sm text-gray-200 list-decimal list-inside">
                  <li>Kliknij przycisk <strong className="text-white">"Konfiguracja API"</strong> poniżej</li>
                  <li>Wprowadź <strong className="text-white">klucze Bybit Mainnet</strong></li>
                  <li>Kliknij <strong className="text-white">"Test Connection"</strong></li>
                  <li>Wróć do dashboardu</li>
                </ol>
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
                    {lock.symbol} {lock.side} {lock.size} {lock.reason}
                  </span>
                ))}
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Oko Saurona Activity Summary */}
        {okoStats && okoStats.total > 0 && (
          <Alert className="border-blue-800 bg-blue-900/30 text-blue-200">
            <Bot className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-sm font-medium">🤖 {okoStats.total} aktywnych pozycji</span>
              </div>
              <p className="text-xs mt-1">
                <span className="text-green-400">🟢 {okoStats.winning}</span> / <span className="text-red-400">🔴 {okoStats.losing}</span> / <span className="text-yellow-400">🟡 {okoStats.stale}</span>
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Header with Quick Stats */}
        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-gradient-to-br from-green-900/30 to-green-800/50 border border-green-800/30 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-green-300">Razem</h3>
                <Wallet className="h-4 w-4 text-green-400" />
              </div>
              <p className="text-2xl font-bold text-green-100">
                {totalBalance.toLocaleString()}
              </p>
              <p className="text-xs text-green-400">USDT</p>
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-blue-900/30 to-blue-800/50 border border-blue-800/30 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-blue-300">PnL</h3>
                <Zap className="h-4 w-4 text-blue-400" />
              </div>
              <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                {totalPnL.toLocaleString()}
              </p>
              <p className="text-xs text-blue-400">USDT</p>
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-purple-900/30 to-purple-800/50 border border-purple-800/30 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-purple-300">Bot PnL</h3>
                <Bot className="h-4 w-4 text-purple-400" />
              </div>
              <p className={`text-2xl font-bold ${botPnL >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                {botPnL.toLocaleString()}
              </p>
              <p className="text-xs text-purple-400">USDT</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-gradient-to-br from-yellow-900/30 to-yellow-800/50 border border-yellow-800/30 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-yellow-300">Pozycje</h3>
                <Activity className="h-4 w-4 text-yellow-400" />
              </div>
              <p className="text-2xl font-bold text-yellow-100">
                {totalPositionsCount}
              </p>
              <p className="text-xs text-yellow-400">otwarte</p>
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-red-900/30 to-red-800/50 border border-red-800/30 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-red-300">Wygrane</h3>
                <ArrowUpRight className="h-4 w-4 text-red-400" />
              </div>
              <p className="text-2xl font-bold text-green-100">
                {winningPositions}
              </p>
              <p className="text-xs text-green-400">z {totalPositionsCount}</p>
            </div>
          </div>
        </div>

        {/* Main Content with Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
          <TabsContent value="overview">
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-gray-800/30 to-gray-700/50 border border-gray-700/30 backdrop-blur-sm">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Bot Status</p>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${botEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className={`text-sm font-medium ${botEnabled ? 'text-green-300' : 'text-red-300'}`}>
                        {botEnabled ? '🟢 Aktywny' : '🔴 Wyłączony'}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs text-gray-400 mb-1">API Status</p>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${credentials ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className={`text-sm font-medium ${credentials ? 'text-green-300' : 'text-red-300'}`}>
                        {credentials ? '🟢 Połączony' : '🔴 Brak konfiguracji'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-gradient-to-br from-gray-800/30 to-gray-700/50 border border-gray-700/30 backdrop-blur-sm">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Ostatnia aktualizacja</h3>
                <p className="text-sm text-gray-400">
                  {lastUpdate || 'Nie znaleziono danych'}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="positions">
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-gray-800/30 to-gray-700/50 border border-gray-700/30 backdrop-blur-sm">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Pozycje</h3>
                <div className="space-y-3">
                  {positions.map((position, index) => (
                    <div key={index} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/30 backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${position.side === 'Buy' ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="text-sm font-medium text-gray-200">
                            {position.symbol} {position.side}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400">
                          {position.size} {position.entryPrice ? `@ ${position.entryPrice}` : ''}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">PnL</p>
                          <p className={`text-sm font-medium ${position.unrealisedPnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                            {position.unrealisedPnl >= 0 ? '+' : ''}{position.unrealisedPnl} USDT
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-xs text-gray-400 mb-1">TP</p>
                          <TPBadge 
                            label="TP" 
                            price={position.takeProfit} 
                            livePrice={position.takeProfit} 
                            isHit={position.takeProfit === position.markPrice}
                          />
                        </div>
                        
                        <div>
                          <p className="text-xs text-gray-400 mb-1">SL</p>
                          <TPBadge 
                            label="SL" 
                            price={position.stopLoss} 
                            livePrice={position.stopLoss} 
                            isHit={position.stopLoss === position.markPrice}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bot">
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-gray-800/30 to-gray-700/50 border border-gray-700/30 backdrop-blur-sm">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Bot Status</h3>
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/30 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${botEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={`text-sm font-medium ${botEnabled ? 'text-green-300' : 'text-red-300'}`}>
                          {botEnabled ? '🟢 Aktywny' : '🔴 Wyłączony'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400">
                        {botEnabled ? 'Bot działa' : 'Bot nie działa'}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/30 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${credentials ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={`text-sm font-medium ${credentials ? 'text-green-300' : 'text-red-300'}`}>
                          {credentials ? '🟢 Połączony' : '🔴 Brak konfiguracji'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400">
                        {credentials ? 'API połączony' : 'Brak API'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* ... keep all existing dialogs ... */}
      </div>
    </div>
  );
}