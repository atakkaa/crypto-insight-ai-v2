# Formasyon AI — Proje Durum Raporu

**Son Güncelleme:** 2026-10-14 (Akşam)

## 🎯 Proje Nedir?

Kripto ve hisse senedi piyasaları için otomatik formasyon tespiti ve bildirim sistemi.

**Ana Bileşenler:**
- Motor (16 formasyon tespiti)
- YOLO (görsel doğrulama — kısmen entegre)
- Bildirim sistemi (global/favori/öncelikli)
- İstatistik takibi (5 sekmeli panel)
- Backtest aracı (admin)
- ATR bazlı akıllı hedef/stop sistemi
- Kullanıcı alarm sistemi (fiyat/formasyon/kalite)

---

## ✅ Tamamlanan

| # | Öğe | Dosya |
|---|---|---|
| 1 | Kaliteli formasyon motoru (16 formasyon) | api/scan-firsat.ts |
| 2 | Kalite puanı sistemi | api/scan-firsat.ts |
| 3 | R/R dengesi (min 1:1.5, ideal 1:2) | Her iki dosya |
| 4 | Min hedef mesafesi (%1.5) | api/scan-short-term.ts |
| 5 | Haber olmadan bildirim | api/scan-firsat.ts |
| 6 | formation_signals tablosu | Supabase |
| 7 | Sinyal kayıt sistemi | Her iki dosya |
| 8 | Kar/Zarar projeksiyonu | NotificationBell.tsx, ShortTermNotificationBell.tsx |
| 9 | AL/SAT yönü düzeltmesi | Her iki bileşen |
| 10 | Yatırım tavsiyesi uyarısı | Her iki bileşen |
| 11 | Sonuç takip cron job | api/check-signals.ts |
| 12 | İstatistik API | api/formation-stats.ts |
| 13 | Detaylı filtreler (formasyon, market, sembol, bias) | api/formation-stats.ts + src/routes/stats.tsx |
| 14 | CSV export (admin) | api/formation-stats.ts |
| 15 | 5 sekmeli panel (Uzun/Kısa/Çoklu ZD/Toplam/Karşılaştırma) | src/routes/stats.tsx |
| 16 | Zaman serisi trend grafiği | src/routes/stats.tsx |
| 17 | signal_type ayrımı (long/short/multi) | Tüm scan dosyaları |
| 18 | ATR bazlı hedef/stop sistemi | 3 scan dosyası |
| 19 | Min 1:2 R/R zorunlu | 3 scan dosyası |
| 20 | check-signals optimizasyonu (30sn → 3.7sn) | api/check-signals.ts |
| 21 | Backtest aracı (admin) | api/backtest.ts + src/routes/backtest.tsx |
| 22 | Admin paneline Backtest + İstatistik linkleri | src/routes/admin.tsx |
| 23 | Alarm sistemi (fiyat/formasyon/kalite) | api/alarms.ts + src/routes/alarms.tsx |
| 24 | Alarm cron kontrolü | api/alarms.ts (action=check) |

---

## ❌ Eksik / Yapılacaklar

| # | Öğe | Öncelik | Durum |
|---|---|---|---|
| 1 | Piyasa özet sayfası (günlük/haftalık) | Orta | SIRADAKİ |
| 2 | YOLO sunucuya taşıma | Düşük | BEKLİYOR |
| 3 | YOLO yeniden eğitme (16 formasyon) | Düşük | BEKLİYOR |

---

## 📁 Önemli Dosyalar

### API Endpoint'leri (api/ klasörü — 10 function)
- api/scan-firsat.ts — Uzun vadeli tarama (ATR bazlı)
- api/scan-short-term.ts — Kısa vadeli tarama (ATR bazlı)
- api/scan-multi-timeframe.ts — Çoklu zaman dilimi
- api/check-signals.ts — Sonuç takip (cron, optimize)
- api/formation-stats.ts — İstatistik API (5 sekme + CSV)
- api/backtest.ts — Backtest aracı (admin)
- api/alarms.ts — Alarm CRUD + Cron Kontrolü (birleşik)
- api/start-trial.ts — 7 günlük deneme
- api/dnd-summary.ts — Gece özeti
- api/binance-proxy.ts — Binance proxy

**ÖNEMLİ:** `api/lib/` klasörü **silindi** (Vercel 12 function limiti için). Yeni dosya eklerken 10'u geçmeyecek şekilde planla.

