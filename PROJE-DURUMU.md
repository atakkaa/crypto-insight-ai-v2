# Formasyon AI — Proje Durum Raporu

**Son Güncelleme:** 2026-10-14

## 🎯 Proje Nedir?

Kripto ve hisse senedi piyasaları için otomatik formasyon tespiti ve bildirim sistemi.

**Ana Bileşenler:**
- Motor (16 formasyon tespiti)
- YOLO (görsel doğrulama — kısmen entegre)
- Bildirim sistemi (global/favori/öncelikli)
- İstatistik takibi (5 sekmeli panel)
- Backtest aracı (admin)
- ATR bazlı akıllı hedef/stop sistemi

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

---

## ❌ Eksik / Yapılacaklar

| # | Öğe | Öncelik | Durum |
|---|---|---|---|
| 1 | Alarm sistemi (fiyat/formasyon/kalite) | Yüksek | SIRADAKİ |
| 2 | Piyasa özet sayfası (günlük/haftalık) | Orta | BEKLİYOR |
| 3 | YOLO sunucuya taşıma | Düşük | BEKLİYOR |
| 4 | YOLO yeniden eğitme (16 formasyon) | Düşük | BEKLİYOR |

---

## 📁 Önemli Dosyalar

### API Endpoint'leri
- api/scan-firsat.ts — Uzun vadeli tarama (ATR bazlı hedef/stop)
- api/scan-short-term.ts — Kısa vadeli tarama (ATR bazlı)
- api/scan-multi-timeframe.ts — Çoklu zaman dilimi karşılaştırma
- api/check-signals.ts — Sonuç takip (cron, optimize edildi)
- api/formation-stats.ts — İstatistik API (5 sekmeli + CSV)
- api/backtest.ts — Backtest aracı (admin)
- api/start-trial.ts — 7 günlük deneme
- api/dnd-summary.ts — Gece özeti
- api/binance-proxy.ts — Binance proxy

### Frontend
- src/routes/index.tsx — Ana sayfa (Dashboard)
- src/routes/stats.tsx — İstatistik sayfası (5 sekme + trend)
- src/routes/backtest.tsx — Backtest sayfası (admin)
- src/routes/admin.tsx — Admin paneli
- src/routes/coins.tsx — Coin listesi
- src/routes/settings.tsx — Ayarlar
- src/routes/short-term-notifications.tsx — Kısa vadeli bildirimler
- src/components/NotificationBell.tsx — Uzun vadeli zil
- src/components/ShortTermNotificationBell.tsx — Kısa vadeli zil
- src/components/CandleChart.tsx — Grafik bileşeni

### Lib
- src/lib/notifications.ts — Bildirim tipleri + Supabase
- src/lib/formation-engine.server.ts — Formasyon motoru
- src/lib/yolo-vision.ts — YOLO entegrasyonu (ONNX)
- src/lib/notification-yolo-filter.ts — YOLO bildirim filtresi
- src/lib/push.ts — Push bildirimleri

---

## 🔑 Supabase Tabloları

### formation_signals — Sinyal kayıtları (başarı istatistiği)

**Kolonlar:**
- id (uuid)
- user_id (uuid, nullable — global sinyaller için null)
- market (text: crypto/bist/us/asia/europe)
- symbol (text: BTCUSDT, THYAO.IS, vs)
- timeframe (text: 15m/1h/4h/1d/multi)
- signal_type (text: long/short/multi) — YENİ
- formation_name (text)
- formation_bias (text: yükseliş/düşüş/nötr)
- quality_score (int)
- signal_score (int)
- entry_price (numeric)
- target_price (numeric)
- stop_price (numeric)
- risk_reward (text: "1:2.0")
- status (text: pending/hit_target/hit_stop/expired)
- result_price (numeric, nullable)
- result_percent (numeric, nullable)
- signal_time (timestamp)
- result_time (timestamp, nullable)
- updated_at (timestamp)

**signal_type değerleri:**
- long → Uzun vadeli (scan-firsat)
- short → Kısa vadeli (scan-short-term)
- multi → Çoklu zaman dilimi (scan-multi-timeframe)

**status değerleri:**
- pending → Henüz sonuçlanmadı
- hit_target → Hedefe ulaştı (kazanç)
- hit_stop → Stop oldu (kayıp)
- expired → 7 gün geçti, sonuçlanmadı

### Diğer Tablolar
- notifications — Uzun vadeli bildirimler
- short_term_notifications — Kısa vadeli bildirimler
- favorites — Kullanıcı favorileri
- priority_assets — Öncelikli varlıklar
- short_term_tracking — Kısa vadeli takip
- profiles — Kullanıcı profilleri
- market_cache — Fiyat cache
- news_cache — Haber cache

