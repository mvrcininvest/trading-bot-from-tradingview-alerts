# Bybit Proxy Server

Prosty proxy server do omijania geo-blockingu CloudFront dla Bybit API.

## 🚀 Deployment na Railway.app

### Krok 1: Przygotowanie
1. Zaloguj się na [Railway.app](https://railway.app)
2. Kliknij "New Project"

### Krok 2: Deploy z GitHub
1. Połącz swoje konto GitHub z Railway
2. Wybierz repozytorium tego projektu
3. Railway automatycznie wykryje Node.js
4. Ustaw **Root Directory** na: `proxy-server`

### Krok 3: Konfiguracja
1. W ustawieniach projektu Railway:
   - **Region**: wybierz **Singapore** (asia-southeast1)
   - **Port**: Railway automatycznie ustawi PORT jako zmienną środowiskową
2. Kliknij "Deploy"

### Krok 4: Pobierz URL
1. Po deploymencie Railway wygeneruje public URL
2. Przykład: `https://your-proxy.railway.app`
3. Zapisz ten URL - będzie potrzebny w głównej aplikacji

## 📡 Testowanie

Sprawdź czy proxy działa:
```bash
curl https://your-proxy.railway.app/health
```

Powinno zwrócić:
```json
{
  "status": "healthy",
  "message": "Bybit Proxy Server Running",
  "timestamp": "2025-11-25T..."
}
```

## 🔧 Endpointy

- `GET /health` - Health check
- `ALL /proxy/bybit/*` - Proxy wszystkich requestów do Bybit API

## Przykład użycia

Zamiast:
```
https://api.bybit.com/v5/market/tickers
```

Używaj:
```
https://your-proxy.railway.app/proxy/bybit/v5/market/tickers
```

## 📊 Monitoring

Railway dashboard pokazuje:
- Real-time logs
- CPU/Memory usage
- Request metrics
- Deployment history
