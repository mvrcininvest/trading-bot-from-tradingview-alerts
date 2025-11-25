"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Activity, RefreshCw, DollarSign, BarChart3, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  totalPnl: number;
}

interface Balance {
  totalEquity: number;
}

export default function TradingOverviewPage() {
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600/30 to-blue-900/20 border border-blue-500/30">
              <BarChart3 className="h-8 w-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Trading Overview
              </h1>
              <p className="text-sm text-gray-200">
                Podstawowe metryki i otwarte pozycje
              </p>
            </div>
          </div>
          <Button
            onClick={loadData}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Odśwież
          </Button>
        </div>

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
              </div>
              {stats ? (
                <>
                  <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl.toFixed(2)}
                  </p>
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
