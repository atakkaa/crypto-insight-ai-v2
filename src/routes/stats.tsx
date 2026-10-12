// src/routes/stats.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
          <p className="text-2xl">🔒</p>
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

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-4">
      {/* BAŞLIK */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">📊 Formasyon Başarı İstatistikleri</h1>
          <p className="text-sm text-muted-foreground">
            Sonuçlanmış sinyallerin başarı oranları ve performansı
          </p>
        </div>

        {/* ZAMAN FİLTRESİ */}
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

      {/* İKİNCİ SATIR */}
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

      {/* FORMASYON TABLOSU */}
      {data.byFormation.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-3">
            <h2 className="text-sm font-bold">📋 Formasyon Bazlı Başarı</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-secondary/30">
                <tr>
                  <th className="p-2 text-left">Formasyon</th>
                  <th className="p-2 text-right">Toplam</th>
                  <th className="p-2 text-right">Başarılı</th>
                  <th className="p-2 text-right">Başarısız</th>
                  <th className="p-2 text-right">Başarı %</th>
                  <th className="p-2 text-right">Ort. Kazanç</th>
                  <th className="p-2 text-right">Ort. Kayıp</th>
                </tr>
              </thead>
              <tbody>
                {data.byFormation.map((f) => (
                  <tr key={f.name} className="border-b border-border/50">
                    <td className="p-2 font-bold">{f.name}</td>
                    <td className="p-2 text-right">{f.total}</td>
                    <td className="p-2 text-right text-bull">{f.wins}</td>
                    <td className="p-2 text-right text-bear">{f.losses}</td>
                    <td
                      className={`p-2 text-right font-bold ${
                        f.winRate >= 60
                          ? "text-bull"
                          : f.winRate >= 40
                            ? "text-amber-500"
                            : "text-bear"
                      }`}
                    >
                      {f.winRate}%
                    </td>
                    <td className="p-2 text-right text-bull">+{f.avgWin}%</td>
                    <td className="p-2 text-right text-bear">{f.avgLoss}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* COIN TABLOSU */}
      {data.bySymbol.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-3">
            <h2 className="text-sm font-bold">🪙 Coin/Hisse Bazlı Başarı</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-secondary/30">
                <tr>
                  <th className="p-2 text-left">Sembol</th>
                  <th className="p-2 text-left">Market</th>
                  <th className="p-2 text-right">Toplam</th>
                  <th className="p-2 text-right">Başarı %</th>
                </tr>
              </thead>
              <tbody>
                {data.bySymbol.map((s) => (
                  <tr key={s.symbol} className="border-b border-border/50">
                    <td className="p-2 font-bold">
                      {s.symbol.replace("USDT", "").replace(".IS", "")}
                    </td>
                    <td className="p-2 text-muted-foreground">{s.market}</td>
                    <td className="p-2 text-right">{s.total}</td>
                    <td
                      className={`p-2 text-right font-bold ${
                        s.winRate >= 60
                          ? "text-bull"
                          : s.winRate >= 40
                            ? "text-amber-500"
                            : "text-bear"
                      }`}
                    >
                      {s.winRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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