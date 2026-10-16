# AE Analiz — Proje Durum Raporu

**Son Güncelleme:** 2026-10-16 (Sabah)

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
- **PWA + Tam Mobil Uyumluluk**
- **Custom Confirm Modal (iOS PWA uyumlu)**
- **Skeleton Loader (tüm sayfalar)**
- **Pull-to-Refresh (5 sayfa)**
- **CandleChart mobil zoom/pan**
- **iOS safe-area desteği**

---

## ✅ Tamamlanan

| # | Öğe | Dosya |
|---|---|---|
| 1-40 | Önceki tüm özellikler | - |
| 41 | `/coins` mobil uyumlu | src/routes/coins.tsx |
| 42 | `/settings` mobil uyumlu | src/routes/settings.tsx |
| 43 | `/alarms` mobil uyumlu | src/routes/alarms.tsx |
| 44 | `/market-summary` mobil uyumlu | src/routes/market-summary.tsx |
| 45 | `/short-term-notifications` mobil uyumlu | src/routes/short-term-notifications.tsx |
| 46 | `/stats` mobil uyumlu | src/routes/stats.tsx |
| 47 | `/backtest` mobil uyumlu | src/routes/backtest.tsx |
| 48 | `/admin` mobil uyumlu (mobilde kart görünümü) | src/routes/admin.tsx |
| 49 | **iOS safe-area (notch + home bar)** | MobileNav.tsx, __root.tsx |
| 50 | **Modal tam ekran (formation + limit)** | FormationProjectionModal.tsx, LimitReachedModal.tsx |
| 51 | **CandleChart mobil zoom/pan** | CandleChart.tsx |
| 52 | **Custom Confirm Modal + useConfirm** | ConfirmModal.tsx, useConfirm.tsx |
| 53 | **window.confirm → Custom Modal (9 yer)** | alarms, admin, short-term-notifications, NotificationBell, ShortTermNotificationBell, index |
| 54 | **Skeleton Loader bileşenleri** | Skeleton.tsx |
| 55 | **Skeleton entegrasyonu (9 dosya)** | alarms, short-term-notifications, admin, stats, market-summary, NotificationBell, ShortTermNotificationBell, coins |
| 56 | **Pull-to-Refresh hook + indicator** | usePullToRefresh.ts, PullToRefreshIndicator.tsx |
| 57 | **Pull-to-Refresh entegrasyonu (5 sayfa)** | coins, short-term-notifications, alarms, market-summary, stats |
| 58 | **PWA ikon düzeltmesi** | __root.tsx, manifest.json, apple-touch-icon.png |
| 59 | **Realtime kanal çakışma fix** | notifications.ts (unique channel names) |
| 60 | **Bildirim dropdown mobile full-width** | NotificationBell.tsx, ShortTermNotificationBell.tsx |

---

## 🎉 Mobil Uyumluluk — %100 TAMAMLANDI

| # | Sayfa | Mobil | Skeleton | Pull-to-Refresh |
|---|---|---|---|---|
| ✅ | `/` (ana sayfa) | ✅ | — | — |
| ✅ | `/coins` | ✅ | ✅ | ✅ |
| ✅ | `/settings` | ✅ | — | — |
| ✅ | `/alarms` | ✅ | ✅ | ✅ |
| ✅ | `/market-summary` | ✅ | ✅ | ✅ |
| ✅ | `/short-term-notifications` | ✅ | ✅ | ✅ |
| ✅ | `/stats` | ✅ | ✅ | ✅ |
| ✅ | `/backtest` | ✅ | — | — |
| ✅ | `/admin` | ✅ | ✅ | — |

**Uygulanan ortak mobil şablonu:**
- `MobileNav` üstte (`lg:hidden`)
- Masaüstü header (`hidden lg:block`)
- `pb-24 lg:pb-0` (alt tab bar boşluğu)
- Tüm input/select/butonlar min 40-48px
- Grid'ler mobilde 1-2 sütun
- Tablolar yatay kaydırılabilir (`-mx-3 overflow-x-auto px-3`)
- iOS safe-area desteği (`env(safe-area-inset-*)`)

---

## 🎨 Yeni UI Bileşenleri

| Bileşen | Amaç |
|---|---|
| `Skeleton.tsx` | Yükleme iskeletleri (5 varyant) |
| `ConfirmModal.tsx` | Custom onay penceresi (iOS PWA uyumlu) |
| `PullToRefreshIndicator.tsx` | Mobil çek-yenile göstergesi |
| `useConfirm.tsx` | Custom confirm hook'u (Context tabanlı) |
| `usePullToRefresh.ts` | Pull-to-refresh hook'u (touch tabanlı) |

