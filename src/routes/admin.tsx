// src/routes/admin.tsx — Admin Paneli

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin Paneli — Formasyon AI" }],
  }),
  component: AdminPage,
});

type Profile = {
  id: string;
  email: string | null;
  role: string;
  membership: string;
  is_banned: boolean;
  created_at: string;
};

function AdminPage() {
  const { user } = useAuth();

  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // 1. Kullanıcı yoksa ana sayfaya git
  useEffect(() => {
    if (!user) {
      window.location.href = "/";
    }
  }, [user]);

  // 2. Admin kontrolü ve kullanıcı listesi
  useEffect(() => {
    if (!user) return;

    void (async () => {
      // Admin mi?
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

      // Admin ise tüm kullanıcıları çek
      const { data: allUsers, error: usersError } = await (supabase as any)
        .from("profiles")
        .select("id, email, role, membership, is_banned, created_at")
        .order("created_at", { ascending: false });

      if (usersError) {
        console.error("Kullanıcılar çekilemedi:", usersError);
      } else {
        setUsers((allUsers ?? []) as Profile[]);
      }
      setLoading(false);
    })();
  }, [user]);

  // 3. Admin değilse ana sayfaya git
  useEffect(() => {
    if (isAdmin === false) {
      window.location.href = "/";
    }
  }, [isAdmin]);

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
      toast.success(newVal === "premium" ? "⭐ Premium yapıldı" : "Free yapıldı");
    }
    setBusyUserId(null);
  }

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

  async function toggleAdminRole(userId: string, current: string) {
    if (userId === user?.id) {
      toast.error("Kendi rolünüzü değiştiremezsiniz");
      return;
    }
    if (!window.confirm("Bu kullanıcının rolünü değiştirmek istiyor musunuz?")) {
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

  // Yükleniyor
  if (loading || isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (u.email ?? "").toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  const totalUsers = users.length;
  const premiumUsers = users.filter((u) => u.membership === "premium").length;
  const bannedUsers = users.filter((u) => u.is_banned).length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/" className="num text-sm font-bold uppercase tracking-[0.2em] text-primary">
            Formasyon AI
          </Link>
          <nav className="flex gap-2 text-xs">
            <Link to="/" className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
              Grafik
            </Link>
            <Link to="/coins" className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
              Liste
            </Link>
            <span className="rounded-md bg-primary/15 px-3 py-1.5 font-bold text-primary">
              👑 Admin
            </span>
          </nav>
          <div className="ml-auto text-xs text-muted-foreground">{user?.email}</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        <section className="panel p-5">
          <h1 className="text-xl font-bold">👑 Admin Paneli</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Kullanıcıları yönetin, üyelik ve erişim durumlarını kontrol edin.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Toplam Kullanıcı</p>
              <p className="num mt-1 text-2xl font-bold">{totalUsers}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Premium Üye</p>
              <p className="num mt-1 text-2xl font-bold text-primary">{premiumUsers}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Banlı</p>
              <p className="num mt-1 text-2xl font-bold text-bear">{bannedUsers}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="E-posta veya ID ara..."
              className="min-w-[240px] flex-1 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
            />
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void (async () => {
                  const { data } = await (supabase as any)
                    .from("profiles")
                    .select("id, email, role, membership, is_banned, created_at")
                    .order("created_at", { ascending: false });
                  setUsers((data ?? []) as Profile[]);
                  setLoading(false);
                })();
              }}
              className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"
            >
              🔄 Yenile
            </button>
          </div>
        </section>

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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary/30">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">E-posta</th>
                    <th className="px-3 py-2">Rol</th>
                    <th className="px-3 py-2">Üyelik</th>
                    <th className="px-3 py-2">Durum</th>
                    <th className="px-3 py-2">Kayıt</th>
                    <th className="px-3 py-2 text-right">Aksiyonlar</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, idx) => {
                    const isMe = u.id === user?.id;
                    const busy = busyUserId === u.id;

                    return (
                      <tr
                        key={u.id}
                        className={`border-b border-border hover:bg-secondary/20 ${
                          isMe ? "bg-primary/5" : ""
                        }`}
                      >
                        <td className="num px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
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
                          {u.membership === "premium" ? (
                            <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                              ⭐ PREMIUM
                            </span>
                          ) : (
                            <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold">
                              FREE
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
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void togglePremium(u.id, u.membership)}
                              className="rounded border border-border px-2 py-1 text-[10px] font-bold hover:bg-primary/10 disabled:opacity-50"
                            >
                              {u.membership === "premium" ? "↩️ Free" : "⭐ Premium"}
                            </button>
                            <button
                              type="button"
                              disabled={busy || isMe}
                              onClick={() => void toggleAdminRole(u.id, u.role)}
                              className="rounded border border-border px-2 py-1 text-[10px] font-bold hover:bg-amber-500/10 disabled:opacity-50"
                            >
                              {u.role === "admin" ? "↓ User" : "👑 Admin"}
                            </button>
                            <button
                              type="button"
                              disabled={busy || isMe}
                              onClick={() => void toggleBan(u.id, u.is_banned)}
                              className="rounded border border-border px-2 py-1 text-[10px] font-bold hover:bg-warn/10 disabled:opacity-50"
                            >
                              {u.is_banned ? "✅ Aç" : "🚫 Ban"}
                            </button>
                            <button
                              type="button"
                              disabled={busy || isMe}
                              onClick={() => void deleteUser(u.id, u.email)}
                              className="rounded border border-destructive/30 px-2 py-1 text-[10px] font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="pb-8 text-center text-[11px] text-muted-foreground">
          Bu sayfa sadece admin kullanıcılar tarafından erişilebilir.
        </p>
      </main>
    </div>
  );
}