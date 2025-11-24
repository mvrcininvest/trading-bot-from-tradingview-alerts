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
  Sparkles,
  Filter,
  CheckCircle2,
  Wallet,
  Database
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ExportDialog } from "@/components/ExportDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// ✅ NOWY: Interfejs dla statystyk z Bybit
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
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  tradingVolume: number;
  avgHoldingTime: number;
  openPositionsCount: number;
  openPositions: Array<{
    symbol: string;
    side: string;
    size: number;
    leverage: number;
    unrealisedPnl: number;
    entryPrice: number;
    markPrice: number;
  }>;
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

// ✅ ZACHOWANE: Interfejsy dla AI stats (pozostają bez zmian)
// ... keep existing AI stats interfaces ...

export default function StatystykiPage() {
  const [loading, setLoading] = useState(true);
  const [bybitStats, setBybitStats] = useState<BybitStats | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [aiStats, setAiStats] = useState<any>(null);
  const [loadingAiStats, setLoadingAiStats] = useState(false);
  const [aiTimeRange, setAiTimeRange] = useState<string>("all");
  const [bybitTimeRange, setBybitTimeRange] = useState<string>("90");

  useEffect(() => {
    fetchBybitStats();
  }, [bybitTimeRange]);

  // ✅ NOWA FUNKCJA: Pobierz statystyki z Bybit
  const fetchBybitStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics/bybit-stats?days=${bybitTimeRange}`);
      const data = await response.json();

      if (data.success) {
        setBybitStats(data.stats);
        console.log(`[Statystyki] ✅ Załadowano statystyki z Bybit (${bybitTimeRange} dni)`);
      } else {
        toast.error(`❌ Błąd: ${data.message}`);
      }
    } catch (error) {
      console.error("Failed to fetch Bybit stats:", error);
      toast.error("❌ Błąd pobierania statystyk z Bybit");
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

  // ✅ POPRAWIONY FORMAT CZASU
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
          <p className="text-gray-200">Ładowanie statystyk z Bybit...</p>
        </div>
      </div>
    );
  }

  if (!bybitStats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6 flex items-center justify-center">
        <Card className="max-w-md border-red-800 bg-red-900/30">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
            <p className="text-red-200">Nie udało się załadować statystyk</p>
            <Button onClick={fetchBybitStats} className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              Spróbuj ponownie
            </Button>
          </CardContent>
        </Card>
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
              <Database className="h-8 w-8 text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Statystyki z Bybit API
              </h1>
              <p className="text-sm text-gray-200">Dane live z giełdy Bybit</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={bybitTimeRange} onValueChange={setBybitTimeRange}>
              <SelectTrigger className="w-[160px] bg-gray-800 border-gray-700 text-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="7" className="text-gray-300">Ostatnie 7 dni</SelectItem>
                <SelectItem value="30" className="text-gray-300">Ostatnie 30 dni</SelectItem>
                <SelectItem value="90" className="text-gray-300">Ostatnie 90 dni</SelectItem>
                <SelectItem value="180" className="text-gray-300">Ostatnie 180 dni</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => setExportDialogOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Download className="mr-2 h-4 w-4" />
              Eksportuj
            </Button>
            <Button
              onClick={fetchBybitStats}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Odśwież
            </Button>
          </div>
        </div>

        {/* ✅ NOWE: Metryki konta z Bybit */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-gray-800 bg-gradient-to-br from-green-600/10 to-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                  <Wallet className="h-5 w-5 text-green-400" />
                </div>
                <Badge variant="outline" className="text-xs text-gray-200">
                  Bybit Live
                </Badge>
              </div>
              <p className="text-3xl font-bold text-white mb-1">{bybitStats.totalEquity.toFixed(2)}</p>
              <p className="text-sm text-gray-200">Total Equity (USDT)</p>
              <div className="mt-3 text-xs text-gray-300">
                Dostępne: {bybitStats.availableBalance.toFixed(2)} USDT
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gradient-to-br from-amber-600/10 to-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                  <DollarSign className="h-5 w-5 text-amber-400" />
                </div>
                <Badge variant="outline" className="text-xs text-gray-200">
                  Całkowity
                </Badge>
              </div>
              <p className={`text-3xl font-bold mb-1 ${bybitStats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {bybitStats.totalPnL >= 0 ? '+' : ''}{bybitStats.totalPnL.toFixed(2)}
              </p>
              <p className="text-sm text-gray-200">Total PnL (USDT)</p>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="text-green-400">Real: +{bybitStats.realisedPnL.toFixed(2)}</span>
                <span className="text-blue-400">Unreal: {bybitStats.unrealisedPnL >= 0 ? '+' : ''}{bybitStats.unrealisedPnL.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gradient-to-br from-blue-600/10 to-gray-900/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                  <Activity className="h-5 w-5 text-blue-400" />
                </div>
                <Badge variant="outline" className="text-xs text-gray-200">
                  Wolumen
                </Badge>
              </div>
              <p className="text-3xl font-bold text-white mb-1">{bybitStats.tradingVolume.toFixed(0)}</p>
              <p className="text-sm text-gray-200">Trading Volume (USDT)</p>
              <div className="mt-3 text-xs text-gray-300">
                Otwarte pozycje: {bybitStats.openPositionsCount}
              </div>
            </CardContent>
          </Card>
        </div>

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
              <p className="text-3xl font-bold text-white mb-1">{bybitStats.totalTrades}</p>
              <p className="text-sm text-gray-200">Łącznie pozycji</p>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-green-400">✓ {bybitStats.winningTrades}</span>
                <span className="text-red-400">✗ {bybitStats.losingTrades}</span>
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
              <p className="text-3xl font-bold text-white mb-1">{bybitStats.winRate.toFixed(1)}%</p>
              <p className="text-sm text-gray-200">Win Rate</p>
              <Progress value={bybitStats.winRate} className="mt-3 h-2" />
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
              <p className="text-2xl font-bold text-green-400 mb-1">+{bybitStats.avgWin.toFixed(2)}</p>
              <p className="text-sm text-gray-200">Średni Zysk</p>
              <div className="mt-3 text-xs">
                <span className="text-red-400">Średnia strata: -{bybitStats.avgLoss.toFixed(2)}</span>
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
                {bybitStats.profitFactor === 999 ? '∞' : bybitStats.profitFactor.toFixed(2)}
              </p>
              <p className="text-sm text-gray-200">Profit Factor</p>
              <p className="mt-3 text-xs text-gray-300">
                {bybitStats.profitFactor >= 2 ? '🔥 Doskonały' : bybitStats.profitFactor >= 1.5 ? '✅ Dobry' : bybitStats.profitFactor >= 1 ? '⚠️ Średni' : '❌ Słaby'}
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
                +{bybitStats.bestTrade.toFixed(2)} USDT
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
                {bybitStats.worstTrade.toFixed(2)} USDT
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
                {formatDuration(bybitStats.avgHoldingTime)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Statistics Tabs */}
        <Tabs defaultValue="time" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-gray-900/80 backdrop-blur-sm border border-gray-800">
            <TabsTrigger value="time" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-200 text-gray-300">
              <Calendar className="mr-2 h-4 w-4" />
              Czasowe
            </TabsTrigger>
            <TabsTrigger value="symbols" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-200 text-gray-300">
              <Activity className="mr-2 h-4 w-4" />
              Symbole
            </TabsTrigger>
            <TabsTrigger value="ai" className="data-[state=active]:bg-purple-600/30 data-[state=active]:text-purple-200 text-gray-300">
              <Brain className="mr-2 h-4 w-4" />
              Analiza AI
            </TabsTrigger>
          </TabsList>

          {/* Time Statistics */}
          <TabsContent value="time" className="space-y-4">
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">Statystyki Czasowe (z Bybit)</CardTitle>
                <CardDescription className="text-gray-300">
                  Wydajność w różnych okresach czasu
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-white">Ostatnie 7 dni</h3>
                        <p className="text-sm text-gray-200">{bybitStats.last7Days.totalTrades} trades</p>
                      </div>
                      <Badge 
                        variant={bybitStats.last7Days.totalPnL >= 0 ? "default" : "destructive"}
                        className={bybitStats.last7Days.totalPnL >= 0 ? "bg-green-600" : "bg-red-600"}
                      >
                        {bybitStats.last7Days.totalPnL >= 0 ? '+' : ''}{bybitStats.last7Days.totalPnL.toFixed(2)} USDT
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-200">Win Rate:</span>
                        <span className="font-semibold text-white">{bybitStats.last7Days.winRate.toFixed(1)}%</span>
                      </div>
                      <Progress value={bybitStats.last7Days.winRate} className="h-2" />
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-white">Ostatnie 30 dni</h3>
                        <p className="text-sm text-gray-200">{bybitStats.last30Days.totalTrades} trades</p>
                      </div>
                      <Badge 
                        variant={bybitStats.last30Days.totalPnL >= 0 ? "default" : "destructive"}
                        className={bybitStats.last30Days.totalPnL >= 0 ? "bg-green-600" : "bg-red-600"}
                      >
                        {bybitStats.last30Days.totalPnL >= 0 ? '+' : ''}{bybitStats.last30Days.totalPnL.toFixed(2)} USDT
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-200">Win Rate:</span>
                        <span className="font-semibold text-white">{bybitStats.last30Days.winRate.toFixed(1)}%</span>
                      </div>
                      <Progress value={bybitStats.last30Days.winRate} className="h-2" />
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-gray-800 bg-gray-900/50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-white">Całość (ostatnie {bybitTimeRange} dni)</h3>
                        <p className="text-sm text-gray-200">{bybitStats.totalTrades} trades</p>
                      </div>
                      <Badge 
                        variant={bybitStats.realisedPnL >= 0 ? "default" : "destructive"}
                        className={bybitStats.realisedPnL >= 0 ? "bg-green-600" : "bg-red-600"}
                      >
                        {bybitStats.realisedPnL >= 0 ? '+' : ''}{bybitStats.realisedPnL.toFixed(2)} USDT
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-200">Win Rate:</span>
                        <span className="font-semibold text-white">{bybitStats.winRate.toFixed(1)}%</span>
                      </div>
                      <Progress value={bybitStats.winRate} className="h-2" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Symbol Statistics */}
          <TabsContent value="symbols" className="space-y-4">
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">Top 15 Symboli (z Bybit)</CardTitle>
                <CardDescription className="text-gray-300">
                  Najlepiej performujące instrumenty według PnL
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {bybitStats.symbolStats.map((symbol, idx) => (
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
          </TabsContent>

          {/* AI Analysis Tab - ✅ ZACHOWANE BEZ ZMIAN */}
          <TabsContent value="ai" className="space-y-4">
            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">Analiza AI</CardTitle>
                <CardDescription className="text-gray-400">
                  Zaawansowana analiza wymaga danych z lokalnej bazy - użyj zakładki /bot-history do analizy AI
                </CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ✅ NOWE: Otwarte pozycje z Bybit */}
        {bybitStats.openPositions.length > 0 && (
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Otwarte Pozycje (Live z Bybit)
                <Badge variant="secondary" className="bg-gray-700 text-gray-200">
                  {bybitStats.openPositions.length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-gray-300">
                Aktualne pozycje na giełdzie Bybit
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {bybitStats.openPositions.map((pos, idx) => {
                  const isProfitable = pos.unrealisedPnl > 0;
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        isProfitable
                          ? "border-green-500/20 bg-green-500/5"
                          : "border-red-500/20 bg-red-500/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-white">{pos.symbol}</span>
                            <Badge
                              variant={pos.side === "Buy" ? "default" : "secondary"}
                              className={pos.side === "Buy" ? "bg-green-500" : "bg-red-500"}
                            >
                              {pos.side} {pos.leverage}x
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-300">
                            Rozmiar: {pos.size.toFixed(4)} | Wejście: {pos.entryPrice.toFixed(4)} | Obecna: {pos.markPrice.toFixed(4)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xl font-bold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfitable ? '+' : ''}{pos.unrealisedPnl.toFixed(2)} USDT
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Export Dialog */}
      <ExportDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen} />
    </div>
  );
}