// src/routes/stats.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  Legend,
} from "recharts";

import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/stats")({
  component: StatsPage,
});

type StatsData = {
  success: boolean;
  tier: string;
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

const COLORS = {
  bull: "#22c55e",
  bear: "#ef4444",
  neutral: "#a855f7",
  amber: "#f59e0b",
  blue: "#3b82f6",
};

function StatsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setError(null);

    fetch(`/api/formation-stats?days=${days}`, {
      headers: {
        "x-user-id": user.id,
      },
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
  }, [user, days]);

  // Giriş yok
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

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">İstatistikler yükleniyor...</p>
      </div>
    );
  }

  // Premium gerekli
  if (error) {
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

  // Pie chart verisi (başarılı / başarısız)
  const winLossData = [
    { name: "Başarılı", value: data.general.wins, color: COLORS.bull },
    { name: "Başarısız", value: data.general.losses, color: COLORS.bear },
  ].filter((d) => d.value > 0);

  // Formasyon bar chart verisi (ilk 10)
  const formationChartData = data.byFormation
    .slice(0, 10)
    .map((f) => ({
      name: f.name.length > 15 ? f.name.slice(0, 15) + "..." : f.name,
      fullName: f.name,
      "Başarı %": f.winRate,
      "Toplam": f.total,
    }));

  // Coin bar chart verisi (ilk 10)
  const symbolChartData = data.bySymbol
    .slice(0, 10)
    .map((s) => ({
      name: s.symbol.replace("USDT", "").replace(".IS", "").slice(0, 10),
      fullName: s.symbol,
      "Başarı %": s.winRate,
      "Toplam": s.total,
    }));

  // Bias pie chart verisi
  const biasData = data.byBias.map((b) => ({
    name: b.bias === "yükseliş" ? "AL" : b.bias === "düşüş" ? "SAT" : "Nötr",
    value: b.total,
    color:
      b.bias === "yükseliş"
        ? COLORS.bull
        : b.bias === "düşüş"
          ? COLORS.bear
          : COLORS.neutral,
  }));

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-4">
      {/* BAŞLIK */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            📊 Formasyon Başarı İstatistikleri
          </h1>
          <p className="text-sm text-muted-foreground">
            Sonuçlanmış sinyallerin başarı oranları ve performansı
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Zaman:</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
          >
            <option value={7}>Son 7 gün</option>
            <option value={30}>Son 30 gün</option>
            <option value={90}>Son 90 gün</option>
            <option value={365}>Son 1 yıl</option>
          </select>
        </div>
      </div>

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

      {/* VERİ YOKSA UYARI */}
      {data.general.total === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-bold text-amber-500">
            ⏳ Henüz sonuçlanmış sinyal yok
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sinyaller kaydediliyor ancak henüz hedefe ulaşmadı veya stop olmadı.
            Birkaç gün sonra tekrar kontrol edin.
          </p>
        </div>
      )}

      {/* GRAFİKLER */}
      {data.general.total > 0 && (
        <>
          {/* PIE CHART SATIRI */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* BAŞARI ORANI PIE CHART */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-bold mb-4">🥧 Başarı Dağılımı</h2>
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

            {/* BIAS (AL/SAT) PIE CHART */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-bold mb-4">🎯 AL/SAT Dağılımı</h2>
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

          {/* FORMASYON BAR CHART */}
          {formationChartData.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-bold mb-4">
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

          {/* COIN BAR CHART */}
          {symbolChartData.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-bold mb-4">
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