---

## 🌐 API Endpoint'leri
/api/scan-firsat?type=all&region=all&limit=50
/api/scan-short-term?tf=1h
/api/scan-multi-timeframe?group=1
/api/check-signals (x-cron-secret header gerekli)
/api/formation-stats?days=30&formation=X&market=Y&signalType=long
/api/formation-stats?format=csv (admin, CSV indir)
/api/backtest?days=30&minQuality=65&minTargetPercent=0.02 (admin)
/api/start-trial
/api/dnd-summary
---

## ⚙️ Vercel Env

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- OPENROUTER_API_KEY
- OPENROUTER_MODEL (default: google/gemini-2.0-flash-exp:free)
- FINNHUB_API_KEY
- CRON_SECRET
- VITE_VAPID_PUBLIC_KEY (frontend push için)

---

## ⏰ Cron Job (cron-job.org)

**Toplam ~18 job, hepsi cron-job.org'da:**

### Tarama Job'ları (15 dk)
- Kripto 1, 2
- ASYA 1, 2, 3
- BIST 1, 2, 3, 4, 5
- AVRUPA 1, 2

### Kısa Vadeli
- Kısa Vadeli Premium Tarama (15 dk)
- Kısa Vadeli (15m) (15 dk)
- Kısa Vadeli (1h) (30 dk)
- Kısa Vadeli (4h) (1 saat)

### Çoklu ZD
- Çoklu TF - Grup 2 (30 dk)
- Çoklu TF - Grup 3 (30 dk)

### Diğer
- Formation Signals Check (1 saat, x-cron-secret header ile)
- DND Sabah Özeti (günde 1, 08:00)

**Önemli:** "Formation Signals Check" job'ında `x-cron-secret: ` header'ı ekli olmalı.

---

## 🎯 Bugün Yapılan Büyük Değişiklikler (2026-10-14)

### 1. Detaylı Filtreler (Tamamlandı)
- api/formation-stats.ts → çoklu filtre desteği (formation[], market[], signalType)
- src/routes/stats.tsx → filtre paneli + chip'ler
- Sembol, market, formasyon, bias filtreleri

### 2. CSV Export (Tamamlandı)
- Admin için ?format=csv parametresi
- BOM'lu UTF-8 (Türkçe karakterler için)

### 3. 5 Sekmeli Panel (Tamamlandı)
- 📈 Uzun Vadeli
- ⚡ Kısa Vadeli
- 🎯 Çoklu ZD
- 📊 Toplam
- ⚖️ Karşılaştırma (3 tablo yan yana)

### 4. signal_type Ayrımı (Tamamlandı)
- Supabase'de signal_type kolonu eklendi (long/short/multi)
- 3 scan dosyasına eklendi

