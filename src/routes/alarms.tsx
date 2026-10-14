// src/routes/alarms.tsx — Kullanıcı Alarm Sistemi
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/alarms")({
  head: () => ({
    meta: [{ title: "Alarmlar — Formasyon AI" }],
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

// YENİ: Body için düzgün tip
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
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<string>("free");
  const [limit, setLimit] = useState(3);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [newType, setNewType] = useState<AlarmType>("price");
  const [newMarket, setNewMarket] = useState("crypto");
  const [newSymbol, setNewSymbol] = useState("");
  const [newTargetPrice, setNewTargetPrice] = useState("");
  const [newCondition, setNewCondition] = useState<"above" | "below">("above");
  const [newFormationName, setNewFormationName] = useState<string>(FORMATION_OPTIONS[0] ?? "Yükselen Üçgen");
  const [newMinQuality, setNewMinQuality] = useState(80);

  // ==========================================================
  // FETCH
  // ==========================================================

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
  }, [user]);

  // ==========================================================
  // OLUŞTUR
  // ==========================================================

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

    // DÜZELTİLDİ: Artık CreateAlarmBody tipi kullanılıyor
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

  // ==========================================================
  // SİL
  // ==========================================================

  async function deleteAlarm(id: string) {
    if (!user) return;
    if (!window.confirm("Bu alarmı silmek istediğinize emin misiniz?")) return;

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

  // ==========================================================
  // AKTİF/PASİF
  // ==========================================================

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

  // ==========================================================
  // GİRİŞ YOK
  // ==========================================================

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-bold">🔒 Giriş Yapın</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Alarmları görmek için giriş yapın.
          </p>
        </div>
      </div>
    );
  }

  const used = alarms.length;
  const canCreate = used < limit;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4">
      {/* BAŞLIK */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">🔔 Alarmlar</h1>
          <p className="text-sm text-muted-foreground">
            Fiyat, formasyon ve kalite alarmları kurun
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-bold">
            {used} / {limit === 999 ? "∞" : limit}
          </span>
          <Link
            to="/"
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
          >
            ← Ana Sayfa
          </Link>
        </div>
      </div>

      {/* YENİ ALARM BUTONU */}
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          disabled={!canCreate}
          className="w-full rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-sm font-bold text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {canCreate ? "＋ YENİ ALARM OLUŞTUR" : `⚠️ Limite ulaştınız (${limit})`}
        </button>
      )}

      {/* YENİ ALARM FORMU */}
      {showForm && (
        <div className="rounded-lg border border-primary/40 bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">🔔 Yeni Alarm</h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
            >
              ✕
            </button>
          </div>

          {/* TİP SEÇİMİ */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setNewType("price")}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
                newType === "price"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-secondary"
              }`}
            >
              💰 Fiyat Alarmı
            </button>
            <button
              type="button"
              onClick={() => setNewType("formation")}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
                newType === "formation"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-secondary"
              }`}
            >
              📊 Formasyon Alarmı
            </button>
            <button
              type="button"
              onClick={() => setNewType("quality")}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
                newType === "quality"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-secondary"
              }`}
            >
              ⭐ Kalite Alarmı
            </button>
          </div>

          {/* MARKET + SEMBOL */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-muted-foreground">Market</label>
              <select
                value={newMarket}
                onChange={(e) => setNewMarket(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="crypto">KRİPTO</option>
                <option value="bist">BIST</option>
                <option value="us">ABD</option>
                <option value="asia">ASYA</option>
                <option value="europe">AVRUPA</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground">Sembol</label>
              <input
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                placeholder="BTCUSDT, THYAO.IS..."
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* TİP BAZLI ALANLAR */}
          {newType === "price" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-bold text-muted-foreground">Hedef Fiyat</label>
                <input
                  type="number"
                  value={newTargetPrice}
                  onChange={(e) => setNewTargetPrice(e.target.value)}
                  placeholder="70000"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground">Koşul</label>
                <select
                  value={newCondition}
                  onChange={(e) => setNewCondition(e.target.value as "above" | "below")}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="above">Üzerine çıkarsa (↑)</option>
                  <option value="below">Altına düşerse (↓)</option>
                </select>
              </div>
            </div>
          )}

          {newType === "formation" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-bold text-muted-foreground">Formasyon</label>
                <select
                  value={newFormationName}
                  onChange={(e) => setNewFormationName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {FORMATION_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground">
                  Min Kalite: <span className="text-foreground">{newMinQuality}</span>
                </label>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={1}
                  value={newMinQuality}
                  onChange={(e) => setNewMinQuality(Number(e.target.value))}
                  className="mt-2 w-full"
                />
              </div>
            </div>
          )}

          {newType === "quality" && (
            <div className="mt-3">
              <label className="text-xs font-bold text-muted-foreground">
                Min Kalite: <span className="text-foreground">{newMinQuality}</span>
              </label>
              <input
                type="range"
                min={50}
                max={100}
                step={1}
                value={newMinQuality}
                onChange={(e) => setNewMinQuality(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Kalite puanı {newMinQuality} ve üzeri olan sinyaller için alarm kurar
              </p>
            </div>
          )}

          {/* BUTONLAR */}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void createAlarm()}
              disabled={creating}
              className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {creating ? "⏳ Oluşturuluyor..." : "🔔 Alarm Oluştur"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-secondary"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* ALARM LİSTESİ */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        </div>
      ) : alarms.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-4xl">🔔</p>
          <p className="mt-4 text-sm font-bold">Henüz alarm kurmadınız</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Yukarıdaki butonla ilk alarmınızı oluşturun
          </p>
        </div>
      ) : (
        <div className="space-y-3">
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
      return `${alarm.formation_name}${alarm.min_quality ? ` (kalite ≥${alarm.min_quality})` : ""}`;
    }
    return `Kalite ≥ ${alarm.min_quality}`;
  }, [alarm]);

  const statusBadge = alarm.is_active
    ? { label: "AKTİF", cls: "bg-bull/15 text-bull" }
    : alarm.triggered_at
      ? { label: "TETİKLENDİ", cls: "bg-amber-500/15 text-amber-500" }
      : { label: "PASİF", cls: "bg-secondary text-muted-foreground" };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {alarm.type === "price" ? "💰" : alarm.type === "formation" ? "📊" : "⭐"}
          </span>
          <div>
            <p className="text-sm font-bold">
              {typeLabel} — {alarm.symbol}
            </p>
            <p className="text-xs text-muted-foreground">
              {MARKET_LABELS[alarm.market] ?? alarm.market} · {conditionLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>

          {alarm.trigger_count > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {alarm.trigger_count}× tetiklendi
            </span>
          )}

          <button
            type="button"
            onClick={onToggle}
            className="rounded-md border border-border px-2.5 py-1 text-[10px] font-bold hover:bg-secondary"
          >
            {alarm.is_active ? "⏸ Pasif" : "▶ Aktif"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-destructive/30 px-2.5 py-1 text-[10px] font-bold text-destructive hover:bg-destructive/10"
          >
            🗑️ Sil
          </button>
        </div>
      </div>

      {alarm.triggered_at && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Son tetiklenme: {new Date(alarm.triggered_at).toLocaleString("tr-TR")}
        </p>
      )}
    </div>
  );
}