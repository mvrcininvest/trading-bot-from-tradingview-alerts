"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Copy, Trash2, RefreshCw, ArrowUpRight, ArrowDownRight, Filter, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AlertData {
  id: number;
  timestamp: number;
  symbol: string;
  side: string;
  tier: string;
  tierNumeric: number;
  strength: number;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  mainTp: number;
  atr: number;
  volumeRatio: number;
  session: string;
  regime: string;
  regimeConfidence: number;
  mtfAgreement: number;
  leverage: number;
  inOb: boolean;
  inFvg: boolean;
  obScore: number;
  fvgScore: number;
  institutionalFlow: number | null;
  accumulation: number | null;
  volumeClimax: boolean | null;
  latency: number;
  rawJson: string;
  executionStatus: string;
  rejectionReason: string | null;
  createdAt: string;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, buy: 0, sell: 0, avgLatency: 0 });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [cleaningOld, setCleaningOld] = useState(false);
  
  // Filtry
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [symbols, setSymbols] = useState<string[]>([]);

  const webhookUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/api/webhook/tradingview`
    : "";

  const fetchAlerts = async () => {
    try {
      const response = await fetch("/api/alerts");
      const data = await response.json();
      
      if (data.success) {
        setAlerts(data.alerts);
        
        // Oblicz statystyki
        const total = data.alerts.length;
        const buy = data.alerts.filter((a: AlertData) => a.side === "BUY").length;
        const sell = data.alerts.filter((a: AlertData) => a.side === "SELL").length;
        const avgLatency = total > 0 
          ? data.alerts.reduce((acc: number, a: AlertData) => acc + (a.latency || 0), 0) / total 
          : 0;
        
        setStats({ total, buy, sell, avgLatency: Math.round(avgLatency) });
        
        // Type-safe symbol extraction
        const symbolsArray = data.alerts.map((a: AlertData) => a.symbol) as string[];
        const uniqueSymbols = Array.from(new Set(symbolsArray)).sort();
        setSymbols(uniqueSymbols);
      }
    } catch (error) {
      console.error("Błąd pobierania alertów:", error);
      toast.error("Nie udało się pobrać alertów");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL webhook skopiowany!");
  };

  const deleteAlert = async (id: number) => {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      const data = await response.json();
      
      if (data.success) {
        toast.success("Alert usunięty");
        fetchAlerts();
      }
    } catch (error) {
      toast.error("Nie udało się usunąć alertu");
    } finally {
      setDeletingId(null);
    }
  };

  const cleanOldAlerts = async () => {
    setCleaningOld(true);
    try {
      const response = await fetch("/api/alerts/cleanup", { method: "DELETE" });
      const data = await response.json();
      
      if (data.success) {
        toast.success(data.message);
        fetchAlerts();
      } else {
        toast.error("Nie udało się wyczyścić alertów");
      }
    } catch (error) {
      toast.error("Błąd czyszczenia alertów");
    } finally {
      setCleaningOld(false);
    }
  };

  // Filtrowanie alertów
  const filteredAlerts = alerts.filter(alert => {
    if (tierFilter !== "all" && alert.tier !== tierFilter) return false;
    if (symbolFilter !== "all" && alert.symbol !== symbolFilter) return false;
    if (sideFilter !== "all" && alert.side !== sideFilter) return false;
    if (statusFilter !== "all" && alert.executionStatus !== statusFilter) return false;
    return true;
  });

  const getTierColor = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'platinum': return 'bg-yellow-500';
      case 'premium': return 'bg-purple-500';
      case 'standard': return 'bg-blue-500';
      case 'quick': return 'bg-orange-500';
      case 'emergency': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executed': return 'bg-green-500/20 text-green-400 border-green-500/40';
      case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/40';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'executed': return '✓ Wykonany';
      case 'rejected': return '✗ Odrzucony';
      case 'pending': return '⏳ Oczekuje';
      default: return status;
    }
  };

  const getRejectionReasonLabel = (reason: string | null) => {
    if (!reason) return null;
    
    const reasons: Record<string, string> = {
      'bot_settings_not_configured': 'Brak konfiguracji bota',
      'bot_disabled': 'Bot wyłączony',
      'tier_disabled': 'Tier wyłączony',
      'same_symbol_position_exists': 'Pozycja już istnieje',
      'opposite_direction_ignored': 'Przeciwny kierunek zignorowany',
      'failed_to_close_opposite_position': 'Błąd zamykania pozycji',
      'no_sl_tp_provided': 'Brak SL/TP',
      'exchange_error': 'Błąd giełdy',
    };
    
    return reasons[reason] || reason;
  };

  const formatPrice = (price: number) => {
    return price.toFixed(2);
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('pl-PL');
  };

  const formatReceivedTime = (createdAt: string) => {
    return new Date(createdAt).toLocaleString('pl-PL');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-600/30 to-amber-900/20 border border-amber-500/30">
              <Bell className="h-8 w-8 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Alerty TradingView
              </h1>
              <p className="text-gray-400">Odbieraj i zarządzaj sygnałami z wskaźnika ICT/SMC</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={cleanOldAlerts} 
              disabled={cleaningOld}
              size="sm" 
              variant="outline" 
              className="border-red-700 bg-red-900/20 hover:bg-red-900/40 text-red-300"
            >
              <Trash className={`mr-2 h-4 w-4 ${cleaningOld ? "animate-spin" : ""}`} />
              Wyczyść stare
            </Button>
            <Button onClick={fetchAlerts} disabled={loading} size="sm" variant="outline" className="border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-300">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Odśwież
            </Button>
          </div>
        </div>

        {/* Webhook URL Card */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">URL Webhook</CardTitle>
            <CardDescription className="text-gray-500">Wklej ten URL w alertach TradingView</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-gray-800/60 border border-gray-700 rounded-md text-sm font-mono overflow-x-auto text-gray-300">
                {webhookUrl}
              </code>
              <Button onClick={copyWebhookUrl} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Copy className="h-4 w-4 mr-2" />
                Kopiuj
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              ⚠️ Ważne: TradingView wymaga portu 80 lub 443. Użyj ngrok lub wdróż aplikację na serwer.
            </p>
          </CardContent>
        </Card>

        {/* Statystyki */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-500">Łącznie alertów</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-500">Sygnały BUY</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-400">{stats.buy}</div>
            </CardContent>
          </Card>
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-500">Sygnały SELL</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-400">{stats.sell}</div>
            </CardContent>
          </Card>
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-500">Śr. Latencja</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{stats.avgLatency}ms</div>
            </CardContent>
          </Card>
        </div>

        {/* Filtry */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Filter className="h-5 w-5" />
              Filtry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Tier</label>
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                    <SelectValue placeholder="Wszystkie tiery" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    <SelectItem value="Platinum">Platinum</SelectItem>
                    <SelectItem value="Premium">Premium</SelectItem>
                    <SelectItem value="Standard">Standard</SelectItem>
                    <SelectItem value="Quick">Quick</SelectItem>
                    <SelectItem value="Emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Symbol</label>
                <Select value={symbolFilter} onValueChange={setSymbolFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                    <SelectValue placeholder="Wszystkie symbole" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    {symbols.map(symbol => (
                      <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Strona</label>
                <Select value={sideFilter} onValueChange={setSideFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                    <SelectValue placeholder="Wszystkie strony" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                    <SelectValue placeholder="Wszystkie statusy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    <SelectItem value="executed">Wykonane</SelectItem>
                    <SelectItem value="rejected">Odrzucone</SelectItem>
                    <SelectItem value="pending">Oczekujące</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {(tierFilter !== "all" || symbolFilter !== "all" || sideFilter !== "all" || statusFilter !== "all") && (
              <Button 
                onClick={() => {
                  setTierFilter("all");
                  setSymbolFilter("all");
                  setSideFilter("all");
                  setStatusFilter("all");
                }}
                variant="ghost"
                size="sm"
                className="mt-4 text-gray-400 hover:text-white"
              >
                Wyczyść filtry
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Tabela Alertów */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">
              Lista Alertów 
              {filteredAlerts.length !== stats.total && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  (pokazuje {filteredAlerts.length} z {stats.total})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-gray-600" />
                <p className="text-gray-500">Ładowanie alertów...</p>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-500">
                  {alerts.length === 0 
                    ? "Brak alertów. Skonfiguruj webhook w TradingView aby zacząć odbierać sygnały."
                    : "Brak alertów pasujących do filtrów."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left p-3 font-semibold text-gray-400">Czas otrzymania</th>
                      <th className="text-left p-3 font-semibold text-gray-400">Symbol</th>
                      <th className="text-left p-3 font-semibold text-gray-400">Strona</th>
                      <th className="text-left p-3 font-semibold text-gray-400">Tier</th>
                      <th className="text-left p-3 font-semibold text-gray-400">Siła</th>
                      <th className="text-left p-3 font-semibold text-gray-400">Ceny</th>
                      <th className="text-left p-3 font-semibold text-gray-400">SL/TP</th>
                      <th className="text-left p-3 font-semibold text-gray-400">Status wykonania</th>
                      <th className="text-left p-3 font-semibold text-gray-400">Latencja</th>
                      <th className="text-left p-3 font-semibold text-gray-400">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map((alert) => (
                      <tr key={alert.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                        {/* Czas */}
                        <td className="p-3 text-sm">
                          <div className="font-mono text-xs font-semibold text-gray-300">
                            {formatReceivedTime(alert.createdAt)}
                          </div>
                          <div className="text-xs text-gray-600">
                            TV: {formatTimestamp(alert.timestamp)}
                          </div>
                        </td>

                        {/* Symbol */}
                        <td className="p-3">
                          <div className="font-bold text-white">{alert.symbol}</div>
                          <div className="text-xs text-gray-500">{alert.session}</div>
                        </td>

                        {/* Strona */}
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            className={alert.side === 'BUY' ? 'border-green-500 text-green-400 bg-green-500/10' : 'border-red-500 text-red-400 bg-red-500/10'}
                          >
                            {alert.side === 'BUY' ? (
                              <ArrowUpRight className="mr-1 h-3 w-3" />
                            ) : (
                              <ArrowDownRight className="mr-1 h-3 w-3" />
                            )}
                            {alert.side}
                          </Badge>
                        </td>

                        {/* Tier */}
                        <td className="p-3">
                          <Badge className={getTierColor(alert.tier)}>
                            {alert.tier}
                          </Badge>
                          <div className="text-xs text-gray-500 mt-1">
                            Leverage: {alert.leverage}x
                          </div>
                        </td>

                        {/* Siła */}
                        <td className="p-3">
                          <div className="font-semibold text-white">
                            {(alert.strength * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-500">
                            {alert.regime}
                          </div>
                        </td>

                        {/* Ceny */}
                        <td className="p-3 text-sm">
                          <div className="text-gray-300">Entry: <span className="font-semibold text-white">{formatPrice(alert.entryPrice)}</span></div>
                          <div className="text-xs text-gray-500">
                            ATR: {alert.atr.toFixed(2)}
                          </div>
                        </td>

                        {/* SL/TP */}
                        <td className="p-3 text-sm">
                          <div className="text-red-400">SL: {formatPrice(alert.sl)}</div>
                          <div className="text-green-400">
                            TP1: {formatPrice(alert.tp1)}
                          </div>
                          <div className="text-xs text-gray-500">
                            TP3: {formatPrice(alert.tp3)}
                          </div>
                        </td>

                        {/* Status wykonania */}
                        <td className="p-3">
                          <Badge variant="outline" className={getStatusColor(alert.executionStatus)}>
                            {getStatusLabel(alert.executionStatus)}
                          </Badge>
                          {alert.rejectionReason && (
                            <div className="text-xs text-red-400 mt-1">
                              {getRejectionReasonLabel(alert.rejectionReason)}
                            </div>
                          )}
                        </td>

                        {/* Latencja */}
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            className={alert.latency < 1000 ? 'border-green-500 text-green-400' : alert.latency < 3000 ? 'border-yellow-500 text-yellow-400' : 'border-red-500 text-red-400'}
                          >
                            {alert.latency}ms
                          </Badge>
                        </td>

                        {/* Akcje */}
                        <td className="p-3">
                          <Button
                            onClick={() => deleteAlert(alert.id)}
                            disabled={deletingId === alert.id}
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 hover:bg-red-500/20"
                          >
                            <Trash2 className={`h-4 w-4 text-red-400 ${deletingId === alert.id ? 'animate-spin' : ''}`} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}