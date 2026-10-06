import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { startTrial } from "@/hooks/useUserTier";

type Props = {
  open: boolean;
  onClose: () => void;
  limitType: "favorites" | "priority" | "short_term";
  currentTier: string;
  currentLimit: number;
};

export function LimitReachedModal({
  open,
  onClose,
  limitType,
  currentTier,
  currentLimit,
}: Props) {
  const { user } = useAuth();
  const [trialStarting, setTrialStarting] = useState(false);

  if (!open) return null;

  const title =
    limitType === "favorites"
      ? "Favori limiti doldu"
      : limitType === "priority"
        ? "Öncelikli varlık limiti doldu"
        : "Kısa vadeli analiz limiti doldu";

  const description =
    limitType === "favorites"
      ? `Free üyeler en fazla ${currentLimit} favori ekleyebilir. Premium üyeler sınırsız favori ekler.`
      : limitType === "priority"
        ? currentLimit === 0
          ? "Öncelikli varlıklar Premium'a özeldir. Deneme başlatarak 3 öncelikli varlık ekleyebilirsiniz."
          : `Free üyeler en fazla ${currentLimit} öncelikli varlık ekleyebilir. Premium üyeler sınırsız ekler.`
        : `Free üyeler en fazla ${currentLimit} farklı varlık için kısa vadeli analiz yapabilir. Premium üyeler sınırsız kısa vadeli analiz yapar.`;

  async function handleStartTrial() {
    if (!user) {
      toast.error("Önce giriş yapın");
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
    } catch {
      toast.error("Bağlantı hatası");
    }
    setTrialStarting(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
            <span className="text-3xl">🔒</span>
          </div>
          <h2 className="mt-3 text-lg font-bold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {currentTier === "free" && (
            <p className="mt-2 text-xs text-amber-500">
              {limitType === "short_term"
                ? "💡 1 haftalık ücretsiz deneme başlatarak sınırsız kısa vadeli analiz yapabilirsiniz"
                : "💡 1 haftalık ücretsiz deneme başlatarak limitleri artırabilirsiniz"}
            </p>
          )}
        </div>

        <div className="mt-5 space-y-2">
          {currentTier === "free" && (
            <button
              type="button"
              disabled={trialStarting}
              onClick={() => void handleStartTrial()}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {trialStarting ? "Başlatılıyor..." : "🚀 1 Hafta Ücretsiz Dene"}
            </button>
          )}

          <a
            href="/settings"
            className="block w-full rounded-md border border-border px-4 py-2.5 text-center text-sm font-bold hover:bg-secondary"
          >
            ⭐ Premium'a Geç
          </a>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md px-4 py-2 text-xs text-muted-foreground hover:bg-secondary"
          >
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );
}