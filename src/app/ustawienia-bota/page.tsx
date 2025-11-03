"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Separator } from "@/components/ui/separator"
import { Bot, Power, Eye, Settings, TrendingUp, Shield, Target, Layers, Percent } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function BotSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(true)

  // Bot settings state
  const [botEnabled, setBotEnabled] = useState(false)
  const [positionSizeMode, setPositionSizeMode] = useState("percent")
  const [positionSizePercent, setPositionSizePercent] = useState(2.0)
  const [positionSizeFixed, setPositionSizeFixed] = useState(100.0)
  const [leverageMode, setLeverageMode] = useState("from_alert")
  const [leverageFixed, setLeverageFixed] = useState(10)
  const [tierFilteringMode, setTierFilteringMode] = useState("all")
  const [disabledTiers, setDisabledTiers] = useState<string[]>([])
  const [tpStrategy, setTpStrategy] = useState("multiple")
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState(10)
  const [sameSymbolBehavior, setSameSymbolBehavior] = useState("track_confirmations")
  const [oppositeDirectionStrategy, setOppositeDirectionStrategy] = useState("market_reversal")
  const [reversalWaitBars, setReversalWaitBars] = useState(1)
  const [reversalMinStrength, setReversalMinStrength] = useState(0.25)
  const [emergencyCanReverse, setEmergencyCanReverse] = useState(true)
  const [emergencyOverrideMode, setEmergencyOverrideMode] = useState("only_profit")
  const [emergencyMinProfitPercent, setEmergencyMinProfitPercent] = useState(0.0)
  
  const [useDefaultSlTp, setUseDefaultSlTp] = useState(false)
  const [defaultSlRR, setDefaultSlRR] = useState(1.0)
  const [defaultTp1RR, setDefaultTp1RR] = useState(1.0)
  const [defaultTp2RR, setDefaultTp2RR] = useState(2.0)
  const [defaultTp3RR, setDefaultTp3RR] = useState(3.0)

  // NEW: Enhanced TP Strategy state
  const [tpCount, setTpCount] = useState(3)
  const [tp1RR, setTp1RR] = useState(1.0)
  const [tp1Percent, setTp1Percent] = useState(50.0)
  const [tp2RR, setTp2RR] = useState(2.0)
  const [tp2Percent, setTp2Percent] = useState(30.0)
  const [tp3RR, setTp3RR] = useState(3.0)
  const [tp3Percent, setTp3Percent] = useState(20.0)
  const [slManagementAfterTp1, setSlManagementAfterTp1] = useState("breakeven")
  const [slTrailingDistance, setSlTrailingDistance] = useState(0.5)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/bot/settings")
      const data = await response.json()
      
      if (data.settings) {
        const s = data.settings
        setBotEnabled(s.botEnabled)
        setPositionSizeMode(s.positionSizeMode)
        setPositionSizePercent(s.positionSizePercent)
        setPositionSizeFixed(s.positionSizeFixed)
        setLeverageMode(s.leverageMode)
        setLeverageFixed(s.leverageFixed)
        setTierFilteringMode(s.tierFilteringMode)
        setDisabledTiers(JSON.parse(s.disabledTiers))
        setTpStrategy(s.tpStrategy)
        setMaxConcurrentPositions(s.maxConcurrentPositions)
        setSameSymbolBehavior(s.sameSymbolBehavior)
        setOppositeDirectionStrategy(s.oppositeDirectionStrategy)
        setReversalWaitBars(s.reversalWaitBars)
        setReversalMinStrength(s.reversalMinStrength)
        setEmergencyCanReverse(s.emergencyCanReverse)
        setEmergencyOverrideMode(s.emergencyOverrideMode)
        setEmergencyMinProfitPercent(s.emergencyMinProfitPercent)
        setUseDefaultSlTp(s.useDefaultSlTp || false)
        setDefaultSlRR(s.defaultSlRR || 1.0)
        setDefaultTp1RR(s.defaultTp1RR || 1.0)
        setDefaultTp2RR(s.defaultTp2RR || 2.0)
        setDefaultTp3RR(s.defaultTp3RR || 3.0)
        
        // NEW: Load enhanced TP settings
        setTpCount(s.tpCount || 3)
        setTp1RR(s.tp1RR || 1.0)
        setTp1Percent(s.tp1Percent || 50.0)
        setTp2RR(s.tp2RR || 2.0)
        setTp2Percent(s.tp2Percent || 30.0)
        setTp3RR(s.tp3RR || 3.0)
        setTp3Percent(s.tp3Percent || 20.0)
        setSlManagementAfterTp1(s.slManagementAfterTp1 || "breakeven")
        setSlTrailingDistance(s.slTrailingDistance || 0.5)
      }
    } catch (error) {
      toast.error("Błąd ładowania ustawień")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/bot/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botEnabled,
          positionSizeMode,
          positionSizePercent,
          positionSizeFixed,
          leverageMode,
          leverageFixed,
          tierFilteringMode,
          disabledTiers: JSON.stringify(disabledTiers),
          tpStrategy,
          maxConcurrentPositions,
          sameSymbolBehavior,
          oppositeDirectionStrategy,
          reversalWaitBars,
          reversalMinStrength,
          emergencyCanReverse,
          emergencyOverrideMode,
          emergencyMinProfitPercent,
          useDefaultSlTp,
          defaultSlRR,
          defaultTp1RR,
          defaultTp2RR,
          defaultTp3RR,
          // NEW: Enhanced TP Strategy
          tpCount,
          tp1RR,
          tp1Percent,
          tp2RR,
          tp2Percent,
          tp3RR,
          tp3Percent,
          slManagementAfterTp1,
          slTrailingDistance,
        })
      })

      const data = await response.json()
      
      if (response.ok) {
        toast.success("Ustawienia zapisane pomyślnie!")
      } else {
        toast.error(data.error || "Błąd zapisu ustawień")
      }
    } catch (error) {
      toast.error("Błąd zapisu ustawień")
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleBot = async (newStatus: boolean) => {
    const previousStatus = botEnabled;
    setBotEnabled(newStatus);
    
    try {
      const response = await fetch("/api/bot/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botEnabled: newStatus
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        toast.success(newStatus ? "Bot został WŁĄCZONY" : "Bot został WYŁĄCZONY", {
          description: newStatus 
            ? "Bot będzie teraz automatycznie otwierał pozycje na podstawie alertów" 
            : "Bot nie będzie otwierał nowych pozycji"
        });
      } else {
        setBotEnabled(previousStatus);
        toast.error(data.error || "Błąd zmiany statusu bota");
      }
    } catch (error) {
      setBotEnabled(previousStatus);
      toast.error("Błąd połączenia z serwerem");
      console.error(error);
    }
  };

  const toggleTier = (tier: string) => {
    if (disabledTiers.includes(tier)) {
      setDisabledTiers(disabledTiers.filter(t => t !== tier))
    } else {
      setDisabledTiers([...disabledTiers, tier])
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-white">Ładowanie...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600/30 to-blue-900/20 border border-blue-500/30">
              <Bot className="h-8 w-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Ustawienia Bota
              </h1>
              <p className="text-gray-400">Konfiguracja automatycznego tradingu</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Zapisywanie..." : "Zapisz Ustawienia"}
          </Button>
        </div>

        {/* Bot Enable/Disable - PROMINENT */}
        <Card className={`p-6 border-2 transition-all ${
          botEnabled 
            ? "bg-gradient-to-br from-green-600/10 to-gray-900/80 border-green-500/30 shadow-green-500/20 shadow-lg" 
            : "bg-gradient-to-br from-red-600/10 to-gray-900/80 border-red-500/30 shadow-red-500/20 shadow-lg"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-xl border-2 ${
                botEnabled 
                  ? "bg-green-500/20 border-green-500/40" 
                  : "bg-red-500/20 border-red-500/40"
              }`}>
                <Power className={`h-10 w-10 ${botEnabled ? "text-green-400" : "text-red-400"}`} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-1">
                  Status Bota: {botEnabled ? "WŁĄCZONY" : "WYŁĄCZONY"}
                </h3>
                <p className={`text-sm font-medium ${botEnabled ? "text-green-400" : "text-red-400"}`}>
                  {botEnabled 
                    ? "Bot aktywnie monitoruje i otwiera pozycje na podstawie alertów" 
                    : "Bot nie będzie otwierał nowych pozycji"}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Switch 
                checked={botEnabled} 
                onCheckedChange={handleToggleBot}
                className="scale-150"
              />
              <span className="text-xs text-gray-500">Kliknij aby {botEnabled ? "wyłączyć" : "włączyć"}</span>
            </div>
          </div>
        </Card>

        {/* NOWA SEKCJA: Podgląd Obecnych Ustawień */}
        <Card className="border-blue-700/40 bg-gradient-to-br from-blue-600/10 to-gray-900/80 backdrop-blur-sm">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-blue-500/20 border border-blue-500/30">
                  <Eye className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Podgląd Obecnych Ustawień</h3>
                  <p className="text-sm text-gray-400">Aktywna konfiguracja bota</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="text-gray-400 hover:text-white"
              >
                {showPreview ? "Zwiń" : "Rozwiń"}
              </Button>
            </div>

            {showPreview && (
              <div className="space-y-6">
                {/* Position Size Settings */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-5 w-5 text-blue-400" />
                    <h4 className="text-lg font-semibold text-white">Wielkość Pozycji</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pl-7">
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Tryb</p>
                      <p className="text-white font-semibold">
                        {positionSizeMode === "percent" ? "Procent Kapitału" : "Stała Kwota USDT"}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Wartość</p>
                      <p className="text-white font-semibold">
                        {positionSizeMode === "percent" 
                          ? `${positionSizePercent}% kapitału` 
                          : `${positionSizeFixed} USDT`}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-gray-700/50" />

                {/* Leverage Settings */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="h-5 w-5 text-purple-400" />
                    <h4 className="text-lg font-semibold text-white">Dźwignia</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pl-7">
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Tryb</p>
                      <p className="text-white font-semibold">
                        {leverageMode === "from_alert" ? "Z Alertu (Dynamiczna)" : "Stała Wartość"}
                      </p>
                    </div>
                    {leverageMode === "fixed" && (
                      <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                        <p className="text-xs text-gray-400 mb-1">Wartość</p>
                        <p className="text-white font-semibold">{leverageFixed}x</p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-gray-700/50" />

                {/* Tier Filtering */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="h-5 w-5 text-amber-400" />
                    <h4 className="text-lg font-semibold text-white">Filtrowanie Tier</h4>
                  </div>
                  <div className="pl-7 space-y-3">
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Tryb</p>
                      <p className="text-white font-semibold">
                        {tierFilteringMode === "all" ? "Wszystkie Tiery" : "Wybrane Tiery"}
                      </p>
                    </div>
                    {tierFilteringMode === "custom" && disabledTiers.length > 0 && (
                      <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                        <p className="text-xs text-gray-400 mb-2">Wyłączone tiery</p>
                        <div className="flex flex-wrap gap-2">
                          {disabledTiers.map((tier) => (
                            <Badge key={tier} variant="destructive" className="text-xs">
                              {tier}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-gray-700/50" />

                {/* TP Strategy */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="h-5 w-5 text-green-400" />
                    <h4 className="text-lg font-semibold text-white">Take Profit</h4>
                  </div>
                  <div className="pl-7">
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Strategia</p>
                      <p className="text-white font-semibold">
                        {tpStrategy === "single" ? "Pojedynczy TP (main_tp)" : "Wielokrotny TP (TP1/TP2/TP3)"}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {tpStrategy === "single" 
                          ? "Zamyka całą pozycję gdy main_tp zostanie osiągnięty"
                          : "Zamyka pozycję częściowo: 50% na TP1, 30% na TP2, 20% na TP3"}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-gray-700/50" />

                {/* SL/TP Safety */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="h-5 w-5 text-red-400" />
                    <h4 className="text-lg font-semibold text-white">Zabezpieczenie SL/TP</h4>
                  </div>
                  <div className="pl-7 space-y-3">
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Status</p>
                      <p className="text-white font-semibold">
                        {useDefaultSlTp ? "Włączone ✅" : "Wyłączone ❌"}
                      </p>
                    </div>
                    {useDefaultSlTp && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                          <p className="text-xs text-gray-400 mb-1">Domyślny SL</p>
                          <p className="text-red-400 font-semibold">{defaultSlRR} RR</p>
                        </div>
                        <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                          <p className="text-xs text-gray-400 mb-1">Domyślny TP1</p>
                          <p className="text-green-400 font-semibold">{defaultTp1RR} RR</p>
                        </div>
                        <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                          <p className="text-xs text-gray-400 mb-1">Domyślny TP2</p>
                          <p className="text-green-400 font-semibold">{defaultTp2RR} RR</p>
                        </div>
                        <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                          <p className="text-xs text-gray-400 mb-1">Domyślny TP3</p>
                          <p className="text-green-400 font-semibold">{defaultTp3RR} RR</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-gray-700/50" />

                {/* Position Management */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Settings className="h-5 w-5 text-cyan-400" />
                    <h4 className="text-lg font-semibold text-white">Zarządzanie Pozycjami</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pl-7">
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Max pozycji jednocześnie</p>
                      <p className="text-white font-semibold">{maxConcurrentPositions}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Ten sam symbol</p>
                      <p className="text-white font-semibold text-xs">
                        {sameSymbolBehavior === "ignore" && "Ignoruj nowy alert"}
                        {sameSymbolBehavior === "track_confirmations" && "Śledź potwierdzenia"}
                        {sameSymbolBehavior === "upgrade_tp" && "Upgrade TP"}
                        {sameSymbolBehavior === "emergency_override" && "Emergency override"}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50 col-span-2">
                      <p className="text-xs text-gray-400 mb-1">Przeciwny kierunek</p>
                      <p className="text-white font-semibold text-xs">
                        {oppositeDirectionStrategy === "market_reversal" && "Market reversal (zamknij + otwórz nową)"}
                        {oppositeDirectionStrategy === "immediate_reverse" && "Natychmiastowe odwrócenie"}
                        {oppositeDirectionStrategy === "defensive_close" && "Defensive close (tylko zamknij)"}
                        {oppositeDirectionStrategy === "ignore_opposite" && "Ignoruj"}
                        {oppositeDirectionStrategy === "tier_based" && "Na podstawie tier"}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator className="bg-gray-700/50" />

                {/* Emergency Override */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="h-5 w-5 text-orange-400" />
                    <h4 className="text-lg font-semibold text-white">Emergency Override</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pl-7">
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Tryb nadpisania</p>
                      <p className="text-white font-semibold text-xs">
                        {emergencyOverrideMode === "never" && "Nigdy"}
                        {emergencyOverrideMode === "always" && "Zawsze"}
                        {emergencyOverrideMode === "only_profit" && "Tylko gdy pozycja w zysku"}
                        {emergencyOverrideMode === "profit_above_x" && `Zysk powyżej ${emergencyMinProfitPercent}%`}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Odwrócenie Emergency</p>
                      <p className="text-white font-semibold">
                        {emergencyCanReverse ? "Dozwolone ✅" : "Zablokowane ❌"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Position Size */}
        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Wielkość Pozycji</h3>
          
          <div className="space-y-2">
            <Label className="text-white">Tryb</Label>
            <Select value={positionSizeMode} onValueChange={setPositionSizeMode}>
              <SelectTrigger className="text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Procent kapitału</SelectItem>
                <SelectItem value="fixed">Stała kwota USDT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {positionSizeMode === "percent" && (
            <div className="space-y-2">
              <Label className="text-white">Procent kapitału (%)</Label>
              <Input 
                type="number" 
                value={positionSizePercent} 
                onChange={(e) => setPositionSizePercent(parseFloat(e.target.value))}
                step="0.1"
                className="text-white"
              />
            </div>
          )}

          {positionSizeMode === "fixed" && (
            <div className="space-y-2">
              <Label className="text-white">Stała kwota (USDT)</Label>
              <Input 
                type="number" 
                value={positionSizeFixed} 
                onChange={(e) => setPositionSizeFixed(parseFloat(e.target.value))}
                className="text-white"
              />
            </div>
          )}
        </Card>

        {/* Leverage */}
        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Dźwignia (Leverage)</h3>
          
          <div className="space-y-2">
            <Label className="text-white">Tryb</Label>
            <Select value={leverageMode} onValueChange={setLeverageMode}>
              <SelectTrigger className="text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="from_alert">Z alertu (dynamiczna)</SelectItem>
                <SelectItem value="fixed">Stała wartość</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {leverageMode === "fixed" && (
            <div className="space-y-2">
              <Label className="text-white">Stała dźwignia (x)</Label>
              <Input 
                type="number" 
                value={leverageFixed} 
                onChange={(e) => setLeverageFixed(parseInt(e.target.value))}
                min="1"
                max="125"
                className="text-white"
              />
            </div>
          )}
        </Card>

        {/* Tier Filtering */}
        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Filtrowanie Tier</h3>
          
          <div className="space-y-2">
            <Label className="text-white">Tryb</Label>
            <Select value={tierFilteringMode} onValueChange={setTierFilteringMode}>
              <SelectTrigger className="text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie tiery</SelectItem>
                <SelectItem value="custom">Wybrane tiery</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tierFilteringMode === "custom" && (
            <div className="space-y-2">
              <Label className="text-white">Wyłączone tiery (kliknij aby zaznaczyć)</Label>
              <div className="flex flex-wrap gap-2">
                {["Platinum", "Premium", "Standard", "Quick", "Emergency"].map((tier) => (
                  <Button
                    key={tier}
                    variant={disabledTiers.includes(tier) ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => toggleTier(tier)}
                    className={disabledTiers.includes(tier) ? "" : "text-white"}
                  >
                    {tier}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* TP Strategy */}
        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Strategia Take Profit</h3>
          
          <div className="space-y-2">
            <Label className="text-white">Tryb TP</Label>
            <Select value={tpStrategy} onValueChange={setTpStrategy}>
              <SelectTrigger className="text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Pojedynczy TP (main_tp)</SelectItem>
                <SelectItem value="multiple">Wielokrotny TP (TP1/TP2/TP3)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <p className="text-sm text-gray-400">
            {tpStrategy === "single" 
              ? "Zamyka całą pozycję gdy main_tp zostanie osiągnięty"
              : "Zamyka pozycję częściowo: 50% na TP1, 30% na TP2, 20% na TP3"}
          </p>
        </Card>

        {/* SL/TP Safety */}
        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Zabezpieczenie SL/TP</h3>
              <p className="text-sm text-gray-400">Automatyczne ustawienie gdy alert nie zawiera wartości (Risk:Reward)</p>
            </div>
            <Switch checked={useDefaultSlTp} onCheckedChange={setUseDefaultSlTp} />
          </div>

          {useDefaultSlTp && (
            <>
              <Separator className="bg-gray-700" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white">Domyślny SL (RR)</Label>
                  <Input 
                    type="number" 
                    value={defaultSlRR} 
                    onChange={(e) => setDefaultSlRR(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.1"
                    className="text-white"
                  />
                  <p className="text-xs text-gray-400">Risk ratio dla Stop Loss</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Domyślny TP1 (RR)</Label>
                  <Input 
                    type="number" 
                    value={defaultTp1RR} 
                    onChange={(e) => setDefaultTp1RR(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.1"
                    className="text-white"
                  />
                  <p className="text-xs text-gray-400">Reward ratio dla TP1</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Domyślny TP2 (RR)</Label>
                  <Input 
                    type="number" 
                    value={defaultTp2RR} 
                    onChange={(e) => setDefaultTp2RR(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.1"
                    className="text-white"
                  />
                  <p className="text-xs text-gray-400">Reward ratio dla TP2</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Domyślny TP3 (RR)</Label>
                  <Input 
                    type="number" 
                    value={defaultTp3RR} 
                    onChange={(e) => setDefaultTp3RR(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.1"
                    className="text-white"
                  />
                  <p className="text-xs text-gray-400">Reward ratio dla TP3</p>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <p className="text-sm text-blue-300">
                  <strong>Przykład dla pozycji BUY @ $100:</strong><br/>
                  Jeśli SL = 1.0 RR, to ryzyko = $1 od ceny wejścia<br/>
                  SL: $99 | TP1 (1.0 RR): $101 | TP2 (2.0 RR): $102 | TP3 (3.0 RR): $103<br/>
                  <span className="text-xs text-blue-400/70">RR = Risk:Reward - stosunek zysku do ryzyka</span>
                </p>
              </div>
            </>
          )}
        </Card>

        {/* NEW: Enhanced TP Strategy Configuration */}
        <Card className="p-6 space-y-6 border-blue-700/40 bg-gradient-to-br from-blue-600/10 to-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-blue-500/20 border border-blue-500/30">
              <Target className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Strategia Take Profit (Zaawansowana)</h3>
              <p className="text-sm text-gray-400">Elastyczne zarządzanie wielopoziomowymi TP i Stop Loss</p>
            </div>
          </div>

          {/* TP Count Selection */}
          <div className="space-y-3">
            <Label className="text-white text-base font-semibold">Liczba poziomów Take Profit</Label>
            <Select value={tpCount.toString()} onValueChange={(v) => setTpCount(parseInt(v))}>
              <SelectTrigger className="text-white bg-gray-800/60 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 TP (pojedynczy)</SelectItem>
                <SelectItem value="2">2 TP (dwupoziomowy)</SelectItem>
                <SelectItem value="3">3 TP (trójpoziomowy)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">
              Wybierz ile poziomów TP chcesz używać do częściowego zamykania pozycji
            </p>
          </div>

          <Separator className="bg-gray-700/50" />

          {/* TP1 Configuration */}
          <div className="space-y-4 p-4 rounded-lg bg-gray-800/40 border border-gray-700/50">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-green-600">TP1</Badge>
              <h4 className="text-base font-semibold text-white">Pierwszy Take Profit</h4>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-400" />
                  Risk:Reward (R:R)
                </Label>
                <Input 
                  type="number" 
                  value={tp1RR} 
                  onChange={(e) => setTp1RR(parseFloat(e.target.value))}
                  step="0.1"
                  min="0.1"
                  className="text-white bg-gray-900/60"
                />
                <p className="text-xs text-gray-400">Np. 1.0 = TP1 będzie 1% od entry (BUY: +1%, SELL: -1%)</p>
              </div>
              <div className="space-y-2">
                <Label className="text-white flex items-center gap-2">
                  <Percent className="h-4 w-4 text-blue-400" />
                  % Pozycji do zamknięcia
                </Label>
                <Input 
                  type="number" 
                  value={tp1Percent} 
                  onChange={(e) => setTp1Percent(parseFloat(e.target.value))}
                  step="1"
                  min="1"
                  max="100"
                  className="text-white bg-gray-900/60"
                />
                <p className="text-xs text-gray-400">Jaki % pozycji zamknąć gdy cena osiągnie TP1</p>
              </div>
            </div>
          </div>

          {/* TP2 Configuration */}
          {tpCount >= 2 && (
            <div className="space-y-4 p-4 rounded-lg bg-gray-800/40 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-amber-600">TP2</Badge>
                <h4 className="text-base font-semibold text-white">Drugi Take Profit</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Target className="h-4 w-4 text-amber-400" />
                    Risk:Reward (R:R)
                  </Label>
                  <Input 
                    type="number" 
                    value={tp2RR} 
                    onChange={(e) => setTp2RR(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.1"
                    className="text-white bg-gray-900/60"
                  />
                  <p className="text-xs text-gray-400">Np. 2.0 = TP2 będzie 2% od entry</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Percent className="h-4 w-4 text-blue-400" />
                    % Pozycji do zamknięcia
                  </Label>
                  <Input 
                    type="number" 
                    value={tp2Percent} 
                    onChange={(e) => setTp2Percent(parseFloat(e.target.value))}
                    step="1"
                    min="1"
                    max="100"
                    className="text-white bg-gray-900/60"
                  />
                  <p className="text-xs text-gray-400">Jaki % pozycji zamknąć gdy cena osiągnie TP2</p>
                </div>
              </div>
            </div>
          )}

          {/* TP3 Configuration */}
          {tpCount >= 3 && (
            <div className="space-y-4 p-4 rounded-lg bg-gray-800/40 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-purple-600">TP3</Badge>
                <h4 className="text-base font-semibold text-white">Trzeci Take Profit</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Target className="h-4 w-4 text-purple-400" />
                    Risk:Reward (R:R)
                  </Label>
                  <Input 
                    type="number" 
                    value={tp3RR} 
                    onChange={(e) => setTp3RR(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.1"
                    className="text-white bg-gray-900/60"
                  />
                  <p className="text-xs text-gray-400">Np. 3.0 = TP3 będzie 3% od entry</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Percent className="h-4 w-4 text-blue-400" />
                    % Pozycji do zamknięcia
                  </Label>
                  <Input 
                    type="number" 
                    value={tp3Percent} 
                    onChange={(e) => setTp3Percent(parseFloat(e.target.value))}
                    step="1"
                    min="1"
                    max="100"
                    className="text-white bg-gray-900/60"
                  />
                  <p className="text-xs text-gray-400">Jaki % pozycji zamknąć gdy cena osiągnie TP3</p>
                </div>
              </div>
            </div>
          )}

          <Separator className="bg-gray-700/50" />

          {/* SL Management After TP1 */}
          <div className="space-y-4 p-4 rounded-lg bg-red-900/10 border border-red-700/30">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-red-400" />
              <h4 className="text-base font-semibold text-white">Zarządzanie Stop Loss po osiągnięciu TP1</h4>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-white">Strategia SL</Label>
                <Select value={slManagementAfterTp1} onValueChange={setSlManagementAfterTp1}>
                  <SelectTrigger className="text-white bg-gray-800/60 border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakeven">🎯 Break-even (przesuń SL na entry)</SelectItem>
                    <SelectItem value="trailing">📈 Trailing Stop (śledź cenę)</SelectItem>
                    <SelectItem value="no_change">🔒 Bez zmian (zostaw oryginalny SL)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">
                  {slManagementAfterTp1 === "breakeven" && "Po osiągnięciu TP1, SL zostanie przesunięty na cenę wejścia (zero ryzyka)"}
                  {slManagementAfterTp1 === "trailing" && "SL będzie śledzić cenę w określonej odległości"}
                  {slManagementAfterTp1 === "no_change" && "SL pozostanie na oryginalnej pozycji"}
                </p>
              </div>

              {slManagementAfterTp1 === "trailing" && (
                <div className="space-y-2 ml-4 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
                  <Label className="text-white">Odległość Trailing Stop (%)</Label>
                  <Input 
                    type="number" 
                    value={slTrailingDistance} 
                    onChange={(e) => setSlTrailingDistance(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.1"
                    className="text-white bg-gray-900/60"
                  />
                  <p className="text-xs text-gray-400">
                    Np. 0.5% = SL będzie zawsze 0.5% za ceną (LONG: poniżej, SHORT: powyżej)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Example Preview */}
          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg p-4">
            <h5 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Przykład dla pozycji LONG BTC @ $50,000 z twoimi ustawieniami:
            </h5>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex justify-between items-center p-2 bg-gray-900/40 rounded">
                <span className="text-green-400 font-semibold">TP1 ({tp1RR} R:R)</span>
                <span>${(50000 * (1 + tp1RR / 100)).toFixed(2)} → Zamknij {tp1Percent}%</span>
              </div>
              {tpCount >= 2 && (
                <div className="flex justify-between items-center p-2 bg-gray-900/40 rounded">
                  <span className="text-amber-400 font-semibold">TP2 ({tp2RR} R:R)</span>
                  <span>${(50000 * (1 + tp2RR / 100)).toFixed(2)} → Zamknij {tp2Percent}%</span>
                </div>
              )}
              {tpCount >= 3 && (
                <div className="flex justify-between items-center p-2 bg-gray-900/40 rounded">
                  <span className="text-purple-400 font-semibold">TP3 ({tp3RR} R:R)</span>
                  <span>${(50000 * (1 + tp3RR / 100)).toFixed(2)} → Zamknij {tp3Percent}%</span>
                </div>
              )}
              <div className="flex justify-between items-center p-2 bg-gray-900/40 rounded mt-3 pt-3 border-t border-gray-700/50">
                <span className="text-red-400 font-semibold">Po TP1:</span>
                <span>
                  {slManagementAfterTp1 === "breakeven" && "SL → $50,000 (break-even)"}
                  {slManagementAfterTp1 === "trailing" && `SL śledzi cenę (-${slTrailingDistance}%)`}
                  {slManagementAfterTp1 === "no_change" && "SL bez zmian"}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Max Concurrent Positions */}
        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Maksymalna Liczba Pozycji</h3>
          <div className="space-y-2">
            <Label className="text-white">Max otwartych pozycji jednocześnie</Label>
            <Input 
              type="number" 
              value={maxConcurrentPositions} 
              onChange={(e) => setMaxConcurrentPositions(parseInt(e.target.value))}
              min="1"
              className="text-white"
            />
          </div>
        </Card>

        {/* Same Symbol Behavior */}
        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Zachowanie dla Tego Samego Symbolu</h3>
          <p className="text-sm text-gray-400">Co robić gdy przychodzi alert w tym samym kierunku na symbolu z istniejącą pozycją?</p>
          
          <div className="space-y-2">
            <Label className="text-white">Strategia</Label>
            <Select value={sameSymbolBehavior} onValueChange={setSameSymbolBehavior}>
              <SelectTrigger className="text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ignore">Ignoruj nowy alert</SelectItem>
                <SelectItem value="track_confirmations">Śledź potwierdzenia</SelectItem>
                <SelectItem value="upgrade_tp">Upgrade TP dla wyższego tier</SelectItem>
                <SelectItem value="emergency_override">Emergency override</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Opposite Direction Strategy */}
        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Strategia dla Przeciwnego Kierunku</h3>
          <p className="text-sm text-gray-400">Co robić gdy przychodzi alert w przeciwnym kierunku?</p>
          
          <div className="space-y-2">
            <Label className="text-white">Strategia</Label>
            <Select value={oppositeDirectionStrategy} onValueChange={setOppositeDirectionStrategy}>
              <SelectTrigger className="text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="market_reversal">Market reversal (zamknij + otwórz nową)</SelectItem>
                <SelectItem value="immediate_reverse">Natychmiastowe odwrócenie</SelectItem>
                <SelectItem value="defensive_close">Defensive close (tylko zamknij)</SelectItem>
                <SelectItem value="ignore_opposite">Ignoruj</SelectItem>
                <SelectItem value="tier_based">Na podstawie tier</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {["market_reversal", "tier_based"].includes(oppositeDirectionStrategy) && (
            <>
              <div className="space-y-2">
                <Label className="text-white">Odczekaj barów przed odwróceniem</Label>
                <Input 
                  type="number" 
                  value={reversalWaitBars} 
                  onChange={(e) => setReversalWaitBars(parseInt(e.target.value))}
                  min="0"
                  className="text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white">Minimalna siła dla odwrócenia (0.0-1.0)</Label>
                <Input 
                  type="number" 
                  value={reversalMinStrength} 
                  onChange={(e) => setReversalMinStrength(parseFloat(e.target.value))}
                  step="0.01"
                  min="0"
                  max="1"
                  className="text-white"
                />
              </div>
            </>
          )}

          <div className="flex items-center space-x-2">
            <Switch checked={emergencyCanReverse} onCheckedChange={setEmergencyCanReverse} />
            <Label className="text-white">Pozwól Emergency na odwrócenie</Label>
          </div>
        </Card>

        {/* Emergency Override */}
        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Emergency Override</h3>
          <p className="text-sm text-gray-400">Kiedy Emergency może nadpisać istniejącą pozycję w tym samym kierunku?</p>
          
          <div className="space-y-2">
            <Label className="text-white">Tryb</Label>
            <Select value={emergencyOverrideMode} onValueChange={setEmergencyOverrideMode}>
              <SelectTrigger className="text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Nigdy</SelectItem>
                <SelectItem value="always">Zawsze</SelectItem>
                <SelectItem value="only_profit">Tylko gdy pozycja w zysku</SelectItem>
                <SelectItem value="profit_above_x">Zysk powyżej X%</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {emergencyOverrideMode === "profit_above_x" && (
            <div className="space-y-2">
              <Label className="text-white">Minimalny procent zysku (%)</Label>
              <Input 
                type="number" 
                value={emergencyMinProfitPercent} 
                onChange={(e) => setEmergencyMinProfitPercent(parseFloat(e.target.value))}
                step="0.1"
                className="text-white"
              />
            </div>
          )}
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg" className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Zapisywanie..." : "Zapisz Wszystkie Ustawienia"}
          </Button>
        </div>
      </div>
    </div>
  )
}