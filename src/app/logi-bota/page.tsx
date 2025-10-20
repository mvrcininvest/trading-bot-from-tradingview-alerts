"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Info, AlertTriangle, RefreshCw } from "lucide-react";

interface BotLog {
  id: number;
  timestamp: number;
  level: "error" | "warning" | "info" | "success";
  action: string;
  message: string;
  details: string | null;
  alertId: number | null;
  positionId: number | null;
  createdAt: number;
}

export default function LogiBotaPage() {
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [total, setTotal] = useState(0);
  const [limit] = useState(100);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let url = `/api/bot/logs?limit=${limit}`;
      if (levelFilter !== "all") url += `&level=${levelFilter}`;
      if (actionFilter !== "all") url += `&action=${actionFilter}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [levelFilter, actionFilter]);

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getLevelBadgeVariant = (level: string) => {
    switch (level) {
      case "error":
        return "destructive";
      case "warning":
        return "outline";
      case "success":
        return "default";
      default:
        return "secondary";
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString("pl-PL");
  };

  const actionLabels: Record<string, string> = {
    webhook_received: "Webhook otrzymany",
    alert_rejected: "Alert odrzucony",
    position_opened: "Pozycja otwarta",
    position_closed: "Pozycja zamknięta",
    order_failed: "Błąd zlecenia",
    sl_tp_set_failed: "Błąd SL/TP",
    leverage_set_failed: "Błąd dźwigni",
    tp_upgrade: "Upgrade TP",
    tp_upgrade_failed: "Błąd upgrade TP",
    sync_positions: "Synchronizacja",
    sync_error: "Błąd synchronizacji",
    position_sync_closed: "Pozycja zsynchronizowana",
  };

  // Get unique actions from logs
  const uniqueActions = Array.from(new Set(logs.map((log) => log.action)));

  // Stats
  const errorCount = logs.filter((log) => log.level === "error").length;
  const warningCount = logs.filter((log) => log.level === "warning").length;
  const successCount = logs.filter((log) => log.level === "success").length;
  const infoCount = logs.filter((log) => log.level === "info").length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Logi Bota</h1>
          <p className="text-muted-foreground">
            Śledzenie wszystkich akcji, błędów i ostrzeżeń
          </p>
        </div>
        <Button onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Odśwież
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Błędy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{errorCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Ostrzeżenia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{warningCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Sukces
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              Informacje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{infoCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtry</CardTitle>
          <CardDescription>Ogranicz wyświetlane logi</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Poziom</label>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  <SelectItem value="error">Błędy</SelectItem>
                  <SelectItem value="warning">Ostrzeżenia</SelectItem>
                  <SelectItem value="success">Sukces</SelectItem>
                  <SelectItem value="info">Informacje</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Akcja</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {uniqueActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {actionLabels[action] || action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <Card>
        <CardHeader>
          <CardTitle>Historia Logów</CardTitle>
          <CardDescription>
            Wyświetlanie {logs.length} z {total} logów
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-muted-foreground mt-2">Ładowanie logów...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <Info className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground mt-2">Brak logów do wyświetlenia</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5">{getLevelIcon(log.level)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getLevelBadgeVariant(log.level)}>
                            {log.level.toUpperCase()}
                          </Badge>
                          <Badge variant="outline">
                            {actionLabels[log.action] || log.action}
                          </Badge>
                          {log.alertId && (
                            <Badge variant="secondary">Alert #{log.alertId}</Badge>
                          )}
                          {log.positionId && (
                            <Badge variant="secondary">Pozycja #{log.positionId}</Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium mb-1">{log.message}</p>
                        {log.details && (
                          <details className="text-xs text-muted-foreground mt-2">
                            <summary className="cursor-pointer hover:text-foreground">
                              Szczegóły
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(JSON.parse(log.details), null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}