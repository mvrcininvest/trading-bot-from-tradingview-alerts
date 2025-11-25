"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Wallet, RefreshCw, AlertCircle, Settings, Activity, Bot, X, FileText, Clock, Target, DollarSign, Zap, History, Award } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface BotPosition {
  id: number;
  symbol: string;
  side: string;
  tier: string;
  entryPrice: number;
  quantity: number;
  leverage: number;
  stopLoss: number;
  mainTpPrice: number;
  unrealisedPnl: number;
  openedAt: string;
  status: string;
  liveSlPrice?: number | null;
  liveTp1Price?: number | null;
  liveTp2Price?: number | null;
  liveTp3Price?: number | null;
  alertData?: string | null;
}

interface HistoryStats {
  totalPositions: number;
  totalPnl: number;
  winRate: number;
  totalFees: number;
  profitable: number;
  losses: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<any>(null);
  const [isCheckingCredentials, setIsCheckingCredentials] = useState(true);
  const [botPositions, setBotPositions] = useState<BotPosition[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [botEnabled, setBotEnabled] = useState<boolean>(false);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [positionToClose, setPositionToClose] = useState<{ symbol: string; positionId: number } | null>(null);
  const [selectedAlertData, setSelectedAlertData] = useState<any>(null);
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [historyStats, setHistoryStats] = useState<HistoryStats | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch credentials on mount
  useEffect(() => {
    const checkCreds = async () => {
      const stored = localStorage.getItem("exchange_credentials");
      if (stored) {
        try {
          const creds = JSON.parse(stored);
          setCredentials(creds);
          setIsCheckingCredentials(false);
          loadData();
          return;
        } catch (err) {
          console.error("Parse error:", err);
        }
      }
      
      try {
        const response = await fetch("/api/bot/credentials");
        const data = await response.json();
        
        if (data.success && data.credentials?.apiKey) {
          const creds = {
            exchange: "bybit",
            environment: "mainnet",
            apiKey: data.credentials.apiKey,
            apiSecret: data.credentials.apiSecret,
            savedAt: data.credentials.savedAt || new Date().toISOString()
          };
          localStorage.setItem("exchange_credentials", JSON.stringify(creds));
          setCredentials(creds);
          loadData();
        }
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setIsCheckingCredentials(false);
      }
    };
    
    checkCreds();
  }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!credentials) return;
    
    const interval = setInterval(() => {
      loadData(true);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [credentials]);

  const loadData = async (silent = false) => {
    if (!silent) setLoadingPositions(true);
    
    try {
      const [posRes, statusRes, histRes] = await Promise.all([
        fetch("/api/bot/positions"),
        fetch("/api/bot/settings"),
        fetch("/api/bot/history?limit=1000&source=database")
      ]);
      
      const posData = await posRes.json();
      const statusData = await statusRes.json();
      const histData = await histRes.json();
      
      if (posData.success && Array.isArray(posData.positions)) {
        const openPos = posData.positions.filter((p: BotPosition) => p.status === 'open');
        setBotPositions(openPos);
      }
      
      if (statusData.success && statusData.settings) {
        setBotEnabled(statusData.settings.botEnabled);
      }
      
      if (histData.success && histData.stats) {
        setHistoryStats(histData.stats);
      }
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      if (!silent) setLoadingPositions(false);
    }
  };

  const handleClosePosition = (symbol: string, positionId: number) => {
    setPositionToClose({ symbol, positionId });
    setShowCloseConfirm(true);
  };

  const confirmClosePosition = async () => {
    if (!positionToClose) return;

    const { symbol } = positionToClose;
    setClosingPosition(symbol);
    setShowCloseConfirm(false);
    
    try {
      const response = await fetch("/api/exchange/close-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: credentials?.exchange || "bybit",
          apiKey: credentials?.apiKey,
          apiSecret: credentials?.apiSecret,
          symbol,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`✅ Pozycja ${symbol} zamknięta!`);
        loadData();
      } else {
        toast.error(`❌ Błąd: ${data.message}`);
      }
    } catch (err) {
      toast.error(`❌ Błąd zamykania pozycji`);
    } finally {
      setClosingPosition(null);
      setPositionToClose(null);
    }
  };

  const handleShowAlertData = (alertDataString: string | null | undefined) => {
    if (!alertDataString) {
      toast.error("Brak danych alertu");
      return;
    }

    try {
      const alertData = JSON.parse(alertDataString);
      setSelectedAlertData(alertData);
      setShowAlertDialog(true);
    } catch (error) {
      toast.error("Nie można odczytać danych alertu");
    }
  };

  const unrealisedPnL = botPositions.reduce((sum, p) => sum + (p.unrealisedPnl || 0), 0);

  if (isCheckingCredentials) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <Card className="max-w-md w-full border-gray-800 bg-gray-900/80">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
              <p className="text-lg font-medium text-white">Sprawdzanie konfiguracji...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <Card className="max-w-2xl w-full border-red-800 bg-red-900/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-300 text-2xl">
              <AlertCircle className="h-8 w-8" />
              Brak konfiguracji Bybit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push("/exchange-test")} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6"
              size="lg"
            >
              <Settings className="mr-2 h-6 w-6" />
              Konfiguracja API
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-gradient-to-br from-blue-900/30 to-blue-800/50 border border-blue-800/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-blue-300">PnL Niezrealizowany</h3>
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <p className={`text-2xl font-bold ${unrealisedPnL >= 0 ? 'text-green-100' : 'text-red-100'}`}>
              {unrealisedPnL >= 0 ? '+' : ''}{unrealisedPnL.toFixed(2)}
            </p>
            <p className="text-xs text-blue-400">USDT (otwarte)</p>
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-amber-900/30 to-amber-800/50 border border-amber-800/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-amber-300">Otwarte Pozycje</h3>
              <Activity className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-100">{botPositions.length}</p>
            <p className="text-xs text-amber-400">aktywnych</p>
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-green-900/30 to-green-800/50 border border-green-800/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-green-300">Total PnL</h3>
              <History className="h-4 w-4 text-green-400" />
            </div>
            {historyStats ? (
              <>
                <p className={`text-2xl font-bold ${historyStats.totalPnl >= 0 ? 'text-green-100' : 'text-red-100'}`}>
                  {historyStats.totalPnl >= 0 ? '+' : ''}{historyStats.totalPnl.toFixed(2)}
                </p>
                <p className="text-xs text-green-400">{historyStats.totalPositions} zamkniętych</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-gray-500">---</p>
            )}
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-purple-900/30 to-purple-800/50 border border-purple-800/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-purple-300">Win Rate</h3>
              <Award className="h-4 w-4 text-purple-400" />
            </div>
            {historyStats ? (
              <>
                <p className="text-2xl font-bold text-purple-100">{historyStats.winRate.toFixed(1)}%</p>
                <p className="text-xs text-purple-400">skuteczność</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-gray-500">---</p>
            )}
          </div>
        </div>

