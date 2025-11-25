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

// ✅ Interface dla historii pozycji z bot API
interface HistoryPosition {
  id: string;
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  closePrice: number;
  quantity: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  closeReason: string;
  openedAt: string;
  closedAt: string;
  durationMinutes: number;
  source: "bybit";
}

export default function StatystykiPage() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryPosition[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // ✅ Bot API pobiera dane z Bybit (server-side)
      const response = await fetch('/api/bot/history?limit=100');
      const data = await response.json();

      if (data.success && data.history) {
        setHistory(data.history);
      } else {
        toast.error("Błąd pobierania historii");
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
      toast.error("Błąd pobierania historii z Bybit");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Oblicz statystyki z lokalnych danych historii
  const calculateStats = () => {
    if (history.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnL: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        bestTrade: 0,
        worstTrade: 0,
        avgHoldingTime: 0,
        tradingVolume: 0,
      };
    }

    const wins = history.filter(h => h.pnl > 0);
    const losses = history.filter(h => h.pnl < 0);
    
    const totalWins = wins.reduce((sum, h) => sum + h.pnl, 0);
    const totalLosses = Math.abs(losses.reduce((sum, h) => sum + h.pnl, 0));
    
    return {
      totalTrades: history.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: (wins.length / history.length) * 100,
      totalPnL: history.reduce((sum, h) => sum + h.pnl, 0),
      avgWin: wins.length > 0 ? totalWins / wins.length : 0,
      avgLoss: losses.length > 0 ? totalLosses / losses.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0),
      bestTrade: history.length > 0 ? Math.max(...history.map(h => h.pnl)) : 0,
      worstTrade: history.length > 0 ? Math.min(...history.map(h => h.pnl)) : 0,
      avgHoldingTime: history.reduce((sum, h) => sum + h.durationMinutes, 0) / history.length,
      tradingVolume: history.reduce((sum, h) => sum + (h.quantity * h.entryPrice), 0),
    };
  };

  const stats = calculateStats();

  // Symbol stats
  const calculateSymbolStats = () => {
    const symbolMap = new Map<string, { totalTrades: number; winningTrades: number; totalPnL: number; volume: number }>();
    
    history.forEach(h => {
      if (!symbolMap.has(h.symbol)) {
        symbolMap.set(h.symbol, { totalTrades: 0, winningTrades: 0, totalPnL: 0, volume: 0 });
      }
      
      const s = symbolMap.get(h.symbol)!;
      s.totalTrades++;
      if (h.pnl > 0) s.winningTrades++;
      s.totalPnL += h.pnl;
      s.volume += h.quantity * h.entryPrice;
    });
    
    return Array.from(symbolMap.entries())
      .map(([symbol, data]) => ({
        symbol,
        totalTrades: data.totalTrades,
        winRate: (data.winningTrades / data.totalTrades) * 100,
        avgPnL: data.totalPnL / data.totalTrades,
        totalPnL: data.totalPnL,
        volume: data.volume,
      }))
      .sort((a, b) => b.totalPnL - a.totalPnL)
      .slice(0, 15);
  };

  const symbolStats = calculateSymbolStats();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-400" />
          <p className="text-gray-200">Ładowanie statystyk z Bybit...</p>
        </div>
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
              <p className="text-sm text-gray-200">Dane z Bybit API (ostatnie 100 pozycji)</p>
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
              onClick={fetchHistory}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Odśwież
            </Button>
          </div>
        </div>

        <Alert className="border-blue-700 bg-blue-900/20">
          <Database className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-sm text-blue-200">
            📊 Statystyki obliczane na podstawie danych pobranych server-side z Bybit API przez bot. Bez geo-blockingu.
          </AlertDescription>
        </Alert>

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
                  Średnie
                </Badge>
              </div>
              <p className="text-2xl font-bold text-green-400 mb-1">+{stats.avgWin.toFixed(2)}</p>
              <p className="text-sm text-gray-200">Średni Zysk</p>
              <div className="mt-3 text-xs">
                <span className="text-red-400">Średnia strata: -{stats.avgLoss.toFixed(2)}</span>
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
              {symbolStats.map((symbol, idx) => (
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