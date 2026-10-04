import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type DndRange = {
  start: string; // "22:00"
  end: string;   // "08:00"
};

export type DndSettings = {
  dnd_enabled: boolean;
  dnd_ranges: DndRange[];
  dnd_timezone: string;
  dnd_allow_10_percent: boolean;
  dnd_allow_priority_critical: boolean;
  dnd_allow_score_90: boolean;
  dnd_allow_favorite: boolean;
  dnd_allow_tier1_news: boolean;
  dnd_daily_summary: boolean;
};

const DEFAULT_SETTINGS: DndSettings = {
  dnd_enabled: false,
  dnd_ranges: [{ start: "22:00", end: "08:00" }],
  dnd_timezone: "Europe/Istanbul",
  dnd_allow_10_percent: true,
  dnd_allow_priority_critical: true,
  dnd_allow_score_90: true,
  dnd_allow_favorite: false,
  dnd_allow_tier1_news: true,
  dnd_daily_summary: true,
};

export function useDndSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<DndSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // --- Yükle ---
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    void (supabase as any)
      .from("profiles")
      .select(
        "dnd_enabled, dnd_ranges, dnd_timezone, dnd_allow_10_percent, dnd_allow_priority_critical, dnd_allow_score_90, dnd_allow_favorite, dnd_allow_tier1_news, dnd_daily_summary",
      )
      .eq("id", user.id)
      .single()
      .then((response: { data: any; error: any }) => {
        if (response.data) {
          setSettings({
            dnd_enabled: response.data.dnd_enabled ?? false,
            dnd_ranges: response.data.dnd_ranges ?? [{ start: "22:00", end: "08:00" }],
            dnd_timezone: response.data.dnd_timezone ?? "Europe/Istanbul",
            dnd_allow_10_percent: response.data.dnd_allow_10_percent ?? true,
            dnd_allow_priority_critical: response.data.dnd_allow_priority_critical ?? true,
            dnd_allow_score_90: response.data.dnd_allow_score_90 ?? true,
            dnd_allow_favorite: response.data.dnd_allow_favorite ?? false,
            dnd_allow_tier1_news: response.data.dnd_allow_tier1_news ?? true,
            dnd_daily_summary: response.data.dnd_daily_summary ?? true,
          });
        }
        setLoading(false);
      });
  }, [user]);

  // --- Kaydet ---
  async function save(newSettings: DndSettings): Promise<boolean> {
    if (!user) return false;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update(newSettings)
        .eq("id", user.id);

      if (error) {
        console.error("DND kaydetme hatası:", error);
        setSaving(false);
        return false;
      }
      setSettings(newSettings);
      setSaving(false);
      return true;
    } catch (err) {
      console.error("DND kaydetme hatası:", err);
      setSaving(false);
      return false;
    }
  }

  return { settings, setSettings, loading, saving, save };
}