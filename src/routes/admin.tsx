// src/routes/admin.tsx — Admin Paneli v3 (Backtest linkli, mobil uyumlu)
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin Paneli — AE Analiz" }],
  }),
  component: AdminPage,
});

// ==========================================================
// TİPLER
// ==========================================================

type Profile = {
  id: string;
  email: string | null;
  role: string;
  membership: string;
  is_banned: boolean;
  created_at: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_used: boolean;
  last_sign_in_at: string | null;
};

type UserTier = "admin" | "premium" | "trial" | "free";

// ==========================================================
// TIER YARDIMCILARI
// ==========================================================

function getUserTier(profile: Profile): UserTier {
  if (profile.role === "admin") return "admin";
  if (profile.membership === "premium") return "premium";
  if (profile.membership === "trial") {
    if (profile.trial_ends_at) {
      const isExpired =
        new Date(profile.trial_ends_at).getTime() < Date.now();
      if (!isExpired) return "trial";
    }
    return "free";
  }
  return "free";
}

function getTrialDaysLeft(profile: Profile): number | null {
  if (!profile.trial_ends_at) return null;
  const msLeft = new Date(profile.trial_ends_at).getTime() - Date.now();
  if (msLeft <= 0) return null;
  return Math.ceil(msLeft / (1000 * 60 * 60 * 24));
}

