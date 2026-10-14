// src/routes/stats.tsx
import { createFileRoute } from "@tanstack/react-router";
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

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-bold">🔒 Giriş Yapın</p>
          <p className="mt-2 text-sm text-muted-foreground">
            İstatistikleri görmek için giriş yapın.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          İstatistikler yükleniyor...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center">
          <p className="text-4xl">🔒</p>
          <p className="mt-3 text-lg font-bold">Premium Üyelere Özel</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            Formasyon başarı oranlarını ve istatistiklerini görmek için premium
            üyeliğe geçin.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const options = data.filterOptions;
  const isAdmin = data.tier === "admin";

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-4">
      {/* BAŞLIK */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            📊 Formasyon Başarı İstatistikleri
          </h1>
          <p className="text-sm text-muted-foreground">
            Sonuçlanmış sinyallerin başarı oranları ve performansı
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => void downloadCsv()}
              disabled={downloadingCsv || loading}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
              title="Mevcut filtrelerle CSV indir"
            >
              {downloadingCsv ? "⏳ İndiriliyor..." : "📥 CSV İndir"}
            </button>
          )}

          <label className="text-xs text-muted-foreground">Zaman:</label>
          <select
            value={filters.days}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, days: Number(e.target.value) }))
            }
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
          >
            <option value={7}>Son 7 gün</option>
            <option value={30}>Son 30 gün</option>
            <option value={90}>Son 90 gün</option>
            <option value={365}>Son 1 yıl</option>
          </select>

          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-xs font-bold transition-colors ${
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
            <span className="text-xs text-muted-foreground">Güncelleniyor...</span>
          )}
        </div>
      </div>

      {/* GELİŞMİŞ FİLTRE PANELİ */}
      {panelOpen && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">🔍 GELİŞMİŞ FİLTRELER</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearAllFilters}
                disabled={activeFilterCount === 0}
                className="rounded-md border border-border px-2.5 py-1 text-[11px] font-bold hover:bg-secondary disabled:opacity-40"
              >
                🧹 Temizle
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                aria-label="Paneli kapat"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold text-muted-foreground">
                Formasyon ({options.formations.length})
              </p>
              {options.formations.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Veri yok.</p>
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
                          className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
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

            <div>
              <p className="text-xs font-bold text-muted-foreground">
                Market ({options.markets.length})
              </p>
              {options.markets.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Veri yok.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {options.markets.map((m) => {
                    const active = filters.markets.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMarket(m)}
                        className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
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

            <div>
              <p className="text-xs font-bold text-muted-foreground">
                Sembol (tek seçim)
              </p>
              <input
                type="text"
                value={symbolSearch}
                onChange={(e) => setSymbolSearch(e.target.value)}
                placeholder="Ara: BTC, THYAO, AAPL..."
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-background">
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, symbol: "" }))}
                  className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-secondary ${
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
                      className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-secondary ${
                        filters.symbol === s ? "bg-secondary font-bold" : ""
                      }`}
                    >
                      {s}
                    </button>
                  ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-muted-foreground">
                Yön (Bias)
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, bias: "" }))}
                  className={`rounded-md border px-2.5 py-1 text-[11px] ${
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
                    onClick={() => setFilters((prev) => ({ ...prev, bias: b }))}
                    className={`rounded-md border px-2.5 py-1 text-[11px] ${
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
        </div>
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
              className="group flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
            >
              <span>{f}</span>
              <span className="text-muted-foreground group-hover:text-destructive">×</span>
            </button>
          ))}

          {filters.markets.map((m) => (
            <button
              key={`chip-mkt-${m}`}
              type="button"
              onClick={() => removeMarket(m)}
              className="group flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
            >
              <span>{marketLabel(m)}</span>
              <span className="text-muted-foreground group-hover:text-destructive">×</span>
            </button>
          ))}

          {filters.symbol && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, symbol: "" }))}
              className="group flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
            >
              <span>📈 {filters.symbol}</span>
              <span className="text-muted-foreground group-hover:text-destructive">×</span>
            </button>
          )}

          {filters.bias && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, bias: "" }))}
              className="group flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
            >
              <span>{biasLabel(filters.bias)}</span>
              <span className="text-muted-foreground group-hover:text-destructive">×</span>
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
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-bold">
            📋 Formasyon Başarı Oranları (İlk 10)
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.byFormation.slice(0, 10).map((f) => ({
                  name: f.name.length > 15 ? f.name.slice(0, 15) + "..." : f.name,
                  fullName: f.name,
                  "Başarı %": f.winRate,
                  Toplam: f.total,
                }))}
                margin={{ top: 5, right: 20, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="name"
                  angle={-30}
                  textAnchor="end"
                  height={80}
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
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
        </div>
      )}

      {/* COIN/HS BAZLI GRAFİK */}
      {data.bySymbol.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-bold">
            🪙 Coin/Hisse Başarı Oranları (İlk 10)
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.bySymbol.slice(0, 10).map((s) => ({
                  name: s.symbol.replace("USDT", "").replace(".IS", "").slice(0, 10),
                  fullName: s.symbol,
                  "Başarı %": s.winRate,
                  Toplam: s.total,
                }))}
                margin={{ top: 5, right: 20, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
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
        </div>
      )}
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
    { key: "long", label: "Uzun Vadeli", emoji: "📈" },
    { key: "short", label: "Kısa Vadeli", emoji: "⚡" },
    { key: "multi", label: "Çoklu ZD", emoji: "🎯" },
    { key: "all", label: "Toplam", emoji: "📊" },
    { key: "compare", label: "Karşılaştırma", emoji: "⚖️" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-3 py-2 text-xs font-bold transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
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
    </div>
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">{label}</h2>
        {activeFilterCount > 0 && (
          <span className="text-[11px] text-muted-foreground">
            ⚠️ Filtreler bu sekmeyi etkilemez, sadece aşağıdaki grafikleri etkiler
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              title="Ortalama Kazanç"
              value={`+${stats.avgWin}%`}
              icon="🟢"
              color="text-bull"
            />
            <StatCard
              title="Ortalama Kayıp"
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
            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="mb-3 text-sm font-bold">🥧 Başarı Dağılımı</h3>
              <div className="h-64">
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
                      outerRadius={80}
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
      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 text-sm font-bold">{title}</h3>
        <div className="flex h-72 items-center justify-center text-xs text-muted-foreground">
          ⏳ Henüz trend verisi yok
        </div>
      </div>
    );
  }

  if (data.length === 1) {
    return (
      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 text-sm font-bold">{title}</h3>
        <div className="flex h-72 items-center justify-center text-xs text-muted-foreground">
          📊 Trend için en az 2 gün veri gerekli
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 20, left: 0, bottom: 20 }}
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
              tick={{ fill: "#9ca3af", fontSize: 11 }}
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
      <h2 className="text-base font-bold">
        ⚖️ Uzun / Kısa / Çoklu ZD Karşılaştırması
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-bold text-muted-foreground">
                Metrik
              </th>
              <th className="px-3 py-2 text-center font-bold text-blue-400">
                📈 Uzun Vadeli
              </th>
              <th className="px-3 py-2 text-center font-bold text-amber-400">
                ⚡ Kısa Vadeli
              </th>
              <th className="px-3 py-2 text-center font-bold text-purple-400">
                🎯 Çoklu ZD
              </th>
            </tr>
          </thead>
          <tbody>
            <CompareRow label="Toplam Sinyal" values={[long.total, short.total, multi.total]} />
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
              values={[`${long.winRate}%`, `${short.winRate}%`, `${multi.winRate}%`]}
              colorFn={(v) => {
                const n = parseFloat(String(v));
                return n >= 60 ? "text-bull" : n >= 40 ? "text-amber-500" : "text-bear";
              }}
            />
            <CompareRow
              label="Ortalama Kazanç"
              values={[`+${long.avgWin}%`, `+${short.avgWin}%`, `+${multi.avgWin}%`]}
              color="text-bull"
            />
            <CompareRow
              label="Ortalama Kayıp"
              values={[`${long.avgLoss}%`, `${short.avgLoss}%`, `${multi.avgLoss}%`]}
              color="text-bear"
            />
            <CompareRow
              label="Toplam Getiri"
              values={[
                `${long.totalReturn >= 0 ? "+" : ""}${long.totalReturn}%`,
                `${short.totalReturn >= 0 ? "+" : ""}${short.totalReturn}%`,
                `${multi.totalReturn >= 0 ? "+" : ""}${multi.totalReturn}%`,
              ]}
              colorFn={(v) => (String(v).startsWith("+") ? "text-bull" : "text-bear")}
            />
            <CompareRow
              label="Beklenen Değer"
              values={[
                `${long.expectancy >= 0 ? "+" : ""}${long.expectancy}%`,
                `${short.expectancy >= 0 ? "+" : ""}${short.expectancy}%`,
                `${multi.expectancy >= 0 ? "+" : ""}${multi.expectancy}%`,
              ]}
              colorFn={(v) => (String(v).startsWith("+") ? "text-bull" : "text-bear")}
            />
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-background p-3">
        <p className="text-[11px] text-muted-foreground">
          💡 İpucu: Bu tablo tüm zamanların verisini gösterir, filtrelerden etkilenmez.
        </p>
      </div>

      {/* 3 TREND GRAFİĞİ YAN YANA */}
      <div className="grid gap-4 lg:grid-cols-3">
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
          className={`px-3 py-2 text-center font-bold num ${
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
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <span className="text-base">{icon}</span>
      </div>
      <p className={`mt-2 text-xl font-bold ${color ?? "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}