### Frontend
- src/routes/index.tsx — Ana sayfa
- src/routes/stats.tsx — İstatistik (5 sekme + trend)
- src/routes/backtest.tsx — Backtest (admin)
- src/routes/admin.tsx — Admin paneli
- src/routes/alarms.tsx — Alarmlar
- src/routes/coins.tsx — Coin listesi
- src/routes/settings.tsx — Ayarlar
- src/routes/short-term-notifications.tsx — Kısa vadeli bildirimler
- src/components/NotificationBell.tsx
- src/components/ShortTermNotificationBell.tsx
- src/components/CandleChart.tsx

### Lib
- src/lib/notifications.ts
- src/lib/formation-engine.server.ts
- src/lib/yolo-vision.ts
- src/lib/notification-yolo-filter.ts
- src/lib/push.ts

---

## 🔑 Supabase Tabloları

### formation_signals
- id, user_id (null), market, symbol, timeframe, signal_type
- formation_name, formation_bias, quality_score, signal_score
- entry_price, target_price, stop_price, risk_reward
- status (pending/hit_target/hit_stop/expired)
- result_price, result_percent, signal_time, result_time, updated_at

**signal_type değerleri:** long / short / multi

### alarms (YENİ)
- id, user_id, type (price/formation/quality)
- market, symbol
- target_price, condition (above/below)
- formation_name, min_quality, min_score
- is_active, triggered_at, trigger_count
- last_checked_at, created_at, updated_at

### Diğer
notifications, short_term_notifications, favorites, priority_assets, short_term_tracking, profiles, market_cache, news_cache

---

## 🌐 API Endpoint'leri
/api/scan-firsat?type=all&region=all&limit=50
/api/scan-short-term?tf=1h
/api/scan-multi-timeframe?group=1
/api/check-signals (x-cron-secret header)
/api/formation-stats?days=30&formation=X&signalType=long
/api/formation-stats?format=csv (admin)
/api/backtest?days=30&minQuality=65 (admin)
/api/alarms (GET/POST/PATCH/DELETE)
/api/alarms?action=check (cron, x-cron-secret)
/api/start-trial
/api/dnd-summary
---

## ⚙️ Vercel Env

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- OPENROUTER_API_KEY
- OPENROUTER_MODEL
- FINNHUB_API_KEY
- CRON_SECRET = Ata12345678.
- VITE_VAPID_PUBLIC_KEY

---

## ⏰ Cron Job (cron-job.org)

### Tarama (15 dk)
Kripto 1, 2 / ASYA 1, 2, 3 / BIST 1-5 / AVRUPA 1, 2

### Kısa Vadeli
Kısa Vadeli Premium Tarama (15 dk)
Kısa Vadeli 15m (15 dk) / 1h (30 dk) / 4h (1 saat)

### Çoklu ZD
Çoklu TF - Grup 2, 3 (30 dk)

### Diğer
- **Formation Signals Check** → `/api/check-signals` (1 saat)
- **Check Alarms** → `/api/alarms?action=check` (15 dk) — YENİ
- **DND Sabah Özeti** (günde 1, 08:00)

**Tüm cron job'larda `x-cron-secret: Ata12345678.` header'ı olmalı.**

---

## 🎯 Son Değişiklikler (2026-10-14)

### 1. Detaylı Filtreler + CSV Export
- 5 sekmeli panel (Uzun/Kısa/Çoklu ZD/Toplam/Karşılaştırma)
- Chip'lerle filtre gösterimi
- BOM'lu UTF-8 CSV (Türkçe karakterler)

### 2. signal_type Ayrımı
- long / short / multi
- 3 scan dosyasına eklendi

### 3. ATR Bazlı Hedef/Stop
- Hedef: max(%2, ATR × 2)
- Stop (kripto): max(%1.5, ATR × 1)
- Stop (hisse): max(%1, ATR × 1)
- R/R: Min 1:2 zorunlu
- ATR periyodu: 14 mum

