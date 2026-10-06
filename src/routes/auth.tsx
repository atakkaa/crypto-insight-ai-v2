import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { validatePassword } from "@/lib/password-validator";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Giriş Yap — Formasyon AI Piyasa Terminali" },
      {
        name: "description",
        content:
          "Formasyon AI hesabınıza giriş yapın; favori coin ve hisselerinizi kaydedin, anlık AI grafik analizlerine erişin.",
      },
      { property: "og:title", content: "Giriş Yap — Formasyon AI" },
      {
        property: "og:description",
        content:
          "Favori coin ve hisselerinizi kaydetmek için Formasyon AI hesabınıza giriş yapın.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ==========================================
  // YENİ EKLENEN: 10 DAKİKA KİLİT MEKANİZMASI
  // ==========================================
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  // Sayfa yenilendiğinde kilidin devam etmesi için localStorage kontrolü
  useEffect(() => {
    const savedLockout = localStorage.getItem("login_lockout_until");
    const savedAttempts = localStorage.getItem("login_failed_attempts");

    if (savedLockout) {
      const lockTime = parseInt(savedLockout, 10);
      if (Date.now() < lockTime) {
        setLockoutUntil(lockTime);
      } else {
        // Süre dolmuşsa temizle
        localStorage.removeItem("login_lockout_until");
        localStorage.removeItem("login_failed_attempts");
      }
    }
    if (savedAttempts) setFailedAttempts(parseInt(savedAttempts, 10));
  }, []);
  // ==========================================

  useEffect(() => {
    if (session) void navigate({ to: "/" });
  }, [session, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    // ŞİFRE GÜÇ KONTROLÜ (sadece kayıt için)
    if (mode === "signup") {
      const validation = validatePassword(password);
      if (!validation.isValid) {
        toast.error(validation.errors[0] ?? "Şifre kurallara uymuyor");
        return;
      }
    }

    setBusy(true);

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (signUpError) {
        setError(signUpError.message);
      } else if (!data.session) {
        setMessage(
          "📧 E-postanıza doğrulama linki gönderdik. Hesabınızı aktifleştirmek için link'e tıklayın.",
        );
      }
    } else {
      // ==========================================
      // YENİ EKLENEN: GİRİŞ KONTROLÜ VE KİLİT YÖNETİMİ
      // ==========================================
      
      // 1. Kilit kontrolü
      if (lockoutUntil && Date.now() < lockoutUntil) {
        const kalanSaniye = Math.ceil((lockoutUntil - Date.now()) / 1000);
        const kalanDakika = Math.ceil(kalanSaniye / 60);
        setError(`Çok fazla hatalı deneme. Lütfen ${kalanDakika} dakika sonra tekrar deneyin.`);
        setBusy(false);
        return;
      }

      // 2. Supabase giriş denemesi
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // 3. Hatalı girişte sayacı artır
        const yeniHataSayisi = failedAttempts + 1;
        setFailedAttempts(yeniHataSayisi);
        localStorage.setItem("login_failed_attempts", yeniHataSayisi.toString());

        if (yeniHataSayisi >= 5) {
          // 4. 5 hatalı denemede 10 dakika kilitle
          const onDakikaSonra = Date.now() + 10 * 60 * 1000; // 10 dakika
          setLockoutUntil(onDakikaSonra);
          localStorage.setItem("login_lockout_until", onDakikaSonra.toString());
          setError("Çok fazla hatalı deneme yaptınız. Hesabınız 10 dakika boyunca kilitlendi.");
        } else {
          setError(`${signInError.message} (Kalan deneme hakkınız: ${5 - yeniHataSayisi})`);
        }
      } else {
        // 5. Başarılı girişte sayacı sıfırla
        setFailedAttempts(0);
        setLockoutUntil(null);
        localStorage.removeItem("login_failed_attempts");
        localStorage.removeItem("login_lockout_until");
      }
      // ==========================================
    }

    setBusy(false);
  }

  async function handleGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Google ile giriş şu an yapılamadı.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-md p-7">
        <Link
          to="/"
          className="num text-xs uppercase tracking-[0.2em] text-primary"
        >
          Formasyon AI
        </Link>
        <h1 className="mt-3 text-2xl font-bold">
          {mode === "signin" ? "Hesabınıza girin" : "Hesap oluşturun"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Favori coin ve hisselerinizi kaydedin, analizleri tek ekranda takip
          edin.
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          className="mt-6 w-full rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-muted"
        >
          Google ile devam et
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          veya e-posta ile
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="email" className="text-xs text-muted-foreground">
              E-posta
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-xs text-muted-foreground">
              Şifre
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={mode === "signup" ? 8 : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
            />

            {/* ŞİFRE GÜÇ GÖSTERGESİ (sadece kayıt modunda) */}
            {mode === "signup" && password.length > 0 && (
              <PasswordStrength password={password} />
            )}

            {/* ŞİFREMİ UNUTTUM (sadece giriş modunda) */}
            {mode === "signin" && (
              <button
                type="button"
                onClick={async () => {
                  const resetEmail = prompt(
                    "🔑 Şifre sıfırlama için email adresinizi girin:",
                  );
                  if (!resetEmail) return;
                  const { error: resetError } =
                    await supabase.auth.resetPasswordForEmail(resetEmail, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                  if (resetError) {
                    toast.error("Hata: " + resetError.message);
                  } else {
                    toast.success(
                      "✅ Şifre sıfırlama linki email'inize gönderildi!",
                    );
                  }
                }}
                className="mt-2 text-xs text-primary underline hover:no-underline"
              >
                🔑 Şifremi Unuttum
              </button>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-bull">{message}</p>}

          <button
            type="submit"
            disabled={busy || (lockoutUntil !== null && Date.now() < lockoutUntil)}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy
              ? "Gönderiliyor..."
              : lockoutUntil !== null && Date.now() < lockoutUntil
                ? `Kilitli (${Math.ceil((lockoutUntil - Date.now()) / 60000)} dk)`
                : mode === "signin"
                  ? "Giriş yap"
                  : "Kayıt ol"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setMessage(null);
            setPassword("");
          }}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? "Hesabınız yok mu? Kayıt olun"
            : "Zaten hesabınız var mı? Giriş yapın"}
        </button>

        <Link
          to="/"
          className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Girişsiz devam et
        </Link>
      </div>
    </main>
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