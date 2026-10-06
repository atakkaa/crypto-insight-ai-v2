import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import {
  useDndSettings,
  type DndRange,
  type DndSettings,
} from "@/hooks/useDndSettings";
import { useUserTier, startTrial } from "@/hooks/useUserTier";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Ayarlar — Formasyon AI" }],
  }),
  component: SettingsPage,
});

// Kısa vadeli formasyon tipleri
type ShortTermPatterns = {
  ikili_dip: boolean;
  ikili_tepe: boolean;
  yukselen_ucgen: boolean;
  dusen_ucgen: boolean;
  obo: boolean;
  ters_obo: boolean;
};

const DEFAULT_PATTERNS: ShortTermPatterns = {
  ikili_dip: true,
  ikili_tepe: true,
  yukselen_ucgen: true,
  dusen_ucgen: true,
  obo: true,
  ters_obo: true,
};

const PATTERN_LABELS: Array<{
  key: keyof ShortTermPatterns;
  emoji: string;
  name: string;
  description: string;
}> = [
  {
    key: "ikili_dip",
    emoji: "📉",
    name: "İkili Dip",
    description: "Yükseliş formasyonu — iki dip aynı seviyede",
  },
  {
    key: "ikili_tepe",
    emoji: "📈",
    name: "İkili Tepe",
    description: "Düşüş formasyonu — iki tepe aynı seviyede",
  },
  {
    key: "yukselen_ucgen",
    emoji: "🔺",
    name: "Yükselen Üçgen",
    description: "Yükseliş formasyonu — yatay direnç + yükselen dip",
  },
  {
    key: "dusen_ucgen",
    emoji: "🔻",
    name: "Düşen Üçgen",
    description: "Düşüş formasyonu — düşen direnç + yatay destek",
  },
  {
    key: "obo",
    emoji: "👤",
    name: "Omuz-Baş-Omuz",
    description: "Düşüş formasyonu — klasik OBO",
  },
  {
    key: "ters_obo",
    emoji: "🙃",
    name: "Ters OBO",
    description: "Yükseliş formasyonu — ters omuz-baş-omuz",
  },
];

