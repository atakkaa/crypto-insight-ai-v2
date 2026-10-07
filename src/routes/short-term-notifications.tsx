import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import {
  fetchShortTermNotifications,
  markAllShortTermNotificationsRead,
  markShortTermNotificationRead,
  clearAllShortTermNotifications,
  subscribeToShortTermNotifications,
  type ShortTermNotification,
} from "@/lib/notifications";
import { ShortTermNotificationDetailModal } from "@/components/ShortTermNotificationDetailModal";

export const Route = createFileRoute("/short-term-notifications")({
  head: () => ({
    meta: [{ title: "Kısa Vadeli Bildirimler — Formasyon AI" }],
  }),
  component: ShortTermNotificationsPage,
});

function ShortTermNotificationsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<ShortTermNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [biasFilter, setBiasFilter] = useState<"all" | "yükseliş" | "düşüş">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7days">("all");
  const [timeframeFilter, setTimeframeFilter] = useState<"all" | "15m" | "1h" | "4h" | "1d">("all");
  const [detailNotification, setDetailNotification] = useState<ShortTermNotification | null>(null);

  // 1. İlk yüklemede bildirimleri çek
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchShortTermNotifications(user.id, 500).then((data) => {
      setNotifications(data);
      setLoading(false);
    });
  }, [user, authLoading]);

  // 2. Realtime: yeni bildirim gelince state'e ekle
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToShortTermNotifications(user.id, (n) => {
      setNotifications((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        return [n, ...prev];
      });
    });

    return unsubscribe;
  }, [user]);

  // 3. Filtreleme
  const filtered = useMemo(() => {
    let list = notifications;

    // Arama
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.symbol.toLowerCase().includes(q) ||
          n.pattern_name.toLowerCase().includes(q),
      );
    }

    // Yön filtresi
    if (biasFilter !== "all") {
      list = list.filter((n) => n.pattern_bias === biasFilter);
    }

    // Zaman dilimi filtresi
    if (timeframeFilter !== "all") {
      list = list.filter((n) => n.timeframe === timeframeFilter);
    }

    // Tarih filtresi
    if (dateFilter === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      list = list.filter(
        (n) => new Date(n.created_at).getTime() >= startOfDay.getTime(),
      );
    } else if (dateFilter === "7days") {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter(
        (n) => new Date(n.created_at).getTime() >= sevenDaysAgo,
      );
    }

    return list;
  }, [notifications, search, biasFilter, dateFilter, timeframeFilter]);

  // 4. İstatistikler
  const stats = useMemo(() => {
    const total = notifications.length;
    const unread = notifications.filter((n) => !n.read).length;
    const bullish = notifications.filter((n) => n.pattern_bias === "yükseliş").length;
    const bearish = notifications.filter((n) => n.pattern_bias === "düşüş").length;
    const tf15m = notifications.filter((n) => n.timeframe === "15m").length;
    const tf1h = notifications.filter((n) => n.timeframe === "1h").length;
    const tf4h = notifications.filter((n) => n.timeframe === "4h").length;
    const tf1d = notifications.filter((n) => n.timeframe === "1d").length;
    return { total, unread, bullish, bearish, tf15m, tf1h, tf4h, tf1d };
  }, [notifications]);

  // 5. Bildirime tıklama
  async function handleNotificationClick(n: ShortTermNotification) {
    if (!n.read) {
      await markShortTermNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
    }
    setDetailNotification(n);
  }

  // 6. Tümünü okundu işaretle
  async function handleMarkAllRead() {
    if (!user) return;
    await markAllShortTermNotificationsRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success("Tüm kısa vadeli bildirimler okundu olarak işaretlendi.");
  }

  // 7. Tümünü temizle
  async function handleClearAll() {
    if (!user) return;
    if (!window.confirm("Tüm kısa vadeli bildirimleri silmek istediğinize emin misiniz?")) return;
    await clearAllShortTermNotifications(user.id);
    setNotifications([]);
    toast.success("Tüm kısa vadeli bildirimler temizlendi.");
  }

  // 8. Auth loading
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    );
  }

  // 9. Giriş yok
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="panel max-w-md p-6 text-center">
          <p className="text-3xl">🔒</p>
          <h1 className="mt-3 text-lg font-bold">Giriş Yapmanız Gerekiyor</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Kısa vadeli bildirimleri görmek için giriş yapın.
          </p>
          <Link
            to="/auth"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Giriş Yap
          </Link>
          <Link
            to="/"
            className="mt-2 block text-xs text-muted-foreground hover:text-foreground"
          >
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
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
            <Link
              to="/coins"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              Liste
            </Link>
            <span className="rounded-md bg-amber-500/15 px-3 py-1.5 font-bold text-amber-500">
              📉 Kısa Vadeli
            </span>
          </nav>
          <div className="ml-auto text-xs text-muted-foreground">
            {user.email}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {/* BAŞLIK */}
        <section className="panel p-5">
          <h1 className="text-xl font-bold">📉 Kısa Vadeli Bildirimler</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Premium üyeler için 20-30 mumluk formasyon bildirimleri. Detaylı analiz için bir karta tıklayın.
          </p>

          {/* İSTATİSTİKLER */}
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Toplam</p>
              <p className="num mt-1 text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Okunmamış</p>
              <p className="num mt-1 text-2xl font-bold text-amber-500">
                {stats.unread}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">🟢 Yükseliş</p>
              <p className="num mt-1 text-2xl font-bold text-bull">
                {stats.bullish}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">🔴 Düşüş</p>
              <p className="num mt-1 text-2xl font-bold text-bear">
                {stats.bearish}
              </p>
            </div>
          </div>

          {/* ZAMAN DİLİMİ İSTATİSTİKLERİ */}
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-border/60 bg-secondary/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">15 Dakika</p>
              <p className="num text-sm font-bold text-amber-500">{stats.tf15m}</p>
            </div>
            <div className="rounded-md border border-border/60 bg-secondary/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">1 Saat</p>
              <p className="num text-sm font-bold text-amber-500">{stats.tf1h}</p>
            </div>
            <div className="rounded-md border border-border/60 bg-secondary/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">4 Saat</p>
              <p className="num text-sm font-bold text-amber-500">{stats.tf4h}</p>
            </div>
            <div className="rounded-md border border-border/60 bg-secondary/30 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">1 Gün</p>
              <p className="num text-sm font-bold text-amber-500">{stats.tf1d}</p>
            </div>
          </div>

          {/* FİLTRELER */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sembol veya formasyon ara..."
              className="min-w-[200px] flex-1 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
            />
            <select
              value={timeframeFilter}
              onChange={(e) => setTimeframeFilter(e.target.value as typeof timeframeFilter)}
              className="rounded-md border border-input bg-card px-3 py-2 text-xs font-bold outline-none"
            >
              <option value="all">Tüm Zamanlar</option>
              <option value="15m">📊 15 Dakika</option>
              <option value="1h">📊 1 Saat</option>
              <option value="4h">📊 4 Saat</option>
              <option value="1d">📊 1 Gün</option>
            </select>
            <select
              value={biasFilter}
              onChange={(e) => setBiasFilter(e.target.value as typeof biasFilter)}
              className="rounded-md border border-input bg-card px-3 py-2 text-xs font-bold outline-none"
            >
              <option value="all">Tüm Yönler</option>
              <option value="yükseliş">🟢 Yükseliş</option>
              <option value="düşüş">🔴 Düşüş</option>
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
              className="rounded-md border border-input bg-card px-3 py-2 text-xs font-bold outline-none"
            >
              <option value="all">Tüm Zamanlar</option>
              <option value="today">Bugün</option>
              <option value="7days">Son 7 Gün</option>
            </select>
          </div>

          {/* AKSİYONLAR */}
          {notifications.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary"
              >
                ✅ Tümünü Okundu İşaretle
              </button>
              <button
                type="button"
                onClick={() => void handleClearAll()}
                className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10"
              >
                🗑️ Tümünü Temizle
              </button>
            </div>
          )}
        </section>

        {/* BİLDİRİM LİSTESİ */}
        <section className="panel">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Bildirimler yükleniyor...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-4xl">📭</p>
              <p className="mt-3 text-sm font-bold">Bildirim bulunamadı</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {notifications.length === 0
                  ? "Henüz kısa vadeli bildiriminiz yok. Premium üyeler için 20-30 mumluk formasyonlar taranıyor."
                  : "Arama veya filtre kriterlerinize uygun bildirim yok."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((n) => {
                const biasEmoji = n.pattern_bias === "yükseliş" ? "🟢" : "🔴";
                const biasColor = n.pattern_bias === "yükseliş" ? "text-bull" : "text-bear";
                const tfLabel = n.timeframe ? n.timeframe.toUpperCase() : "1H";
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void handleNotificationClick(n)}
                    className={`w-full p-4 text-left transition-colors hover:bg-secondary/40 ${
                      !n.read ? "bg-amber-500/5" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                          📉 KISA VADELİ ({tfLabel})
                        </span>
                        <span className={`num text-sm font-bold ${biasColor}`}>
                          {biasEmoji} {n.symbol.replace(/USDT$/, "").replace(/\.(IS|US)$/, "")}
                        </span>
                        <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold">
                          {n.pattern_name}
                        </span>
                        {!n.read && (
                          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            YENİ
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("tr-TR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <p className="mt-2 text-sm font-bold">
                      {biasEmoji} {n.pattern_name} · {n.pattern_bias}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Güven: %{n.confidence} · Sinyal Skoru: {n.signal_score}/100
                    </p>

                    {/* Giriş / Hedef / Stop */}
                    {(n.entry != null || n.target != null || n.stop != null) && (
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        {n.entry != null && (
                          <div className="rounded border border-border/60 bg-secondary/30 p-2">
                            <p className="text-[9px] text-muted-foreground">Giriş</p>
                            <p className="num font-bold">{n.entry.toFixed(4)}</p>
                          </div>
                        )}
                        {n.target != null && (
                          <div className="rounded border border-border/60 bg-secondary/30 p-2">
                            <p className="text-[9px] text-muted-foreground">Hedef</p>
                            <p className="num font-bold text-bull">{n.target.toFixed(4)}</p>
                          </div>
                        )}
                        {n.stop != null && (
                          <div className="rounded border border-border/60 bg-secondary/30 p-2">
                            <p className="text-[9px] text-muted-foreground">Stop</p>
                            <p className="num font-bold text-bear">{n.stop.toFixed(4)}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {n.fear_greed != null && (
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        😱 Fear & Greed: <span className="num font-bold">{n.fear_greed}</span>
                      </p>
                    )}

                    {n.reason && (
                      <p className="mt-1 text-[11px] italic leading-4 text-muted-foreground/80">
                        {n.reason.slice(0, 200)}
                        {n.reason.length > 200 ? "..." : ""}
                      </p>
                    )}

                    <p className="mt-2 text-[10px] font-bold text-amber-500">
                      👁️ Detayları görmek için tıkla →
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <p className="pb-8 text-center text-[11px] text-muted-foreground">
          Bu sayfa sadece Premium/Trial/Admin kullanıcılar için kısa vadeli formasyon bildirimlerini gösterir.
        </p>
      </main>

      {/* DETAY MODAL */}
      <ShortTermNotificationDetailModal
        notification={detailNotification}
        onClose={() => setDetailNotification(null)}
        onOpenSymbol={(m, s) => {
          void navigate({
            to: "/",
            search: { m: m as any, s } as any,
          });
        }}
      />
    </div>
  );
}