import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UserTier = "admin" | "premium" | "trial" | "free";

export type TierLimits = {
  favorites: number;
  priority: number;
  newsDepth: number;
  hasMTF: boolean;
  hasFearGreed: boolean;
  shortTermTracking: number; // <-- YENİ: Kısa vadeli analiz yapılabilecek varlık sayısı
};

export type TierInfo = {
  tier: UserTier;
  label: string;
  emoji: string;
  color: string;
  limits: TierLimits;
  trialEndsAt: string | undefined;
  trialDaysLeft: number | undefined;
  isTrialExpiringSoon: boolean | undefined;
};

const TIER_LIMITS: Record<UserTier, TierLimits> = {
  admin: { favorites: 999, priority: 999, newsDepth: 20, hasMTF: true, hasFearGreed: true, shortTermTracking: 999 },
  premium: { favorites: 999, priority: 999, newsDepth: 20, hasMTF: true, hasFearGreed: true, shortTermTracking: 999 },
  trial: { favorites: 10, priority: 3, newsDepth: 15, hasMTF: true, hasFearGreed: true, shortTermTracking: 999 },
  free: { favorites: 5, priority: 0, newsDepth: 10, hasMTF: false, hasFearGreed: false, shortTermTracking: 2 },
};

const TIER_META: Record<UserTier, { label: string; emoji: string; color: string }> = {
  admin: { label: "Admin", emoji: "👑", color: "text-amber-500" },
  premium: { label: "Premium", emoji: "⭐", color: "text-primary" },
  trial: { label: "Deneme", emoji: "⏱️", color: "text-blue-400" },
  free: { label: "Free", emoji: "🆓", color: "text-muted-foreground" },
};

export function useUserTier() {
  const { user } = useAuth();
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    void (supabase as any)
      .from("profiles")
      .select("role, membership, trial_ends_at, trial_used")
      .eq("id", user.id)
      .single()
      .then((response: { data: any; error: any }) => {
        if (!response.data) {
          setLoading(false);
          return;
        }

        const role = String(response.data.role ?? "user");
        const membership = String(response.data.membership ?? "free");
        const trialEndsAt: string | null = response.data.trial_ends_at ?? null;

        let tier: UserTier = "free";

        if (role === "admin") {
          tier = "admin";
        } else if (membership === "premium") {
          tier = "premium";
        } else if (membership === "trial" && trialEndsAt) {
          const isExpired = new Date(trialEndsAt).getTime() < Date.now();
          if (!isExpired) {
            tier = "trial";
          }
        }

        const meta = TIER_META[tier];
        let trialDaysLeft: number | undefined = undefined;
        let isTrialExpiringSoon: boolean | undefined = undefined;

        if (tier === "trial" && trialEndsAt) {
          const msLeft = new Date(trialEndsAt).getTime() - Date.now();
          trialDaysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
          isTrialExpiringSoon = trialDaysLeft <= 2;
        }

        setTierInfo({
          tier,
          label: meta.label,
          emoji: meta.emoji,
          color: meta.color,
          limits: TIER_LIMITS[tier],
          trialEndsAt: trialEndsAt ?? undefined,
          trialDaysLeft,
          isTrialExpiringSoon,
        });
        setLoading(false);
      });
  }, [user]);

  return { tierInfo, loading };
}

// ============================================================
// TRIAL BAŞLATMA
// ============================================================

export async function startTrial(userId: string): Promise<{
  success: boolean;
  message: string;
  trialEndsAt: string | undefined;
}> {
  try {
    const res = await fetch("/api/start-trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = (await res.json()) as {
      success: boolean;
      error?: string;
      message?: string;
      trialEndsAt?: string;
    };
    if (!res.ok) {
      return {
        success: false,
        message: data.error ?? "Hata oluştu",
        trialEndsAt: undefined,
      };
    }
    return {
      success: true,
      message: data.message ?? "Deneme başladı",
      trialEndsAt: data.trialEndsAt,
    };
  } catch {
    return {
      success: false,
      message: "Bağlantı hatası",
      trialEndsAt: undefined,
    };
  }
}