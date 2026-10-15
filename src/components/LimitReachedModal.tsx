import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

  // ESC ile kapat
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // 🔒 Body scroll kilidi
  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

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

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      style={{ touchAction: "none" }}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: "auto" }}
      >
        {/* İÇERİK */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain p-6"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
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
        </div>

        {/* AKSİYONLAR */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-secondary/30 p-4">
          {currentTier === "free" && (
            <button
              type="button"
              disabled={trialStarting}
              onClick={() => void handleStartTrial()}
              className="min-h-[44px] w-full rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {trialStarting ? "Başlatılıyor..." : "🚀 1 Hafta Ücretsiz Dene"}
            </button>
          )}

          <a
            href="/settings"
            className="flex min-h-[44px] w-full items-center justify-center rounded-md border border-border px-4 py-2.5 text-center text-sm font-bold hover:bg-secondary"
          >
            ⭐ Premium'a Geç
          </a>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] w-full rounded-md px-4 py-2 text-xs text-muted-foreground hover:bg-secondary"
          >
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}