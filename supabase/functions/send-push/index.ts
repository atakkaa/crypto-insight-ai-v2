// @ts-nocheck
// supabase/functions/send-push/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:test@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: {
    id: string;
    user_id: string;
    market: string;
    symbol: string;
    title: string;
    message: string;
    priority: boolean;
    severity: string;
    reason: string | null;
    event_key: string | null;
  };
  schema: string;
};

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as WebhookPayload;

    if (!payload || payload.type !== "INSERT" || payload.table !== "notifications") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const notification = payload.record;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", notification.user_id);

    if (error || !subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: error?.message || "Abonelik yok" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const title = notification.priority
      ? `⭐ ÖNCELİKLİ | ${notification.title}`
      : notification.title;

    const pushPayload = JSON.stringify({
      title,
      body: notification.message,
      tag: notification.event_key || notification.id,
      priority: notification.priority,
      data: {
        url: "/",
        symbol: notification.symbol,
        market: notification.market,
      },
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            pushPayload,
          );
          return { id: sub.id, ok: true };
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
          return { id: sub.id, ok: false, error: (err as Error).message };
        }
      }),
    );

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});