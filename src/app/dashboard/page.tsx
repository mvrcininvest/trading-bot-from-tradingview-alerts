"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Wallet, RefreshCw, AlertCircle, Settings, Activity, ArrowUpRight, ArrowDownRight, Bell, Bot, History, BarChart3, FileText, Zap, DollarSign } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
}

interface ExchangeCredentials {
  exchange: "binance" | "bybit";
  apiKey: string;
  apiSecret: string;
  environment: string;
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
  const [error, setError] = useState<string | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [botPositionsError, setBotPositionsError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [lastPositionsUpdate, setLastPositionsUpdate] = useState<string | null>(null);

  useEffect(() => {
    // Load credentials from localStorage
    const stored = localStorage.getItem("exchange_credentials");
    if (stored) {
      const creds = JSON.parse(stored);
      setCredentials(creds);
      // Auto-fetch balance and positions on mount
      fetchBalance(creds);
      fetchPositions(creds);
      fetchBotPositions();
    }
  }, []);

  // Auto-refresh bot positions every 2 seconds
  useEffect(() => {
    if (!credentials) return;

    const interval = setInterval(() => {
      fetchBotPositions(true); // silent mode
    }, 2000);

    return () => clearInterval(interval);
  }, [credentials]);

  // Auto-refresh positions every 0.5 seconds (always on)
  useEffect(() => {
    if (!credentials) return;

    const interval = setInterval(() => {
      fetchPositions(credentials, true); // silent mode - no loading indicator
    }, 500); // 0.5 seconds for ultra real-time data

    return () => clearInterval(interval);
  }, [credentials]);

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

  const fetchBotPositions = async (silent = false) => {
    if (!silent) {
      setLoadingBotPositions(true);
    }
    setBotPositionsError(null);

    try {
      const response = await fetch("/api/bot/positions");
      const data = await response.json();

      if (data.success && Array.isArray(data.positions)) {
        // Filter only open positions
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
  };

  const fetchPositions = async (creds?: ExchangeCredentials, silent = false) => {
    const credsToUse = creds || credentials;
    if (!credsToUse) return;

    if (!silent) {
      setLoadingPositions(true);
    }
    setPositionsError(null);

    try {
      if (credsToUse.exchange === "bybit") {
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
        
        const baseUrl = credsToUse.environment === "demo" 
          ? "https://api-demo.bybit.com"
          : credsToUse.environment === "testnet"
          ? "https://api-testnet.bybit.com"
          : "https://api.bybit.com";
        
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
              positionValue: p.positionValue
            }));
          
          setPositions(openPositions);
          setLastPositionsUpdate(new Date().toLocaleString("pl-PL"));
          setPositionsError(null);
        } else {
          setPositionsError(`Bybit API error: ${data.retMsg || "Nieznany błąd"}`);
        }
      } else {
        setPositionsError("Pobieranie pozycji jest obecnie wspierane tylko dla Bybit");
      }
    } catch (err) {
      setPositionsError(`Błąd połączenia: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    } finally {
      if (!silent) {
        setLoadingPositions(false);
      }
    }
  };

  const fetchBalance = async (creds?: ExchangeCredentials) => {
    const credsToUse = creds || credentials;
    if (!credsToUse) return;

    setLoading(true);
    setError(null);

    try {
      if (credsToUse.exchange === "bybit") {
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
        
        const baseUrl = credsToUse.environment === "demo" 
          ? "https://api-demo.bybit.com"
          : credsToUse.environment === "testnet"
          ? "https://api-testnet.bybit.com"
          : "https://api.bybit.com";
        
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
            setLastUpdate(new Date().toLocaleString("pl-PL"));
            setError(null);
          } else {
            setError("Brak danych o saldzie w odpowiedzi API");
          }
        } else {
          setError(`Bybit API error: ${data.retMsg || "Nieznany błąd"}`);
        }
      } else {
        // Binance - use backend API
        const payload = {
          exchange: credsToUse.exchange,
          apiKey: credsToUse.apiKey,
          apiSecret: credsToUse.apiSecret,
          testnet: credsToUse.environment === "testnet",
          demo: credsToUse.environment === "demo"
        };

        const response = await fetch("/api/exchange/get-balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (data.success && data.balances) {
          const filteredBalances = data.balances
            .filter((b: Balance) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
            .map((b: Balance) => ({
              ...b,
              total: (parseFloat(b.free) + parseFloat(b.locked)).toFixed(8)
            }));
          
          setBalances(filteredBalances);
          setLastUpdate(new Date().toLocaleString("pl-PL"));
          setError(null);
        } else {
          setError(data.message || "Nie udało się pobrać salda");
        }
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
        await fetchPositions(credentials);
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

  // Calculate stats
  const totalBalance = balances.reduce((sum, b) => sum + parseFloat(b.total), 0);
  const totalPnL = [...positions, ...botPositions.map(bp => ({
    unrealisedPnl: bp.unrealisedPnl.toString()
  }))].reduce((sum, p) => sum + parseFloat(p.unrealisedPnl || "0"), 0);
  const botPnL = botPositions.reduce((sum, bp) => sum + bp.unrealisedPnl, 0);
  const winningPositions = [...positions, ...botPositions].filter(p => parseFloat(p.unrealisedPnl || "0") > 0).length;
  const totalPositionsCount = positions.length;

  if (!credentials) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-6 flex items-center justify-center">
        <Card className="max-w-md border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Brak konfiguracji API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Nie znaleziono zapisanych kluczy API. Najpierw skonfiguruj połączenie z giełdą.
            </p>
            <Button onClick={() => router.push("/exchange-test")} className="w-full">
              <Settings className="mr-2 h-4 w-4" />
              Skonfiguruj API
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header with Quick Stats */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <TrendingUp className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                  Dashboard Tradingowy
                </h1>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  {credentials.exchange.toUpperCase()} · {credentials.environment}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/logi-bota")}
                className="border-border/50 hover:bg-accent/50 transition-all"
              >
                <FileText className="mr-2 h-4 w-4" />
                Logi
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/bot-history")}
                className="border-border/50 hover:bg-accent/50 transition-all"
              >
                <History className="mr-2 h-4 w-4" />
                Historia
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/alerts")}
                className="border-border/50 hover:bg-accent/50 transition-all"
              >
                <Bell className="mr-2 h-4 w-4" />
                Alerty
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card/90 transition-all">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Saldo Konta</p>
                    <p className="text-2xl font-bold">{totalBalance.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">USDT</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10">
                    <Wallet className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card/90 transition-all">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Całkowity PnL</p>
                    <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">USDT</p>
                  </div>
                  <div className={`p-3 rounded-lg ${totalPnL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    <DollarSign className={`h-6 w-6 ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card/90 transition-all">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Pozycje Bota</p>
                    <p className="text-2xl font-bold">{botPositions.length}</p>
                    <p className={`text-xs font-semibold ${botPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {botPnL >= 0 ? '+' : ''}{botPnL.toFixed(2)} USDT
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Bot className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card/90 transition-all">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Wszystkie Pozycje</p>
                    <p className="text-2xl font-bold">{totalPositionsCount}</p>
                    <p className="text-xs text-muted-foreground">
                      {winningPositions} wygrywa
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-500/10">
                    <Activity className="h-6 w-6 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content with Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-card/50 backdrop-blur-sm border border-border/50">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20">
              <BarChart3 className="mr-2 h-4 w-4" />
              Przegląd
            </TabsTrigger>
            <TabsTrigger value="bot-positions" className="data-[state=active]:bg-primary/20">
              <Bot className="mr-2 h-4 w-4" />
              Pozycje Bota
            </TabsTrigger>
            <TabsTrigger value="all-positions" className="data-[state=active]:bg-primary/20">
              <Activity className="mr-2 h-4 w-4" />
              Wszystkie Pozycje
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-primary/20">
              <Settings className="mr-2 h-4 w-4" />
              Ustawienia
            </TabsTrigger>
            <TabsTrigger value="info" className="data-[state=active]:bg-primary/20">
              <Zap className="mr-2 h-4 w-4" />
              Quick Actions
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Balance Card */}
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      Saldo Konta
                    </CardTitle>
                    <CardDescription>
                      {lastUpdate && <span className="text-xs">Zaktualizowano: {lastUpdate}</span>}
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => fetchBalance()}
                    disabled={loading}
                    size="sm"
                    className="hover:scale-105 transition-transform"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Odśwież
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {error && (
                  <Alert className="mb-4 border-yellow-500/50 bg-yellow-500/10">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription className="text-sm">
                      <strong>Nie można pobrać salda:</strong> {error}
                    </AlertDescription>
                  </Alert>
                )}

                {loading && (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Pobieranie salda...</p>
                  </div>
                )}

                {!loading && balances.length === 0 && !error && (
                  <div className="text-center py-8">
                    <Wallet className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Brak danych o saldzie</p>
                  </div>
                )}

                {!loading && balances.length > 0 && (
                  <div className="space-y-2">
                    {balances.map((balance, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-gradient-to-r from-card to-muted/20 hover:from-muted/30 hover:to-card transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                            <span className="text-sm font-bold text-primary">
                              {balance.asset.substring(0, 2)}
                            </span>
                          </div>
                          <div>
                            <div className="font-semibold text-lg">{balance.asset}</div>
                            <div className="text-xs text-muted-foreground">
                              Wolne: {balance.free} · Zablokowane: {balance.locked}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-2xl">{balance.total}</div>
                          <div className="text-xs text-muted-foreground">Łącznie</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-border/50 bg-gradient-to-br from-primary/10 via-card/80 to-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Pozycje Bota</CardTitle>
                  <CardDescription>Aktywne pozycje automatyczne</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Aktywne:</span>
                      <span className="font-bold">{botPositions.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">PnL:</span>
                      <span className={`font-bold ${botPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {botPnL >= 0 ? '+' : ''}{botPnL.toFixed(2)} USDT
                      </span>
                    </div>
                    <Button 
                      onClick={() => document.querySelector('[value="bot-positions"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))}
                      className="w-full mt-4"
                      variant="secondary"
                    >
                      Zobacz Pozycje
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-gradient-to-br from-purple-500/10 via-card/80 to-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Wszystkie Pozycje</CardTitle>
                  <CardDescription>Łączne informacje</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Otwarte:</span>
                      <span className="font-bold">{totalPositionsCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total PnL:</span>
                      <span className={`font-bold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} USDT
                      </span>
                    </div>
                    <Button 
                      onClick={() => document.querySelector('[value="all-positions"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))}
                      className="w-full mt-4"
                      variant="secondary"
                    >
                      Zobacz Wszystkie
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Bot Positions Tab */}
          <TabsContent value="bot-positions" className="space-y-6">
            <Card className="border-primary/50 bg-gradient-to-br from-primary/5 via-card/80 to-card/80 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-primary" />
                      Pozycje Bota
                      {botPositions.length > 0 && (
                        <Badge variant="default" className="ml-2">
                          {botPositions.length} Aktywnych
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Pozycje otwarte automatycznie przez bota
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleSyncPositions}
                      disabled={loadingSync}
                      size="sm"
                      variant="secondary"
                      className="hover:scale-105 transition-transform"
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${loadingSync ? "animate-spin" : ""}`} />
                      Sync
                    </Button>
                    <Button
                      onClick={() => fetchBotPositions()}
                      disabled={loadingBotPositions}
                      size="sm"
                      variant="outline"
                      className="hover:scale-105 transition-transform"
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${loadingBotPositions ? "animate-spin" : ""}`} />
                      Odśwież
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {botPositionsError && (
                  <Alert className="mb-4 border-yellow-500/50 bg-yellow-500/10">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription className="text-sm">
                      <strong>Błąd:</strong> {botPositionsError}
                    </AlertDescription>
                  </Alert>
                )}

                {loadingBotPositions && (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Pobieranie pozycji bota...</p>
                  </div>
                )}

                {!loadingBotPositions && botPositions.length === 0 && !botPositionsError && (
                  <div className="text-center py-12">
                    <Bot className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">Brak aktywnych pozycji bota</p>
                  </div>
                )}

                {!loadingBotPositions && botPositions.length > 0 && (
                  <div className="space-y-3">
                    {botPositions.map((position) => {
                      const pnl = position.unrealisedPnl;
                      const pnlPercent = position.initialMargin !== 0 ? (pnl / position.initialMargin) * 100 : 0;
                      const isProfitable = pnl >= 0;
                      
                      const tierColors: Record<string, string> = {
                        'Platinum': 'bg-purple-500/10 text-purple-500 border-purple-500/50',
                        'Premium': 'bg-blue-500/10 text-blue-500 border-blue-500/50',
                        'Standard': 'bg-green-500/10 text-green-500 border-green-500/50',
                        'Quick': 'bg-orange-500/10 text-orange-500 border-orange-500/50',
                        'Emergency': 'bg-red-500/10 text-red-500 border-red-500/50',
                      };
                      
                      return (
                        <div
                          key={position.id}
                          className="p-5 rounded-xl border-2 border-primary/20 bg-gradient-to-r from-card/80 to-primary/5 hover:from-card hover:to-primary/10 transition-all"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                                position.side === "BUY" ? "bg-green-500/20 border border-green-500/30" : "bg-red-500/20 border border-red-500/30"
                              }`}>
                                {position.side === "BUY" ? (
                                  <ArrowUpRight className="h-6 w-6 text-green-500" />
                                ) : (
                                  <ArrowDownRight className="h-6 w-6 text-red-500" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-xl">{position.symbol}</span>
                                  <Badge variant="outline" className={tierColors[position.tier] || ''}>
                                    {position.tier}
                                  </Badge>
                                </div>
                                <div className={`text-sm font-semibold ${
                                  position.side === "BUY" ? "text-green-500" : "text-red-500"
                                }`}>
                                  {position.side === "BUY" ? "LONG" : "SHORT"} {position.leverage}x
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-xl font-bold ${isProfitable ? "text-green-500" : "text-red-500"}`}>
                                {isProfitable ? "+" : ""}{pnl.toFixed(4)} USDT
                              </div>
                              <div className={`text-sm font-semibold ${isProfitable ? "text-green-500" : "text-red-500"}`}>
                                ({isProfitable ? "+" : ""}{pnlPercent.toFixed(2)}%)
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 text-sm mb-3 p-3 rounded-lg bg-muted/30">
                            <div>
                              <div className="text-muted-foreground">Rozmiar</div>
                              <div className="font-semibold">{position.quantity.toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Wartość</div>
                              <div className="font-semibold">{position.positionValue.toFixed(2)} USDT</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Cena Wejścia</div>
                              <div className="font-semibold">{position.entryPrice.toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Stop Loss</div>
                              <div className="font-semibold text-red-500">{position.currentSl.toFixed(4)}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs mb-2">
                            <span className="text-muted-foreground">Take Profit:</span>
                            {position.tp1Price && (
                              <Badge variant={position.tp1Hit ? "default" : "outline"} className={position.tp1Hit ? "bg-green-500" : ""}>
                                TP1: {position.tp1Price.toFixed(4)} {position.tp1Hit ? "✓" : ""}
                              </Badge>
                            )}
                            {position.tp2Price && (
                              <Badge variant={position.tp2Hit ? "default" : "outline"} className={position.tp2Hit ? "bg-green-500" : ""}>
                                TP2: {position.tp2Price.toFixed(4)} {position.tp2Hit ? "✓" : ""}
                              </Badge>
                            )}
                            {position.tp3Price && (
                              <Badge variant={position.tp3Hit ? "default" : "outline"} className={position.tp3Hit ? "bg-green-500" : ""}>
                                TP3: {position.tp3Price.toFixed(4)} {position.tp3Hit ? "✓" : ""}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/30">
                            <span>Confidence: {(position.confidenceScore * 100).toFixed(0)}%</span>
                            <span>{new Date(position.openedAt).toLocaleString("pl-PL")}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* All Positions Tab */}
          <TabsContent value="all-positions" className="space-y-6">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Wszystkie Pozycje
                      {positions.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {positions.length} Otwartych
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Wszystkie otwarte pozycje na giełdzie
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => fetchPositions()}
                    disabled={loadingPositions}
                    size="sm"
                    variant="outline"
                    className="hover:scale-105 transition-transform"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${loadingPositions ? "animate-spin" : ""}`} />
                    Odśwież
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {positionsError && (
                  <Alert className="mb-4 border-yellow-500/50 bg-yellow-500/10">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription className="text-sm">
                      <strong>Błąd:</strong> {positionsError}
                    </AlertDescription>
                  </Alert>
                )}

                {loadingPositions && (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Pobieranie pozycji...</p>
                  </div>
                )}

                {!loadingPositions && positions.length === 0 && !positionsError && (
                  <div className="text-center py-12">
                    <Activity className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">Brak otwartych pozycji</p>
                  </div>
                )}

                {!loadingPositions && positions.length > 0 && (
                  <div className="space-y-3">
                    {positions.map((position, idx) => {
                      const pnl = parseFloat(position.unrealisedPnl);
                      const positionVal = parseFloat(position.positionValue);
                      const leverage = parseFloat(position.leverage);
                      
                      const initialMargin = leverage !== 0 ? positionVal / leverage : positionVal;
                      const pnlPercent = initialMargin !== 0 ? (pnl / initialMargin) * 100 : 0;
                      const isProfitable = pnl >= 0;
                      
                      const isBotPosition = botPositions.some(bp => 
                        bp.symbol === position.symbol && bp.side === (position.side === "Buy" ? "BUY" : "SELL")
                      );
                      
                      return (
                        <div
                          key={idx}
                          className={`p-5 rounded-xl border transition-all ${
                            isBotPosition 
                              ? "border-primary/50 bg-gradient-to-r from-primary/5 to-card/80 hover:from-primary/10" 
                              : "border-border/50 bg-card/80 hover:bg-card"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                                position.side === "Buy" ? "bg-green-500/20 border border-green-500/30" : "bg-red-500/20 border border-red-500/30"
                              }`}>
                                {position.side === "Buy" ? (
                                  <ArrowUpRight className="h-6 w-6 text-green-500" />
                                ) : (
                                  <ArrowDownRight className="h-6 w-6 text-red-500" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-xl">{position.symbol}</span>
                                  {isBotPosition && (
                                    <Badge variant="default" className="text-xs">BOT</Badge>
                                  )}
                                </div>
                                <div className={`text-sm font-semibold ${
                                  position.side === "Buy" ? "text-green-500" : "text-red-500"
                                }`}>
                                  {position.side === "Buy" ? "LONG" : "SHORT"} {position.leverage}x
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-xl font-bold ${isProfitable ? "text-green-500" : "text-red-500"}`}>
                                {isProfitable ? "+" : ""}{pnl.toFixed(4)} USDT
                              </div>
                              <div className={`text-sm font-semibold ${isProfitable ? "text-green-500" : "text-red-500"}`}>
                                ({isProfitable ? "+" : ""}{pnlPercent.toFixed(2)}%)
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 text-sm p-3 rounded-lg bg-muted/30">
                            <div>
                              <div className="text-muted-foreground">Rozmiar</div>
                              <div className="font-semibold">{position.size}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Wartość</div>
                              <div className="font-semibold">{parseFloat(position.positionValue).toFixed(2)} USDT</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Cena Wejścia</div>
                              <div className="font-semibold">{parseFloat(position.entryPrice).toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Cena Bieżąca</div>
                              <div className="font-semibold">{parseFloat(position.markPrice).toFixed(4)}</div>
                            </div>
                            {parseFloat(position.takeProfit) > 0 && (
                              <div>
                                <div className="text-muted-foreground">Take Profit</div>
                                <div className="font-semibold text-green-500">{parseFloat(position.takeProfit).toFixed(4)}</div>
                              </div>
                            )}
                            {parseFloat(position.stopLoss) > 0 && (
                              <div>
                                <div className="text-muted-foreground">Stop Loss</div>
                                <div className="font-semibold text-red-500">{parseFloat(position.stopLoss).toFixed(4)}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Ustawienia i Konfiguracja
                </CardTitle>
                <CardDescription>Zarządzaj swoim botem i konfiguracją API</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    onClick={() => router.push("/ustawienia-bota")}
                    className="h-24 flex-col gap-2 hover:scale-105 transition-transform"
                    variant="outline"
                  >
                    <Bot className="h-8 w-8" />
                    <span>Ustawienia Bota</span>
                  </Button>
                  
                  <Button
                    onClick={() => router.push("/exchange-test")}
                    className="h-24 flex-col gap-2 hover:scale-105 transition-transform"
                    variant="outline"
                  >
                    <Settings className="h-8 w-8" />
                    <span>Konfiguracja API</span>
                  </Button>
                  
                  <Button
                    onClick={() => router.push("/logi-bota")}
                    className="h-24 flex-col gap-2 hover:scale-105 transition-transform"
                    variant="outline"
                  >
                    <FileText className="h-8 w-8" />
                    <span>Logi Bota</span>
                  </Button>
                  
                  <Button
                    onClick={() => router.push("/bot-history")}
                    className="h-24 flex-col gap-2 hover:scale-105 transition-transform"
                    variant="outline"
                  >
                    <History className="h-8 w-8" />
                    <span>Historia Pozycji</span>
                  </Button>
                </div>

                <Card className="bg-muted/50 border-border/30">
                  <CardHeader>
                    <CardTitle className="text-base">Informacje o konfiguracji</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 rounded bg-background/50">
                      <span className="text-muted-foreground">Giełda:</span>
                      <span className="font-semibold">{credentials.exchange.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-background/50">
                      <span className="text-muted-foreground">Środowisko:</span>
                      <span className="font-semibold capitalize">{credentials.environment}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-background/50">
                      <span className="text-muted-foreground">API Key:</span>
                      <span className="font-mono text-xs">
                        {credentials.apiKey.substring(0, 8)}...{credentials.apiKey.slice(-4)}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-background/50">
                      <span className="text-muted-foreground">Zapisano:</span>
                      <span className="text-xs">
                        {new Date(credentials.savedAt).toLocaleString("pl-PL")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Quick Actions Tab */}
          <TabsContent value="info" className="space-y-6">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Szybkie Akcje
                </CardTitle>
                <CardDescription>Najczęściej używane funkcje</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button
                    onClick={handleSyncPositions}
                    disabled={loadingSync}
                    className="h-20 flex-col gap-2 hover:scale-105 transition-transform"
                    variant="default"
                  >
                    <RefreshCw className={`h-6 w-6 ${loadingSync ? "animate-spin" : ""}`} />
                    <span>Synchronizuj Pozycje</span>
                  </Button>

                  <Button
                    onClick={() => {
                      fetchBalance();
                      fetchPositions();
                      fetchBotPositions();
                    }}
                    className="h-20 flex-col gap-2 hover:scale-105 transition-transform"
                    variant="default"
                  >
                    <RefreshCw className="h-6 w-6" />
                    <span>Odśwież Wszystko</span>
                  </Button>

                  <Button
                    onClick={() => router.push("/alerts")}
                    className="h-20 flex-col gap-2 hover:scale-105 transition-transform"
                    variant="default"
                  >
                    <Bell className="h-6 w-6" />
                    <span>Zobacz Alerty</span>
                  </Button>
                </div>

                <Card className="bg-gradient-to-r from-primary/10 to-card border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-base">💡 Porady</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>• Pozycje odświeżają się automatycznie co 0.5s</p>
                    <p>• Użyj "Sync" aby zsynchronizować pozycje z giełdą</p>
                    <p>• Sprawdzaj logi bota regularnie aby monitorować błędy</p>
                    <p>• Historia pozycji zawiera szczegółowe informacje o zamkniętych tradach</p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}