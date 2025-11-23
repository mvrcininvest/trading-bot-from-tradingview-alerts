"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Bell, 
  RefreshCw,
  Zap,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Radio,
  BarChart3
} from "lucide-react";

interface LiveAlert {
  id: number;
  timestamp: number;
  symbol: string;
  side: string;
  tier: string;
  strength: number;
  entryPrice: number;
  session: string;
  regime: string;
  mtfAgreement: number;
  latency: number;
  executionStatus: string;
  rejectionReason: string | null;
  createdAt: string;
}

interface LivePosition {
  id: number;
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  currentPrice: number;
  unrealisedPnl: number;
  unrealisedPnlPercent: number;
  leverage: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  openedAt: string;
  durationMinutes: number;
}

export default function LiveMonitoringPage() {
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLiveData = async () => {
    try {
      // Fetch recent alerts (last 20)
      const alertsRes = await fetch("/api/alerts");
      const alertsData = await alertsRes.json();
      
      if (alertsData.success) {
        setAlerts(alertsData.alerts.slice(0, 20));
      }
      
      // Fetch active positions
      const positionsRes = await fetch("/api/bot/positions");
      const positionsData = await positionsRes.json();
      
      if (positionsData.success) {
        setPositions(positionsData.positions);
      }
      
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to fetch live data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchLiveData, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getTimeSinceUpdate = () => {
    const seconds = Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  const getTierColor = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'platinum': return 'bg-purple-500';
      case 'premium': return 'bg-blue-500';
      case 'standard': return 'bg-green-500';
      case 'quick': return 'bg-orange-500';
      case 'emergency': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executed': return 'bg-green-500/20 text-green-400 border-green-500/40';
      case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/40';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/40';
    }
  };

  const stats = {
    activePositions: positions.length,
    totalUnrealisedPnL: positions.reduce((sum, p) => sum + p.unrealisedPnl, 0),
    recentAlerts: alerts.length,
    executedAlerts: alerts.filter(a => a.executionStatus === 'executed').length,
    rejectedAlerts: alerts.filter(a => a.executionStatus === 'rejected').length,
    avgLatency: alerts.length > 0 
      ? Math.round(alerts.reduce((sum, a) => sum + a.latency, 0) / alerts.length)
      : 0
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-green-600/30 to-green-900/20 border border-green-500/30 relative">
              <Radio className="h-8 w-8 text-green-400" />
              {autoRefresh && (
                <span className="absolute top-0 right-0 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
              )}
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Live Monitoring
              </h1>
              <p className="text-gray-200">Real-time alerts and position tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right mr-4">
              <div className="text-sm text-gray-300">Last Update</div>
              <div className="text-xs text-gray-500">{getTimeSinceUpdate()}</div>
            </div>
            <Button
              onClick={() => setAutoRefresh(!autoRefresh)}
              variant={autoRefresh ? "default" : "outline"}
              className={autoRefresh ? "bg-green-600 hover:bg-green-700" : "border-gray-700"}
            >
              <Activity className={`mr-2 h-4 w-4 ${autoRefresh ? "animate-pulse" : ""}`} />
              {autoRefresh ? "Auto" : "Manual"}
            </Button>
            <Button
              onClick={fetchLiveData}
              disabled={loading}
              variant="outline"
              className="border-gray-700"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Real-time Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Target className="h-5 w-5 text-blue-400" />
                <Badge variant="outline" className="text-xs text-gray-200">Live</Badge>
              </div>
              <div className="text-2xl font-bold text-white">{stats.activePositions}</div>
              <div className="text-xs text-gray-300">Active Positions</div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <BarChart3 className="h-5 w-5 text-purple-400" />
                <Badge variant="outline" className="text-xs text-gray-200">Real-time</Badge>
              </div>
              <div className={`text-2xl font-bold ${stats.totalUnrealisedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.totalUnrealisedPnL >= 0 ? '+' : ''}{stats.totalUnrealisedPnL.toFixed(2)}
              </div>
              <div className="text-xs text-gray-300">Unrealised PnL</div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Bell className="h-5 w-5 text-amber-400" />
                <Badge variant="outline" className="text-xs text-gray-200">Last 20</Badge>
              </div>
              <div className="text-2xl font-bold text-white">{stats.recentAlerts}</div>
              <div className="text-xs text-gray-300">Recent Alerts</div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="h-5 w-5 text-green-400" />
                <Badge variant="outline" className="text-xs text-gray-200">Executed</Badge>
              </div>
              <div className="text-2xl font-bold text-green-400">{stats.executedAlerts}</div>
              <div className="text-xs text-gray-300">Executed</div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingDown className="h-5 w-5 text-red-400" />
                <Badge variant="outline" className="text-xs text-gray-200">Rejected</Badge>
              </div>
              <div className="text-2xl font-bold text-red-400">{stats.rejectedAlerts}</div>
              <div className="text-xs text-gray-300">Rejected</div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                <Badge variant="outline" className="text-xs text-gray-200">Avg</Badge>
              </div>
              <div className="text-2xl font-bold text-white">{stats.avgLatency}ms</div>
              <div className="text-xs text-gray-300">Latency</div>
            </CardContent>
          </Card>
        </div>

        {/* Active Positions */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-400" />
                  Active Positions (Live PnL)
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Real-time position tracking with unrealised PnL
                </CardDescription>
              </div>
              {autoRefresh && (
                <Badge variant="outline" className="border-green-500 text-green-400">
                  <Activity className="h-3 w-3 mr-1 animate-pulse" />
                  Live
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {positions.length === 0 ? (
              <div className="text-center py-12">
                <Target className="h-12 w-12 mx-auto mb-4 text-gray-600 opacity-50" />
                <p className="text-gray-300">No active positions</p>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((position) => {
                  const isProfitable = position.unrealisedPnl > 0;
                  
                  return (
                    <div
                      key={position.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        isProfitable
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-red-500/30 bg-red-500/5"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-white">{position.symbol}</span>
                            <Badge className={getTierColor(position.tier)}>
                              {position.tier}
                            </Badge>
                            <Badge variant={position.side === "Buy" ? "default" : "secondary"}
                              className={position.side === "Buy" ? "bg-green-500" : "bg-red-500"}>
                              {position.side === "Buy" ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                              {position.side === "Buy" ? "LONG" : "SHORT"} {position.leverage}x
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-200">
                            Open for {Math.floor(position.durationMinutes / 60)}h {position.durationMinutes % 60}m
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`text-xl font-bold ${
                              isProfitable ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {isProfitable ? "+" : ""}
                            {position.unrealisedPnl.toFixed(4)} USDT
                          </div>
                          <div
                            className={`text-sm font-semibold ${
                              isProfitable ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            ({isProfitable ? "+" : ""}
                            {position.unrealisedPnlPercent.toFixed(2)}%)
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-gray-300">Entry</div>
                          <div className="font-semibold text-white">{position.entryPrice.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-gray-300">Current</div>
                          <div className="font-semibold text-white">{position.currentPrice.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-gray-300">Stop Loss</div>
                          <div className="font-semibold text-red-400">{position.stopLoss.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-gray-300">Take Profits</div>
                          <div className="font-semibold text-green-400 text-xs">
                            {position.takeProfit1.toFixed(2)} / {position.takeProfit2.toFixed(2)} / {position.takeProfit3.toFixed(2)}
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

        {/* Recent Alerts Stream */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Bell className="h-5 w-5 text-amber-400" />
                  Recent Alerts Stream
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Last 20 alerts received from TradingView
                </CardDescription>
              </div>
              {autoRefresh && (
                <Badge variant="outline" className="border-green-500 text-green-400">
                  <Activity className="h-3 w-3 mr-1 animate-pulse" />
                  Streaming
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="h-12 w-12 mx-auto mb-4 text-gray-600 opacity-50" />
                <p className="text-gray-300">No recent alerts</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert, idx) => {
                  const isRecent = idx < 3;
                  
                  return (
                    <div
                      key={alert.id}
                      className={`p-3 rounded-lg border transition-all ${
                        isRecent ? "border-amber-500/40 bg-amber-500/5" : "border-gray-800 bg-gray-900/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isRecent && (
                            <Badge variant="outline" className="border-amber-500 text-amber-400">
                              NEW
                            </Badge>
                          )}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-white">{alert.symbol}</span>
                              <Badge variant={alert.side === 'BUY' ? "default" : "secondary"}
                                className={alert.side === 'BUY' ? "bg-green-500" : "bg-red-500"}>
                                {alert.side}
                              </Badge>
                              <Badge className={getTierColor(alert.tier)}>{alert.tier}</Badge>
                            </div>
                            <div className="text-xs text-gray-400">
                              {new Date(alert.createdAt).toLocaleString('pl-PL')} ·
                              {alert.session} · {alert.regime} ·
                              Strength: {(alert.strength * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-sm font-semibold text-white">{alert.entryPrice.toFixed(2)}</div>
                            <Badge variant="outline" className={alert.latency < 1000 ? 'border-green-500 text-green-300 text-xs' : 'border-yellow-500 text-yellow-300 text-xs'}>
                              {alert.latency}ms
                            </Badge>
                          </div>
                          <Badge variant="outline" className={getStatusColor(alert.executionStatus)}>
                            {alert.executionStatus === 'executed' ? '✓' : '✗'} {alert.executionStatus}
                          </Badge>
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
