# 🚀 Deployment na Railway.app

Twoja aplikacja jest gotowa do wdrożenia! Railway to prosta platforma która działa 24/7 - idealna dla trading bota.

## 📋 Wymagania

- Konto na [GitHub](https://github.com) (darmowe)
- Konto na [Railway.app](https://railway.app) (darmowy plan - 500h/miesiąc)

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

## 🚂 Krok 2: Deploy na Railway

### 1. Idź na Railway.app
- Otwórz: https://railway.app
- Kliknij **"Login"** → wybierz **"Login with GitHub"**

### 2. Utwórz nowy projekt
- Kliknij **"New Project"** (prawy górny róg)
- Wybierz **"Deploy from GitHub repo"**
- Znajdź swoje repozytorium i kliknij na nie

### 3. Railway automatycznie wykryje Next.js
Railway sam ustawi:
- ✅ Build Command: `npm run build`
- ✅ Start Command: `npm start`

### 4. Dodaj zmienne środowiskowe
W Railway, w zakładce **"Variables"**:

Kliknij **"New Variable"** i dodaj:

```
TURSO_CONNECTION_URL = [wklej wartość z pliku .env]
TURSO_AUTH_TOKEN = [wklej wartość z pliku .env]
```

**WAŻNE:** Skopiuj wartości z Twojego lokalnego pliku `.env`!

### 5. Kliknij Deploy!
Railway automatycznie:
- ✅ Zainstaluje pakiety
- ✅ Zbuduje aplikację
- ✅ Uruchomi ją na publicznym URL

---

## 🌐 Krok 3: Skopiuj URL Webhook

Po deploymencie Railway da Ci URL typu:
```
https://twoj-bot-production.up.railway.app
```

Twój webhook URL to:
```
https://twoj-bot-production.up.railway.app/api/webhook/tradingview
```

**Wklej ten URL w TradingView** i gotowe! 🎉

---

## 📊 Po deploymencie

### Sprawdź czy działa:
1. Otwórz URL Railway w przeglądarce
2. Przejdź do `/alerts` - powinieneś zobaczyć dashboard
3. Wyślij testowy alert z TradingView
4. Sprawdź czy pojawił się w tabeli alertów

### Logi (jeśli coś nie działa):
W Railway → zakładka **"Deployments"** → kliknij na deployment → **"View Logs"**

---

## 🔄 Aktualizacje

**Każda zmiana w kodzie** którą push'ujesz na GitHub **automatycznie** wdraża się na Railway!

```bash
git add .
git commit -m "Update features"
git push
```

Railway automatycznie przebuduje i wdroży nową wersję. 🚀

---

## ⚡ Troubleshooting

### Problem: Build fails
- Sprawdź logi w Railway
- Upewnij się że zmienne środowiskowe są ustawione poprawnie

### Problem: 500 Internal Server Error
- Sprawdź czy `TURSO_CONNECTION_URL` i `TURSO_AUTH_TOKEN` są poprawne
- Sprawdź logi w Railway

### Problem: TradingView nie wysyła alertów
- Upewnij się że używasz HTTPS URL (Railway daje automatycznie)
- Sprawdź czy webhook URL jest poprawny
- Sprawdź logi w Railway czy requesty przychodzą

---

## 💰 Koszty

**Railway darmowy plan:**
- ✅ 500 godzin wykonania/miesiąc
- ✅ Więcej niż wystarczy dla trading bota
- ✅ Po przekroczeniu limitu bot się wyłączy (nie będzie niespodziewanych kosztów)

Jeśli potrzebujesz więcej: Railway Pro = $5/miesiąc

---

## ✅ Gotowe!

Twój bot teraz działa 24/7 i odbiera alerty z TradingView nawet gdy Twój komputer jest wyłączony! 🎉

---

**Potrzebujesz pomocy?** Sprawdź logi w Railway lub zobacz dokumentację: https://docs.railway.app