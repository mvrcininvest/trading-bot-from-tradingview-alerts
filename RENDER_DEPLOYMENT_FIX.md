# 🔧 Render Deployment - CloudFront 403 Fix

## Problem
Render deployment fails with `403 CloudFront geo-blocking` error when connecting to Bybit API:
```
The Amazon CloudFront distribution is configured to block access from your country.
```

## Solution: Bybit Proxy System

Zaimplementowaliśmy system proxy, który automatycznie kieruje wszystkie requesty Bybit przez zewnętrzny serwis proxy, omijając blokadę geograficzną CloudFront.

---

## 🚀 Instrukcje Deploymentu na Render

### Krok 1: Dodaj Zmienne Środowiskowe na Render

Przejdź do swojego projektu na Render i dodaj następujące **Environment Variables**:

```bash
# Bybit Proxy - KRYTYCZNE dla ominięcia CloudFront 403
USE_BYBIT_PROXY=true
BYBIT_PROXY_URL=https://api.allorigins.win/raw?url=

# Pozostałe zmienne (jeśli jeszcze nie są dodane)
BYBIT_API_KEY=<twój_api_key>
BYBIT_API_SECRET=<twój_api_secret>
BYBIT_ENVIRONMENT=mainnet
TURSO_CONNECTION_URL=<twoja_baza_danych>
TURSO_AUTH_TOKEN=<twój_token>
```

### Krok 2: Deploy

1. Po dodaniu zmiennych środowiskowych, kliknij **"Manual Deploy"** → **"Deploy latest commit"**
2. Poczekaj na zakończenie buildu (około 5-10 minut)

### Krok 3: Weryfikacja

Po zakończeniu deploymentu:

1. Otwórz swoją aplikację na Render
2. Przejdź do strony `/glowna`
3. Sprawdź **logi Render** (Dashboard → Logs), powinieneś zobaczyć:

```
🔧 [BYBIT PROXY] Status: { enabled: true, proxyUrl: 'https://api.allorigins.win/raw?url=', environment: 'production', isVercel: false, isRender: true }
[Bybit Proxy] Routing through proxy: https://api.bybit.com/v5/position/list...
```

4. **Saldo konta** powinno się teraz poprawnie wyświetlać na stronie głównej

---

## 🔍 Jak Działa Proxy System

### Automatyczna Detekcja

Proxy jest **automatycznie włączany** gdy:
- `NODE_ENV === 'production'` **AND** `RENDER === true` (deployment na Render)
- **OR** ręcznie włączony przez `USE_BYBIT_PROXY=true`

### Flow Requestów

**Bez Proxy (Zablokowane):**
```
Render Server → https://api.bybit.com → ❌ 403 CloudFront Block
```

**Z Proxy (Działające):**
```
Render Server → https://api.allorigins.win/raw?url=https://api.bybit.com → ✅ Success
```

### Zmiana Proxy URL (Opcjonalne)

Jeśli `api.allorigins.win` ma problemy, możesz użyć alternatywnych proxy:

```bash
# Opcja 1: CORS Anywhere
BYBIT_PROXY_URL=https://cors-anywhere.herokuapp.com/

# Opcja 2: AllOrigins
BYBIT_PROXY_URL=https://api.allorigins.win/raw?url=

# Opcja 3: Twój własny proxy (najlepsze dla produkcji)
BYBIT_PROXY_URL=https://twoj-proxy.com/api?target=
```

---

## 🛠️ Troubleshooting

### Problem: Nadal 403 po deploymencie

**Rozwiązanie:**
1. Sprawdź czy `USE_BYBIT_PROXY=true` jest ustawione na Render
2. Sprawdź logi: czy widzisz `[Bybit Proxy] Routing through proxy`?
3. Jeśli nie, sprawdź czy zmienna środowiskowa została poprawnie załadowana
4. Spróbuj **"Clear build cache & deploy"** na Render

### Problem: Proxy działa, ale jest wolny

**Rozwiązanie:**
Publiczne proxy mogą być wolne. Najlepsze rozwiązanie dla produkcji:
1. Postaw własny proxy na Render/Vercel (10 minut setup)
2. Lub użyj VPN-based proxy (np. BrightData, ScraperAPI)
3. Lub przenieś deployment do regionu nie-blokowanego przez Bybit (np. US West)

### Problem: Deployment się nie udaje (webpack error)

**To nie jest webpack error!** Render pokazuje to jako "webpack error", ale prawdziwy problem to 403 CloudFront podczas **runtime**, nie podczas buildu.

Proxy system naprawia to, kierując requesty przez dozwolony region.

---

## 📊 Monitoring

Po deploymencie, monitoruj:

1. **Render Logs**: Szukaj `[Bybit Proxy] Routing through proxy`
2. **Strona `/glowna`**: Sprawdź czy "Saldo Konta" się wyświetla
3. **Performance**: Proxy może dodać 100-300ms latency

---

## ✅ Checklist Przed Deploymentem

- [ ] Dodane `USE_BYBIT_PROXY=true` na Render
- [ ] Dodane `BYBIT_PROXY_URL=https://api.allorigins.win/raw?url=` na Render
- [ ] Wszystkie inne zmienne środowiskowe są skonfigurowane
- [ ] Wykonano "Clear build cache & deploy"
- [ ] Po deploymencie: sprawdzono logi i stronę `/glowna`

---

## 🎯 Alternatywa: Hosting w Dozwolonym Regionie

Jeśli nie chcesz używać proxy, możesz:

1. **Przenieść deployment na Vercel** (US West/East region)
2. **Użyć AWS Lambda** w dozwolonym regionie
3. **Użyć Cloudflare Workers** (edge computing w wielu regionach)

Bybit CloudFront blokuje:
- ❌ Większość Europejskich regionów
- ❌ Niektóre Azjatyckie regiony
- ✅ US West/East (zazwyczaj działają)

---

## 📝 Notatki

- **Bezpieczeństwo**: Proxy nie ma dostępu do API keys/secrets (są w signed headers)
- **Produkcja**: Rozważ własny proxy dla lepszej wydajności i niezawodności
- **Testing**: Proxy działa również lokalnie z `USE_BYBIT_PROXY=true` w `.env`

---

## 🆘 Potrzebujesz Pomocy?

Jeśli nadal masz problemy:
1. Sprawdź logi Render - wyszukaj "CloudFront" lub "403"
2. Sprawdź czy proxy jest włączony: szukaj `[Bybit Proxy] Status`
3. Przetestuj lokalnie z `USE_BYBIT_PROXY=true`
