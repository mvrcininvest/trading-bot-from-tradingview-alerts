"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Wallet, RefreshCw, AlertCircle, Settings, Activity, ArrowUpRight, ArrowDownRight, Bell, Bot, History, BarChart3, FileText, Zap, DollarSign, Power, AlertTriangle, Wrench } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
}

interface ExchangeCredentials {
  exchange: "binance" | "bybit" | "okx";
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
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
  const [loadingFixTpSl, setLoadingFixTpSl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [botPositionsError, setBotPositionsError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [lastPositionsUpdate, setLastPositionsUpdate] = useState<string | null>(null);
  const [botEnabled, setBotEnabled] = useState<boolean | null>(null);
  const [syncingCredentials, setSyncingCredentials] = useState(false);

  useEffect(() => {
    // Load credentials from localStorage
    const stored = localStorage.getItem("exchange_credentials");
    if (stored) {
      const creds = JSON.parse(stored);
      
      setCredentials(creds);
      
      // ✅ AUTO-SYNC: If passphrase exists in localStorage but not in database, sync it
      if (creds.passphrase) {
        syncCredentialsToDatabase(creds);
      }
      
      // Auto-fetch balance and positions on mount
      fetchBalance(creds);
      fetchPositions(creds);
      fetchBotPositions();
      fetchBotStatus();
    }
  }, []);

  // Auto-refresh bot positions every 2 seconds
  useEffect(() => {
    if (!credentials) return;

    const interval = setInterval(() => {
      fetchBotPositions(true); // silent mode
      fetchBotStatus(true); // also refresh bot status silently
    }, 2000);

    return () => clearInterval(interval);
  }, [credentials]);

  // ✅ NEW: Auto-fix missing SL/TP every 10 seconds in background
  useEffect(() => {
    if (!credentials) return;

    const autoFixInterval = setInterval(async () => {
      try {
        console.log("🔧 [Background] Running auto-fix for missing SL/TP...");
        const response = await fetch("/api/bot/fix-missing-tpsl", {
          method: "POST",
        });
        const data = await response.json();

        if (data.success && data.results) {
          const { fixed, closed } = data.results;
          if (fixed > 0 || closed > 0) {
            console.log(`✅ [Background] Auto-fix: Fixed ${fixed}, Closed ${closed}`);
            // Refresh positions after auto-fix
            fetchBotPositions(true);
            fetchPositions(credentials, true);
          }
        }
      } catch (error) {
        // Silent fail - don't disturb user
        console.error("❌ [Background] Auto-fix failed:", error);
      }
    }, 10000); // Run every 10 seconds

    return () => clearInterval(autoFixInterval);
  }, [credentials]);

  // Auto-refresh positions every 0.5 seconds (always on)
  useEffect(() => {
    if (!credentials) return;

    const interval = setInterval(() => {
      fetchPositions(credentials, true); // silent mode - no loading indicator
    }, 500); // 0.5 seconds for ultra real-time data

    return () => clearInterval(interval);
  }, [credentials]);

  const syncCredentialsToDatabase = async (credsOverride?: ExchangeCredentials) => {
    const credsToUse = credsOverride || credentials;
    if (!credsToUse) {
      toast.error("Brak credentials do synchronizacji");
      return;
    }

    setSyncingCredentials(true);
    try {
      console.log("🔄 Syncing credentials to database:", {
        exchange: credsToUse.exchange,
        environment: credsToUse.environment,
        apiKeyPreview: credsToUse.apiKey.substring(0, 8) + "...",
        hasPassphrase: !!credsToUse.passphrase
      });

      const response = await fetch("/api/bot/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: credsToUse.apiKey,
          apiSecret: credsToUse.apiSecret,
          passphrase: credsToUse.passphrase,
          exchange: credsToUse.exchange,
          environment: credsToUse.environment
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`✅ Credentials ${credsToUse.exchange.toUpperCase()} zapisane do bazy danych!`);
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

  const signOkxRequest = async (
    timestamp: string,
    method: string,
    requestPath: string,
    queryString: string,
    body: string,
    apiSecret: string
  ) => {
    const message = timestamp + method + requestPath + queryString + body;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const messageData = encoder.encode(message);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const base64Signature = btoa(String.fromCharCode(...hashArray));
    
    return base64Signature;
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
      } else if (credsToUse.exchange === "okx") {
        const timestamp = new Date().toISOString();
        const method = "GET";
        const requestPath = "/api/v5/account/positions";
        const queryString = "?instType=SWAP";
        const body = "";
        
        const signature = await signOkxRequest(
          timestamp,
          method,
          requestPath,
          queryString,
          body,
          credsToUse.apiSecret
        );
        
        const baseUrl = "https://www.okx.com";
        const url = `${baseUrl}${requestPath}${queryString}`;
        
        const headers: Record<string, string> = {
          "OK-ACCESS-KEY": credsToUse.apiKey,
          "OK-ACCESS-SIGN": signature,
          "OK-ACCESS-TIMESTAMP": timestamp,
          "OK-ACCESS-PASSPHRASE": credsToUse.passphrase || "",
          "Content-Type": "application/json",
        };
        
        // Add x-simulated-trading header for demo environment
        if (credsToUse.environment === "demo") {
          headers["x-simulated-trading"] = "1";
        }
        
        const response = await fetch(url, {
          method: "GET",
          headers,
        });

        const data = await response.json();

        if (data.code === "0" && data.data) {
          const openPositions = data.data
            .filter((p: any) => parseFloat(p.pos) !== 0)
            .map((p: any) => ({
              symbol: p.instId,
              side: parseFloat(p.pos) > 0 ? "Buy" : "Sell",
              size: Math.abs(parseFloat(p.pos)).toString(),
              entryPrice: p.avgPx,
              markPrice: p.markPx,
              leverage: p.lever,
              unrealisedPnl: p.upl,
              takeProfit: "0",
              stopLoss: "0",
              positionValue: Math.abs(parseFloat(p.notionalUsd)).toString()
            }));
          
          setPositions(openPositions);
          setLastPositionsUpdate(new Date().toLocaleString("pl-PL"));
          setPositionsError(null);
        } else {
          setPositionsError(`OKX API error: ${data.msg || "Nieznany błąd"}`);
        }
      } else {
        setPositionsError("Pobieranie pozycji jest obecnie wspierane tylko dla Bybit i OKX");
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
        // Binance and OKX - use backend API
        const payload: any = {
          exchange: credsToUse.exchange,
          apiKey: credsToUse.apiKey,
          apiSecret: credsToUse.apiSecret,
          testnet: credsToUse.environment === "testnet",
          demo: credsToUse.environment === "demo"
        };

        if (credsToUse.exchange === "okx" && credsToUse.passphrase) {
          payload.passphrase = credsToUse.passphrase;
        }

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
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6 flex items-center justify-center">
        <Card className="max-w-2xl border-red-800 bg-gradient-to-br from-red-900/30 to-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-6 w-6" />
              ⚠️ Błędne dane w localStorage!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-900/40 border-2 border-red-700">
                <p className="text-lg font-bold text-red-300 mb-2">
                  🔍 Wykryto UUID zamiast prawdziwego klucza API
                </p>
                <p className="text-sm text-gray-300">
                  Twój klucz API w localStorage wygląda na UUID (placeholder) zamiast prawdziwego klucza OKX.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-blue-900/40 border-2 border-blue-700">
                <p className="text-base font-bold text-blue-300 mb-3">
                  💡 CO ROBIĆ:
                </p>
                <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
                  <li>Kliknij przycisk <strong className="text-white">"Konfiguracja API"</strong> poniżej</li>
                  <li>Wprowadź <strong className="text-white">PRAWDZIWE klucze OKX</strong> (nie UUID!)</li>
                  <li>Kliknij <strong className="text-white">"Test Connection"</strong> aby sprawdzić czy działają</li>
                  <li>Kliknij <strong className="text-white">"Save Credentials"</strong></li>
                  <li>Wróć tutaj i kliknij <strong className="text-white">"Sync do Bazy"</strong></li>
                </ol>
              </div>

              <div className="p-4 rounded-lg bg-yellow-900/40 border-2 border-yellow-700">
                <p className="text-base font-bold text-yellow-300 mb-2">
                  🔐 Gdzie znaleźć prawdziwe klucze OKX:
                </p>
                <ol className="space-y-1 text-sm text-gray-300 list-decimal list-inside">
                  <li>Zaloguj się na <strong className="text-white">okx.com</strong></li>
                  <li>Idź do: Profile → API → Create API Key</li>
                  <li>Skopiuj: <strong className="text-white">API Key, Secret Key, Passphrase</strong></li>
                </ol>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={() => router.push("/exchange-test")} 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                size="lg"
              >
                <Settings className="mr-2 h-5 w-5" />
                Konfiguracja API
              </Button>
              <Button 
                onClick={clearLocalStorageAndReconfigure} 
                variant="outline"
                className="border-red-600 text-red-400 hover:bg-red-600/20"
                size="lg"
              >
                <AlertCircle className="mr-2 h-5 w-5" />
                Wyczyść localStorage
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* CRITICAL WARNING for Demo Environment */}
        {credentials.environment === "demo" && credentials.exchange === "bybit" && (
          <Alert className="border-2 border-red-600/50 bg-gradient-to-r from-red-600/20 to-orange-600/20 backdrop-blur-sm">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <AlertDescription className="text-sm text-red-200">
              <strong className="text-red-300 text-base">⚠️ OSTRZEŻENIE: Używasz środowiska DEMO</strong>
              <div className="mt-2 space-y-2">
                <p className="font-medium">
                  Bybit API Demo jest często <strong>blokowane przez CloudFlare/WAF</strong> dla requestów server-side (webhook, bot).
                </p>
                <p className="text-red-300 font-semibold">
                  ❌ Webhook i automatyczny bot <u>NIE BĘDĄ DZIAŁAĆ</u> z Demo environment!
                </p>
                <p className="mt-3 bg-green-600/20 border border-green-500/30 rounded-lg p-3">
                  ✅ <strong>ROZWIĄZANIE:</strong> Przejdź do <Button 
                    variant="link" 
                    className="text-green-300 underline p-0 h-auto font-bold"
                    onClick={() => router.push("/exchange-test")}
                  >
                    Konfiguracja API
                  </Button> i zmień środowisko na <strong className="text-green-300">TESTNET</strong> lub <strong className="text-green-300">PRODUKCJA</strong>
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* NEW: Credentials Sync Alert */}
        <Alert className="border-2 border-blue-600/50 bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-sm">
          <AlertTriangle className="h-5 w-5 text-blue-400" />
          <AlertDescription className="text-sm text-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <strong className="text-blue-300 text-base">🔄 Synchronizacja Credentials</strong>
                <p className="mt-2">
                  Dashboard czyta z <strong>localStorage</strong>, ale webhook czyta z <strong>bazy danych</strong>.
                  Jeśli webhook używa niewłaściwej giełdy, kliknij przycisk aby zsynchronizować:
                </p>
                <p className="mt-2 text-xs text-blue-300">
                  💡 Jeśli po kliknięciu dostaniesz błąd "UUID" - musisz przejść do Konfiguracji API i wprowadzić PRAWDZIWE klucze!
                </p>
              </div>
              <div className="ml-4 flex flex-col gap-2">
                <Button
                  onClick={() => syncCredentialsToDatabase()}
                  disabled={syncingCredentials}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {syncingCredentials ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync do Bazy
                    </>
                  )}
                </Button>
                <Button
                  onClick={clearLocalStorageAndReconfigure}
                  variant="outline"
                  className="border-red-600 text-red-400 hover:bg-red-600/20"
                  size="sm"
                >
                  <AlertCircle className="mr-2 h-3 w-3" />
                  Wyczyść i Skonfiguruj
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>

        {/* Header with Quick Stats */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600/30 to-blue-900/20 border border-blue-500/30">
                <TrendingUp className="h-8 w-8 text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                  Dashboard Tradingowy
                </h1>
                <div className="flex items-center gap-3">
                  <p className="text-sm text-gray-400 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    {credentials.exchange.toUpperCase()} · 
                    <span className={credentials.environment === "demo" ? "text-red-400 font-bold" : ""}>
                      {credentials.environment}
                      {credentials.environment === "demo" && " ⚠️"}
                    </span>
                  </p>
                  {botEnabled !== null && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge 
                          variant={botEnabled ? "default" : "secondary"}
                          className={`flex items-center gap-1.5 cursor-help ${
                            botEnabled 
                              ? "bg-green-600/20 text-green-400 border-green-500/30 hover:bg-green-600/30" 
                              : "bg-red-600/20 text-red-400 border-red-500/30 hover:bg-red-600/30"
                          }`}
                        >
                          <Power className="h-3 w-3" />
                          BOT {botEnabled ? "WŁĄCZONY" : "WYŁĄCZONY"}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {botEnabled 
                            ? credentials.environment === "demo"
                              ? "⚠️ Bot włączony ale Demo environment może nie działać! Przełącz się na Testnet"
                              : "Bot aktywnie monitoruje alerty z TradingView i automatycznie otwiera pozycje zgodne z ustawieniami"
                            : "Bot jest nieaktywny i nie będzie otwierał nowych pozycji. Przejdź do Ustawień Bota aby go włączyć"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats - Dark Theme */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all cursor-help">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Saldo Konta</p>
                        <p className="text-2xl font-bold text-white">{totalBalance.toFixed(2)}</p>
                        <p className="text-xs text-gray-500">USDT</p>
                      </div>
                      <div className="p-3 rounded-lg bg-blue-500/20 border border-blue-500/30">
                        <Wallet className="h-6 w-6 text-blue-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p>Całkowite saldo dostępne na koncie giełdowym (wolne + zablokowane w pozycjach)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all cursor-help">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Całkowity PnL</p>
                        <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">USDT</p>
                      </div>
                      <div className={`p-3 rounded-lg ${totalPnL >= 0 ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'}`}>
                        <DollarSign className={`h-6 w-6 ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p>Łączny nierealizowany zysk/strata ze wszystkich otwartych pozycji (bot + manualne)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all cursor-help">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Pozycje Bota</p>
                        <p className="text-2xl font-bold text-white">{botPositions.length}</p>
                        <p className={`text-xs font-semibold ${botPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {botPnL >= 0 ? '+' : ''}{botPnL.toFixed(2)} USDT
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-purple-500/20 border border-purple-500/30">
                        <Bot className="h-6 w-6 text-purple-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p>Liczba aktywnych pozycji otwartych automatycznie przez bota i ich całkowity PnL</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all cursor-help">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Wszystkie Pozycje</p>
                        <p className="text-2xl font-bold text-white">{totalPositionsCount}</p>
                        <p className="text-xs text-gray-500">
                          {winningPositions} wygrywa
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-amber-500/20 border border-amber-500/30">
                        <Activity className="h-6 w-6 text-amber-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p>Wszystkie otwarte pozycje na giełdzie (bot + manualne) z liczbą zyskownych tradów</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Main Content with Tabs - Dark Theme */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-gray-900/80 backdrop-blur-sm border border-gray-800">
            <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-300">
              <BarChart3 className="mr-2 h-4 w-4" />
              Przegląd
            </TabsTrigger>
            <TabsTrigger value="bot-positions" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-300">
              <Bot className="mr-2 h-4 w-4" />
              Pozycje Bota
            </TabsTrigger>
            <TabsTrigger value="all-positions" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-300">
              <Activity className="mr-2 h-4 w-4" />
              Wszystkie Pozycje
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-300">
              <Settings className="mr-2 h-4 w-4" />
              Ustawienia
            </TabsTrigger>
            <TabsTrigger value="info" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-300">
              <Zap className="mr-2 h-4 w-4" />
              Quick Actions
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Balance Card - Dark Theme */}
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Wallet className="h-5 w-5" />
                      Saldo Konta
                    </CardTitle>
                    <CardDescription className="text-gray-500">
                      {lastUpdate && <span className="text-xs">Zaktualizowano: {lastUpdate}</span>}
                    </CardDescription>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => fetchBalance()}
                        disabled={loading}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white hover:scale-105 transition-transform"
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Odśwież
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Odśwież saldo konta z giełdy - pobiera aktualne dane o wolnych i zablokowanych środkach</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent>
                {error && (
                  <Alert className="mb-4 border-yellow-700 bg-yellow-900/20">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription className="text-sm text-yellow-400">
                      <strong>Nie można pobrać salda:</strong> {error}
                    </AlertDescription>
                  </Alert>
                )}

                {loading && (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-500" />
                    <p className="text-sm text-gray-500">Pobieranie salda...</p>
                  </div>
                )}

                {!loading && balances.length === 0 && !error && (
                  <div className="text-center py-8">
                    <Wallet className="h-12 w-12 mx-auto mb-3 text-gray-600 opacity-50" />
                    <p className="text-sm text-gray-500">Brak danych o saldzie</p>
                  </div>
                )}

                {!loading && balances.length > 0 && (
                  <div className="space-y-2">
                    {balances.map((balance, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-4 rounded-xl border border-gray-800 bg-gradient-to-r from-gray-900/80 to-gray-800/40 hover:from-gray-800/60 hover:to-gray-900/60 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600/30 to-blue-900/20 flex items-center justify-center border border-blue-500/30">
                            <span className="text-sm font-bold text-blue-300">
                              {balance.asset.substring(0, 2)}
                            </span>
                          </div>
                          <div>
                            <div className="font-semibold text-lg text-white">{balance.asset}</div>
                            <div className="text-xs text-gray-500">
                              Wolne: {balance.free} · Zablokowane: {balance.locked}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-2xl text-white">{balance.total}</div>
                          <div className="text-xs text-gray-500">Łącznie</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Summary - Dark Theme */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-gray-800 bg-gradient-to-br from-blue-600/20 via-gray-900/80 to-gray-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-white">Pozycje Bota</CardTitle>
                  <CardDescription className="text-gray-500">Aktywne pozycje automatyczne</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Aktywne:</span>
                      <span className="font-bold text-white">{botPositions.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">PnL:</span>
                      <span className={`font-bold ${botPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {botPnL >= 0 ? '+' : ''}{botPnL.toFixed(2)} USDT
                      </span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          onClick={() => document.querySelector('[value="bot-positions"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))}
                          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white"
                          variant="secondary"
                        >
                          Zobacz Pozycje
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Przejdź do szczegółowego widoku pozycji otwartych przez bota z informacjami o TP/SL</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-gray-800 bg-gradient-to-br from-purple-600/20 via-gray-900/80 to-gray-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-white">Wszystkie Pozycje</CardTitle>
                  <CardDescription className="text-gray-500">Łączne informacje</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Otwarte:</span>
                      <span className="font-bold text-white">{totalPositionsCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Total PnL:</span>
                      <span className={`font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} USDT
                      </span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          onClick={() => document.querySelector('[value="all-positions"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))}
                          className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white"
                          variant="secondary"
                        >
                          Zobacz Wszystkie
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Zobacz wszystkie otwarte pozycje na giełdzie (bot + manualne) z czasem rzeczywistym</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Bot Positions Tab - Dark Theme */}
          <TabsContent value="bot-positions" className="space-y-6">
            <Card className="border-blue-700 bg-gradient-to-br from-blue-600/10 via-gray-900/80 to-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Bot className="h-5 w-5 text-blue-400" />
                      Pozycje Bota
                      {botPositions.length > 0 && (
                        <Badge variant="default" className="ml-2 bg-blue-600 text-white">
                          {botPositions.length} Aktywnych
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-gray-500">
                      Pozycje otwarte automatycznie przez bota
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleSyncPositions}
                          disabled={loadingSync}
                          size="sm"
                          variant="secondary"
                          className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:scale-105 transition-transform"
                        >
                          <RefreshCw className={`mr-2 h-4 w-4 ${loadingSync ? "animate-spin" : ""}`} />
                          Sync
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Synchronizuj pozycje bota z rzeczywistymi pozycjami na giełdzie - zamyka pozycje w bazie danych jeśli zostały zamknięte na giełdzie</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => fetchBotPositions()}
                          disabled={loadingBotPositions}
                          size="sm"
                          variant="outline"
                          className="border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-300 hover:scale-105 transition-transform"
                        >
                          <RefreshCw className={`mr-2 h-4 w-4 ${loadingBotPositions ? "animate-spin" : ""}`} />
                          Odśwież
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Odśwież listę pozycji bota z bazy danych (automatyczne odświeżanie co 2s)</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {botPositionsError && (
                  <Alert className="mb-4 border-yellow-700 bg-yellow-900/20">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription className="text-sm text-yellow-400">
                      <strong>Błąd:</strong> {botPositionsError}
                    </AlertDescription>
                  </Alert>
                )}

                {loadingBotPositions && (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-500" />
                    <p className="text-sm text-gray-500">Pobieranie pozycji bota...</p>
                  </div>
                )}

                {!loadingBotPositions && botPositions.length === 0 && !botPositionsError && (
                  <div className="text-center py-12">
                    <Bot className="h-16 w-16 mx-auto mb-4 text-gray-600 opacity-50" />
                    <p className="text-gray-500">Brak aktywnych pozycji bota</p>
                  </div>
                )}

                {!loadingBotPositions && botPositions.length > 0 && (
                  <div className="space-y-3">
                    {botPositions.map((position) => {
                      const pnl = position.unrealisedPnl;
                      const pnlPercent = position.initialMargin !== 0 ? (pnl / position.initialMargin) * 100 : 0;
                      const isProfitable = pnl >= 0;
                      
                      const tierColors: Record<string, string> = {
                        'Platinum': 'bg-purple-500/20 text-purple-300 border-purple-500/40',
                        'Premium': 'bg-blue-500/20 text-blue-300 border-blue-500/40',
                        'Standard': 'bg-green-500/20 text-green-300 border-green-500/40',
                        'Quick': 'bg-orange-500/20 text-orange-300 border-orange-500/40',
                        'Emergency': 'bg-red-500/20 text-red-300 border-red-500/40',
                      };
                      
                      return (
                        <div
                          key={position.id}
                          className="p-5 rounded-xl border-2 border-blue-700/30 bg-gradient-to-r from-gray-900/80 to-blue-900/20 hover:from-gray-900 hover:to-blue-900/30 transition-all"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                                position.side === "BUY" ? "bg-green-500/30 border border-green-500/40" : "bg-red-500/30 border border-red-500/40"
                              }`}>
                                {position.side === "BUY" ? (
                                  <ArrowUpRight className="h-6 w-6 text-green-400" />
                                ) : (
                                  <ArrowDownRight className="h-6 w-6 text-red-400" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-xl text-white">{position.symbol}</span>
                                  <Badge variant="outline" className={tierColors[position.tier] || ''}>
                                    {position.tier}
                                  </Badge>
                                </div>
                                <div className={`text-sm font-semibold ${
                                  position.side === "BUY" ? "text-green-400" : "text-red-400"
                                }`}>
                                  {position.side === "BUY" ? "LONG" : "SHORT"} {position.leverage}x
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-xl font-bold ${isProfitable ? "text-green-400" : "text-red-400"}`}>
                                {isProfitable ? "+" : ""}{pnl.toFixed(4)} USDT
                              </div>
                              <div className={`text-sm font-semibold ${isProfitable ? "text-green-400" : "text-red-400"}`}>
                                ({isProfitable ? "+" : ""}{pnlPercent.toFixed(2)}%)
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 text-sm mb-3 p-3 rounded-lg bg-gray-800/40">
                            <div>
                              <div className="text-gray-500">Rozmiar</div>
                              <div className="font-semibold text-gray-200">{position.quantity.toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Wartość</div>
                              <div className="font-semibold text-gray-200">{position.positionValue.toFixed(2)} USDT</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Cena Wejścia</div>
                              <div className="font-semibold text-gray-200">{position.entryPrice.toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Stop Loss</div>
                              <div className="font-semibold text-red-400">{position.currentSl.toFixed(4)}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs mb-2">
                            <span className="text-gray-500">Take Profit:</span>
                            {position.tp1Price && (
                              <Badge variant={position.tp1Hit ? "default" : "outline"} className={position.tp1Hit ? "bg-green-600 text-white" : "border-gray-700 text-gray-400"}>
                                TP1: {position.tp1Price.toFixed(4)} {position.tp1Hit ? "✓" : ""}
                              </Badge>
                            )}
                            {position.tp2Price && (
                              <Badge variant={position.tp2Hit ? "default" : "outline"} className={position.tp2Hit ? "bg-green-600 text-white" : "border-gray-700 text-gray-400"}>
                                TP2: {position.tp2Price.toFixed(4)} {position.tp2Hit ? "✓" : ""}
                              </Badge>
                            )}
                            {position.tp3Price && (
                              <Badge variant={position.tp3Hit ? "default" : "outline"} className={position.tp3Hit ? "bg-green-600 text-white" : "border-gray-700 text-gray-400"}>
                                TP3: {position.tp3Price.toFixed(4)} {position.tp3Hit ? "✓" : ""}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-800">
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
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Activity className="h-5 w-5" />
                      Wszystkie Pozycje
                      {positions.length > 0 && (
                        <Badge variant="secondary" className="ml-2 bg-gray-700 text-gray-300">
                          {positions.length} Otwartych
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-gray-500">
                      Wszystkie otwarte pozycje na giełdzie
                    </CardDescription>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => fetchPositions()}
                        disabled={loadingPositions}
                        size="sm"
                        variant="outline"
                        className="border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-300 hover:scale-105 transition-transform"
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${loadingPositions ? "animate-spin" : ""}`} />
                        Odśwież
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Odśwież pozycje bezpośrednio z giełdy (automatyczne odświeżanie co 0.5s)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent>
                {positionsError && (
                  <Alert className="mb-4 border-yellow-700 bg-yellow-900/20">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription className="text-sm text-yellow-400">
                      <strong>Błąd:</strong> {positionsError}
                    </AlertDescription>
                  </Alert>
                )}

                {loadingPositions && (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-500" />
                    <p className="text-sm text-gray-500">Pobieranie pozycji...</p>
                  </div>
                )}

                {!loadingPositions && positions.length === 0 && !positionsError && (
                  <div className="text-center py-12">
                    <Activity className="h-16 w-16 mx-auto mb-4 text-gray-600 opacity-50" />
                    <p className="text-gray-500">Brak otwartych pozycji</p>
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
                              ? "border-blue-700/40 bg-gradient-to-r from-blue-600/10 to-gray-900/80 hover:from-blue-600/20" 
                              : "border-gray-800 bg-gray-900/80 hover:bg-gray-900"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                                position.side === "Buy" ? "bg-green-500/30 border border-green-500/40" : "bg-red-500/30 border border-red-500/40"
                              }`}>
                                {position.side === "Buy" ? (
                                  <ArrowUpRight className="h-6 w-6 text-green-400" />
                                ) : (
                                  <ArrowDownRight className="h-6 w-6 text-red-400" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-xl text-white">{position.symbol}</span>
                                  {isBotPosition && (
                                    <Badge variant="default" className="text-xs bg-blue-600 text-white">BOT</Badge>
                                  )}
                                </div>
                                <div className={`text-sm font-semibold ${
                                  position.side === "Buy" ? "text-green-400" : "text-red-400"
                                }`}>
                                  {position.side === "Buy" ? "LONG" : "SHORT"} {position.leverage}x
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-xl font-bold ${isProfitable ? "text-green-400" : "text-red-400"}`}>
                                {isProfitable ? "+" : ""}{pnl.toFixed(4)} USDT
                              </div>
                              <div className={`text-sm font-semibold ${isProfitable ? "text-green-400" : "text-red-400"}`}>
                                ({isProfitable ? "+" : ""}{pnlPercent.toFixed(2)}%)
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 text-sm p-3 rounded-lg bg-gray-800/40">
                            <div>
                              <div className="text-gray-500">Rozmiar</div>
                              <div className="font-semibold text-gray-200">{position.size}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Wartość</div>
                              <div className="font-semibold text-gray-200">{parseFloat(position.positionValue).toFixed(2)} USDT</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Cena Wejścia</div>
                              <div className="font-semibold text-gray-200">{parseFloat(position.entryPrice).toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Cena Bieżąca</div>
                              <div className="font-semibold text-gray-200">{parseFloat(position.markPrice).toFixed(4)}</div>
                            </div>
                            {parseFloat(position.takeProfit) > 0 && (
                              <div>
                                <div className="text-gray-500">Take Profit</div>
                                <div className="font-semibold text-green-400">{parseFloat(position.takeProfit).toFixed(4)}</div>
                              </div>
                            )}
                            {parseFloat(position.stopLoss) > 0 && (
                              <div>
                                <div className="text-gray-500">Stop Loss</div>
                                <div className="font-semibold text-red-400">{parseFloat(position.stopLoss).toFixed(4)}</div>
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
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Settings className="h-5 w-5" />
                  Ustawienia i Konfiguracja
                </CardTitle>
                <CardDescription className="text-gray-500">Zarządzaj swoim botem i konfiguracją API</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Bot Status Indicator */}
                {botEnabled !== null && (
                  <Card className={`border-2 ${
                    botEnabled 
                      ? "bg-gradient-to-br from-green-600/10 to-gray-900/80 border-green-500/30" 
                      : "bg-gradient-to-br from-red-600/10 to-gray-900/80 border-red-500/30"
                  }`}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-4 rounded-xl ${
                            botEnabled 
                              ? "bg-green-500/20 border-2 border-green-500/40" 
                              : "bg-red-500/20 border-2 border-red-500/40"
                          }`}>
                            <Power className={`h-8 w-8 ${botEnabled ? "text-green-400" : "text-red-400"}`} />
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold text-white mb-1">
                              Status Bota: {botEnabled ? "WŁĄCZONY" : "WYŁĄCZONY"}
                            </h3>
                            <p className={`text-sm font-medium ${botEnabled ? "text-green-400" : "text-red-400"}`}>
                              {botEnabled 
                                ? "Bot aktywnie monitoruje i otwiera pozycje na podstawie alertów" 
                                : "Bot nie będzie otwierał nowych pozycji"}
                            </p>
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => router.push("/ustawienia-bota")}
                              variant="outline"
                              className="border-gray-700 hover:bg-gray-800 text-gray-300"
                            >
                              Zmień Status
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Przejdź do ustawień bota aby włączyć/wyłączyć automatyczny trading</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => router.push("/ustawienia-bota")}
                        className="h-28 flex-col gap-3 bg-gradient-to-br from-blue-600/20 to-gray-900/80 border-gray-700 hover:from-blue-600/30 hover:to-gray-800/80 text-gray-100 hover:scale-105 transition-all shadow-lg"
                        variant="outline"
                      >
                        <Bot className="h-10 w-10 text-blue-400" />
                        <span className="font-semibold">Ustawienia Bota</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Konfiguruj parametry bota: wielkość pozycji, dźwignia, filtry tierów, zarządzanie ryzykiem</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => router.push("/exchange-test")}
                        className="h-28 flex-col gap-3 bg-gradient-to-br from-purple-600/20 to-gray-900/80 border-gray-700 hover:from-purple-600/30 hover:to-gray-800/80 text-gray-100 hover:scale-105 transition-all shadow-lg"
                        variant="outline"
                      >
                        <Settings className="h-10 w-10 text-purple-400" />
                        <span className="font-semibold">Konfiguracja API</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Zarządzaj kluczami API giełdy - testuj połączenie, zmieniaj środowisko (demo/testnet/produkcja)</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => router.push("/logi-bota")}
                        className="h-28 flex-col gap-3 bg-gradient-to-br from-green-600/20 to-gray-900/80 border-gray-700 hover:from-green-600/30 hover:to-gray-800/80 text-gray-100 hover:scale-105 transition-all shadow-lg"
                        variant="outline"
                      >
                        <FileText className="h-10 w-10 text-green-400" />
                        <span className="font-semibold">Logi Bota</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Przeglądaj szczegółowe logi działania bota - alerty, otwarte pozycje, błędy, synchronizacje</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => router.push("/bot-history")}
                        className="h-28 flex-col gap-3 bg-gradient-to-br from-amber-600/20 to-gray-900/80 border-gray-700 hover:from-amber-600/30 hover:to-gray-800/80 text-gray-100 hover:scale-105 transition-all shadow-lg"
                        variant="outline"
                      >
                        <History className="h-10 w-10 text-amber-400" />
                        <span className="font-semibold">Historia Pozycji</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Kompletna historia zamkniętych pozycji z analizą wyników, statystykami win/loss ratio</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <Card className="bg-gray-900/70 border-gray-700 shadow-xl backdrop-blur-sm">
                  <CardHeader className="border-b border-gray-800">
                    <CardTitle className="text-base text-white flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-400" />
                      Informacje o konfiguracji
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm pt-4">
                    <div className="flex justify-between p-3 rounded-lg bg-gray-800/60 border border-gray-700/50 hover:bg-gray-800/80 transition-colors">
                      <span className="text-gray-400 font-medium">Giełda:</span>
                      <span className="font-bold text-white">{credentials.exchange.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between p-3 rounded-lg bg-gray-800/60 border border-gray-700/50 hover:bg-gray-800/80 transition-colors">
                      <span className="text-gray-400 font-medium">Środowisko:</span>
                      <span className="font-bold capitalize text-white">{credentials.environment}</span>
                    </div>
                    <div className="flex justify-between p-3 rounded-lg bg-gray-800/60 border border-gray-700/50 hover:bg-gray-800/80 transition-colors">
                      <span className="text-gray-400 font-medium">API Key:</span>
                      <span className="font-mono text-xs text-gray-300 bg-gray-900/50 px-2 py-1 rounded">
                        {credentials.apiKey.substring(0, 8)}...{credentials.apiKey.slice(-4)}
                      </span>
                    </div>
                    <div className="flex justify-between p-3 rounded-lg bg-gray-800/60 border border-gray-700/50 hover:bg-gray-800/80 transition-colors">
                      <span className="text-gray-400 font-medium">Zapisano:</span>
                      <span className="text-xs text-gray-300">
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
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Zap className="h-5 w-5 text-yellow-400" />
                  Szybkie Akcje
                </CardTitle>
                <CardDescription className="text-gray-500">Najczęściej używane funkcje</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleSyncPositions}
                        disabled={loadingSync}
                        className="h-24 flex-col gap-2 bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white hover:scale-105 transition-all shadow-xl border-0"
                        variant="default"
                      >
                        <RefreshCw className={`h-8 w-8 ${loadingSync ? "animate-spin" : ""}`} />
                        <span className="font-semibold">Synchronizuj Pozycje</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Zsynchronizuj bazę danych pozycji bota z rzeczywistymi pozycjami na giełdzie - zamyka automatycznie pozycje które już nie istnieją</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleFixMissingTpSl}
                        disabled={loadingFixTpSl}
                        className="h-24 flex-col gap-2 bg-gradient-to-br from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white hover:scale-105 transition-all shadow-xl border-0"
                        variant="default"
                      >
                        <Wrench className={`h-8 w-8 ${loadingFixTpSl ? "animate-spin" : ""}`} />
                        <span className="font-semibold">Napraw SL/TP</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Wykrywa pozycje bez SL/TP i automatycznie je ustawia lub zamyka pozycje gdzie cena już osiągnęła SL/TP</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => {
                          fetchBalance();
                          fetchPositions();
                          fetchBotPositions();
                        }}
                        className="h-24 flex-col gap-2 bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white hover:scale-105 transition-all shadow-xl border-0"
                        variant="default"
                      >
                        <RefreshCw className="h-8 w-8" />
                        <span className="font-semibold">Odśwież Wszystko</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Odśwież jednocześnie saldo konta, pozycje giełdowe i pozycje bota</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => router.push("/alerts")}
                        className="h-24 flex-col gap-2 bg-gradient-to-br from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white hover:scale-105 transition-all shadow-xl border-0"
                        variant="default"
                      >
                        <Bell className="h-8 w-8" />
                        <span className="font-semibold">Zobacz Alerty</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Przeglądaj wszystkie alerty otrzymane z TradingView z filtrowaniem i szczegółami</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <Card className="bg-gradient-to-r from-blue-600/20 to-gray-900/80 border-blue-700/30 shadow-xl">
                  <CardHeader className="border-b border-blue-700/20">
                    <CardTitle className="text-base text-white">💡 Profesjonalne Porady</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-gray-300 pt-4">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/30">
                      <div className="h-2 w-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                      <p>Pozycje odświeżają się automatycznie co 0.5s dla danych w czasie rzeczywistym</p>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/30">
                      <div className="h-2 w-2 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
                      <p>Użyj "Sync" aby zsynchronizować pozycje bota z rzeczywistymi pozycjami na giełdzie</p>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/30">
                      <div className="h-2 w-2 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                      <p>Użyj "Napraw SL/TP" aby automatycznie wykryć i naprawić pozycje bez Stop Loss lub Take Profit</p>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/30">
                      <div className="h-2 w-2 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                      <p>Sprawdzaj logi bota regularnie aby monitorować błędy i optymalizować strategię</p>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/30">
                      <div className="h-2 w-2 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                      <p>Historia pozycji zawiera szczegółowe informacje o wszystkich zamkniętych tradach i ich wynikach</p>
                    </div>
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