"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Wallet, RefreshCw, AlertCircle, Settings, Activity, ArrowUpRight, ArrowDownRight, Bell } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";

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

export default function DashboardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<ExchangeCredentials | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);
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
    }
  }, []);

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

  if (!credentials) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="max-w-md">
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-8 w-8" />
            <div>
              <h1 className="text-3xl font-bold">Dashboard Tradingowy</h1>
              <p className="text-muted-foreground">
                {credentials.exchange.toUpperCase()} - {credentials.environment}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/alerts")}
            >
              <Bell className="mr-2 h-4 w-4" />
              Alerty
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/exchange-test")}
            >
              <Settings className="mr-2 h-4 w-4" />
              Ustawienia API
            </Button>
          </div>
        </div>

        {/* Balance Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Saldo Konta
                </CardTitle>
                <CardDescription>
                  {lastUpdate ? `Ostatnia aktualizacja: ${lastUpdate}` : "Kliknij odśwież aby pobrać aktualne saldo"}
                </CardDescription>
              </div>
              <Button
                onClick={() => fetchBalance()}
                disabled={loading}
                size="sm"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Odśwież
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert className="mb-4 border-yellow-500 bg-yellow-500/10">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <AlertDescription className="text-sm">
                  <strong>Nie można pobrać salda:</strong> {error}
                  <br /><br />
                  {credentials.environment === "demo" && (
                    <>
                      <strong>Przypomnienie:</strong> Bybit Demo API jest chronione przez CloudFlare, 
                      co często blokuje requesty z serwera. To NIE oznacza że Twoje klucze są nieprawidłowe. 
                      Saldo będzie działać poprawnie podczas rzeczywistego tradingu.
                    </>
                  )}
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
                <Wallet className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Brak danych o saldzie. Kliknij "Odśwież" aby pobrać aktualne saldo.
                </p>
              </div>
            )}

            {!loading && balances.length > 0 && (
              <div className="space-y-2">
                {balances.map((balance, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                          {balance.asset.substring(0, 2)}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold">{balance.asset}</div>
                        <div className="text-xs text-muted-foreground">
                          Wolne: {balance.free} | Zablokowane: {balance.locked}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">{balance.total}</div>
                      <div className="text-xs text-muted-foreground">Łącznie</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open Positions Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Otwarte Pozycje
                  <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </span>
                </CardTitle>
                <CardDescription>
                  {lastPositionsUpdate ? `Ostatnia aktualizacja: ${lastPositionsUpdate}` : "Kliknij odśwież aby pobrać otwarte pozycje"}
                  • Auto-odświeżanie co 0.5s
                </CardDescription>
              </div>
              <Button
                onClick={() => fetchPositions()}
                disabled={loadingPositions}
                size="sm"
                variant="outline"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loadingPositions ? "animate-spin" : ""}`} />
                Odśwież
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {positionsError && (
              <Alert className="mb-4 border-yellow-500 bg-yellow-500/10">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <AlertDescription className="text-sm">
                  <strong>Nie można pobrać pozycji:</strong> {positionsError}
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
              <div className="text-center py-8">
                <Activity className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Brak otwartych pozycji. Kliknij "Odśwież" aby sprawdzić aktualne pozycje.
                </p>
              </div>
            )}

            {!loadingPositions && positions.length > 0 && (
              <div className="space-y-3">
                {positions.map((position, idx) => {
                  const pnl = parseFloat(position.unrealisedPnl);
                  const positionVal = parseFloat(position.positionValue);
                  const leverage = parseFloat(position.leverage);
                  
                  // Calculate ROI% based on initial margin, not position value
                  const initialMargin = leverage !== 0 ? positionVal / leverage : positionVal;
                  const pnlPercent = initialMargin !== 0 ? (pnl / initialMargin) * 100 : 0;
                  const isProfitable = pnl >= 0;
                  
                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            position.side === "Buy" ? "bg-green-500/10" : "bg-red-500/10"
                          }`}>
                            {position.side === "Buy" ? (
                              <ArrowUpRight className="h-5 w-5 text-green-500" />
                            ) : (
                              <ArrowDownRight className="h-5 w-5 text-red-500" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-lg">{position.symbol}</div>
                            <div className={`text-sm font-semibold ${
                              position.side === "Buy" ? "text-green-500" : "text-red-500"
                            }`}>
                              {position.side === "Buy" ? "LONG" : "SHORT"} {position.leverage}x
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${isProfitable ? "text-green-500" : "text-red-500"}`}>
                            {isProfitable ? "+" : ""}{pnl.toFixed(4)} USDT
                          </div>
                          <div className={`text-sm font-semibold ${isProfitable ? "text-green-500" : "text-red-500"}`}>
                            ({isProfitable ? "+" : ""}{pnlPercent.toFixed(2)}%)
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ≈{Math.abs(pnl).toFixed(2)} USD
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 text-sm">
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

        {/* Info Card */}
        <Card className="bg-muted">
          <CardHeader>
            <CardTitle className="text-lg">Informacje o konfiguracji</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Giełda:</span>
              <span className="font-semibold">{credentials.exchange.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Środowisko:</span>
              <span className="font-semibold capitalize">{credentials.environment}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">API Key:</span>
              <span className="font-mono text-xs">
                {credentials.apiKey.substring(0, 8)}...{credentials.apiKey.slice(-4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Zapisano:</span>
              <span className="text-xs">
                {new Date(credentials.savedAt).toLocaleString("pl-PL")}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}