"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, TrendingUp, TrendingDown, Activity, Filter } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface HistoryPosition {
  id: number;
  positionId: number;
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
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  confirmationCount: number;
  openedAt: string;
  closedAt: string;
  durationMinutes: number;
}

interface BotAction {
  id: number;
  action: string;
  symbol: string | null;
  side: string | null;
  details: any;
  success: boolean;
  createdAt: string;
}

export default function BotHistoryPage() {
  const router = useRouter();
  const [positions, setPositions] = useState<HistoryPosition[]>([]);
  const [actions, setActions] = useState<BotAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "profitable" | "loss">("all");
  const [closeReasonFilter, setCloseReasonFilter] = useState<string>("all");

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // Fetch position history with OKX history included
      const positionsResponse = await fetch("/api/bot/history?includeOkxHistory=true");
      const positionsData = await positionsResponse.json();

      if (positionsData.success && Array.isArray(positionsData.history)) {
        setPositions(positionsData.history);
      }

      // Fetch bot actions
      const actionsResponse = await fetch("/api/bot/actions");
      const actionsData = await actionsResponse.json();

      if (actionsData.success && Array.isArray(actionsData.actions)) {
        setActions(actionsData.actions);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const stats = {
    totalTrades: positions.length,
    profitable: positions.filter((p) => p.pnl > 0).length,
    losses: positions.filter((p) => p.pnl < 0).length,
    totalPnl: positions.reduce((sum, p) => sum + p.pnl, 0),
    winRate:
      positions.length > 0
        ? (positions.filter((p) => p.pnl > 0).length / positions.length) * 100
        : 0,
  };

  // Filter positions
  const filteredPositions = positions.filter((p) => {
    if (filter === "profitable" && p.pnl <= 0) return false;
    if (filter === "loss" && p.pnl >= 0) return false;
    if (closeReasonFilter !== "all" && p.closeReason !== closeReasonFilter) return false;
    return true;
  });

  // Get unique close reasons
  const closeReasons = Array.from(new Set(positions.map((p) => p.closeReason)));

  // Close reason labels
  const closeReasonLabels: Record<string, string> = {
    sl_hit: "Stop Loss",
    tp_main_hit: "Take Profit",
    tp1_hit: "TP1 Osiągnięty",
    tp2_hit: "TP2 Osiągnięty",
    tp3_hit: "TP3 Osiągnięty",
    emergency_override: "Emergency Override",
    opposite_direction: "Przeciwny Kierunek",
    manual_close: "Zamknięcie Ręczne",
    auto_sync: "Auto Sync (zamknięte na giełdzie)",
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
                Historia Bota
              </h1>
              <p className="text-gray-400">
                Zamknięte pozycje i działania bota tradingowego
              </p>
            </div>
          </div>
          <Button onClick={fetchHistory} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
            <History className="mr-2 h-4 w-4" />
            Odśwież
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-500">Łącznie Transakcji</CardDescription>
              <CardTitle className="text-3xl text-white">{stats.totalTrades}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-500">Zyskowne</CardDescription>
              <CardTitle className="text-3xl text-green-400 flex items-center gap-2">
                <TrendingUp className="h-6 w-6" />
                {stats.profitable}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-500">Stratne</CardDescription>
              <CardTitle className="text-3xl text-red-400 flex items-center gap-2">
                <TrendingDown className="h-6 w-6" />
                {stats.losses}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-500">Win Rate</CardDescription>
              <CardTitle className="text-3xl text-white">{stats.winRate.toFixed(1)}%</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-500">Łączny PnL</CardDescription>
              <CardTitle
                className={`text-3xl ${stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {stats.totalPnl >= 0 ? "+" : ""}
                {stats.totalPnl.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-white">
                <Filter className="h-5 w-5" />
                Filtry
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter("all");
                  setCloseReasonFilter("all");
                }}
                className="border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-300"
              >
                Wyczyść Filtry
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block text-gray-300">Typ Wyniku</label>
                <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    <SelectItem value="profitable">Tylko Zyskowne</SelectItem>
                    <SelectItem value="loss">Tylko Stratne</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block text-gray-300">Powód Zamknięcia</label>
                <Select value={closeReasonFilter} onValueChange={setCloseReasonFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    {closeReasons.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {closeReasonLabels[reason] || reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Closed Positions */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Activity className="h-5 w-5" />
              Zamknięte Pozycje
              <Badge variant="secondary" className="bg-gray-700 text-gray-300">{filteredPositions.length}</Badge>
            </CardTitle>
            <CardDescription className="text-gray-500">
              Historia wszystkich zamkniętych pozycji bota
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="text-center py-8">
                <Activity className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-600" />
                <p className="text-sm text-gray-500">Ładowanie historii...</p>
              </div>
            )}

            {!loading && filteredPositions.length === 0 && (
              <div className="text-center py-8">
                <History className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-gray-500">
                  Brak zamkniętych pozycji spełniających kryteria filtrowania.
                </p>
              </div>
            )}

            {!loading && filteredPositions.length > 0 && (
              <div className="space-y-3">
                {filteredPositions.map((position) => {
                  const isProfitable = position.pnl > 0;
                  const pnlPercent = position.pnlPercent;

                  // Tier colors
                  const tierColors: Record<string, string> = {
                    Platinum: "bg-purple-500/10 text-purple-400 border-purple-500/50",
                    Premium: "bg-blue-500/10 text-blue-400 border-blue-500/50",
                    Standard: "bg-green-500/10 text-green-400 border-green-500/50",
                    Quick: "bg-orange-500/10 text-orange-400 border-orange-500/50",
                    Emergency: "bg-red-500/10 text-red-400 border-red-500/50",
                  };

                  return (
                    <div
                      key={position.id}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        isProfitable
                          ? "border-green-500/20 bg-green-500/5"
                          : "border-red-500/20 bg-red-500/5"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg">{position.symbol}</span>
                            <Badge variant="outline" className={tierColors[position.tier] || ""}>
                              {position.tier}
                            </Badge>
                            <Badge
                              variant={position.side === "BUY" ? "default" : "secondary"}
                              className={
                                position.side === "BUY"
                                  ? "bg-green-500"
                                  : "bg-red-500"
                              }
                            >
                              {position.side === "BUY" ? "LONG" : "SHORT"} {position.leverage}x
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {closeReasonLabels[position.closeReason] || position.closeReason}
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`text-xl font-bold ${
                              isProfitable ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {isProfitable ? "+" : ""}
                            {position.pnl.toFixed(4)} USDT
                          </div>
                          <div
                            className={`text-sm font-semibold ${
                              isProfitable ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            ({isProfitable ? "+" : ""}
                            {pnlPercent.toFixed(2)}%)
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                        <div>
                          <div className="text-muted-foreground">Wejście</div>
                          <div className="font-semibold">{position.entryPrice.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Wyjście</div>
                          <div className="font-semibold">{position.closePrice.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Rozmiar</div>
                          <div className="font-semibold">{position.quantity.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Czas Trwania</div>
                          <div className="font-semibold">
                            {position.durationMinutes < 60
                              ? `${position.durationMinutes}m`
                              : `${Math.floor(position.durationMinutes / 60)}h ${
                                  position.durationMinutes % 60
                                }m`}
                          </div>
                        </div>
                      </div>

                      {/* TP Status */}
                      <div className="flex items-center gap-2 text-xs mb-2">
                        <span className="text-muted-foreground">Take Profit:</span>
                        <Badge
                          variant={position.tp1Hit ? "default" : "outline"}
                          className={position.tp1Hit ? "bg-green-500" : ""}
                        >
                          TP1 {position.tp1Hit ? "✓" : "✗"}
                        </Badge>
                        <Badge
                          variant={position.tp2Hit ? "default" : "outline"}
                          className={position.tp2Hit ? "bg-green-500" : ""}
                        >
                          TP2 {position.tp2Hit ? "✓" : "✗"}
                        </Badge>
                        <Badge
                          variant={position.tp3Hit ? "default" : "outline"}
                          className={position.tp3Hit ? "bg-green-500" : ""}
                        >
                          TP3 {position.tp3Hit ? "✓" : "✗"}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Confirmations: {position.confirmationCount}</span>
                        <span>
                          {new Date(position.openedAt).toLocaleString("pl-PL")} →{" "}
                          {new Date(position.closedAt).toLocaleString("pl-PL")}
                        </span>
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