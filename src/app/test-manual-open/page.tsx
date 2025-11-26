"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Rocket, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface TestResult {
  success: boolean;
  message: string;
  data?: any;
  step?: string;
}

export default function TestManualOpenPage() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"Buy" | "Sell">("Buy");
  const [quantity, setQuantity] = useState("0.001");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [credentials, setCredentials] = useState<any>(null);

  useEffect(() => {
    // Load credentials from localStorage
    const stored = localStorage.getItem("exchange_credentials");
    if (stored) {
      const creds = JSON.parse(stored);
      setCredentials(creds);
    }
  }, []);

  const signBybitRequest = async (
    apiKey: string,
    apiSecret: string,
    timestamp: number,
    payloadString: string
  ) => {
    const signString = timestamp + apiKey + "5000" + payloadString;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const messageData = encoder.encode(signString);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    
    return hashHex;
  };

  const testOpenPosition = async () => {
    if (!credentials) {
      setResult({
        success: false,
        message: "Brak zapisanych kluczy API. Przejdź do /exchange-test aby je skonfigurować.",
        step: "no_credentials"
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // ✅ DIRECT CONNECTION - No proxy (works from Vercel Singapore)
      const baseUrl = "https://api.bybit.com";

      console.log("🔧 Using DIRECT connection to Bybit API");
      console.log("🔧 Base URL:", baseUrl);

      // Step 1: Set Leverage (optional, non-critical)
      const timestamp1 = Date.now();
      const leveragePayload = {
        category: "linear",
        symbol,
        buyLeverage: "10",
        sellLeverage: "10"
      };
      const leveragePayloadString = JSON.stringify(leveragePayload);
      const leverageSignature = await signBybitRequest(
        credentials.apiKey,
        credentials.apiSecret,
        timestamp1,
        leveragePayloadString
      );

      console.log("🔑 Step 1: Setting leverage...");
      const leverageResponse = await fetch(`${baseUrl}/v5/position/set-leverage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BAPI-API-KEY": credentials.apiKey,
          "X-BAPI-TIMESTAMP": timestamp1.toString(),
          "X-BAPI-SIGN": leverageSignature,
          "X-BAPI-RECV-WINDOW": "5000"
        },
        body: leveragePayloadString
      });

      const leverageText = await leverageResponse.text();
      console.log("📥 Leverage response:", leverageText.substring(0, 500));

      // Step 2: Open Position (critical)
      const timestamp2 = Date.now();
      const orderPayload = {
        category: "linear",
        symbol,
        side,
        orderType: "Market",
        qty: quantity,
        timeInForce: "GTC"
      };
      const orderPayloadString = JSON.stringify(orderPayload);
      const orderSignature = await signBybitRequest(
        credentials.apiKey,
        credentials.apiSecret,
        timestamp2,
        orderPayloadString
      );

      console.log("🔑 Step 2: Opening position...");
      console.log("📤 Order Payload:", orderPayloadString);
      
      const orderResponse = await fetch(`${baseUrl}/v5/order/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BAPI-API-KEY": credentials.apiKey,
          "X-BAPI-TIMESTAMP": timestamp2.toString(),
          "X-BAPI-SIGN": orderSignature,
          "X-BAPI-RECV-WINDOW": "5000"
        },
        body: orderPayloadString
      });

      const orderText = await orderResponse.text();
      console.log("📥 Order response:", orderText);

      // Check if HTML (blocked)
      if (orderText.includes('<!DOCTYPE') || orderText.includes('<html')) {
        setResult({
          success: false,
          message: "❌ Request został zablokowany przez CloudFront!\n\nOtrzymano HTML zamiast JSON - blokada geograficzna.\n\n✅ ROZWIĄZANIE: Przenieś Vercel deployment do regionu Singapur/Hong Kong.",
          step: "cloudfront_block",
          data: { responsePreview: orderText.substring(0, 200) }
        });
        return;
      }

      // Parse JSON
      let orderData;
      try {
        orderData = JSON.parse(orderText);
      } catch (e) {
        setResult({
          success: false,
          message: `❌ Nieprawidłowa odpowiedź JSON:\n\n${orderText.substring(0, 300)}`,
          step: "parse_error"
        });
        return;
      }

      console.log("✅ Parsed order data:", orderData);

      // Check result
      if (orderData.retCode === 0) {
        setResult({
          success: true,
          message: `✅ POZYCJA OTWARTA POMYŚLNIE!\n\nOrder ID: ${orderData.result?.orderId}\nSymbol: ${symbol}\nSide: ${side}\nQuantity: ${quantity}\n\n🎉 Bezpośrednie połączenie działa!`,
          step: "success",
          data: orderData
        });
      } else {
        setResult({
          success: false,
          message: `❌ Bybit odrzucił order (retCode ${orderData.retCode}):\n\n${orderData.retMsg}\n\n🔍 Sprawdź uprawnienia klucza API i parametry.`,
          step: "order_rejected",
          data: orderData
        });
      }

    } catch (error) {
      console.error("❌ Error:", error);
      setResult({
        success: false,
        message: `❌ Błąd połączenia:\n\n${error instanceof Error ? error.message : "Nieznany błąd"}`,
        step: "network_error"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!credentials) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6 flex items-center justify-center">
        <Card className="max-w-md border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Brak kluczy API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-400">
              Nie znaleziono zapisanych kluczy API. Najpierw skonfiguruj połączenie z giełdą.
            </p>
            <Button onClick={() => window.location.href = "/exchange-test"} className="w-full">
              Przejdź do konfiguracji
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-green-600/30 to-green-900/20 border border-green-500/30">
            <Rocket className="h-8 w-8 text-green-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              🧪 Test Otwierania Pozycji (DIRECT)
            </h1>
            <p className="text-gray-400">Bezpośrednie połączenie do Bybit API (bez proxy)</p>
          </div>
        </div>

        <Alert className="border-blue-500 bg-blue-500/10">
          <AlertCircle className="h-5 w-5 text-blue-500" />
          <AlertDescription className="text-sm text-gray-300">
            <strong className="text-blue-400">🎯 CEL TEGO TESTU:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Jeśli ZADZIAŁA:</strong> Klucze są dobre i region Vercel jest OK</li>
              <li><strong>Jeśli NIE ZADZIAŁA:</strong> CloudFront blokuje region lub klucze nie mają uprawnień</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">Ustawienia Testu</CardTitle>
            <CardDescription className="text-gray-400">
              Używa kluczy: {credentials.exchange.toUpperCase()} · {credentials.environment}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="symbol" className="text-gray-300">Symbol</Label>
              <Input
                id="symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="BTCUSDT"
                className="bg-gray-800 border-gray-700 text-gray-300"
              />
              <p className="text-xs text-gray-500">Para tradingowa (np. BTCUSDT, ETHUSDT)</p>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Kierunek</Label>
              <RadioGroup value={side} onValueChange={(v) => setSide(v as "Buy" | "Sell")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Buy" id="buy" />
                  <Label htmlFor="buy" className="text-gray-300 cursor-pointer">
                    Buy (Long)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Sell" id="sell" />
                  <Label htmlFor="sell" className="text-gray-300 cursor-pointer">
                    Sell (Short)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity" className="text-gray-300">Ilość</Label>
              <Input
                id="quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.001"
                className="bg-gray-800 border-gray-700 text-gray-300"
              />
              <p className="text-xs text-gray-500">Minimalna ilość dla BTCUSDT to 0.001</p>
            </div>

            <Button
              onClick={testOpenPosition}
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 text-white"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Otwieranie pozycji...
                </>
              ) : (
                <>
                  <Rocket className="mr-2 h-5 w-5" />
                  🚀 Otwórz Pozycję (DIRECT)
                </>
              )}
            </Button>

            <Alert className="border-yellow-500 bg-yellow-500/10">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <AlertDescription className="text-xs text-gray-400">
                ⚠️ To otworzy PRAWDZIWĄ pozycję na {credentials.environment}! Upewnij się że rozumiesz ryzyko.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {result && (
          <Card className={`border-${result.success ? "green" : "red"}-500 bg-gray-900/80 backdrop-blur-sm`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                {result.success ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ✅ SUKCES!
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    ❌ BŁĄD
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <pre className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                {result.message}
              </pre>

              {result.data && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-300">
                    🔍 Pokaż szczegóły (JSON)
                  </summary>
                  <pre className="mt-2 bg-gray-800/50 p-3 rounded border border-gray-700 overflow-auto max-h-96 text-gray-400">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </details>
              )}

              {result.success && (
                <Alert className="border-green-500 bg-green-500/10">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <AlertDescription className="text-sm text-gray-300">
                    <strong className="text-green-400">🎉 Co to znaczy?</strong>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Twoje klucze API są <strong>w 100% poprawne</strong></li>
                      <li>Mają uprawnienia do tradingu</li>
                      <li>Signing działa poprawnie</li>
                      <li><strong>Jeśli webhook nie działa - problem jest w server-side implementacji, NIE w kluczach!</strong></li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg text-white">📋 Interpretacja Wyników</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-300">
            <div className="p-3 rounded-lg bg-gray-800/40">
              <strong className="text-green-400">✅ Jeśli test PRZESZEDŁ:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1 text-gray-400">
                <li>Klucze są dobre i mają uprawnienia</li>
                <li>Problem jest w server-side webhooku (inne IP, signing, headers)</li>
                <li>Porównaj signing między tym testem a `/api/exchange/open-position`</li>
              </ul>
            </div>

            <div className="p-3 rounded-lg bg-gray-800/40">
              <strong className="text-red-400">❌ Jeśli test NIE PRZESZEDŁ:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1 text-gray-400">
                <li><strong>CloudFlare block:</strong> Bybit blokuje zbyt wiele requestów - spróbuj Testnet</li>
                <li><strong>retCode != 0:</strong> Klucze nie mają uprawnień "Contract Trading"</li>
                <li><strong>Network error:</strong> Problem z siecią lub CORS</li>
              </ul>
            </div>

            <div className="p-3 rounded-lg bg-gray-800/40">
              <strong className="text-blue-400">🔍 Co dalej?</strong>
              <ul className="list-disc list-inside mt-1 space-y-1 text-gray-400">
                <li>Jeśli działa - porównaj kod tego testu z webhookiem</li>
                <li>Jeśli nie działa - zmień środowisko na Testnet lub sprawdź uprawnienia klucza</li>
                <li>Sprawdź logi w konsoli przeglądarki (F12) dla szczegółów</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}