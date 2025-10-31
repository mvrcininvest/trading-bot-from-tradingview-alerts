"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, Loader2, TrendingUp, AlertTriangle, Info } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRouter } from "next/navigation";

interface ConnectionResult {
  success: boolean;
  message: string;
  accountInfo?: {
    balances?: Array<{ asset: string; free: string; locked: string }>;
    canTrade?: boolean;
  };
}

type BybitEnvironment = "mainnet" | "testnet" | "demo";
type OkxEnvironment = "mainnet" | "demo";

export default function ExchangeTestPage() {
  const router = useRouter();
  const [exchange, setExchange] = useState<"binance" | "bybit" | "okx">("binance");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [testnet, setTestnet] = useState(true);
  const [bybitEnv, setBybitEnv] = useState<BybitEnvironment>("demo");
  const [okxEnv, setOkxEnv] = useState<OkxEnvironment>("demo");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [savedWithoutTest, setSavedWithoutTest] = useState(false);

  // Auto-load saved credentials on mount
  useEffect(() => {
    const loadCredentials = async () => {
      try {
        // Try to load from database first
        const response = await fetch("/api/bot/credentials");
        const data = await response.json();
        
        if (data.success && data.credentials) {
          const creds = data.credentials;
          if (creds.apiKey) {
            setExchange(creds.exchange || "binance");
            setApiKey(creds.apiKey || "");
            setApiSecret(creds.apiSecret || "");
            setPassphrase(creds.passphrase || "");
            
            if (creds.exchange === "binance") {
              setTestnet(creds.environment === "testnet");
            } else if (creds.exchange === "bybit") {
              setBybitEnv(creds.environment || "demo");
            } else if (creds.exchange === "okx") {
              setOkxEnv(creds.environment === "demo" ? "demo" : "mainnet");
            }
            console.log("✅ Credentials loaded from database");
            return;
          }
        }
        
        // Fallback to localStorage if database is empty
        const stored = localStorage.getItem("exchange_credentials");
        if (stored) {
          const creds = JSON.parse(stored);
          setExchange(creds.exchange || "binance");
          setApiKey(creds.apiKey || "");
          setApiSecret(creds.apiSecret || "");
          setPassphrase(creds.passphrase || "");
          
          if (creds.exchange === "binance") {
            setTestnet(creds.environment === "testnet");
          } else if (creds.exchange === "bybit") {
            setBybitEnv(creds.environment || "demo");
          } else if (creds.exchange === "okx") {
            setOkxEnv(creds.environment === "demo" ? "demo" : "mainnet");
          }
          console.log("✅ Credentials loaded from localStorage");
        }
      } catch (error) {
        console.error("Failed to load credentials:", error);
      }
    };
    
    loadCredentials();
  }, []);

  const testConnection = async () => {
    setLoading(true);
    setResult(null);
    setSavedWithoutTest(false);

    // 🔍 VALIDATION: Check if apiKey is UUID (invalid) BEFORE testing
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(apiKey)) {
      setResult({
        success: false,
        message: `❌ BŁĄD: Wprowadzony API Key wygląda na UUID!\n\nUUID: ${apiKey}\n\nTo NIE JEST prawdziwy klucz API! Musisz wprowadzić PRAWDZIWY klucz API z ${exchange.toUpperCase()}.\n\n💡 Prawdziwe klucze API to długie stringi (30-50+ znaków) bez myślników w formacie UUID.`
      });
      setLoading(false);
      return;
    }

    try {
      let payload: any = { exchange, apiKey, apiSecret };

      if (exchange === "binance") {
        payload.testnet = testnet;
      } else if (exchange === "bybit") {
        payload.testnet = bybitEnv === "testnet";
        payload.demo = bybitEnv === "demo";
      } else if (exchange === "okx") {
        payload.demo = okxEnv === "demo";
        payload.passphrase = passphrase;
      }

      const response = await fetch("/api/exchange/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      setResult(data);
      
      // CRITICAL FIX: Save credentials to database after successful test
      if (data.success) {
        let environment: string;
        if (exchange === "binance") {
          environment = testnet ? "testnet" : "mainnet";
        } else if (exchange === "bybit") {
          environment = bybitEnv;
        } else {
          environment = okxEnv;
        }

        const credentials = {
          exchange,
          apiKey,
          apiSecret,
          passphrase: exchange === "okx" ? passphrase : undefined,
          environment,
          savedAt: new Date().toISOString()
        };
        
        // Save to localStorage (for client-side dashboard)
        localStorage.setItem("exchange_credentials", JSON.stringify(credentials));
        
        // CRITICAL: Save to database (for server-side webhook)
        try {
          const dbResponse = await fetch("/api/bot/credentials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey: credentials.apiKey,
              apiSecret: credentials.apiSecret,
              passphrase: credentials.passphrase,
              exchange: credentials.exchange,
              environment: credentials.environment
            })
          });
          
          const dbData = await dbResponse.json();
          if (dbData.success) {
            console.log("✅ Credentials saved to database successfully");
          } else {
            console.error("❌ Failed to save credentials to database:", dbData.error);
          }
        } catch (error) {
          console.error("❌ Error saving credentials to database:", error);
        }
        
        // Update success message to mention database save
        setResult({
          ...data,
          message: data.message + "\n\n✅ Credentials zostały automatycznie zapisane do localStorage i bazy danych."
        });
        
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          router.push("/dashboard");
        }, 2000);
      }
    } catch (error) {
      setResult({
        success: false,
        message: `Błąd: ${error instanceof Error ? error.message : "Nieznany błąd"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const saveWithoutTesting = async () => {
    setSavedWithoutTest(true);
    setResult({
      success: true,
      message: "✅ Klucze API zostały zapisane bez testowania. Upewnij się, że klucze są poprawne przed rozpoczęciem tradingu.",
    });
    
    // Save keys to localStorage AND database
    let environment: string;
    if (exchange === "binance") {
      environment = testnet ? "testnet" : "mainnet";
    } else if (exchange === "bybit") {
      environment = bybitEnv;
    } else {
      environment = okxEnv;
    }

    const credentials = {
      exchange,
      apiKey,
      apiSecret,
      passphrase: exchange === "okx" ? passphrase : undefined,
      environment,
      savedAt: new Date().toISOString()
    };
    
    // Save to localStorage (for client-side dashboard)
    localStorage.setItem("exchange_credentials", JSON.stringify(credentials));
    
    // CRITICAL: Save to database (for server-side webhook)
    try {
      const response = await fetch("/api/bot/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          passphrase: credentials.passphrase,
          exchange: credentials.exchange,
          environment: credentials.environment
        })
      });
      
      const data = await response.json();
      if (data.success) {
        console.log("✅ Credentials saved to database successfully");
      } else {
        console.error("❌ Failed to save credentials to database:", data.error);
      }
    } catch (error) {
      console.error("❌ Error saving credentials to database:", error);
    }
    
    // Redirect to dashboard after 2 seconds
    setTimeout(() => {
      router.push("/dashboard");
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-600/30 to-purple-900/20 border border-purple-500/30">
            <TrendingUp className="h-8 w-8 text-purple-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Test Połączenia z Giełdą
            </h1>
            <p className="text-gray-400">Sprawdź połączenie z API giełdy przed rozpoczęciem tradingu</p>
          </div>
        </div>

        {exchange === "bybit" && bybitEnv === "demo" && (
          <Alert className="border-yellow-500 bg-yellow-500/10">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <AlertTitle className="text-yellow-500">Uwaga: Bybit Demo i CloudFlare</AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              API Bybit Demo jest chronione przez CloudFlare/WAF, co często powoduje błędy 403 podczas testowania.
              <strong> To NIE oznacza że Twoje klucze są nieprawidłowe</strong> - CloudFlare blokuje requesty testowe z serwerów.
              <br /><br />
              <strong>Rozwiązania:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Użyj przycisku <strong>"Zapisz bez testowania"</strong> poniżej - jeśli jesteś pewien że klucze są poprawne</li>
                <li>Spróbuj ponownie za 5-10 minut (tymczasowa blokada)</li>
                <li>Dodaj IP serwera do whitelisty w panelu API Bybit (jeśli dostępne)</li>
                <li>W prawdziwym tradingu (nie testowaniu) CloudFlare może pozwolić na requesty</li>
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">Konfiguracja API</CardTitle>
            <CardDescription className="text-gray-400">Wprowadź klucze API z wybranej giełdy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={exchange} onValueChange={(v) => setExchange(v as "binance" | "bybit" | "okx")}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="binance" className="bg-gray-800 text-white border-gray-700 hover:bg-gray-700">Binance</TabsTrigger>
                <TabsTrigger value="bybit" className="bg-gray-800 text-white border-gray-700 hover:bg-gray-700">Bybit</TabsTrigger>
                <TabsTrigger value="okx" className="bg-gray-800 text-white border-gray-700 hover:bg-gray-700">OKX</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey" className="text-gray-300">API Key</Label>
                <Input
                  id="apiKey"
                  type="text"
                  placeholder="Wprowadź swój API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-gray-300"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiSecret" className="text-gray-300">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  placeholder="Wprowadź swój API Secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-gray-300"
                />
              </div>

              {exchange === "okx" && (
                <div className="space-y-2">
                  <Label htmlFor="passphrase" className="text-gray-300">Passphrase</Label>
                  <Input
                    id="passphrase"
                    type="password"
                    placeholder="Wprowadź swoje Passphrase"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-gray-300"
                  />
                  <p className="text-xs text-gray-500">Passphrase utworzone podczas tworzenia klucza API</p>
                </div>
              )}

              {exchange === "binance" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="testnet"
                    checked={testnet}
                    onChange={(e) => setTestnet(e.target.checked)}
                    className="h-4 w-4 bg-gray-800 border-gray-700 text-purple-500 rounded focus:ring-purple-500"
                  />
                  <Label htmlFor="testnet" className="text-gray-300 cursor-pointer">
                    Użyj Testnet (zalecane do testów)
                  </Label>
                </div>
              ) : exchange === "bybit" ? (
                <div className="space-y-3">
                  <Label className="text-gray-300">Środowisko Bybit</Label>
                  <RadioGroup value={bybitEnv} onValueChange={(v) => setBybitEnv(v as BybitEnvironment)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="mainnet" id="mainnet" className="bg-gray-800 border-gray-700 text-gray-300" />
                      <Label htmlFor="mainnet" className="text-gray-300 cursor-pointer font-normal">
                        <span className="font-semibold text-gray-200">Mainnet</span> - Prawdziwe konto produkcyjne (prawdziwa płynność)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="demo" id="demo" className="bg-gray-800 border-gray-700 text-gray-300" />
                      <Label htmlFor="demo" className="text-gray-300 cursor-pointer font-normal">
                        <span className="font-semibold text-gray-200">Demo</span> - Konto demo (prawdziwa płynność, może być blokowane przez CloudFlare)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="testnet" id="testnet-radio" className="bg-gray-800 border-gray-700 text-gray-300" />
                      <Label htmlFor="testnet-radio" className="text-gray-300 cursor-pointer font-normal">
                        <span className="font-semibold text-gray-200">Testnet</span> - Środowisko testowe (mniejsza płynność)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label className="text-gray-300">Środowisko OKX</Label>
                  <RadioGroup value={okxEnv} onValueChange={(v) => setOkxEnv(v as OkxEnvironment)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="mainnet" id="okx-mainnet" className="bg-gray-800 border-gray-700 text-gray-300" />
                      <Label htmlFor="okx-mainnet" className="text-gray-300 cursor-pointer font-normal">
                        <span className="font-semibold text-gray-200">Mainnet</span> - Prawdziwe konto produkcyjne
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="demo" id="okx-demo" className="bg-gray-800 border-gray-700 text-gray-300" />
                      <Label htmlFor="okx-demo" className="text-gray-300 cursor-pointer font-normal">
                        <span className="font-semibold text-gray-200">Demo</span> - Demo Trading (prawdziwa płynność, środowisko testowe)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              <div className="flex gap-3">
                <Button 
                  onClick={testConnection} 
                  disabled={loading || !apiKey || !apiSecret || (exchange === "okx" && !passphrase)}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testowanie...
                    </>
                  ) : (
                    "Testuj Połączenie"
                  )}
                </Button>
                
                <Button 
                  onClick={saveWithoutTesting}
                  disabled={loading || !apiKey || !apiSecret || (exchange === "okx" && !passphrase)}
                  variant="outline"
                  className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Zapisz bez testowania
                </Button>
              </div>

              {exchange === "bybit" && bybitEnv === "mainnet" && (
                <Alert className="border-red-500 bg-red-500/10">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <AlertDescription className="text-sm text-gray-300">
                    <strong className="text-red-500">UWAGA:</strong> Używasz prawdziwego konta Bybit Mainnet. 
                    Wszystkie transakcje będą wykonywane z prawdziwymi środkami. Upewnij się, że rozumiesz ryzyko!
                  </AlertDescription>
                </Alert>
              )}

              {exchange === "okx" && okxEnv === "mainnet" && (
                <Alert className="border-red-500 bg-red-500/10">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <AlertDescription className="text-sm text-gray-300">
                    <strong className="text-red-500">UWAGA:</strong> Używasz prawdziwego konta OKX Mainnet. 
                    Wszystkie transakcje będą wykonywane z prawdziwymi środkami. Upewnij się, że rozumiesz ryzyko!
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card className={`border-${result.success ? "green-500" : "red-500"} bg-gray-900/80 backdrop-blur-sm`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.success ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    {savedWithoutTest ? "Klucze Zapisane" : "Połączenie Udane"}
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    Błąd Połączenia
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-300 mb-4 whitespace-pre-line">{result.message}</p>

              {!result.success && exchange === "bybit" && bybitEnv === "demo" && (
                <div className="mt-4 p-4 bg-gray-800/50 rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-gray-300">
                      <strong className="text-blue-500">Sugestia:</strong> Jeśli jesteś pewien że klucze są poprawne 
                      (stworzone w Demo Trading z wszystkimi uprawnieniami), możesz <strong>zapisać je bez testowania</strong> 
                      klikając przycisk "Zapisz bez testowania" powyżej. Klucze będą działać w prawdziwym tradingu mimo błędu testowego.
                    </div>
                  </div>
                </div>
              )}

              {result.success && result.accountInfo && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-200">Status tradingu:</span>
                    <span className={result.accountInfo.canTrade ? "text-green-500" : "text-red-500"}>
                      {result.accountInfo.canTrade ? "Aktywny" : "Nieaktywny"}
                    </span>
                  </div>

                  {result.accountInfo.balances && result.accountInfo.balances.length > 0 && (
                    <div>
                      <span className="font-semibold text-gray-200">Salda (top 5):</span>
                      <div className="mt-2 space-y-1">
                        {result.accountInfo.balances.slice(0, 5).map((balance, idx) => (
                          <div key={idx} className="text-sm flex justify-between p-2 bg-gray-800/50 rounded">
                            <span>{balance.asset}</span>
                            <span>Wolne: {balance.free} | Zablokowane: {balance.locked}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg text-white">Jak uzyskać klucze API?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-300">
            <p><strong>Binance:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Zaloguj się na Binance</li>
              <li>Przejdź do API Management w ustawieniach</li>
              <li>Utwórz nowy klucz API</li>
              <li>Włącz uprawnienia: "Enable Spot & Margin Trading"</li>
              <li>Dla testów użyj: <a href="https://testnet.binance.vision/" target="_blank" className="text-primary underline">Binance Testnet</a></li>
            </ol>
            <p className="mt-4"><strong>Bybit:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li><strong>Mainnet (zalecane dla prawdziwej płynności):</strong> Użyj prawdziwego konta Bybit → API Management → Utwórz klucz (ostrożnie z funduszami!)</li>
              <li><strong>Demo Account:</strong> Zaloguj się na Bybit → Przełącz na "Demo Trading" → API Management → Utwórz klucz (może być blokowane przez CloudFlare)</li>
              <li><strong>Testnet (mniejsza płynność):</strong> Zarejestruj się na <a href="https://testnet.bybit.com/" target="_blank" className="text-primary underline">testnet.bybit.com</a> → API Management</li>
              <li>Włącz uprawnienia tradingu przy tworzeniu klucza</li>
            </ol>
            <p className="mt-4"><strong>OKX:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li><strong>Demo Trading (zalecane do testów):</strong> Zaloguj się na OKX → Trading → Demo Trading → Personal Center → Create Demo APIKey</li>
              <li><strong>Mainnet:</strong> Użyj prawdziwego konta OKX → API Management → Utwórz klucz (ostrożnie z funduszami!)</li>
              <li>Włącz uprawnienia: "Trade" przy tworzeniu klucza</li>
              <li><strong>WAŻNE:</strong> Zapisz Passphrase - nie możesz go później odzyskać!</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}