// src/routes/backtest.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";

export const Route = createFileRoute("/backtest")({
  component: BacktestPage,
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
  expectancy: number;
};

type BacktestData = {
  success: boolean;
  params: {
    days: number;
    minQuality: number;
    minTargetPercent: number;
    minStopPercent: number;
    maxStopPercent: number;
    minRR: number;
    marketFilter: "all" | "crypto" | "hisse";
  };
  before: StatBlock;
  after: StatBlock;
  diff: {
    total: number;
    winRate: number;
    totalReturn: number;
    expectancy: number;
  };
  rejected: number;
  rejectedByReason: Record<string, number>;
  totalSignals: number;
  byFormation: Array<{
    name: string;
    before: StatBlock;
    after: StatBlock;
    diff: {
      total: number;
      winRate: number;
      totalReturn: number;
    };
  }>;
  timestamp: string;
};

// ==========================================================
// SAYFA
// ==========================================================

function BacktestPage() {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();

  // Parametreler
  const [days, setDays] = useState(30);
  const [minQuality, setMinQuality] = useState(65);
  const [minTargetPercent, setMinTargetPercent] = useState(2);
  const [minStopPercent, setMinStopPercent] = useState(1);
  const [maxStopPercent, setMaxStopPercent] = useState(3);
  const [minRR, setMinRR] = useState(2);
  const [marketFilter, setMarketFilter] = useState<"all" | "crypto" | "hisse">(
    "all",
  );

  const [data, setData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runBacktest() {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("days", String(days));
      params.set("minQuality", String(minQuality));
      params.set("minTargetPercent", String(minTargetPercent / 100));
      params.set("minStopPercent", String(minStopPercent / 100));
      params.set("maxStopPercent", String(maxStopPercent / 100));
      params.set("minRR", String(minRR));
      params.set("marketFilter", marketFilter);

      const res = await fetch(`/api/backtest?${params.toString()}`, {
        headers: { "x-user-id": user.id },
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Backtest başarısız");
      } else {
        setData(json);
      }
    } catch (err) {
      console.error(err);
      setError("Backtest çalıştırılamadı");
    } finally {
      setLoading(false);
    }
  }

  // Giriş yok
  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-bold">🔒 Giriş Yapın</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Backtest aracını kullanmak için giriş yapın.
          </p>
        </div>
      </div>
    );
  }

  // Admin değil
  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center">
          <p className="text-4xl">🔒</p>
          <p className="mt-3 text-lg font-bold">Admin Yetkisi Gerekli</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Backtest aracı sadece admin kullanıcılar içindir.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-md border border-border px-4 py-2 text-xs font-bold hover:bg-secondary"
          >
            ← Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-4">
      {/* BAŞLIK */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">🧪 Backtest Aracı</h1>
          <p className="text-sm text-muted-foreground">
            Geçmiş sinyalleri yeni parametrelerle test edin
          </p>
        </div>
        <Link
          to="/admin"
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
        >
          ← Admin Paneli
        </Link>
      </div>

      {/* PARAMETRE FORMU */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-bold mb-4">⚙️ Parametreler</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Gün */}
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              Zaman Aralığı: <span className="text-foreground">{days} gün</span>
            </label>
            <input
              type="range"
              min={7}
              max={365}
              step={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>7</span>
              <span>30</span>
              <span>90</span>
              <span>365</span>
            </div>
          </div>

          {/* Kalite */}
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              Min Kalite: <span className="text-foreground">{minQuality}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={minQuality}
              onChange={(e) => setMinQuality(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span>60</span>
              <span>80</span>
              <span>100</span>
            </div>
          </div>

          {/* Market */}
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              Market Filtresi
            </label>
            <select
              value={marketFilter}
              onChange={(e) =>
                setMarketFilter(e.target.value as "all" | "crypto" | "hisse")
              }
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">Tümü</option>
              <option value="crypto">Sadece Kripto</option>
              <option value="hisse">Sadece Hisse</option>
            </select>
          </div>

          {/* Min Hedef */}
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              Min Hedef: <span className="text-foreground">%{minTargetPercent}</span>
            </label>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={minTargetPercent}
              onChange={(e) => setMinTargetPercent(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0.5</span>
              <span>2</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Min Stop */}
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              Min Stop: <span className="text-foreground">%{minStopPercent}</span>
            </label>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={minStopPercent}
              onChange={(e) => setMinStopPercent(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0.5</span>
              <span>1</span>
              <span>2</span>
              <span>5</span>
            </div>
          </div>

          {/* Max Stop */}
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              Max Stop: <span className="text-foreground">%{maxStopPercent}</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={maxStopPercent}
              onChange={(e) => setMaxStopPercent(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>1</span>
              <span>3</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Min R/R */}
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              Min R/R: <span className="text-foreground">1:{minRR}</span>
            </label>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={minRR}
              onChange={(e) => setMinRR(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>1:0.5</span>
              <span>1:2</span>
              <span>1:3</span>
              <span>1:5</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runBacktest()}
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "⏳ Çalışıyor..." : "🚀 Backtest Çalıştır"}
          </button>

          <button
            type="button"
            onClick={() => {
              setDays(30);
              setMinQuality(65);
              setMinTargetPercent(2);
              setMinStopPercent(1);
              setMaxStopPercent(3);
              setMinRR(2);
              setMarketFilter("all");
              setData(null);
            }}
            className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-secondary"
          >
            🔄 Sıfırla
          </button>
        </div>
      </div>

      {/* HATA */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-bold text-destructive">⚠️ {error}</p>
        </div>
      )}

      {/* SONUÇLAR */}
      {data && (
        <>
          {/* ÖZET KARTLAR */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-bold mb-4">
              📊 Genel Karşılaştırma
            </h2>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DiffCard
                label="Toplam Sinyal"
                before={data.before.total}
                after={data.after.total}
                diff={data.diff.total}
                format={(v) => String(v)}
              />
              <DiffCard
                label="Başarı Oranı"
                before={data.before.winRate}
                after={data.after.winRate}
                diff={data.diff.winRate}
                format={(v) => `${v}%`}
              />
              <DiffCard
                label="Toplam Getiri"
                before={data.before.totalReturn}
                after={data.after.totalReturn}
                diff={data.diff.totalReturn}
                format={(v) => `${v >= 0 ? "+" : ""}${v}%`}
              />
              <DiffCard
                label="Beklenen Değer"
                before={data.before.expectancy}
                after={data.after.expectancy}
                diff={data.diff.expectancy}
                format={(v) => `${v >= 0 ? "+" : ""}${v}%`}
              />
            </div>

            <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              <p>
                💡 <strong>{data.rejected}</strong> sinyal kalite/market
                filtresine takıldı. Toplam incelenen: {data.totalSignals}
              </p>
              {Object.keys(data.rejectedByReason).length > 0 && (
                <p className="mt-1">
                  Reddedilme sebepleri:{" "}
                  {Object.entries(data.rejectedByReason)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* KARŞILAŞTIRMA GRAFİĞİ */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-bold mb-4">
              📈 Başarı Oranı Karşılaştırması
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    {
                      name: "Başarı %",
                      "Öncesi": data.before.winRate,
                      "Sonrası": data.after.winRate,
                    },
                  ]}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
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
                    formatter={(value: number) => [`${value}%`]}
                  />
                  <Legend />
                  <Bar dataKey="Öncesi" fill="#6b7280" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Sonrası" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* FORMASYON BAZLI */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-bold mb-4">
              📋 Formasyon Bazlı Karşılaştırma
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-xs">
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
                    <th className="px-3 py-2 text-center font-bold text-amber-400">
                      Fark
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.byFormation.map((f) => (
                    <tr
                      key={f.name}
                      className="border-b border-border/50 hover:bg-secondary/20"
                    >
                      <td className="px-3 py-2 font-bold">{f.name}</td>
                      <td className="px-3 py-2 text-center num">
                        <span className="text-muted-foreground">
                          {f.before.total}
                        </span>
                        <span className="mx-1">→</span>
                        <span className="font-bold">{f.after.total}</span>
                      </td>
                      <td className="px-3 py-2 text-center num">
                        <span className="text-muted-foreground">
                          {f.before.winRate}%
                        </span>
                        <span className="mx-1">→</span>
                        <span
                          className={
                            f.after.winRate >= 60
                              ? "text-bull font-bold"
                              : f.after.winRate >= 40
                                ? "text-amber-500 font-bold"
                                : "text-bear font-bold"
                          }
                        >
                          {f.after.winRate}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center num">
                        <span className="text-muted-foreground">
                          {f.before.totalReturn >= 0 ? "+" : ""}
                          {f.before.totalReturn}%
                        </span>
                        <span className="mx-1">→</span>
                        <span
                          className={
                            f.after.totalReturn >= 0
                              ? "text-bull font-bold"
                              : "text-bear font-bold"
                          }
                        >
                          {f.after.totalReturn >= 0 ? "+" : ""}
                          {f.after.totalReturn}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center num">
                        <span
                          className={
                            f.diff.totalReturn >= 0
                              ? "text-bull font-bold"
                              : "text-bear font-bold"
                          }
                        >
                          {f.diff.totalReturn >= 0 ? "+" : ""}
                          {f.diff.totalReturn}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* BİLGİ NOTU */}
          <div className="rounded-lg border border-border bg-secondary/20 p-4 text-xs text-muted-foreground">
            <p>
              💡 <strong>Backtest yaklaşımı:</strong> Bu backtest geçmiş
              sinyallerin <strong>sonuç fiyatlarını</strong> kullanır. Yeni
              parametrelerle hedef/stop mesafeleri yeniden hesaplanır ve eski
              sonuçlarla karşılaştırılır. Kesin simülasyon değildir, ancak
              parametrelerin etkisini gösterir.
            </p>
          </div>
        </>
      )}

      {/* VERİ YOK */}
      {!data && !loading && !error && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-4xl">🧪</p>
          <p className="mt-4 text-sm font-bold">
            Parametreleri ayarlayın ve "Backtest Çalıştır" butonuna basın
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Geçmiş sinyaller yeni parametrelerle test edilecek
          </p>
        </div>
      )}
    </div>
  );
}

// ==========================================================
// DIFF KART
// ==========================================================

function DiffCard({
  label,
  before,
  after,
  diff,
  format,
}: {
  label: string;
  before: number;
  after: number;
  diff: number;
  format: (v: number) => string;
}) {
  const diffColor =
    diff > 0 ? "text-bull" : diff < 0 ? "text-bear" : "text-muted-foreground";
  const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "=";

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="num text-sm text-muted-foreground">
          {format(before)}
        </span>
        <span className="text-muted-foreground">→</span>
        <span className="num text-xl font-bold">{format(after)}</span>
      </div>
      <p className={`mt-1 text-xs font-bold ${diffColor}`}>
        {arrow} {diff > 0 ? "+" : ""}
        {format(diff)}
      </p>
    </div>
  );
}