### 5. check-signals Optimizasyonu (Tamamlandı)
- Öncesi: 30 saniye (timeout)
- Sonrası: 3.7 saniye ✅
- Toplu fiyat çekme (Binance /ticker/price)
- Paralel hisse fiyat çekme (10'arlı grup)
- Limit 500 → 200

### 6. ATR Bazlı Hedef/Stop Sistemi (Tamamlandı)

**Yeni kurallar:**
- Hedef: max(%2, ATR × 2)
- Stop (kripto): max(%1.5, ATR × 1)
- Stop (hisse): max(%1, ATR × 1)
- R/R: Min 1:2 zorunlu
- ATR periyodu: 14 mum

**Uygulanan dosyalar:**
- api/scan-firsat.ts
- api/scan-short-term.ts
- api/scan-multi-timeframe.ts

### 7. Zaman Serisi Trend Grafiği (Tamamlandı)
- Her sekmede LineChart (başarı trendi)
- Karşılaştırma sekmesinde 3 trend grafiği yan yana
- Otomatik zaman dilimi: 7g→günlük, 30g→günlük, 90g→haftalık, 365g→aylık

### 8. Backtest Aracı (Tamamlandı)
- api/backtest.ts — Yeni endpoint (admin only)
- src/routes/backtest.tsx — Yeni sayfa
- Admin paneli ve ana sayfa header'ına link
- Parametreler: kalite, hedef, stop, R/R, market
- Eski vs Yeni karşılaştırma + formasyon bazlı
- Grafik + tablo

---

## 📊 Başarı Oranı Analizi (2026-10-14 itibariyle)

**Mevcut Durum:**
- Toplam sinyal: 56 (30 günde)
- Başarı oranı: %42.9
- Ortalama kazanç: +0.84%
- Ortalama kayıp: -2.25%
- Toplam getiri: -51.83% ❌
- Beklenen değer: -0.93% ❌

**Sorun:** R/R oranı ters (kayıp > kazanç)

**Çözüm:** ATR bazlı hedef/stop sistemi yeni sinyallerde uygulanacak. 2-3 hafta sonra yeni performansı göreceğiz.

---

## 🎯 Sıradaki İşler

### 1. Alarm Sistemi (SIRADAKİ)
Kullanıcı kendi alarmlarını kurar:
- Fiyat alarmı ("BTC 70K'ya ulaşırsa")
- Formasyon alarmı ("Üçgen tamamlanırsa")
- Kalite alarmı ("Kalite >80 sinyal gelirse")
- Push bildirim entegrasyonu

**Dosyalar:**
- api/alarms.ts (yeni)
- src/routes/alarms.tsx (yeni)
- Supabase'de alarms tablosu (yeni)

### 2. Piyasa Özet Sayfası
- Günlük/haftalık piyasa genel bakış
- En iyi/kötü performans gösteren varlıklar

**Dosyalar:**
- api/market-summary.ts
- src/routes/market-summary.tsx

### 3. YOLO Entegrasyonu
- YOLO'yu sunucuya taşıma (Oracle Cloud VPS)
- Python FastAPI + YOLO servisi
- 16 formasyon için yeniden eğitme

---

## 📝 Önemli Notlar

### Filtreler vs Sekmeler
- Sekmeler (Uzun/Kısa/Çoklu/Toplam/Karşılaştırma) → filtresiz (tüm zamanların verisi)
- Filtre paneli (formasyon/market/sembol/bias) → sadece alt grafikleri etkiler
- Kasıtlı tasarım: Sekmeler = genel bakış, Filtreler = detaylı analiz

### Backtest Yaklaşımı
- Geçmiş sinyallerin sonuç fiyatlarını kullanır
- Yeni parametrelerle hedef/stop mesafelerini yeniden hesaplar
- Eski sonuçlarla karşılaştırır
- Kesin simülasyon değildir ama parametre etkisini gösterir

### Premium Erişim
- /stats → Premium + Admin + Trial
- /backtest → Sadece Admin
- /admin → Sadece Admin
- Free kullanıcı menüde link göremez + URL'ye gitse 403 alır

### ATR Sistemi Detayları
- ATR = Average True Range (14 mum)
- Kripto volatilitesi hisse'den yüksek, o yüzden stop geniş
- R/R her zaman min 1:2 → kullanıcı mantıklı sinyal görür

---

## 🎯 Sonraki Sohbette

**Şunu yaz:**

"PROJE-DURUMU.md dosyasını oku ve kaldığımız yerden devam et. Sıradaki iş: Alarm sistemi."

Ben dosyayı okuyup hemen anlarım ve kaldığımız yerden devam ederiz.

---

## 🔄 Değişiklik Geçmişi

### 2026-10-12 (Önceki Oturum)
- formation_signals tablosu oluşturuldu
- Sonuç takip cron job eklendi
- İstatistik API eklendi
- Min hedef mesafesi (%1.5) eklendi
- Eski yanlış sinyaller silindi

### 2026-10-14 (Bugün)
- Detaylı filtreler (formasyon, market, sembol, bias)
- CSV export (admin)
- 5 sekmeli istatistik paneli
- Zaman serisi trend grafiği
- signal_type ayrımı (long/short/multi)
- ATR bazlı hedef/stop sistemi
- Min 1:2 R/R zorunlu
- check-signals optimizasyonu (30sn → 3.7sn)
- Backtest aracı
- Admin paneline Backtest + İstatistik linkleri

---

## 📌 Kritik Bilgiler

### Kullanıcı Tier Sistemi
- admin: Her şeyi görür (999 limit)
- premium: Neredeyse her şey (999 limit)
- trial: 7 gün deneme (10 favori, 3 priority)
- free: Sınırlı (5 favori, 0 priority)

### Tier Limitleri
| Tier | Favoriler | Priority | MTF | Fear&Greed |
|---|---|---|---|---|
| admin | 999 | 999 | ✅ | ✅ |
| premium | 999 | 999 | ✅ | ✅ |
| trial | 10 | 3 | ✅ | ✅ |
| free | 5 | 0 | ❌ | ❌ |

### ATR Kuralı (Kesin)isCrypto = (market === "crypto")
MIN_TARGET_PERCENT = 0.02 // %2
minStopPercent = isCrypto ? 0.015 : 0.01 // %1.5 veya %1

targetPercent = Math.max(MIN_TARGET_PERCENT, atrPercent * 2)
stopPercent = Math.max(minStopPercent, atrPercent * 1)

// Sonra R/R kontrolü:
if (rr < 2) {
target = currentPrice + risk * 2 // (bullish için)
}
### Cron Secret
- Değer: 
- Header: x-cron-secret
- Kullanım: /api/check-signals

---

**Son Commit:**