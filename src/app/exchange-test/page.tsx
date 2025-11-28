"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, Loader2, TrendingUp, AlertTriangle, Lock, Unlock } from "lucide-react";
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

interface CloudFrontLockStatus {
  lockActive: boolean;
  botEnabled: boolean;
  lockSetAt: string | null;
  message: string;
}

export default function ExchangeTestPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [savedWithoutTest, setSavedWithoutTest] = useState(false);
  const [lockStatus, setLockStatus] = useState<CloudFrontLockStatus | null>(null);
  const [checkingLock, setCheckingLock] = useState(true);
  const [resettingLock, setResettingLock] = useState(false);

  // Check CloudFront lock status on mount
  useEffect(() => {
    checkLockStatus();
  }, []);

  const checkLockStatus = async () => {
    setCheckingLock(true);
    try {
      const response = await fetch("/api/bot/cloudfront-lock-status");
      const data = await response.json();
      if (data.success) {
        setLockStatus(data);
      }
    } catch (error) {
      console.error("Failed to check lock status:", error);
    } finally {
      setCheckingLock(false);
    }
  };

  const resetLock = async () => {
    setResettingLock(true);
    try {
      const response = await fetch("/api/bot/reset-cloudfront-lock", {
        method: "POST",
      });
      const data = await response.json();
      
      if (data.success) {
        // Refresh lock status
        await checkLockStatus();
        setResult({
          success: true,
          message: "✅ CloudFront lock został zresetowany! Możesz teraz przetestować połączenie.",
        });
      } else {
        setResult({
          success: false,
          message: `❌ Nie udało się zresetować lock-a: ${data.message}`,
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: `❌ Błąd podczas resetowania: ${error instanceof Error ? error.message : "Nieznany błąd"}`,
      });
    } finally {
      setResettingLock(false);
    }
  };

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
            setApiKey(creds.apiKey || "");
            setApiSecret(creds.apiSecret || "");
            console.log("✅ Credentials loaded from database");
            return;
          }
        }
        
        // Fallback to localStorage if database is empty
        const stored = localStorage.getItem("exchange_credentials");
        if (stored) {
          const creds = JSON.parse(stored);
          setApiKey(creds.apiKey || "");
          setApiSecret(creds.apiSecret || "");
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

    try {
      const payload = { 
        exchange: "bybit", 
        apiKey, 
        apiSecret 
      };

      const response = await fetch("/api/exchange/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      setResult(data);
      
      if (data.success) {
        const credentials = {
          exchange: "bybit",
          apiKey,
          apiSecret,
          environment: "mainnet",
          savedAt: new Date().toISOString()
        };
        
        localStorage.setItem("exchange_credentials", JSON.stringify(credentials));
        
        try {
          const dbResponse = await fetch("/api/bot/credentials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey: credentials.apiKey,
              apiSecret: credentials.apiSecret,
              exchange: "bybit",
              environment: "mainnet"
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
        
        setResult({
          ...data,
          message: data.message + "\n\n✅ Credentials zostały automatycznie zapisane do localStorage i bazy danych."
        });
        
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
    
    const credentials = {
      exchange: "bybit",
      apiKey,
      apiSecret,
      environment: "mainnet",
      savedAt: new Date().toISOString()
    };
    
    // Save to localStorage
    localStorage.setItem("exchange_credentials", JSON.stringify(credentials));
    
    // Save to database
    try {
      const response = await fetch("/api/bot/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          exchange: "bybit",
          environment: "mainnet"
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
              Test Połączenia - Bybit Mainnet
            </h1>
            <p className="text-gray-300">Sprawdź połączenie z API Bybit przed rozpoczęciem tradingu</p>
          </div>
        </div>

        {/* CloudFront Lock Warning */}
        {checkingLock ? (
          <Card className="border-gray-700 bg-gray-800/50">
            <CardContent className="py-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                <span className="text-gray-300">Sprawdzam status CloudFront lock...</span>
              </div>
            </CardContent>
          </Card>
        ) : lockStatus?.lockActive ? (
          <Alert className="border-red-500 bg-red-500/10">
            <Lock className="h-5 w-5 text-red-500" />
            <AlertTitle className="text-red-500 font-bold">🔒 CloudFront Lock Aktywny!</AlertTitle>
            <AlertDescription className="text-sm text-gray-300 space-y-3">
              <p>
                <strong className="text-red-400">Bot został automatycznie wyłączony</strong> z powodu wcześniejszej blokady CloudFront.
              </p>
              <p className="text-xs text-gray-400">
                Lock ustawiony: {lockStatus.lockSetAt ? new Date(lockStatus.lockSetAt.replace('CLOUDFRONT_LOCK_', '')).toLocaleString('pl-PL') : 'Nieznana data'}
              </p>
              <div className="flex gap-3 mt-3">
                <Button
                  onClick={resetLock}
                  disabled={resettingLock}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {resettingLock ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetuję...
                    </>
                  ) : (
                    <>
                      <Unlock className="mr-2 h-4 w-4" />
                      Zresetuj Lock i Testuj Ponownie
                    </>
                  )}
                </Button>
                <Button
                  onClick={checkLockStatus}
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Odśwież Status
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                💡 <strong>Co to oznacza?</strong> Serwer na Render wykrył blokadę CloudFront od Bybit (geo-restriction). 
                Po zresetowaniu lock-a możesz przetestować połączenie ponownie.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-green-500 bg-green-500/10">
            <Unlock className="h-5 w-5 text-green-500" />
            <AlertTitle className="text-green-500">✅ CloudFront Lock NIE jest aktywny</AlertTitle>
            <AlertDescription className="text-sm text-gray-300">
              Bot może normalnie łączyć się z Bybit API. Możesz przetestować połączenie.
            </AlertDescription>
          </Alert>
        )}

        <Alert className="border-blue-500 bg-blue-500/10">
          <AlertTriangle className="h-5 w-5 text-blue-500" />
          <AlertTitle className="text-blue-500">🌐 Używam bezpośredniego połączenia z Bybit</AlertTitle>
          <AlertDescription className="text-sm text-gray-300">
            Wszystkie zapytania idą bezpośrednio do <code className="text-xs bg-gray-800 px-1 py-0.5 rounded">https://api.bybit.com</code>
            <br />
            <strong className="text-blue-300">Region Render:</strong> {process.env.VERCEL_REGION || 'Frankfurt (automatyczny)'}
          </AlertDescription>
        </Alert>

        <Alert className="border-red-500 bg-red-500/10">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <AlertTitle className="text-red-500">⚠️ UWAGA: BYBIT MAINNET - PRAWDZIWE PIENIĄDZE!</AlertTitle>
          <AlertDescription className="text-sm text-gray-300">
            <strong className="text-red-400">Używasz prawdziwego konta Bybit Mainnet.</strong> Wszystkie transakcje będą wykonywane z prawdziwymi środkami.
            <br /><br />
            <strong className="text-red-300">Zalecenia bezpieczeństwa:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-300">
              <li>Ustaw małe pozycje ($5-10) w ustawieniach bota</li>
              <li>Używaj niskiej dźwigni (max 10x)</li>
              <li>Zawsze miej ustawione SL/TP</li>
              <li>Monitoruj pozycje regularnie</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">Konfiguracja API Bybit</CardTitle>
            <CardDescription className="text-gray-300">Wprowadź klucze API z Bybit Mainnet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey" className="text-gray-200">API Key</Label>
                <Input
                  id="apiKey"
                  type="text"
                  placeholder="Wprowadź swój Bybit API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiSecret" className="text-gray-200">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  placeholder="Wprowadź swój Bybit API Secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={testConnection} 
                  disabled={loading || !apiKey || !apiSecret}
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
                  disabled={loading || !apiKey || !apiSecret}
                  variant="outline"
                  className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Zapisz bez testowania
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card className={`border-${result.success ? "green-500" : "red-500"} bg-gray-900/80 backdrop-blur-sm`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
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
              <p className="text-sm text-gray-200 mb-4 whitespace-pre-line">{result.message}</p>

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
                          <div key={idx} className="text-sm flex justify-between p-2 bg-gray-800/50 rounded text-gray-200">
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
            <CardTitle className="text-lg text-white">Jak uzyskać klucze API Bybit?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-200">
            <p><strong className="text-white">Bybit Mainnet (PRAWDZIWE PIENIĄDZE):</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Zaloguj się na <a href="https://www.bybit.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Bybit.com</a></li>
              <li>Idź do: Profile icon → <strong>API Management</strong></li>
              <li>Create New Key / + API</li>
              <li>Włącz uprawnienia: <strong>Contract - Trade</strong>, <strong>Contract - Position</strong></li>
              <li><strong>IP Whitelisting</strong> (opcjonalnie ale zalecane dla bezpieczeństwa)</li>
              <li>Potwierdź z 2FA (Google Authenticator lub Email)</li>
              <li><strong>WAŻNE:</strong> API Secret pokazuje się tylko RAZ - zapisz go natychmiast!</li>
            </ol>
            
            <div className="mt-4 p-4 bg-red-900/20 border-2 border-red-700 rounded-lg">
              <p className="text-base font-bold text-red-200 mb-2">
                🔐 Bezpieczeństwo API Keys:
              </p>
              <ul className="space-y-1 text-sm text-gray-200 list-disc list-inside">
                <li><strong className="text-white">NIE udostępniaj</strong> nikomu swoich kluczy API</li>
                <li><strong className="text-white">Whitelist IP</strong> jeśli to możliwe</li>
                <li><strong className="text-white">Włącz tylko niezbędne</strong> uprawnienia (Contract Trade, Position)</li>
                <li><strong className="text-white">Regularnie rotuj</strong> klucze API (co 30-90 dni)</li>
                <li><strong className="text-white">Ustaw limity</strong> w ustawieniach bota (małe pozycje!)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}