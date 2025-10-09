"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, Save, AlertCircle, Bot, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

interface BotSettings {
  id: number;
  botEnabled: boolean;
  positionSizeMode: "percent" | "fixed_amount";
  positionSizePercent: number;
  positionSizeFixed: number;
  leverageMode: "from_alert" | "fixed";
  leverageFixed: number;
  tierFilteringMode: "all" | "custom";
  disabledTiers: string;
  tpStrategy: "multiple" | "main_only";
  maxConcurrentPositions: number;
  sameSymbolBehavior: "ignore" | "track_confirmations" | "upgrade_tp" | "emergency_override";
  oppositeDirectionStrategy: "market_reversal" | "immediate_reverse" | "defensive_close" | "ignore_opposite" | "tier_based";
  reversalWaitBars: number;
  reversalMinStrength: number;
  emergencyCanReverse: boolean;
  emergencyOverrideMode: "always" | "only_profit" | "profit_above_x" | "never";
  emergencyMinProfitPercent: number;
  createdAt: string;
  updatedAt: string;
}

const ALL_TIERS = ["Platinum", "Premium", "Standard", "Quick", "Emergency"];

export default function UstawieniaBotaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [disabledTiersList, setDisabledTiersList] = useState<string[]>([]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/bot/settings");
      
      if (!response.ok) {
        throw new Error("Nie udało się pobrać ustawień");
      }

      const data = await response.json();
      setSettings(data);
      
      // Parse disabled tiers
      const parsedTiers = JSON.parse(data.disabledTiers || "[]");
      setDisabledTiersList(parsedTiers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
      toast.error("Nie udało się załadować ustawień bota");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      
      // Prepare update payload
      const payload = {
        ...settings,
        disabledTiers: JSON.stringify(disabledTiersList)
      };

      const response = await fetch("/api/bot/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Nie udało się zapisać ustawień");
      }

      const updatedSettings = await response.json();
      setSettings(updatedSettings);
      toast.success("Ustawienia bota zostały zapisane!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd podczas zapisywania");
    } finally {
      setSaving(false);
    }
  };

  const toggleTier = (tier: string) => {
    setDisabledTiersList(prev => 
      prev.includes(tier) 
        ? prev.filter(t => t !== tier)
        : [...prev, tier]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Ładowanie ustawień...</p>
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Błąd
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{error || "Nie znaleziono ustawień bota"}</p>
            <Button onClick={fetchSettings} className="w-full">
              Spróbuj ponownie
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="h-8 w-8" />
            <div>
              <h1 className="text-3xl font-bold">Ustawienia Bota</h1>
              <p className="text-muted-foreground">Konfiguracja automatycznego tradingu</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Dashboard
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Zapisywanie...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Zapisz
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Bot Status */}
        <Card>
          <CardHeader>
            <CardTitle>Status Bota</CardTitle>
            <CardDescription>Włącz lub wyłącz automatyczny trading</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Bot Automatyczny</Label>
                <p className="text-sm text-muted-foreground">
                  {settings.botEnabled ? "🟢 Bot AKTYWNY - Automatycznie otwiera pozycje" : "🔴 Bot WYŁĄCZONY - Tylko monitorowanie"}
                </p>
              </div>
              <Switch
                checked={settings.botEnabled}
                onCheckedChange={(checked) => setSettings({ ...settings, botEnabled: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Wielkość Pozycji */}
        <Card>
          <CardHeader>
            <CardTitle>Wielkość Pozycji</CardTitle>
            <CardDescription>Określ wielkość pojedynczej pozycji (kwota po dźwigni)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={settings.positionSizeMode}
              onValueChange={(value: "percent" | "fixed_amount") => 
                setSettings({ ...settings, positionSizeMode: value })
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="percent" id="percent" />
                <Label htmlFor="percent" className="font-normal cursor-pointer">
                  Procent salda USDT
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fixed_amount" id="fixed_amount" />
                <Label htmlFor="fixed_amount" className="font-normal cursor-pointer">
                  Stała kwota (USD)
                </Label>
              </div>
            </RadioGroup>

            {settings.positionSizeMode === "percent" ? (
              <div className="space-y-2">
                <Label>Procent salda na trade (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={settings.positionSizePercent}
                  onChange={(e) => setSettings({ ...settings, positionSizePercent: parseFloat(e.target.value) || 2.0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Domyślnie: 2% (bezpieczne), max: 100%
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Stała kwota per trade (USD)</Label>
                <Input
                  type="number"
                  step="10"
                  min="10"
                  value={settings.positionSizeFixed}
                  onChange={(e) => setSettings({ ...settings, positionSizeFixed: parseFloat(e.target.value) || 100 })}
                />
                <p className="text-xs text-muted-foreground">
                  Domyślnie: 100 USD (wartość pozycji PO dźwigni)
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leverage */}
        <Card>
          <CardHeader>
            <CardTitle>Dźwignia (Leverage)</CardTitle>
            <CardDescription>Źródło dźwigni dla otwieranych pozycji</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={settings.leverageMode}
              onValueChange={(value: "from_alert" | "fixed") => 
                setSettings({ ...settings, leverageMode: value })
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="from_alert" id="from_alert" />
                <Label htmlFor="from_alert" className="font-normal cursor-pointer">
                  Z alertu (polecana przez wskaźnik) ⭐
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fixed" id="fixed" />
                <Label htmlFor="fixed" className="font-normal cursor-pointer">
                  Stała dźwignia
                </Label>
              </div>
            </RadioGroup>

            {settings.leverageMode === "fixed" && (
              <div className="space-y-2">
                <Label>Stała dźwignia</Label>
                <Input
                  type="number"
                  min="1"
                  max="125"
                  value={settings.leverageFixed}
                  onChange={(e) => setSettings({ ...settings, leverageFixed: parseInt(e.target.value) || 10 })}
                />
                <p className="text-xs text-muted-foreground">
                  Bybit max: 125x (nie zalecane powyżej 20x dla bezpieczeństwa)
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tier Filtering */}
        <Card>
          <CardHeader>
            <CardTitle>Filtrowanie Tierów</CardTitle>
            <CardDescription>Wybierz które tiery sygnałów bot ma tradować</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={settings.tierFilteringMode}
              onValueChange={(value: "all" | "custom") => 
                setSettings({ ...settings, tierFilteringMode: value })
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all_tiers" />
                <Label htmlFor="all_tiers" className="font-normal cursor-pointer">
                  Wszystkie tiery (domyślne) ✅
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="custom_tiers" />
                <Label htmlFor="custom_tiers" className="font-normal cursor-pointer">
                  Wyłącz wybrane tiery
                </Label>
              </div>
            </RadioGroup>

            {settings.tierFilteringMode === "custom" && (
              <div className="space-y-2 pl-6 border-l-2">
                <Label>Wyłączone tiery (NIE będą tradowane):</Label>
                {ALL_TIERS.map(tier => (
                  <div key={tier} className="flex items-center space-x-2">
                    <Checkbox
                      id={`tier_${tier}`}
                      checked={disabledTiersList.includes(tier)}
                      onCheckedChange={() => toggleTier(tier)}
                    />
                    <Label htmlFor={`tier_${tier}`} className="font-normal cursor-pointer">
                      {tier}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* TP Strategy */}
        <Card>
          <CardHeader>
            <CardTitle>Strategia Take Profit</CardTitle>
            <CardDescription>Wybierz sposób zarządzania poziomami TP</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={settings.tpStrategy}
              onValueChange={(value: "multiple" | "main_only") => 
                setSettings({ ...settings, tpStrategy: value })
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="multiple" id="multiple_tp" />
                <Label htmlFor="multiple_tp" className="font-normal cursor-pointer">
                  Multiple TP (TP1/TP2/TP3) ⭐ Zalecane
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="main_only" id="main_only" />
                <Label htmlFor="main_only" className="font-normal cursor-pointer">
                  Tylko główny TP
                </Label>
              </div>
            </RadioGroup>

            {settings.tpStrategy === "multiple" && (
              <Alert>
                <AlertDescription className="text-xs">
                  <strong>Multiple TP:</strong><br />
                  • TP1 (50% RR): Zamknij 50% pozycji, przesuń SL do breakeven<br />
                  • TP2 (100% RR): Zamknij 30% pozycji, trail SL agresywnie<br />
                  • TP3 (150% RR): Zamknij pozostałe 20%
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Same Symbol Behavior */}
        <Card>
          <CardHeader>
            <CardTitle>Zachowanie dla Tego Samego Symbolu</CardTitle>
            <CardDescription>Co zrobić gdy przyjdzie alert dla już otwartej pozycji (ten sam symbol i kierunek)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={settings.sameSymbolBehavior}
              onValueChange={(value: any) => setSettings({ ...settings, sameSymbolBehavior: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ignore">Ignoruj (odrzuć alert)</SelectItem>
                <SelectItem value="track_confirmations">Śledź potwierdzenia ⭐ Zalecane</SelectItem>
                <SelectItem value="upgrade_tp">Upgrade TP na wyższy tier</SelectItem>
                <SelectItem value="emergency_override">Emergency Override</SelectItem>
              </SelectContent>
            </Select>

            <Alert>
              <AlertDescription className="text-xs">
                {settings.sameSymbolBehavior === "ignore" && (
                  <span>Całkowicie ignoruje duplikaty - żadna akcja</span>
                )}
                {settings.sameSymbolBehavior === "track_confirmations" && (
                  <span>NIE otwiera nowej pozycji, ale zapisuje jako "confirmation" i zwiększa confidence score</span>
                )}
                {settings.sameSymbolBehavior === "upgrade_tp" && (
                  <span>Jeśli nowy alert ma wyższy tier → extend TP2/TP3 dalej, agresywniejszy trailing SL</span>
                )}
                {settings.sameSymbolBehavior === "emergency_override" && (
                  <span>Tylko Emergency alert zamyka starą i otwiera nową pozycję</span>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Emergency Override */}
        {settings.sameSymbolBehavior === "emergency_override" && (
          <Card>
            <CardHeader>
              <CardTitle>Emergency Override - Warunki</CardTitle>
              <CardDescription>Kiedy Emergency alert może zamknąć starą pozycję i otworzyć nową</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={settings.emergencyOverrideMode}
                onValueChange={(value: any) => setSettings({ ...settings, emergencyOverrideMode: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Zawsze (ryzykowne)</SelectItem>
                  <SelectItem value="only_profit">Tylko gdy profit &gt; 0% ⭐ Zalecane</SelectItem>
                  <SelectItem value="profit_above_x">Tylko gdy profit &gt; X%</SelectItem>
                  <SelectItem value="never">Nigdy nie zamykaj</SelectItem>
                </SelectContent>
              </Select>

              {settings.emergencyOverrideMode === "profit_above_x" && (
                <div className="space-y-2">
                  <Label>Minimalny profit (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={settings.emergencyMinProfitPercent}
                    onChange={(e) => setSettings({ ...settings, emergencyMinProfitPercent: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Emergency override tylko gdy pozycja ma profit wyższy niż ta wartość
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Opposite Direction Strategy */}
        <Card>
          <CardHeader>
            <CardTitle>Strategia dla Przeciwnego Kierunku</CardTitle>
            <CardDescription>Co zrobić gdy alert jest w przeciwnym kierunku (LONG → SELL lub SHORT → BUY)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={settings.oppositeDirectionStrategy}
              onValueChange={(value: any) => setSettings({ ...settings, oppositeDirectionStrategy: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="market_reversal">Market Reversal (czekaj 1-2 bary) ⭐ Zalecane</SelectItem>
                <SelectItem value="immediate_reverse">Immediate Reverse (natychmiast)</SelectItem>
                <SelectItem value="defensive_close">Defensive Close (zamknij, nie otwieraj nowej)</SelectItem>
                <SelectItem value="ignore_opposite">Ignore Opposite (ignoruj)</SelectItem>
                <SelectItem value="tier_based">Tier-Based (wyższy tier wygrywa)</SelectItem>
              </SelectContent>
            </Select>

            <Alert>
              <AlertDescription className="text-xs">
                {settings.oppositeDirectionStrategy === "market_reversal" && (
                  <span>Zamknij starą → Czekaj 1-2 bary na potwierdzenie → Otwórz nową (unika whipsaw)</span>
                )}
                {settings.oppositeDirectionStrategy === "immediate_reverse" && (
                  <span>Natychmiast zamknij starą i otwórz nową w przeciwnym kierunku</span>
                )}
                {settings.oppositeDirectionStrategy === "defensive_close" && (
                  <span>Zamknij starą pozycję, NIE otwieraj nowej (limit loss)</span>
                )}
                {settings.oppositeDirectionStrategy === "ignore_opposite" && (
                  <span>Ignoruj alert w przeciwnym kierunku, trzymaj aktualną pozycję</span>
                )}
                {settings.oppositeDirectionStrategy === "tier_based" && (
                  <span>Wyższy tier wygrywa (np. LONG Premium &gt; SELL Standard = ignoruj)</span>
                )}
              </AlertDescription>
            </Alert>

            {settings.oppositeDirectionStrategy === "market_reversal" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Ile barów czekać na potwierdzenie (1-3)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="3"
                    value={settings.reversalWaitBars}
                    onChange={(e) => setSettings({ ...settings, reversalWaitBars: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Minimalna siła sygnału (0.15-0.35)</Label>
                  <Input
                    type="number"
                    step="0.05"
                    min="0.15"
                    max="0.35"
                    value={settings.reversalMinStrength}
                    onChange={(e) => setSettings({ ...settings, reversalMinStrength: parseFloat(e.target.value) || 0.25 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ignoruj słabe przeciwne sygnały poniżej tego progu
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Max Concurrent Positions */}
        <Card>
          <CardHeader>
            <CardTitle>Maksymalna Liczba Pozycji</CardTitle>
            <CardDescription>Ile pozycji bot może mieć otwartych jednocześnie</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Max równoczesnych pozycji</Label>
            <Input
              type="number"
              min="1"
              max="50"
              value={settings.maxConcurrentPositions}
              onChange={(e) => setSettings({ ...settings, maxConcurrentPositions: parseInt(e.target.value) || 10 })}
            />
            <p className="text-xs text-muted-foreground">
              Domyślnie: 10 (bezpieczne dla diversyfikacji)
            </p>
          </CardContent>
        </Card>

        {/* Save Button (Bottom) */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Anuluj
          </Button>
          <Button onClick={handleSave} disabled={saving} size="lg">
            {saving ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Zapisywanie...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Zapisz Ustawienia
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}