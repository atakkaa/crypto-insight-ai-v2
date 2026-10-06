import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { validatePassword } from "@/lib/password-validator";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Şifre Sıfırla — Formasyon AI" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecking(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // ŞİFRE GÜÇ KONTROLÜ
    const validation = validatePassword(password);
    if (!validation.isValid) {
      toast.error(validation.errors[0] ?? "Şifre kurallara uymuyor");
      return;
    }

    if (password !== passwordConfirm) {
      toast.error("Şifreler eşleşmiyor");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("🎉 Şifreniz güncellendi!");
      setTimeout(() => navigate({ to: "/auth" }), 1500);
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md p-6">
        <h1 className="text-center text-xl font-bold">🔐 Şifre Sıfırla</h1>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Yeni şifrenizi belirleyin
        </p>

        {checking ? (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Bağlantı kontrol ediliyor...
          </p>
        ) : !ready ? (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-xs text-destructive">
            <p className="font-bold">Geçersiz veya süresi geçmiş link</p>
            <Link to="/auth" className="mt-3 inline-block underline">
              Giriş sayfasına dön
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <div>
              <label className="text-xs font-bold">Yeni Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 8 karakter"
                className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
                required
                minLength={8}
              />

              {/* ŞİFRE GÜÇ GÖSTERGESİ */}
              {password.length > 0 && <PasswordStrength password={password} />}
            </div>

            <div>
              <label className="text-xs font-bold">Şifre Tekrar</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Şifreyi tekrar girin"
                className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
                required
                minLength={8}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Güncelleniyor..." : "🔑 Şifreyi Güncelle"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ==========================================================
// ŞİFRE GÜÇ GÖSTERGESİ
// ==========================================================

function PasswordStrength({ password }: { password: string }) {
  const validation = validatePassword(password);

  const colors = {
    zayıf: "bg-bear",
    orta: "bg-warn",
    güçlü: "bg-bull",
    mükemmel: "bg-primary",
  };

  return (
    <div className="mt-2 space-y-2">
      {/* Progress bar */}
      <div className="h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full transition-all ${colors[validation.strength]}`}
          style={{ width: `${validation.score}%` }}
        />
      </div>

      {/* Güç etiketi */}
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {validation.strength === "zayıf" && "🔴 Zayıf"}
        {validation.strength === "orta" && "🟡 Orta"}
        {validation.strength === "güçlü" && "🟢 Güçlü"}
        {validation.strength === "mükemmel" && "✨ Mükemmel"}
      </p>

      {/* Kurallar */}
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        <div
          className={
            validation.checks.minLength ? "text-bull" : "text-muted-foreground"
          }
        >
          {validation.checks.minLength ? "✅" : "○"} En az 8 karakter
        </div>
        <div
          className={
            validation.checks.hasUpper ? "text-bull" : "text-muted-foreground"
          }
        >
          {validation.checks.hasUpper ? "✅" : "○"} 1 büyük harf
        </div>
        <div
          className={
            validation.checks.hasLower ? "text-bull" : "text-muted-foreground"
          }
        >
          {validation.checks.hasLower ? "✅" : "○"} 1 küçük harf
        </div>
        <div
          className={
            validation.checks.hasNumber ? "text-bull" : "text-muted-foreground"
          }
        >
          {validation.checks.hasNumber ? "✅" : "○"} 1 rakam
        </div>
      </div>
    </div>
  );
}