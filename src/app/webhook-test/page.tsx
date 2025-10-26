"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Zap, Send, CheckCircle, XCircle, AlertCircle, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function WebhookTestPage() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Przykładowy payload
  const [testPayload, setTestPayload] = useState(JSON.stringify({
    timestamp: Math.floor(Date.now() / 1000),
    symbol: "ETHUSDT",
    side: "BUY",
    tier: "Premium",
    tierNumeric: 4,
    strength: 0.85,
    entryPrice: "2500.50",
    sl: "2480.00",
    tp1: "2530.00",
    tp2: "2550.00",
    tp3: "2580.00",
    mainTp: "2530.00",
    atr: 25.5,
    volumeRatio: 1.45,
    session: "London",
    regime: "bullish",
    regimeConfidence: 0.8,
    mtfAgreement: 0.75,
    leverage: 10,
    inOb: true,
    inFvg: false,
    obScore: 0.9,
    fvgScore: 0.6,
    institutionalFlow: 1.2,
    accumulation: 0.8,
    volumeClimax: false,
    latency: 250
  }, null, 2));

  const webhookUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/api/webhook/tradingview`
    : "";

  const sendTestAlert = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);

    try {
      const payload = JSON.parse(testPayload);
      
      const res = await fetch("/api/webhook/tradingview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      
      if (res.ok) {
        setResponse(data);
        toast.success("Test alert wysłany pomyślnie!");
      } else {
        setError(data.error || "Nieznany błąd");
        toast.error("Błąd wysyłania test alertu");
      }
    } catch (err: any) {
      setError(err.message);
      toast.error("Błąd: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL webhook skopiowany!");
  };

  const openNgrokGuide = () => {
    window.open("https://ngrok.com/download", "_blank");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-600/30 to-purple-900/20 border border-purple-500/30">
            <Zap className="h-8 w-8 text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Test Webhooka
            </h1>
            <p className="text-gray-400">Testuj odbieranie alertów lokalnie przed konfiguracją TradingView</p>
          </div>
        </div>

        {/* Problem z localhost - Alert */}
        <Alert className="border-yellow-700 bg-yellow-900/20">
          <AlertCircle className="h-5 w-5 text-yellow-500" />
          <AlertDescription className="text-yellow-200">
            <div className="space-y-2">
              <p className="font-semibold text-lg">⚠️ Problem: TradingView nie może wysłać alertu do localhost!</p>
              <p>
                Jeśli pracujesz na <code className="bg-yellow-800/30 px-2 py-1 rounded text-yellow-300">localhost:3000</code>, 
                TradingView NIE MOŻE dotrzeć do twojego komputera z internetu.
              </p>
              <p className="font-semibold mt-3">✅ Rozwiązania:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><strong>Ngrok</strong> - tuneluj localhost na publiczny URL (polecane do testów)</li>
                <li><strong>Cloudflare Tunnel</strong> - darmowa alternatywa dla ngrok</li>
                <li><strong>Wdróż na serwer</strong> - Vercel, Railway, DigitalOcean (polecane do produkcji)</li>
              </ul>
            </div>
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Webhook URL Card */}
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white">URL Webhook</CardTitle>
              <CardDescription className="text-gray-500">Twój lokalny endpoint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-gray-800/60 border border-gray-700 rounded-md text-sm font-mono overflow-x-auto text-gray-300">
                  {webhookUrl}
                </code>
                <Button onClick={copyWebhookUrl} size="sm" className="bg-blue-600 hover:bg-blue-700">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              
              <Alert className="border-red-700 bg-red-900/20">
                <XCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-200 text-sm">
                  Ten URL <strong>NIE DZIAŁA</strong> dla TradingView! Użyj ngrok lub wdróż aplikację.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Ngrok Setup */}
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                🚀 Szybka konfiguracja Ngrok
              </CardTitle>
              <CardDescription className="text-gray-500">3 kroki do działającego webhooka</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Badge className="bg-blue-600 text-white shrink-0">1</Badge>
                  <div>
                    <p className="text-white font-semibold">Zainstaluj ngrok</p>
                    <Button 
                      onClick={openNgrokGuide}
                      size="sm" 
                      variant="outline" 
                      className="mt-2 border-gray-700 text-gray-300"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Pobierz ngrok
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Badge className="bg-purple-600 text-white shrink-0">2</Badge>
                  <div className="flex-1">
                    <p className="text-white font-semibold mb-2">Uruchom tunel</p>
                    <code className="block p-3 bg-gray-800/60 border border-gray-700 rounded-md text-sm font-mono text-green-400">
                      ngrok http 3000
                    </code>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Badge className="bg-green-600 text-white shrink-0">3</Badge>
                  <div>
                    <p className="text-white font-semibold">Skopiuj URL</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Ngrok pokaże publiczny URL np:<br/>
                      <code className="text-green-400">https://abc123.ngrok.io</code>
                    </p>
                    <p className="text-sm text-gray-400 mt-2">
                      Użyj: <code className="text-blue-400">https://abc123.ngrok.io/api/webhook/tradingview</code>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Test Alert Form */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">Wyślij Test Alert</CardTitle>
            <CardDescription className="text-gray-500">
              Testuj webhook lokalnie przed użyciem TradingView
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Payload JSON (edytowalny)</Label>
              <Textarea
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                className="font-mono text-sm min-h-[400px] bg-gray-800 border-gray-700 text-gray-300"
                placeholder="JSON payload"
              />
            </div>

            <Button 
              onClick={sendTestAlert}
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              size="lg"
            >
              <Send className={`mr-2 h-5 w-5 ${loading ? "animate-pulse" : ""}`} />
              {loading ? "Wysyłanie..." : "Wyślij Test Alert"}
            </Button>

            {/* Response */}
            {response && (
              <Alert className="border-green-700 bg-green-900/20">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold text-green-200 text-lg">✅ Sukces!</p>
                    <div className="bg-gray-800/60 p-3 rounded-md">
                      <pre className="text-xs text-green-300 overflow-x-auto">
                        {JSON.stringify(response, null, 2)}
                      </pre>
                    </div>
                    <p className="text-sm text-green-300">
                      Alert ID: <span className="font-mono font-bold">{response.alert_id}</span>
                    </p>
                    {response.position_id && (
                      <p className="text-sm text-green-300">
                        Position ID: <span className="font-mono font-bold">{response.position_id}</span>
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Error */}
            {error && (
              <Alert className="border-red-700 bg-red-900/20">
                <XCircle className="h-5 w-5 text-red-500" />
                <AlertDescription>
                  <p className="font-semibold text-red-200 text-lg">❌ Błąd</p>
                  <p className="text-red-300 mt-2">{error}</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* TradingView Configuration */}
        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">📋 Konfiguracja TradingView Alert</CardTitle>
            <CardDescription className="text-gray-500">
              Jak skonfigurować webhook w TradingView
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-gray-300">
              <div className="flex items-start gap-3">
                <Badge className="bg-blue-600 text-white shrink-0">1</Badge>
                <p>Otwórz wykres w TradingView i dodaj swój wskaźnik ICT/SMC</p>
              </div>
              
              <div className="flex items-start gap-3">
                <Badge className="bg-purple-600 text-white shrink-0">2</Badge>
                <p>Kliknij "Alert" (przycisk zegara) lub naciśnij Alt+A</p>
              </div>
              
              <div className="flex items-start gap-3">
                <Badge className="bg-green-600 text-white shrink-0">3</Badge>
                <div className="flex-1">
                  <p className="mb-2">W sekcji "Notifications" zaznacz <strong>"Webhook URL"</strong></p>
                  <p className="text-sm text-gray-400">
                    Wklej URL z ngrok:<br/>
                    <code className="text-blue-400 bg-gray-800 px-2 py-1 rounded">
                      https://your-ngrok-url.ngrok.io/api/webhook/tradingview
                    </code>
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Badge className="bg-yellow-600 text-white shrink-0">4</Badge>
                <div className="flex-1">
                  <p className="mb-2">W polu <strong>"Message"</strong> wklej JSON ze swojego wskaźnika</p>
                  <p className="text-sm text-gray-400">
                    Upewnij się że JSON zawiera wszystkie wymagane pola:<br/>
                    <code className="text-gray-500">symbol, side, tier, entryPrice, sl, tp1, tp2, tp3</code>
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Badge className="bg-red-600 text-white shrink-0">5</Badge>
                <p>Kliknij "Create" - TradingView wyśle test webhook aby sprawdzić połączenie</p>
              </div>
            </div>

            <Alert className="border-blue-700 bg-blue-900/20 mt-4">
              <CheckCircle className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-200 text-sm">
                <strong>Wskazówka:</strong> Możesz użyć strony <strong>/alerts</strong> aby zobaczyć czy alerty przychodzą poprawnie!
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
