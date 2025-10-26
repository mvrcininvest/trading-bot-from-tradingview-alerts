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
import { Bot } from "lucide-react"

export default function BotSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

        {/* Bot Enable/Disable */}
        <Card className="p-6 border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Status Bota</h3>
              <p className="text-sm text-gray-400">Włącz lub wyłącz automatyczny trading</p>
            </div>
            <Switch checked={botEnabled} onCheckedChange={setBotEnabled} />
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