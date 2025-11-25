"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Activity, RefreshCw, AlertCircle, Settings, Bot, History, Award, DollarSign } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface BotPosition {
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

interface HistoryStats {
  totalPositions: number;
  totalPnl: number;
  winRate: number;
}

interface BalanceInfo {
  totalEquity: number;
  availableBalance: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<BotPosition[]>([]);
  const [botEnabled, setBotEnabled] = useState<boolean>(false);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);

  useEffect(() => {
    checkCredentials();
  }, []);

  useEffect(() => {
    if (!credentials) return;
    
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [credentials]);

  const checkCredentials = async () => {
    const stored = localStorage.getItem("exchange_credentials");
    if (stored) {
      try {
        const creds = JSON.parse(stored);
        setCredentials(creds);
        return;
      } catch {}
    }
    
    try {
      const response = await fetch("/api/bot/credentials");
      const data = await response.json();
      
      if (data.success && data.credentials?.apiKey) {
        const creds = {
          exchange: "bybit",
          environment: "mainnet",
          apiKey: data.credentials.apiKey,
          apiSecret: data.credentials.apiSecret,
          savedAt: data.credentials.savedAt || new Date().toISOString()
        };
        localStorage.setItem("exchange_credentials", JSON.stringify(creds));
        setCredentials(creds);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [posRes, statusRes, histRes, balRes] = await Promise.all([
        fetch("/api/bot/positions"),
        fetch("/api/bot/settings"),
        fetch("/api/bot/history?limit=1000&source=database"),
        fetch("/api/exchange/get-balance")
      ]);
      
      const posData = await posRes.json();
      const statusData = await statusRes.json();
      const histData = await histRes.json();
      const balData = await balRes.json();
      
      if (posData.success && Array.isArray(posData.positions)) {
        const openPos = posData.positions.filter((p: BotPosition) => p.status === 'open');
        setPositions(openPos);
      }
      
      if (statusData.success && statusData.settings) {
        setBotEnabled(statusData.settings.botEnabled);
      }
      
      if (histData.success && histData.stats) {
        setStats(histData.stats);
      }

      if (balData.success) {
        setBalance(balData.balance);
      }
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const unrealisedPnL = positions.reduce((sum, p) => sum + (p.unrealisedPnl || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <Card className="max-w-md w-full border-gray-800 bg-gray-900/80">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
              <p className="text-lg font-medium text-white">Ładowanie...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <Card className="max-w-2xl w-full border-red-800 bg-red-900/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-300 text-2xl">
              <AlertCircle className="h-8 w-8" />
              Brak konfiguracji Bybit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push("/exchange-test")} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6"
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
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="p-4 rounded-lg bg-gradient-to-br from-blue-900/30 to-blue-800/50 border border-blue-800/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-blue-300">Otwarte Pozycje</h3>
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-blue-100">{positions.length}</p>
            <p className="text-xs text-blue-400">aktywnych</p>
          </Card>

          <Card className="p-4 rounded-lg bg-gradient-to-br from-amber-900/30 to-amber-800/50 border border-amber-800/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-amber-300">Status Bota</h3>
              <Bot className="h-4 w-4 text-amber-400" />
            </div>
            <p className={`text-2xl font-bold ${botEnabled ? 'text-green-100' : 'text-red-100'}`}>
              {botEnabled ? 'Aktywny' : 'Wyłączony'}
            </p>
            <p className="text-xs text-amber-400">
              {botEnabled ? '✓ Działa' : '✗ Zatrzymany'}
            </p>
          </Card>

          <Card className="p-4 rounded-lg bg-gradient-to-br from-green-900/30 to-green-800/50 border border-green-800/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-green-300">PnL Niezrealizowany</h3>
              <TrendingUp className="h-4 w-4 text-green-400" />
            </div>
            <p className={`text-2xl font-bold ${unrealisedPnL >= 0 ? 'text-green-100' : 'text-red-100'}`}>
              {unrealisedPnL >= 0 ? '+' : ''}{unrealisedPnL.toFixed(2)}
            </p>
            <p className="text-xs text-green-400">USDT (otwarte)</p>
          </Card>

          <Card className="p-4 rounded-lg bg-gradient-to-br from-purple-900/30 to-purple-800/50 border border-purple-800/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-purple-300">Total PnL</h3>
              <History className="h-4 w-4 text-purple-400" />
            </div>
            {stats ? (
              <>
                <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                  {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl.toFixed(2)}
                </p>
                <p className="text-xs text-purple-400">{stats.totalPositions} zamkniętych</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-gray-500">---</p>
            )}
          </Card>

          <Card className="p-4 rounded-lg bg-gradient-to-br from-cyan-900/30 to-cyan-800/50 border border-cyan-800/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-cyan-300">Saldo Konta</h3>
              <DollarSign className="h-4 w-4 text-cyan-400" />
            </div>
            {balance ? (
              <>
                <p className="text-2xl font-bold text-cyan-100">
                  {balance.totalEquity.toFixed(2)}
                </p>
                <p className="text-xs text-cyan-400">USDT total</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-gray-500">---</p>
            )}
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border-gray-800 bg-gray-900/60">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Bot className={`h-5 w-5 ${botEnabled ? 'text-green-400' : 'text-red-400'}`} />
                <span className="text-sm text-gray-300">
                  Status: <span className={`font-semibold ${botEnabled ? 'text-green-400' : 'text-red-400'}`}>
                    {botEnabled ? 'Aktywny' : 'Wyłączony'}
                  </span>
                </span>
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={() => router.push("/bot-history")}
                  variant="outline"
                  size="sm"
                  className="border-blue-700 text-blue-300 hover:bg-blue-900/20"
                >
                  <History className="h-4 w-4 mr-1" />
                  Historia
                </Button>
                <Button
                  onClick={() => router.push("/ustawienia-bota")}
                  variant="outline"
                  size="sm"
                  className="border-purple-700 text-purple-300 hover:bg-purple-900/20"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Ustawienia
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Open Positions List */}
        <Card className="border-gray-800 bg-gray-900/80">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Obecnie Otwarte Pozycje
              <Badge variant="secondary" className="bg-gray-700 text-gray-200">{positions.length}</Badge>
            </CardTitle>
            <CardDescription className="text-gray-300">
              Odświeżanie co 5 sekund
            </CardDescription>
          </CardHeader>
          <CardContent>
            {positions.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-gray-300 mb-4">Brak otwartych pozycji</p>
                {stats && stats.totalPositions > 0 && (
                  <Button
                    onClick={() => router.push("/bot-history")}
                    variant="outline"
                    className="border-blue-700 text-blue-300 hover:bg-blue-900/20"
                  >
                    <History className="h-4 w-4 mr-2" />
                    Zobacz Historię ({stats.totalPositions} pozycji)
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((pos) => {
                  const pnl = pos.unrealisedPnl || 0;
                  const isProfitable = pnl > 0;
                  
                  return (
                    <div
                      key={pos.id}
                      className={`p-4 rounded-lg border transition-all ${
                        isProfitable
                          ? "border-green-500/30 bg-green-900/10"
                          : "border-red-500/30 bg-red-900/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-white">{pos.symbol}</span>
                            <Badge variant={pos.side === "Buy" ? "default" : "secondary"}>
                              {pos.side === "Buy" ? "LONG" : "SHORT"} {pos.leverage}x
                            </Badge>
                            <Badge variant="outline" className="text-purple-300 border-purple-500/50 bg-purple-900/30">
                              {pos.tier}
                            </Badge>
                          </div>
                          
                          <div className="text-xs text-gray-400">
                            Entry: {pos.entryPrice.toFixed(4)} · Qty: {pos.quantity} · 
                            Opened: {new Date(pos.openedAt).toLocaleString("pl-PL", {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
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