"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  PieChart, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target, 
  AlertCircle,
  RefreshCw,
  Calendar,
  Activity,
  BarChart3,
  Percent,
  Clock,
  Award,
  XCircle,
  Download,
  Database,
  AlertTriangle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ExportDialog } from "@/components/ExportDialog";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
  openPositionsCount: number;
  last7Days: {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
  };
  last30Days: {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
  };
  symbolStats: Array<{
    symbol: string;
    totalTrades: number;
    winRate: number;
    avgPnL: number;
    totalPnL: number;
    volume: number;
  }>;
}

interface StatsResponse {
  success: boolean;
  stats: BybitStats;
  dataSource: "bybit" | "local_db";
  daysBack: number;
  fetchedAt: string;
  warning?: string;
}

export default function StatystykiPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<BybitStats | null>(null);
  const [dataSource, setDataSource] = useState<"bybit" | "local_db">("bybit");
  const [warning, setWarning] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [daysBack, setDaysBack] = useState(90);

  useEffect(() => {
    fetchStats();
  }, [daysBack]);

  const fetchStats = async () => {
    setLoading(true);
    setWarning(null);
    
    try {
      // ✅ Użyj server-side API z fallbackiem
      const response = await fetch(`/api/analytics/bybit-stats?days=${daysBack}`);
      const data: StatsResponse = await response.json();

      if (data.success && data.stats) {
        setStats(data.stats);
        setDataSource(data.dataSource);
        
        if (data.warning) {
          setWarning(data.warning);
          toast.warning("Używam lokalnej bazy danych", {
            description: "Bybit API niedostępne - dane z bot history"
          });
        }
      } else {
        toast.error("Błąd pobierania statystyk");
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      toast.error("Błąd pobierania statystyk");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-400" />
          <p className="text-gray-200">Ładowanie statystyk...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6 flex items-center justify-center">
        <Card className="max-w-md border-red-800 bg-red-900/20">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <p className="text-red-200">Brak danych statystyk</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-600/30 to-purple-900/20 border border-purple-500/30">
              <Database className="h-8 w-8 text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Statystyki Tradingowe
              </h1>
              <p className="text-sm text-gray-200">
                Źródło: {dataSource === "bybit" ? "Bybit API" : "Lokalna baza"} (ostatnie {daysBack} dni)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setExportDialogOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Download className="mr-2 h-4 w-4" />
              Eksportuj
            </Button>
            <Button
              onClick={fetchStats}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Odśwież
            </Button>
          </div>
        </div>

        {dataSource === "local_db" && (
          <Alert className="border-blue-700 bg-blue-900/20">
            <Database className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-sm text-blue-200">
              📊 Statystyki z lokalnej bazy danych (bot_position_history). Saldo portfela niedostępne.
            </AlertDescription>
          </Alert>
        )}

        {dataSource === "bybit" && (
          <Alert className="border-green-700 bg-green-900/20">
            <Database className="h-4 w-4 text-green-400" />
            <AlertDescription className="text-sm text-green-200">
              ✅ Statystyki pobrane bezpośrednio z Bybit API - dane są aktualne!
            </AlertDescription>
          </Alert>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-800 bg-gradient-to-br from-blue-600/10 to-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                  <BarChart3 className="h-5 w-5 text-blue-400" />
                </div>
                <Badge variant="outline" className="text-xs text-gray-200">
                  Zamknięte
                </Badge>
              </div>
              <p className="text-3xl font-bold text-white mb-1">{stats.totalTrades}</p>
              <p className="text-sm text-gray-200">Łącznie pozycji</p>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-green-400">✓ {stats.winningTrades}</span>
                <span className="text-red-400">✗ {stats.losingTrades}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gradient-to-br from-green-600/10 to-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                  <Target className="h-5 w-5 text-green-400" />
                </div>
                <Badge variant="outline" className="text-xs text-gray-200">
                  Skuteczność
                </Badge>
              </div>
              <p className="text-3xl font-bold text-white mb-1">{stats.winRate.toFixed(1)}%</p>
              <p className="text-sm text-gray-200">Win Rate</p>
              <Progress value={stats.winRate} className="mt-3 h-2" />
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gradient-to-br from-purple-600/10 to-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
                  <DollarSign className="h-5 w-5 text-purple-400" />
                </div>
                <Badge variant="outline" className="text-xs text-gray-200">
                  Total PnL
                </Badge>
              </div>
              <p className={`text-3xl font-bold mb-1 ${stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)}
              </p>
              <p className="text-sm text-gray-200">USDT</p>
              <div className="mt-3 text-xs text-gray-300">
                Realized: {stats.realisedPnL >= 0 ? '+' : ''}{stats.realisedPnL.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gradient-to-br from-amber-600/10 to-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                  <Award className="h-5 w-5 text-amber-400" />
                </div>
                <Badge variant="outline" className="text-xs text-gray-200">
                  Stosunek
                </Badge>
              </div>
              <p className="text-3xl font-bold text-white mb-1">
                {stats.profitFactor === 999 ? '∞' : stats.profitFactor.toFixed(2)}
              </p>
              <p className="text-sm text-gray-200">Profit Factor</p>
              <p className="mt-3 text-xs text-gray-300">
                {stats.profitFactor >= 2 ? '🔥 Doskonały' : stats.profitFactor >= 1.5 ? '✅ Dobry' : stats.profitFactor >= 1 ? '⚠️ Średni' : '❌ Słaby'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Advanced Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-200 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Najlepszy Trade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-400">
                +{stats.bestTrade.toFixed(2)} USDT
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-200 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Najgorszy Trade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-400">
                {stats.worstTrade.toFixed(2)} USDT
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-200 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Średni Czas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white">
                {stats.avgHoldingTime < 60 
                  ? `${Math.round(stats.avgHoldingTime)}m`
                  : `${Math.round(stats.avgHoldingTime / 60)}h`
                }
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Time-based Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Ostatnie 7 Dni
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Trades:</span>
                  <span className="font-bold text-white">{stats.last7Days.totalTrades}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Win Rate:</span>
                  <span className="font-bold text-white">{stats.last7Days.winRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">PnL:</span>
                  <span className={`font-bold ${stats.last7Days.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.last7Days.totalPnL >= 0 ? '+' : ''}{stats.last7Days.totalPnL.toFixed(2)} USDT
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Ostatnie 30 Dni
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Trades:</span>
                  <span className="font-bold text-white">{stats.last30Days.totalTrades}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Win Rate:</span>
                  <span className="font-bold text-white">{stats.last30Days.winRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">PnL:</span>
                  <span className={`font-bold ${stats.last30Days.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.last30Days.totalPnL >= 0 ? '+' : ''}{stats.last30Days.totalPnL.toFixed(2)} USDT
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Symbol Statistics */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">Top 15 Symboli</CardTitle>
            <CardDescription className="text-gray-300">
              Najlepiej performujące instrumenty według PnL
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.symbolStats.map((symbol, idx) => (
                <div 
                  key={idx} 
                  className="p-3 rounded-lg border border-gray-800 bg-gray-900/50 hover:bg-gray-900/70 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                        symbol.totalPnL >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {idx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-white">{symbol.symbol}</h4>
                        <p className="text-xs text-gray-300">{symbol.totalTrades} trades · {symbol.winRate.toFixed(1)}% WR</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${symbol.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {symbol.totalPnL >= 0 ? '+' : ''}{symbol.totalPnL.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-300">
                        Vol: {symbol.volume.toFixed(0)} USDT
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <ExportDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen} />
    </div>
  );
}