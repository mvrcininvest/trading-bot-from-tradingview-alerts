# 🔧 INSTRUKCJA TESTOWANIA WEBHOOK

## Problem: Bot nie odbiera alertów od TradingView

### ✅ Krok 1: Sprawdź czy webhook działa

1. Otwórz stronę `/alerts` w przeglądarce
2. Kliknij przycisk **"Wyślij testowy alert"** (zielony, po prawej stronie przy nagłówku "URL Webhook")
3. Poczekaj 2 sekundy

**Oczekiwany rezultat:**
- ✅ Toast: "Alert testowy zapisany! ID: XXX"
- ✅ Nowy alert BTCUSDT pojawi się w tabeli poniżej
- ✅ W logach serwera zobaczysz: `POST /api/webhook/tradingview 200`

**Jeśli test przeszedł = webhook działa!** Problem jest w TradingView, nie w kodzie.

---

## 🔍 Krok 2: Sprawdź konfigurację TradingView

### A. Sprawdź czy alert jest aktywny:
1. Otwórz TradingView
2. Kliknij ikonę **dzwonka** (Alerts) w prawym panelu
3. Znajdź swój alert ze wskaźnikiem ICT/SMC
4. Sprawdź:
   - ✅ Czy ma **zieloną ikonę** (aktywny)
   - ❌ Czy ma **szarą ikonę** (nieaktywny) lub **czerwoną** (wygasł)

### B. Sprawdź webhook URL:
1. Kliknij na alert (edytuj)
2. Scroll do sekcji **"Notifications"**
3. Sprawdź czy zaznaczone: **"Webhook URL"**
4. Sprawdź czy URL się zgadza z tym na stronie `/alerts`

### C. Sprawdź Message (JSON):
1. W tym samym oknie edycji alertu
2. Scroll do **"Alert message"**
3. Upewnij się że zawiera prawidłowy JSON ze wszystkimi polami:
   ```json
   {
     "symbol": "{{ticker}}",
     "side": "BUY",
     "tier": "Standard",
     "entryPrice": 50000,
     "sl": 49500,
     "tp1": 50500,
     "tp2": 51000,
     "tp3": 51500,
     "mainTp": 50500,
     ...
   }
   ```

---

## 🎯 Krok 3: Jeśli alert jest aktywny ale nie wysyła

### Możliwe przyczyny:

1. **Wskaźnik nie generuje sygnałów**
   - Warunki nie są spełnione (brak setupu na rynku)
   - Zmień timeframe lub ticker aby sprawdzić

2. **TradingView limit webhooków**
   - Free/Pro mają limity wywołań webhook
   - Sprawdź plan na https://www.tradingview.com/gopro/

3. **Webhook URL niepoprawny**
   - Skopiuj URL ze strony `/alerts` ponownie
   - Wklej do TradingView (usuń stary alert, stwórz nowy)

4. **Alert wygasł**
   - Sprawdź "Expiration date" w ustawieniach alertu
   - Ustaw "Open-ended" aby nie wygasał

---

## 🚀 Quick Fix: Zresetuj alert w TradingView

**Najszybsze rozwiązanie:**

1. **Usuń** stary alert w TradingView
2. **Stwórz nowy** alert z tym samym wskaźnikiem:
   - Condition: Twój wskaźnik ICT/SMC
   - Options: "Once Per Bar Close" (zalecane)
   - Expiration: "Open-ended"
   - Notifications: ✅ Webhook URL
   - Webhook URL: Skopiuj ze strony `/alerts`
   - Alert message: JSON z wszystkimi polami
3. **Zapisz** alert
4. **Poczekaj** na następny sygnał ze wskaźnika

---

## 📊 Monitorowanie:

Po zresetowaniu alertu:
- Otwórz stronę `/alerts` - odświeża się co 5 sekund
- Otwórz DevTools (F12) → Console
- Czekaj na następny sygnał z TradingView
- Gdy pojawi się alert, zobaczysz go natychmiast w tabeli

---

## ⚠️ Uwaga o wskaźnikach:

**Pamiętaj:** Wskaźnik generuje sygnały **tylko gdy warunki są spełnione**!

Jeśli przez 13 minut (21:20 - 21:33) nie było żadnego alertu, może to oznaczać:
- ✅ **Normalnie** - rynek nie spełnia warunków setupu
- ❌ **Problem** - alert jest wyłączony lub źle skonfigurowany

**Sprawdź to:** Wyślij testowy alert ze strony `/alerts` - jeśli przejdzie, webhook działa i czekaj na prawdziwy sygnał!
