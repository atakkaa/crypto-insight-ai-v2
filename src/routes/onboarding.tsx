// src/routes/onboarding.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [{ title: "Hoş Geldiniz — Formasyon AI" }],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const steps = [
    {
      emoji: "👋",
      title: "Formasyon AI'ya Hoş Geldiniz!",
      desc: "Kripto ve hisse senedi piyasalarını yapay zeka destekli analizlerle takip edin.",
    },
    {
      emoji: "📊",
      title: "AI Destekli Analizler",
      desc: "Her coin ve hisse için anlık formasyon tespiti, teknik analiz ve AI yorumları.",
    },
    {
      emoji: "⭐",
      title: "Favori Listesi",
      desc: "Takip etmek istediğiniz coin ve hisseleri favorilere ekleyin, tek ekrandan izleyin.",
    },
    {
      emoji: "🚀",
      title: "Hazırsınız!",
      desc: "Hemen keşfetmeye başlayın. İyi analizler!",
    },
  ] as const;

  async function finishOnboarding() {
    if (!user) {
      void navigate({ to: "/" });
      return;
    }
    setBusy(true);
    await (supabase as any)
      .from("profiles")
      .update({ has_seen_onboarding: true })
      .eq("id", user.id);

    // 🎯 TURU BAŞLATMAK İÇİN LOCALSTORAGE'A BAYRAK KOY
    window.localStorage.setItem("formasyon-ai-start-tour", "1");

    setBusy(false);
    void navigate({ to: "/" });
  }

  const current = steps[step] ?? steps[0];
  const isLast = step === steps.length - 1;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-lg p-8 text-center">
        <p className="text-6xl">{current.emoji}</p>
        <h1 className="mt-4 text-2xl font-bold">{current.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{current.desc}</p>

        <div className="mt-6 flex justify-center gap-2">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-secondary"
              }`}
            />
          ))}
        </div>

        <div className="mt-8 flex justify-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-secondary"
            >
              ← Geri
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="rounded-md bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              İleri →
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finishOnboarding()}
              className="rounded-md bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Yükleniyor..." : "🚀 Başla"}
            </button>
          )}
        </div>

        {!isLast && (
          <button
            type="button"
            onClick={() => void finishOnboarding()}
            className="mt-4 text-xs text-muted-foreground hover:text-foreground"
          >
            Atla
          </button>
        )}
      </div>
    </main>
  );
}