---

## ❌ Eksik / Yapılacaklar

| # | Öğe | Öncelik | Durum |
|---|---|---|---|
| 1 | YOLO sunucuya taşıma | Düşük | BEKLİYOR |
| 2 | YOLO yeniden eğitme | Düşük | BEKLİYOR |
| 3 | Gerçek cihaz test turu | YÜKSEK | SIRADAKİ |
| 4 | PWA kurulum testi (Android + iOS) | ORTA | BEKLİYOR |
| 5 | Offline mod testi (Service Worker) | ORTA | BEKLİYOR |

---

## 📁 Önemli Dosyalar

### API (11 function)
- api/scan-firsat.ts, scan-short-term.ts, scan-multi-timeframe.ts
- api/check-signals.ts, formation-stats.ts, backtest.ts
- api/alarms.ts (alarm + cron + start-trial)
- api/market-summary.ts, formation-projection.ts, dnd-summary.ts, binance-proxy.ts

### Frontend Routes (10 sayfa)
- src/routes/index.tsx
- src/routes/coins.tsx, settings.tsx, alarms.tsx
- src/routes/market-summary.tsx, short-term-notifications.tsx
- src/routes/stats.tsx, backtest.tsx, admin.tsx
- src/routes/__root.tsx

### Frontend Components
- src/components/MobileNav.tsx (mobil hamburger + alt tab bar)
- src/components/Skeleton.tsx (YENİ — yükleme iskeletleri)
- src/components/ConfirmModal.tsx (YENİ — custom onay)
- src/components/PullToRefreshIndicator.tsx (YENİ — çek-yenile)
- src/components/NotificationBell.tsx, ShortTermNotificationBell.tsx
- src/components/NotificationDetailModal.tsx
- src/components/ShortTermNotificationDetailModal.tsx
- src/components/FormationProjectionModal.tsx
- src/components/LimitReachedModal.tsx
- src/components/CandleChart.tsx
- src/components/AlertBell.tsx
- src/components/AssetInfoPanel.tsx
- src/components/AnalysisPanels.tsx
- src/components/FormationEvaluationPanel.tsx
- src/components/WelcomeGate.tsx
- src/components/MarketTicker.tsx

### Hooks
- src/hooks/useConfirm.tsx (YENİ — custom confirm)
- src/hooks/usePullToRefresh.ts (YENİ — çek-yenile)
- src/hooks/use-mobile.tsx
- src/hooks/useAuth.ts, useAdmin.ts, useUserTier.ts, useDndSettings.ts

### Lib
- src/lib/notifications.ts (unique channel names fix)
- src/lib/formation-engine.server.ts
- src/lib/yolo-vision.ts, notification-yolo-filter.ts, push.ts
- src/lib/analysis.functions.ts, market.functions.ts, news.functions.ts
- src/lib/analysis-types.ts

### Public
- public/manifest.json (PWA manifest — apple-touch-icon eklendi)
- public/sw.js (Service Worker)
- public/icon-192.png, icon-512.png
- public/apple-touch-icon.png (180x180, düzeltildi)
- public/favicon.ico

---

## 🔑 Supabase Tabloları

### formation_signals
- signal_type: long / short / multi
- status: pending / hit_target / hit_stop / expired

### alarms
- type: price / formation / quality
- is_active, trigger_count, triggered_at

### Diğer
notifications, short_term_notifications, favorites, priority_assets,
profiles, market_cache, news_cache, short_term_tracking

### profiles (önemli alanlar)
- role: admin / user
- membership: free / premium / trial
- is_banned, trial_started_at, trial_ends_at, trial_used
- short_term_global_enabled, short_term_patterns
- has_seen_onboarding, last_sign_in_at

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

- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- OPENROUTER_API_KEY, OPENROUTER_MODEL
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
- check-signals (1 saat)
- alarms?action=check (15 dk)
- dnd-summary (günde 1, 08:00)

**Tüm cron job'larda `x-cron-secret: Ata12345678.` header'ı.**

---

## 🎯 Bugüne Kadar Yapılanlar

### 2026-10-12
formation_signals tablosu, check-signals cron, İstatistik API

### 2026-10-14
Filtreler + CSV, 5 sekmeli panel, signal_type, ATR hedef/stop,
Backtest, Alarm sistemi, Piyasa özeti, Formasyon projeksiyonu,
start-trial birleştirme

