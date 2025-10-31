"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Zap, CheckCircle, XCircle } from "lucide-react";

export default function TestWebhookKeysPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"Buy" | "Sell">("Buy");
  const [quantity, setQuantity] = useState("0.001");

  const testWithWebhookKeys = async () => {
    setLoading(true);
    setResult(null);

    try {
      // Krok 1: Pobierz klucze z bazy danych (te same co używa webhook)
      console.log("📥 Fetching API credentials from database (webhook source)...");
      const credentialsResponse = await fetch("/api/bot/settings");
      const credentialsData = await credentialsResponse.json();

      if (!credentialsData.success || !credentialsData.settings) {
        setResult({
          success: false,
          step: "fetch_credentials",
          error: "Failed to fetch bot settings from database",
          details: credentialsData
        });
        return;
      }

      const { apiKey, apiSecret, environment, exchange } = credentialsData.settings;

      if (!apiKey || !apiSecret) {
        setResult({
          success: false,
          step: "fetch_credentials",
          error: "API credentials not configured in database",
          solution: "Go to Exchange Test and save your API keys"
        });
        return;
      }

      console.log("✅ Credentials fetched from database:", {
        exchange,
        environment,
        apiKeyPreview: apiKey.substring(0, 8) + "..."
      });

      // Krok 2: Użyj endpoint /api/exchange/open-position z kluczami z bazy danych
      console.log("🚀 Opening position with webhook credentials...");
      const openResponse = await fetch("/api/exchange/open-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange,
          apiKey,
          apiSecret,
          environment,
          symbol,
          side,
          quantity,
          leverage: 10,
          stopLoss: null,
          takeProfit: null,
        })
      });

      const openData = await openResponse.json();

      if (openData.success) {
        setResult({
          success: true,
          step: "position_opened",
          message: "✅ SUKCES! Pozycja otwarta używając kluczy z bazy danych (webhook source)",
          orderId: openData.orderId,
          details: openData,
          credentials: {
            exchange,
            environment,
            apiKeyPreview: apiKey.substring(0, 8) + "..."
          }
        });
      } else {
        setResult({
          success: false,
          step: "position_failed",
          error: openData.error || "Failed to open position",
          code: openData.code,
          details: openData,
          credentials: {
            exchange,
            environment,
            apiKeyPreview: apiKey.substring(0, 8) + "..."
          }
        });
      }
    } catch (error) {
      setResult({
        success: false,
        step: "exception",
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : null
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-yellow-700 bg-gradient-to-br from-yellow-600/10 to-gray-900/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Zap className="h-6 w-6 text-yellow-400" />
              🔬 Test Webhook Keys - Otwórz Pozycję
            </CardTitle>
            <CardDescription className="text-gray-400">
              Ta strona używa <strong>DOKŁADNIE</strong> tych samych kluczy API co webhook (z bazy danych)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-blue-700 bg-blue-900/20">
              <AlertCircle className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-sm text-blue-300">
                <strong>Cel testu:</strong> Sprawdź czy klucze z bazy danych (używane przez webhook) 
                potrafią otworzyć pozycję. Jeśli TAK - problem jest gdzie indziej. Jeśli NIE - problem w kluczach.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <Label className="text-gray-300">Symbol</Label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="BTCUSDT"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>

              <div>
                <Label className="text-gray-300">Side</Label>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setSide("Buy")}
                    variant={side === "Buy" ? "default" : "outline"}
                    className={side === "Buy" ? "bg-green-600" : "border-gray-700"}
                  >
                    Buy (Long)
                  </Button>
                  <Button
                    onClick={() => setSide("Sell")}
                    variant={side === "Sell" ? "default" : "outline"}
                    className={side === "Sell" ? "bg-red-600" : "border-gray-700"}
                  >
                    Sell (Short)
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-gray-300">Quantity</Label>
                <Input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0.001"
                  type="number"
                  step="0.001"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>

              <Button
                onClick={testWithWebhookKeys}
                disabled={loading}
                className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white font-bold py-6"
                size="lg"
              >
                {loading ? "🔄 Testowanie..." : "🚀 Otwórz Pozycję (Webhook Keys)"}
              </Button>
            </div>

            {result && (
              <Card className={`border-2 ${result.success ? 'border-green-600 bg-green-900/20' : 'border-red-600 bg-red-900/20'}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    {result.success ? (
                      <>
                        <CheckCircle className="h-6 w-6 text-green-400" />
                        ✅ SUKCES!
                      </>
                    ) : (
                      <>
                        <XCircle className="h-6 w-6 text-red-400" />
                        ❌ BŁĄD
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {result.success ? (
                    <div className="space-y-3">
                      <Alert className="border-green-600 bg-green-900/30">
                        <AlertDescription className="text-green-300 font-semibold">
                          {result.message}
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between p-3 bg-gray-800/60 rounded">
                          <span className="text-gray-400">Order ID:</span>
                          <span className="font-mono text-green-400">{result.orderId}</span>
                        </div>
                        <div className="flex justify-between p-3 bg-gray-800/60 rounded">
                          <span className="text-gray-400">Exchange:</span>
                          <span className="text-white">{result.credentials?.exchange}</span>
                        </div>
                        <div className="flex justify-between p-3 bg-gray-800/60 rounded">
                          <span className="text-gray-400">Environment:</span>
                          <span className="text-white">{result.credentials?.environment}</span>
                        </div>
                        <div className="flex justify-between p-3 bg-gray-800/60 rounded">
                          <span className="text-gray-400">API Key:</span>
                          <span className="font-mono text-xs text-gray-300">{result.credentials?.apiKeyPreview}</span>
                        </div>
                      </div>

                      <Alert className="border-yellow-600 bg-yellow-900/20">
                        <AlertDescription className="text-yellow-300 text-sm">
                          <strong>✅ WNIOSEK:</strong> Klucze z bazy danych DZIAŁAJĄ! Problem webhook musi być gdzie indziej
                          (np. w logice filtrowania alertów, signing różnic, lub timing).
                        </AlertDescription>
                      </Alert>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Alert className="border-red-600 bg-red-900/30">
                        <AlertDescription className="text-red-300">
                          <strong>Błąd:</strong> {result.error}
                        </AlertDescription>
                      </Alert>

                      {result.code && (
                        <div className="p-3 bg-gray-800/60 rounded">
                          <span className="text-gray-400">Error Code:</span>{" "}
                          <span className="font-mono text-red-400">{result.code}</span>
                        </div>
                      )}

                      {result.credentials && (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between p-3 bg-gray-800/60 rounded">
                            <span className="text-gray-400">Exchange:</span>
                            <span className="text-white">{result.credentials.exchange}</span>
                          </div>
                          <div className="flex justify-between p-3 bg-gray-800/60 rounded">
                            <span className="text-gray-400">Environment:</span>
                            <span className="text-white">{result.credentials.environment}</span>
                          </div>
                          <div className="flex justify-between p-3 bg-gray-800/60 rounded">
                            <span className="text-gray-400">API Key:</span>
                            <span className="font-mono text-xs text-gray-300">{result.credentials.apiKeyPreview}</span>
                          </div>
                        </div>
                      )}

                      {result.solution && (
                        <Alert className="border-yellow-600 bg-yellow-900/20">
                          <AlertDescription className="text-yellow-300 text-sm">
                            <strong>💡 Rozwiązanie:</strong> {result.solution}
                          </AlertDescription>
                        </Alert>
                      )}

                      <details className="text-xs">
                        <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                          🔍 Pokaż szczegóły (JSON)
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-900 rounded overflow-auto text-gray-300">
                          {JSON.stringify(result, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Alert className="border-gray-700 bg-gray-900/60">
              <AlertDescription className="text-gray-400 text-sm space-y-2">
                <p><strong>🔍 Co ten test sprawdza:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Pobiera klucze API z bazy danych (ta sama metoda co webhook)</li>
                  <li>Używa endpoint /api/exchange/open-position (server-side)</li>
                  <li>Próbuje otworzyć pozycję z leverage 10x</li>
                  <li>Pokazuje DOKŁADNY błąd jeśli coś nie działa</li>
                </ul>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
