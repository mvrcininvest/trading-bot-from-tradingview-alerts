"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Activity, RefreshCw, Settings, History, DollarSign } from "lucide-react";
import { useRouter } from "next/navigation";

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

interface Stats {
  totalPositions: number;
  totalPnl: number;
  winRate: number;
}

interface Balance {
  totalEquity: number;
  availableBalance: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [positions, setPositions] = useState<Position[]>([]);
  const [botEnabled, setBotEnabled] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

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
        setPositions(posData.positions.filter((p: any) => p.status === 'open'));
      }
      
      if (statusData.success && statusData.settings) {
        setBotEnabled(statusData.settings.botEnabled);
      }
      
      if (histData.success && histData.stats) {
        setStats(histData.stats);
      }

      if (balData.success && balData.balance) {
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <RefreshCw className="h-12 w-12 animate-spin text-blue-500" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="border-gray-800 bg-gray-900/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-300">Otwarte Pozycje</h3>
                <Activity className="h-4 w-4 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-white">{positions.length}</p>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-300">Status Bota</h3>
              </div>
              <p className={`text-2xl font-bold ${botEnabled ? 'text-green-400' : 'text-red-400'}`}>
                {botEnabled ? 'Aktywny' : 'Wyłączony'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-300">PnL Niezrealizowany</h3>
                <TrendingUp className="h-4 w-4 text-green-400" />
              </div>
              <p className={`text-2xl font-bold ${unrealisedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {unrealisedPnL >= 0 ? '+' : ''}{unrealisedPnL.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-300">Total PnL</h3>
                <History className="h-4 w-4 text-purple-400" />
              </div>
              {stats ? (
                <>
                  <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">{stats.totalPositions} zamkniętych</p>
                </>
              ) : (
                <p className="text-2xl font-bold text-gray-500">---</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-300">Saldo Konta</h3>
                <DollarSign className="h-4 w-4 text-cyan-400" />
              </div>
              {balance ? (
                <>
                  <p className="text-2xl font-bold text-cyan-400">
                    {balance.totalEquity.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">USDT</p>
                </>
              ) : (
                <p className="text-2xl font-bold text-gray-500">---</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border-gray-800 bg-gray-900/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">
                  Bot: <span className={`font-semibold ${botEnabled ? 'text-green-400' : 'text-red-400'}`}>
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

        {/* Open Positions */}
        <Card className="border-gray-800 bg-gray-900/80">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Obecnie Otwarte Pozycje ({positions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                            <span className="text-sm text-gray-400">
                              {pos.side === "Buy" ? "LONG" : "SHORT"} {pos.leverage}x
                            </span>
                            <span className="text-sm text-purple-300">{pos.tier}</span>
                          </div>
                          
                          <div className="text-xs text-gray-400">
                            Entry: {pos.entryPrice.toFixed(4)} · Qty: {pos.quantity}
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