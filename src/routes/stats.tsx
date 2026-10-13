// src/routes/stats.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
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

type StatsData = {
  success: boolean;
  tier: string;
  filters: {
    days: number;
    formations: string[];
    markets: string[];
    symbol: string | null;
    bias: string | null;
  };
  filterOptions: {
    formations: string[];
    markets: string[];
    symbols: string[];
    biases: string[];
  };
  general: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    totalReturn: number;
    expectancy: number;
  };
  byFormation: Array<{
    name: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    totalReturn: number;
    expectancy: number;
  }>;
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
};

type FilterState = {
  days: number;
  formations: string[];
  markets: string[];
  symbol: string;
  bias: string;
};

const COLORS = {
  bull: "#22c55e",
  bear: "#ef4444",
  neutral: "#a855f7",
  amber: "#f59e0b",
  blue: "#3b82f6",
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
// SAYFA
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

  // ==========================================================
  // FETCH
  // ==========================================================
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

  // ==========================================================
  // AKTİF FİLTRE SAYISI
  // ==========================================================
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.formations.length > 0) count += filters.formations.length;
    if (filters.markets.length > 0) count += filters.markets.length;
    if (filters.symbol) count += 1;
    if (filters.bias) count += 1;
    return count;
  }, [filters]);

  // ==========================================================
  // FİLTRE YARDIMCILARI
  // ==========================================================
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

  // ==========================================================
  // CSV İNDİR
  // ==========================================================
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

  // ==========================================================
  // GİRİŞ YOK
  // ==========================================================
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

  // ==========================================================
  // LOADING (ilk yükleme)
  // ==========================================================
  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          İstatistikler yükleniyor...
        </p>
      </div>
    );
  }

  // ==========================================================
  // PREMIUM GEREKLİ
  // ==========================================================
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

  // ==========================================================
  // GRAFİK VERİLERİ
  // ==========================================================
  const winLossData = [
    { name: "Başarılı", value: data.general.wins, color: COLORS.bull },
    { name: "Başarısız", value: data.general.losses, color: COLORS.bear },
  ].filter((d) => d.value > 0);

  const formationChartData = data.byFormation.slice(0, 10).map((f) => ({
    name: f.name.length > 15 ? f.name.slice(0, 15) + "..." : f.name,
    fullName: f.name,
    "Başarı %": f.winRate,
    Toplam: f.total,
  }));

  const symbolChartData = data.bySymbol.slice(0, 10).map((s) => ({
    name: s.symbol.replace("USDT", "").replace(".IS", "").slice(0, 10),
    fullName: s.symbol,
    "Başarı %": s.winRate,
    Toplam: s.total,
  }));

  const biasData = data.byBias.map((b) => ({
    name: biasLabel(b.bias),
    value: b.total,
    color:
      b.bias === "yükseliş"
        ? COLORS.bull
        : b.bias === "düşüş"
          ? COLORS.bear
          : COLORS.neutral,
  }));

  const filteredSymbols = options.symbols.filter((s) =>
    s.toLowerCase().includes(symbolSearch.toLowerCase()),
  );

  // ==========================================================
  // RENDER
  // ==========================================================
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
          {/* CSV İNDİR — sadece admin */}
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
            <span className="text-xs text-muted-foreground">
              Güncelleniyor...
            </span>
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
            {/* FORMASYON */}
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

            {/* MARKET */}
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
                {filteredSymbols.slice(0, 200).map((s) => (
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
                {filteredSymbols.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Sonuç yok.
                  </p>
                )}
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
              className="group flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
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
              onClick={() => setFilters((prev) => ({ ...prev, symbol: "" }))}
              className="group flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
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
              className="group flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:border-destructive/40 hover:bg-destructive/10"
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

      {/* GENEL İSTATİSTİK KARTLARI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Toplam Sinyal"
          value={data.general.total.toString()}
          icon="📈"
        />
        <StatCard
          title="Başarı Oranı"
          value={`${data.general.winRate}%`}
          icon="🎯"
          color={
            data.general.winRate >= 60
              ? "text-bull"
              : data.general.winRate >= 40
                ? "text-amber-500"
                : "text-bear"
          }
        />
        <StatCard
          title="Ortalama Kazanç"
          value={`+${data.general.avgWin}%`}
          icon="🟢"
          color="text-bull"
        />
        <StatCard
          title="Ortalama Kayıp"
          value={`${data.general.avgLoss}%`}
          icon="🔴"
          color="text-bear"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Başarılı"
          value={data.general.wins.toString()}
          icon="✅"
          color="text-bull"
        />
        <StatCard
          title="Başarısız"
          value={data.general.losses.toString()}
          icon="❌"
          color="text-bear"
        />
        <StatCard
          title="Toplam Getiri"
          value={`${data.general.totalReturn >= 0 ? "+" : ""}${data.general.totalReturn}%`}
          icon="💰"
          color={data.general.totalReturn >= 0 ? "text-bull" : "text-bear"}
        />
        <StatCard
          title="Beklenen Değer"
          value={`${data.general.expectancy >= 0 ? "+" : ""}${data.general.expectancy}%`}
          icon="⚖️"
          color={data.general.expectancy >= 0 ? "text-bull" : "text-bear"}
        />
      </div>

      {/* VERİ YOK */}
      {data.general.total === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-bold text-amber-500">
            ⏳ Bu filtre için sonuçlanmış sinyal yok
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeFilterCount > 0
              ? "Filtreleri gevşetmeyi veya zaman aralığını artırmayı deneyin."
              : "Sinyaller kaydediliyor ancak henüz hedefe ulaşmadı veya stop olmadı. Birkaç gün sonra tekrar kontrol edin."}
          </p>
        </div>
      )}

      {/* GRAFİKLER */}
      {data.general.total > 0 && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-sm font-bold">🥧 Başarı Dağılımı</h2>
              <div className="h-72">
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
                      outerRadius={90}
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

            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-sm font-bold">🎯 AL/SAT Dağılımı</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={biasData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) =>
                        `${name}: ${value} (${((percent ?? 0) * 100).toFixed(0)}%)`
                      }
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {biasData.map((entry, index) => (
                        <Cell key={`cell-bias-${index}`} fill={entry.color} />
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
          </div>

          {formationChartData.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-sm font-bold">
                📋 Formasyon Başarı Oranları (İlk 10)
              </h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={formationChartData}
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

          {symbolChartData.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-sm font-bold">
                🪙 Coin/Hisse Başarı Oranları (İlk 10)
              </h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={symbolChartData}
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
        </>
      )}
    </div>
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
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${color ?? "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}