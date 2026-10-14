# Formasyon AI — Proje Durum Raporu

**Son Güncelleme:** 2026-10-14 (Gece)

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
- Piyasa özet sayfası (günlük/haftalık)

---

## ✅ Tamamlanan

| # | Öğe | Dosya |
|---|---|---|
| 1-22 | Önceki oturum (motor, istatistik, ATR, backtest, alarm vs.) | - |
| 23 | Alarm sistemi (fiyat/formasyon/kalite) | api/alarms.ts + src/routes/alarms.tsx |
| 24 | Alarm cron kontrolü (action=check) | api/alarms.ts |
| 25 | Piyasa özet sayfası (günlük/haftalık) | api/market-summary.ts + src/routes/market-summary.tsx |
| 26 | Ana sayfa header'a Piyasa Özeti + Alarmlar linkleri | src/routes/index.tsx |
| 27 | PROJE-DURUMU.md güncellemesi | PROJE-DURUMU.md |

---

## ❌ Eksik / Yapılacaklar

| # | Öğe | Öncelik | Durum |
|---|---|---|---|
| 1 | YOLO sunucuya taşıma | Düşük | BEKLİYOR |
| 2 | YOLO yeniden eğitme (16 formasyon) | Düşük | BEKLİYOR |
| 3 | Kullanıcı karşılaştırma sayfası (opsiyonel) | Düşük | FİKİR |
| 4 | Bildirim istatistikleri sayfası (opsiyonel) | Düşük | FİKİR |

---

## 📁 Önemli Dosyalar

### API Endpoint'leri (api/ klasörü — 11 function)
- api/scan-firsat.ts — Uzun vadeli tarama (ATR bazlı)
- api/scan-short-term.ts — Kısa vadeli tarama (ATR bazlı)
- api/scan-multi-timeframe.ts — Çoklu zaman dilimi
- api/check-signals.ts — Sonuç takip (cron, optimize)
- api/formation-stats.ts — İstatistik API (5 sekme + CSV)
- api/backtest.ts — Backtest aracı (admin)
- api/alarms.ts — Alarm CRUD + Cron Kontrolü (birleşik)
- api/market-summary.ts — Piyasa özet istatistikleri (YENİ)
- api/start-trial.ts — 7 günlük deneme
- api/dnd-summary.ts — Gece özeti
- api/binance-proxy.ts — Binance proxy

**ÖNEMLİ:** `api/lib/` klasörü **silindi** (Vercel 12 function limiti). Şu an **11 function** var. Yeni API eklerken **12'yi geçmeyecek** şekilde planla. Gerekirse iki endpoint'i birleştir.

