# AE Analiz — Proje Durum Raporu

**Son Güncelleme:** 2026-10-15 (Öğleden Sonra)

## 🎯 Proje Nedir?

Kripto ve hisse senedi piyasaları için otomatik formasyon tespiti ve bildirim sistemi.

**Marka Adı:** AE Analiz (eski: Formasyon AI)

**Ana Bileşenler:**
- Motor (16 formasyon tespiti)
- YOLO (görsel doğrulama — kısmen entegre)
- Bildirim sistemi (global/favori/öncelikli)
- İstatistik takibi (5 sekmeli panel)
- Backtest aracı (admin)
- ATR bazlı akıllı hedef/stop sistemi
- Kullanıcı alarm sistemi (fiyat/formasyon/kalite)
- Piyasa özet sayfası (günlük/haftalık)
- Formasyon gelecek projeksiyonu (3 senaryo)
- Formasyon dönüşüm analizi (3 dönüşüm + koşullar)
- Haber etkisi entegrasyonu
- **PWA + Mobil uyumluluk** (YENİ)

---

## ✅ Tamamlanan

| # | Öğe | Dosya |
|---|---|---|
| 1-32 | Önceki tüm özellikler | - |
| 33 | Marka adı "AE Analiz" olarak değiştirildi | Tüm sayfalar |
| 34 | PWA manifest + sw.js (offline + cache) | public/manifest.json, public/sw.js |
| 35 | PWA meta etiketleri | src/routes/__root.tsx |
| 36 | İkonlar (icon-192, icon-512, apple-touch-icon) | public/ |
| 37 | Mobil hook (use-mobile.tsx) | src/hooks/use-mobile.tsx |
| 38 | Mobil navigasyon (hamburger + alt tab bar) | src/components/MobileNav.tsx |
| 39 | Koşullu admin linki (sadece admin görür) | src/components/MobileNav.tsx |
| 40 | Ana sayfa mobil layout | src/routes/index.tsx |

---

## ❌ Eksik / Yapılacaklar

| # | Öğe | Öncelik | Durum |
|---|---|---|---|
| 1 | **Diğer sayfaların mobil uyumluluğu** | YÜKSEK | SIRADAKİ |
| 2 | YOLO sunucuya taşıma | Düşük | BEKLİYOR |
| 3 | YOLO yeniden eğitme | Düşük | BEKLİYOR |

---

## 📁 Önemli Dosyalar

### API (11 function)
- api/scan-firsat.ts — Uzun vadeli tarama
- api/scan-short-term.ts — Kısa vadeli tarama
- api/scan-multi-timeframe.ts — Çoklu zaman dilimi
- api/check-signals.ts — Sonuç takip cron
- api/formation-stats.ts — İstatistik API
- api/backtest.ts — Backtest aracı
- api/alarms.ts — Alarm + cron + start-trial
- api/market-summary.ts — Piyasa özeti
- api/formation-projection.ts — Projeksiyon + dönüşüm
- api/dnd-summary.ts — Gece özeti
- api/binance-proxy.ts — Binance proxy

### Frontend Routes
- src/routes/index.tsx — Ana sayfa (mobil uyumlu)
- src/routes/stats.tsx — İstatistik (5 sekme + trend)
- src/routes/backtest.tsx — Backtest
- src/routes/admin.tsx — Admin
- src/routes/alarms.tsx — Alarmlar
- src/routes/market-summary.tsx — Piyasa Özeti
- src/routes/coins.tsx
- src/routes/settings.tsx
- src/routes/short-term-notifications.tsx
- src/routes/__root.tsx — PWA meta + html lang

### Frontend Components
- src/components/MobileNav.tsx — Mobil hamburger + alt tab bar (YENİ)
- src/components/FormationProjectionModal.tsx — Projeksiyon modal
- src/components/NotificationBell.tsx
- src/components/ShortTermNotificationBell.tsx
- src/components/CandleChart.tsx
- src/components/AssetInfoPanel.tsx
- src/components/AnalysisPanels.tsx
- src/components/FormationEvaluationPanel.tsx

### Hooks
- src/hooks/use-mobile.tsx — Mobil algılama (YENİ — sidebar.tsx de kullanıyor)

### Lib
- src/lib/notifications.ts
- src/lib/formation-engine.server.ts
- src/lib/yolo-vision.ts
- src/lib/notification-yolo-filter.ts
- src/lib/push.ts

### Public
- public/manifest.json — PWA manifest (AE Analiz)
- public/sw.js — Service Worker (cache + push)
- public/icon-192.png — PWA ikon
- public/icon-512.png — PWA ikon
- public/apple-touch-icon.png — Apple ikon
- public/favicon.ico — Favicon

---

## 🔑 Supabase Tabloları

### formation_signals
- signal_type: long / short / multi
- status: pending / hit_target / hit_stop / expired

### alarms
- type: price / formation / quality
- is_active, trigger_count, triggered_at

### Diğer
notifications, short_term_notifications, favorites, priority_assets, profiles, market_cache, news_cache

---

## 🌐 API Endpoint'leri
/api/scan-firsat?type=all&region=all&limit=50
/api/scan-short-term?tf=1h
/api/scan-multi-timeframe?group=1
/api/check-signals (x-cron-secret)
/api/formation-stats?days=30
/api/backtest?days=30 (admin)
/api/alarms (GET/POST/PATCH/DELETE)
/api/alarms?action=check (cron)
/api/alarms?action=start-trial&userId=X
/api/market-summary?period=daily|weekly
/api/formation-projection?market=X&symbol=Y&interval=1h
/api/dnd-summary
/api/binance-proxy?path=X
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
Premium Tarama (15 dk), 15m (15 dk), 1h (30 dk), 4h (1 saat)

