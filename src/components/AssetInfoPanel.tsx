import type { ReactNode } from "react";
import type { AssetInfo } from "@/lib/market.functions";

type NewsItem = {
  title: string;
  source: string;
  summary: string;
  detail: string;
  direction?: "yukarı" | "aşağı" | "yatay";
  strength?: "yüksek" | "orta" | "düşük";
  note?: string;
  link?: string;
};

type Props = {
  market: "crypto" | "bist" | "us" | "asia" | "europe";
  symbol: string;
  data: AssetInfo | null;
  loading: boolean;
  error?: string | null;
  news?: NewsItem[];
  newsLoading?: boolean;
};

function fmt(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
}

function money(value: number | null | undefined, currency = "") {
  if (value == null || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const suffix =
    abs >= 1e12 ? `${(value / 1e12).toFixed(2)} T` :
    abs >= 1e9 ? `${(value / 1e9).toFixed(2)} Mr` :
    abs >= 1e6 ? `${(value / 1e6).toFixed(2)} Mn` :
    fmt(value);
  return `${currency ? currency + " " : ""}${suffix}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="num max-w-[62%] text-right text-xs font-semibold">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-bold">
        <span>{title}</span>
        <span className="text-[10px] text-muted-foreground">▼</span>
      </summary>
      <div className="px-3 pb-2">{children}</div>
    </details>
  );
}

function directionLabel(value?: NewsItem["direction"]) {
  if (value === "yukarı") return "🟢 Pozitif";
  if (value === "aşağı") return "🔴 Negatif";
  if (value === "yatay") return "🟡 Nötr";
  return null;
}

export function AssetInfoPanel({
  market,
  symbol,
  data,
  loading,
  error,
  news = [],
  newsLoading = false,
}: Props) {
  const isCrypto = market === "crypto";
  const title = data?.name || symbol.replace(/USDT$/, "");

  return (
    <aside className="panel h-fit p-4 lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold">🔎 VARLIK BİLGİ PANELİ</h2>
          <p className="mt-1 truncate text-base font-bold">{title}</p>
          <p className="num mt-0.5 text-[11px] text-muted-foreground">
            {symbol.replace(/\.(IS|US)$/, "")}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-bull/10 px-2 py-1 text-[9px] font-bold text-bull">
          🟢 CANLI
        </span>
      </div>

      {loading && (
        <div className="mt-3 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
          Varlık bilgileri güncelleniyor...
        </div>
      )}

      {error && !loading && (
        <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 p-3 text-xs text-muted-foreground">
          {error}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {data ? (
          isCrypto ? (
            <>
              <Section title="💰 PİYASA BİLGİLERİ">
                <Row label="Piyasa değeri" value={money(data.marketCap, data.currency)} />
                <Row label="FDV" value={money(data.fdv, data.currency)} />
                <Row label="Piyasa sıralaması" value={data.marketRank ? `#${data.marketRank}` : "-"} />
                <Row label="24s hacim" value={money(data.volume24h, data.currency)} />
              </Section>

              <Section title="🪙 ARZ BİLGİLERİ">
                <Row label="Dolaşımdaki arz" value={fmt(data.circulatingSupply)} />
                <Row label="Toplam arz" value={fmt(data.totalSupply)} />
                <Row label="Maksimum arz" value={fmt(data.maxSupply)} />
                <Row label="Dolaşım oranı" value={data.circulationRatio == null ? "-" : `%${fmt(data.circulationRatio, 1)}`} />
                <Row label="Yakım bilgisi" value={data.burnInfo || "Veri mevcut değil"} />
              </Section>

              <Section title="🏆 TARİHSEL VERİLER">
                <Row label="ATH" value={money(data.ath, data.currency)} />
                <Row label="ATH tarihi" value={data.athDate || "-"} />
                <Row label="ATH'den değişim" value={data.athChange == null ? "-" : `%${fmt(data.athChange, 2)}`} />
                <Row label="ATL" value={money(data.atl, data.currency)} />
                <Row label="ATL tarihi" value={data.atlDate || "-"} />
                <Row label="ATL'den değişim" value={data.atlChange == null ? "-" : `%${fmt(data.atlChange, 2)}`} />
                <Row label="7 gün" value={data.change7d == null ? "-" : `%${fmt(data.change7d, 2)}`} />
                <Row label="30 gün" value={data.change30d == null ? "-" : `%${fmt(data.change30d, 2)}`} />
                <Row label="1 yıl" value={data.change1y == null ? "-" : `%${fmt(data.change1y, 2)}`} />
              </Section>

              <Section title="🌐 PROJE BİLGİLERİ">
                <Row label="Blockchain" value={data.blockchain || "-"} />
                <Row label="Kontrat" value={data.contract || "-"} />
                <Row label="Çıkış tarihi" value={data.inceptionDate || "-"} />
                <Row label="Web sitesi" value={data.website || "-"} />
              </Section>
            </>
          ) : (
            <>
              <Section title="🏢 ŞİRKET BİLGİLERİ">
                <Row label="Sektör" value={data.sector || "Veri mevcut değil"} />
                <Row label="Alt sektör" value={data.industry || "Veri mevcut değil"} />
                <Row label="Ülke" value={data.country || "Veri mevcut değil"} />
                <Row label="Borsa" value={data.exchange || "Veri mevcut değil"} />
                <Row label="Çalışan sayısı" value={data.employees == null ? "Veri mevcut değil" : fmt(data.employees, 0)} />
                <Row label="CEO" value={data.ceo || "Veri mevcut değil"} />
                <Row label="Kuruluş" value={data.founded || "Veri mevcut değil"} />
                <Row label="Web sitesi" value={data.website || "Veri mevcut değil"} />
              </Section>

              <Section title="💵 DEĞERLEME">
                <Row label="Piyasa değeri" value={money(data.marketCap, data.currency)} />
                <Row label="F/K" value={fmt(data.peRatio, 2)} />
                <Row label="İleri F/K" value={fmt(data.forwardPe, 2)} />
                <Row label="PD/DD" value={fmt(data.priceToBook, 2)} />
                <Row label="F/S" value={fmt(data.priceToSales, 2)} />
                <Row label="EV/EBITDA" value={fmt(data.evToEbitda, 2)} />
                <Row label="PEG" value={fmt(data.pegRatio, 2)} />
              </Section>

              <Section title="📊 FİNANSAL BİLGİLER">
                <Row label="Gelir" value={money(data.revenue, data.currency)} />
                <Row label="Net kâr" value={money(data.netIncome, data.currency)} />
                <Row label="FAVÖK / EBITDA" value={money(data.ebitda, data.currency)} />
                <Row label="EPS" value={fmt(data.eps, 2)} />
                <Row label="Serbest nakit akışı" value={money(data.freeCashFlow, data.currency)} />
                <Row label="Toplam borç" value={money(data.totalDebt, data.currency)} />
                <Row label="Özsermaye" value={money(data.equity, data.currency)} />
              </Section>

              <Section title="💰 TEMETTÜ">
                <Row label="Temettü verimi" value={data.dividendYield == null ? "-" : `%${fmt(data.dividendYield, 2)}`} />
                <Row label="Son temettü" value={money(data.lastDividend, data.currency)} />
                <Row label="Temettü tarihi" value={data.exDividendDate || "-"} />
                <Row label="Ödeme tarihi" value={data.dividendDate || "-"} />
              </Section>

              <Section title="📈 UZUN VADELİ PERFORMANS">
                <Row label="52 hafta yüksek" value={money(data.week52High, data.currency)} />
                <Row label="52 hafta düşük" value={money(data.week52Low, data.currency)} />
                <Row label="52 haftalık değişim" value={data.change52w == null ? "-" : `%${fmt(data.change52w, 2)}`} />
                <Row label="3 yıl" value={data.change3y == null ? "-" : `%${fmt(data.change3y, 2)}`} />
                <Row label="5 yıl" value={data.change5y == null ? "-" : `%${fmt(data.change5y, 2)}`} />
              </Section>

              <Section title="🏦 HİSSE YAPISI">
                <Row label="Dolaşımdaki hisse" value={data.sharesOutstanding == null ? "-" : fmt(data.sharesOutstanding, 0)} />
                <Row label="Toplam hisse" value={data.impliedSharesOutstanding == null ? "-" : fmt(data.impliedSharesOutstanding, 0)} />
                <Row label="Halka açıklık" value={data.floatShares == null ? "-" : fmt(data.floatShares, 0)} />
                <Row label="Kurumsal sahiplik" value={data.institutionalOwnership == null ? "-" : `%${fmt(data.institutionalOwnership, 2)}`} />
                <Row label="İçeriden sahiplik" value={data.insiderOwnership == null ? "-" : `%${fmt(data.insiderOwnership, 2)}`} />
              </Section>
            </>
          )
        ) : !loading ? (
          <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
            Ek varlık bilgileri şu anda veri sağlayıcıdan alınamadı.
          </div>
        ) : null}

        <Section title="📰 HABERLER">
          {newsLoading ? (
            <div className="py-2 text-xs text-muted-foreground">Haberler yükleniyor...</div>
          ) : news.length === 0 ? (
            <div className="py-2 text-xs text-muted-foreground">
              Bu varlık için gösterilecek haber bulunamadı.
            </div>
          ) : (
            <div className="space-y-2">
              {news.map((item, index) => {
                const direction = directionLabel(item.direction);
                const url = item.link;
                return (
                  <article key={`${item.title}-${index}`} className="rounded-lg border border-border/70 bg-background p-3">
                    <div className="text-xs font-bold leading-5">{item.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{item.source}</span>
                      {item.strength && <span>• Önem: {item.strength}</span>}
                      {direction && <span>• {direction}</span>}
                    </div>

                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      <span className="font-bold text-foreground">AI özeti: </span>
                      {item.summary || item.detail.slice(0, 280)}
                    </p>

                    {item.note && (
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                        {item.note}
                      </p>
                    )}

                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex rounded-md border border-primary/40 px-2.5 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/10"
                      >
                        HABERİN TAMAMINI OKU ↗
                      </a>
                    ) : (
                      <div className="mt-2 text-[9px] text-muted-foreground">
                        Kaynak bağlantısı mevcut değil.
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </Section>

        <p className="pt-1 text-[9px] leading-4 text-muted-foreground">
          Sağlanmayan bilgiler uydurulmaz; veri bulunamadığında "-" veya "Veri mevcut değil" gösterilir.
        </p>
      </div>
    </aside>
  );
}
