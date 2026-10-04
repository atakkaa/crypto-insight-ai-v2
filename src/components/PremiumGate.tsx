import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { useUserTier, startTrial } from "@/hooks/useUserTier";

type Props = {
  feature: "mtf" | "fear_greed" | "news_depth" | "priority" | "favorites";
  title?: string;
  description?: string;
  children?: React.ReactNode;
  /** Kilitliyse ne gösterilecek? (children yerine) */
  fallback?: React.ReactNode;
};

const FEATURE_INFO: Record<
  Props["feature"],
  { title: string; description: string; icon: string }
> = {
  mtf: {
    title: "Çoklu Zaman Dilimi (MTF)",
    description:
      "Aynı varlığı 1 saatlik, 4 saatlik ve günlük zaman dilimlerinde birlikte analiz eder. Daha güvenilir sinyal üretir.",
    icon: "📊",
  },
  fear_greed: {
    title: "Fear & Greed Endeksi",
    description:
      "Piyasadaki korku ve açgözlülük seviyesini gösterir. Kontra-yatırım kararları için kritik bilgi.",
    icon: "😱",
  },
  news_depth: {
    title: "Detaylı Haber Analizi",
    description:
      "Bir varlık için 20 haber kaynağını analiz eder. Free üyeler sadece 10 haber görür.",
    icon: "📰",
  },
  priority: {
    title: "Öncelikli Varlıklar",
    description:
      "Önem verdiğiniz hisse/kriptoları 'öncelikli' olarak işaretleyin. Bu varlıklar için ekstra hassas bildirim alırsınız.",
    icon: "⭐",
  },
  favorites: {
    title: "Sınırsız Favori",
    description:
      "Sınırsız favori ekleyin. Free üyeler en fazla 5 favori ekleyebilir.",
    icon: "💛",
  },
};

export function PremiumGate({
  feature,
  title,
  description,
  children,
  fallback,
}: Props) {
  const { user } = useAuth();
  const { tierInfo } = useUserTier();
  const [trialStarting, setTrialStarting] = useState(false);

  // Tier yükleniyorsa veya info yoksa → göster (default: açık)
  if (!tierInfo) return <>{children}</>;

  // Kilitli mi?
  const isLocked = (() => {
    switch (feature) {
      case "mtf":
        return !tierInfo.limits.hasMTF;
      case "fear_greed":
        return !tierInfo.limits.hasFearGreed;
      case "news_depth":
        return tierInfo.limits.newsDepth < 15;
      case "priority":
        return tierInfo.limits.priority === 0;
      case "favorites":
        return tierInfo.limits.favorites < 999;
      default:
        return false;
    }
  })();

  // Kilitli değilse → children göster
  if (!isLocked) return <>{children}</>;

  // Kilitli ise → premium gate göster
  if (fallback) return <>{fallback}</>;

  const info = FEATURE_INFO[feature];
  const displayTitle = title ?? info.title;
  const displayDesc = description ?? info.description;

  async function handleStartTrial() {
    if (!user) {
      toast.error("Önce giriş yapmalısınız");
      return;
    }
    setTrialStarting(true);
    const result = await startTrial(user.id);
    setTrialStarting(false);
    if (result.success) {
      toast.success("🎉 7 günlük deneme başladı!");
      setTimeout(() => window.location.reload(), 1000);
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="panel relative overflow-hidden p-6">
      {/* Blur'lu arka plan */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center opacity-10">
        <span className="text-[120px]">{info.icon}</span>
      </div>

      {/* İçerik */}
      <div className="relative z-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
          <span className="text-3xl">{info.icon}</span>
        </div>

        <h3 className="mt-3 text-lg font-bold">{displayTitle}</h3>
        <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
          {displayDesc}
        </p>

        <div className="mx-auto mt-4 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-bold text-amber-500">
          ⭐ BU ÖZELLİK PREMIUM'A ÖZEL
        </div>

        <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          {!user?.id ? (
            <a
              href="/auth"
              className="rounded-md border border-border px-4 py-2 text-xs font-bold hover:bg-secondary"
            >
              Giriş Yap
            </a>
          ) : (
            <>
              <button
                type="button"
                disabled={trialStarting}
                onClick={() => void handleStartTrial()}
                className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {trialStarting ? "Başlatılıyor..." : "🚀 1 Hafta Ücretsiz Dene"}
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/settings";
                }}
                className="rounded-md border border-border px-4 py-2 text-xs font-bold hover:bg-secondary"
              >
                ⭐ Premium'a Geç
              </button>
            </>
          )}
        </div>

        <p className="mt-3 text-[10px] text-muted-foreground">
          Deneme süresi 7 gün — istediğiniz zaman iptal edebilirsiniz
        </p>
      </div>
    </div>
  );
}