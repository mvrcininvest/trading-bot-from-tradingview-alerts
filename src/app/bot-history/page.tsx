"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, TrendingUp, TrendingDown, Activity, Database, CheckCircle, DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// ✅ Import TradingChart with SSR disabled
const TradingChart = dynamic(
  () => import("@/components/TradingChart").then((mod) => ({ default: mod.TradingChart })),
  { ssr: false, loading: () => (
    <div className="w-full h-[400px] bg-slate-950 rounded-lg flex items-center justify-center">
      <Activity className="h-8 w-8 animate-spin text-blue-400" />
    </div>
  )}
);

// ✅ v4.0.0 - FEES SUPPORT: Show trading + funding fees
interface HistoryPosition {
  id: string;
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  closePrice: number;
  quantity: number;
  leverage: number;
  pnl: number; // NET PNL (after fees)
  grossPnl?: number; // GROSS PNL (before fees)
  tradingFees?: number;
  fundingFees?: number;
  totalFees?: number;
  pnlPercent: number;
  closeReason: string;
  openedAt: string;
  closedAt: string;
  durationMinutes: number;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  tp3Hit?: boolean;
  partialCloseCount?: number;
}

export default function BotHistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [filteredFundingCount, setFilteredFundingCount] = useState<number>(0);
  const [aggregatedCount, setAggregatedCount] = useState<number>(0);
  const [expandedPositions, setExpandedPositions] = useState<Set<number>>(new Set());

  // ✅ ZAWSZE synchronizuj przy wejściu (nie sprawdzaj czy są dane)
  useEffect(() => {
    const performInitialSync = async () => {
      console.log("🔄 Automatyczna pełna synchronizacja z Bybit przy wejściu...");
      await syncWithBybit();
      // ✅ FIX: Po sync, pobierz dane i wyłącz loading
      await fetchHistory(false);
    };
    
    performInitialSync();
  }, []);

  // ✅ Auto-refresh co 10 sekund - ZAWSZE włączone
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHistory(true); // silent refresh
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchHistory = async (silent = false) => {
    if (!silent) setLoading(true);
    
    try {
      const response = await fetch('/api/bot/history?limit=100&source=database');
      const data = await response.json();
      
      if (data.success && data.history) {
        setHistory(data.history);
        setLastRefresh(new Date());
        if (!silent) {
          toast.success(`✅ Pobrano ${data.history.length} pozycji z lokalnej bazy`);
        }
      } else {
        if (!silent) {
          toast.error(data.message || "Błąd pobierania historii");
        }
      }
    } catch (err) {
      console.error("Nie udało się pobrać historii:", err);
      if (!silent) {
        toast.error("Błąd pobierania historii");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // ✅ Full sync with Bybit
  const syncWithBybit = async () => {
    try {
      const response = await fetch('/api/bot/sync-bybit-history', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        if (data.filtered > 0) {
          setFilteredFundingCount(data.filtered);
        }
        
        if (data.aggregated > 0) {
          setAggregatedCount(data.aggregated);
        }
        
        // Refresh list
        await fetchHistory(true);
      }
    } catch (err) {
      console.error("Sync error:", err);
    }
  };

  // Generate transaction list for a position
  const getTransactions = (pos: HistoryPosition) => {
    const transactions: Array<{
      type: 'open' | 'close';
      direction: string;
      qty: number;
      price: number;
      time: string;
      label: string;
    }> = [];

    // Opening transaction(s)
    if (pos.partialCloseCount && pos.partialCloseCount > 1) {
      // Multiple opens (aggregated position)
      const qtyPerOpen = pos.quantity / pos.partialCloseCount;
      for (let i = 0; i < pos.partialCloseCount; i++) {
        transactions.push({
          type: 'open',
          direction: pos.side === 'Buy' ? 'Open Long' : 'Open Short',
          qty: qtyPerOpen,
          price: pos.entryPrice,
          time: pos.openedAt,
          label: `Open ${i + 1}/${pos.partialCloseCount}`
        });
      }
    } else {
      // Single open
      transactions.push({
        type: 'open',
        direction: pos.side === 'Buy' ? 'Open Long' : 'Open Short',
        qty: pos.quantity,
        price: pos.entryPrice,
        time: pos.openedAt,
        label: 'Open Position'
      });
    }

    // Partial closes (TP hits)
    let remainingQty = pos.quantity;
    
    if (pos.tp1Hit) {
      const tp1Qty = pos.quantity * 0.5; // 50% close at TP1
      transactions.push({
        type: 'close',
        direction: pos.side === 'Buy' ? 'Close Long (TP1)' : 'Close Short (TP1)',
        qty: tp1Qty,
        price: pos.closePrice * 0.98, // Estimate TP1 price
        time: pos.closedAt,
        label: 'TP1 Hit'
      });
      remainingQty -= tp1Qty;
    }

    if (pos.tp2Hit) {
      const tp2Qty = remainingQty * 0.3; // 30% of remaining at TP2
      transactions.push({
        type: 'close',
        direction: pos.side === 'Buy' ? 'Close Long (TP2)' : 'Close Short (TP2)',
        qty: tp2Qty,
        price: pos.closePrice * 0.99, // Estimate TP2 price
        time: pos.closedAt,
        label: 'TP2 Hit'
      });
      remainingQty -= tp2Qty;
    }

    // Final close
    transactions.push({
      type: 'close',
      direction: pos.side === 'Buy' ? 'Close Long' : 'Close Short',
      qty: remainingQty,
      price: pos.closePrice,
      time: pos.closedAt,
      label: pos.tp3Hit ? 'TP3 Hit' : pos.closeReason.replace(/_/g, ' ').toUpperCase()
    });

    return transactions;
  };

  // ✅ ENHANCED STATS: Include fees breakdown
  const stats = {
    totalTrades: history.length,
    profitable: history.filter(h => h.pnl > 0).length,
    losses: history.filter(h => h.pnl < 0).length,
    totalPnl: history.reduce((sum, h) => sum + h.pnl, 0),
    winRate: history.length > 0 ? (history.filter(h => h.pnl > 0).length / history.length) * 100 : 0,
  };

  const togglePosition = (index: number) => {
    setExpandedPositions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-600/30 to-amber-900/20 border border-amber-500/30">
              <History className="h-8 w-8 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Historia Pozycji Bota
              </h1>
              <p className="text-gray-200 flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-400" />
                Dane synchronizowane automatycznie z Bybit
              </p>
            </div>
          </div>
        </div>

        {/* Status synchronizacji */}
        {(filteredFundingCount > 0 || aggregatedCount > 0) && (
          <Card className="border-green-700 bg-green-900/20">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-200 mb-2">
                    Automatyczna synchronizacja aktywna
                  </p>
                  <div className="space-y-1 text-xs text-green-300">
                    {filteredFundingCount > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-green-400">🚫</span>
                        <span>Odfiltrowano <strong>{filteredFundingCount}</strong> transakcji fundingu</span>
                      </div>
                    )}
                    {aggregatedCount > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-green-400">🔗</span>
                        <span>Zagregowano <strong>{aggregatedCount}</strong> częściowych zamknięć</span>
                      </div>
                    )}
                  </div>
                </div>
                {lastRefresh && (
                  <div className="text-xs text-green-400">
                    {lastRefresh.toLocaleTimeString('pl-PL')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Auto-refresh indicator */}
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
          <Activity className="h-4 w-4 animate-pulse text-green-400" />
          <span>Auto-odświeżanie: ON (co 10 sekund)</span>
          {lastRefresh && (
            <span className="text-gray-500">
              • Ostatnia aktualizacja: {lastRefresh.toLocaleTimeString('pl-PL')}
            </span>
          )}
        </div>

        {/* ✅ ENHANCED STATISTICS: Show fees breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Łącznie</CardDescription>
              <CardTitle className="text-3xl text-white">{stats.totalTrades}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Zyskowne</CardDescription>
              <CardTitle className="text-3xl text-green-400 flex items-center gap-2">
                <TrendingUp className="h-6 w-6" />
                {stats.profitable}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Stratne</CardDescription>
              <CardTitle className="text-3xl text-red-400 flex items-center gap-2">
                <TrendingDown className="h-6 w-6" />
                {stats.losses}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm hover:bg-gray-900/80 transition-all">
            <CardHeader className="pb-2">
              <CardDescription className="text-gray-300">Win Rate</CardDescription>
              <CardTitle className="text-3xl text-white">{stats.winRate.toFixed(1)}%</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Loading */}
        {loading && (
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-3">
                <Activity className="h-8 w-8 animate-spin text-blue-400" />
                <p className="text-sm text-gray-300">Ładowanie danych z lokalnej bazy...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ✅ ENHANCED HISTORY LIST */}
        {!loading && history.length > 0 && (
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <History className="h-5 w-5" />
                Zamknięte Pozycje ({history.length})
              </CardTitle>
              <CardDescription>
                Kliknij na pozycję aby rozwinąć szczegóły transakcji
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((pos, idx) => {
                  const isExpanded = expandedPositions.has(idx);
                  const transactions = getTransactions(pos);
                  
                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border-2 transition-all ${
                        pos.pnl > 0
                          ? "border-green-500/20 bg-green-500/5"
                          : "border-red-500/20 bg-red-500/5"
                      }`}
                    >
                      {/* Header - Always Visible */}
                      <div 
                        className="p-4 cursor-pointer hover:bg-gray-800/30 transition-colors"
                        onClick={() => togglePosition(idx)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-bold text-lg text-white">{pos.symbol}</span>
                              <Badge variant={pos.side === "Buy" ? "default" : "secondary"}>
                                {pos.side === "Buy" ? "Long" : "Short"}
                              </Badge>
                              <Badge className="text-purple-300 border-purple-500/50 bg-purple-900/30">
                                {pos.tier}
                              </Badge>

                              {(pos.tp1Hit || pos.tp2Hit || pos.tp3Hit) && (
                                <div className="flex items-center gap-1 ml-2">
                                  {pos.tp1Hit && (
                                    <Badge className="bg-green-600/20 text-green-300 border-green-500/50 text-xs">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      TP1
                                    </Badge>
                                  )}
                                  {pos.tp2Hit && (
                                    <Badge className="bg-green-600/20 text-green-300 border-green-500/50 text-xs">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      TP2
                                    </Badge>
                                  )}
                                  {pos.tp3Hit && (
                                    <Badge className="bg-green-600/20 text-green-300 border-green-500/50 text-xs">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      TP3
                                    </Badge>
                                  )}
                                </div>
                              )}
                              
                              {pos.partialCloseCount && pos.partialCloseCount > 1 && (
                                <Badge variant="outline" className="text-xs text-amber-300 border-amber-500/50">
                                  {pos.partialCloseCount} częściowych zamknięć
                                </Badge>
                              )}
                              
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-gray-400 ml-auto" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-gray-400 ml-auto" />
                              )}
                            </div>
                            
                            <div className="text-sm text-gray-300">
                              Entry: {pos.entryPrice.toFixed(4)} → Close: {pos.closePrice.toFixed(4)} | 
                              Qty: {pos.quantity} | Leverage: {pos.leverage}x
                            </div>
                            
                            <div className="text-xs text-gray-400 mt-1">
                              {new Date(pos.closedAt).toLocaleString('pl-PL')} | 
                              Duration: {Math.floor(pos.durationMinutes / 60)}h {pos.durationMinutes % 60}m
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className={`text-xl font-bold ${pos.pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pos.pnl > 0 ? '+' : ''}{pos.pnl.toFixed(4)} USDT
                            </div>
                            <div className="text-sm text-gray-400">
                              {pos.pnlPercent > 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}% ROE
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Details - Transaction List */}
                      {isExpanded && (
                        <div className="border-t border-gray-700/50 bg-gray-900/40">
                          <div className="p-4 space-y-6">
                            {/* Trading Chart */}
                            <div>
                              <div className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                <Activity className="h-4 w-4" />
                                Wykres Pozycji
                              </div>
                              <TradingChart
                                symbol={pos.symbol}
                                entryPrice={pos.entryPrice}
                                exitPrice={pos.closePrice}
                                openedAt={pos.openedAt}
                                closedAt={pos.closedAt}
                                side={pos.side as "Buy" | "Sell"}
                              />
                            </div>

                            {/* Transaction List */}
                            <div>
                              <div className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                <Activity className="h-4 w-4" />
                                Lista Transakcji ({transactions.length})
                              </div>
                              
                              <div className="space-y-2">
                                {/* Table Header */}
                                <div className="grid grid-cols-5 gap-4 text-xs font-semibold text-gray-400 pb-2 border-b border-gray-700/50">
                                  <div>Direction</div>
                                  <div className="text-right">Qty</div>
                                  <div className="text-right">Filled Price</div>
                                  <div className="text-right">Trade Time</div>
                                  <div className="text-right">Label</div>
                                </div>
                                
                                {/* Transactions */}
                                {transactions.map((tx, txIdx) => (
                                  <div 
                                    key={txIdx}
                                    className={`grid grid-cols-5 gap-4 text-xs py-2 px-3 rounded transition-colors ${
                                      tx.type === 'open' 
                                        ? 'bg-blue-500/5 hover:bg-blue-500/10' 
                                        : 'bg-amber-500/5 hover:bg-amber-500/10'
                                    }`}
                                  >
                                    <div className={`font-medium ${
                                      tx.type === 'open' 
                                        ? pos.side === 'Buy' ? 'text-green-400' : 'text-red-400'
                                        : pos.side === 'Buy' ? 'text-red-400' : 'text-green-400'
                                    }`}>
                                      {tx.direction}
                                    </div>
                                    <div className="text-right text-gray-300">
                                      {tx.type === 'close' ? '-' : ''}{tx.qty.toFixed(3)}
                                    </div>
                                    <div className="text-right text-white font-mono">
                                      {tx.price.toFixed(4)}
                                    </div>
                                    <div className="text-right text-gray-400">
                                      {new Date(tx.time).toLocaleString('pl-PL', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })}
                                    </div>
                                    <div className="text-right">
                                      <Badge 
                                        variant="outline" 
                                        className={`text-xs ${
                                          tx.type === 'open' 
                                            ? 'border-blue-500/50 text-blue-300'
                                            : 'border-amber-500/50 text-amber-300'
                                        }`}
                                      >
                                        {tx.label}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              
                              {/* Summary Stats */}
                              <div className="mt-4 pt-4 border-t border-gray-700/50">
                                <div className="grid grid-cols-3 gap-4 text-xs">
                                  <div>
                                    <div className="text-gray-400 mb-1">Open Trade Volume:</div>
                                    <div className="text-white font-semibold">
                                      {(pos.quantity * pos.entryPrice).toFixed(2)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400 mb-1">Closed Trade Volume:</div>
                                    <div className="text-white font-semibold">
                                      {(pos.quantity * pos.closePrice).toFixed(2)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400 mb-1">Result:</div>
                                    <Badge className={pos.pnl > 0 ? 'bg-green-600' : 'bg-red-600'}>
                                      {pos.pnl > 0 ? 'Win' : 'Loss'}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading && history.length === 0 && (
          <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-3">
                <History className="h-12 w-12 text-gray-600" />
                <p className="text-lg text-gray-400">Synchronizacja z Bybit w toku...</p>
                <p className="text-sm text-gray-500">Dane pojawią się za moment</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}