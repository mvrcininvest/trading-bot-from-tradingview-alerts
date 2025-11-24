"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, TrendingUp, TrendingDown, Activity, Database, BarChart3, Award, Target, DollarSign, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// ✅ INTERFEJS: Tylko statystyki Bybit
interface BybitStats {
  totalEquity: number;
  totalWalletBalance: number;
  availableBalance: number;
  realisedPnL: number;
  unrealisedPnL: number;
  totalPnL: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  tradingVolume: number;
  avgHoldingTime: number;
}

interface BybitStatsResponse {
  success: boolean;
  stats: BybitStats;
  dataSource: "bybit" | "database";
  daysBack: number;
  fetchedAt: string;
}

export default function BotHistoryPage() {
  const router = useRouter();
  const [bybitStats, setBybitStats] = useState<BybitStats | null>(null);
  const [loadingBybitStats, setLoadingBybitStats] = useState(false);
  const [bybitDataSource, setBybitDataSource] = useState<"bybit" | "database" | null>(null);

  useEffect(() => {
    fetchBybitStats();
  }, []);

  const fetchBybitStats = async () => {
    setLoadingBybitStats(true);
    try {
      const response = await fetch('/api/analytics/bybit-stats?days=30');
      const data: BybitStatsResponse = await response.json();
      
      if (data.success) {
        setBybitStats(data.stats);
        setBybitDataSource(data.dataSource);
      }
    } catch (err) {
      console.error("Nie udało się pobrać statystyk Bybit:", err);
      toast.error("Błąd pobierania statystyk z Bybit API");
    } finally {
      setLoadingBybitStats(false);
    }
  };

  // ✅ STATYSTYKI - tylko z Bybit API
  const stats = bybitStats ? {
    totalTrades: bybitStats.totalTrades,
    profitable: bybitStats.winningTrades,
    losses: bybitStats.losingTrades,
    totalPnl: bybitStats.realisedPnL,
    winRate: bybitStats.winRate,
  } : {
    totalTrades: 0,
    profitable: 0,
    losses: 0,
    totalPnl: 0,
    winRate: 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-600/30 to-amber-900/20 border border-amber-500/30">
              <History className="h-8 w-8 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Statystyki Tradingowe
              </h1>
              <p className="text-gray-200">
                Dane z Bybit API - ostatnie 30 dni
              </p>
            </div>
          </div>
          <Button onClick={() => router.push("/dashboard")} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Activity className="mr-2 h-4 w-4" />
            Powrót do Dashboard
          </Button>
        </div>

        {/* Podstawowe Statystyki */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Łącznie</CardDescription>
              <CardTitle className="text-3xl text-white">{stats.totalTrades}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Zyskowne</CardDescription>
              <CardTitle className="text-3xl text-green-400 flex items-center gap-2">
                <TrendingUp className="h-6 w-6" />
                {stats.profitable}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Stratne</CardDescription>
              <CardTitle className="text-3xl text-red-400 flex items-center gap-2">
                <TrendingDown className="h-6 w-6" />
                {stats.losses}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Win Rate</CardDescription>
              <CardTitle className="text-3xl text-white">{stats.winRate.toFixed(1)}%</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Łączny PnL</CardDescription>
              <CardTitle
                className={`text-3xl ${stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {stats.totalPnl >= 0 ? "+" : ""}
                {stats.totalPnl.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* ✅ Rozszerzone statystyki z Bybit API */}
        {bybitStats && !loadingBybitStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-amber-800 bg-gradient-to-br from-amber-900/30 to-gray-900/60 backdrop-blur-sm hover:from-amber-900/40 transition-all">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between mb-1">
                  <CardDescription className="text-amber-300">Współczynnik Zysku</CardDescription>
                  {bybitDataSource === "database" && (
                    <Badge variant="outline" className="text-xs text-amber-300 border-amber-500/50 bg-amber-500/10">
                      Lokalna baza
                    </Badge>
                  )}
                  {bybitDataSource === "bybit" && (
                    <Badge variant="outline" className="text-xs text-green-300 border-green-500/50 bg-green-500/10">
                      Live z Bybit
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-3xl text-white">
                  {bybitStats.profitFactor === 999 ? '∞' : bybitStats.profitFactor.toFixed(2)}
                </CardTitle>
                <p className="text-xs text-amber-400 mt-1">
                  {bybitStats.profitFactor >= 2 ? '🔥 Doskonały' : bybitStats.profitFactor >= 1.5 ? '✅ Dobry' : '⚠️ Średni'}
                </p>
              </CardHeader>
            </Card>

            <Card className="border-cyan-800 bg-gradient-to-br from-cyan-900/30 to-gray-900/60 backdrop-blur-sm hover:from-cyan-900/40 transition-all">
              <CardHeader className="pb-2">
                <CardDescription className="text-cyan-300">Wolumen Tradingowy</CardDescription>
                <CardTitle className="text-3xl text-white">
                  {(bybitStats.tradingVolume / 1000).toFixed(1)}K
                </CardTitle>
                <p className="text-xs text-cyan-400 mt-1">USDT</p>
              </CardHeader>
            </Card>

            <Card className="border-orange-800 bg-gradient-to-br from-orange-900/30 to-gray-900/60 backdrop-blur-sm hover:from-orange-900/40 transition-all">
              <CardHeader className="pb-2">
                <CardDescription className="text-orange-300">Śr. Czas Trzymania</CardDescription>
                <CardTitle className="text-3xl text-white">
                  {bybitStats.avgHoldingTime < 60 
                    ? `${Math.round(bybitStats.avgHoldingTime)}m`
                    : `${Math.round(bybitStats.avgHoldingTime / 60)}h`
                  }
                </CardTitle>
                <p className="text-xs text-orange-400 mt-1">na transakcję</p>
              </CardHeader>
            </Card>

            <Card className="border-purple-800 bg-gradient-to-br from-purple-900/30 to-gray-900/60 backdrop-blur-sm hover:from-purple-900/40 transition-all">
              <CardHeader className="pb-2">
                <CardDescription className="text-purple-300">Całkowity P&L</CardDescription>
                <CardTitle className={`text-3xl ${bybitStats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {bybitStats.totalPnL >= 0 ? '+' : ''}{bybitStats.totalPnL.toFixed(2)}
                </CardTitle>
                <p className="text-xs text-purple-400 mt-1">
                  Zrealizowany + Niezrealizowany
                </p>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* ✅ Szczegółowe statystyki z Bybit API */}
        {bybitStats && !loadingBybitStats && (
          <Card className="border-purple-800 bg-gradient-to-br from-purple-900/30 to-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Database className="h-5 w-5 text-purple-400" />
                    Szczegółowe Statystyki z Bybit API
                    {bybitDataSource === "database" && (
                      <Badge variant="outline" className="text-amber-300 border-amber-500/50 bg-amber-500/10">
                        Lokalna baza
                      </Badge>
                    )}
                    {bybitDataSource === "bybit" && (
                      <Badge variant="outline" className="text-green-300 border-green-500/50 bg-green-500/10">
                        Live z Bybit
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Kompletne dane z ostatnich 30 dni
                  </CardDescription>
                </div>
                <Button
                  onClick={() => router.push("/statystyki")}
                  variant="outline"
                  size="sm"
                  className="border-purple-700 text-purple-300 hover:bg-purple-900/20"
                >
                  Pełna Analiza
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="p-3 rounded-lg bg-gradient-to-br from-blue-600/10 to-blue-900/5 border border-blue-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-4 w-4 text-blue-400" />
                    <h4 className="text-xs font-medium text-blue-300">Transakcje</h4>
                  </div>
                  <p className="text-2xl font-bold text-white">{bybitStats.totalTrades}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    <span className="text-green-400">✓{bybitStats.winningTrades}</span>
                    {" / "}
                    <span className="text-red-400">✗{bybitStats.losingTrades}</span>
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-gradient-to-br from-green-600/10 to-green-900/5 border border-green-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-green-400" />
                    <h4 className="text-xs font-medium text-green-300">Skuteczność</h4>
                  </div>
                  <p className="text-2xl font-bold text-white">{bybitStats.winRate.toFixed(1)}%</p>
                  <div className="mt-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${bybitStats.winRate}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-gradient-to-br from-amber-600/10 to-amber-900/5 border border-amber-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="h-4 w-4 text-amber-400" />
                    <h4 className="text-xs font-medium text-amber-300">Profit Factor</h4>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {bybitStats.profitFactor === 999 ? '∞' : bybitStats.profitFactor.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {bybitStats.profitFactor >= 2 ? '🔥 Doskonały' : bybitStats.profitFactor >= 1.5 ? '✅ Dobry' : '⚠️ Średni'}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-gradient-to-br from-purple-600/10 to-purple-900/5 border border-purple-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-purple-400" />
                    <h4 className="text-xs font-medium text-purple-300">PnL Zrealizowany</h4>
                  </div>
                  <p className={`text-2xl font-bold ${bybitStats.realisedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {bybitStats.realisedPnL >= 0 ? '+' : ''}{bybitStats.realisedPnL.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">USDT</p>
                </div>

                <div className="p-3 rounded-lg bg-gradient-to-br from-cyan-600/10 to-cyan-900/5 border border-cyan-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-cyan-400" />
                    <h4 className="text-xs font-medium text-cyan-300">Wolumen</h4>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {(bybitStats.tradingVolume / 1000).toFixed(1)}K
                  </p>
                  <p className="text-xs text-gray-400 mt-1">USDT</p>
                </div>

                <div className="p-3 rounded-lg bg-gradient-to-br from-orange-600/10 to-orange-900/5 border border-orange-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-orange-400" />
                    <h4 className="text-xs font-medium text-orange-300">Śr. Czas</h4>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {bybitStats.avgHoldingTime < 60 
                      ? `${Math.round(bybitStats.avgHoldingTime)}m`
                      : `${Math.round(bybitStats.avgHoldingTime / 60)}h`
                    }
                  </p>
                  <p className="text-xs text-gray-400 mt-1">na transakcję</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {loadingBybitStats && (
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-3">
                <Activity className="h-8 w-8 animate-spin text-blue-400" />
                <p className="text-sm text-gray-300">Ładowanie statystyk z Bybit API...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info */}
        <Card className="border-blue-800 bg-gradient-to-br from-blue-900/30 to-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-400" />
              Informacja
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300 text-sm">
              📊 Wszystkie statystyki pochodzą bezpośrednio z <strong>Bybit API</strong> i przedstawiają rzeczywiste dane z ostatnich 30 dni.
            </p>
            <p className="text-gray-300 text-sm mt-2">
              💡 Aby zobaczyć szczegółową historię pozycji, przejdź do zakładki <strong>"Pełna Analiza"</strong> lub <strong>"Dashboard"</strong>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}