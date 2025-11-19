"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, Lock, XCircle, AlertCircle, CheckCircle, Clock, TrendingDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface SymbolLock {
  id: number;
  symbol: string;
  lockReason: string;
  lockedAt: string;
  failureCount: number;
  lastError: string | null;
  unlockedAt: string | null;
}

interface DiagnosticFailure {
  failure: {
    id: number;
    positionId: number;
    failureType: string;
    reason: string;
    attemptCount: number;
    details: string | null;
    createdAt: string;
  };
  position: {
    symbol: string;
    side: string;
    tier: string;
  } | null;
}

interface ErrorAlert {
  id: number;
  symbol: string;
  side: string;
  tier: string;
  executionStatus: string;
  rejectionReason: string;
  errorType: string | null;
  createdAt: string;
  timestamp: number;
}

interface RetryAttempt {
  attempt: {
    id: number;
    positionId: number;
    attemptNumber: number;
    orderType: string;
    triggerPrice: number;
    errorMessage: string | null;
    createdAt: string;
  };
  position: {
    symbol: string;
    side: string;
  } | null;
}

interface DiagnosticSummary {
  activeSymbolLocks: number;
  totalSymbolLocks: number;
  totalDiagnosticFailures: number;
  emergencyCloses: number;
  totalErrorAlerts: number;
  apiTemporaryErrors: number;
  tradeFaultErrors: number;
  recentRetryAttempts: number;
  retryFailureRate: string;
}