### Çoklu ZD
Grup 2, 3 (30 dk)

### Diğer
- Formation Signals Check → /api/check-signals (1 saat)
- Check Alarms → /api/alarms?action=check (15 dk)
- DND Sabah Özeti (günde 1, 08:00)

**Tüm cron job'larda x-cron-secret: Ata12345678. header'ı.**

---

## 🎯 Bugüne Kadar Yapılanlar

### 2026-10-12 (İlk Oturum)
formation_signals tablosu, check-signals cron, İstatistik API

### 2026-10-14 (Sabah)
Detaylı filtreler + CSV, 5 sekmeli panel + trend, signal_type, ATR bazlı hedef/stop, check-signals optimizasyon, Backtest aracı

### 2026-10-14 (Akşam)
Alarm sistemi, api/alarms.ts, Supabase alarms tablosu, Vercel 12 function limiti çözümü, Piyasa özeti, Formasyon projeksiyonu, start-trial birleştirme

### 2026-10-15 (Sabah)
Formasyon dönüşüm analizi, Koşullar + progress bar, Haber etkisi

### 2026-10-15 (Öğleden Sonra)
Marka adı AE Analiz, PWA manifest + sw.js, PWA meta etiketleri, İkonlar, use-mobile.tsx, MobileNav.tsx (hamburger + alt tab bar), Koşullu admin linki, Ana sayfa mobil layout

---

## 📊 Başarı Oranı (2026-10-15 itibariyle)

**30 günlük:**
- Toplam sinyal: 56
- Başarı: %42.9
- Ort. kazanç: +0.84%
- Ort. kayıp: -2.25%
- Toplam getiri: -51.83%
- Beklenen değer: -0.93%

**Çözüm:** ATR sistemi yeni sinyallerde. 2-3 hafta sonra görülecek.

---

## 📝 Önemli Notlar

### Tier Limitleri
| Tier | Favori | Priority | Alarm | MTF | Fear&Greed |
|---|---|---|---|---|---|
| admin | 999 | 999 | 999 | ✅ | ✅ |
| premium | 999 | 999 | 50 | ✅ | ✅ |
| trial | 10 | 3 | 10 | ✅ | ✅ |
| free | 5 | 0 | 3 | ❌ | ❌ |

### Erişim
- /stats → Premium + Admin + Trial
- /backtest → Admin
- /admin → Admin
- /alarms → Herkes (limitli)
- /market-summary → Herkes

### Vercel Function Kuralı
- Hobby plan: Max 12 function
- Şu an: 11 function (1 slot kaldı)
- Yeni API eklerken dikkat!

### ATR KuralıHedef = max(%2, ATR × 2)
Stop (crypto) = max(%1.5, ATR × 1)
Stop (hisse) = max(%1, ATR × 1)
R/R = min 1:2 zorunlu
### Cron Secret
- Ata12345678.
- Header: x-cron-secret

### PWA Kurulumu
- Android: Chrome → Menü → "Ana ekrana ekle"
- iOS: Safari → Paylaş → "Ana Ekrana Ekle"
- Manifest: `public/manifest.json`
- Service Worker: `public/sw.js`

### Mobil Navigasyon
- `MobileNav.tsx` → 1024px altı ekranlarda gösterilir
- Hamburger menü (☰) → tüm linkler
- Alt tab bar → 5 sekme (Grafik, Özet, Alarm, Kısa, Ayar)
- Admin linki → **sadece admin görür**

### Önemli Hook Kuralı
- `use-mobile.tsx` → Hem `index.tsx` hem `sidebar.tsx` kullanıyor
- `useIsMobile.ts` **SİLİNDİ** (çakışma çıkardı)

---

## 🎯 Sıradaki İşler

### 1. Diğer Sayfaların Mobil Uyumluluğu (SIRADAKİ)
- `/stats` — 5 sekmeli panel mobil
- `/alarms` — alarm listesi mobil
- `/market-summary` — piyasa özeti mobil
- `/short-term-notifications` — mobil
- `/coins` — coin listesi mobil
- `/settings` — ayarlar mobil
- `/backtest` — backtest mobil (düşük öncelik, admin)
- `/admin` — admin mobil (düşük öncelik)

### 2. YOLO Entegrasyonu
- YOLO sunucuya taşıma
- Python FastAPI + YOLO servisi
- 16 formasyon için yeniden eğitme

---

## 🎯 Sonraki Sohbette

**Şunu yaz:**

"PROJE-DURUMU.md dosyasını oku ve kaldığımız yerden devam et. Sıradaki iş: Diğer sayfaların mobil uyumluluğu."

---

## 🔄 Değişiklik Geçmişi

### 2026-10-12
formation_signals tablosu, cron, istatistik API

### 2026-10-14
Detaylı filtreler + CSV, 5 sekmeli panel, signal_type, ATR hedef/stop, check-signals optimizasyon, Backtest, Alarm sistemi, Piyasa özeti, Formasyon projeksiyonu, start-trial birleştirme, 11 function

### 2026-10-15
Formasyon dönüşüm analizi, Koşullar + progress, Haber etkisi, Marka adı AE Analiz, PWA kurulumu, use-mobile hook, MobileNav, Koşullu admin linki, Ana sayfa mobil layout

---

**Son Commit:**
fix(hooks): use-mobile.tsx geri getirildi (sidebar.tsx bağımlılığı)

**Sıradaki Hedef:**
Diğer sayfaların mobil uyumluluğu (stats, alarms, market-summary, short-term-notifications, coins, settings)