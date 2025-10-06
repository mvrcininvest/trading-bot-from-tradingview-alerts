# 🚀 Deployment na Vercel

Twoja aplikacja jest gotowa do wdrożenia! Vercel to najlepsza platforma dla Next.js - działa 24/7 i jest **całkowicie DARMOWA**.

## 📋 Wymagania

- Konto na [GitHub](https://github.com) (darmowe)
- Konto na [Vercel](https://vercel.com) (darmowe - bez limitu czasu!)

---

## 🔧 Krok 1: Wrzuć projekt na GitHub

### Opcja A: GitHub Desktop (najłatwiej - BEZ TERMINALA)

1. **Pobierz GitHub Desktop:** https://desktop.github.com
2. **Zaloguj się** przez GitHub
3. **File → Add Local Repository** → wybierz folder projektu
4. **Publish repository** (prawy górny róg)
   - ✅ Zaznacz "Keep this code private" jeśli chcesz prywatne repo
   - Kliknij **Publish repository**

### Opcja B: Terminal (dla zaawansowanych)

```bash
git init
git add .
git commit -m "Initial commit - Trading Bot"
git branch -M main
git remote add origin https://github.com/TWOJA_NAZWA/NAZWA_REPO.git
git push -u origin main
```

---

## ☁️ Krok 2: Deploy na Vercel

### 1. Idź na Vercel.com
- Otwórz: https://vercel.com
- Kliknij **"Sign Up"** (prawy górny róg)
- Wybierz **"Continue with GitHub"**
- Zaloguj się przez GitHub i zaakceptuj uprawnienia

### 2. Import projektu z GitHub
Po zalogowaniu:
- Kliknij **"Add New..."** (prawy górny róg)
- Wybierz **"Project"**
- Znajdź swoje repozytorium na liście
- Kliknij **"Import"** przy swoim repo

### 3. Skonfiguruj zmienne środowiskowe
**PRZED** kliknięciem "Deploy":

1. Rozwiń sekcję **"Environment Variables"**
2. Dodaj zmienne (skopiuj z Twojego lokalnego pliku `.env`):

```
Name: TURSO_CONNECTION_URL
Value: [wklej wartość z pliku .env]
```

```
Name: TURSO_AUTH_TOKEN
Value: [wklej wartość z pliku .env]
```

3. Upewnij się że obie zmienne są ustawione na **"Production, Preview, and Development"**

### 4. Kliknij Deploy!
- Kliknij niebieski przycisk **"Deploy"**
- Poczekaj 30-60 sekund
- ✅ Gotowe! Zobaczysz animację konfetti 🎉

---

## 🌐 Krok 3: Skopiuj URL Webhook

Po deploymencie Vercel da Ci URL typu:
```
https://twoj-bot.vercel.app
```

**Twój webhook URL to:**
```
https://twoj-bot.vercel.app/api/webhook/tradingview
```

### Jak znaleźć swój URL:
1. Na stronie z konfetti kliknij **"Continue to Dashboard"**
2. Skopiuj URL z górnej części strony (obok "Domains")
3. Dodaj na końcu: `/api/webhook/tradingview`

**Wklej ten pełny URL w TradingView** w ustawieniach alertu! 🎉

---

## 📊 Po deploymencie - TEST

### 1. Sprawdź czy aplikacja działa:
Otwórz w przeglądarce:
```
https://twoj-bot.vercel.app
```
Powinieneś zobaczyć stronę główną.

### 2. Sprawdź dashboard alertów:
Otwórz:
```
https://twoj-bot.vercel.app/alerts
```
Powinieneś zobaczyć pustą tabelę (normalne - jeszcze nie ma alertów).

### 3. Wyślij testowy alert z TradingView
1. W TradingView stwórz alert
2. W polu "Webhook URL" wklej: `https://twoj-bot.vercel.app/api/webhook/tradingview`
3. W "Message" wklej JSON z Twojego wskaźnika
4. Zapisz alert
5. Alert powinien się uruchomić i pojawić w `/alerts`

---

## 🔄 Aktualizacje - Automatyczne!

**Każda zmiana w kodzie** którą push'ujesz na GitHub **automatycznie** wdraża się na Vercel!

### Jak zaktualizować bota:

1. **Zmień kod lokalnie** (w swoim edytorze)
2. **Wypchnij na GitHub:**

**GitHub Desktop:**
- Wpisz opis zmian w lewym dolnym rogu
- Kliknij **"Commit to main"**
- Kliknij **"Push origin"** (prawy górny róg)

**Terminal:**
```bash
git add .
git commit -m "Opis zmian"
git push
```

3. **Vercel automatycznie** przebuduje i wdroży nową wersję w ~30 sekund! 🚀

Możesz obserwować progress w dashboard Vercel (zakładka "Deployments").

---

## 🔍 Logi i Monitoring

### Jak sprawdzić logi (jeśli coś nie działa):

1. Idź na [vercel.com](https://vercel.com)
2. Otwórz swój projekt
3. Kliknij zakładkę **"Logs"** (u góry)
4. Zobacz requesty w czasie rzeczywistym
5. Kliknij na konkretny request aby zobaczyć szczegóły

### Typy logów:
- **Build Logs** - logi z budowania aplikacji
- **Function Logs** - logi z API routes (tu zobaczysz alerty z TradingView)

---

## ⚡ Troubleshooting

### Problem: Build fails (czerwony X)
**Rozwiązanie:**
- Kliknij na failed deployment
- Sprawdź "Build Logs"
- Najczęściej: brakujące zmienne środowiskowe
  - Idź do **Settings → Environment Variables**
  - Dodaj `TURSO_CONNECTION_URL` i `TURSO_AUTH_TOKEN`
  - Kliknij **"Redeploy"** (przycisk w deployments)

### Problem: 500 Internal Server Error
**Rozwiązanie:**
- Idź do **Logs** (zakładka u góry)
- Kliknij na czerwony request
- Sprawdź error message
- Najczęściej: niepoprawne wartości w zmiennych środowiskowych

### Problem: TradingView nie wysyła alertów
**Rozwiązanie:**
- ✅ Upewnij się że używasz HTTPS URL (Vercel daje automatycznie)
- ✅ Sprawdź czy webhook URL jest poprawny (kończy się na `/api/webhook/tradingview`)
- ✅ Sprawdź w Vercel Logs czy requesty przychodzą
- ✅ Przetestuj webhook ręcznie przez Postman lub curl

### Problem: Dane nie zapisują się do bazy
**Rozwiązanie:**
- Sprawdź czy `TURSO_CONNECTION_URL` i `TURSO_AUTH_TOKEN` są poprawne
- Sprawdź logi funkcji w Vercel
- Upewnij się że baza Turso istnieje i migracje są uruchomione

---

## 💰 Koszty

**Vercel darmowy plan ("Hobby"):**
- ✅ **CAŁKOWICIE DARMOWY** - bez limitu czasu!
- ✅ 100GB bandwidth/miesiąc (OGROMNIE dużo!)
- ✅ Nieograniczona liczba requestów dla serverless functions
- ✅ Automatyczne SSL (HTTPS)
- ✅ Globalna CDN
- ✅ Automatyczne buildy z GitHub

**Trading bot używa ~0.01% z darmowego limitu!** Starczy na dziesiątki tysięcy alertów dziennie.

Jeśli kiedykolwiek przekroczysz limit (co jest praktycznie niemożliwe dla bota tradingowego):
- Vercel Pro = $20/miesiąc
- Ale naprawdę **nie potrzebujesz** - darmowy plan wystarczy!

---

## 📈 Dodatkowe funkcje Vercel

### Custom Domain (opcjonalnie)
Chcesz mieć własną domenę typu `twoj-bot.com`?
1. Kup domenę (np. na Namecheap, GoDaddy)
2. W Vercel → **Settings → Domains**
3. Dodaj swoją domenę
4. Vercel pokaże jak skonfigurować DNS
5. Po 5 minutach będzie działać! (automatyczny SSL)

### Analytics (opcjonalnie)
Włącz analytics w Vercel aby zobaczyć:
- Ile requestów przychodzi
- Jak szybko odpowiada bot
- Skąd przychodzą requesty

**Settings → Analytics → Enable**

---

## ✅ Gotowe!

Twój bot teraz działa 24/7 na Vercel i odbiera alerty z TradingView nawet gdy Twój komputer jest wyłączony! 🎉

### Podsumowanie URL:
- **Główna strona:** `https://twoj-bot.vercel.app`
- **Dashboard alertów:** `https://twoj-bot.vercel.app/alerts`
- **Webhook dla TradingView:** `https://twoj-bot.vercel.app/api/webhook/tradingview`
- **Test giełdy:** `https://twoj-bot.vercel.app/exchange-test`

---

## 🎯 Następne kroki:

1. ✅ Przetestuj webhook z TradingView
2. ✅ Sprawdź czy alerty zapisują się w `/alerts`
3. ✅ Skonfiguruj połączenie z giełdą w `/exchange-test`
4. ✅ Uruchom prawdziwe sygnały tradingowe!

**Bot jest gotowy do pracy! 🚀**

---

**Potrzebujesz pomocy?** 
- Dokumentacja Vercel: https://vercel.com/docs
- Next.js API Routes: https://nextjs.org/docs/app/building-your-application/routing/route-handlers