export default function DiagnosticsPage() {
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null);
  const [locks, setLocks] = useState<SymbolLock[]>([]);
  const [failures, setFailures] = useState<DiagnosticFailure[]>([]);
  const [errorAlerts, setErrorAlerts] = useState<ErrorAlert[]>([]);
  const [retryAttempts, setRetryAttempts] = useState<RetryAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState<string | null>(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchSummary(),
        fetchLocks(),
        fetchFailures(),
        fetchErrorAlerts(),
        fetchRetryAttempts()
      ]);
    } catch (error) {
      console.error("Failed to fetch diagnostic data:", error);
      toast.error("Błąd podczas pobierania danych diagnostycznych");
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await fetch("/api/bot/diagnostics/summary");
      const data = await response.json();
      if (data.success) {
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Failed to fetch summary:", error);
    }
  };

  const fetchLocks = async () => {
    try {
      const response = await fetch("/api/bot/diagnostics/locks");
      const data = await response.json();
      if (data.success) {
        setLocks(data.locks);
      }
    } catch (error) {
      console.error("Failed to fetch locks:", error);
    }
  };

  const fetchFailures = async () => {
    try {
      const response = await fetch("/api/bot/diagnostics/failures?limit=50");
      const data = await response.json();
      if (data.success) {
        setFailures(data.failures);
      }
    } catch (error) {
      console.error("Failed to fetch failures:", error);
    }
  };

  const fetchErrorAlerts = async () => {
    try {
      const response = await fetch("/api/bot/diagnostics/error-alerts?limit=50");
      const data = await response.json();
      if (data.success) {
        setErrorAlerts(data.errorAlerts);
      }
    } catch (error) {
      console.error("Failed to fetch error alerts:", error);
    }
  };

  const fetchRetryAttempts = async () => {
    try {
      const response = await fetch("/api/bot/diagnostics/retry-attempts?limit=50");
      const data = await response.json();
      if (data.success) {
        setRetryAttempts(data.attempts);
      }
    } catch (error) {
      console.error("Failed to fetch retry attempts:", error);
    }
  };

  const handleUnlockSymbol = async (symbol: string) => {
    setUnlocking(symbol);
    try {
      const response = await fetch("/api/bot/diagnostics/locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol })
      });

      const data = await response.json();
      if (data.success) {
        toast.success(`Symbol ${symbol} został odblokowany!`);
        await fetchLocks();
        await fetchSummary();
      } else {
        toast.error(`Błąd: ${data.error}`);
      }
    } catch (error) {
      toast.error("Błąd podczas odblokowywania symbolu");
    } finally {
      setUnlocking(null);
    }
  };

  const activeLocks = locks.filter(l => !l.unlockedAt);
  const historicalLocks = locks.filter(l => l.unlockedAt);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-red-600/30 to-red-900/20 border border-red-500/30">
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Diagnostyka Bota
              </h1>
              <p className="text-sm text-gray-200 flex items-center gap-2">
                System monitoringu błędów i awarii
              </p>
            </div>
          </div>
          <Button
            onClick={fetchAllData}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Odśwież
          </Button>
        </div>

        {/* Active Locks Alert */}
        {activeLocks.length > 0 && (
          <Alert className="border-2 border-red-600/50 bg-gradient-to-r from-red-600/20 to-orange-600/20 backdrop-blur-sm">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <AlertDescription className="text-sm text-red-200">
              <strong className="text-red-100 text-base">🚫 UWAGA: {activeLocks.length} zablokowanych symboli</strong>
              <p className="mt-2 text-gray-100">
                Następujące symbole są zablokowane i bot nie będzie na nich otwierał pozycji: {" "}
                <strong className="text-red-100">{activeLocks.map(l => l.symbol).join(", ")}</strong>
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-300 mb-1">Zablokowane Symbole</p>
                    <p className="text-2xl font-bold text-white">{summary.activeSymbolLocks}</p>
                    <p className="text-xs text-gray-300">z {summary.totalSymbolLocks} całkowitych</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30">
                    <Lock className="h-6 w-6 text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-300 mb-1">Błędy Alertów</p>
                    <p className="text-2xl font-bold text-white">{summary.totalErrorAlerts}</p>
                    <p className="text-xs text-gray-300">
                      API: {summary.apiTemporaryErrors} | Trade: {summary.tradeFaultErrors}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/20 border border-orange-500/30">
                    <XCircle className="h-6 w-6 text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-300 mb-1">Awaryjne Zamknięcia</p>
                    <p className="text-2xl font-bold text-white">{summary.emergencyCloses}</p>
                    <p className="text-xs text-gray-300">z {summary.totalDiagnosticFailures} błędów</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-500/20 border border-purple-500/30">
                    <AlertCircle className="h-6 w-6 text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gray-900/60 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-300 mb-1">Próby Ponowne (24h)</p>
                    <p className="text-2xl font-bold text-white">{summary.recentRetryAttempts}</p>
                    <p className="text-xs text-gray-300">Błędy: {summary.retryFailureRate}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/20 border border-blue-500/30">
                    <Clock className="h-6 w-6 text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content with Tabs */}
        <Tabs defaultValue="locks" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-gray-900/80 backdrop-blur-sm border border-gray-800">
            <TabsTrigger value="locks" className="data-[state=active]:bg-red-600/30 data-[state=active]:text-red-200 text-gray-300">
              <Lock className="mr-2 h-4 w-4" />
              Blokady ({activeLocks.length})
            </TabsTrigger>
            <TabsTrigger value="errors" className="data-[state=active]:bg-orange-600/30 data-[state=active]:text-orange-200 text-gray-300">
              <XCircle className="mr-2 h-4 w-4" />
              Błędy Alertów ({errorAlerts.length})
            </TabsTrigger>
            <TabsTrigger value="failures" className="data-[state=active]:bg-purple-600/30 data-[state=active]:text-purple-200 text-gray-300">
              <AlertCircle className="mr-2 h-4 w-4" />
              Awarie ({failures.length})
            </TabsTrigger>
            <TabsTrigger value="retries" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-200 text-gray-300">
              <Clock className="mr-2 h-4 w-4" />
              Retry Log ({retryAttempts.length})
            </TabsTrigger>
          </TabsList>

          {/* Symbol Locks Tab */}
          <TabsContent value="locks" className="space-y-6">
            <Card className="border-red-700 bg-gradient-to-br from-red-600/10 via-gray-900/80 to-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Lock className="h-5 w-5 text-red-400" />
                  Zablokowane Symbole
                  {activeLocks.length > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      {activeLocks.length} Aktywnych
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-gray-200">
                  Symbole zablokowane z powodu błędów krytycznych
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeLocks.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500 opacity-50" />
                    <p className="text-gray-300">Brak zablokowanych symboli - wszystko działa poprawnie!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeLocks.map((lock) => (
                      <div
                        key={lock.id}
                        className="p-5 rounded-xl border-2 border-red-700/30 bg-gradient-to-r from-red-900/20 to-gray-900/80 hover:from-red-900/30 hover:to-gray-900 transition-all"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-xl bg-red-500/30 border border-red-500/40 flex items-center justify-center">
                              <Lock className="h-6 w-6 text-red-400" />
                            </div>
                            <div>
                              <div className="font-bold text-xl text-white mb-1">{lock.symbol}</div>
                              <Badge variant="destructive" className="text-xs">
                                {lock.lockReason}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleUnlockSymbol(lock.symbol)}
                            disabled={unlocking === lock.symbol}
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {unlocking === lock.symbol ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Odblokowywanie...
                              </>
                            ) : (
                              "Odblokuj Symbol"
                            )}
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-3 text-sm p-3 rounded-lg bg-gray-800/40">
                          <div>
                            <div className="text-gray-300">Liczba błędów</div>
                            <div className="font-semibold text-red-400">{lock.failureCount}</div>
                          </div>
                          <div>
                            <div className="text-gray-300">Zablokowano</div>
                            <div className="font-semibold text-gray-100">
                              {new Date(lock.lockedAt).toLocaleString("pl-PL")}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-300">Status</div>
                            <div className="font-semibold text-red-400">🚫 ZABLOKOWANY</div>
                          </div>
                        </div>

                        {lock.lastError && (
                          <div className="mt-3 p-3 rounded-lg bg-red-900/20 border border-red-700/30">
                            <div className="text-xs text-gray-300 mb-1">Ostatni błąd:</div>
                            <div className="text-sm text-red-200 font-mono">{lock.lastError}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {historicalLocks.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-white mb-3">
                      Historia Odblokowań ({historicalLocks.length})
                    </h3>
                    <div className="space-y-2">
                      {historicalLocks.slice(0, 5).map((lock) => (
                        <div
                          key={lock.id}
                          className="p-3 rounded-lg border border-gray-800 bg-gray-900/60 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            <div>
                              <div className="font-semibold text-white">{lock.symbol}</div>
                              <div className="text-xs text-gray-300">
                                Odblokowano: {new Date(lock.unlockedAt!).toLocaleString("pl-PL")}
                              </div>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs border-gray-700 text-gray-300">
                            {lock.lockReason}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Error Alerts Tab */}
          <TabsContent value="errors" className="space-y-6">
            <Card className="border-orange-700 bg-gradient-to-br from-orange-600/10 via-gray-900/80 to-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <XCircle className="h-5 w-5 text-orange-400" />
                  Błędy Alertów (error_rejected)
                  {errorAlerts.length > 0 && (
                    <Badge variant="secondary" className="ml-2 bg-orange-600/20 text-orange-300">
                      {errorAlerts.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-gray-200">
                  Alerty odrzucone z powodu błędów technicznych
                </CardDescription>
              </CardHeader>
              <CardContent>
                {errorAlerts.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500 opacity-50" />
                    <p className="text-gray-300">Brak błędów alertów - system działa sprawnie!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {errorAlerts.map((alert) => {
                      const errorTypeColors: Record<string, string> = {
                        'api_temporary': 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40',
                        'trade_fault': 'bg-red-500/20 text-red-200 border-red-500/40',
                        'configuration_missing': 'bg-blue-500/20 text-blue-200 border-blue-500/40',
                        'configuration_error': 'bg-purple-500/20 text-purple-200 border-purple-500/40',
                        'database_error': 'bg-pink-500/20 text-pink-200 border-pink-500/40',
                      };

                      return (
                        <div
                          key={alert.id}
                          className="p-5 rounded-xl border-2 border-orange-700/30 bg-gradient-to-r from-orange-900/20 to-gray-900/80 hover:from-orange-900/30 hover:to-gray-900 transition-all"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 rounded-xl bg-orange-500/30 border border-orange-500/40 flex items-center justify-center">
                                <XCircle className="h-6 w-6 text-orange-400" />
                              </div>
                              <div>
                                <div className="font-bold text-xl text-white mb-1">
                                  {alert.symbol} {alert.side}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs border-gray-700 text-gray-200">
                                    {alert.tier}
                                  </Badge>
                                  <Badge 
                                    variant="outline" 
                                    className={errorTypeColors[alert.errorType || 'unknown'] || 'bg-gray-500/20 text-gray-200'}
                                  >
                                    {alert.errorType || 'unknown'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-300">Alert ID</div>
                              <div className="font-mono text-sm text-gray-100">#{alert.id}</div>
                            </div>
                          </div>
                          
                          <div className="p-3 rounded-lg bg-gray-800/40 mb-3">
                            <div className="text-xs text-gray-300 mb-1">Powód odrzucenia:</div>
                            <div className="text-sm text-orange-200 font-semibold">{alert.rejectionReason}</div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-gray-300">
                            <span>Otrzymano: {new Date(alert.createdAt).toLocaleString("pl-PL")}</span>
                            <Badge variant="destructive" className="text-xs">
                              error_rejected
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Diagnostic Failures Tab */}
          <TabsContent value="failures" className="space-y-6">
            <Card className="border-purple-700 bg-gradient-to-br from-purple-600/10 via-gray-900/80 to-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <AlertCircle className="h-5 w-5 text-purple-400" />
                  Awarie Diagnostyczne
                  {failures.length > 0 && (
                    <Badge variant="secondary" className="ml-2 bg-purple-600/20 text-purple-300">
                      {failures.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-gray-200">
                  Awaryjne zamknięcia i krytyczne błędy
                </CardDescription>
              </CardHeader>
              <CardContent>
                {failures.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500 opacity-50" />
                    <p className="text-gray-300">Brak awarii - bot działa stabilnie!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {failures.map((item) => {
                      const failure = item.failure;
                      const position = item.position;

                      const failureTypeColors: Record<string, string> = {
                        'emergency_close': 'bg-red-500/20 text-red-200 border-red-500/40',
                        'tpsl_set_failed': 'bg-orange-500/20 text-orange-200 border-orange-500/40',
                        'order_cleanup_failed': 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40',
                      };

                      return (
                        <div
                          key={failure.id}
                          className="p-5 rounded-xl border-2 border-purple-700/30 bg-gradient-to-r from-purple-900/20 to-gray-900/80 hover:from-purple-900/30 hover:to-gray-900 transition-all"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 rounded-xl bg-purple-500/30 border border-purple-500/40 flex items-center justify-center">
                                <AlertCircle className="h-6 w-6 text-purple-400" />
                              </div>
                              <div>
                                {position && (
                                  <div className="font-bold text-xl text-white mb-1">
                                    {position.symbol} {position.side}
                                  </div>
                                )}
                                <Badge 
                                  variant="outline" 
                                  className={failureTypeColors[failure.failureType] || 'bg-gray-500/20 text-gray-200'}
                                >
                                  {failure.failureType}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-300">Próby</div>
                              <div className="font-bold text-xl text-red-400">{failure.attemptCount}</div>
                            </div>
                          </div>
                          
                          <div className="p-3 rounded-lg bg-gray-800/40 mb-3">
                            <div className="text-xs text-gray-300 mb-1">Powód:</div>
                            <div className="text-sm text-purple-200 font-semibold">{failure.reason}</div>
                          </div>

                          {failure.details && (
                            <div className="p-3 rounded-lg bg-purple-900/20 border border-purple-700/30 mb-3">
                              <div className="text-xs text-gray-300 mb-1">Szczegóły:</div>
                              <div className="text-xs text-gray-200 font-mono break-all">
                                {failure.details}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs text-gray-300 mt-3">
                            <span>{new Date(failure.createdAt).toLocaleString("pl-PL")}</span>
                            {position && (
                              <Badge variant="outline" className="text-xs border-gray-700 text-gray-200">
                                Position #{failure.positionId}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Retry Attempts Tab */}
          <TabsContent value="retries" className="space-y-6">
            <Card className="border-blue-700 bg-gradient-to-br from-blue-600/10 via-gray-900/80 to-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Clock className="h-5 w-5 text-blue-400" />
                  Log Prób Ponownych TP/SL
                  {retryAttempts.length > 0 && (
                    <Badge variant="secondary" className="ml-2 bg-blue-600/20 text-blue-300">
                      {retryAttempts.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-gray-200">
                  Historia prób ustawienia Stop Loss i Take Profit
                </CardDescription>
              </CardHeader>
              <CardContent>
                {retryAttempts.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500 opacity-50" />
                    <p className="text-gray-300">Brak prób ponownych - wszystkie TP/SL ustawione poprawnie!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {retryAttempts.map((item) => {
                      const attempt = item.attempt;
                      const position = item.position;
                      const isSuccess = !attempt.errorMessage;

                      const orderTypeColors: Record<string, string> = {
                        'sl': 'bg-red-500/20 text-red-200 border-red-500/40',
                        'tp1': 'bg-green-500/20 text-green-200 border-green-500/40',
                        'tp2': 'bg-green-500/20 text-green-200 border-green-500/40',
                        'tp3': 'bg-green-500/20 text-green-200 border-green-500/40',
                      };

                      return (
                        <div
                          key={attempt.id}
                          className={`p-5 rounded-xl border-2 transition-all ${
                            isSuccess 
                              ? 'border-green-700/30 bg-gradient-to-r from-green-900/20 to-gray-900/80 hover:from-green-900/30' 
                              : 'border-blue-700/30 bg-gradient-to-r from-blue-900/20 to-gray-900/80 hover:from-blue-900/30'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                                isSuccess 
                                  ? 'bg-green-500/30 border border-green-500/40' 
                                  : 'bg-blue-500/30 border border-blue-500/40'
                              }`}>
                                {isSuccess ? (
                                  <CheckCircle className="h-6 w-6 text-green-400" />
                                ) : (
                                  <Clock className="h-6 w-6 text-blue-400" />
                                )}
                              </div>
                              <div>
                                {position && (
                                  <div className="font-bold text-xl text-white mb-1">
                                    {position.symbol} {position.side}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant="outline" 
                                    className={orderTypeColors[attempt.orderType] || 'bg-gray-500/20 text-gray-200'}
                                  >
                                    {attempt.orderType.toUpperCase()}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs border-gray-700 text-gray-200">
                                    Próba #{attempt.attemptNumber}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-300">Cena Trigger</div>
                              <div className="font-semibold text-gray-100">{attempt.triggerPrice.toFixed(4)}</div>
                            </div>
                          </div>
                          
                          {attempt.errorMessage ? (
                            <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/30">
                              <div className="text-xs text-gray-300 mb-1">Błąd:</div>
                              <div className="text-sm text-red-200 font-mono">{attempt.errorMessage}</div>
                            </div>
                          ) : (
                            <div className="p-3 rounded-lg bg-green-900/20 border border-green-700/30">
                              <div className="text-sm text-green-200 font-semibold flex items-center gap-2">
                                <CheckCircle className="h-4 w-4" />
                                Sukces - {attempt.orderType.toUpperCase()} ustawiony poprawnie
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs text-gray-300 mt-3">
                            <span>{new Date(attempt.createdAt).toLocaleString("pl-PL")}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}