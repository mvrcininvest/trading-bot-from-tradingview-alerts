"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, ArrowLeft, TrendingUp, TrendingDown, Activity, Filter } from "lucide-react";
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
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  stopLoss: number;
  tp1Price: number | null;
  tp2Price: number | null;
  tp3Price: number | null;
  mainTpPrice: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  currentSl: number;
  positionValue: number;
  initialMargin: number;
  realisedPnl: number;
  confirmationCount: number;
  confidenceScore: number;
  openedAt: string;
  closedAt: string;
  durationMinutes: number;
  closeReason: string;
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
      // Fetch position history
      const positionsResponse = await fetch("/api/bot/history");
      const positionsData = await positionsResponse.json();

      if (positionsData.success && Array.isArray(positionsData.positions)) {
        setPositions(positionsData.positions);
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
    profitable: positions.filter((p) => p.realisedPnl > 0).length,
    losses: positions.filter((p) => p.realisedPnl < 0).length,
    totalPnl: positions.reduce((sum, p) => sum + p.realisedPnl, 0),
    winRate:
      positions.length > 0
        ? (positions.filter((p) => p.realisedPnl > 0).length / positions.length) * 100
        : 0,
  };

  // Filter positions
  const filteredPositions = positions.filter((p) => {
    if (filter === "profitable" && p.realisedPnl <= 0) return false;
    if (filter === "loss" && p.realisedPnl >= 0) return false;
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <History className="h-8 w-8" />
            <div>
              <h1 className="text-3xl font-bold">Historia Bota</h1>
              <p className="text-muted-foreground">
                Zamknięte pozycje i działania bota tradingowego
              </p>
            </div>
          </div>
          <Button onClick={fetchHistory} disabled={loading}>
            <History className="mr-2 h-4 w-4" />
            Odśwież
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Łącznie Transakcji</CardDescription>
              <CardTitle className="text-3xl">{stats.totalTrades}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Zyskowne</CardDescription>
              <CardTitle className="text-3xl text-green-500 flex items-center gap-2">
                <TrendingUp className="h-6 w-6" />
                {stats.profitable}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Stratne</CardDescription>
              <CardTitle className="text-3xl text-red-500 flex items-center gap-2">
                <TrendingDown className="h-6 w-6" />
                {stats.losses}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Win Rate</CardDescription>
              <CardTitle className="text-3xl">{stats.winRate.toFixed(1)}%</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Łączny PnL</CardDescription>
              <CardTitle
                className={`text-3xl ${stats.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}
              >
                {stats.totalPnl >= 0 ? "+" : ""}
                {stats.totalPnl.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
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
              >
                Wyczyść Filtry
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Typ Wyniku</label>
                <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                  <SelectTrigger>
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
                <label className="text-sm font-medium mb-2 block">Powód Zamknięcia</label>
                <Select value={closeReasonFilter} onValueChange={setCloseReasonFilter}>
                  <SelectTrigger>
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Zamknięte Pozycje
              <Badge variant="secondary">{filteredPositions.length}</Badge>
            </CardTitle>
            <CardDescription>
              Historia wszystkich zamkniętych pozycji bota
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="text-center py-8">
                <Activity className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Ładowanie historii...</p>
              </div>
            )}

            {!loading && filteredPositions.length === 0 && (
              <div className="text-center py-8">
                <History className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Brak zamkniętych pozycji spełniających kryteria filtrowania.
                </p>
              </div>
            )}

            {!loading && filteredPositions.length > 0 && (
              <div className="space-y-3">
                {filteredPositions.map((position) => {
                  const isProfitable = position.realisedPnl > 0;
                  const pnlPercent =
                    position.initialMargin !== 0
                      ? (position.realisedPnl / position.initialMargin) * 100
                      : 0;

                  // Tier colors
                  const tierColors: Record<string, string> = {
                    Platinum: "bg-purple-500/10 text-purple-500 border-purple-500/50",
                    Premium: "bg-blue-500/10 text-blue-500 border-blue-500/50",
                    Standard: "bg-green-500/10 text-green-500 border-green-500/50",
                    Quick: "bg-orange-500/10 text-orange-500 border-orange-500/50",
                    Emergency: "bg-red-500/10 text-red-500 border-red-500/50",
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
                            {position.realisedPnl.toFixed(4)} USDT
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
                          <div className="font-semibold">{position.exitPrice.toFixed(4)}</div>
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
                        {position.tp1Price && (
                          <Badge
                            variant={position.tp1Hit ? "default" : "outline"}
                            className={position.tp1Hit ? "bg-green-500" : ""}
                          >
                            TP1 {position.tp1Hit ? "✓" : "✗"}
                          </Badge>
                        )}
                        {position.tp2Price && (
                          <Badge
                            variant={position.tp2Hit ? "default" : "outline"}
                            className={position.tp2Hit ? "bg-green-500" : ""}
                          >
                            TP2 {position.tp2Hit ? "✓" : "✗"}
                          </Badge>
                        )}
                        {position.tp3Price && (
                          <Badge
                            variant={position.tp3Hit ? "default" : "outline"}
                            className={position.tp3Hit ? "bg-green-500" : ""}
                          >
                            TP3 {position.tp3Hit ? "✓" : "✗"}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Confidence: {(position.confidenceScore * 100).toFixed(0)}%</span>
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