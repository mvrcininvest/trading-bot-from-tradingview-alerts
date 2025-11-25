# 🚀 Instrukcja Deployment Proxy Server na Railway.app

## Co to rozwiązuje?
- ✅ 100% danych z Bybit API (nie z lokalnej bazy)
- ✅ Brak geo-blockingu CloudFront
- ✅ Dokładne statystyki i analytics
- ✅ Real-time synchronizacja pozycji

---

## 📋 KROK PO KROKU

### KROK 1: Przygotuj Repozytorium GitHub

Twój folder `proxy-server/` musi być w repozytorium GitHub:

```bash
# Jeśli jeszcze nie masz repo:
git init
git add .
git commit -m "Add Bybit proxy server"
git branch -M main
git remote add origin https://github.com/TWOJ_USERNAME/TWOJ_REPO.git
git push -u origin main
```

---

### KROK 2: Deploy na Railway.app

1. **Zaloguj się**: Wejdź na [railway.app](https://railway.app) i zaloguj przez GitHub

2. **Nowy Projekt**:
   - Kliknij **"New Project"**
   - Wybierz **"Deploy from GitHub repo"**
   - Wybierz swoje repozytorium

3. **Konfiguracja Projektu**:
   ```
   Root Directory: proxy-server
   Start Command: npm start
   Region: asia-southeast1 (Singapore)
   ```

4. **Ustawienia**:
   - Przejdź do **Settings** → **Environment**
   - Railway automatycznie ustawi zmienną `PORT`
   - Nie musisz dodawać żadnych innych zmiennych

5. **Deploy**:
   - Railway automatycznie zbuduje i wdroży aplikację
   - Po 1-2 minutach zobaczysz status "Active"

6. **Pobierz Public URL**:
   - Przejdź do **Settings** → **Networking**
   - Skopiuj **Public Domain** (np. `https://bybit-proxy-production.up.railway.app`)
   - **ZAPISZ TEN URL** - będzie potrzebny w następnym kroku!

---

### KROK 3: Test Proxy

Sprawdź czy proxy działa:

```bash
curl https://TWOJ-PROXY-URL.railway.app/health
```

Powinno zwrócić:
```json
{
  "status": "healthy",
  "message": "Bybit Proxy Server Running",
  "timestamp": "2025-11-25T..."
}
```

---

### KROK 4: Skonfiguruj Główną Aplikację

Dodaj URL proxy jako zmienną środowiskową w Vercel:

1. Wejdź na [vercel.com](https://vercel.com) → Twój projekt
2. Przejdź do **Settings** → **Environment Variables**
3. Dodaj nową zmienną:
   ```
   BYBIT_PROXY_URL=https://TWOJ-PROXY-URL.railway.app
   ```
4. Redeploy aplikację Vercel

---

### KROK 5: Weryfikacja

Po redeployment Vercel:

1. Wejdź na `/dashboard`
2. Sprawdź czy dane się ładują z Bybit (nie z lokalnej bazy)
3. Przejdź do `/statystyki` - powinny pokazać dane z Bybit API
4. Sprawdź `/bot-history` - historia z Bybit

---

## 🔍 Monitoring i Debugging

### Railway Logs
```
Railway Dashboard → Deployments → View Logs
```

Logi pokażą każdy request:
```
[Proxy] GET https://api.bybit.com/v5/position/list
[Proxy] ✅ Success: 200
```

### Testowanie Endpointów

**Health Check:**
```bash
curl https://TWOJ-PROXY.railway.app/health
```

**Bybit Market Data (public endpoint):**
```bash
curl "https://TWOJ-PROXY.railway.app/proxy/bybit/v5/market/tickers?category=linear&symbol=BTCUSDT"
```

**Bybit Positions (wymaga auth headers):**
Sprawdź czy aplikacja wysyła requesty przez proxy w Railway logs.

---

## 💰 Koszty Railway

- **Free Tier**: $5 credit miesięcznie
- **Twoje zużycie**: ~$2-3/miesiąc (light usage)
- **Limit**: 500 godzin/miesiąc (wystarczające)

**Monitoring zużycia**: Railway Dashboard → Usage

---

## 🛠️ Troubleshooting

### Problem: "Service Unavailable"
**Rozwiązanie**: Sprawdź Railway logs - może być błąd w starcie aplikacji

### Problem: "502 Bad Gateway"  
**Rozwiązanie**: Restart service w Railway Dashboard

### Problem: Wciąż geo-blocking
**Rozwiązanie**: 
1. Sprawdź czy `BYBIT_PROXY_URL` jest ustawiony w Vercel
2. Sprawdź czy aplikacja używa proxy (Railway logs powinny pokazywać requesty)
3. Upewnij się że region Railway to Singapore

### Problem: Wolne odpowiedzi
**Rozwiązanie**: Railway free tier ma limitowane CPU - rozważ upgrade do $5/miesiąc

---

## ✅ Checklist

- [ ] Proxy server zdeployowany na Railway
- [ ] Region ustawiony na Singapore  
- [ ] Public URL skopiowany
- [ ] `BYBIT_PROXY_URL` dodany do Vercel env vars
- [ ] Vercel zredeploy-owany
- [ ] Health check działa (`/health`)
- [ ] Dashboard ładuje dane z Bybit
- [ ] Statystyki pokazują poprawne dane
- [ ] Railway logs pokazują przychodzące requesty

---

## 📞 Potrzebujesz Pomocy?

Sprawdź Railway logs:
1. Railway Dashboard → Twój projekt
2. Deployments → Latest deployment
3. View Logs

Typowe błędy będą widoczne w logach wraz z dokładnymi error messages.
