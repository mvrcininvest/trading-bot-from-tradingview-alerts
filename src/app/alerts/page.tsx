"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Copy, Trash2, RefreshCw, ArrowUpRight, ArrowDownRight, Filter, Trash, CheckCircle2, XCircle, Send, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [selectedAlert, setSelectedAlert] = useState<AlertData | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  
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
        const errorMsg = data.message || data.error || "Nie udało się wyczyścić alertów";
        toast.error(`❌ ${errorMsg}`);
        console.error("[Cleanup Error]", data);
      }
    } catch (error) {
      console.error("[Cleanup Error]", error);
      const errorMsg = error instanceof Error ? error.message : "Błąd czyszczenia alertów";
      toast.error(`❌ ${errorMsg}`);
    } finally {
      setCleaningOld(false);
    }
  };

  const testWebhook = async () => {
    setTestingWebhook(true);
    try {
      const response = await fetch("/api/webhook/tradingview");
      const data = await response.json();
      
      if (data.status === 'online') {
        setWebhookStatus('online');
        toast.success("Webhook działa poprawnie!");
      } else {
        setWebhookStatus('offline');
        toast.error("Webhook nie odpowiada");
      }
    } catch (error) {
      setWebhookStatus('offline');
      toast.error("Nie można połączyć z webhook");
    } finally {
      setTestingWebhook(false);
    }
  };

  const sendTestAlert = async () => {
    try {
      const testAlertData = {
        symbol: "BTCUSDT",
        side: "BUY",
        tier: "Standard",
        tierNumeric: 3,
        strength: 0.75,
        entryPrice: 50000,
        sl: 49500,
        tp1: 50500,
        tp2: 51000,
        tp3: 51500,
        mainTp: 50500,
        atr: 250,
        volumeRatio: 1.5,
        session: "London",
        regime: "Bullish",
        regimeConfidence: 0.8,
        mtfAgreement: 0.75,
        leverage: 10,
        inOb: true,
        inFvg: false,
        obScore: 0.9,
        fvgScore: 0.6,
        institutionalFlow: 0.7,
        accumulation: 0.65,
        volumeClimax: false,
        latency: 150,
        timestamp: Math.floor(Date.now() / 1000)
      };

      toast.info("Wysyłam testowy alert...");
      
      const response = await fetch("/api/webhook/tradingview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testAlertData)
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Response error:", text);
        toast.error(`❌ Błąd HTTP ${response.status}: ${text.substring(0, 100)}`);
        return;
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        const text = await response.text();
        console.error("JSON parse error:", text);
        toast.error(`❌ Błąd parsowania odpowiedzi: ${text.substring(0, 100)}`);
        return;
      }
      
      if (result.success) {
        toast.success(`✅ Alert testowy zapisany! ID: ${result.alert_id}`);
        setTimeout(() => fetchAlerts(), 1000);
      } else {
        toast.error(`❌ Błąd: ${result.error || result.message || "Nieznany błąd"}`);
      }
    } catch (error) {
      console.error("Test alert error:", error);
      toast.error(`❌ Błąd sieci: ${error instanceof Error ? error.message : "Nieznany błąd"}`);
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
              <p className="text-gray-200">Odbieraj i zarządzaj sygnałami z wskaźnika ICT/SMC</p>
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
            <Button onClick={fetchAlerts} disabled={loading} size="sm" variant="outline" className="border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-200">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Odśwież
            </Button>
          </div>
        </div>

        {/* Webhook URL Card */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <span>URL Webhook</span>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={sendTestAlert}
                  size="sm" 
                  variant="outline"
                  className="border-green-700 bg-green-900/20 hover:bg-green-900/40 text-green-300"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Wyślij testowy alert
                </Button>
                <Button 
                  onClick={testWebhook} 
                  disabled={testingWebhook}
                  size="sm" 
                  variant="outline"
                  className="border-blue-700 bg-blue-900/20 hover:bg-blue-900/40 text-blue-300"
                >
                  {testingWebhook ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : webhookStatus === 'online' ? (
                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-400" />
                  ) : webhookStatus === 'offline' ? (
                    <XCircle className="h-4 w-4 mr-2 text-red-400" />
                  ) : null}
                  Testuj Webhook
                </Button>
              </div>
            </CardTitle>
            <CardDescription className="text-gray-300">Wklej ten URL w alertach TradingView</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-gray-800/60 border border-gray-700 rounded-md text-sm font-mono overflow-x-auto text-gray-200">
                {webhookUrl}
              </code>
              <Button onClick={copyWebhookUrl} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                <Copy className="h-4 w-4 mr-2" />
                Kopiuj
              </Button>
            </div>
            
            {webhookStatus === 'online' && (
              <div className="flex items-center gap-2 text-green-300 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>Webhook jest online i gotowy do odbierania alertów z TradingView</span>
              </div>
            )}
            
            {webhookStatus === 'offline' && (
              <div className="flex items-center gap-2 text-red-300 text-sm">
                <XCircle className="h-4 w-4" />
                <span>Webhook nie odpowiada - sprawdź logi serwera</span>
              </div>
            )}

            <div className="text-xs text-gray-200 space-y-1 border-t border-gray-800 pt-3">
              <p className="font-semibold text-gray-100">📋 Konfiguracja w TradingView:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2 text-gray-200">
                <li>Otwórz wykres z twoim wskaźnikiem ICT/SMC</li>
                <li>Dodaj alert (Alt+A lub kliknij ikonę zegara)</li>
                <li>W sekcji "Notifications" zaznacz <strong className="text-white">"Webhook URL"</strong></li>
                <li>Wklej powyższy URL webhook</li>
                <li>W polu "Message" wstaw JSON z twojego wskaźnika (wszystkie pola: symbol, side, tier, entryPrice, sl, tp1, tp2, tp3, itp.)</li>
                <li>Zapisz alert - od teraz każdy sygnał będzie automatycznie przesyłany do bota</li>
              </ol>
              <p className="text-amber-300 font-semibold mt-2">⚡ Ważne: Upewnij się, że Message w TradingView zawiera prawidłowy JSON ze wszystkimi wymaganymi polami!</p>
            </div>
          </CardContent>
        </Card>

        {/* Statystyki */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Łącznie alertów</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Sygnały KUPNA</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-400">{stats.buy}</div>
            </CardContent>
          </Card>
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Sygnały SPRZEDAŻY</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-400">{stats.sell}</div>
            </CardContent>
          </Card>
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Śr. Opóźnienie</CardDescription>
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
                <label className="text-sm font-medium text-gray-200">Tier</label>
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
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
                <label className="text-sm font-medium text-gray-200">Symbol</label>
                <Select value={symbolFilter} onValueChange={setSymbolFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
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
                <label className="text-sm font-medium text-gray-200">Strona</label>
                <Select value={sideFilter} onValueChange={setSideFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
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
                <label className="text-sm font-medium text-gray-200">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
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
                className="mt-4 text-gray-200 hover:text-white"
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
                <span className="text-sm font-normal text-gray-300 ml-2">
                  (pokazuje {filteredAlerts.length} z {stats.total})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-gray-500" />
                <p className="text-gray-300">Ładowanie alertów...</p>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-300">
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
                      <th className="text-left p-3 font-semibold text-gray-200">Czas otrzymania</th>
                      <th className="text-left p-3 font-semibold text-gray-200">Symbol</th>
                      <th className="text-left p-3 font-semibold text-gray-200">Strona</th>
                      <th className="text-left p-3 font-semibold text-gray-200">Tier</th>
                      <th className="text-left p-3 font-semibold text-gray-200">Siła</th>
                      <th className="text-left p-3 font-semibold text-gray-200">Ceny</th>
                      <th className="text-left p-3 font-semibold text-gray-200">SL/TP</th>
                      <th className="text-left p-3 font-semibold text-gray-200">Status wykonania</th>
                      <th className="text-left p-3 font-semibold text-gray-200">Latencja</th>
                      <th className="text-left p-3 font-semibold text-gray-200">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map((alert) => (
                      <tr key={alert.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                        {/* Czas */}
                        <td className="p-3 text-sm">
                          <div className="font-mono text-xs font-semibold text-gray-100">
                            {formatReceivedTime(alert.createdAt)}
                          </div>
                          <div className="text-xs text-gray-400">
                            TV: {formatTimestamp(alert.timestamp)}
                          </div>
                        </td>

                        {/* Symbol */}
                        <td className="p-3">
                          <div className="font-bold text-white">{alert.symbol}</div>
                          <div className="text-xs text-gray-300">{alert.session}</div>
                        </td>

                        {/* Strona */}
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            className={alert.side === 'BUY' ? 'border-green-500 text-green-300 bg-green-500/10' : 'border-red-500 text-red-300 bg-red-500/10'}
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
                          <div className="text-xs text-gray-300 mt-1">
                            Leverage: {alert.leverage}x
                          </div>
                        </td>

                        {/* Siła */}
                        <td className="p-3">
                          <div className="font-semibold text-white">
                            {(alert.strength * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-300">
                            {alert.regime}
                          </div>
                        </td>

                        {/* Ceny */}
                        <td className="p-3 text-sm">
                          <div className="text-gray-200">Entry: <span className="font-semibold text-white">{formatPrice(alert.entryPrice)}</span></div>
                          <div className="text-xs text-gray-300">
                            ATR: {alert.atr.toFixed(2)}
                          </div>
                        </td>

                        {/* SL/TP */}
                        <td className="p-3 text-sm">
                          <div className="text-red-300">SL: {formatPrice(alert.sl)}</div>
                          <div className="text-green-300">
                            TP1: {formatPrice(alert.tp1)}
                          </div>
                          <div className="text-xs text-gray-300">
                            TP3: {formatPrice(alert.tp3)}
                          </div>
                        </td>

                        {/* Status wykonania */}
                        <td className="p-3">
                          <Badge variant="outline" className={getStatusColor(alert.executionStatus)}>
                            {getStatusLabel(alert.executionStatus)}
                          </Badge>
                          {alert.rejectionReason && (
                            <div className="text-xs text-red-300 mt-1">
                              {getRejectionReasonLabel(alert.rejectionReason)}
                            </div>
                          )}
                        </td>

                        {/* Latencja */}
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            className={alert.latency < 1000 ? 'border-green-500 text-green-300' : alert.latency < 3000 ? 'border-yellow-500 text-yellow-300' : 'border-red-500 text-red-300'}
                          >
                            {alert.latency}ms
                          </Badge>
                        </td>

                        {/* Akcje */}
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button
                              onClick={() => {
                                setSelectedAlert(alert);
                                setDetailsDialogOpen(true);
                              }}
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-blue-500/20"
                            >
                              <Info className="h-4 w-4 text-blue-400" />
                            </Button>
                            <Button
                              onClick={() => deleteAlert(alert.id)}
                              disabled={deletingId === alert.id}
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-red-500/20"
                            >
                              <Trash2 className={`h-4 w-4 text-red-400 ${deletingId === alert.id ? 'animate-spin' : ''}`} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alert Details Dialog */}
        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Info className="h-6 w-6 text-blue-400" />
                Szczegóły Alertu #{selectedAlert?.id}
              </DialogTitle>
              <DialogDescription className="text-gray-300">
                Pełne informacje o otrzymanym alercie z TradingView
              </DialogDescription>
            </DialogHeader>
            
            {selectedAlert && (
              <div className="space-y-4 py-4">
                {/* Podstawowe informacje */}
                <Card className="bg-gray-800/60 border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-white">📊 Podstawowe Informacje</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Symbol:</span>
                        <span className="font-bold text-white">{selectedAlert.symbol}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Strona:</span>
                        <Badge variant="outline" className={selectedAlert.side === 'BUY' ? 'border-green-500 text-green-300' : 'border-red-500 text-red-300'}>
                          {selectedAlert.side}
                        </Badge>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Tier:</span>
                        <Badge className={getTierColor(selectedAlert.tier)}>{selectedAlert.tier}</Badge>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Tier Numeric:</span>
                        <span className="font-bold text-white">{selectedAlert.tierNumeric}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Siła:</span>
                        <span className="font-bold text-white">{(selectedAlert.strength * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Leverage:</span>
                        <span className="font-bold text-white">{selectedAlert.leverage}x</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Sesja:</span>
                        <span className="font-bold text-white">{selectedAlert.session}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Latencja:</span>
                        <Badge variant="outline" className={selectedAlert.latency < 1000 ? 'border-green-500 text-green-300' : 'border-yellow-500 text-yellow-300'}>
                          {selectedAlert.latency}ms
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Ceny i SL/TP */}
                <Card className="bg-gray-800/60 border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-white">💰 Ceny i Stop Loss / Take Profit</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex justify-between p-2 rounded bg-blue-900/20 border border-blue-700/30">
                        <span className="text-gray-300">Entry Price:</span>
                        <span className="font-bold text-white">{selectedAlert.entryPrice.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-red-900/20 border border-red-700/30">
                        <span className="text-gray-300">Stop Loss:</span>
                        <span className="font-bold text-red-300">{selectedAlert.sl.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-green-900/20 border border-green-700/30">
                        <span className="text-gray-300">TP1:</span>
                        <span className="font-bold text-green-300">{selectedAlert.tp1.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-green-900/20 border border-green-700/30">
                        <span className="text-gray-300">TP2:</span>
                        <span className="font-bold text-green-300">{selectedAlert.tp2.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-green-900/20 border border-green-700/30">
                        <span className="text-gray-300">TP3:</span>
                        <span className="font-bold text-green-300">{selectedAlert.tp3.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-green-900/20 border border-green-700/30">
                        <span className="text-gray-300">Main TP:</span>
                        <span className="font-bold text-green-300">{selectedAlert.mainTp.toFixed(4)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Wskaźniki techniczne */}
                <Card className="bg-gray-800/60 border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-white">📈 Wskaźniki Techniczne</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">ATR:</span>
                        <span className="font-bold text-white">{selectedAlert.atr.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Volume Ratio:</span>
                        <span className="font-bold text-white">{selectedAlert.volumeRatio.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Regime:</span>
                        <span className="font-bold text-white">{selectedAlert.regime}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Regime Confidence:</span>
                        <span className="font-bold text-white">{(selectedAlert.regimeConfidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">MTF Agreement:</span>
                        <span className="font-bold text-white">{(selectedAlert.mtfAgreement * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">Volume Climax:</span>
                        <Badge variant={selectedAlert.volumeClimax ? "default" : "outline"}>
                          {selectedAlert.volumeClimax ? "TAK" : "NIE"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ICT/SMC Struktury */}
                <Card className="bg-gray-800/60 border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-white">🎯 ICT/SMC Struktury</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">W Order Block:</span>
                        <Badge variant={selectedAlert.inOb ? "default" : "outline"} className={selectedAlert.inOb ? "bg-green-600" : ""}>
                          {selectedAlert.inOb ? "✓ TAK" : "✗ NIE"}
                        </Badge>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">OB Score:</span>
                        <span className="font-bold text-white">{(selectedAlert.obScore * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">W Fair Value Gap:</span>
                        <Badge variant={selectedAlert.inFvg ? "default" : "outline"} className={selectedAlert.inFvg ? "bg-green-600" : ""}>
                          {selectedAlert.inFvg ? "✓ TAK" : "✗ NIE"}
                        </Badge>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-900/50">
                        <span className="text-gray-300">FVG Score:</span>
                        <span className="font-bold text-white">{(selectedAlert.fvgScore * 100).toFixed(1)}%</span>
                      </div>
                      {selectedAlert.institutionalFlow !== null && (
                        <div className="flex justify-between p-2 rounded bg-gray-900/50">
                          <span className="text-gray-300">Institutional Flow:</span>
                          <span className="font-bold text-white">{(selectedAlert.institutionalFlow * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      {selectedAlert.accumulation !== null && (
                        <div className="flex justify-between p-2 rounded bg-gray-900/50">
                          <span className="text-gray-300">Accumulation:</span>
                          <span className="font-bold text-white">{(selectedAlert.accumulation * 100).toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Status wykonania */}
                <Card className="bg-gray-800/60 border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-white">⚡ Status Wykonania</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded bg-gray-900/50">
                      <span className="text-gray-300">Status:</span>
                      <Badge variant="outline" className={getStatusColor(selectedAlert.executionStatus)}>
                        {getStatusLabel(selectedAlert.executionStatus)}
                      </Badge>
                    </div>
                    {selectedAlert.rejectionReason && (
                      <div className="p-3 rounded bg-red-900/20 border border-red-700/30">
                        <div className="text-xs text-gray-300 mb-1">Powód odrzucenia:</div>
                        <div className="text-sm font-semibold text-red-300">
                          {getRejectionReasonLabel(selectedAlert.rejectionReason)}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between p-3 rounded bg-gray-900/50">
                      <span className="text-gray-300">Czas otrzymania:</span>
                      <span className="font-mono text-xs text-white">{formatReceivedTime(selectedAlert.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded bg-gray-900/50">
                      <span className="text-gray-300">Timestamp TradingView:</span>
                      <span className="font-mono text-xs text-white">{formatTimestamp(selectedAlert.timestamp)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Raw JSON */}
                <Card className="bg-gray-800/60 border-gray-700">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-white">📄 Raw JSON z TradingView</CardTitle>
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedAlert.rawJson);
                          toast.success("JSON skopiowany!");
                        }}
                        size="sm"
                        variant="outline"
                        className="border-gray-600 text-gray-200 hover:bg-gray-800"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Kopiuj
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="p-4 rounded bg-gray-900/80 border border-gray-700 overflow-x-auto text-xs font-mono text-gray-200">
                      {JSON.stringify(JSON.parse(selectedAlert.rawJson), null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}