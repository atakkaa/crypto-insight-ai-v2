// src/routes/alarms.tsx — Kullanıcı Alarm Sistemi
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MobileNav } from "@/components/MobileNav";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";

export const Route = createFileRoute("/alarms")({
  head: () => ({
    meta: [{ title: "Alarmlar — AE Analiz" }],
  }),
  component: AlarmsPage,
});

// ==========================================================
// TİPLER
// ==========================================================

type AlarmType = "price" | "formation" | "quality";

type Alarm = {
  id: string;
  user_id: string;
  type: AlarmType;
  market: string;
  symbol: string;
  target_price: number | null;
  condition: "above" | "below" | null;
  formation_name: string | null;
  min_quality: number | null;
  min_score: number | null;
  is_active: boolean;
  triggered_at: string | null;
  trigger_count: number;
  last_checked_at: string | null;
  created_at: string;
};

type CreateAlarmBody = {
  type: AlarmType;
  market: string;
  symbol: string;
  target_price?: number;
  condition?: "above" | "below";
  formation_name?: string;
  min_quality?: number;
  min_score?: number;
};

const MARKET_LABELS: Record<string, string> = {
  crypto: "KRİPTO",
  bist: "BIST",
  us: "ABD",
  asia: "ASYA",
  europe: "AVRUPA",
};

const FORMATION_OPTIONS = [
  "Yükselen Üçgen",
  "Alçalan Üçgen",
  "Simetrik Üçgen",
  "Çift Tepe",
  "Çift Dip",
  "Yükselen Kanal",
  "Düşen Kanal",
  "İkili Dip",
  "İkili Tepe",
  "Omuz-Baş-Omuz",
  "Ters OBO",
  "Üçlü Dip",
  "Üçlü Tepe",
  "Yükselen Kama",
  "Düşen Kama",
  "Fincan-Kulp",
];

// ==========================================================
// SAYFA
// ==========================================================

