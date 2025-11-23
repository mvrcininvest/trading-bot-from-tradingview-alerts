"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Download, Loader2, Filter } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [period, setPeriod] = useState<"7" | "30" | "90" | "custom" | "all">("30");
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [loading, setLoading] = useState(false);
  
  // ✅ Advanced Filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [selectedSide, setSelectedSide] = useState<string>("all");
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);

  const tiers = ["Platinum", "Premium", "Standard", "Quick", "Emergency"];

  // Fetch available symbols from history
  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const response = await fetch("/api/bot/history?limit=1000");
        const data = await response.json();
        if (data.success && data.history) {
          const symbols = Array.from(new Set(data.history.map((h: any) => h.symbol))).sort();
          setAvailableSymbols(symbols as string[]);
        }
      } catch (error) {
        console.error("Failed to fetch symbols:", error);
      }
    };
    
    if (open) {
      fetchSymbols();
    }
  }, [open]);

  const toggleTier = (tier: string) => {
    setSelectedTiers(prev => 
      prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]
    );
  };

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols(prev => 
      prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
    );
  };

  const handleExport = async () => {
    setLoading(true);
    
    try {
      // Build query params
      const params = new URLSearchParams();
      params.append("format", format);
      
      if (period === "all") {
        params.append("all", "true");
      } else if (period === "custom") {
        if (!dateFrom || !dateTo) {
          toast.error("Wybierz zakres dat");
          setLoading(false);
          return;
        }
        params.append("from", dateFrom.toISOString());
        params.append("to", dateTo.toISOString());
      } else {
        params.append("days", period);
      }
      
      // ✅ Add advanced filters
      if (selectedTiers.length > 0) {
        params.append("tier", selectedTiers.join(","));
      }
      
      if (selectedSymbols.length > 0) {
        params.append("symbol", selectedSymbols.join(","));
      }
      
      if (selectedSide !== "all") {
        params.append("side", selectedSide);
      }
      
      const url = `/api/export/positions?${params.toString()}`;
      
      toast.info("Przygotowywanie eksportu...");
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Błąd eksportu");
      }
      
      if (format === "csv") {
        // Download CSV
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `positions_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        toast.success("CSV pobrane pomyślnie!");
      } else {
        // Download JSON
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.message || "Brak danych do eksportu");
        }
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `positions_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        toast.success(`JSON pobrane: ${data.count} pozycji`);
      }
      
      onOpenChange(false);
      
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error(error.message || "Błąd podczas eksportu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">Eksportuj Dane Pozycji</DialogTitle>
          <DialogDescription className="text-gray-400">
            Wybierz format, zakres dat i filtry dla eksportu danych z historii pozycji
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-white">Format Pliku</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as "json" | "csv")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json" className="text-gray-300 cursor-pointer">
                  JSON (dla AI/ML - zawiera pełne dane alertów)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="text-gray-300 cursor-pointer">
                  CSV (dla Excel/Google Sheets)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Period Selection */}
          <div className="space-y-3">
            <Label className="text-white">Okres Danych</Label>
            <RadioGroup value={period} onValueChange={(v) => setPeriod(v as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="7" id="7days" />
                <Label htmlFor="7days" className="text-gray-300 cursor-pointer">
                  Ostatnie 7 dni
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="30" id="30days" />
                <Label htmlFor="30days" className="text-gray-300 cursor-pointer">
                  Ostatnie 30 dni
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="90" id="90days" />
                <Label htmlFor="90days" className="text-gray-300 cursor-pointer">
                  Ostatnie 90 dni
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all" className="text-gray-300 cursor-pointer">
                  Wszystkie dane
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="custom" />
                <Label htmlFor="custom" className="text-gray-300 cursor-pointer">
                  Niestandardowy zakres
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Custom Date Range */}
          {period === "custom" && (
            <div className="space-y-3 pl-6 border-l-2 border-gray-700">
              <div className="space-y-2">
                <Label className="text-gray-300">Od</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal bg-gray-800 border-gray-700 text-gray-300",
                        !dateFrom && "text-gray-500"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "PPP") : "Wybierz datę"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                      className="bg-gray-800"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Do</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal bg-gray-800 border-gray-700 text-gray-300",
                        !dateTo && "text-gray-500"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "PPP") : "Wybierz datę"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                      className="bg-gray-800"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Advanced Filters Toggle */}
          <div className="border-t border-gray-800 pt-4">
            <Button
              variant="ghost"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <Filter className="mr-2 h-4 w-4" />
              {showAdvancedFilters ? "Ukryj" : "Pokaż"} zaawansowane filtry
            </Button>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              {/* Tier Filter */}
              <div className="space-y-3">
                <Label className="text-white">Filtry Tier</Label>
                <div className="grid grid-cols-2 gap-2">
                  {tiers.map(tier => (
                    <div key={tier} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tier-${tier}`}
                        checked={selectedTiers.includes(tier)}
                        onCheckedChange={() => toggleTier(tier)}
                      />
                      <Label
                        htmlFor={`tier-${tier}`}
                        className="text-gray-300 cursor-pointer text-sm"
                      >
                        {tier}
                      </Label>
                    </div>
                  ))}
                </div>
                {selectedTiers.length > 0 && (
                  <p className="text-xs text-blue-400">
                    Wybrane: {selectedTiers.join(", ")}
                  </p>
                )}
              </div>

              {/* Symbol Filter */}
              <div className="space-y-3">
                <Label className="text-white">Filtry Symbol</Label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {availableSymbols.map(symbol => (
                    <div key={symbol} className="flex items-center space-x-2">
                      <Checkbox
                        id={`symbol-${symbol}`}
                        checked={selectedSymbols.includes(symbol)}
                        onCheckedChange={() => toggleSymbol(symbol)}
                      />
                      <Label
                        htmlFor={`symbol-${symbol}`}
                        className="text-gray-300 cursor-pointer text-sm"
                      >
                        {symbol}
                      </Label>
                    </div>
                  ))}
                </div>
                {selectedSymbols.length > 0 && (
                  <p className="text-xs text-blue-400">
                    Wybrane: {selectedSymbols.join(", ")}
                  </p>
                )}
              </div>

              {/* Side Filter */}
              <div className="space-y-3">
                <Label className="text-white">Filtr Side (kierunek)</Label>
                <Select value={selectedSide} onValueChange={setSelectedSide}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="all">Wszystkie</SelectItem>
                    <SelectItem value="Buy">Buy (Long)</SelectItem>
                    <SelectItem value="Sell">Sell (Short)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clear Filters */}
              {(selectedTiers.length > 0 || selectedSymbols.length > 0 || selectedSide !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedTiers([]);
                    setSelectedSymbols([]);
                    setSelectedSide("all");
                  }}
                  className="w-full border-gray-700 text-gray-300 hover:bg-gray-700"
                >
                  Wyczyść wszystkie filtry
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
          >
            Anuluj
          </Button>
          <Button
            onClick={handleExport}
            disabled={loading || (period === "custom" && (!dateFrom || !dateTo))}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Eksportowanie...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Eksportuj
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}