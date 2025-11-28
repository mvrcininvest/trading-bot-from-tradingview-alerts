"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, BarChart3, Power, DollarSign, AlertTriangle, XCircle, Smartphone, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Position {
  id: number;
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  quantity: number;
  leverage: number;
  unrealisedPnl: number;
  openedAt: string;
}

interface BotSettings {
  botEnabled: boolean;
}

interface BalanceData {
  asset: string;
  free: string;
  locked: string;
}

export default function GlownaPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [botEnabled, setBotEnabled] = useState<boolean | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [balance, setBalance] = useState<BalanceData[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [showCloseAllDialog, setShowCloseAllDialog] = useState(false);
  const [testingSMS, setTestingSMS] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadAll = async () => {
    await Promise.all([
      loadPositions(),
      loadBotSettings(),
      loadBalance()
    ]);
  };

  const loadPositions = async () => {
    try {
      setPositionsError(null);
      
      try {
        const syncTimestamp = Date.now();
        await fetch(`/api/bot/sync-positions?_t=${syncTimestamp}`, { 
          method: "POST",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache"
          }
        });
        console.log("[Auto-sync] Pozycje zsynchronizowane z giełdą");
      } catch (syncError) {
        console.warn("[Auto-sync] Błąd synchronizacji (kontynuuję):", syncError);
      }

      const timestamp = Date.now();
      const response = await fetch(`/api/bot/positions?_t=${timestamp}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache"
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      console.log("[Glowna] API Response:", data);
      
      if (data.success && Array.isArray(data.positions)) {
        const openPositions = data.positions.filter((p: any) => p.status === 'open');
        console.log("[Glowna] Open positions:", openPositions.length);
        setPositions(openPositions);
        setPositionsError(null);
      } else if (data.error) {
        setPositionsError(data.error);
      }
    } catch (err) {
      console.error("Load positions error:", err);
      const errorMsg = err instanceof Error ? err.message : "Nieznany błąd";
      setPositionsError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loadBotSettings = async () => {
    try {
      const timestamp = Date.now();
      const randomParam = Math.random().toString(36).substring(7);
      const response = await fetch(`/api/bot/settings?_t=${timestamp}&_r=${randomParam}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0"
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      console.log("[Glowna] Settings Raw Response:", JSON.stringify(data, null, 2));
      
      if (data.success && data.settings) {
        const rawValue = data.settings.botEnabled;
        
        const isBotEnabled = Boolean(
          rawValue === true || 
          rawValue === 1 || 
          rawValue === "1" || 
          rawValue === "true" ||
          rawValue === "TRUE"
        );
        
        console.log("[Glowna] Bot Status Debug:");
        console.log("  Raw Value:", rawValue);
        console.log("  Type:", typeof rawValue);
        console.log("  Converted to Boolean:", isBotEnabled);
        
        setBotEnabled(isBotEnabled);
      } else {
        console.error("[Glowna] Invalid settings response:", data);
        setBotEnabled(false);
      }
    } catch (err) {
      console.error("Load settings error:", err);
      setBotEnabled(false);
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadBalance = async () => {
    try {
      setBalanceError(null);
      
      const timestamp = Date.now();
      const settingsResponse = await fetch(`/api/bot/settings?_t=${timestamp}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate"
        }
      });
      const settingsData = await settingsResponse.json();
      
      if (!settingsData.success || !settingsData.settings?.apiKey) {
        setBalanceError("Brak konfiguracji API");
        setLoadingBalance(false);
        return;
      }

      const { apiKey, apiSecret } = settingsData.settings;

      const balanceTimestamp = Date.now();
      const response = await fetch(`/api/exchange/get-balance?_t=${balanceTimestamp}`, {
        method: "POST",
        cache: "no-store",
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate"
        },
        body: JSON.stringify({
          exchange: "bybit",
          apiKey,
          apiSecret,
        }),
      });

      const data = await response.json();
      
      console.log("[Glowna] Balance Response:", data);
      
      if (data.success && data.balances) {
        setBalance(data.balances);
        setBalanceError(null);
      } else {
        const errorMessage = data.message || "Nie można pobrać salda";
        setBalanceError(errorMessage);
      }
    } catch (err) {
      console.error("Load balance error:", err);
      const errorMsg = err instanceof Error ? err.message : "Błąd połączenia";
      setBalanceError(errorMsg);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleTestSMS = async () => {
    setTestingSMS(true);
    try {
      const response = await fetch('/api/bot/test-sms', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('✅ SMS testowy wysłany pomyślnie!', {
          description: `Message ID: ${data.messageId}. Sprawdź swój telefon.`
        });
      } else {
        toast.error('❌ Błąd wysyłki SMS', {
          description: data.error || 'Sprawdź konfigurację Twilio w ustawieniach bota'
        });
      }
    } catch (error) {
      console.error('Test SMS error:', error);
      toast.error('Błąd testowania SMS');
    } finally {
      setTestingSMS(false);
    }
  };

  const handleCloseAll = async () => {
    if (positions.length === 0) {
      toast.error("Brak otwartych pozycji do zamknięcia");
      return;
    }

    setShowCloseAllDialog(true);
  };

  const confirmCloseAll = async () => {
    setShowCloseAllDialog(false);
    setClosingAll(true);

    try {
      const timestamp = Date.now();
      const settingsResponse = await fetch(`/api/bot/settings?_t=${timestamp}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate"
        }
      });
      const settingsData = await settingsResponse.json();
      
      if (!settingsData.success || !settingsData.settings?.apiKey) {
        toast.error("Brak konfiguracji API");
        return;
      }

      const { apiKey, apiSecret } = settingsData.settings;

      const response = await fetch("/api/exchange/close-all-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: "bybit",
          apiKey,
          apiSecret,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`✅ Zamknięto ${data.results.positionsClosed} pozycji`);
        await loadPositions();
      } else {
        toast.error(`Błąd: ${data.message}`);
      }
    } catch (err) {
      console.error("Close all error:", err);
      toast.error("Błąd zamykania pozycji");
    } finally {
      setClosingAll(false);
    }
  };

  const totalUnrealisedPnl = positions.reduce((sum, p) => sum + (p.unrealisedPnl || 0), 0);

  const usdtBalance = balance.find((b) => b.asset === "USDT");
  const totalBalance = usdtBalance ? parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked) : 0;

  if (loading || loadingSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <RefreshCw className="h-12 w-12 animate-spin text-blue-500" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600/30 to-blue-900/20 border border-blue-500/30">
              <BarChart3 className="h-8 w-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Trading Dashboard
              </h1>
              <p className="text-sm text-gray-200">
                Live monitoring • Auto-refresh: 5s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleTestSMS}
              disabled={testingSMS}
              variant="outline"
              className="border-green-600 text-green-300 hover:bg-green-600/20"
            >
              {testingSMS ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Wysyłanie...
                </>
              ) : (
                <>
                  <Smartphone className="mr-2 h-4 w-4" />
                  Test SMS
                </>
              )}
            </Button>
            <Button
              onClick={loadAll}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Odśwież
            </Button>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Bot Status */}
          <Card className={`border-2 ${botEnabled ? 'border-green-500/30 bg-green-900/10' : 'border-red-500/30 bg-red-900/10'}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Power className="h-4 w-4" />
                Status Bota
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {botEnabled === null ? (
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    ŁADOWANIE...
                  </Badge>
                ) : (
                  <Badge variant={botEnabled ? "default" : "destructive"} className="text-lg px-3 py-1">
                    {botEnabled ? "WŁĄCZONY" : "WYŁĄCZONY"}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Account Balance */}
          <Card className="border-2 border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Saldo Konta
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBalance ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
                  <span className="text-sm text-gray-400">Ładowanie...</span>
                </div>
              ) : balanceError ? (
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-bold text-red-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Błąd API
                  </div>
                  <div className="text-xs text-gray-400">
                    <a 
                      href="https://www.bybit.com/app/user/assets/home" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline hover:text-red-300 flex items-center gap-1"
                    >
                      Sprawdź na Bybit <Globe className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ) : totalBalance > 0 ? (
                <div className="text-2xl font-bold text-white">
                  {totalBalance.toFixed(2)} <span className="text-lg">USDT</span>
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  Brak salda
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unrealised PnL */}
          <Card className="border-2 border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                PnL Niezrealizowany
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${totalUnrealisedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalUnrealisedPnl >= 0 ? '+' : ''}{totalUnrealisedPnl.toFixed(2)} <span className="text-lg">USDT</span>
              </div>
            </CardContent>
          </Card>

          {/* Open Positions Count */}
          <Card className="border-2 border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Otwarte Pozycje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-white">
                  {positions.length}
                </div>
                {positions.length === 0 && (
                  <Badge variant="outline" className="text-xs text-gray-400">
                    Brak
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ERROR INFO WHEN POSITIONS ERROR */}
        {positionsError && (
          <Alert className="border-orange-700/40 bg-orange-900/20">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            <AlertDescription className="text-orange-200">
              <div className="space-y-2">
                <p className="font-bold text-base">⚠️ Błąd pobierania pozycji</p>
                <p className="text-sm">{positionsError}</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Emergency Close Button */}
        {positions.length > 0 && (
          <Card className="border-red-700/40 bg-red-900/20">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-6 w-6 text-red-400" />
                  <div>
                    <p className="text-white font-semibold">Awaryjne Zamknięcie Wszystkich Pozycji</p>
                    <p className="text-sm text-red-300">Zamknie wszystkie {positions.length} pozycji market order</p>
                  </div>
                </div>
                <Button
                  onClick={handleCloseAll}
                  disabled={closingAll}
                  variant="destructive"
                  size="lg"
                  className="bg-red-600 hover:bg-red-700"
                >
                  {closingAll ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Zamykanie...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Zamknij Wszystkie
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Open Positions */}
        <Card className="border-gray-800 bg-gray-900/80">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5" />
              Obecnie Otwarte Pozycje ({positions.length})
            </h2>
            
            {positions.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-gray-300">Brak otwartych pozycji</p>
                <p className="text-xs text-gray-500 mt-2">
                  Gdy bot otworzy nowe pozycje, pojawią się tutaj automatycznie
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((pos) => {
                  const pnl = pos.unrealisedPnl || 0;
                  const isProfitable = pnl > 0;
                  
                  return (
                    <div
                      key={pos.id}
                      className={`p-4 rounded-lg border ${
                        isProfitable
                          ? "border-green-500/30 bg-green-900/10"
                          : "border-red-500/30 bg-red-900/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-white">{pos.symbol}</span>
                            <Badge variant={pos.side === "Buy" ? "default" : "secondary"}>
                              {pos.side === "Buy" ? "LONG" : "SHORT"}
                            </Badge>
                            <span className="text-sm text-gray-400">{pos.leverage}x</span>
                            <Badge className="text-purple-300 border-purple-500/50 bg-purple-900/30">
                              {pos.tier}
                            </Badge>
                          </div>
                          
                          <div className="text-xs text-gray-400">
                            Entry: {pos.entryPrice.toFixed(4)} · Qty: {pos.quantity}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Opened: {new Date(pos.openedAt).toLocaleString('pl-PL')}
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

      {/* Close All Confirmation Dialog */}
      <AlertDialog open={showCloseAllDialog} onOpenChange={setShowCloseAllDialog}>
        <AlertDialogContent className="bg-gray-900 border-red-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl text-white flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              Potwierdzenie Zamknięcia Pozycji
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300 text-base">
              Zamkniesz <span className="font-bold text-red-400">WSZYSTKIE {positions.length} otwarte pozycje</span> zleceniem market order.
              <br /><br />
              <span className="text-red-300">⚠️ Ta operacja jest nieodwracalna!</span>
              <br /><br />
              Czy na pewno chcesz kontynuować?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700">
              Anuluj
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCloseAll}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Tak, Zamknij Wszystkie
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}