// src/routes/stats.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { MobileNav } from "@/components/MobileNav";
import { SkeletonList, SkeletonStatGrid } from "@/components/Skeleton";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/stats")({
  component: StatsPage,
});

// ==========================================================
// TİPLER
// ==========================================================

type TimeSeriesPoint = {
  period: string;
  label: string;
  winRate: number;
  total: number;
  wins: number;
  losses: number;
};

type StatBlock = {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalReturn: number;
  expectancy: number;
};

type StatsData = {
  success: boolean;
  tier: string;
  filters: {
    days: number;
    formations: string[];
    markets: string[];
    symbol: string | null;
    bias: string | null;
    signalType: string | null;
  };
  filterOptions: {
    formations: string[];
    markets: string[];
    symbols: string[];
    biases: string[];
  };
  general: StatBlock;
  byFormation: Array<{ name: string } & StatBlock>;
  bySymbol: Array<{
    symbol: string;
    market: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  }>;
  byMarket: Array<{
    market: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  }>;
  byBias: Array<{
    bias: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  }>;
  signalTypes: {
    long: StatBlock;
    short: StatBlock;
    multi: StatBlock;
    all: StatBlock;
  };
  timeSeries: {
    long: TimeSeriesPoint[];
    short: TimeSeriesPoint[];
    multi: TimeSeriesPoint[];
    all: TimeSeriesPoint[];
  };
};

type FilterState = {
  days: number;
  formations: string[];
  markets: string[];
  symbol: string;
  bias: string;
};

type TabKey = "long" | "short" | "multi" | "all" | "compare";

const COLORS = {
  bull: "#22c55e",
  bear: "#ef4444",
  neutral: "#a855f7",
  amber: "#f59e0b",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  teal: "#14b8a6",
};

const MARKET_LABELS: Record<string, string> = {
  crypto: "KRİPTO",
  bist: "BIST",
  us: "ABD",
  asia: "ASYA",
  europe: "AVRUPA",
  kripto: "KRİPTO",
};

const BIAS_LABELS: Record<string, string> = {
  yükseliş: "AL",
  düşüş: "SAT",
  nötr: "Nötr",
};

function marketLabel(key: string): string {
  return MARKET_LABELS[key] ?? key.toUpperCase();
}

function biasLabel(key: string): string {
  return BIAS_LABELS[key] ?? key;
}

// ==========================================================
// ANA SAYFA
// ==========================================================

function StatsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    days: 30,
    formations: [],
    markets: [],
    symbol: "",
    bias: "",
  });

  const [panelOpen, setPanelOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("days", String(filters.days));
    for (const f of filters.formations) params.append("formation", f);
    for (const m of filters.markets) params.append("market", m);
    if (filters.symbol) params.set("symbol", filters.symbol);
    if (filters.bias) params.set("bias", filters.bias);

    fetch(`/api/formation-stats?${params.toString()}`, {
      headers: { "x-user-id": user.id },
    })
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) {
          setError(json.message ?? json.error ?? "Hata");
        } else {
          setData(json);
        }
      })
      .catch((err) => {
        console.error(err);
        setError("İstatistikler yüklenemedi");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user, filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.formations.length > 0) count += filters.formations.length;
    if (filters.markets.length > 0) count += filters.markets.length;
    if (filters.symbol) count += 1;
    if (filters.bias) count += 1;
    return count;
  }, [filters]);

  function toggleFormation(value: string) {
    setFilters((prev) => ({
      ...prev,
      formations: prev.formations.includes(value)
        ? prev.formations.filter((v) => v !== value)
        : [...prev.formations, value],
    }));
  }

  function toggleMarket(value: string) {
    setFilters((prev) => ({
      ...prev,
      markets: prev.markets.includes(value)
        ? prev.markets.filter((v) => v !== value)
        : [...prev.markets, value],
    }));
  }

  function clearAllFilters() {
    setFilters({
      days: 30,
      formations: [],
      markets: [],
      symbol: "",
      bias: "",
    });
    setSymbolSearch("");
  }

  function removeFormation(value: string) {
    setFilters((prev) => ({
      ...prev,
      formations: prev.formations.filter((v) => v !== value),
    }));
  }

  function removeMarket(value: string) {
    setFilters((prev) => ({
      ...prev,
      markets: prev.markets.filter((v) => v !== value),
    }));
  }

  async function downloadCsv() {
    if (!user || downloadingCsv) return;

    setDownloadingCsv(true);
    try {
      const params = new URLSearchParams();
      params.set("days", String(filters.days));
      params.set("format", "csv");
      for (const f of filters.formations) params.append("formation", f);
      for (const m of filters.markets) params.append("market", m);
      if (filters.symbol) params.set("symbol", filters.symbol);
      if (filters.bias) params.set("bias", filters.bias);

      const res = await fetch(`/api/formation-stats?${params.toString()}`, {
        headers: { "x-user-id": user.id },
      });

      if (!res.ok) {
        throw new Error(`CSV indirilemedi (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `formasyon-istatistikleri-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV indirilemedi:", err);
      alert("CSV indirilemedi. Lütfen tekrar deneyin.");
    } finally {
      setDownloadingCsv(false);
    }
  }

  // Giriş yok
  if (!user) {
    return (
      <div className="min-h-screen pb-24 lg:pb-0">
        <div className="lg:hidden">
          <MobileNav onOpenSymbol={() => {}} />
        </div>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="text-center">
            <p className="text-lg font-bold">🔒 Giriş Yapın</p>
            <p className="mt-2 text-sm text-muted-foreground">
              İstatistikleri görmek için giriş yapın.
            </p>
            <Link
              to="/auth"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Giriş Yap
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Yükleniyor — SKELETON
  if (loading && !data) {
    return (
      <div className="min-h-screen pb-24 lg:pb-0">
        <div className="lg:hidden">
          <MobileNav onOpenSymbol={() => {}} />
        </div>

        <main className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
          {/* Başlık iskeleti */}
          <section className="panel p-4 sm:p-5">
            <div className="animate-pulse h-6 w-48 rounded-md bg-secondary/60" />
            <div className="animate-pulse mt-2 h-3 w-72 rounded-md bg-secondary/60" />
            <div className="mt-4 flex gap-2">
              <div className="animate-pulse h-10 w-24 rounded-md bg-secondary/60" />
              <div className="animate-pulse h-10 w-24 rounded-md bg-secondary/60" />
              <div className="animate-pulse h-10 w-24 rounded-md bg-secondary/60" />
            </div>
          </section>

          {/* Sekmeli panel iskeleti */}
          <section className="panel">
            <div className="border-b border-border px-3 py-2 sm:px-4">
              <div className="flex gap-1">
                <div className="animate-pulse h-10 w-24 rounded-md bg-secondary/60" />
                <div className="animate-pulse h-10 w-24 rounded-md bg-secondary/60" />
                <div className="animate-pulse h-10 w-24 rounded-md bg-secondary/60" />
                <div className="animate-pulse h-10 w-24 rounded-md bg-secondary/60" />
                <div className="animate-pulse h-10 w-24 rounded-md bg-secondary/60" />
              </div>
            </div>
            <div className="p-3 sm:p-4">
              <SkeletonStatGrid count={4} />
              <div className="mt-4">
                <SkeletonList count={2} variant="card" />
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Hata / Premium değil
  if (error && !data) {
    return (
      <div className="min-h-screen pb-24 lg:pb-0">
        <div className="lg:hidden">
          <MobileNav onOpenSymbol={() => {}} />
        </div>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="max-w-md text-center">
            <p className="text-4xl">🔒</p>
            <p className="mt-3 text-lg font-bold">Premium Üyelere Özel</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              Formasyon başarı oranlarını ve istatistiklerini görmek için
              premium üyeliğe geçin.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const options = data.filterOptions;
  const isAdmin = data.tier === "admin";

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      {/* ========== MOBİL HEADER ========== */}
      <div className="lg:hidden">
        <MobileNav onOpenSymbol={() => {}} />
      </div>

      {/* ========== MASAÜSTÜ HEADER ========== */}
      <header className="sticky top-0 z-20 hidden border-b border-border bg-background/90 backdrop-blur lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="num text-sm font-bold uppercase tracking-[0.2em] text-primary"
          >
            AE Analiz
          </Link>
          <nav className="flex gap-2 text-xs">
            <Link
              to="/"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              Grafik
            </Link>
            <Link
              to="/coins"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              Liste
            </Link>
            <Link
              to="/market-summary"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              Piyasa Özeti
            </Link>
            <span className="rounded-md bg-primary/15 px-3 py-1.5 font-bold text-primary">
              📊 İstatistikler
            </span>
          </nav>
          <div className="ml-auto truncate text-xs text-muted-foreground">
            {user?.email}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        {/* BAŞLIK */}
        <section className="panel p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">
                📊 Başarı İstatistikleri
              </h1>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Sonuçlanmış sinyallerin başarı oranları ve performansı
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => void downloadCsv()}
                  disabled={downloadingCsv || loading}
                  className="min-h-[40px] rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                  title="Mevcut filtrelerle CSV indir"
                >
                  {downloadingCsv ? "⏳" : "📥 CSV"}
                </button>
              )}

              <label className="text-xs text-muted-foreground">Zaman:</label>
              <select
                value={filters.days}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    days: Number(e.target.value),
                  }))
                }
                className="min-h-[40px] rounded-md border border-border bg-background px-3 py-1.5 text-xs"
              >
                <option value={7}>7 gün</option>
                <option value={30}>30 gün</option>
                <option value={90}>90 gün</option>
                <option value={365}>1 yıl</option>
              </select>

              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                className={`min-h-[40px] rounded-md border px-3 py-1.5 text-xs font-bold transition-colors ${
                  panelOpen || activeFilterCount > 0
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border hover:bg-secondary"
                }`}
              >
                ⚙️ Filtreler
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {loading && (
                <span className="text-xs text-muted-foreground">
                  Güncelleniyor...
                </span>
              )}
            </div>
          </div>
        </section>

        {/* GELİŞMİŞ FİLTRE PANELİ */}
        {panelOpen && (
          <section className="panel p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">🔍 GELİŞMİŞ FİLTRELER</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearAllFilters}
                  disabled={activeFilterCount === 0}
                  className="min-h-[36px] rounded-md border border-border px-2.5 py-1 text-xs font-bold hover:bg-secondary disabled:opacity-40"
                >
                  🧹 Temizle
                </button>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm hover:bg-secondary"
                  aria-label="Paneli kapat"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2 lg:gap-4">
              {/* FORMASYON */}
              <div>
                <p className="text-xs font-bold text-muted-foreground">
                  Formasyon ({options.formations.length})
                </p>
                {options.formations.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Veri yok.
                  </p>
                ) : (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-background p-2">
                    <div className="flex flex-wrap gap-1.5">
                      {options.formations.map((f) => {
                        const active = filters.formations.includes(f);
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => toggleFormation(f)}
                            className={`min-h-[32px] rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border hover:bg-secondary"
                            }`}
                          >
                            {f}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* MARKET */}
              <div>
                <p className="text-xs font-bold text-muted-foreground">
                  Market ({options.markets.length})
                </p>
                {options.markets.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Veri yok.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {options.markets.map((m) => {
                      const active = filters.markets.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => toggleMarket(m)}
                          className={`min-h-[36px] rounded-md border px-3 py-1.5 text-xs transition-colors ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:bg-secondary"
                          }`}
                        >
                          {marketLabel(m)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SEMBOL */}
              <div>
                <p className="text-xs font-bold text-muted-foreground">
                  Sembol (tek seçim)
                </p>
                <input
                  type="text"
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  placeholder="Ara: BTC, THYAO, AAPL..."
                  className="mt-2 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-background">
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, symbol: "" }))
                    }
                    className={`block w-full px-3 py-2.5 text-left text-xs hover:bg-secondary ${
                      filters.symbol === "" ? "bg-secondary font-bold" : ""
                    }`}
                  >
                    Tümü
                  </button>
                  {options.symbols
                    .filter((s) =>
                      s.toLowerCase().includes(symbolSearch.toLowerCase()),
                    )
                    .slice(0, 200)
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setFilters((prev) => ({ ...prev, symbol: s }))
                        }
                        className={`block w-full px-3 py-2.5 text-left text-xs hover:bg-secondary ${
                          filters.symbol === s ? "bg-secondary font-bold" : ""
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                </div>
              </div>

              {/* BIAS */}
              <div>
                <p className="text-xs font-bold text-muted-foreground">
                  Yön (Bias)
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, bias: "" }))
                    }
                    className={`min-h-[36px] rounded-md border px-3 py-1.5 text-xs ${
                      filters.bias === ""
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    Tümü
                  </button>
                  {options.biases.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() =>
                        setFilters((prev) => ({ ...prev, bias: b }))
                      }
                      className={`min-h-[36px] rounded-md border px-3 py-1.5 text-xs ${
                        filters.bias === b
                          ? b === "yükseliş"
                            ? "border-bull bg-bull text-bull-foreground"
                            : b === "düşüş"
                              ? "border-bear bg-bear text-bear-foreground"
                              : "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      {biasLabel(b)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* AKTİF FİLTRE CHIP'LERİ */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-muted-foreground">
              Aktif:
            </span>

            {filters.formations.map((f) => (
              <button
                key={`chip-form-${f}`}
                type="button"
                onClick={() => removeFormation(f)}
                className="group flex min-h-[32px] items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
              >
                <span>{f}</span>
                <span className="text-muted-foreground group-hover:text-destructive">
                  ×
                </span>
              </button>
            ))}

            {filters.markets.map((m) => (
              <button
                key={`chip-mkt-${m}`}
                type="button"
                onClick={() => removeMarket(m)}
                className="group flex min-h-[32px] items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
              >
                <span>{marketLabel(m)}</span>
                <span className="text-muted-foreground group-hover:text-destructive">
                  ×
                </span>
              </button>
            ))}

            {filters.symbol && (
              <button
                type="button"
                onClick={() =>
                  setFilters((prev) => ({ ...prev, symbol: "" }))
                }
                className="group flex min-h-[32px] items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
              >
                <span>📈 {filters.symbol}</span>
                <span className="text-muted-foreground group-hover:text-destructive">
                  ×
                </span>
              </button>
            )}

            {filters.bias && (
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, bias: "" }))}
                className="group flex min-h-[32px] items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
              >
                <span>{biasLabel(filters.bias)}</span>
                <span className="text-muted-foreground group-hover:text-destructive">
                  ×
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={clearAllFilters}
              className="text-[11px] font-bold text-destructive hover:underline"
            >
              Tümünü Temizle
            </button>
          </div>
        )}

        {/* SEKMELİ İSTATİSTİK PANELİ */}
        <StatsTabs data={data} activeFilterCount={activeFilterCount} />

        {/* FORMASYON BAZLI GRAFİK */}
        {data.byFormation.length > 0 && (
          <section className="panel p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-bold sm:mb-4">
              📋 Formasyon Başarı Oranları (İlk 10)
            </h2>
            <div className="h-72 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.byFormation.slice(0, 10).map((f) => ({
                    name:
                      f.name.length > 15 ? f.name.slice(0, 15) + "..." : f.name,
                    fullName: f.name,
                    "Başarı %": f.winRate,
                    Toplam: f.total,
                  }))}
                  margin={{ top: 5, right: 10, left: -10, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="name"
                    angle={-30}
                    textAnchor="end"
                    height={80}
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: 8,
                      color: "#fff",
                    }}
                    formatter={(value: number, name: string) => [
                      name === "Başarı %" ? `${value}%` : value,
                      name,
                    ]}
                    labelFormatter={(label: string, payload: any) => {
                      const item = payload?.[0]?.payload;
                      return item?.fullName ?? label;
                    }}
                  />
                  <Bar
                    dataKey="Başarı %"
                    fill={COLORS.blue}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* COIN/HS BAZLI GRAFİK */}
        {data.bySymbol.length > 0 && (
          <section className="panel p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-bold sm:mb-4">
              🪙 Coin/Hisse Başarı Oranları (İlk 10)
            </h2>
            <div className="h-72 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.bySymbol.slice(0, 10).map((s) => ({
                    name: s.symbol
                      .replace("USDT", "")
                      .replace(".IS", "")
                      .slice(0, 10),
                    fullName: s.symbol,
                    "Başarı %": s.winRate,
                    Toplam: s.total,
                  }))}
                  margin={{ top: 5, right: 10, left: -10, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: 8,
                      color: "#fff",
                    }}
                    formatter={(value: number, name: string) => [
                      name === "Başarı %" ? `${value}%` : value,
                      name,
                    ]}
                    labelFormatter={(label: string, payload: any) => {
                      const item = payload?.[0]?.payload;
                      return item?.fullName ?? label;
                    }}
                  />
                  <Bar
                    dataKey="Başarı %"
                    fill={COLORS.amber}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ==========================================================
// SEKMELİ PANEL
// ==========================================================

function StatsTabs({
  data,
  activeFilterCount,
}: {
  data: StatsData;
  activeFilterCount: number;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const tabs: Array<{ key: TabKey; label: string; emoji: string }> = [
    { key: "long", label: "Uzun", emoji: "📈" },
    { key: "short", label: "Kısa", emoji: "⚡" },
    { key: "multi", label: "Çoklu ZD", emoji: "🎯" },
    { key: "all", label: "Toplam", emoji: "📊" },
    { key: "compare", label: "Karşılaştır", emoji: "⚖️" },
  ];

  return (
    <section className="panel">
      {/* SEKME BAŞLIKLARI — MOBİLDE YATAY SCROLL */}
      <div className="-mx-3 flex overflow-x-auto border-b border-border px-3 py-2 sm:-mx-4 sm:px-4 lg:flex-wrap lg:px-4">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[40px] whitespace-nowrap rounded-md px-3 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {tab.emoji} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 sm:p-4">
        {activeTab === "compare" ? (
          <CompareView data={data} />
        ) : (
          <SingleStatsView
            stats={data.signalTypes[activeTab]}
            label={
              activeTab === "long"
                ? "Uzun Vadeli"
                : activeTab === "short"
                  ? "Kısa Vadeli"
                  : activeTab === "multi"
                    ? "Çoklu Zaman Dilimi"
                    : "Toplam (Kısa + Uzun + Çoklu)"
            }
            activeFilterCount={activeFilterCount}
            activeTab={activeTab}
            timeSeries={data.timeSeries[activeTab]}
          />
        )}
      </div>
    </section>
  );
}

// ==========================================================
// TEK KATEGORİ İSTATİSTİK GÖRÜNÜMÜ
// ==========================================================

function SingleStatsView({
  stats,
  label,
  activeFilterCount,
  activeTab,
  timeSeries,
}: {
  stats: StatBlock;
  label: string;
  activeFilterCount: number;
  activeTab: TabKey;
  timeSeries: TimeSeriesPoint[];
}) {
  const winLossData = [
    { name: "Başarılı", value: stats.wins, color: COLORS.bull },
    { name: "Başarısız", value: stats.losses, color: COLORS.bear },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold sm:text-base">{label}</h2>
        {activeFilterCount > 0 && (
          <span className="text-[10px] text-muted-foreground sm:text-[11px]">
            ⚠️ Filtreler bu sekmeyi etkilemez
          </span>
        )}
      </div>

      {stats.total === 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-bold text-amber-500">
            ⏳ Bu kategoride henüz sonuçlanmış sinyal yok
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sinyaller üretiliyor, sonuçlanmasını bekliyoruz.
          </p>
        </div>
      ) : (
        <>
          {/* 6 KART — MOBİLDE 2 SÜTUN */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
            <StatCard
              title="Toplam Sinyal"
              value={stats.total.toString()}
              icon="📈"
            />
            <StatCard
              title="Başarı Oranı"
              value={`${stats.winRate}%`}
              icon="🎯"
              color={
                stats.winRate >= 60
                  ? "text-bull"
                  : stats.winRate >= 40
                    ? "text-amber-500"
                    : "text-bear"
              }
            />
            <StatCard
              title="Toplam Getiri"
              value={`${stats.totalReturn >= 0 ? "+" : ""}${stats.totalReturn}%`}
              icon="💰"
              color={stats.totalReturn >= 0 ? "text-bull" : "text-bear"}
            />
            <StatCard
              title="Ort. Kazanç"
              value={`+${stats.avgWin}%`}
              icon="🟢"
              color="text-bull"
            />
            <StatCard
              title="Ort. Kayıp"
              value={`${stats.avgLoss}%`}
              icon="🔴"
              color="text-bear"
            />
            <StatCard
              title="Beklenen Değer"
              value={`${stats.expectancy >= 0 ? "+" : ""}${stats.expectancy}%`}
              icon="⚖️"
              color={stats.expectancy >= 0 ? "text-bull" : "text-bear"}
            />
          </div>

          {winLossData.length > 0 && (
            <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
              <h3 className="mb-3 text-xs font-bold sm:text-sm">
                🥧 Başarı Dağılımı
              </h3>
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={winLossData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) =>
                        `${name}: ${value} (${((percent ?? 0) * 100).toFixed(0)}%)`
                      }
                      outerRadius={70}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {winLossData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "1px solid #374151",
                        borderRadius: 8,
                        color: "#fff",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <TrendChart
            data={timeSeries}
            title="📈 Başarı Oranı Trendi"
            color={
              activeTab === "long"
                ? "#3b82f6"
                : activeTab === "short"
                  ? "#f59e0b"
                  : activeTab === "multi"
                    ? "#8b5cf6"
                    : "#14b8a6"
            }
          />
        </>
      )}
    </div>
  );
}

// ==========================================================
// TREND GRAFİĞİ
// ==========================================================

function TrendChart({
  data,
  title,
  color,
}: {
  data: TimeSeriesPoint[];
  title: string;
  color: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
        <h3 className="mb-3 text-xs font-bold sm:text-sm">{title}</h3>
        <div className="flex h-56 items-center justify-center text-xs text-muted-foreground sm:h-72">
          ⏳ Henüz trend verisi yok
        </div>
      </div>
    );
  }

  if (data.length === 1) {
    return (
      <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
        <h3 className="mb-3 text-xs font-bold sm:text-sm">{title}</h3>
        <div className="flex h-56 items-center justify-center text-xs text-muted-foreground sm:h-72">
          📊 Trend için en az 2 gün veri gerekli
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
      <h3 className="mb-3 text-xs font-bold sm:text-sm">{title}</h3>
      <div className="h-56 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 10, left: -10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#9ca3af", fontSize: 10 }}
              angle={-30}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fill: "#9ca3af", fontSize: 10 }}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: 8,
                color: "#fff",
              }}
              formatter={(value: number) => [`${value}%`, "Başarı"]}
              labelFormatter={(label: string, payload: any) => {
                const item = payload?.[0]?.payload;
                if (item) {
                  return `${item.label} (${item.total} sinyal)`;
                }
                return label;
              }}
            />
            <Line
              type="monotone"
              dataKey="winRate"
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, r: 3 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ==========================================================
// KARŞILAŞTIRMA GÖRÜNÜMÜ
// ==========================================================

function CompareView({ data }: { data: StatsData }) {
  const { long, short, multi } = data.signalTypes;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold sm:text-base">
        ⚖️ Uzun / Kısa / Çoklu ZD Karşılaştırması
      </h2>

      {/* TABLO — MOBİLDE SCROLL */}
      <div className="-mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4">
        <table className="w-full min-w-[600px] text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-bold text-muted-foreground">
                Metrik
              </th>
              <th className="px-3 py-2 text-center font-bold text-blue-400">
                📈 Uzun
              </th>
              <th className="px-3 py-2 text-center font-bold text-amber-400">
                ⚡ Kısa
              </th>
              <th className="px-3 py-2 text-center font-bold text-purple-400">
                🎯 Çoklu ZD
              </th>
            </tr>
          </thead>
          <tbody>
            <CompareRow
              label="Toplam Sinyal"
              values={[long.total, short.total, multi.total]}
            />
            <CompareRow
              label="Başarılı"
              values={[long.wins, short.wins, multi.wins]}
              color="text-bull"
            />
            <CompareRow
              label="Başarısız"
              values={[long.losses, short.losses, multi.losses]}
              color="text-bear"
            />
            <CompareRow
              label="Başarı Oranı"
              values={[
                `${long.winRate}%`,
                `${short.winRate}%`,
                `${multi.winRate}%`,
              ]}
              colorFn={(v) => {
                const n = parseFloat(String(v));
                return n >= 60
                  ? "text-bull"
                  : n >= 40
                    ? "text-amber-500"
                    : "text-bear";
              }}
            />
            <CompareRow
              label="Ort. Kazanç"
              values={[
                `+${long.avgWin}%`,
                `+${short.avgWin}%`,
                `+${multi.avgWin}%`,
              ]}
              color="text-bull"
            />
            <CompareRow
              label="Ort. Kayıp"
              values={[
                `${long.avgLoss}%`,
                `${short.avgLoss}%`,
                `${multi.avgLoss}%`,
              ]}
              color="text-bear"
            />
            <CompareRow
              label="Toplam Getiri"
              values={[
                `${long.totalReturn >= 0 ? "+" : ""}${long.totalReturn}%`,
                `${short.totalReturn >= 0 ? "+" : ""}${short.totalReturn}%`,
                `${multi.totalReturn >= 0 ? "+" : ""}${multi.totalReturn}%`,
              ]}
              colorFn={(v) =>
                String(v).startsWith("+") ? "text-bull" : "text-bear"
              }
            />
            <CompareRow
              label="Beklenen Değer"
              values={[
                `${long.expectancy >= 0 ? "+" : ""}${long.expectancy}%`,
                `${short.expectancy >= 0 ? "+" : ""}${short.expectancy}%`,
                `${multi.expectancy >= 0 ? "+" : ""}${multi.expectancy}%`,
              ]}
              colorFn={(v) =>
                String(v).startsWith("+") ? "text-bull" : "text-bear"
              }
            />
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-background p-3">
        <p className="text-[10px] text-muted-foreground sm:text-[11px]">
          💡 İpucu: Bu tablo tüm zamanların verisini gösterir, filtrelerden
          etkilenmez.
        </p>
      </div>

      {/* 3 TREND GRAFİĞİ YAN YANA */}
      <div className="grid gap-3 lg:grid-cols-3 lg:gap-4">
        <TrendChart
          data={data.timeSeries.long}
          title="📈 Uzun Vadeli Trend"
          color="#3b82f6"
        />
        <TrendChart
          data={data.timeSeries.short}
          title="⚡ Kısa Vadeli Trend"
          color="#f59e0b"
        />
        <TrendChart
          data={data.timeSeries.multi}
          title="🎯 Çoklu ZD Trend"
          color="#8b5cf6"
        />
      </div>
    </div>
  );
}

function CompareRow({
  label,
  values,
  color,
  colorFn,
}: {
  label: string;
  values: Array<string | number>;
  color?: string;
  colorFn?: (v: string | number) => string;
}) {
  return (
    <tr className="border-b border-border/50">
      <td className="px-3 py-2 font-bold text-muted-foreground">{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`num px-3 py-2 text-center font-bold ${
            colorFn ? colorFn(v) : color ?? ""
          }`}
        >
          {v}
        </td>
      ))}
    </tr>
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
        className={`num mt-1.5 text-lg font-bold sm:mt-2 sm:text-xl ${color ?? "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}