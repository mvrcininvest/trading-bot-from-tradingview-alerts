"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Copy, Trash2, RefreshCw, ArrowUpRight, ArrowDownRight, Filter } from "lucide-react";
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
  createdAt: string;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, buy: 0, sell: 0, avgLatency: 0 });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  
  // Filtry
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<string>("all");
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
        
        // Wyciągnij unikalne symbole z explicit typing
        const symbolSet = new Set<string>(data.alerts.map((a: AlertData) => a.symbol));
        const uniqueSymbols: string[] = Array.from(symbolSet).sort();
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

  // Filtrowanie alertów
  const filteredAlerts = alerts.filter(alert => {
    if (tierFilter !== "all" && alert.tier !== tierFilter) return false;
    if (symbolFilter !== "all" && alert.symbol !== symbolFilter) return false;
    if (sideFilter !== "all" && alert.side !== sideFilter) return false;
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

  const formatPrice = (price: number) => {
    return price.toFixed(2);
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('pl-PL');
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-8 w-8" />
            <div>
              <h1 className="text-3xl font-bold">Alerty TradingView</h1>
              <p className="text-muted-foreground">Odbieraj i zarządzaj sygnałami z wskaźnika ICT/SMC</p>
            </div>
          </div>
          <Button onClick={fetchAlerts} disabled={loading} size="sm" variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Odśwież
          </Button>
        </div>

        {/* Webhook URL Card */}
        <Card>
          <CardHeader>
            <CardTitle>URL Webhook</CardTitle>
            <CardDescription>Wklej ten URL w alertach TradingView</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-muted rounded-md text-sm font-mono overflow-x-auto">
                {webhookUrl}
              </code>
              <Button onClick={copyWebhookUrl} size="sm">
                <Copy className="h-4 w-4 mr-2" />
                Kopiuj
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ⚠️ Ważne: TradingView wymaga portu 80. Użyj ngrok lub wdróż aplikację na serwer.
            </p>
          </CardContent>
        </Card>

        {/* Statystyki */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Łącznie alertów</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sygnały BUY</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-500">{stats.buy}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sygnały SELL</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-500">{stats.sell}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Śr. Latencja</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.avgLatency}ms</div>
            </CardContent>
          </Card>
        </div>

        {/* Filtry */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tier</label>
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger>
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
                <label className="text-sm font-medium">Symbol</label>
                <Select value={symbolFilter} onValueChange={setSymbolFilter}>
                  <SelectTrigger>
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
                <label className="text-sm font-medium">Strona</label>
                <Select value={sideFilter} onValueChange={setSideFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wszystkie strony" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {(tierFilter !== "all" || symbolFilter !== "all" || sideFilter !== "all") && (
              <Button 
                onClick={() => {
                  setTierFilter("all");
                  setSymbolFilter("all");
                  setSideFilter("all");
                }}
                variant="ghost"
                size="sm"
                className="mt-4"
              >
                Wyczyść filtry
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Tabela Alertów */}
        <Card>
          <CardHeader>
            <CardTitle>
              Lista Alertów 
              {filteredAlerts.length !== stats.total && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (pokazuje {filteredAlerts.length} z {stats.total})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Ładowanie alertów...</p>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {alerts.length === 0 
                    ? "Brak alertów. Skonfiguruj webhook w TradingView aby zacząć odbierać sygnały."
                    : "Brak alertów pasujących do filtrów."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Czas</th>
                      <th className="text-left p-3 font-semibold">Symbol</th>
                      <th className="text-left p-3 font-semibold">Strona</th>
                      <th className="text-left p-3 font-semibold">Tier</th>
                      <th className="text-left p-3 font-semibold">Siła</th>
                      <th className="text-left p-3 font-semibold">Ceny</th>
                      <th className="text-left p-3 font-semibold">SL/TP</th>
                      <th className="text-left p-3 font-semibold">Status</th>
                      <th className="text-left p-3 font-semibold">Latencja</th>
                      <th className="text-left p-3 font-semibold">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map((alert) => (
                      <tr key={alert.id} className="border-b hover:bg-muted/50 transition-colors">
                        {/* Czas */}
                        <td className="p-3 text-sm">
                          <div className="font-mono text-xs">
                            {formatTimestamp(alert.timestamp)}
                          </div>
                        </td>

                        {/* Symbol */}
                        <td className="p-3">
                          <div className="font-bold">{alert.symbol}</div>
                          <div className="text-xs text-muted-foreground">{alert.session}</div>
                        </td>

                        {/* Strona */}
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            className={alert.side === 'BUY' ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}
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
                          <div className="text-xs text-muted-foreground mt-1">
                            Leverage: {alert.leverage}x
                          </div>
                        </td>

                        {/* Siła */}
                        <td className="p-3">
                          <div className="font-semibold">
                            {(alert.strength * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {alert.regime}
                          </div>
                        </td>

                        {/* Ceny */}
                        <td className="p-3 text-sm">
                          <div>Entry: <span className="font-semibold">{formatPrice(alert.entryPrice)}</span></div>
                          <div className="text-xs text-muted-foreground">
                            ATR: {alert.atr.toFixed(2)}
                          </div>
                        </td>

                        {/* SL/TP */}
                        <td className="p-3 text-sm">
                          <div className="text-red-500">SL: {formatPrice(alert.sl)}</div>
                          <div className="text-green-500">
                            TP1: {formatPrice(alert.tp1)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            TP3: {formatPrice(alert.tp3)}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="p-3">
                          <div className="space-y-1">
                            {alert.inOb && (
                              <Badge variant="secondary" className="text-xs">
                                OB {alert.obScore.toFixed(1)}
                              </Badge>
                            )}
                            {alert.inFvg && (
                              <Badge variant="secondary" className="text-xs">
                                FVG {alert.fvgScore.toFixed(1)}
                              </Badge>
                            )}
                            {alert.institutionalFlow && alert.institutionalFlow > 0.4 && (
                              <Badge variant="outline" className="text-xs">
                                INST
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Latencja */}
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            className={alert.latency < 1000 ? 'border-green-500' : alert.latency < 3000 ? 'border-yellow-500' : 'border-red-500'}
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
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className={`h-4 w-4 text-red-500 ${deletingId === alert.id ? 'animate-spin' : ''}`} />
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