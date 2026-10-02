// src/routes/admin.tsx — Admin Paneli

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import {
  useAdmin,
  fetchAllUsers,
  updateUser,
  deleteProfile,
} from "@/hooks/useAdmin";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Paneli — Formasyon AI" },
      { name: "robots", content: "noindex, nofollow" },
    ],
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
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();

  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Admin değilse ana sayfaya yönlendir
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      void navigate({ to: "/" });
    }
  }, [adminLoading, isAdmin, navigate]);

  // Kullanıcıları çek
  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    void fetchAllUsers().then((data) => {
      setUsers(data);
      setLoading(false);
    });
  }, [isAdmin]);

  async function handleTogglePremium(userId: string, currentMembership: string) {
    const newMembership = currentMembership === "premium" ? "free" : "premium";
    setBusyUserId(userId);

    const ok = await updateUser(userId, { membership: newMembership });
    if (ok) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, membership: newMembership } : u,
        ),
      );
      toast.success(
        newMembership === "premium"
          ? "Kullanıcı premium yapıldı ⭐"
          : "Kullanıcı ücretsiz yapıldı",
      );
    } else {
      toast.error("İşlem başarısız");
    }
    setBusyUserId(null);
  }

  async function handleToggleBan(userId: string, currentBanned: boolean) {
    const newBanned = !currentBanned;
    setBusyUserId(userId);

    const ok = await updateUser(userId, { is_banned: newBanned });
    if (ok) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, is_banned: newBanned } : u,
        ),
      );
      toast.success(newBanned ? "Kullanıcı banlandı 🚫" : "Ban kaldırıldı");
    } else {
      toast.error("İşlem başarısız");
    }
    setBusyUserId(null);
  }

  async function handleToggleAdmin(userId: string, currentRole: string) {
    if (userId === user?.id) {
      toast.error("Kendi rolünüzü değiştiremezsiniz");
      return;
    }
    const newRole = currentRole === "admin" ? "user" : "admin";

    const confirmed = window.confirm(
      newRole === "admin"
        ? "Bu kullanıcıyı admin yapmak istediğinize emin misiniz?"
        : "Bu kullanıcının admin yetkisini kaldırmak istediğinize emin misiniz?",
    );
    if (!confirmed) return;

    setBusyUserId(userId);
    const ok = await updateUser(userId, { role: newRole });
    if (ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
      );
      toast.success(
        newRole === "admin" ? "Kullanıcı admin yapıldı 👑" : "Admin yetkisi kaldırıldı",
      );
    } else {
      toast.error("İşlem başarısız");
    }
    setBusyUserId(null);
  }

  async function handleDelete(userId: string, email: string | null) {
    if (userId === user?.id) {
      toast.error("Kendi hesabınızı silemezsiniz");
      return;
    }
    const confirmed = window.confirm(
      `${email ?? userId} kullanıcısını silmek istediğinize emin misiniz? (Bu işlem geri alınamaz)`,
    );
    if (!confirmed) return;

    setBusyUserId(userId);
    const ok = await deleteProfile(userId);
    if (ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success("Kullanıcı silindi");
    } else {
      toast.error("Silme başarısız");
    }
    setBusyUserId(null);
  }

  if (adminLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
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
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="num text-sm font-bold uppercase tracking-[0.2em] text-primary">
            Formasyon AI
          </span>
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
            <span className="rounded-md bg-primary/15 px-3 py-1.5 font-bold text-primary">
              👑 Admin
            </span>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {user?.email}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        <section className="panel p-5">
          <h1 className="text-xl font-bold">👑 Admin Paneli</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Kullanıcıları yönetin, üyelik durumlarını değiştirin, erişimleri kontrol edin.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Toplam Kullanıcı</p>
              <p className="num mt-1 text-2xl font-bold">{totalUsers}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Premium Üye</p>
              <p className="num mt-1 text-2xl font-bold text-primary">
                {premiumUsers}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Banlı</p>
              <p className="num mt-1 text-2xl font-bold text-bear">
                {bannedUsers}
              </p>
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
                void fetchAllUsers().then((data) => {
                  setUsers(data);
                  setLoading(false);
                  toast.success("Liste güncellendi");
                });
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
              Kullanıcılar ({filteredUsers.length})
            </p>
          </div>

          {loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Yükleniyor...
            </p>
          ) : filteredUsers.length === 0 ? (
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
                  {filteredUsers.map((u, idx) => {
                    const isMe = u.id === user?.id;
                    const busy = busyUserId === u.id;

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
                            <span className="text-xs">
                              {u.email ?? "—"}
                            </span>
                            {isMe && (
                              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                SEN
                              </span>
                            )}
                          </div>
                          <span className="num block text-[9px] text-muted-foreground">
                            {u.id.slice(0, 8)}...
                          </span>
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
                              onClick={() =>
                                void handleTogglePremium(u.id, u.membership)
                              }
                              className="rounded border border-border px-2 py-1 text-[10px] font-bold hover:bg-primary/10 disabled:opacity-50"
                              title="Premium durumunu değiştir"
                            >
                              {u.membership === "premium" ? "↩️ Free" : "⭐ Premium"}
                            </button>
                            <button
                              type="button"
                              disabled={busy || isMe}
                              onClick={() =>
                                void handleToggleAdmin(u.id, u.role)
                              }
                              className="rounded border border-border px-2 py-1 text-[10px] font-bold hover:bg-amber-500/10 disabled:opacity-50"
                              title="Admin rolünü değiştir"
                            >
                              {u.role === "admin" ? "↓ User" : "👑 Admin"}
                            </button>
                            <button
                              type="button"
                              disabled={busy || isMe}
                              onClick={() => void handleToggleBan(u.id, u.is_banned)}
                              className="rounded border border-border px-2 py-1 text-[10px] font-bold hover:bg-warn/10 disabled:opacity-50"
                              title="Ban durumunu değiştir"
                            >
                              {u.is_banned ? "✅ Aç" : "🚫 Ban"}
                            </button>
                            <button
                              type="button"
                              disabled={busy || isMe}
                              onClick={() => void handleDelete(u.id, u.email)}
                              className="rounded border border-destructive/30 px-2 py-1 text-[10px] font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                              title="Kullanıcıyı sil"
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