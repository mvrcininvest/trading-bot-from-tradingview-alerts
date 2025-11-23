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
  Brain,
  Zap,
  TrendingUp as TrendUp,
  Sparkles,
  Filter,
  CheckCircle2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ExportDialog } from "@/components/ExportDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface HistoricalPosition {
  id: number;
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  closePrice: number;
  quantity: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  openedAt: string;
  closedAt: string;
  closeReason: string;
  durationMinutes: number;
}

interface Alert {
  id: number;
  symbol: string;
  tier: string;
  side: string;
  createdAt: string;
  actionTaken: string;
}

interface BotPosition {
  id: number;
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  unrealisedPnl: number;
  initialMargin: number;
  openedAt: string;
  status: string;
}

interface Stats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  avgHoldingTime: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
}

interface TierStats {
  tier: string;
  totalTrades: number;
  winRate: number;
  avgPnL: number;
  totalPnL: number;
}

interface SymbolStats {
  symbol: string;
  totalTrades: number;
  winRate: number;
  avgPnL: number;
  totalPnL: number;
}

interface TimeStats {
  period: string;
  totalTrades: number;
  winRate: number;
  totalPnL: number;
}

export default function StatystykiPage() {
  const [loading, setLoading] = useState(true);
  const [historicalPositions, setHistoricalPositions] = useState<HistoricalPosition[]>([]);
  const [currentPositions, setCurrentPositions] = useState<BotPosition[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tierStats, setTierStats] = useState<TierStats[]>([]);
  const [symbolStats, setSymbolStats] = useState<SymbolStats[]>([]);
  const [timeStats, setTimeStats] = useState<TimeStats[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [aiStats, setAiStats] = useState<any>(null);
  const [loadingAiStats, setLoadingAiStats] = useState(false);
  const [aiTimeRange, setAiTimeRange] = useState<string>("all");

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch historical positions
      const historyRes = await fetch("/api/bot/history");
      const historyData = await historyRes.json();
      const closedPositions = historyData.success ? historyData.history : [];
      setHistoricalPositions(closedPositions);

      // Fetch current positions
      const positionsRes = await fetch("/api/bot/positions");
      const positionsData = await positionsRes.json();
      const openPositions = positionsData.success ? positionsData.positions : [];
      setCurrentPositions(openPositions);

      // Fetch alerts - get TOTAL count, not just fetched alerts
      const alertsRes = await fetch("/api/alerts");
      const alertsData = await alertsRes.json();
      setAlerts(alertsData.success ? alertsData.alerts : []);
      setTotalAlerts(alertsData.success ? alertsData.total : 0);

      // Calculate statistics
      calculateStatistics(closedPositions, openPositions, alertsData.alerts || []);
      
      // Fetch AI stats
      fetchAiStats();
    } catch (error) {
      console.error("Failed to fetch statistics data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAiStats = async () => {
    setLoadingAiStats(true);
    try {
      const params = new URLSearchParams();
      if (aiTimeRange !== "all") {
        params.append("days", aiTimeRange);
      }
      
      const response = await fetch(`/api/analytics/ai-stats?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setAiStats(data.stats);
      }
    } catch (error) {
      console.error("Failed to fetch AI stats:", error);
    } finally {
      setLoadingAiStats(false);
    }
  };

  const calculateStatistics = (
    closed: HistoricalPosition[], 
    open: BotPosition[],
    alertsData: Alert[]
  ) => {
    if (closed.length === 0) {
      setStats({
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnL: 0,
        avgWin: 0,
        avgLoss: 0,
        avgHoldingTime: 0,
        bestTrade: 0,
        worstTrade: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        currentDrawdown: 0
      });
      setTierStats([]);
      setSymbolStats([]);
      setTimeStats([]);
      return;
    }

    // ✅ POPRAWKA: Basic stats - tylko closed positions dla win/loss
    const totalTrades = closed.length;
    const winningTrades = closed.filter(p => p.pnl > 0).length;
    const losingTrades = closed.filter(p => p.pnl < 0).length;
    const breakEvenTrades = closed.filter(p => p.pnl === 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    // ✅ POPRAWKA: Total PnL - tylko realised z closed (bez unrealised)
    const realisedPnL = closed.reduce((sum, p) => sum + p.pnl, 0);
    const unrealisedPnL = open.reduce((sum, p) => sum + p.unrealisedPnl, 0);
    const totalPnL = realisedPnL + unrealisedPnL;
    
    const wins = closed.filter(p => p.pnl > 0);
    const losses = closed.filter(p => p.pnl < 0);
    
    // ✅ POPRAWKA: Avg Win/Loss - prawidłowe obliczenia
    const avgWin = wins.length > 0 ? wins.reduce((sum, p) => sum + p.pnl, 0) / wins.length : 0;
    const totalLossSum = losses.reduce((sum, p) => sum + p.pnl, 0); // będzie ujemny
    const avgLoss = losses.length > 0 ? Math.abs(totalLossSum / losses.length) : 0;
    
    const avgHoldingTime = totalTrades > 0 
      ? closed.reduce((sum, p) => sum + (p.durationMinutes || 0), 0) / totalTrades 
      : 0;
    
    const pnls = closed.map(p => p.pnl);
    const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
    const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
    
    // ✅ POPRAWKA: Profit Factor - sum of wins / sum of absolute losses
    const totalWins = wins.reduce((sum, p) => sum + p.pnl, 0);
    const totalLosses = Math.abs(losses.reduce((sum, p) => sum + p.pnl, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
    
    // ✅ POPRAWKA: Sharpe Ratio - używa pnlPercent jako zwrotów
    const returns = closed.map(p => p.pnlPercent || 0);
    const avgReturn = returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;
    const variance = returns.length > 0 
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length 
      : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
    
    // ✅ POPRAWKA: Drawdown - iteruj chronologicznie i śledź peak equity
    const sortedPositions = [...closed].sort((a, b) => 
      new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime()
    );
    
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnL = 0;
    
    sortedPositions.forEach(position => {
      runningPnL += position.pnl;
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });
    
    const currentDrawdown = peak - runningPnL;

    setStats({
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnL,
      avgWin,
      avgLoss,
      avgHoldingTime,
      bestTrade,
      worstTrade,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      currentDrawdown
    });

    // ✅ POPRAWKA: Calculate tier statistics - tylko closed positions
    const tierMap = new Map<string, { wins: number; total: number; pnl: number }>();
    closed.forEach(p => {
      const tier = p.tier || 'Unknown';
      if (!tierMap.has(tier)) {
        tierMap.set(tier, { wins: 0, total: 0, pnl: 0 });
      }
      const tierData = tierMap.get(tier)!;
      tierData.total++;
      if (p.pnl > 0) tierData.wins++;
      tierData.pnl += p.pnl;
    });

    const tierStatsData: TierStats[] = Array.from(tierMap.entries()).map(([tier, data]) => ({
      tier,
      totalTrades: data.total,
      winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      avgPnL: data.total > 0 ? data.pnl / data.total : 0,
      totalPnL: data.pnl
    })).sort((a, b) => b.totalPnL - a.totalPnL);
    
    setTierStats(tierStatsData);

    // ✅ POPRAWKA: Calculate symbol statistics - tylko closed positions
    const symbolMap = new Map<string, { wins: number; total: number; pnl: number }>();
    closed.forEach(p => {
      const symbol = p.symbol;
      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, { wins: 0, total: 0, pnl: 0 });
      }
      const symbolData = symbolMap.get(symbol)!;
      symbolData.total++;
      if (p.pnl > 0) symbolData.wins++;
      symbolData.pnl += p.pnl;
    });

    const symbolStatsData: SymbolStats[] = Array.from(symbolMap.entries()).map(([symbol, data]) => ({
      symbol,
      totalTrades: data.total,
      winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      avgPnL: data.total > 0 ? data.pnl / data.total : 0,
      totalPnL: data.pnl
    })).sort((a, b) => b.totalPnL - a.totalPnL).slice(0, 10); // Top 10
    
    setSymbolStats(symbolStatsData);

    // ✅ POPRAWKA: Calculate time-based statistics - prawidłowe filtrowanie dat
    const now = new Date();
    const last7Days = closed.filter(p => {
      const closedDate = new Date(p.closedAt);
      const diffMs = now.getTime() - closedDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays <= 7;
    });
    
    const last30Days = closed.filter(p => {
      const closedDate = new Date(p.closedAt);
      const diffMs = now.getTime() - closedDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays <= 30;
    });

    const timeStatsData: TimeStats[] = [
      {
        period: 'Ostatnie 7 dni',
        totalTrades: last7Days.length,
        winRate: last7Days.length > 0 ? (last7Days.filter(p => p.pnl > 0).length / last7Days.length) * 100 : 0,
        totalPnL: last7Days.reduce((sum, p) => sum + p.pnl, 0)
      },
      {
        period: 'Ostatnie 30 dni',
        totalTrades: last30Days.length,
        winRate: last30Days.length > 0 ? (last30Days.filter(p => p.pnl > 0).length / last30Days.length) * 100 : 0,
        totalPnL: last30Days.reduce((sum, p) => sum + p.pnl, 0)
      },
      {
        period: 'Cały czas',
        totalTrades: closed.length,
        winRate,
        totalPnL: realisedPnL
      }
    ];
    
    setTimeStats(timeStatsData);
  };

  // ✅ POPRAWIONY FORMAT CZASU - normalne minuty/godziny
  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (mins > 0) {
      return `${hours}h ${mins}min`;
    }
    return `${hours}h`;
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-600/30 to-purple-900/20 border border-purple-500/30">
              <PieChart className="h-8 w-8 text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Statystyki Bota
              </h1>
              <p className="text-sm text-gray-200">Kompleksowa analiza wydajności tradingowej</p>
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
              onClick={fetchAllData}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Odśwież
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        {stats && (
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
                    Zrealizowany
                  </Badge>
                </div>
                <p className={`text-3xl font-bold mb-1 ${stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)}
                </p>
                <p className="text-sm text-gray-200">USDT (zamknięte)</p>
                <div className="mt-3 flex items-center gap-3 text-xs">
                  <span className="text-green-400">Śr. +{stats.avgWin.toFixed(2)}</span>
                  <span className="text-red-400">Śr. -{stats.avgLoss.toFixed(2)}</span>
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
        )}

        {/* Advanced Metrics */}
        {stats && (
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
                  {formatDuration(stats.avgHoldingTime)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Detailed Statistics Tabs */}
        <Tabs defaultValue="ai" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-gray-900/80 backdrop-blur-sm border border-gray-800">
            <TabsTrigger value="ai" className="data-[state=active]:bg-purple-600/30 data-[state=active]:text-purple-200 text-gray-300">
              <Brain className="mr-2 h-4 w-4" />
              Analiza AI
            </TabsTrigger>
            <TabsTrigger value="time" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-200 text-gray-300">
              <Calendar className="mr-2 h-4 w-4" />
              Czasowe
            </TabsTrigger>
            <TabsTrigger value="tiers" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-200 text-gray-300">
              <Award className="mr-2 h-4 w-4" />
              Tiery
            </TabsTrigger>
            <TabsTrigger value="symbols" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-200 text-gray-300">
              <Activity className="mr-2 h-4 w-4" />
              Symbole
            </TabsTrigger>
          </TabsList>

          {/* AI Analysis Tab */}
          <TabsContent value="ai" className="space-y-4">
            {/* AI Time Range Filter */}
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Filter className="h-5 w-5 text-purple-400" />
                      Zakres Analizy AI
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      Wybierz okres dla zaawansowanej analizy danych
                    </CardDescription>
                  </div>
                  <Select value={aiTimeRange} onValueChange={(val) => {
                    setAiTimeRange(val);
                    fetchAiStats();
                  }}>
                    <SelectTrigger className="w-[180px] bg-gray-800 border-gray-700 text-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="7" className="text-gray-300">Ostatnie 7 dni</SelectItem>
                      <SelectItem value="30" className="text-gray-300">Ostatnie 30 dni</SelectItem>
                      <SelectItem value="90" className="text-gray-300">Ostatnie 90 dni</SelectItem>
                      <SelectItem value="all" className="text-gray-300">Wszystko</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
            </Card>

            {loadingAiStats ? (
              <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                <CardContent className="p-12">
                  <div className="text-center">
                    <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-400" />
                    <p className="text-gray-300">Ładowanie analizy AI...</p>
                  </div>
                </CardContent>
              </Card>
            ) : aiStats ? (
              <>
                {/* AI Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-purple-800 bg-gradient-to-br from-purple-900/30 to-gray-900/80 backdrop-blur-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
                          <Sparkles className="h-5 w-5 text-purple-400" />
                        </div>
                        <Badge variant="outline" className="text-xs text-purple-300 border-purple-600">
                          Rekomendacja AI
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-300 mb-2">Najlepszy Tier</p>
                      <p className="text-2xl font-bold text-purple-100">
                        {aiStats.winRateByTier?.[0]?.tier || 'N/A'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {aiStats.winRateByTier?.[0]?.winRate.toFixed(1)}% Win Rate
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-blue-800 bg-gradient-to-br from-blue-900/30 to-gray-900/80 backdrop-blur-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                          <CheckCircle2 className="h-5 w-5 text-blue-400" />
                        </div>
                        <Badge variant="outline" className="text-xs text-blue-300 border-blue-600">
                          Optymalna Wartość
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-300 mb-2">Najlepsza Liczba Potwierdzeń</p>
                      <p className="text-2xl font-bold text-blue-100">
                        {aiStats.winRateByConfirmation?.reduce((best: any, curr: any) => 
                          curr.winRate > best.winRate ? curr : best, 
                          aiStats.winRateByConfirmation[0]
                        )?.confirmationCount || 'N/A'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {aiStats.winRateByConfirmation?.reduce((best: any, curr: any) => 
                          curr.winRate > best.winRate ? curr : best, 
                          aiStats.winRateByConfirmation[0]
                        )?.winRate.toFixed(1)}% Win Rate
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-green-800 bg-gradient-to-br from-green-900/30 to-gray-900/80 backdrop-blur-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                          <Target className="h-5 w-5 text-green-400" />
                        </div>
                        <Badge variant="outline" className="text-xs text-green-300 border-green-600">
                          Najlepszy TP
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-300 mb-2">Optymalny Poziom TP</p>
                      <p className="text-2xl font-bold text-green-100">
                        {aiStats.tpHitStats?.tp1AndTp2 > aiStats.tpHitStats?.allTPs ? 'TP1 + TP2' : 
                         aiStats.tpHitStats?.allTPs > aiStats.tpHitStats?.tp1Only ? 'Wszystkie' : 'TP1'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Najlepszy ROI
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Win Rate by Tier */}
                {aiStats.winRateByTier && aiStats.winRateByTier.length > 0 && (
                  <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Award className="h-5 w-5 text-yellow-400" />
                        Analiza Tierów - Rekomendacje AI
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Która jakość sygnału przynosi najlepsze wyniki?
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {aiStats.winRateByTier.map((item: any, idx: number) => {
                          const isRecommended = idx === 0;
                          const tierColors: Record<string, string> = {
                            'Platinum': 'from-purple-600/20 to-purple-900/10 border-purple-500/30',
                            'Premium': 'from-blue-600/20 to-blue-900/10 border-blue-500/30',
                            'Standard': 'from-green-600/20 to-green-900/10 border-green-500/30',
                            'Quick': 'from-orange-600/20 to-orange-900/10 border-orange-500/30',
                            'Emergency': 'from-red-600/20 to-red-900/10 border-red-500/30',
                          };
                          
                          return (
                            <div 
                              key={idx} 
                              className={`p-4 rounded-lg border bg-gradient-to-r ${tierColors[item.tier] || 'from-gray-800/50 to-gray-900/50 border-gray-700'} ${isRecommended ? 'ring-2 ring-purple-500/50' : ''}`}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-bold text-white text-lg">{item.tier}</h3>
                                  {isRecommended && (
                                    <Badge className="bg-purple-600 text-white">
                                      <Sparkles className="h-3 w-3 mr-1" />
                                      Najlepszy
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className={`text-xl font-bold ${item.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {item.totalPnL >= 0 ? '+' : ''}{item.totalPnL.toFixed(2)}
                                  </p>
                                  <p className="text-xs text-gray-300">USDT</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-sm mb-2">
                                <div>
                                  <span className="text-gray-200">Trades:</span>
                                  <span className="ml-2 font-semibold text-white">{item.totalTrades}</span>
                                </div>
                                <div>
                                  <span className="text-gray-200">Win Rate:</span>
                                  <span className="ml-2 font-semibold text-white">{item.winRate.toFixed(1)}%</span>
                                </div>
                                <div>
                                  <span className="text-gray-200">Avg PnL:</span>
                                  <span className={`ml-2 font-semibold ${item.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {item.avgPnL >= 0 ? '+' : ''}{item.avgPnL.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                              <Progress value={item.winRate} className="h-2" />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Win Rate by Confirmation Count */}
                {aiStats.winRateByConfirmation && aiStats.winRateByConfirmation.length > 0 && (
                  <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Zap className="h-5 w-5 text-yellow-400" />
                        Analiza Potwierdzeń - Optymalna Wartość
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Ile potwierdzeń daje najlepsze rezultaty?
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {aiStats.winRateByConfirmation.map((item: any, idx: number) => {
                          const isOptimal = item.winRate === Math.max(...aiStats.winRateByConfirmation.map((i: any) => i.winRate));
                          
                          return (
                            <div key={idx} className={`p-4 rounded-lg bg-gray-800/50 border ${isOptimal ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-gray-700'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-lg font-bold text-white">
                                    {item.confirmationCount} {item.confirmationCount === 1 ? 'Potwierdzenie' : 'Potwierdzenia'}
                                  </h3>
                                  {isOptimal && (
                                    <Badge className="bg-blue-600 text-white">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Optymalny
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className={`text-xl font-bold ${item.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {item.totalPnL >= 0 ? '+' : ''}{item.totalPnL.toFixed(2)} USDT
                                  </p>
                                  <p className="text-sm text-gray-400">{item.totalTrades} trades · {item.winRate.toFixed(1)}% WR</p>
                                </div>
                              </div>
                              <Progress value={item.winRate} className="h-2" />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* PnL by Alert Strength */}
                {aiStats.pnlByStrength && aiStats.pnlByStrength.length > 0 && (
                  <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <TrendUp className="h-5 w-5 text-blue-400" />
                        PnL według Siły Sygnału (Strength)
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Jak siła alertu wpływa na wyniki
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {aiStats.pnlByStrength.map((item: any, idx: number) => (
                          <div key={idx} className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h3 className="text-lg font-bold text-white">Strength: {item.strengthRange}</h3>
                                <p className="text-sm text-gray-400">{item.totalTrades} trades · {item.winRate.toFixed(1)}% WR</p>
                              </div>
                              <div className="text-right">
                                <p className={`text-xl font-bold ${item.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {item.totalPnL >= 0 ? '+' : ''}{item.totalPnL.toFixed(2)} USDT
                                </p>
                                <p className="text-sm text-gray-400">Avg: {item.avgPnL.toFixed(2)}</p>
                              </div>
                            </div>
                            <Progress value={item.winRate} className="h-2" />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Win Rate by Session */}
                {aiStats.winRateBySession && aiStats.winRateBySession.length > 0 && (
                  <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Clock className="h-5 w-5 text-purple-400" />
                        Win Rate według Sesji (NY, London, Asian)
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Najlepsze i najgorsze sesje tradingowe
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {aiStats.winRateBySession.map((item: any, idx: number) => (
                          <div key={idx} className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                            <h3 className="text-lg font-bold text-white mb-2">{item.session}</h3>
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Trades:</span>
                                <span className="text-white font-semibold">{item.totalTrades}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Win Rate:</span>
                                <span className="text-white font-semibold">{item.winRate.toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">PnL:</span>
                                <span className={`font-semibold ${item.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {item.totalPnL >= 0 ? '+' : ''}{item.totalPnL.toFixed(2)}
                                </span>
                              </div>
                              <Progress value={item.winRate} className="h-2 mt-2" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Win Rate by Regime */}
                {aiStats.winRateByRegime && aiStats.winRateByRegime.length > 0 && (
                  <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Activity className="h-5 w-5 text-orange-400" />
                        Win Rate według Reżimu Rynkowego
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Uptrend vs Downtrend vs Sideways
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {aiStats.winRateByRegime.map((item: any, idx: number) => (
                          <div key={idx} className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h3 className="text-lg font-bold text-white">{item.regime}</h3>
                                <p className="text-sm text-gray-400">{item.totalTrades} trades · {item.winRate.toFixed(1)}% WR</p>
                              </div>
                              <div className="text-right">
                                <p className={`text-xl font-bold ${item.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {item.totalPnL >= 0 ? '+' : ''}{item.totalPnL.toFixed(2)} USDT
                                </p>
                              </div>
                            </div>
                            <Progress value={item.winRate} className="h-2" />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* MTF Agreement Analysis */}
                {aiStats.winRateByMTF && aiStats.winRateByMTF.length > 0 && (
                  <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-cyan-400" />
                        Win Rate według MTF Agreement
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Jak zgodność multi-timeframe wpływa na wyniki
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {aiStats.winRateByMTF.map((item: any, idx: number) => (
                          <div key={idx} className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h3 className="text-lg font-bold text-white">MTF: {item.mtfRange}</h3>
                                <p className="text-sm text-gray-400">{item.totalTrades} trades · {item.winRate.toFixed(1)}% WR</p>
                              </div>
                              <div className="text-right">
                                <p className={`text-xl font-bold ${item.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {item.totalPnL >= 0 ? '+' : ''}{item.totalPnL.toFixed(2)} USDT
                                </p>
                              </div>
                            </div>
                            <Progress value={item.winRate} className="h-2" />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Duration Analysis - POPRAWIONY */}
                {aiStats?.durationAnalysis && (
                  <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Clock className="h-5 w-5 text-green-400" />
                        Analiza Czasu Trwania
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Średni czas wygranych vs przegranych
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-green-900/20 border border-green-700">
                          <h3 className="text-sm font-medium text-green-300 mb-2">Wygrane</h3>
                          <p className="text-3xl font-bold text-green-400">
                            {formatDuration(aiStats.durationAnalysis.avgWinDurationMinutes)}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-red-900/20 border border-red-700">
                          <h3 className="text-sm font-medium text-red-300 mb-2">Przegrane</h3>
                          <p className="text-3xl font-bold text-red-400">
                            {formatDuration(aiStats.durationAnalysis.avgLossDurationMinutes)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* TP Hit Stats */}
                {aiStats.tpHitStats && (
                  <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Target className="h-5 w-5 text-yellow-400" />
                        Analiza Osiągania TP
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Rozkład osiągania poziomów Take Profit
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                          <h4 className="text-xs text-gray-400 mb-1">Tylko TP1</h4>
                          <p className="text-2xl font-bold text-white">{aiStats.tpHitStats.tp1Only}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Avg: {aiStats.tpHitStats.avgPnlTp1Only.toFixed(2)} USDT
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                          <h4 className="text-xs text-gray-400 mb-1">TP1 + TP2</h4>
                          <p className="text-2xl font-bold text-white">{aiStats.tpHitStats.tp1AndTp2}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Avg: {aiStats.tpHitStats.avgPnlTp1AndTp2.toFixed(2)} USDT
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                          <h4 className="text-xs text-gray-400 mb-1">Wszystkie TP</h4>
                          <p className="text-2xl font-bold text-white">{aiStats.tpHitStats.allTPs}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Avg: {aiStats.tpHitStats.avgPnlAllTPs.toFixed(2)} USDT
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                          <h4 className="text-xs text-gray-400 mb-1">Bez TP (SL)</h4>
                          <p className="text-2xl font-bold text-white">{aiStats.tpHitStats.noTP}</p>
                          <p className="text-xs text-red-400 mt-1">
                            Avg: {aiStats.tpHitStats.avgPnlNoTP.toFixed(2)} USDT
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Close Reason Distribution */}
                {aiStats.closeReasonDistribution && aiStats.closeReasonDistribution.length > 0 && (
                  <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-400" />
                        Rozkład Przyczyn Zamknięcia
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Dlaczego pozycje zostały zamknięte
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {aiStats.closeReasonDistribution.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                            <div className="flex-1">
                              <h4 className="text-sm font-semibold text-white">{item.closeReason}</h4>
                              <p className="text-xs text-gray-400">
                                {item.count} trades ({item.percentage.toFixed(1)}%)
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`text-lg font-bold ${item.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {item.totalPnL >= 0 ? '+' : ''}{item.totalPnL.toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-400">
                                Avg: {item.avgPnL.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
                <CardContent className="p-12">
                  <div className="text-center">
                    <Brain className="h-16 w-16 mx-auto mb-4 text-gray-600 opacity-50" />
                    <h3 className="text-xl font-bold text-gray-300 mb-2">Brak danych do analizy AI</h3>
                    <p className="text-gray-500">Zamknij kilka pozycji aby zobaczyć zaawansowane statystyki</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Time Statistics */}
          <TabsContent value="time" className="space-y-4">
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">Statystyki Czasowe</CardTitle>
                <CardDescription className="text-gray-200">
                  Wydajność bota w różnych okresach czasu
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {timeStats.map((period, idx) => (
                    <div key={idx} className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-white">{period.period}</h3>
                          <p className="text-sm text-gray-200">{period.totalTrades} trades</p>
                        </div>
                        <Badge 
                          variant={period.totalPnL >= 0 ? "default" : "destructive"}
                          className={period.totalPnL >= 0 ? "bg-green-600" : "bg-red-600"}
                        >
                          {period.totalPnL >= 0 ? '+' : ''}{period.totalPnL.toFixed(2)} USDT
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-200">Win Rate:</span>
                          <span className="font-semibold text-white">{period.winRate.toFixed(1)}%</span>
                        </div>
                        <Progress value={period.winRate} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tier Statistics */}
          <TabsContent value="tiers" className="space-y-4">
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">Statystyki według Tierów</CardTitle>
                <CardDescription className="text-gray-200">
                  Wydajność poszczególnych poziomów sygnałów
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tierStats.length === 0 ? (
                  <div className="text-center py-8">
                    <XCircle className="h-12 w-12 mx-auto mb-3 text-gray-600 opacity-50" />
                    <p className="text-sm text-gray-300">Brak danych o tierach</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tierStats.map((tier, idx) => {
                      const tierColors: Record<string, string> = {
                        'Platinum': 'from-purple-600/20 to-purple-900/10 border-purple-500/30',
                        'Premium': 'from-blue-600/20 to-blue-900/10 border-blue-500/30',
                        'Standard': 'from-green-600/20 to-green-900/10 border-green-500/30',
                        'Quick': 'from-orange-600/20 to-orange-900/10 border-orange-500/30',
                        'Emergency': 'from-red-600/20 to-red-900/10 border-red-500/30',
                      };
                      
                      return (
                        <div 
                          key={idx} 
                          className={`p-4 rounded-lg border bg-gradient-to-r ${tierColors[tier.tier] || 'from-gray-800/50 to-gray-900/50 border-gray-700'}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h3 className="font-bold text-white text-lg">{tier.tier}</h3>
                              <p className="text-sm text-gray-200">{tier.totalTrades} trades</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-xl font-bold ${tier.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {tier.totalPnL >= 0 ? '+' : ''}{tier.totalPnL.toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-300">USDT</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-gray-200">Win Rate:</span>
                              <span className="ml-2 font-semibold text-white">{tier.winRate.toFixed(1)}%</span>
                            </div>
                            <div>
                              <span className="text-gray-200">Avg PnL:</span>
                              <span className={`ml-2 font-semibold ${tier.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {tier.avgPnL >= 0 ? '+' : ''}{tier.avgPnL.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Symbol Statistics */}
          <TabsContent value="symbols" className="space-y-4">
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">Top 10 Symboli</CardTitle>
                <CardDescription className="text-gray-200">
                  Najlepiej i najgorzej performujące instrumenty
                </CardDescription>
              </CardHeader>
              <CardContent>
                {symbolStats.length === 0 ? (
                  <div className="text-center py-8">
                    <XCircle className="h-12 w-12 mx-auto mb-3 text-gray-600 opacity-50" />
                    <p className="text-sm text-gray-300">Brak danych o symbolach</p>
                  </div>
                ) : (
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
                              Avg: {symbol.avgPnL >= 0 ? '+' : ''}{symbol.avgPnL.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Risk Metrics */}
        {stats && (
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white">Metryki Ryzyka</CardTitle>
              <CardDescription className="text-gray-200">
                Analiza ryzyka i drawdown
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-blue-500/20">
                      <Percent className="h-4 w-4 text-blue-400" />
                    </div>
                    <h3 className="font-semibold text-gray-100">Sharpe Ratio</h3>
                  </div>
                  <p className="text-2xl font-bold text-white mb-1">{stats.sharpeRatio.toFixed(2)}</p>
                  <p className="text-xs text-gray-300">
                    {stats.sharpeRatio >= 2 ? '🔥 Doskonały' : stats.sharpeRatio >= 1 ? '✅ Dobry' : stats.sharpeRatio >= 0 ? '⚠️ Średni' : '❌ Słaby'}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-red-500/20">
                      <AlertCircle className="h-4 w-4 text-red-400" />
                    </div>
                    <h3 className="font-semibold text-gray-100">Max Drawdown</h3>
                  </div>
                  <p className="text-2xl font-bold text-red-400 mb-1">
                    -{stats.maxDrawdown.toFixed(2)} USDT
                  </p>
                  <p className="text-xs text-gray-300">Największy spadek z peak</p>
                </div>

                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-orange-500/20">
                      <TrendingDown className="h-4 w-4 text-orange-400" />
                    </div>
                    <h3 className="font-semibold text-gray-100">Current Drawdown</h3>
                  </div>
                  <p className="text-2xl font-bold text-orange-400 mb-1">
                    -{stats.currentDrawdown.toFixed(2)} USDT
                  </p>
                  <p className="text-xs text-gray-300">Aktualny spadek z peak</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-200">Otrzymane Alerty</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">{totalAlerts}</p>
              <p className="text-xs text-gray-300 mt-1">Całkowita liczba alertów z TradingView</p>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-200">Aktywne Pozycje</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">{currentPositions.length}</p>
              <p className="text-xs text-gray-300 mt-1">Obecnie otwarte pozycje bota</p>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-200">Zamknięte Pozycje</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">{historicalPositions.length}</p>
              <p className="text-xs text-gray-300 mt-1">Historyczne, zamknięte pozycje</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Export Dialog */}
      <ExportDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen} />
    </div>
  );
}