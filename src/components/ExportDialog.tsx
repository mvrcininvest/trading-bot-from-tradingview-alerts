"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Download, Loader2, Filter, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
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
      params.append("format", exportFormat);
      
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
      
      if (exportFormat === "csv") {
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
          {/* ✅ POPRAWIONY Format Selection - lepszy wygląd z checkmarkami */}
          <div className="space-y-3">
            <Label className="text-white text-base font-semibold">Format Pliku</Label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setExportFormat("json")}
                className={cn(
                  "p-4 rounded-lg border-2 cursor-pointer transition-all relative",
                  exportFormat === "json"
                    ? "border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/10"
                    : "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg text-white">JSON</p>
                    <p className="text-xs text-gray-400">Pełne dane + alerty</p>
                  </div>
                  {exportFormat === "json" && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              </div>

              <div
                onClick={() => setExportFormat("csv")}
                className={cn(
                  "p-4 rounded-lg border-2 cursor-pointer transition-all relative",
                  exportFormat === "csv"
                    ? "border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/10"
                    : "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg text-white">CSV</p>
                    <p className="text-xs text-gray-400">Excel/Sheets</p>
                  </div>
                  {exportFormat === "csv" && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ✅ POPRAWIONY Period Selection - lepszy wygląd z checkmarkami */}
          <div className="space-y-3">
            <Label className="text-white text-base font-semibold">Okres Danych</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "7", label: "7 dni" },
                { value: "30", label: "30 dni" },
                { value: "90", label: "90 dni" },
                { value: "all", label: "Wszystko" },
                { value: "custom", label: "Niestandardowy" },
              ].map((option) => (
                <div
                  key={option.value}
                  onClick={() => setPeriod(option.value as any)}
                  className={cn(
                    "p-3 rounded-lg border-2 cursor-pointer transition-all",
                    period === option.value
                      ? "border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/10"
                      : "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "font-semibold",
                      period === option.value ? "text-white" : "text-gray-300"
                    )}>
                      {option.label}
                    </span>
                    {period === option.value && (
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Date Range */}
          {period === "custom" && (
            <div className="space-y-3 pl-6 border-l-2 border-blue-500/50 bg-blue-500/5 py-2">
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