### 2026-10-15 (Sabah + Öğleden Sonra)
Formasyon dönüşüm analizi, Haber etkisi, Marka adı AE Analiz,
PWA kurulumu, use-mobile hook, MobileNav, Koşullu admin linki,
Ana sayfa mobil layout

### 2026-10-15 (Akşam) — MOBİL UYUMLULUK TURU
- `/coins`, `/settings`, `/alarms`, `/market-summary`,
  `/short-term-notifications`, `/stats`, `/backtest`, `/admin`
  → TÜMÜ mobil uyumlu hale getirildi
- admin: mobilde tablo → kart görünümü

### 2026-10-16 (Sabah) — İYİLEŞTİRME TURU
- **iOS safe-area desteği** (notch + home bar)
- **Modal tam ekran** (FormationProjectionModal, LimitReachedModal → bottom sheet + React Portal)
- **CandleChart mobil zoom/pan** (pinch, pan, double-tap, wheel)
- **Custom ConfirmModal** + useConfirm hook
- **9 window.confirm** yerine custom modal
- **Skeleton Loader** (Skeleton.tsx + 9 sayfaya entegre)
- **Pull-to-Refresh** (usePullToRefresh + 5 sayfaya entegre)
- **PWA ikon düzeltmesi** (apple-touch-icon + manifest)
- **Realtime kanal fix** (unique channel names)
- **Bildirim dropdown full-width** (mobilde)

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
- /short-term-notifications → Premium + Admin + Trial

### Vercel Function Kuralı
- Hobby plan: Max 12 function
- Şu an: 11 function (1 slot kaldı)

### ATR Kuralı
- Hedef = max(%2, ATR × 2)
- Stop (crypto) = max(%1.5, ATR × 1)
- Stop (hisse) = max(%1, ATR × 1)
- R/R = min 1:2 zorunlu

### Cron Secret
- Ata12345678.
- Header: x-cron-secret

### PWA Kurulumu
- Android: Chrome → Menü → "Ana ekrana ekle"
- iOS: Safari → Paylaş → "Ana Ekrana Ekle"
- Manifest: `public/manifest.json`
- Service Worker: `public/sw.js`

### Mobil Navigasyon (MobileNav.tsx)
- 1024px altı ekranlarda gösterilir
- Hamburger menü (☰) → tüm linkler + admin linki (sadece admin görür)
- Alt tab bar → 5 sekme: Grafik / Özet / Alarm / Kısa / Ayar
- **Kendi header'ı var** — sayfalarda ayrıca header eklenmez
- `onOpenSymbol` prop'u ZORUNLU
- **iOS safe-area desteği**: `env(safe-area-inset-top/bottom)`

