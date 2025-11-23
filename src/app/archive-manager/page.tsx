"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Archive, Download, CloudUpload, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ArchiveResult {
  success: boolean;
  message?: string;
  month?: string;
  count?: number;
  archived?: boolean;
  storage?: string;
  url?: string;
  statistics?: {
    totalPositions: number;
    profitablePositions: number;
    losingPositions: number;
    totalPnL: number;
    avgPnL: number;
    winRate: number;
  };
  error?: string;
}

export default function ArchiveManagerPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ArchiveResult | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");

  const handleArchive = async () => {
    setLoading(true);
    setResult(null);

    try {
      const url = selectedMonth
        ? `/api/archive/monthly-export?month=${selectedMonth}`
        : `/api/archive/monthly-export`;

      const response = await fetch(url);
      const data = await response.json();

      setResult(data);

      if (data.success && data.archived) {
        toast.success(`Archiwizacja zakończona! Zapisano ${data.count} pozycji.`);
      } else if (data.success && !data.archived) {
        toast.info(data.message || "Brak danych do archiwizacji");
      } else {
        toast.error(data.error || "Błąd archiwizacji");
      }
    } catch (error) {
      console.error("Archive error:", error);
      toast.error("Błąd połączenia z API");
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setLoading(false);
    }
  };

  const getPreviousMonth = () => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-600/30 to-purple-900/20 border border-purple-500/30">
            <Archive className="h-8 w-8 text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Menadżer Archiwów
            </h1>
            <p className="text-gray-200">
              Ręczna archiwizacja danych do Supabase Storage
            </p>
          </div>
        </div>

        {/* Info Card */}
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader>
            <CardTitle className="text-blue-400 flex items-center gap-2">
              <CloudUpload className="h-5 w-5" />
              Jak to działa?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-300 space-y-2">
            <p>
              ✅ <strong>Automatyczna archiwizacja:</strong> Każdego 1. dnia miesiąca o 00:00, cron job automatycznie archiwizuje poprzedni miesiąc.
            </p>
            <p>
              📦 <strong>Ręczna archiwizacja:</strong> Użyj formularza poniżej aby ręcznie zarchiwizować dowolny miesiąc.
            </p>
            <p>
              ☁️ <strong>Przechowywanie:</strong> Wszystkie archiwa są zapisywane w Supabase Storage (bucket: <code className="bg-gray-800 px-1 py-0.5 rounded">trading-archives</code>).
            </p>
            <p>
              🔗 <strong>Dostęp:</strong> Po archiwizacji otrzymasz publiczny link do pliku JSON.
            </p>
          </CardContent>
        </Card>

        {/* Archive Form */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">Zarchiwizuj Dane</CardTitle>
            <CardDescription className="text-gray-300">
              Wybierz miesiąc lub pozostaw puste aby zarchiwizować poprzedni miesiąc
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="month" className="text-gray-200">
                Miesiąc (opcjonalnie)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="month"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="YYYY-MM"
                />
                <Button
                  variant="outline"
                  onClick={() => setSelectedMonth(getPreviousMonth())}
                  className="border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-200"
                >
                  Poprzedni
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Domyślnie: {getPreviousMonth()} (poprzedni miesiąc)
              </p>
            </div>

            <Button
              onClick={handleArchive}
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Archiwizuję...
                </>
              ) : (
                <>
                  <Archive className="mr-2 h-4 w-4" />
                  Zarchiwizuj
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Result */}
        {result && (
          <Card className={`border-2 ${result.success ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                {result.success ? (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Sukces!
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5" />
                    Błąd
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.success && result.archived && (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400">Miesiąc</div>
                      <div className="font-semibold text-white">{result.month}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Liczba Pozycji</div>
                      <div className="font-semibold text-white">{result.count}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Storage</div>
                      <div className="font-semibold text-white">
                        <Badge className="bg-blue-500">Supabase</Badge>
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">Status</div>
                      <div className="font-semibold text-white">
                        <Badge className="bg-green-500">Zapisane</Badge>
                      </div>
                    </div>
                  </div>

                  {result.statistics && (
                    <div className="p-4 rounded-lg bg-gray-800/50 space-y-2">
                      <h4 className="font-semibold text-white mb-2">Statystyki Archiwum</h4>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-gray-400">Win Rate</div>
                          <div className="font-semibold text-green-400">
                            {result.statistics.winRate.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Zyskowne</div>
                          <div className="font-semibold text-green-400">
                            {result.statistics.profitablePositions}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Stratne</div>
                          <div className="font-semibold text-red-400">
                            {result.statistics.losingPositions}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Łączny PnL</div>
                          <div className={`font-semibold ${result.statistics.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {result.statistics.totalPnL >= 0 ? '+' : ''}{result.statistics.totalPnL.toFixed(2)} USDT
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Średni PnL</div>
                          <div className={`font-semibold ${result.statistics.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {result.statistics.avgPnL >= 0 ? '+' : ''}{result.statistics.avgPnL.toFixed(2)} USDT
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {result.url && (
                    <div className="space-y-2">
                      <Label className="text-gray-200">Publiczny Link do Pliku</Label>
                      <div className="flex gap-2">
                        <Input
                          value={result.url}
                          readOnly
                          className="bg-gray-800 border-gray-700 text-white font-mono text-xs"
                        />
                        <Button
                          onClick={() => {
                            navigator.clipboard.writeText(result.url!);
                            toast.success("Link skopiowany!");
                          }}
                          variant="outline"
                          className="border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-200"
                        >
                          Kopiuj
                        </Button>
                        <Button
                          onClick={() => window.open(result.url, '_blank')}
                          variant="outline"
                          className="border-gray-700 bg-gray-800/50 hover:bg-gray-800 text-gray-200"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-400">
                        Otwórz ten link aby pobrać plik JSON z archiwum
                      </p>
                    </div>
                  )}
                </>
              )}

              {result.success && !result.archived && (
                <div className="text-sm text-gray-300">
                  {result.message}
                </div>
              )}

              {!result.success && (
                <div className="text-sm text-red-400">
                  {result.error || result.message}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Instructions Card */}
        <Card className="border-gray-800 bg-gray-900/60">
          <CardHeader>
            <CardTitle className="text-white text-lg">📚 Instrukcje</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-300 space-y-3">
            <div>
              <h4 className="font-semibold text-white mb-1">1. Dostęp do plików w Supabase</h4>
              <p className="text-gray-400">
                Wejdź na <a href="https://supabase.com" target="_blank" className="text-blue-400 hover:underline">supabase.com</a> → Wybierz projekt → Storage → bucket "trading-archives"
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-1">2. Konfiguracja Cron Job</h4>
              <p className="text-gray-400">
                Wejdź na <a href="https://cron-job.org" target="_blank" className="text-blue-400 hover:underline">cron-job.org</a> → Create cronjob → URL: <code className="bg-gray-800 px-1 py-0.5 rounded">https://twoja-domena.vercel.app/api/archive/monthly-export</code> → Schedule: Every month, day 1, 00:00
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-1">3. Test Ręczny</h4>
              <p className="text-gray-400">
                Użyj formularza powyżej aby przetestować archiwizację przed skonfigurowaniem cron job
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
