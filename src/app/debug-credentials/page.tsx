"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, XCircle, RefreshCw } from "lucide-react";

interface DiagnosticResult {
  localStorage: any;
  database: any;
  comparison: {
    sameApiKey: boolean;
    sameEnvironment: boolean;
    sameExchange: boolean;
  };
  diagnosis: {
    dashboardUses: string;
    webhookUses: string;
    problem: string;
  };
}

export default function DebugCredentialsPage() {
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    setError(null);

    try {
      // Pobierz klucze z localStorage
      const stored = localStorage.getItem("exchange_credentials");
      const localKeys = stored ? JSON.parse(stored) : null;

      // Wyślij do endpointu diagnostycznego
      const response = await fetch("/api/debug/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localStorageKeys: localKeys }),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || "Nieznany błąd");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const syncToDatabase = async () => {
    const stored = localStorage.getItem("exchange_credentials");
    if (!stored) {
      alert("Brak kluczy w localStorage!");
      return;
    }

    const localKeys = JSON.parse(stored);

    try {
      const response = await fetch("/api/bot/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: localKeys.apiKey,
          apiSecret: localKeys.apiSecret,
          exchange: localKeys.exchange,
          environment: localKeys.environment,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert("✅ Klucze zsynchronizowane do bazy danych!");
        runDiagnostics(); // Odśwież diagnostykę
      } else {
        alert(`❌ Błąd: ${data.error || data.message}`);
      }
    } catch (err) {
      alert(`❌ Błąd: ${err instanceof Error ? err.message : "Nieznany błąd"}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-yellow-700 bg-yellow-900/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-400">
              <AlertCircle className="h-5 w-5" />
              🔍 DIAGNOSTYKA KLUCZY API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-300">
              Ta strona sprawdza dokładnie jakie klucze używa Dashboard (localStorage) vs Webhook (baza danych).
            </p>
            <Button onClick={runDiagnostics} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Odśwież Diagnostykę
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-red-700 bg-red-900/20">
            <CardContent className="p-4">
              <p className="text-red-400">❌ Błąd: {error}</p>
            </CardContent>
          </Card>
        )}

        {loading && (
          <Card className="border-gray-700 bg-gray-900/80">
            <CardContent className="p-8 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-gray-500" />
              <p className="text-gray-400">Sprawdzanie...</p>
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            {/* DIAGNOZA */}
            <Card className={`border-2 ${
              result.comparison.sameApiKey && result.comparison.sameEnvironment
                ? "border-green-700 bg-green-900/20"
                : "border-red-700 bg-red-900/20"
            }`}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${
                  result.comparison.sameApiKey && result.comparison.sameEnvironment
                    ? "text-green-400"
                    : "text-red-400"
                }`}>
                  {result.comparison.sameApiKey && result.comparison.sameEnvironment ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                  DIAGNOZA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700">
                  <p className="text-2xl font-bold text-white mb-2">
                    {result.diagnosis.problem}
                  </p>
                  <div className="space-y-2 text-sm text-gray-300">
                    <p>📱 Dashboard używa: <strong className="text-blue-400">{result.diagnosis.dashboardUses}</strong></p>
                    <p>🤖 Webhook używa: <strong className="text-purple-400">{result.diagnosis.webhookUses}</strong></p>
                  </div>
                </div>

                {!result.comparison.sameApiKey && (
                  <div className="p-4 rounded-lg bg-red-900/30 border border-red-700">
                    <p className="text-red-400 font-bold mb-2">⚠️ KLUCZE API SĄ RÓŻNE!</p>
                    <p className="text-sm text-gray-300 mb-4">
                      Dashboard używa kluczy z localStorage, ale webhook używa kluczy z bazy danych i są one RÓŻNE!
                    </p>
                    <Button onClick={syncToDatabase} className="bg-red-600 hover:bg-red-700">
                      Skopiuj klucze z localStorage do bazy danych
                    </Button>
                  </div>
                )}

                {!result.comparison.sameEnvironment && (
                  <div className="p-4 rounded-lg bg-orange-900/30 border border-orange-700">
                    <p className="text-orange-400 font-bold mb-2">⚠️ ŚRODOWISKO JEST RÓŻNE!</p>
                    <p className="text-sm text-gray-300">
                      Dashboard: <strong>{result.localStorage?.environment}</strong> vs
                      Webhook: <strong>{result.database?.environment}</strong>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* PORÓWNANIE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dashboard (localStorage) */}
              <Card className="border-blue-700 bg-blue-900/20">
                <CardHeader>
                  <CardTitle className="text-blue-400">📱 Dashboard (localStorage)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.localStorage ? (
                    <>
                      <div className="flex justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-gray-400">Exchange:</span>
                        <span className="text-white font-bold">{result.localStorage.exchange}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-gray-400">Environment:</span>
                        <span className="text-white font-bold">{result.localStorage.environment}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-gray-400">API Key:</span>
                        <span className="text-white font-mono text-xs">{result.localStorage.apiKeyPreview}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-gray-400">API Secret:</span>
                        <span className="text-white font-mono text-xs">{result.localStorage.apiSecretPreview}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-gray-400">Ma klucze:</span>
                        <span className={result.localStorage.hasApiKey && result.localStorage.hasApiSecret ? "text-green-400" : "text-red-400"}>
                          {result.localStorage.hasApiKey && result.localStorage.hasApiSecret ? "✅ TAK" : "❌ NIE"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-red-400">❌ Brak kluczy w localStorage</p>
                  )}
                </CardContent>
              </Card>

              {/* Webhook (Database) */}
              <Card className="border-purple-700 bg-purple-900/20">
                <CardHeader>
                  <CardTitle className="text-purple-400">🤖 Webhook (Database)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.database ? (
                    <>
                      <div className="flex justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-gray-400">Exchange:</span>
                        <span className="text-white font-bold">{result.database.exchange}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-gray-400">Environment:</span>
                        <span className="text-white font-bold">{result.database.environment}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-gray-400">API Key:</span>
                        <span className="text-white font-mono text-xs">{result.database.apiKeyPreview}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-gray-400">API Secret:</span>
                        <span className="text-white font-mono text-xs">{result.database.apiSecretPreview}</span>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-gray-800/40">
                        <span className="text-gray-400">Ma klucze:</span>
                        <span className={result.database.hasApiKey && result.database.hasApiSecret ? "text-green-400" : "text-red-400"}>
                          {result.database.hasApiKey && result.database.hasApiSecret ? "✅ TAK" : "❌ NIE"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-red-400">❌ Brak kluczy w bazie danych</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* STATUS PORÓWNANIA */}
            <Card className="border-gray-700 bg-gray-900/80">
              <CardHeader>
                <CardTitle className="text-white">📊 Status Porównania</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded bg-gray-800/40">
                  <span className="text-gray-400">Klucze API identyczne:</span>
                  <span className={result.comparison.sameApiKey ? "text-green-400" : "text-red-400"}>
                    {result.comparison.sameApiKey ? "✅ TAK" : "❌ NIE"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded bg-gray-800/40">
                  <span className="text-gray-400">Environment identyczny:</span>
                  <span className={result.comparison.sameEnvironment ? "text-green-400" : "text-red-400"}>
                    {result.comparison.sameEnvironment ? "✅ TAK" : "❌ NIE"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded bg-gray-800/40">
                  <span className="text-gray-400">Exchange identyczny:</span>
                  <span className={result.comparison.sameExchange ? "text-green-400" : "text-red-400"}>
                    {result.comparison.sameExchange ? "✅ TAK" : "❌ NIE"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