### Frontend
- src/routes/index.tsx — Ana sayfa (nav'a Piyasa Özeti + Alarmlar eklendi)
- src/routes/stats.tsx — İstatistik (5 sekme + trend)
- src/routes/backtest.tsx — Backtest (admin)
- src/routes/admin.tsx — Admin paneli
- src/routes/alarms.tsx — Alarmlar
- src/routes/market-summary.tsx — Piyasa Özeti (YENİ)
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

**signal_type:** long / short / multi

### alarms
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
/api/check-signals (x-cron-secret)
/api/formation-stats?days=30&formation=X&signalType=long
/api/formation-stats?format=csv (admin)
/api/backtest?days=30&minQuality=65 (admin)
/api/alarms (GET/POST/PATCH/DELETE)
/api/alarms?action=check (cron, x-cron-secret)
/api/market-summary?period=daily|weekly (YENİ)
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
- Kısa Vadeli Premium Tarama (15 dk)
- Kısa Vadeli 15m (15 dk) / 1h (30 dk) / 4h (1 saat)

### Çoklu ZD
- Çoklu TF - Grup 2, 3 (30 dk)

### Diğer
- **Formation Signals Check** → `/api/check-signals` (1 saat)
- **Check Alarms** → `/api/alarms?action=check` (15 dk)
- **DND Sabah Özeti** (günde 1, 08:00)

**Tüm cron job'larda `x-cron-secret: Ata12345678.` header'ı olmalı.**

---

## 🎯 Bugün Yapılanlar (2026-10-14)

### Sabah:
1. Detaylı filtreler (formasyon, market, sembol, bias)
2. CSV export (admin)
3. 5 sekmeli panel
4. Zaman serisi trend grafiği
5. signal_type ayrımı (long/short/multi)
6. ATR bazlı hedef/stop sistemi
7. Min 1:2 R/R zorunlu
8. check-signals optimizasyonu (30sn → 3.7sn)
9. Backtest aracı

### Akşam:
10. **Alarm sistemi** (fiyat/formasyon/kalite)
11. **api/alarms.ts** (CRUD + cron birleşik)
12. **Supabase alarms tablosu**
13. **Vercel 12 function limiti çözümü** (api/lib silindi)
14. **Piyasa özet sayfası** (günlük/haftalık)
15. **PROJE-DURUMU.md güncellemesi**

---

## 📊 Başarı Oranı (2026-10-14 itibariyle)

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

### 1. YOLO Entegrasyonu (Düşük Öncelik)
- YOLO sunucuya taşıma (Oracle Cloud VPS)
- Python FastAPI + YOLO servisi
- 16 formasyon için yeniden eğitme

### 2. Opsiyonel Fikirler
- **Kullanıcı Karşılaştırma Sayfası:** Favoriler yan yana
- **Bildirim İstatistikleri:** Kullanıcı kaç bildirim aldı
- **Trend Alarmı:** Belirli bir coin trend değiştirirse bildir

---

## 📝 Önemli Notlar

### Tier Limitleri
| Tier | Favori | Priority | Alarm | MTF | Fear&Greed |
|---|---|---|---|---|---|
| admin | 999 | 999 | 999 | ✅ | ✅ |
| premium | 999 | 999 | 50 | ✅ | ✅ |
| trial | 10 | 3 | 10 | ✅ | ✅ |
| free | 5 | 0 | 3 | ❌ | ❌ |

### Erişim Kontrolü
- /stats → Premium + Admin + Trial
- /backtest → Sadece Admin
- /admin → Sadece Admin
- /alarms → Herkes (limitli)
- /market-summary → Herkes

### Vercel Function Kuralı
- Hobby plan: Max 12 function
- Her api/*.ts = 1 function
- api/_lib/ (alt çizgili) → sayılmaz
- **Şu an: 11 function** (1 slot kaldı)
- Yeni API eklerken dikkat!

### ATR Kuralı (Kesin)Hedef = max(%2, ATR × 2)
Stop (crypto) = max(%1.5, ATR × 1)
Stop (hisse) = max(%1, ATR × 1)
R/R = min 1:2 zorunlu
ATR periyodu = 14 mum
### Cron Secret
- Değer: Ata12345678.
- Header: x-cron-secret

### ATR ve Hedef/Stop Hesaplama
Fonksiyonlar:
- `calculateATR(candles, period)` → her scan dosyasında
- `calculateATRBasedTargetStop(...)` → her scan dosyasında
- Hedef/stop **volatiliteye göre** dinamik

---

## 🎯 Sonraki Sohbette

**Şunu yaz:**

"PROJE-DURUMU.md dosyasını oku ve kaldığımız yerden devam et."

Ben dosyayı okuyup hemen anlarım ve kaldığımız yerden devam ederiz.

---

## 🔄 Değişiklik Geçmişi

### 2026-10-12 (Önceki Oturum)
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
- Vercel 12 function limiti çözümü (api/lib silindi)
- Piyasa özet sayfası (günlük/haftalık)
- api/market-summary.ts + src/routes/market-summary.tsx
- Ana sayfa header'a 2 link (Piyasa Özeti + Alarmlar)

---

**Son Commit:**