function AlarmsPage() {
  const { user } = useAuth();
  const confirm = useConfirm();

  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<string>("free");
  const [limit, setLimit] = useState(3);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newType, setNewType] = useState<AlarmType>("price");
  const [newMarket, setNewMarket] = useState("crypto");
  const [newSymbol, setNewSymbol] = useState("");
  const [newTargetPrice, setNewTargetPrice] = useState("");
  const [newCondition, setNewCondition] = useState<"above" | "below">("above");
  const [newFormationName, setNewFormationName] = useState<string>(
    FORMATION_OPTIONS[0] ?? "Yükselen Üçgen",
  );
  const [newMinQuality, setNewMinQuality] = useState(80);

  async function loadAlarms() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/alarms", {
        headers: { "x-user-id": user.id },
      });
      const json = await res.json();
      if (json.success) {
        setAlarms(json.alarms as Alarm[]);
        setTier(json.tier);
        setLimit(json.limit);
      } else {
        toast.error(json.error ?? "Alarmlar yüklenemedi");
      }
    } catch (err) {
      console.error(err);
      toast.error("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) void loadAlarms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function createAlarm() {
    if (!user) return;

    if (!newSymbol.trim()) {
      toast.error("Sembol gerekli");
      return;
    }

    if (newType === "price" && !newTargetPrice) {
      toast.error("Hedef fiyat gerekli");
      return;
    }

    setCreating(true);

    const body: CreateAlarmBody = {
      type: newType,
      market: newMarket,
      symbol: newSymbol.toUpperCase().trim(),
    };

    if (newType === "price") {
      body.target_price = Number(newTargetPrice);
      body.condition = newCondition;
    } else if (newType === "formation") {
      body.formation_name = newFormationName;
      body.min_quality = newMinQuality;
    } else if (newType === "quality") {
      body.min_quality = newMinQuality;
    }

    try {
      const res = await fetch("/api/alarms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (json.success) {
        toast.success("✅ Alarm oluşturuldu");
        setShowForm(false);
        setNewSymbol("");
        setNewTargetPrice("");
        setNewMinQuality(80);
        void loadAlarms();
      } else {
        toast.error(json.error ?? "Alarm oluşturulamadı");
      }
    } catch (err) {
      console.error(err);
      toast.error("Bağlantı hatası");
    } finally {
      setCreating(false);
    }
  }

  async function deleteAlarm(id: string) {
    if (!user) return;

    // ✅ Custom confirm modal
    const ok = await confirm({
      title: "Alarmı Sil",
      message: "Bu alarmı silmek istediğinize emin misiniz?",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/alarms?id=${id}`, {
        method: "DELETE",
        headers: { "x-user-id": user.id },
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Alarm silindi");
        setAlarms((prev) => prev.filter((a) => a.id !== id));
      } else {
        toast.error(json.error ?? "Silinemedi");
      }
    } catch {
      toast.error("Bağlantı hatası");
    }
  }

  async function toggleActive(id: string, current: boolean) {
    if (!user) return;
    try {
      const res = await fetch(`/api/alarms?id=${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({ is_active: !current, reset_trigger: !current }),
      });
      const json = await res.json();
      if (json.success) {
        setAlarms((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  is_active: !current,
                  trigger_count: !current ? 0 : a.trigger_count,
                  triggered_at: !current ? null : a.triggered_at,
                }
              : a,
          ),
        );
        toast.success(!current ? "Alarm aktif" : "Alarm pasif");
      }
    } catch {
      toast.error("Bağlantı hatası");
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen pb-24 lg:pb-0">
        <div className="lg:hidden">
          <MobileNav onOpenSymbol={() => {}} />
        </div>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="text-center">
            <p className="text-lg font-bold">🔒 Giriş Yapın</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Alarmları görmek için giriş yapın.
            </p>
            <Link
              to="/auth"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Giriş Yap
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const used = alarms.length;
  const canCreate = used < limit;

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      {/* ========== MOBİL HEADER ========== */}
      <div className="lg:hidden">
        <MobileNav onOpenSymbol={() => {}} />
      </div>

      {/* ========== MASAÜSTÜ HEADER ========== */}
      <header className="sticky top-0 z-20 hidden border-b border-border bg-background/90 backdrop-blur lg:block">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="num text-sm font-bold uppercase tracking-[0.2em] text-primary"
          >
            AE Analiz
          </Link>
          <nav className="flex gap-2 text-xs">
            <Link
              to="/"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              Grafik
            </Link>
            <span className="rounded-md bg-primary/15 px-3 py-1.5 font-bold text-primary">
              🔔 Alarmlar
            </span>
          </nav>
          <div className="ml-auto truncate text-xs text-muted-foreground">
            {user?.email}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        {/* BAŞLIK */}
        <section className="panel p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">🔔 Alarmlar</h1>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Fiyat, formasyon ve kalite alarmları kurun
              </p>
            </div>
            <span className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-bold">
              {used} / {limit === 999 ? "∞" : limit}
            </span>
          </div>
        </section>

        {/* YENİ ALARM BUTONU */}
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            disabled={!canCreate}
            className="min-h-[48px] w-full rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3 text-sm font-bold text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {canCreate
              ? "＋ YENİ ALARM OLUŞTUR"
              : `⚠️ Limite ulaştınız (${limit})`}
          </button>
        )}

        {/* YENİ ALARM FORMU */}
        {showForm && (
          <section className="panel border-primary/40 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold sm:text-lg">🔔 Yeni Alarm</h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm hover:bg-secondary"
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            {/* TİP SEÇİMİ — yatay kaydırılabilir */}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => setNewType("price")}
                className={`min-h-[40px] shrink-0 rounded-md border px-3 py-2 text-xs font-bold ${
                  newType === "price"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-secondary"
                }`}
              >
                💰 Fiyat
              </button>
              <button
                type="button"
                onClick={() => setNewType("formation")}
                className={`min-h-[40px] shrink-0 rounded-md border px-3 py-2 text-xs font-bold ${
                  newType === "formation"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-secondary"
                }`}
              >
                📊 Formasyon
              </button>
              <button
                type="button"
                onClick={() => setNewType("quality")}
                className={`min-h-[40px] shrink-0 rounded-md border px-3 py-2 text-xs font-bold ${
                  newType === "quality"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-secondary"
                }`}
              >
                ⭐ Kalite
              </button>
            </div>

            {/* MARKET + SEMBOL */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-bold text-muted-foreground">
                  Market
                </label>
                <select
                  value={newMarket}
                  onChange={(e) => setNewMarket(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="crypto">KRİPTO</option>
                  <option value="bist">BIST</option>
                  <option value="us">ABD</option>
                  <option value="asia">ASYA</option>
                  <option value="europe">AVRUPA</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground">
                  Sembol
                </label>
                <input
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  placeholder="BTCUSDT, THYAO.IS..."
                  className="num mt-1 min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* TİP BAZLI ALANLAR */}
            {newType === "price" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-muted-foreground">
                    Hedef Fiyat
                  </label>
                  <input
                    type="number"
                    value={newTargetPrice}
                    onChange={(e) => setNewTargetPrice(e.target.value)}
                    placeholder="70000"
                    className="num mt-1 min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground">
                    Koşul
                  </label>
                  <select
                    value={newCondition}
                    onChange={(e) =>
                      setNewCondition(e.target.value as "above" | "below")
                    }
                    className="mt-1 min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="above">Üzerine çıkarsa (↑)</option>
                    <option value="below">Altına düşerse (↓)</option>
                  </select>
                </div>
              </div>
            )}

            {newType === "formation" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-muted-foreground">
                    Formasyon
                  </label>
                  <select
                    value={newFormationName}
                    onChange={(e) => setNewFormationName(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {FORMATION_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground">
                    Min Kalite:{" "}
                    <span className="text-foreground">{newMinQuality}</span>
                  </label>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    step={1}
                    value={newMinQuality}
                    onChange={(e) =>
                      setNewMinQuality(Number(e.target.value))
                    }
                    className="mt-3 h-8 w-full"
                  />
                </div>
              </div>
            )}

            {newType === "quality" && (
              <div className="mt-4">
                <label className="text-xs font-bold text-muted-foreground">
                  Min Kalite:{" "}
                  <span className="text-foreground">{newMinQuality}</span>
                </label>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={1}
                  value={newMinQuality}
                  onChange={(e) => setNewMinQuality(Number(e.target.value))}
                  className="mt-3 h-8 w-full"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Kalite puanı {newMinQuality} ve üzeri olan sinyaller için
                  alarm kurar
                </p>
              </div>
            )}

            {/* BUTONLAR */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void createAlarm()}
                disabled={creating}
                className="min-h-[48px] rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {creating ? "⏳ Oluşturuluyor..." : "🔔 Alarm Oluştur"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="min-h-[48px] rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-secondary"
              >
                İptal
              </button>
            </div>
          </section>
        )}

        {/* ALARM LİSTESİ */}
        {loading ? (
          <SkeletonList count={4} variant="card" />
        ) : alarms.length === 0 ? (
          <section className="panel p-8 text-center sm:p-12">
            <p className="text-4xl">🔔</p>
            <p className="mt-4 text-sm font-bold">Henüz alarm kurmadınız</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Yukarıdaki butonla ilk alarmınızı oluşturun
            </p>
          </section>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {alarms.map((alarm) => (
              <AlarmCard
                key={alarm.id}
                alarm={alarm}
                onDelete={() => void deleteAlarm(alarm.id)}
                onToggle={() => void toggleActive(alarm.id, alarm.is_active)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ==========================================================
// ALARM KART
// ==========================================================

function AlarmCard({
  alarm,
  onDelete,
  onToggle,
}: {
  alarm: Alarm;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const typeLabel = useMemo(() => {
    if (alarm.type === "price") return "💰 Fiyat";
    if (alarm.type === "formation") return "📊 Formasyon";
    return "⭐ Kalite";
  }, [alarm.type]);

  const conditionLabel = useMemo(() => {
    if (alarm.type === "price") {
      if (alarm.condition === "above") return `≥ ${alarm.target_price}`;
      return `≤ ${alarm.target_price}`;
    }
    if (alarm.type === "formation") {
      return `${alarm.formation_name}${
        alarm.min_quality ? ` (kalite ≥${alarm.min_quality})` : ""
      }`;
    }
    return `Kalite ≥ ${alarm.min_quality}`;
  }, [alarm]);

  const statusBadge = alarm.is_active
    ? { label: "AKTİF", cls: "bg-bull/15 text-bull" }
    : alarm.triggered_at
      ? { label: "TETİKLENDİ", cls: "bg-amber-500/15 text-amber-500" }
      : { label: "PASİF", cls: "bg-secondary text-muted-foreground" };

  return (
    <div className="panel p-3 sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="text-xl sm:text-2xl">
            {alarm.type === "price"
              ? "💰"
              : alarm.type === "formation"
                ? "📊"
                : "⭐"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              {typeLabel} — {alarm.symbol}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
              {MARKET_LABELS[alarm.market] ?? alarm.market} · {conditionLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span
            className={`rounded-md px-2.5 py-1 text-[10px] font-bold ${statusBadge.cls}`}
          >
            {statusBadge.label}
          </span>

          {alarm.trigger_count > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {alarm.trigger_count}× tetiklendi
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggle}
              className="min-h-[40px] min-w-[40px] rounded-md border border-border px-3 text-sm font-bold hover:bg-secondary"
              aria-label={alarm.is_active ? "Pasife al" : "Aktifleştir"}
            >
              {alarm.is_active ? "⏸" : "▶"}
            </button>

            <button
              type="button"
              onClick={onDelete}
              className="min-h-[40px] min-w-[40px] rounded-md border border-destructive/30 px-3 text-sm font-bold text-destructive hover:bg-destructive/10"
              aria-label="Sil"
            >
              🗑️
            </button>
          </div>
        </div>

        {alarm.triggered_at && (
          <p className="text-[10px] text-muted-foreground sm:text-[11px]">
            Son tetiklenme:{" "}
            {new Date(alarm.triggered_at).toLocaleString("tr-TR")}
          </p>
        )}
      </div>
    </div>
  );
}