function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const { settings, loading, saving, save } = useDndSettings();
  const { tierInfo } = useUserTier();

  const [local, setLocal] = useState<DndSettings | null>(null);
  const [trialStarting, setTrialStarting] = useState(false);
  const [globalShortTermEnabled, setGlobalShortTermEnabled] = useState<boolean | null>(null);
  const [globalToggling, setGlobalToggling] = useState(false);
  const [shortTermPatterns, setShortTermPatterns] = useState<ShortTermPatterns | null>(null);
  const [patternsSaving, setPatternsSaving] = useState(false);

  const current = local ?? settings;

  // Global kısa vadeli bildirim ayarını çek
  useEffect(() => {
    if (!user) return;
    void (supabase as any)
      .from("profiles")
      .select("short_term_global_enabled, short_term_patterns")
      .eq("id", user.id)
      .single()
      .then((response: { data: { short_term_global_enabled: boolean; short_term_patterns: ShortTermPatterns } | null; error: unknown }) => {
        if (response.data) {
          setGlobalShortTermEnabled(response.data.short_term_global_enabled ?? true);
          setShortTermPatterns(response.data.short_term_patterns ?? DEFAULT_PATTERNS);
        }
      });
  }, [user]);

  function update<K extends keyof DndSettings>(key: K, value: DndSettings[K]) {
    setLocal({ ...current, [key]: value });
  }

  function addRange() {
    const ranges = [...current.dnd_ranges, { start: "12:00", end: "13:00" }];
    update("dnd_ranges", ranges);
  }

  function removeRange(index: number) {
    const ranges = current.dnd_ranges.filter((_, i) => i !== index);
    update("dnd_ranges", ranges);
  }

  function updateRange(index: number, field: keyof DndRange, value: string) {
    const ranges = current.dnd_ranges.map((r, i) =>
      i === index ? { ...r, [field]: value } : r,
    );
    update("dnd_ranges", ranges);
  }

  async function handleSave() {
    const ok = await save(current);
    if (ok) {
      toast.success("Ayarlar kaydedildi");
      setLocal(null);
    } else {
      toast.error("Kaydedilemedi");
    }
  }

  async function handleStartTrial() {
    if (!user) {
      toast.error("Önce giriş yapmalısınız");
      return;
    }
    setTrialStarting(true);
    try {
      const result = await startTrial(user.id);
      if (result.success) {
        toast.success("🎉 7 günlük deneme başladı!");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      console.error("Trial hatası:", err);
      toast.error("Bağlantı hatası");
    }
    setTrialStarting(false);
  }

  async function handleToggleGlobalShortTerm() {
    if (!user || globalShortTermEnabled === null) return;
    setGlobalToggling(true);
    const newVal = !globalShortTermEnabled;
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ short_term_global_enabled: newVal })
      .eq("id", user.id);

    if (error) {
      toast.error("Ayar güncellenemedi");
    } else {
      setGlobalShortTermEnabled(newVal);
      toast.success(
        newVal
          ? "✅ Global kısa vadeli bildirimler açıldı"
          : "🔕 Global kısa vadeli bildirimler kapatıldı",
      );
    }
    setGlobalToggling(false);
  }

  async function handleTogglePattern(key: keyof ShortTermPatterns) {
    if (!user || !shortTermPatterns) return;
    const newPatterns = { ...shortTermPatterns, [key]: !shortTermPatterns[key] };
    setShortTermPatterns(newPatterns);
    setPatternsSaving(true);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ short_term_patterns: newPatterns })
      .eq("id", user.id);
    setPatternsSaving(false);

    if (error) {
      toast.error("Ayar güncellenemedi");
      setShortTermPatterns(shortTermPatterns);
    } else {
      const label = PATTERN_LABELS.find((p) => p.key === key);
      toast.success(
        newPatterns[key]
          ? `✅ ${label?.name} açıldı`
          : `🔕 ${label?.name} kapatıldı`,
      );
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="panel max-w-md p-6 text-center">
          <p className="text-3xl">🔒</p>
          <h1 className="mt-3 text-lg font-bold">Giriş Yapmanız Gerekiyor</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ayarlara erişmek için lütfen giriş yapın.
          </p>
          <Link
            to="/auth"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Giriş Yap
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="num text-sm font-bold uppercase tracking-[0.2em] text-primary"
          >
            Formasyon AI
          </Link>
          <nav className="flex gap-2 text-xs">
            <Link
              to="/"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              Grafik
            </Link>
            <span className="rounded-md bg-primary/15 px-3 py-1.5 font-bold text-primary">
              ⚙️ Ayarlar
            </span>
          </nav>
          <div className="ml-auto text-xs text-muted-foreground">
            {user?.email}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {/* BAŞLIK */}
        <section className="panel p-5">
          <h1 className="text-xl font-bold">⚙️ Bildirim Ayarları</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Sessiz saatler, bildirim tercihleri ve hesap ayarlarınızı buradan
            yönetin.
          </p>
        </section>

        {/* TIER BADGE */}
        {tierInfo && (
          <section className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Hesap Durumu
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-3xl ${tierInfo.color}`}>
                    {tierInfo.emoji}
                  </span>
                  <span className={`text-xl font-bold ${tierInfo.color}`}>
                    {tierInfo.label}
                  </span>
                </div>

                {tierInfo.tier === "trial" &&
                  tierInfo.trialDaysLeft !== undefined && (
                    <p className="mt-2 text-xs">
                      {tierInfo.isTrialExpiringSoon ? "⚠️ " : "⏱️ "}
                      Deneme süreniz:{" "}
                      <span className="font-bold">
                        {tierInfo.trialDaysLeft} gün
                      </span>{" "}
                      kaldı
                    </p>
                  )}

                {tierInfo.tier === "admin" && (
                  <p className="mt-2 text-xs text-amber-500">
                    👑 Yönetici yetkileri aktif
                  </p>
                )}

                {tierInfo.tier === "premium" && (
                  <p className="mt-2 text-xs text-primary">
                    ✅ Tüm özellikler aktif
                  </p>
                )}

                {tierInfo.tier === "free" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Kısıtlı özellikler — Premium'a geçerek tümünü açın
                  </p>
                )}
              </div>

              {tierInfo.tier === "free" && (
                <button
                  type="button"
                  disabled={trialStarting}
                  onClick={() => void handleStartTrial()}
                  className="shrink-0 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {trialStarting ? "Başlatılıyor..." : "🚀 1 Hafta Dene"}
                </button>
              )}
            </div>

            {/* LİMİTLER */}
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-[10px] text-muted-foreground">
                  Favori Limiti
                </p>
                <p className="num mt-1 text-lg font-bold">
                  {tierInfo.limits.favorites >= 999
                    ? "∞"
                    : tierInfo.limits.favorites}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-[10px] text-muted-foreground">
                  Öncelikli Limiti
                </p>
                <p className="num mt-1 text-lg font-bold">
                  {tierInfo.limits.priority >= 999
                    ? "∞"
                    : tierInfo.limits.priority === 0
                      ? "🔒"
                      : tierInfo.limits.priority}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-[10px] text-muted-foreground">MTF Analiz</p>
                <p className="mt-1 text-lg font-bold">
                  {tierInfo.limits.hasMTF ? "✅" : "🔒"}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-[10px] text-muted-foreground">
                  Fear & Greed
                </p>
                <p className="mt-1 text-lg font-bold">
                  {tierInfo.limits.hasFearGreed ? "✅" : "🔒"}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* PREMIUM ÖZELLİKLER (Sadece free için) */}
        {tierInfo && tierInfo.tier === "free" && (
          <section className="panel p-5">
            <h2 className="text-lg font-bold">⭐ Premium Özellikler</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Aşağıdaki özellikler şu an kilitli. Deneme başlatarak veya
              Premium'a geçerek tümünü açabilirsiniz.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3 opacity-60">
                <span className="text-xl">📊</span>
                <div>
                  <p className="text-xs font-bold">MTF Analiz</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    🔒 Kilitli
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3 opacity-60">
                <span className="text-xl">😱</span>
                <div>
                  <p className="text-xs font-bold">Fear & Greed</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    🔒 Kilitli
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3 opacity-60">
                <span className="text-xl">📰</span>
                <div>
                  <p className="text-xs font-bold">20 Haber Analizi</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    🔒 Şu an 10 haber
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3 opacity-60">
                <span className="text-xl">⭐</span>
                <div>
                  <p className="text-xs font-bold">Öncelikli Varlıklar</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    🔒 Kilitli
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={trialStarting}
              onClick={() => void handleStartTrial()}
              className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {trialStarting
                ? "Başlatılıyor..."
                : "🚀 1 Hafta Ücretsiz Dene"}
            </button>
          </section>
        )}

        {/* SESSİZ MOD */}
        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-bold">🔕 Sessiz Mod</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Belirttiğiniz saat aralıklarında bildirimler sessize alınır.
                Önemli gelişmeler birikir ve sabah özet olarak gönderilir.
              </p>
            </div>
            <button
              type="button"
              onClick={() => update("dnd_enabled", !current.dnd_enabled)}
              className={`relative ml-4 h-7 w-14 shrink-0 rounded-full transition-colors ${
                current.dnd_enabled ? "bg-primary" : "bg-secondary"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                  current.dnd_enabled ? "left-8" : "left-1"
                }`}
              />
            </button>
          </div>

          {current.dnd_enabled && (
            <>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Sessiz Saat Aralıkları
                  </p>
                  <button
                    type="button"
                    onClick={addRange}
                    className="rounded-md border border-border px-2 py-1 text-[10px] font-bold hover:bg-secondary"
                  >
                    + Aralık Ekle
                  </button>
                </div>

                {current.dnd_ranges.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-3 text-center text-[10px] text-muted-foreground">
                    Aralık eklenmedi — sessiz mod hiç aktif olmaz
                  </p>
                ) : (
                  current.dnd_ranges.map((range, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
                    >
                      <input
                        type="time"
                        value={range.start}
                        onChange={(e) =>
                          updateRange(index, "start", e.target.value)
                        }
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">→</span>
                      <input
                        type="time"
                        value={range.end}
                        onChange={(e) =>
                          updateRange(index, "end", e.target.value)
                        }
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => removeRange(index)}
                        className="ml-auto rounded border border-destructive/30 px-2 py-1 text-[10px] font-bold text-destructive hover:bg-destructive/10"
                      >
                        🗑️
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Sessiz Modda İzin Verilenler
                </p>

                <BypassToggle
                  label="%10+ büyük fiyat hareketi"
                  description="Ani fırsat/risk — anlık gönderilir"
                  checked={current.dnd_allow_10_percent}
                  onChange={(v) => update("dnd_allow_10_percent", v)}
                />
                <BypassToggle
                  label="Öncelikli varlık kritik hareket"
                  description="Öncelikli hisse/kriptonuzda %5+ hareket"
                  checked={current.dnd_allow_priority_critical}
                  onChange={(v) => update("dnd_allow_priority_critical", v)}
                />
                <BypassToggle
                  label="Çok güçlü sinyal (skor ≥ 90)"
                  description="Çok yüksek güvenli sinyaller"
                  checked={current.dnd_allow_score_90}
                  onChange={(v) => update("dnd_allow_score_90", v)}
                />
                <BypassToggle
                  label="Favori varlık kritik"
                  description="Favori hisse/kriptonuzda kritik sinyal"
                  checked={current.dnd_allow_favorite}
                  onChange={(v) => update("dnd_allow_favorite", v)}
                />
                <BypassToggle
                  label="Tier 1 önemli haber"
                  description="Bloomberg, Reuters gibi güvenilir kaynaklardan"
                  checked={current.dnd_allow_tier1_news}
                  onChange={(v) => update("dnd_allow_tier1_news", v)}
                />
              </div>

              <div className="mt-5">
                <BypassToggle
                  label="Sabah özet bildirimi"
                  description="Birikmiş gelişmeler sabah 'X önemli gelişme' olarak gelsin"
                  checked={current.dnd_daily_summary}
                  onChange={(v) => update("dnd_daily_summary", v)}
                />
              </div>
            </>
          )}
        </section>

        {/* KISA VADELİ GLOBAL BİLDİRİMLER */}
        {tierInfo &&
          (tierInfo.tier === "premium" ||
            tierInfo.tier === "trial" ||
            tierInfo.tier === "admin") && (
            <section className="panel p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h2 className="text-lg font-bold">
                    📉 Kısa Vadeli Global Bildirimler
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Premium özelliği: Tüm piyasada (kripto + hisse){" "}
                    <strong>çok yüksek güvenli</strong> (%85+) 20-30 mumluk
                    formasyon fırsatlarını bildirir. Kendi takip ettiğiniz
                    varlıklar her zaman bildirilir.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={globalToggling || globalShortTermEnabled === null}
                  onClick={() => void handleToggleGlobalShortTerm()}
                  className={`relative ml-4 h-7 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                    globalShortTermEnabled ? "bg-amber-500" : "bg-secondary"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                      globalShortTermEnabled ? "left-8" : "left-1"
                    }`}
                  />
                </button>
              </div>
              {globalShortTermEnabled && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-[11px] leading-5 text-amber-500">
                    ⚠️ <strong>Bilgi:</strong> Bu özellik açık olduğunda, tüm
                    piyasada tespit edilen yüksek güvenli kısa vadeli formasyon
                    fırsatları size bildirilir. Çok sık bildirim almamak için
                    sadece <strong>%85 ve üzeri güvenli</strong> formasyonlar
                    gönderilir.
                  </p>
                </div>
              )}
            </section>
          )}

        {/* KISA VADELİ FORMASYON SEÇİMİ */}
        {tierInfo &&
          (tierInfo.tier === "premium" ||
            tierInfo.tier === "trial" ||
            tierInfo.tier === "admin") && (
            <section className="panel p-5">
              <h2 className="text-lg font-bold">
                📉 Kısa Vadeli Formasyon Seçimi
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Hangi formasyonlar için bildirim almak istediğinizi seçin.
                Kapattığınız formasyonlar için <strong>bildirim gelmez</strong>.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {PATTERN_LABELS.map((pattern) => {
                  const enabled = shortTermPatterns?.[pattern.key] ?? true;
                  return (
                    <button
                      key={pattern.key}
                      type="button"
                      disabled={patternsSaving}
                      onClick={() => void handleTogglePattern(pattern.key)}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
                        enabled
                          ? "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
                          : "border-border bg-card hover:bg-secondary/50"
                      }`}
                    >
                      <span className="text-2xl">{pattern.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold">{pattern.name}</p>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                              enabled
                                ? "bg-amber-500 text-white"
                                : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {enabled ? "AÇIK" : "KAPALI"}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                          {pattern.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {shortTermPatterns && Object.values(shortTermPatterns).every((v) => !v) && (
                <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-[11px] font-bold text-destructive">
                    ⚠️ Tüm formasyonlar kapalı!
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Hiçbir kısa vadeli bildirim almayacaksınız. En az bir formasyonu açın.
                  </p>
                </div>
              )}
            </section>
          )}

        {/* KAYDET */}
        <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-xs text-muted-foreground">
            {local
              ? "Kaydedilmemiş değişiklikleriniz var"
              : "Tüm değişiklikler kaydedildi"}
          </p>
          <div className="flex gap-2">
            {local && (
              <button
                type="button"
                onClick={() => setLocal(null)}
                className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"
              >
                İptal
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !local}
              className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Kaydediliyor..." : "💾 Kaydet"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

// ==========================================================
// YARDIMCI BİLEŞEN
// ==========================================================

function BypassToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3 hover:bg-secondary/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
      />
      <div className="flex-1">
        <p className="text-xs font-bold">{label}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {description}
        </p>
      </div>
    </label>
  );
}