function formatLastSignIn(dateStr: string | null): string {
  if (!dateStr) return "Hiç giriş yapmadı";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Az önce";
  if (diffMins < 60) return `${diffMins} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays < 7) return `${diffDays} gün önce`;
  return date.toLocaleDateString("tr-TR");
}

function tierBadge(tier: UserTier) {
  switch (tier) {
    case "admin":
      return {
        emoji: "👑",
        label: "ADMIN",
        cls: "bg-amber-500/15 text-amber-500",
      };
    case "premium":
      return {
        emoji: "⭐",
        label: "PREMIUM",
        cls: "bg-primary/15 text-primary",
      };
    case "trial":
      return {
        emoji: "⏱️",
        label: "DENEME",
        cls: "bg-blue-500/15 text-blue-400",
      };
    case "free":
      return {
        emoji: "🆓",
        label: "FREE",
        cls: "bg-secondary text-muted-foreground",
      };
  }
}

const SELECT_FIELDS =
  "id, email, role, membership, is_banned, created_at, trial_started_at, trial_ends_at, trial_used, last_sign_in_at";

// ==========================================================
// ANA BİLEŞEN
// ==========================================================

function AdminPage() {
  const { user, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<"all" | UserTier>("all");

  // =========================================================
  // ADMIN KONTROLÜ VE KULLANICI LİSTESİ
  // =========================================================
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      setIsAdmin(false);
      return;
    }

    void (async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Admin kontrolü hatası:", error);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const admin = data?.role === "admin";
      setIsAdmin(admin);

      if (!admin) {
        setLoading(false);
        return;
      }

      const { data: allUsers, error: usersError } = await (supabase as any)
        .from("profiles")
        .select(SELECT_FIELDS)
        .order("created_at", { ascending: false });

      if (usersError) {
        console.error("Kullanıcılar çekilemedi:", usersError);
      } else {
        setUsers((allUsers ?? []) as Profile[]);
      }
      setLoading(false);
    })();
  }, [user, authLoading]);

  // =========================================================
  // PREMIUM TOGGLE
  // =========================================================
  async function togglePremium(userId: string, current: string) {
    setBusyUserId(userId);
    const newVal = current === "premium" ? "free" : "premium";
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ membership: newVal })
      .eq("id", userId);

    if (error) {
      toast.error("Güncellenemedi");
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, membership: newVal } : u)),
      );
      toast.success(
        newVal === "premium" ? "⭐ Premium yapıldı" : "Free yapıldı",
      );
    }
    setBusyUserId(null);
  }

  // =========================================================
  // TRIAL BAŞLAT
  // =========================================================
  async function startTrialForUser(userId: string) {
    setBusyUserId(userId);
    try {
      const res = await fetch(
        `/api/alarms?action=start-trial&userId=${encodeURIComponent(userId)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Deneme başlatılamadı");
      } else {
        const now = new Date();
        const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  membership: "trial",
                  trial_started_at: now.toISOString(),
                  trial_ends_at: endsAt.toISOString(),
                  trial_used: true,
                }
              : u,
          ),
        );
        toast.success("🚀 7 günlük deneme başladı");
      }
    } catch {
      toast.error("Bağlantı hatası");
    }
    setBusyUserId(null);
  }

  // =========================================================
  // TRIAL İPTAL
  // =========================================================
  async function cancelTrialForUser(userId: string) {
    if (!window.confirm("Deneme iptal edilsin mi?")) return;
    setBusyUserId(userId);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ membership: "free", trial_ends_at: null })
      .eq("id", userId);

    if (error) {
      toast.error("İptal edilemedi");
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, membership: "free", trial_ends_at: null }
            : u,
        ),
      );
      toast.success("Deneme iptal edildi");
    }
    setBusyUserId(null);
  }

  // =========================================================
  // BAN TOGGLE
  // =========================================================
  async function toggleBan(userId: string, current: boolean) {
    setBusyUserId(userId);
    const newVal = !current;
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ is_banned: newVal })
      .eq("id", userId);

    if (error) {
      toast.error("Güncellenemedi");
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_banned: newVal } : u)),
      );
      toast.success(newVal ? "🚫 Banlandı" : "✅ Ban kaldırıldı");
    }
    setBusyUserId(null);
  }

  // =========================================================
  // ADMIN ROLE TOGGLE
  // =========================================================
  async function toggleAdminRole(userId: string, current: string) {
    if (userId === user?.id) {
      toast.error("Kendi rolünüzü değiştiremezsiniz");
      return;
    }
    if (
      !window.confirm("Bu kullanıcının rolünü değiştirmek istiyor musunuz?")
    ) {
      return;
    }
    setBusyUserId(userId);
    const newVal = current === "admin" ? "user" : "admin";
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ role: newVal })
      .eq("id", userId);

    if (error) {
      toast.error("Güncellenemedi");
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newVal } : u)),
      );
      toast.success(newVal === "admin" ? "👑 Admin yapıldı" : "User yapıldı");
    }
    setBusyUserId(null);
  }

  // =========================================================
  // KULLANICI SİL
  // =========================================================
  async function deleteUser(userId: string, email: string | null) {
    if (userId === user?.id) {
      toast.error("Kendi hesabınızı silemezsiniz");
      return;
    }
    if (!window.confirm(`${email ?? userId} silinsin mi?`)) return;
    setBusyUserId(userId);
    const { error } = await (supabase as any)
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (error) {
      toast.error("Silinemedi");
    } else {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success("Kullanıcı silindi");
    }
    setBusyUserId(null);
  }

  // =========================================================
  // YENİLE
  // =========================================================
  async function refreshUsers() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("profiles")
      .select(SELECT_FIELDS)
      .order("created_at", { ascending: false });
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
  }

  // =========================================================
  // YÜKLENİYOR
  // =========================================================
  if (authLoading || loading || isAdmin === null) {
    return (
      <div className="min-h-screen pb-24 lg:pb-0">
        <div className="lg:hidden">
          <MobileNav onOpenSymbol={() => {}} />
        </div>
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // =========================================================
  // GİRİŞ YOK
  // =========================================================
  if (!user) {
    return (
      <div className="min-h-screen pb-24 lg:pb-0">
        <div className="lg:hidden">
          <MobileNav onOpenSymbol={() => {}} />
        </div>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="panel max-w-md p-6 text-center">
            <p className="text-3xl">🔒</p>
            <h1 className="mt-3 text-lg font-bold">Giriş Yapmanız Gerekiyor</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Bu sayfaya erişmek için lütfen giriş yapın.
            </p>
            <Link
              to="/auth"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Giriş Yap / Kayıt Ol
            </Link>
            <Link
              to="/"
              className="mt-2 block text-xs text-muted-foreground hover:text-foreground"
            >
              Ana Sayfaya Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // ADMIN DEĞİL
  // =========================================================
  if (!isAdmin) {
    return (
      <div className="min-h-screen pb-24 lg:pb-0">
        <div className="lg:hidden">
          <MobileNav onOpenSymbol={() => {}} />
        </div>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="panel max-w-md p-6 text-center">
            <p className="text-3xl">🚫</p>
            <h1 className="mt-3 text-lg font-bold">Yetkiniz Yok</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Bu sayfaya sadece admin kullanıcılar erişebilir.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Giriş yaptığınız hesap: {user.email ?? user.id.slice(0, 8)}
            </p>
            <Link
              to="/"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Ana Sayfaya Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // FİLTRELEME
  // =========================================================
  const filtered = users.filter((u) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matches =
        (u.email ?? "").toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (tierFilter !== "all") {
      const tier = getUserTier(u);
      if (tier !== tierFilter) return false;
    }
    return true;
  });

  const totalUsers = users.length;
  const premiumUsers = users.filter(
    (u) => getUserTier(u) === "premium",
  ).length;
  const trialUsers = users.filter((u) => getUserTier(u) === "trial").length;
  const bannedUsers = users.filter((u) => u.is_banned).length;

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      {/* ========== MOBİL HEADER ========== */}
      <div className="lg:hidden">
        <MobileNav onOpenSymbol={() => {}} />
      </div>

      {/* ========== MASAÜSTÜ HEADER ========== */}
      <header className="sticky top-0 z-20 hidden border-b border-border bg-background/90 backdrop-blur lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="num text-sm font-bold uppercase tracking-[0.2em] text-primary"
          >
            AE Analiz
          </Link>
          <nav className="flex flex-wrap gap-2 text-xs">
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
            <Link
              to="/stats"
              className="rounded-md border border-purple-500/40 px-3 py-1.5 font-bold text-purple-400 hover:bg-purple-500/10"
            >
              📊 İstatistikler
            </Link>
            <Link
              to="/backtest"
              className="rounded-md border border-cyan-500/40 px-3 py-1.5 font-bold text-cyan-400 hover:bg-cyan-500/10"
            >
              🧪 Backtest
            </Link>
            <Link
              to="/settings"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              ⚙️ Ayarlar
            </Link>
            <span className="rounded-md bg-primary/15 px-3 py-1.5 font-bold text-primary">
              👑 Admin
            </span>
          </nav>
          <div className="ml-auto truncate text-xs text-muted-foreground">
            {user?.email}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        {/* BAŞLIK */}
        <section className="panel p-4 sm:p-5">
          <h1 className="text-xl font-bold sm:text-2xl">👑 Admin Paneli</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Kullanıcıları yönetin, üyelik ve erişim durumlarını kontrol edin.
          </p>

          {/* İSTATİSTİKLER */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground sm:text-xs">
                Toplam Kullanıcı
              </p>
              <p className="num mt-1 text-xl font-bold sm:text-2xl">
                {totalUsers}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground sm:text-xs">
                Premium Üye
              </p>
              <p className="num mt-1 text-xl font-bold text-primary sm:text-2xl">
                {premiumUsers}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground sm:text-xs">
                Deneme Süresinde
              </p>
              <p className="num mt-1 text-xl font-bold text-blue-400 sm:text-2xl">
                {trialUsers}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground sm:text-xs">
                Banlı
              </p>
              <p className="num mt-1 text-xl font-bold text-bear sm:text-2xl">
                {bannedUsers}
              </p>
            </div>
          </div>

          {/* ARAMA + FİLTRE */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="E-posta veya ID ara..."
              className="min-h-[44px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring sm:min-w-[240px] sm:flex-1"
            />
            <select
              value={tierFilter}
              onChange={(e) =>
                setTierFilter(e.target.value as typeof tierFilter)
              }
              className="min-h-[44px] w-full rounded-md border border-input bg-card px-3 py-2 text-xs font-bold outline-none sm:w-auto"
            >
              <option value="all">Tüm Tier'lar</option>
              <option value="admin">👑 Admin</option>
              <option value="premium">⭐ Premium</option>
              <option value="trial">⏱️ Deneme</option>
              <option value="free">🆓 Free</option>
            </select>
            <button
              type="button"
              onClick={() => void refreshUsers()}
              className="min-h-[44px] rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"
            >
              🔄 Yenile
            </button>
          </div>
        </section>

        {/* KULLANICI TABLOSU */}
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Kullanıcılar ({filtered.length})
            </p>
          </div>

          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Kullanıcı bulunamadı.
            </p>
          ) : (
            <>
              {/* ========== MASAÜSTÜ: TABLO ========== */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-secondary/30">
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">E-posta</th>
                      <th className="px-3 py-2">Tier</th>
                      <th className="px-3 py-2">Rol</th>
                      <th className="px-3 py-2">Durum</th>
                      <th className="px-3 py-2">Kayıt</th>
                      <th className="px-3 py-2">Son Giriş</th>
                      <th className="px-3 py-2 text-right">Aksiyonlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u, idx) => {
                      const isMe = u.id === user?.id;
                      const busy = busyUserId === u.id;
                      const tier = getUserTier(u);
                      const badge = tierBadge(tier);
                      const daysLeft =
                        tier === "trial" ? getTrialDaysLeft(u) : null;
                      const lastSignIn = formatLastSignIn(u.last_sign_in_at);

                      return (
                        <tr
                          key={u.id}
                          className={`border-b border-border hover:bg-secondary/20 ${
                            isMe ? "bg-primary/5" : ""
                          }`}
                        >
                          <td className="num px-3 py-2 text-xs text-muted-foreground">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs">{u.email ?? "—"}</span>
                              {isMe && (
                                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                  SEN
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`inline-flex w-fit items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}
                              >
                                {badge.emoji} {badge.label}
                              </span>
                              {daysLeft !== null && (
                                <span className="text-[9px] text-blue-400">
                                  {daysLeft} gün kaldı
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {u.role === "admin" ? (
                              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                                👑 ADMIN
                              </span>
                            ) : (
                              <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold">
                                USER
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {u.is_banned ? (
                              <span className="rounded bg-bear/15 px-2 py-0.5 text-[10px] font-bold text-bear">
                                🚫 BANLI
                              </span>
                            ) : (
                              <span className="rounded bg-bull/15 px-2 py-0.5 text-[10px] font-bold text-bull">
                                ✅ AKTİF
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString("tr-TR")}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-muted-foreground">
                            <span
                              className={
                                u.last_sign_in_at
                                  ? "text-foreground"
                                  : "text-muted-foreground/60"
                              }
                            >
                              {lastSignIn}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <DesktopActions
                              u={u}
                              isMe={isMe}
                              busy={busy}
                              tier={tier}
                              onStartTrial={startTrialForUser}
                              onCancelTrial={cancelTrialForUser}
                              onTogglePremium={togglePremium}
                              onToggleAdminRole={toggleAdminRole}
                              onToggleBan={toggleBan}
                              onDelete={deleteUser}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ========== MOBİL: KART LİSTESİ ========== */}
              <div className="divide-y divide-border lg:hidden">
                {filtered.map((u) => {
                  const isMe = u.id === user?.id;
                  const busy = busyUserId === u.id;
                  const tier = getUserTier(u);
                  const badge = tierBadge(tier);
                  const daysLeft =
                    tier === "trial" ? getTrialDaysLeft(u) : null;
                  const lastSignIn = formatLastSignIn(u.last_sign_in_at);

                  return (
                    <div
                      key={u.id}
                      className={`p-3 ${isMe ? "bg-primary/5" : ""}`}
                    >
                      {/* ÜST: EMAIL + TIER BADGE */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-xs font-bold">
                              {u.email ?? "—"}
                            </span>
                            {isMe && (
                              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                SEN
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Kayıt:{" "}
                            {new Date(u.created_at).toLocaleDateString("tr-TR")}{" "}
                            · Son giriş: {lastSignIn}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}
                        >
                          {badge.emoji} {badge.label}
                        </span>
                      </div>

                      {/* DURUM ROZETLERİ */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {u.role === "admin" ? (
                          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                            👑 ADMIN
                          </span>
                        ) : (
                          <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold">
                            USER
                          </span>
                        )}
                        {u.is_banned ? (
                          <span className="rounded bg-bear/15 px-2 py-0.5 text-[10px] font-bold text-bear">
                            🚫 BANLI
                          </span>
                        ) : (
                          <span className="rounded bg-bull/15 px-2 py-0.5 text-[10px] font-bold text-bull">
                            ✅ AKTİF
                          </span>
                        )}
                        {daysLeft !== null && (
                          <span className="rounded bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                            ⏱️ {daysLeft} gün kaldı
                          </span>
                        )}
                      </div>

                      {/* AKSİYONLAR */}
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        {tier === "trial" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void cancelTrialForUser(u.id)}
                            className="min-h-[40px] rounded border border-blue-500/30 px-2 py-1.5 text-[11px] font-bold text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
                          >
                            ⏱️ Denemeyi İptal
                          </button>
                        ) : tier === "free" && !u.trial_used ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void startTrialForUser(u.id)}
                            className="min-h-[40px] rounded border border-blue-500/30 px-2 py-1.5 text-[11px] font-bold text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
                          >
                            🚀 Trial Ver
                          </button>
                        ) : (
                          <div />
                        )}

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void togglePremium(u.id, u.membership)}
                          className="min-h-[40px] rounded border border-border px-2 py-1.5 text-[11px] font-bold hover:bg-primary/10 disabled:opacity-50"
                        >
                          {u.membership === "premium"
                            ? "↩️ Free Yap"
                            : "⭐ Premium"}
                        </button>

                        <button
                          type="button"
                          disabled={busy || isMe}
                          onClick={() => void toggleAdminRole(u.id, u.role)}
                          className="min-h-[40px] rounded border border-border px-2 py-1.5 text-[11px] font-bold hover:bg-amber-500/10 disabled:opacity-50"
                        >
                          {u.role === "admin" ? "↓ User Yap" : "👑 Admin"}
                        </button>

                        <button
                          type="button"
                          disabled={busy || isMe}
                          onClick={() => void toggleBan(u.id, u.is_banned)}
                          className="min-h-[40px] rounded border border-border px-2 py-1.5 text-[11px] font-bold hover:bg-warn/10 disabled:opacity-50"
                        >
                          {u.is_banned ? "✅ Ban Aç" : "🚫 Banla"}
                        </button>

                        <button
                          type="button"
                          disabled={busy || isMe}
                          onClick={() => void deleteUser(u.id, u.email)}
                          className="col-span-2 min-h-[40px] rounded border border-destructive/30 px-2 py-1.5 text-[11px] font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          🗑️ Kullanıcıyı Sil
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <p className="pb-4 text-center text-[11px] text-muted-foreground">
          Bu sayfa sadece admin kullanıcılar tarafından erişilebilir.
        </p>
      </main>
    </div>
  );
}

// ==========================================================
// MASAÜSTÜ AKSİYON BUTONLARI (tablo satırı içinde)
// ==========================================================

function DesktopActions({
  u,
  isMe,
  busy,
  tier,
  onStartTrial,
  onCancelTrial,
  onTogglePremium,
  onToggleAdminRole,
  onToggleBan,
  onDelete,
}: {
  u: Profile;
  isMe: boolean;
  busy: boolean;
  tier: UserTier;
  onStartTrial: (id: string) => Promise<void>;
  onCancelTrial: (id: string) => Promise<void>;
  onTogglePremium: (id: string, current: string) => Promise<void>;
  onToggleAdminRole: (id: string, current: string) => Promise<void>;
  onToggleBan: (id: string, current: boolean) => Promise<void>;
  onDelete: (id: string, email: string | null) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {tier === "trial" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onCancelTrial(u.id)}
          className="rounded border border-blue-500/30 px-2 py-1 text-[10px] font-bold text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
        >
          ⏱️ İptal
        </button>
      ) : tier === "free" && !u.trial_used ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onStartTrial(u.id)}
          className="rounded border border-blue-500/30 px-2 py-1 text-[10px] font-bold text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
        >
          🚀 Trial Ver
        </button>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void onTogglePremium(u.id, u.membership)}
        className="rounded border border-border px-2 py-1 text-[10px] font-bold hover:bg-primary/10 disabled:opacity-50"
      >
        {u.membership === "premium" ? "↩️ Free" : "⭐ Premium"}
      </button>

      <button
        type="button"
        disabled={busy || isMe}
        onClick={() => void onToggleAdminRole(u.id, u.role)}
        className="rounded border border-border px-2 py-1 text-[10px] font-bold hover:bg-amber-500/10 disabled:opacity-50"
      >
        {u.role === "admin" ? "↓ User" : "👑 Admin"}
      </button>

      <button
        type="button"
        disabled={busy || isMe}
        onClick={() => void onToggleBan(u.id, u.is_banned)}
        className="rounded border border-border px-2 py-1 text-[10px] font-bold hover:bg-warn/10 disabled:opacity-50"
      >
        {u.is_banned ? "✅ Aç" : "🚫 Ban"}
      </button>

      <button
        type="button"
        disabled={busy || isMe}
        onClick={() => void onDelete(u.id, u.email)}
        className="rounded border border-destructive/30 px-2 py-1 text-[10px] font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        🗑️
      </button>
    </div>
  );
}