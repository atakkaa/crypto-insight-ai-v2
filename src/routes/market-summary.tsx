// src/routes/market-summary.tsx — Piyasa Özet Sayfası
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/market-summary")({
  head: () => ({
    meta: [{ title: "Piyasa Özeti — AE Analiz" }],
  }),
  component: MarketSummaryPage,
});

// ==========================================================
// TİPLER
// ==========================================================

type StatBlock = {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalReturn: number;
};

type MarketSummaryData = {
  success: boolean;
  period: "daily" | "weekly";
  periodSummary: {
    total: number;
    bullish: number;
    bearish: number;
    resolved: number;
    avgQuality: number;
    stats: StatBlock;
  };
  topPerformers: Array<{
    symbol: string;
    market: string;
    total: number;
    wins: number;
    winRate: number;
    totalReturn: number;
  }>;
  worstPerformers: Array<{
    symbol: string;
    market: string;
    total: number;
    wins: number;
    winRate: number;
    totalReturn: number;
  }>;
  topFormations: Array<{
    name: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    totalReturn: number;
  }>;
  marketSummary: Array<{
    market: string;
    bullish: number;
    bearish: number;
    total: number;
    trend: "boğa" | "ayı" | "kararsız";
    bullishPercent: number;
  }>;
  fearGreed: {
    value: number;
    classification: string;
    emoji: string;
  } | null;
  timestamp: string;
};

const MARKET_LABELS: Record<string, string> = {
  crypto: "KRİPTO",
  bist: "BIST",
  us: "ABD",
  asia: "ASYA",
  europe: "AVRUPA",
};

// ==========================================================
// SAYFA
// ==========================================================

