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
import { Bot, Power, Eye, Settings, TrendingUp, Shield, Target, Layers, Percent, Zap, DollarSign } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"

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

  // ✅ NEW: TP Mode selection
  const [tpMode, setTpMode] = useState<"percent" | "rr">("percent")

  // Enhanced TP Strategy state
  const [tpCount, setTpCount] = useState(3)
  const [tp1RR, setTp1RR] = useState(1.0)
  const [tp1Percent, setTp1Percent] = useState(50.0)
  const [tp2RR, setTp2RR] = useState(2.0)
  const [tp2Percent, setTp2Percent] = useState(30.0)
  const [tp3RR, setTp3RR] = useState(3.0)
  const [tp3Percent, setTp3Percent] = useState(20.0)
  const [slManagementAfterTp1, setSlManagementAfterTp1] = useState("breakeven")
  const [slTrailingDistance, setSlTrailingDistance] = useState(0.5)

  // Adaptive R:R state
  const [adaptiveRR, setAdaptiveRR] = useState(false)
  const [adaptiveMultiplier, setAdaptiveMultiplier] = useState(1.5)
  const [adaptiveStrengthThreshold, setAdaptiveStrengthThreshold] = useState(0.5)

  // SL as % margin state
  const [slAsMarginPercent, setSlAsMarginPercent] = useState(false)
  const [slMarginRiskPercent, setSlMarginRiskPercent] = useState(2.0)

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
        
        // Enhanced TP settings
        setTpCount(s.tpCount || 3)
        setTp1RR(s.tp1RR || 1.0)
        setTp1Percent(s.tp1Percent || 50.0)
        setTp2RR(s.tp2RR || 2.0)
        setTp2Percent(s.tp2Percent || 30.0)
        setTp3RR(s.tp3RR || 3.0)
        setTp3Percent(s.tp3Percent || 20.0)
        setSlManagementAfterTp1(s.slManagementAfterTp1 || "breakeven")
        setSlTrailingDistance(s.slTrailingDistance || 0.5)

        // Load Adaptive R:R settings
        setAdaptiveRR(s.adaptiveRR || false)
        setAdaptiveMultiplier(s.adaptiveMultiplier || 1.5)
        setAdaptiveStrengthThreshold(s.adaptiveStrengthThreshold || 0.5)

        // Load SL as margin settings
        setSlAsMarginPercent(s.slAsMarginPercent || false)
        setSlMarginRiskPercent(s.slMarginRiskPercent || 2.0)

        // ✅ NEW: Load TP mode
        setTpMode(s.tpMode || "percent")
      }
    } catch (error) {
      toast.error("Błąd ładowania ustawień")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // ✅ NEW: Validation warnings
  const getValidationWarnings = () => {
    const warnings: string[] = []
    
    // Check conflicting TP settings
    if (tpMode === "percent" && adaptiveRR) {
      warnings.push("⚠️ Adaptive R:R działa tylko w trybie 'R:R od entry'. Zmień tryb TP na 'R:R od entry' aby użyć Adaptive R:R.")
    }
    
    // Check if using 2 TP with percent mode
    if (tpCount === 2 && tpMode === "percent") {
      const totalPercent = tp1Percent + tp2Percent
      if (Math.abs(totalPercent - 100) > 0.01) {
        warnings.push(`⚠️ Suma TP1 (${tp1Percent}%) i TP2 (${tp2Percent}%) powinna wynosić 100%. Obecna suma: ${totalPercent.toFixed(1)}%`)
      }
    }
    
    if (tpCount === 3 && tpMode === "percent") {
      const totalPercent = tp1Percent + tp2Percent + tp3Percent
      if (Math.abs(totalPercent - 100) > 0.01) {
        warnings.push(`⚠️ Suma TP1 (${tp1Percent}%) + TP2 (${tp2Percent}%) + TP3 (${tp3Percent}%) powinna wynosić 100%. Obecna suma: ${totalPercent.toFixed(1)}%`)
      }
    }

    return warnings
  }

  const handleSave = async () => {
    const warnings = getValidationWarnings()
    if (warnings.length > 0 && !confirm(`Znaleziono ostrzeżenia:\n\n${warnings.join('\n\n')}\n\nCzy na pewno chcesz zapisać?`)) {
      return
    }

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
          // Enhanced TP Strategy
          tpMode,
          tpCount,
          tp1RR,
          tp1Percent,
          tp2RR,
          tp2Percent,
          tp3RR,
          tp3Percent,
          slManagementAfterTp1,
          slTrailingDistance,
          // Adaptive R:R
          adaptiveRR,
          adaptiveMultiplier,
          adaptiveStrengthThreshold,
          // SL as % margin
          slAsMarginPercent,
          slMarginRiskPercent,
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
          <p className="text-gray-300">Ładowanie...</p>
        </div>
      </div>
    )
  }

  const validationWarnings = getValidationWarnings()

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
              <p className="text-gray-300">Konfiguracja automatycznego tradingu</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Zapisywanie..." : "Zapisz Ustawienia"}
          </Button>
        </div>

        {/* ✅ NEW: Validation Warnings */}
        {validationWarnings.length > 0 && (
          <Alert className="border-yellow-700 bg-yellow-900/20">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-sm text-yellow-400">
              <div className="space-y-1">
                {validationWarnings.map((warning, idx) => (
                  <p key={idx}>{warning}</p>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

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
              <span className="text-xs text-gray-400">Kliknij aby {botEnabled ? "wyłączyć" : "włączyć"}</span>
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
                  <p className="text-sm text-gray-300">Aktywna konfiguracja bota</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="text-gray-300 hover:text-white"
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

                {/* Enhanced TP Strategy Preview */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="h-5 w-5 text-green-400" />
                    <h4 className="text-lg font-semibold text-white">Strategia Take Profit (Zaawansowana)</h4>
                  </div>
                  <div className="pl-7 space-y-3">
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Liczba poziomów TP</p>
                      <p className="text-white font-semibold">{tpCount} TP</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                        <p className="text-xs text-gray-400 mb-1">TP1</p>
                        <p className="text-green-400 font-semibold">{tp1RR}% RR → Zamknij {tp1Percent}%</p>
                      </div>
                      {tpCount >= 2 && (
                        <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                          <p className="text-xs text-gray-400 mb-1">TP2</p>
                          <p className="text-green-400 font-semibold">{tp2RR}% RR → Zamknij {tp2Percent}%</p>
                        </div>
                      )}
                      {tpCount >= 3 && (
                        <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50 col-span-2">
                          <p className="text-xs text-gray-400 mb-1">TP3</p>
                          <p className="text-green-400 font-semibold">{tp3RR}% RR → Zamknij {tp3Percent}%</p>
                        </div>
                      )}
                    </div>
                    <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                      <p className="text-xs text-gray-400 mb-1">Zarządzanie SL po TP1</p>
                      <p className="text-white font-semibold text-xs">
                        {slManagementAfterTp1 === "breakeven" && "🎯 Break-even (przesuń SL na entry)"}
                        {slManagementAfterTp1 === "trailing" && `📈 Trailing Stop (${slTrailingDistance}% dystans)`}
                        {slManagementAfterTp1 === "no_change" && "🔒 Bez zmian"}
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
                      <div className="p-4 rounded-lg bg-gray-800/60 border border-gray-700/50">
                        <p className="text-xs text-gray-400 mb-1">Domyślny SL</p>
                        <p className="text-red-400 font-semibold">{defaultSlRR}% RR</p>
                        <p className="text-xs text-gray-400 mt-2">TP używa wartości z sekcji zaawansowanej powyżej</p>
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
                <SelectItem value="fixed_amount">Stała kwota USDT</SelectItem>
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

          {positionSizeMode === "fixed_amount" && (
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

        {/* SL/TP Safety */}
        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Zabezpieczenie SL/TP</h3>
              <p className="text-sm text-gray-300">Automatyczne ustawienie gdy alert nie zawiera wartości</p>
            </div>
            <Switch checked={useDefaultSlTp} onCheckedChange={setUseDefaultSlTp} />
          </div>

          {useDefaultSlTp && (
            <>
              <Separator className="bg-gray-700" />
              <div className="space-y-2">
                <Label className="text-white">Domyślny SL (% RR)</Label>
                <Input 
                  type="number" 
                  value={defaultSlRR} 
                  onChange={(e) => setDefaultSlRR(parseFloat(e.target.value))}
                  step="0.1"
                  min="0.1"
                  className="text-white"
                />
                <p className="text-xs text-gray-400">Procent od ceny entry dla Stop Loss</p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <p className="text-sm text-blue-300">
                  <strong>Uwaga:</strong> Wartości Take Profit są konfigurowane w sekcji "Strategia Take Profit (Zaawansowana)" poniżej.
                </p>
              </div>
            </>
          )}
        </Card>

        {/* ✅ NEW: Adaptive R:R Configuration */}
        <Card className="p-6 space-y-6 border-yellow-700/40 bg-gradient-to-br from-yellow-600/10 to-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-yellow-500/20 border border-yellow-500/30">
                <Zap className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Adaptive Risk/Reward</h3>
                <p className="text-sm text-gray-300">Dynamiczne dostosowanie TP/SL na podstawie siły sygnału</p>
              </div>
            </div>
            <Switch checked={adaptiveRR} onCheckedChange={setAdaptiveRR} />
          </div>

          {adaptiveRR && (
            <>
              <Separator className="bg-gray-700/50" />
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    Mnożnik Adaptacyjny (0.5 - 2.0)
                  </Label>
                  <Input 
                    type="number" 
                    value={adaptiveMultiplier} 
                    onChange={(e) => setAdaptiveMultiplier(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.5"
                    max="2.0"
                    className="text-white bg-gray-900/60"
                  />
                  <p className="text-xs text-gray-400">
                    Jak mocno dostosować R:R. Wyższe wartości = bardziej agresywne TP dla silnych sygnałów
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Target className="h-4 w-4 text-yellow-400" />
                    Minimalna Siła Sygnału (0.0 - 1.0)
                  </Label>
                  <Input 
                    type="number" 
                    value={adaptiveStrengthThreshold} 
                    onChange={(e) => setAdaptiveStrengthThreshold(parseFloat(e.target.value))}
                    step="0.01"
                    min="0"
                    max="1"
                    className="text-white bg-gray-900/60"
                  />
                  <p className="text-xs text-gray-400">
                    Minimalna siła alertu wymagana do aktywacji Adaptive R:R (np. 0.5 = tylko sygnały ≥ 50% siły)
                  </p>
                </div>

                <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/30 rounded-lg p-4">
                  <h5 className="text-sm font-bold text-white mb-3">🧮 Przykład działania Adaptive R:R:</h5>
                  <div className="space-y-2 text-xs text-gray-300">
                    <div className="p-2 bg-gray-900/60 rounded">
                      <strong className="text-yellow-400">Słaby sygnał (strength = 0.3):</strong> Poniżej progu {adaptiveStrengthThreshold} → Używa standardowego R:R
                    </div>
                    <div className="p-2 bg-gray-900/60 rounded">
                      <strong className="text-yellow-400">Średni sygnał (strength = 0.6):</strong><br/>
                      Factor = {adaptiveMultiplier} × 0.6 = {(adaptiveMultiplier * 0.6).toFixed(2)}<br/>
                      TP1: {tp1RR}% → {(tp1RR * adaptiveMultiplier * 0.6).toFixed(2)}%<br/>
                      SL: {defaultSlRR}% → {(defaultSlRR / (adaptiveMultiplier * 0.6)).toFixed(2)}% (węziej)
                    </div>
                    <div className="p-2 bg-gray-900/60 rounded">
                      <strong className="text-yellow-400">Silny sygnał (strength = 0.9):</strong><br/>
                      Factor = {adaptiveMultiplier} × 0.9 = {(adaptiveMultiplier * 0.9).toFixed(2)}<br/>
                      TP1: {tp1RR}% → {(tp1RR * adaptiveMultiplier * 0.9).toFixed(2)}%<br/>
                      SL: {defaultSlRR}% → {(defaultSlRR / (adaptiveMultiplier * 0.9)).toFixed(2)}% (znacznie węziej)
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* ✅ NEW: SL as % Margin Configuration */}
        <Card className="p-6 space-y-6 border-red-700/40 bg-gradient-to-br from-red-600/10 to-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30">
                <DollarSign className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Stop Loss jako % Margin</h3>
                <p className="text-sm text-gray-300">Oblicz SL na podstawie maksymalnej straty margin zamiast % od entry</p>
              </div>
            </div>
            <Switch checked={slAsMarginPercent} onCheckedChange={setSlAsMarginPercent} />
          </div>

          {slAsMarginPercent && (
            <>
              <Separator className="bg-gray-700/50" />
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white flex items-center gap-2">
                    <Percent className="h-4 w-4 text-red-400" />
                    Maksymalne ryzyko (% od initial margin)
                  </Label>
                  <Input 
                    type="number" 
                    value={slMarginRiskPercent} 
                    onChange={(e) => setSlMarginRiskPercent(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.1"
                    max="10"
                    className="text-white bg-gray-900/60"
                  />
                  <p className="text-xs text-gray-400">
                    Ile % margin jesteś w stanie poświęcić na SL (np. 2.0 = maksymalnie 2% straty od margin)
                  </p>
                </div>

                <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 border border-red-500/30 rounded-lg p-4">
                  <h5 className="text-sm font-bold text-white mb-3">🧮 Przykład kalkulacji SL jako % margin:</h5>
                  <div className="space-y-3 text-xs text-gray-300">
                    <div className="p-3 bg-gray-900/60 rounded">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <span className="text-gray-400">Position size:</span>
                        <span className="text-white font-semibold">${positionSizeFixed}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <span className="text-gray-400">Leverage:</span>
                        <span className="text-white font-semibold">{leverageMode === "fixed" ? `${leverageFixed}x` : "10x (przykład)"}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2 pb-2 border-b border-gray-700">
                        <span className="text-gray-400">Initial margin:</span>
                        <span className="text-white font-semibold">
                          ${(positionSizeFixed / (leverageMode === "fixed" ? leverageFixed : 10)).toFixed(2)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <span className="text-red-400 font-semibold">Max loss ({slMarginRiskPercent}%):</span>
                        <span className="text-red-400 font-semibold">
                          ${((positionSizeFixed / (leverageMode === "fixed" ? leverageFixed : 10)) * (slMarginRiskPercent / 100)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-blue-300 bg-blue-900/20 p-2 rounded border border-blue-500/20">
                      💡 <strong>Różnica:</strong> Standardowy SL to % od entry price. SL jako % margin to % od zainwestowanego kapitału (margin).
                    </div>
                  </div>
                </div>
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
              <p className="text-sm text-gray-300">Elastyczne zarządzanie wielopoziomowymi TP i Stop Loss</p>
            </div>
          </div>

          {/* ✅ NEW: TP Mode Selection */}
          <div className="space-y-3 p-4 rounded-lg bg-gray-800/40 border border-gray-700/50">
            <Label className="text-white text-base font-semibold">Tryb obliczania Take Profit</Label>
            <Select value={tpMode} onValueChange={(v: "percent" | "rr") => setTpMode(v)}>
              <SelectTrigger className="text-white bg-gray-800/60 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">% od Entry (np. 1% powyżej ceny wejścia)</SelectItem>
                <SelectItem value="rr">R:R od Entry (np. 2:1 reward/risk ratio)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">
              {tpMode === "percent" 
                ? "TP będzie obliczany jako % powyżej/poniżej ceny entry" 
                : "TP będzie obliczany na podstawie R:R (reward:risk ratio) względem SL"}
            </p>
          </div>

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
                  {tpMode === "percent" ? "% od Entry" : "R:R ratio"}
                </Label>
                <Input 
                  type="number" 
                  value={tp1RR} 
                  onChange={(e) => setTp1RR(parseFloat(e.target.value))}
                  step="0.1"
                  min="0.1"
                  className="text-white bg-gray-900/60"
                />
                <p className="text-xs text-gray-400">
                  {tpMode === "percent" ? "np. 1.5 = 1.5% powyżej entry" : "np. 2.0 = 2:1 reward/risk"}
                </p>
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
                    {tpMode === "percent" ? "% od Entry" : "R:R ratio"}
                  </Label>
                  <Input 
                    type="number" 
                    value={tp2RR} 
                    onChange={(e) => setTp2RR(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.1"
                    className="text-white bg-gray-900/60"
                  />
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
                    {tpMode === "percent" ? "% od Entry" : "R:R ratio"}
                  </Label>
                  <Input 
                    type="number" 
                    value={tp3RR} 
                    onChange={(e) => setTp3RR(parseFloat(e.target.value))}
                    step="0.1"
                    min="0.1"
                    className="text-white bg-gray-900/60"
                  />
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
                </div>
              </div>
            </div>
          )}

          <Separator className="bg-gray-700/50" />

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
                </div>
              )}
            </div>
          </div>
        </Card>

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

        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Zachowanie dla Tego Samego Symbolu</h3>
          <p className="text-sm text-gray-300">Co robić gdy przychodzi alert w tym samym kierunku na symbolu z istniejącą pozycją?</p>
          
          <div className="space-y-2">
            <Label className="text-white">Strategia</Label>
            <Select value={sameSymbolBehavior} onValueChange={setSameSymbolBehavior}>
              <SelectTrigger className="text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ignore">Ignoruj nowy alert</SelectItem>
                <SelectItem value="track_confirmations">Śledź potwierdzenia</SelectItem>
                <SelectItem value="upgrade_tp">Upgrade TP</SelectItem>
                <SelectItem value="emergency_override">Emergency override</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Strategia dla Przeciwnego Kierunku</h3>
          <p className="text-sm text-gray-300">Co robić gdy przychodzi alert w przeciwnym kierunku?</p>
          
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

        <Card className="p-6 space-y-4 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white">Emergency Override</h3>
          <p className="text-sm text-gray-300">Kiedy Emergency może nadpisać istniejącą pozycję w tym samym kierunku?</p>
          
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