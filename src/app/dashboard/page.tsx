"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, Settings, Activity, Wallet, DollarSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

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
  const [loading, setLoading] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);

  const fetchBalance = useCallback(async (creds?: ExchangeCredentials) => {
    const credsToUse = creds || credentials;
    if (!credsToUse) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const timestamp = Date.now();
      const params: Record<string, any> = { accountType: "UNIFIED" };
      const signature = await signBybitRequest(credsToUse.apiKey, credsToUse.apiSecret, timestamp, params);
      const baseUrl = "https://api.bybit.com";
      const queryString = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join("&");
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
        }
      } else {
        setError(`Bybit API error: ${data.retMsg || "Unknown error"}`);
      }
    } catch (err) {
      setError(`Connection error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [credentials]);

  const fetchPositions = useCallback(async (creds?: ExchangeCredentials) => {
    const credsToUse = creds || credentials;
    if (!credsToUse) return;
    
    setLoadingPositions(true);
    setPositionsError(null);
    
    try {
      const timestamp = Date.now();
      const params: Record<string, any> = { category: "linear", settleCoin: "USDT" };
      const signature = await signBybitRequest(credsToUse.apiKey, credsToUse.apiSecret, timestamp, params);
      const baseUrl = "https://api.bybit.com";
      const queryString = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join("&");
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
        setPositionsError(`Bybit API error: ${data.retMsg || "Unknown error"}`);
      }
    } catch (err) {
      setPositionsError(`Connection error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoadingPositions(false);
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
        }
      } catch (err) {
        console.error("Error fetching credentials:", err);
      } finally {
        setIsCheckingCredentials(false);
      }
    };
    
    checkCredentials();
  }, [fetchBalance, fetchPositions]);

  const totalBalance = balances.reduce((sum, b) => sum + parseFloat(b.total), 0);
  const unrealisedPnL = positions.reduce((sum, p) => sum + parseFloat(p.unrealisedPnl || "0"), 0);

  if (isCheckingCredentials) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <Card className="max-w-md w-full border-gray-800 bg-gray-900/80">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
              <p className="text-lg font-medium text-white">Sprawdzanie konfiguracji...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <Card className="max-w-2xl w-full border-red-800 bg-gradient-to-br from-red-900/30 to-gray-900/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-300 text-2xl">
              <AlertCircle className="h-8 w-8" />
              ⚠️ Brak konfiguracji Bybit!
            </CardTitle>
          </CardHeader>
          <CardContent>
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
        
        <div className="text-center text-sm text-white bg-green-900/20 border border-green-500/30 rounded-lg p-3">
          ✅ Kod przywrócony do stanu z 24 listopada 2025 (commit 870d26b)
          <br />
          Sprawdzamy czy saldo i pozycje są widoczne
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Saldo Konta */}
          <Card className="border-2 border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Saldo Konta
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
                  <span className="text-sm text-gray-400">Ładowanie...</span>
                </div>
              ) : error ? (
                <div className="text-xs text-orange-400">{error}</div>
              ) : (
                <div className="text-2xl font-bold text-white">
                  {totalBalance.toFixed(2)} <span className="text-lg">USDT</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* PnL Niezrealizowany */}
          <Card className="border-2 border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                PnL Niezrealizowany
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${unrealisedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {unrealisedPnL >= 0 ? '+' : ''}{unrealisedPnL.toFixed(2)} <span className="text-lg">USDT</span>
              </div>
            </CardContent>
          </Card>

          {/* Otwarte Pozycje */}
          <Card className="border-2 border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Otwarte Pozycje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-white">{positions.length}</div>
                {positions.length === 0 && (
                  <Badge variant="outline" className="text-xs text-gray-400">Brak</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista Pozycji */}
        <Card className="border-gray-800 bg-gray-900/80">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Otwarte Pozycje ({positions.length})
            </CardTitle>
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
                <p className="text-sm text-gray-300">Brak otwartych pozycji</p>
              </div>
            )}

            {!loadingPositions && positions.length > 0 && (
              <div className="space-y-3">
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

        <div className="text-center">
          <Button onClick={() => { fetchBalance(); fetchPositions(); }} className="bg-blue-600 hover:bg-blue-700">
            <RefreshCw className="mr-2 h-4 w-4" />
            Odśwież dane
          </Button>
        </div>
      </div>
    </div>
  );
}