### Mobil Uyumluluk Şablonu
```tsx
<div className="min-h-screen pb-24 lg:pb-0">
  {/* Pull-to-refresh (opsiyonel) */}
  <div className="lg:hidden">
    <PullToRefreshIndicator ... />
  </div>

  {/* Mobil header */}
  <div className="lg:hidden">
    <MobileNav onOpenSymbol={...} />
  </div>

  {/* Masaüstü header */}
  <header className="sticky top-0 z-20 hidden border-b border-border bg-background/90 backdrop-blur lg:block">
    ...
  </header>

  <main className="mx-auto max-w-X space-y-4 px-3 py-4 sm:px-4 sm:py-6">
    ...
  </main>
</div>Kurallar:

Tüm input/select/butonlar min 40-48px

Grid'ler mobilde 1-2 sütun

Tablolar -mx-3 overflow-x-auto px-3 ile yatay kaydırılabilir

Grafikler h-72 sm:h-80

Bottom padding pb-24 lg:pb-0

Skeleton Loader Kullanımıimport { SkeletonList, SkeletonCard, SkeletonStatGrid, SkeletonRow } from "@/components/Skeleton";

{loading ? <SkeletonList count={5} variant="row" /> : <Content />}Pull-to-Refresh Kullanımıimport { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";

const pullToRefresh = usePullToRefresh({
  threshold: 80,
  enabled: Boolean(user),
  onRefresh: async () => {
    // Yenileme işlemi (fetch, refetch vs.)
    toast.success("Yenilendi");
  },
});

// Return içinde:
<div className="lg:hidden">
  <PullToRefreshIndicator
    pullDistance={pullToRefresh.pullDistance}
    isPulling={pullToRefresh.isPulling}
    isRefreshing={pullToRefresh.isRefreshing}
  />
</div>
Custom Confirm Kullanımıimport { useConfirm } from "@/hooks/useConfirm";

const confirm = useConfirm();

const ok = await confirm({
  title: "Sil",
  message: "Silmek istediğinize emin misiniz?",
  confirmText: "Sil",
  cancelText: "Vazgeç",
  variant: "destructive",
});
if (!ok) return;
// Silme işlemiiOS Safe-Area
<head> içinde: viewport-fit=cover

CSS: env(safe-area-inset-top/bottom)

MobileNav üst ve alt padding ile kullanılıyor

Modal Yapısı (Bottom Sheet)
createPortal ile <body> altına mount edilir

Body scroll lock (position: fixed, top: -scrollY)

Mobil: items-end (alttan açılır, rounded-t-2xl)

Masaüstü: sm:items-center (ortalanmış)

Önemli Hook Kuralı
use-mobile.tsx → Hem index.tsx hem sidebar.tsx kullanıyor

useIsMobile.ts SİLİNDİ (çakışma)

🎯 Sıradaki İşler
1. Gerçek Cihaz Test Turu (YÜKSEK ÖNCELİK)
□ Android Chrome'da tüm sayfaları test et
□ iOS Safari'de tüm sayfaları test et
□ PWA olarak "Ana ekrana ekle" → offline çalışıyor mu?
□ iOS safe-area düzgün çalışıyor mu?
□ Pull-to-refresh her sayfada çalışıyor mu?
□ Skeleton loader'lar görünüyor mu?
□ CandleChart pinch-zoom çalışıyor mu?
□ Klavye açıldığında inputlar görünüyor mu?
2. Bilinen Küçük Sorunlar / İyileştirmeler
□ Modal'lar mobilde tam ekran mı? (test edilecek)
□ Grafik dokunmatik zoom / pan (test edilecek)
□ Skeleton → içerik geçişi smooth mu?
3. YOLO Entegrasyonu
□ YOLO sunucuya taşıma
□ Python FastAPI + YOLO servisi
□ 16 formasyon için yeniden eğitme
🎯 Sonraki Sohbette
Şunu yaz:

"PROJE-DURUMU.md dosyasını oku ve kaldığımız yerden devam et.
Sıradaki iş: [gerçek cihaz testi / YOLO entegrasyonu / vb]."Değişiklik Geçmişi
2026-10-12
formation_signals tablosu, cron, istatistik API

2026-10-14
Filtreler + CSV, 5 sekmeli panel, signal_type, ATR hedef/stop,
check-signals optimizasyon, Backtest, Alarm sistemi, Piyasa özeti,
Formasyon projeksiyonu, start-trial birleştirme, 11 function

2026-10-15
Formasyon dönüşüm analizi, Koşullar + progress, Haber etkisi,
Marka adı AE Analiz, PWA kurulumu, use-mobile hook, MobileNav,
Koşullu admin linki, Ana sayfa mobil layout

2026-10-15 (Akşam)
Tüm sayfaların mobil uyumluluğu:
coins, settings, alarms, market-summary, short-term-notifications,
stats, backtest, admin

2026-10-16 (Sabah)
iOS safe-area + Modal tam ekran + CandleChart mobil zoom/pan +
Custom ConfirmModal + Skeleton Loader (9 dosya) + Pull-to-Refresh (5 sayfa) +
PWA ikon düzeltmesi + Realtime kanal fix + Bildirim dropdown full-width

Son Commit:
feat(stats): pull-to-refresh

Sıradaki Hedef:
Gerçek cihaz test turu → iOS/Android kontrol → YOLO entegrasyonu
---

## 📌 Bu Güncellemenin Özeti

| Bölüm | Ne Değişti |
|---|---|
| **Son Güncelleme** | 2026-10-16 (Sabah) |
| **Tamamlanan** | 49-60 numaralı özellikler eklendi (12 yeni öğe) |
| **Mobil Uyumluluk** | Skeleton ve Pull-to-Refresh kolonları eklendi |
| **Yeni UI Bileşenleri** | 5 yeni bileşen/hook listelendi |
| **Önemli Dosyalar** | Yeni bileşenler ve hook'lar eklendi |
| **Bugüne Kadar** | 2026-10-16 (Sabah) oturumu eklendi (9 iyileştirme) |
| **Sıradaki İşler** | Gerçek cihaz testi, YOLO entegrasyonu |
| **Önemli Notlar** | Skeleton, Pull-to-Refresh, Custom Confirm, Modal, iOS Safe-Area şablonları eklendi |
| **Değişiklik Geçmişi** | Bu oturumun özeti |
