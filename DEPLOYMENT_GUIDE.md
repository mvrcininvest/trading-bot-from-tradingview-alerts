# 🚀 Deployment Guide - Przeniesienie do Regionu USA (Vercel)

## Problem
- Lokalne uruchomienie (`bun dev`) używa Twojego IP → CloudFront blokuje
- Bybit akceptuje tylko określone regiony (USA, UK, Europa)

## Rozwiązanie
Deploy aplikacji na **Vercel** w regionie **iad1 (USA - Washington DC)**

---

## 📋 Kroki Deployment

### 1. Zainstaluj Vercel CLI (jeśli nie masz)
```bash
npm i -g vercel
```

### 2. Zaloguj się do Vercel
```bash
vercel login
```

### 3. Deploy aplikację
```bash
vercel
```

Podczas pierwszego deployment odpowiedz na pytania:
- **Set up and deploy?** → Yes
- **Which scope?** → Wybierz swoje konto
- **Link to existing project?** → No
- **Project name?** → trading-bot (lub inna nazwa)
- **Directory?** → `./` (enter)
- **Override settings?** → No

### 4. Deploy na produkcję
```bash
vercel --prod
```

### 5. Dodaj zmienne środowiskowe na Vercel
Po deployment, dodaj wszystkie zmienne z `.env` w Vercel Dashboard:

1. Wejdź na: https://vercel.com/dashboard
2. Wybierz swój projekt
3. Settings → Environment Variables
4. Dodaj wszystkie zmienne z `.env`:
   - `TURSO_CONNECTION_URL`
   - `TURSO_AUTH_TOKEN`
   - `BYBIT_API_KEY`
   - `BYBIT_API_SECRET`
   - `WEBHOOK_SECRET_KEY`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_FROM`
   - `TWILIO_PHONE_TO`
   - itd...

### 6. Redeploy z nowymi zmiennymi
```bash
vercel --prod
```

---

## ✅ Weryfikacja

Po deployment:
1. Otwórz URL produkcyjny (np. `https://trading-bot-xxx.vercel.app`)
2. Przejdź do `/glowna`
3. Sprawdź czy "Saldo Konta" pokazuje wartość zamiast błędu geo-blocking

---

## 🎯 Dlaczego to działa?

| Środowisko | Gdzie wykonuje się kod | IP serwera | Status Bybit |
|------------|------------------------|------------|--------------|
| **Lokalne** (`bun dev`) | Twój komputer | Twoje IP (zablokowane) | ❌ Geo-blocking |
| **Vercel** (produkcja) | Serwer w USA | IP z USA | ✅ Działa |

---

## 📱 Po deployment

Możesz nadal rozwijać lokalnie:
- Zmiany w kodzie → `git push` → Vercel auto-deploy
- Albo: `vercel --prod` dla manual deployment

Testowanie:
- **Development lokalnie**: Widzisz geo-blocking (normalne)
- **Produkcja Vercel**: Wszystko działa ✅

---

## 🔧 Troubleshooting

**Problem:** Nadal widzę geo-blocking na Vercel
**Rozwiązanie:** Sprawdź czy wszystkie API routes są server-side (nie client-side fetch z przeglądarki)

**Problem:** Zmienne środowiskowe nie działają
**Rozwiązanie:** Upewnij się, że dodałeś wszystkie zmienne w Vercel Dashboard → Settings → Environment Variables

**Problem:** Build error na Vercel
**Rozwiązanie:** Sprawdź logi deployment w Vercel Dashboard
