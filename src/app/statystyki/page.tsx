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
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

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
  const [stats, setStats] = useState<Stats | null>(null);
  const [tierStats, setTierStats] = useState<TierStats[]>([]);
  const [symbolStats, setSymbolStats] = useState<SymbolStats[]>([]);
  const [timeStats, setTimeStats] = useState<TimeStats[]>([]);

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

      // Fetch alerts
      const alertsRes = await fetch("/api/alerts");
      const alertsData = await alertsRes.json();
      setAlerts(alertsData.success ? alertsData.alerts : []);

      // Calculate statistics
      calculateStatistics(closedPositions, openPositions, alertsData.alerts || []);
    } catch (error) {
      console.error("Failed to fetch statistics data:", error);
    } finally {
      setLoading(false);
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

    // Basic stats
    const totalTrades = closed.length;
    const winningTrades = closed.filter(p => p.pnl > 0).length;
    const losingTrades = closed.filter(p => p.pnl < 0).length;
    const winRate = (winningTrades / totalTrades) * 100;
    
    const totalPnL = closed.reduce((sum, p) => sum + p.pnl, 0);
    const currentUnrealisedPnL = open.reduce((sum, p) => sum + p.unrealisedPnl, 0);
    
    const wins = closed.filter(p => p.pnl > 0);
    const losses = closed.filter(p => p.pnl < 0);
    
    const avgWin = wins.length > 0 ? wins.reduce((sum, p) => sum + p.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, p) => sum + p.pnl, 0) / losses.length) : 0;
    
    const avgHoldingTime = closed.reduce((sum, p) => sum + (p.durationMinutes || 0), 0) / totalTrades;
    
    const pnls = closed.map(p => p.pnl);
    const bestTrade = Math.max(...pnls);
    const worstTrade = Math.min(...pnls);
    
    const totalWins = wins.reduce((sum, p) => sum + p.pnl, 0);
    const totalLosses = Math.abs(losses.reduce((sum, p) => sum + p.pnl, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;
    
    // Calculate Sharpe Ratio (simplified)
    const returns = closed.map(p => p.pnlPercent);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
    
    // Calculate drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnL = 0;
    
    closed.forEach(position => {
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
      totalPnL: totalPnL + currentUnrealisedPnL,
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

    // Calculate tier statistics
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
      winRate: (data.wins / data.total) * 100,
      avgPnL: data.pnl / data.total,
      totalPnL: data.pnl
    })).sort((a, b) => b.totalPnL - a.totalPnL);
    
    setTierStats(tierStatsData);

    // Calculate symbol statistics
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
      winRate: (data.wins / data.total) * 100,
      avgPnL: data.pnl / data.total,
      totalPnL: data.pnl
    })).sort((a, b) => b.totalPnL - a.totalPnL).slice(0, 10); // Top 10
    
    setSymbolStats(symbolStatsData);

    // Calculate time-based statistics
    const now = new Date();
    const last7Days = closed.filter(p => {
      const closedDate = new Date(p.closedAt);
      const diffDays = Math.floor((now.getTime() - closedDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    });
    
    const last30Days = closed.filter(p => {
      const closedDate = new Date(p.closedAt);
      const diffDays = Math.floor((now.getTime() - closedDate.getTime()) / (1000 * 60 * 60 * 24));
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
        totalPnL
      }
    ];
    
    setTimeStats(timeStatsData);
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-400" />
          <p className="text-gray-300">Ładowanie statystyk...</p>
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
              <p className="text-sm text-gray-300">Kompleksowa analiza wydajności tradingowej</p>
            </div>
          </div>
          <Button
            onClick={fetchAllData}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Odśwież
          </Button>
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
                  <Badge variant="outline" className="text-xs text-gray-300">
                    Wszystkie trady
                  </Badge>
                </div>
                <p className="text-3xl font-bold text-white mb-1">{stats.totalTrades}</p>
                <p className="text-sm text-gray-300">Łączna liczba pozycji</p>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="text-green-400">✓ {stats.winningTrades} Win</span>
                  <span className="text-red-400">✗ {stats.losingTrades} Loss</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gradient-to-br from-green-600/10 to-gray-900/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                    <Target className="h-5 w-5 text-green-400" />
                  </div>
                  <Badge variant="outline" className="text-xs text-gray-300">
                    Skuteczność
                  </Badge>
                </div>
                <p className="text-3xl font-bold text-white mb-1">{stats.winRate.toFixed(1)}%</p>
                <p className="text-sm text-gray-300">Win Rate</p>
                <Progress value={stats.winRate} className="mt-3 h-2" />
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gradient-to-br from-purple-600/10 to-gray-900/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
                    <DollarSign className="h-5 w-5 text-purple-400" />
                  </div>
                  <Badge variant="outline" className="text-xs text-gray-300">
                    Zysk/Strata
                  </Badge>
                </div>
                <p className={`text-3xl font-bold mb-1 ${stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)}
                </p>
                <p className="text-sm text-gray-300">USDT Total PnL</p>
                <div className="mt-3 flex items-center gap-3 text-xs">
                  <span className="text-green-400">Avg Win: +{stats.avgWin.toFixed(2)}</span>
                  <span className="text-red-400">Avg Loss: -{stats.avgLoss.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gradient-to-br from-amber-600/10 to-gray-900/80 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                    <Award className="h-5 w-5 text-amber-400" />
                  </div>
                  <Badge variant="outline" className="text-xs text-gray-300">
                    Profit Factor
                  </Badge>
                </div>
                <p className="text-3xl font-bold text-white mb-1">
                  {stats.profitFactor === 999 ? '∞' : stats.profitFactor.toFixed(2)}
                </p>
                <p className="text-sm text-gray-300">Stosunek zysk/strata</p>
                <p className="mt-3 text-xs text-gray-400">
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
                <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
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
                <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
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
                <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Średni Czas Trwania
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
        <Tabs defaultValue="time" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-gray-900/80 backdrop-blur-sm border border-gray-800">
            <TabsTrigger value="time">
              <Calendar className="mr-2 h-4 w-4" />
              Czasowe
            </TabsTrigger>
            <TabsTrigger value="tiers">
              <Award className="mr-2 h-4 w-4" />
              Według Tierów
            </TabsTrigger>
            <TabsTrigger value="symbols">
              <Activity className="mr-2 h-4 w-4" />
              Według Symboli
            </TabsTrigger>
          </TabsList>

          {/* Time Statistics */}
          <TabsContent value="time" className="space-y-4">
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">Statystyki Czasowe</CardTitle>
                <CardDescription className="text-gray-300">
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
                          <p className="text-sm text-gray-300">{period.totalTrades} trades</p>
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
                          <span className="text-gray-300">Win Rate:</span>
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
                <CardDescription className="text-gray-300">
                  Wydajność poszczególnych poziomów sygnałów
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tierStats.length === 0 ? (
                  <div className="text-center py-8">
                    <XCircle className="h-12 w-12 mx-auto mb-3 text-gray-600 opacity-50" />
                    <p className="text-sm text-gray-400">Brak danych o tierach</p>
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
                              <p className="text-sm text-gray-300">{tier.totalTrades} trades</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-xl font-bold ${tier.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {tier.totalPnL >= 0 ? '+' : ''}{tier.totalPnL.toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-400">USDT</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-gray-300">Win Rate:</span>
                              <span className="ml-2 font-semibold text-white">{tier.winRate.toFixed(1)}%</span>
                            </div>
                            <div>
                              <span className="text-gray-300">Avg PnL:</span>
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
                <CardDescription className="text-gray-300">
                  Najlepiej i najgorzej performujące instrumenty
                </CardDescription>
              </CardHeader>
              <CardContent>
                {symbolStats.length === 0 ? (
                  <div className="text-center py-8">
                    <XCircle className="h-12 w-12 mx-auto mb-3 text-gray-600 opacity-50" />
                    <p className="text-sm text-gray-400">Brak danych o symbolach</p>
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
                              <p className="text-xs text-gray-400">{symbol.totalTrades} trades · {symbol.winRate.toFixed(1)}% WR</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-lg font-bold ${symbol.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {symbol.totalPnL >= 0 ? '+' : ''}{symbol.totalPnL.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-400">
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
              <CardDescription className="text-gray-300">
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
                    <h3 className="font-semibold text-gray-200">Sharpe Ratio</h3>
                  </div>
                  <p className="text-2xl font-bold text-white mb-1">{stats.sharpeRatio.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">
                    {stats.sharpeRatio >= 2 ? '🔥 Doskonały' : stats.sharpeRatio >= 1 ? '✅ Dobry' : stats.sharpeRatio >= 0 ? '⚠️ Średni' : '❌ Słaby'}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-red-500/20">
                      <AlertCircle className="h-4 w-4 text-red-400" />
                    </div>
                    <h3 className="font-semibold text-gray-200">Max Drawdown</h3>
                  </div>
                  <p className="text-2xl font-bold text-red-400 mb-1">
                    -{stats.maxDrawdown.toFixed(2)} USDT
                  </p>
                  <p className="text-xs text-gray-400">Największy spadek z peak</p>
                </div>

                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-orange-500/20">
                      <TrendingDown className="h-4 w-4 text-orange-400" />
                    </div>
                    <h3 className="font-semibold text-gray-200">Current Drawdown</h3>
                  </div>
                  <p className="text-2xl font-bold text-orange-400 mb-1">
                    -{stats.currentDrawdown.toFixed(2)} USDT
                  </p>
                  <p className="text-xs text-gray-400">Aktualny spadek z peak</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-300">Otrzymane Alerty</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">{alerts.length}</p>
              <p className="text-xs text-gray-400 mt-1">Całkowita liczba alertów z TradingView</p>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-300">Aktywne Pozycje</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">{currentPositions.length}</p>
              <p className="text-xs text-gray-400 mt-1">Obecnie otwarte pozycje bota</p>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-300">Zamknięte Pozycje</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">{historicalPositions.length}</p>
              <p className="text-xs text-gray-400 mt-1">Historyczne, zamknięte pozycje</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}