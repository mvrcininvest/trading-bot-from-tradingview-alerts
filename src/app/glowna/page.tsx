"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, BarChart3, Power, DollarSign, AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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
  const [botEnabled, setBotEnabled] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [balance, setBalance] = useState<BalanceData[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [closingAll, setClosingAll] = useState(false);

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
      const response = await fetch("/api/bot/positions");
      const data = await response.json();
      
      if (data.success && Array.isArray(data.positions)) {
        // Filtruj tylko pozycje ze statusem 'open' (nie 'closed')
        const openPositions = data.positions.filter((p: any) => p.status === 'open');
        setPositions(openPositions);
      }
    } catch (err) {
      console.error("Load positions error:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadBotSettings = async () => {
    try {
      const response = await fetch("/api/bot/settings");
      const data = await response.json();
      
      if (data.success && data.settings) {
        setBotEnabled(data.settings.botEnabled);
      }
    } catch (err) {
      console.error("Load settings error:", err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadBalance = async () => {
    try {
      // Pobierz credentials z settings
      const settingsResponse = await fetch("/api/bot/settings");
      const settingsData = await settingsResponse.json();
      
      if (!settingsData.success || !settingsData.settings?.apiKey) {
        setLoadingBalance(false);
        return;
      }

      const { apiKey, apiSecret } = settingsData.settings;

      const response = await fetch("/api/exchange/get-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: "bybit",
          apiKey,
          apiSecret,
        }),
      });

      const data = await response.json();
      
      if (data.success && data.balances) {
        setBalance(data.balances);
      }
    } catch (err) {
      console.error("Load balance error:", err);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleCloseAll = async () => {
    if (positions.length === 0) {
      toast.error("Brak otwartych pozycji do zamknięcia");
      return;
    }

    const confirmed = confirm(
      `⚠️ UWAGA!\n\nZamkniesz WSZYSTKIE ${positions.length} otwarte pozycje market order!\n\nCzy na pewno chcesz kontynuować?`
    );

    if (!confirmed) return;

    setClosingAll(true);

    try {
      // Pobierz credentials
      const settingsResponse = await fetch("/api/bot/settings");
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
        await loadPositions(); // Odśwież listę
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

  // Oblicz total PnL
  const totalUnrealisedPnl = positions.reduce((sum, p) => sum + (p.unrealisedPnl || 0), 0);

  // Znajdź USDT balance
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
          <Button
            onClick={loadAll}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Odśwież
          </Button>
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
                <Badge variant={botEnabled ? "default" : "destructive"} className="text-lg px-3 py-1">
                  {botEnabled ? "WŁĄCZONY" : "WYŁĄCZONY"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Account Balance */}
          <Card className="border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Saldo Konta
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBalance ? (
                <div className="text-gray-400">Ładowanie...</div>
              ) : (
                <div className="text-2xl font-bold text-white">
                  {totalBalance.toFixed(2)} <span className="text-lg text-gray-400">USDT</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unrealised PnL */}
          <Card className="border-gray-800 bg-gray-900/60">
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
          <Card className="border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Otwarte Pozycje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {positions.length}
              </div>
            </CardContent>
          </Card>
        </div>

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
    </div>
  );
}