function MarketSummaryPage() {
  const [data, setData] = useState<MarketSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/market-summary?period=${period}`)
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) {
          setError(json.error ?? "Yüklenemedi");
        } else {
          setData(json);
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Bağlantı hatası");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [period]);

  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-3 sm:space-y-6 sm:p-4">
      {/* BAŞLIK */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">📊 Piyasa Özeti</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Günlük ve haftalık piyasa performansı
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-background p-0.5 sm:p-1">
            <button
              type="button"
              onClick={() => setPeriod("daily")}
              className={`rounded px-2.5 py-1.5 text-[11px] font-bold transition-colors sm:px-3 sm:text-xs ${
                period === "daily"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              📅 Günlük
            </button>
            <button
              type="button"
              onClick={() => setPeriod("weekly")}
              className={`rounded px-2.5 py-1.5 text-[11px] font-bold transition-colors sm:px-3 sm:text-xs ${
                period === "weekly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              📆 Haftalık
            </button>
          </div>
          <Link
            to="/"
            className="rounded-md border border-border px-2.5 py-1.5 text-[11px] hover:bg-secondary sm:px-3 sm:text-xs"
          >
            ← Geri
          </Link>
        </div>
      </div>

      {/* HATA */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 sm:p-4">
          <p className="text-sm font-bold text-destructive">⚠️ {error}</p>
        </div>
      )}

      {/* YÜKLENİYOR */}
      {loading && !data && (
        <div className="flex h-40 items-center justify-center">
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        </div>
      )}

      {/* İÇERİK */}
      {data && (
        <>
          {/* 1. ÖZET */}
          <Section
            title={`${period === "daily" ? "Son 24 Saat" : "Son 7 Gün"} Özeti`}
            emoji="⏱️"
          >
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              <StatCard
                title="Toplam Sinyal"
                value={data.periodSummary.total.toString()}
                icon="📈"
              />
              <StatCard
                title="AL / SAT"
                value={`${data.periodSummary.bullish} / ${data.periodSummary.bearish}`}
                icon="🎯"
                color="text-blue-400"
              />
              <StatCard
                title="Sonuçlanmış"
                value={data.periodSummary.resolved.toString()}
                icon="✅"
                color="text-bull"
              />
              <StatCard
                title="Ort. Kalite"
                value={`${data.periodSummary.avgQuality}/100`}
                icon="⭐"
                color={
                  data.periodSummary.avgQuality >= 75
                    ? "text-bull"
                    : data.periodSummary.avgQuality >= 60
                      ? "text-amber-500"
                      : "text-bear"
                }
              />
            </div>

            {data.periodSummary.resolved > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
                <StatCard
                  title="Başarı Oranı"
                  value={`${data.periodSummary.stats.winRate}%`}
                  icon="🎯"
                  color={
                    data.periodSummary.stats.winRate >= 60
                      ? "text-bull"
                      : data.periodSummary.stats.winRate >= 40
                        ? "text-amber-500"
                        : "text-bear"
                  }
                />
                <StatCard
                  title="Ort. Kazanç"
                  value={`+${data.periodSummary.stats.avgWin}%`}
                  icon="🟢"
                  color="text-bull"
                />
                <StatCard
                  title="Toplam Getiri"
                  value={`${
                    data.periodSummary.stats.totalReturn >= 0 ? "+" : ""
                  }${data.periodSummary.stats.totalReturn}%`}
                  icon="💰"
                  color={
                    data.periodSummary.stats.totalReturn >= 0
                      ? "text-bull"
                      : "text-bear"
                  }
                />
              </div>
            )}
          </Section>

          {/* 2. PİYASA DURUMU */}
          {data.marketSummary.length > 0 && (
            <Section title="Piyasa Durumu" emoji="🌍">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
                {data.marketSummary.map((m) => (
                  <div
                    key={m.market}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold sm:text-sm">
                        {MARKET_LABELS[m.market] ?? m.market}
                      </p>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          m.trend === "boğa"
                            ? "bg-bull/15 text-bull"
                            : m.trend === "ayı"
                              ? "bg-bear/15 text-bear"
                              : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {m.trend === "boğa"
                          ? "🟢 BOĞA"
                          : m.trend === "ayı"
                            ? "🔴 AYI"
                            : "⚪ KARARSIZ"}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-3 text-xs">
                      <span className="text-bull">🟢 {m.bullish}</span>
                      <span className="text-bear">🔴 {m.bearish}</span>
                      <span className="text-muted-foreground">
                        Toplam: {m.total}
                      </span>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-bull"
                        style={{ width: `${m.bullishPercent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      %{m.bullishPercent} AL eğilimli
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 3. FEAR & GREED */}
          {data.fearGreed && (
            <Section title="Piyasa Duyarlılığı" emoji="😱">
              <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-4xl sm:text-5xl">
                      {data.fearGreed.emoji}
                    </span>
                    <div>
                      <p className="text-2xl font-bold sm:text-3xl">
                        {data.fearGreed.value}
                      </p>
                      <p className="text-xs font-bold text-muted-foreground sm:text-sm">
                        {data.fearGreed.classification}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="relative h-3 w-full overflow-hidden rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500">
                      <div
                        className="absolute top-0 h-full w-1 bg-white shadow-lg"
                        style={{ left: `${data.fearGreed.value}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[9px] text-muted-foreground sm:text-[10px]">
                      <span>Aşırı Korku</span>
                      <span>Nötr</span>
                      <span>Aşırı Açgözlülük</span>
                    </div>
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* 4. EN İYİ / KÖTÜ PERFORMANS */}
          {(data.topPerformers.length > 0 ||
            data.worstPerformers.length > 0) && (
            <Section title="En İyi / Kötü Performans" emoji="🏆">
              <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
                {/* EN İYİ */}
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-bull sm:text-xs">
                    🏆 En İyi (Son 7 Gün)
                  </p>
                  {data.topPerformers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Yeterli veri yok
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.topPerformers.map((p, i) => (
                        <PerformerRow
                          key={`top-${p.market}-${p.symbol}`}
                          index={i + 1}
                          symbol={p.symbol}
                          market={p.market}
                          totalReturn={p.totalReturn}
                          winRate={p.winRate}
                          total={p.total}
                          variant="top"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* EN KÖTÜ */}
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-bear sm:text-xs">
                    📉 En Kötü (Son 7 Gün)
                  </p>
                  {data.worstPerformers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Yeterli veri yok
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.worstPerformers.map((p, i) => (
                        <PerformerRow
                          key={`worst-${p.market}-${p.symbol}`}
                          index={i + 1}
                          symbol={p.symbol}
                          market={p.market}
                          totalReturn={p.totalReturn}
                          winRate={p.winRate}
                          total={p.total}
                          variant="worst"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* 5. EN AKTİF FORMASYONLAR */}
          {data.topFormations.length > 0 && (
            <Section title="En Aktif Formasyonlar" emoji="📋">
              <div className="-mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4">
                <table className="w-full min-w-[500px] text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-bold text-muted-foreground">
                        Formasyon
                      </th>
                      <th className="px-3 py-2 text-center font-bold text-muted-foreground">
                        Sinyal
                      </th>
                      <th className="px-3 py-2 text-center font-bold text-muted-foreground">
                        Başarı %
                      </th>
                      <th className="px-3 py-2 text-center font-bold text-muted-foreground">
                        Getiri
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topFormations.map((f) => (
                      <tr
                        key={f.name}
                        className="border-b border-border/50 hover:bg-secondary/20"
                      >
                        <td className="px-3 py-2 font-bold">{f.name}</td>
                        <td className="px-3 py-2 text-center num">
                          {f.total}
                        </td>
                        <td className="px-3 py-2 text-center num">
                          <span
                            className={
                              f.winRate >= 60
                                ? "text-bull font-bold"
                                : f.winRate >= 40
                                  ? "text-amber-500 font-bold"
                                  : "text-bear font-bold"
                            }
                          >
                            {f.winRate}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center num">
                          <span
                            className={
                              f.totalReturn >= 0
                                ? "text-bull font-bold"
                                : "text-bear font-bold"
                            }
                          >
                            {f.totalReturn >= 0 ? "+" : ""}
                            {f.totalReturn}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// ==========================================================
// BÖLÜM
// ==========================================================

function Section({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <h2 className="mb-3 text-xs font-bold sm:mb-4 sm:text-sm">
        {emoji} {title}
      </h2>
      {children}
    </section>
  );
}

// ==========================================================
// STAT KART
// ==========================================================

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground sm:text-[10px]">
          {title}
        </p>
        <span className="text-sm sm:text-base">{icon}</span>
      </div>
      <p
        className={`mt-1.5 text-lg font-bold sm:mt-2 sm:text-xl ${
          color ?? "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ==========================================================
// PERFORMER SATIR
// ==========================================================

function PerformerRow({
  index,
  symbol,
  market,
  totalReturn,
  winRate,
  total,
  variant,
}: {
  index: number;
  symbol: string;
  market: string;
  totalReturn: number;
  winRate: number;
  total: number;
  variant: "top" | "worst";
}) {
  const isPositive = totalReturn >= 0;
  const cleanSymbol = symbol
    .replace("USDT", "")
    .replace(
      /\.(IS|US|T|KS|HK|NS|DE|PA|L|MI|MC|AS|ST|OL|HE|SW|CO|V)$/,
      "",
    );

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2 sm:p-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold sm:h-6 sm:w-6 ${
            variant === "top"
              ? "bg-bull/15 text-bull"
              : "bg-bear/15 text-bear"
          }`}
        >
          {index}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold">{cleanSymbol}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {MARKET_LABELS[market] ?? market} · {total} · %{winRate}
          </p>
        </div>
      </div>
      <span
        className={`shrink-0 text-xs font-bold num sm:text-sm ${
          isPositive ? "text-bull" : "text-bear"
        }`}
      >
        {isPositive ? "+" : ""}
        {totalReturn}%
      </span>
    </div>
  );
}