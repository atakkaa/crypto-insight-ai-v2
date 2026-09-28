import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type AlertRow = {
  id: string;
  market: string;
  symbol: string;
  interval: string;
  action: string;
  pattern: string | null;
  confidence: number;
  price: number | null;
  entry: number | null;
  stop: number | null;
  reason: string | null;
  read_at: string | null;
  created_at: string;
};

export function AlertBell({ onOpenSymbol }: { onOpenSymbol?: (market: string, symbol: string) => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<string>("default");
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  const alerts = useQuery({
    queryKey: ["alerts", user?.id],
    enabled: Boolean(user),
    refetchInterval: 45_000,
    queryFn: async (): Promise<AlertRow[]> => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AlertRow[];
    },
  });

  const items = alerts.data ?? [];
  const unread = items.filter((a) => !a.read_at);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const a of unread.slice(0, 3)) {
      if (notified.current.has(a.id)) continue;
      notified.current.add(a.id);
      new Notification(`${a.action} fırsatı · ${a.symbol}`, {
        body: `${a.pattern ?? "Formasyon"} · güven %${a.confidence}`,
        tag: a.id,
      });
    }
  }, [unread]);

  async function markAllRead() {
    if (unread.length === 0) return;
    await supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((a) => a.id),
      );
    void alerts.refetch();
  }

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void markAllRead();
        }}
        className="relative rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
        aria-label="Bildirimler"
      >
        🔔
        {unread.length > 0 && (
          <span className="num absolute -right-1 -top-1 rounded-full bg-bear px-1.5 text-[10px] font-bold text-bear-foreground">
            {unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="panel absolute right-0 z-30 mt-2 w-[320px] max-h-[420px] overflow-y-auto p-3 text-left">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">AI fırsat uyarıları</p>
            <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground">
              kapat
            </button>
          </div>

          {permission !== "granted" && (
            <button
              onClick={async () => {
                if (typeof Notification === "undefined") return;
                setPermission(await Notification.requestPermission());
              }}
              className="mt-2 w-full rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
            >
              Tarayıcı bildirimlerine izin ver
            </button>
          )}

          {items.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Henüz uyarı yok. Favorilerinize eklediğiniz coin ve hisseleri arka planda düzenli tarıyoruz; güçlü
              bir formasyon oluştuğunda burada göreceksiniz.
            </p>
          )}

          <ul className="mt-2 space-y-2">
            {items.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => {
                    onOpenSymbol?.(a.market, a.symbol);
                    setOpen(false);
                  }}
                  className={`w-full rounded-md border px-3 py-2 text-left text-xs hover:border-primary ${
                    a.read_at ? "border-border" : "border-primary/60 bg-secondary/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="num font-bold">{a.symbol}</span>
                    <span
                      className={`num font-bold ${a.action === "AL" ? "text-bull" : "text-bear"}`}
                    >
                      {a.action} · %{a.confidence}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{a.pattern ?? "Formasyon"}</p>
                  {a.reason && <p className="mt-1 line-clamp-3 text-muted-foreground">{a.reason}</p>}
                  <p className="num mt-1 text-[10px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("tr-TR")}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