### 4. check-signals Optimizasyonu
- 30sn → 3.7sn
- Toplu fiyat (Binance /ticker/price)
- Paralel hisse (10'arlı)

### 5. Zaman Serisi Trend Grafiği
- Her sekmede LineChart
- Karşılaştırma'da 3 grafik yan yana
- Otomatik: 7g/30g→günlük, 90g→haftalık, 365g→aylık

### 6. Backtest Aracı (admin)
- api/backtest.ts + src/routes/backtest.tsx
- Parametreler: kalite, hedef, stop, R/R, market
- Eski vs Yeni karşılaştırma
- Formasyon bazlı tablo

### 7. Alarm Sistemi
- api/alarms.ts (CRUD + cron birleşik)
- src/routes/alarms.tsx
- Fiyat/Formasyon/Kalite alarmı
- Tier limiti: Free 3, Trial 10, Premium 50, Admin 999
- 15 dk kontrol (tek seferlik tetikleme)

### 8. Vercel 12 Function Limiti Çözümü
- api/lib/ klasörü silindi (Vercel function sayıyordu)
- check-alarms.ts, alarms.ts'e birleştirildi
- Toplam: 10 function

---

## 📊 Başarı Oranı (2026-10-14)

**30 günlük:**
- Toplam sinyal: 56
- Başarı: %42.9
- Ort. kazanç: +0.84%
- Ort. kayıp: -2.25%
- Toplam getiri: -51.83% ❌
- Beklenen değer: -0.93% ❌

**Sorun:** R/R ters (kayıp > kazanç)
**Çözüm:** ATR sistemi yeni sinyallerde uygulanıyor. 2-3 hafta sonra görülecek.

---

## 🎯 Sıradaki İşler

### 1. Piyasa Özet Sayfası (SIRADAKİ)
- Günlük/Haftalık sekmeler
- Bugünün özeti (kaç sinyal, AL/SAT dağılımı)
- En iyi/kötü performans (son 7 gün)
- En aktif formasyonlar
- Piyasa durumu (market bazlı AL/SAT)
- Fear & Greed (crypto)
- Erişim: Herkes (free dahil)
- **Dosyalar:** api/market-summary.ts + src/routes/market-summary.tsx + header link

### 2. YOLO Entegrasyonu
- YOLO sunucuya taşıma (Oracle Cloud VPS)
- Python FastAPI + YOLO servisi
- 16 formasyon için yeniden eğitme

---

## 📝 Önemli Notlar

### Tier Limitleri
| Tier | Favori | Priority | Alarm | MTF | Fear&Greed |
|---|---|---|---|---|---|
| admin | 999 | 999 | 999 | ✅ | ✅ |
| premium | 999 | 999 | 50 | ✅ | ✅ |
| trial | 10 | 3 | 10 | ✅ | ✅ |
| free | 5 | 0 | 3 | ❌ | ❌ |

### Premium Erişim
- /stats → Premium + Admin + Trial
- /backtest → Sadece Admin
- /admin → Sadece Admin
- /alarms → Herkes (limitli)
- /market-summary → Herkes

### Vercel Function Kuralı
- Hobby plan: Max 12 function
- Her `api/*.ts` = 1 function
- `api/_lib/` (alt çizgili) → sayılmaz
- Şu an: 10 function (güvenli)
- **Yeni API eklerken 12'yi geçme!**

### ATR Kuralı (Kesin)Hedef = max(%2, ATR × 2)
Stop (crypto) = max(%1.5, ATR × 1)
Stop (hisse) = max(%1, ATR × 1)
R/R = min 1:2 zorunlu
ATR periyodu = 14 mum
### Cron Secret
- Değer: Ata12345678.
- Header: x-cron-secret

---

## 🎯 Sonraki Sohbette

**Şunu yaz:**

"PROJE-DURUMU.md dosyasını oku ve kaldığımız yerden devam et. Sıradaki iş: Piyasa Özet Sayfası."

---

## 🔄 Değişiklik Geçmişi

### 2026-10-12 (Önceki)
- formation_signals tablosu
- check-signals cron
- İstatistik API
- Min hedef mesafesi (%1.5)

### 2026-10-14 (Bugün - Sabah)
- Detaylı filtreler + CSV
- 5 sekmeli panel + trend grafiği
- signal_type (long/short/multi)
- ATR bazlı hedef/stop
- check-signals optimizasyon (30sn → 3.7sn)
- Backtest aracı

### 2026-10-14 (Bugün - Akşam)
- Alarm sistemi (fiyat/formasyon/kalite)
- api/alarms.ts (CRUD + cron birleşik)
- src/routes/alarms.tsx
- Supabase alarms tablosu
- Vercel 12 function limiti çözümü
- api/lib/ silindi

---

**Son Commit:**