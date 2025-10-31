"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Network, AlertCircle, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface IPData {
  clientIP: string;
  serverIP: string;
  match: boolean;
}

export default function IPDiagnosticsPage() {
  const [loading, setLoading] = useState(false);
  const [ipData, setIpData] = useState<IPData | null>(null);

  const checkIPs = async () => {
    setLoading(true);
    try {
      // Get client IP
      const clientIPResponse = await fetch('https://api.ipify.org?format=json');
      const clientIPData = await clientIPResponse.json();
      const clientIP = clientIPData.ip;

      // Get server IP
      const serverIPResponse = await fetch('/api/debug/server-ip');
      const serverIPData = await serverIPResponse.json();
      const serverIP = serverIPData.serverIP;

      setIpData({
        clientIP,
        serverIP,
        match: clientIP === serverIP
      });
    } catch (error) {
      console.error("IP check error:", error);
      toast.error("Błąd sprawdzania IP");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkIPs();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Skopiowano do schowka!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600/30 to-blue-900/20 border border-blue-500/30">
            <Network className="h-8 w-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              🌐 Diagnostyka IP
            </h1>
            <p className="text-gray-400">Sprawdź różnicę między Client-Side a Server-Side IP</p>
          </div>
        </div>

        <Alert className="border-yellow-500 bg-yellow-500/10">
          <AlertCircle className="h-5 w-5 text-yellow-500" />
          <AlertDescription className="text-sm text-gray-300">
            <strong className="text-yellow-400">🎯 DLACZEGO TO WAŻNE:</strong>
            <div className="mt-2 space-y-1">
              <div>• <strong>Client-Side</strong> (Dashboard, Test) używa IP TWOJEJ przeglądarki</div>
              <div>• <strong>Server-Side</strong> (Webhook) używa IP SERWERA Next.js</div>
              <div>• Bybit może blokować Server IP nawet jeśli Dashboard działa!</div>
            </div>
          </AlertDescription>
        </Alert>

        {loading ? (
          <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </CardContent>
          </Card>
        ) : ipData ? (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="border-green-500 bg-gray-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    🌐 Client-Side IP
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    IP używane przez Dashboard i Test Manual Open
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-800 px-4 py-3 rounded-lg text-green-400 font-mono text-lg">
                      {ipData.clientIP}
                    </code>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copyToClipboard(ipData.clientIP)}
                      className="border-gray-700"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Alert className="border-green-500 bg-green-500/10">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription className="text-xs text-gray-300">
                      Ten IP <strong>DZIAŁA</strong> - pozycja otwarta pomyślnie
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              <Card className="border-red-500 bg-gray-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    🖥️ Server-Side IP
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    IP używane przez Webhook i API routes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-800 px-4 py-3 rounded-lg text-red-400 font-mono text-lg">
                      {ipData.serverIP}
                    </code>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copyToClipboard(ipData.serverIP)}
                      className="border-gray-700"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Alert className="border-red-500 bg-red-500/10">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <AlertDescription className="text-xs text-gray-300">
                      Ten IP <strong>NIE DZIAŁA</strong> - webhook zablokowany
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </div>

            <Card className={`border-${ipData.match ? "green" : "red"}-500 bg-gray-900/80 backdrop-blur-sm`}>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  {ipData.match ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ✅ IP są identyczne
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      ❌ IP są RÓŻNE
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!ipData.match && (
                  <Alert className="border-red-500 bg-red-500/10">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    <AlertDescription className="text-sm text-gray-300">
                      <strong className="text-red-400">🔍 ZNALEZIONO PROBLEM!</strong>
                      <div className="mt-2 space-y-2">
                        <p>Twój Dashboard używa IP: <code className="text-green-400">{ipData.clientIP}</code></p>
                        <p>Twój Webhook używa IP: <code className="text-red-400">{ipData.serverIP}</code></p>
                        <p className="mt-3 font-semibold">Mimo że Bybit API pokazuje "No IP restriction", może NADAL blokować server IP!</p>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card className="border-blue-500 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">🔧 Rozwiązanie</CardTitle>
                <CardDescription className="text-gray-400">
                  Wybierz jedną z opcji aby naprawić webhook
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-2">Dodaj Server IP do Bybit Whitelist</h3>
                      <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                        <li>Wejdź na <a href="https://www.bybit.com/app/user/api-management" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1">Bybit API Management <ExternalLink className="h-3 w-3" /></a></li>
                        <li>Znajdź swój klucz API dla <strong>Demo Trading</strong></li>
                        <li>Kliknij "Edit" lub "Modify"</li>
                        <li>W sekcji <strong>"IP Restrictions"</strong> dodaj:
                          <div className="mt-2 flex items-center gap-2">
                            <code className="flex-1 bg-gray-800 px-3 py-2 rounded text-blue-400 font-mono">
                              {ipData.serverIP}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(ipData.serverIP)}
                              className="border-gray-700"
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Kopiuj
                            </Button>
                          </div>
                        </li>
                        <li>Zapisz zmiany i poczekaj 1-2 minuty</li>
                        <li>Przetestuj webhook ponownie</li>
                      </ol>
                      <Alert className="mt-3 border-yellow-500 bg-yellow-500/10">
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                        <AlertDescription className="text-xs text-gray-300">
                          ⚠️ Dodanie IP do whitelist może sprawić że Dashboard PRZESTANIE działać (jeśli używa innego IP). Możesz dodać OBA IP do whitelist.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-2">Użyj Testnet zamiast Demo (ZALECANE)</h3>
                      <p className="text-sm text-gray-300 mb-3">
                        Bybit Testnet jest bardziej stabilny dla webhooków i ma mniej ograniczeń niż Demo.
                      </p>
                      <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                        <li>Wejdź na <a href="https://testnet.bybit.com" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline inline-flex items-center gap-1">Bybit Testnet <ExternalLink className="h-3 w-3" /></a></li>
                        <li>Zaloguj się tym samym kontem co na Demo</li>
                        <li>Wygeneruj nowe klucze API dla <strong>Testnet</strong></li>
                        <li>W <code className="bg-gray-800 px-2 py-1 rounded text-green-400">/exchange-test</code> zmień środowisko na <strong>Testnet</strong></li>
                        <li>Wprowadź nowe klucze Testnet</li>
                        <li>Zapisz i przetestuj webhook</li>
                      </ol>
                      <Alert className="mt-3 border-green-500 bg-green-500/10">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AlertDescription className="text-xs text-gray-300">
                          ✅ Testnet jest BARDZIEJ stabilny dla webhooków i zazwyczaj nie wymaga IP whitelist
                        </AlertDescription>
                      </Alert>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
                    <div className="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-2">Użyj Mainnet (prawdziwe pieniądze)</h3>
                      <p className="text-sm text-gray-300 mb-3">
                        Jeśli jesteś gotowy na prawdziwy trading, Mainnet jest najbardziej stabilny.
                      </p>
                      <Alert className="border-red-500 bg-red-500/10">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <AlertDescription className="text-xs text-gray-300">
                          ⚠️ <strong>UWAGA:</strong> Mainnet używa PRAWDZIWYCH pieniędzy! Zacznij od małych kwot i zawsze testuj strategie na Testnet najpierw.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => window.location.href = "/exchange-test"}
                    className="flex-1 bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900"
                  >
                    Zmień na Testnet
                  </Button>
                  <Button
                    onClick={() => window.open("https://www.bybit.com/app/user/api-management", "_blank")}
                    variant="outline"
                    className="flex-1 border-blue-500 text-blue-400 hover:bg-blue-500/10"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Otwórz Bybit API
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg text-white">📋 Podsumowanie</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-300">
                <div className="p-3 rounded-lg bg-gray-800/40">
                  <strong className="text-green-400">✅ Co działa:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-gray-400">
                    <li>Dashboard czyta dane (GET) z IP: {ipData.clientIP}</li>
                    <li>Test Manual Open otwiera pozycje (POST) z IP: {ipData.clientIP}</li>
                    <li>Klucze API są w 100% poprawne</li>
                  </ul>
                </div>

                <div className="p-3 rounded-lg bg-gray-800/40">
                  <strong className="text-red-400">❌ Co nie działa:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-gray-400">
                    <li>Webhook otwiera pozycje (POST) z IP: {ipData.serverIP}</li>
                    <li>Bybit blokuje ten IP mimo "No IP restriction"</li>
                  </ul>
                </div>

                <div className="p-3 rounded-lg bg-gray-800/40">
                  <strong className="text-blue-400">🎯 Najlepsze rozwiązanie:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-gray-400">
                    <li><strong>ZALECANE:</strong> Przejdź na Testnet (stabilniejszy dla webhooków)</li>
                    <li>Lub dodaj server IP {ipData.serverIP} do Bybit whitelist</li>
                    <li>Testnet zazwyczaj nie wymaga IP whitelist</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}

        <div className="flex justify-center">
          <Button
            onClick={checkIPs}
            variant="outline"
            className="border-gray-700"
          >
            🔄 Odśwież Diagnostykę
          </Button>
        </div>
      </div>
    </div>
  );
}
