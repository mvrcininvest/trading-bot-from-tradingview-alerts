"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Wallet, RefreshCw, AlertCircle, Settings, Activity, Bot } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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
  const [loading, setLoading] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [botEnabled, setBotEnabled] = useState<boolean | null>(null);
  const [symbolLocks, setSymbolLocks] = useState<SymbolLock[]>([]);
  const [loadingSync, setLoadingSync] = useState(false);

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
    }, 2000);

    return () => clearInterval(interval);
  }, [credentials, fetchBotPositions, fetchPositions]);

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

  // ✅ POPRAWIONE STATYSTYKI
  const totalBalance = balances.reduce((sum, b) => sum + parseFloat(b.total), 0);
  const totalPnL = positions.reduce((sum, p) => sum + parseFloat(p.unrealisedPnl || "0"), 0);

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

        {/* ✅ UPROSZCZONE STATYSTYKI - tylko 3 karty */}
        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
              </p>
              <p className="text-xs text-blue-400">USDT (otwarte pozycje)</p>
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

        {/* Positions List */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Otwarte Pozycje
              <Badge variant="secondary" className="bg-gray-700 text-gray-200">{positions.length}</Badge>
            </CardTitle>
            <CardDescription className="text-gray-300">
              Twoje aktualne pozycje tradingowe
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
              <div className="space-y-3">
                {positions.map((position, idx) => {
                  const pnl = parseFloat(position.unrealisedPnl || "0");
                  const isProfitable = pnl > 0;
                  const posValue = parseFloat(position.positionValue);
                  const entryPrice = parseFloat(position.entryPrice);
                  const markPrice = parseFloat(position.markPrice);
                  const size = parseFloat(position.size);

                  return (
                    <div
                      key={idx}
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
                        </div>

                        <div className="text-right">
                          <div
                            className={`text-xl font-bold ${
                              isProfitable ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {isProfitable ? "+" : ""}
                            {pnl.toFixed(4)} USDT
                          </div>
                        </div>
                      </div>

                      {/* ✅ ROZSZERZONE DANE - więcej informacji */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                        <div>
                          <div className="text-gray-300">Wejście</div>
                          <div className="font-semibold text-white">{entryPrice.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-gray-300">Obecna Cena</div>
                          <div className="font-semibold text-white">{markPrice.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-gray-300">Rozmiar</div>
                          <div className="font-semibold text-white">{size.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-gray-300">Wartość</div>
                          <div className="font-semibold text-white">{posValue.toFixed(2)} USDT</div>
                        </div>
                        <div>
                          <div className="text-gray-300">Likwidacja</div>
                          <div className="font-semibold text-red-400">
                            {position.liqPrice && parseFloat(position.liqPrice) > 0 
                              ? parseFloat(position.liqPrice).toFixed(4) 
                              : "N/A"}
                          </div>
                        </div>
                      </div>

                      {(parseFloat(position.takeProfit) > 0 || parseFloat(position.stopLoss) > 0) && (
                        <div className="mt-3 flex items-center gap-3 text-xs">
                          {parseFloat(position.takeProfit) > 0 && (
                            <span className="text-green-400">
                              TP: {parseFloat(position.takeProfit).toFixed(4)}
                            </span>
                          )}
                          {parseFloat(position.stopLoss) > 0 && (
                            <span className="text-red-400">
                              SL: {parseFloat(position.stopLoss).toFixed(4)}
                            </span>
                          )}
                        </div>
                      )}
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