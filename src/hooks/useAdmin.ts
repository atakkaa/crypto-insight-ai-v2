// src/hooks/useAdmin.ts — Admin kontrolü

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Profile = {
  id: string;
  email: string | null;
  role: string;
  membership: string;
  is_banned: boolean;
  created_at: string;
};

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setIsPremium(false);
      setLoading(false);
      return;
    }

    void (supabase as any)
      .from("profiles")
      .select("role, membership")
      .eq("id", user.id)
      .single()
      .then((response: { data: Profile | null; error: any }) => {
        if (response.data) {
          setIsAdmin(response.data.role === "admin");
          setIsPremium(response.data.membership === "premium");
        }
        setLoading(false);
      });
  }, [user]);

  return { isAdmin, isPremium, loading };
}

// ==========================================================
// TÜM KULLANICILARI ÇEK (SADECE ADMIN)
// ==========================================================

export async function fetchAllUsers(): Promise<Profile[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("id, email, role, membership, is_banned, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Kullanıcılar çekilemedi:", error);
      return [];
    }

    return (data ?? []) as Profile[];
  } catch (error) {
    console.error("Kullanıcılar fetch hatası:", error);
    return [];
  }
}

// ==========================================================
// KULLANICI GÜNCELLE (SADECE ADMIN)
// ==========================================================

export async function updateUser(
  userId: string,
  updates: {
    role?: string;
    membership?: string;
    is_banned?: boolean;
  },
): Promise<boolean> {
  try {
    const { error } = await (supabase as any)
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    if (error) {
      console.error("Kullanıcı güncellenemedi:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Kullanıcı update hatası:", error);
    return false;
  }
}

// ==========================================================
// KULLANICI SİL (SADECE ADMIN — SERVICE ROLE GEREK)
// ==========================================================

// Not: Auth'dan silmek için Service Role gerekir. Bu fonksiyon
// sadece profiles tablosundan siler (auth.users kalır).
export async function deleteProfile(userId: string): Promise<boolean> {
  try {
    const { error } = await (supabase as any)
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (error) {
      console.error("Profil silinemedi:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Profil silme hatası:", error);
    return false;
  }
}