        {/* Bot Status */}
        <Card className="border-gray-800 bg-gray-900/60">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Bot className={`h-5 w-5 ${botEnabled ? 'text-green-400' : 'text-red-400'}`} />
                <span className="text-sm text-gray-300">
                  Status Bota: <span className={`font-semibold ${botEnabled ? 'text-green-400' : 'text-red-400'}`}>
                    {botEnabled ? 'Aktywny' : 'Wyłączony'}
                  </span>
                </span>
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={() => router.push("/bot-history")}
                  variant="outline"
                  size="sm"
                  className="border-blue-700 text-blue-300 hover:bg-blue-900/20"
                >
                  <History className="h-4 w-4 mr-1" />
                  Historia
                </Button>
                <Button
                  onClick={() => router.push("/ustawienia-bota")}
                  variant="outline"
                  size="sm"
                  className="border-purple-700 text-purple-300 hover:bg-purple-900/20"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Ustawienia
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Open Positions */}
        <Card className="border-gray-800 bg-gray-900/80">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Otwarte Pozycje
              <Badge variant="secondary" className="bg-gray-700 text-gray-200">{botPositions.length}</Badge>
            </CardTitle>
            <CardDescription className="text-gray-300">
              Dane odświeżane co 5 sekund
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPositions && botPositions.length === 0 && (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-500" />
                <p className="text-sm text-gray-300">Ładowanie...</p>
              </div>
            )}

            {!loadingPositions && botPositions.length === 0 && (
              <div className="text-center py-8">
                <Activity className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-gray-300 mb-4">Brak otwartych pozycji</p>
                {historyStats && historyStats.totalPositions > 0 && (
                  <Button
                    onClick={() => router.push("/bot-history")}
                    variant="outline"
                    className="border-blue-700 text-blue-300 hover:bg-blue-900/20"
                  >
                    <History className="h-4 w-4 mr-2" />
                    Zobacz Historię ({historyStats.totalPositions} pozycji)
                  </Button>
                )}
              </div>
            )}

            {botPositions.length > 0 && (
              <div className="space-y-4">
                {botPositions.map((pos, idx) => {
                  const pnl = pos.unrealisedPnl || 0;
                  const isProfitable = pnl > 0;
                  const posValue = pos.entryPrice * pos.quantity;
                  const margin = posValue / pos.leverage;
                  const roe = (pnl / margin) * 100;
                  
                  const openedAt = new Date(pos.openedAt);
                  const durationMs = Date.now() - openedAt.getTime();
                  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
                  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                  const durationText = durationHours > 0 ? `${durationHours}h ${durationMinutes}m` : `${durationMinutes}m`;

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border-2 transition-all ${
                        isProfitable
                          ? "border-green-500/30 bg-gradient-to-br from-green-900/20 via-green-800/10 to-transparent"
                          : "border-red-500/30 bg-gradient-to-br from-red-900/20 via-red-800/10 to-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between p-4 border-b border-gray-700/50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-bold text-2xl text-white">{pos.symbol}</span>
                            <Badge
                              variant={pos.side === "Buy" ? "default" : "secondary"}
                              className={pos.side === "Buy" ? "bg-green-600" : "bg-red-600"}
                            >
                              {pos.side === "Buy" ? "LONG" : "SHORT"} {pos.leverage}x
                            </Badge>
                            <Badge variant="outline" className="text-purple-300 border-purple-500/50 bg-purple-900/30">
                              {pos.tier}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{openedAt.toLocaleString("pl-PL", {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              <span>{durationText}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${isProfitable ? "text-green-400" : "text-red-400"}`}>
                              {isProfitable ? "+" : ""}{pnl.toFixed(2)} USDT
                            </div>
                            <div className={`text-sm font-semibold ${isProfitable ? "text-green-300" : "text-red-300"}`}>
                              ROE: {roe >= 0 ? "+" : ""}{roe.toFixed(2)}%
                            </div>
                          </div>
                          
                          <Button
                            onClick={() => handleClosePosition(pos.symbol, pos.id)}
                            disabled={closingPosition === pos.symbol}
                            size="sm"
                            variant="destructive"
                            className="h-9 w-9 p-0"
                          >
                            {closingPosition === pos.symbol ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/50">
                          <div className="grid grid-cols-3 gap-3 text-sm">
                            <div>
                              <div className="text-gray-400 text-xs">Wejście</div>
                              <div className="font-semibold text-white">{pos.entryPrice.toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Rozmiar</div>
                              <div className="font-semibold text-white">{pos.quantity.toFixed(4)}</div>
                            </div>
                            <div>
                              <div className="text-gray-400 text-xs">Wartość</div>
                              <div className="font-semibold text-white">{posValue.toFixed(2)}</div>
                            </div>
                          </div>
                        </div>

                        {pos.alertData && (
                          <Button
                            onClick={() => handleShowAlertData(pos.alertData)}
                            size="sm"
                            variant="outline"
                            className="w-full border-blue-600 text-blue-400 hover:bg-blue-600/20"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Zobacz Alert
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Close Confirmation Dialog */}
        <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
          <DialogContent className="bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                Zamknąć pozycję?
              </DialogTitle>
              <DialogDescription className="text-gray-300">
                Czy na pewno chcesz zamknąć pozycję <span className="font-bold text-white">{positionToClose?.symbol}</span>?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCloseConfirm(false);
                  setPositionToClose(null);
                }}
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                Anuluj
              </Button>
              <Button
                variant="destructive"
                onClick={confirmClosePosition}
                className="bg-red-600 hover:bg-red-700"
              >
                Zamknij Pozycję
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Alert Data Dialog */}
        <Dialog open={showAlertDialog} onOpenChange={setShowAlertDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" />
                Dane Alertu - {selectedAlertData?.symbol}
              </DialogTitle>
            </DialogHeader>

            {selectedAlertData && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Podstawowe Informacje</h3>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-gray-400">Symbol</div>
                      <div className="font-semibold text-white">{selectedAlertData.symbol}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Kierunek</div>
                      <Badge>{selectedAlertData.side === "Buy" ? "LONG" : "SHORT"}</Badge>
                    </div>
                    <div>
                      <div className="text-gray-400">Tier</div>
                      <Badge variant="outline" className="text-purple-300">{selectedAlertData.tier}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}