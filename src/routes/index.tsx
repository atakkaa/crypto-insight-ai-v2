import { Joyride, STATUS, type EventData } from "react-joyride";
import { toast } from "sonner";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";

import { AssetInfoPanel } from "@/components/AssetInfoPanel";
import { CandleChart } from "@/components/CandleChart";
import { FormationEvaluationPanel, type FormationChatMessage } from "@/components/FormationEvaluationPanel";
import { NewsPanel, PredictionPanel, ReasoningPanel } from "@/components/AnalysisPanels";
import { NotificationBell } from "@/components/NotificationBell";
import { LimitReachedModal } from "@/components/LimitReachedModal";
import { useUserTier } from "@/hooks/useUserTier";
import { WelcomeGate } from "@/components/WelcomeGate";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { analyzeChart, type ChartAnalysis } from "@/lib/analysis.functions";
import { getAssetInfo, getStockCandles, type AssetInfo, type Candle } from "@/lib/market.functions";
import { getMarketNews, type NewsImpact } from "@/lib/news.functions";
import type { FormationEngineResult } from "@/lib/analysis-types";
import { subscribeToPush, requestPushPermission } from "@/lib/push";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { m?: Market; s?: string } => {
    const out: { m?: Market; s?: string } = {};
    if (search['m'] === "crypto" || search['m'] === "bist" || search['m'] === "us" || search['m'] === "asia" || search['m'] === "europe") out.m = search['m'] as Market;
    if (typeof search['s'] === "string" && search['s'].length > 0) out.s = search['s'].toUpperCase();
    return out;
  },
  head: () => ({
    meta: [
      { title: "Formasyon AI — Canlı Kripto ve Borsa Grafik Analizi" },
      {
        name: "description",
        content:
          "Binance ve borsa grafiklerini canlı izleyin; AI formasyonu grafiğe çizer, gerekçesini anlatır, alım satım senaryosu ve haber etkisi verir.",
      },
      { property: "og:title", content: "Formasyon AI — Canlı Kripto ve Borsa Grafik Analizi" },
      {
        property: "og:description",
        content:
          "Canlı mum grafiği üzerinde AI formasyon çizimi, gerekçe, alım satım tahmini ve haberlerin piyasa etkisi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const INTERVALS = ["15m", "1h", "4h", "1d"] as const;

type FormationAlert = {
  formationCompleted: boolean;
  volumeConfirmed: boolean;
  triggered: boolean;
  signal: "AL" | "SAT" | "BEKLE";
  message: string;
  reason: string;
};

type DashboardAnalysis = ChartAnalysis & {
  formationAlert?: FormationAlert;
  formationEngine?: FormationEngineResult | null;
};

function chartPoints(values: number[], width = 520, height = 150, padding = 8) {
  if (values.length === 0) return "";
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return "";

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(values.length - 1, 1)) *
          (width - padding * 2);
      const y =
        height -
        padding -
        ((value - min) / range) *
          (height - padding * 2);

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function multiChartPoints(
  seriesList: number[][],
  width = 520,
  height = 150,
  padding = 8,
) {
  const all = seriesList.flat().filter((v) => Number.isFinite(v));
  if (all.length === 0) return [];

  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;

  return seriesList.map((values) =>
    values
      .map((value, index) => {
        const x =
          padding +
          (index / Math.max(values.length - 1, 1)) *
            (width - padding * 2);
        const y =
          height -
          padding -
          ((value - min) / range) *
            (height - padding * 2);

        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" "),
  );
}

function IndicatorSparkline({
  values,
  title,
  valueLabel,
  emptyText = "Veri bekleniyor...",
}: {
  values: number[];
  title: string;
  valueLabel: string;
  emptyText?: string;
}) {
  const points = chartPoints(values);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold">{title}</span>
        <span className="num text-xs text-muted-foreground">{valueLabel}</span>
      </div>

      {points ? (
        <svg
          viewBox="0 0 520 150"
          className="h-32 w-full overflow-visible"
          preserveAspectRatio="none"
          aria-label={`${title} grafiği`}
        >
          <line
            x1="8"
            y1="142"
            x2="512"
            y2="142"
            stroke="currentColor"
            strokeOpacity="0.12"
          />
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          {emptyText}
        </div>
      )}
    </div>
  );
}

type Interval = (typeof INTERVALS)[number];
type Market = "crypto" | "bist" | "us" | "asia" | "europe";
type StockListItem = { symbol: string; name: string };

const BIST_TOP_50: StockListItem[] = [
  ["THYAO.IS", "Türk Hava Yolları"], ["ASELS.IS", "Aselsan"], ["TUPRS.IS", "Tüpraş"], ["BIMAS.IS", "BİM Birleşik Mağazalar"],
  ["GARAN.IS", "Garanti BBVA"], ["AKBNK.IS", "Akbank"], ["ISCTR.IS", "İş Bankası C"], ["YKBNK.IS", "Yapı Kredi"],
  ["KCHOL.IS", "Koç Holding"], ["SAHOL.IS", "Sabancı Holding"], ["SISE.IS", "Şişecam"], ["EREGL.IS", "Ereğli Demir Çelik"],
  ["PETKM.IS", "Petkim"], ["FROTO.IS", "Ford Otosan"], ["TOASO.IS", "Tofaş"], ["TAVHL.IS", "TAV Havalimanları"],
  ["TCELL.IS", "Turkcell"], ["MGROS.IS", "Migros"], ["ENKAI.IS", "Enka İnşaat"], ["HEKTS.IS", "Hektaş"],
  ["SASA.IS", "Sasa Polyester"], ["PGSUS.IS", "Pegasus"], ["AEFES.IS", "Anadolu Efes"], ["ULKER.IS", "Ülker Bisküvi"],
  ["DOAS.IS", "Doğuş Otomotiv"], ["KOZAL.IS", "Koza Altın"], ["KRDMD.IS", "Kardemir D"], ["ALARK.IS", "Alarko Holding"],
  ["CCOLA.IS", "Coca-Cola İçecek"], ["OYAKC.IS", "Oyak Çimento"], ["ASTOR.IS", "Astor Enerji"], ["KONTR.IS", "Kontrolmatik"],
  ["MIATK.IS", "Mia Teknoloji"], ["GUBRF.IS", "Gübre Fabrikaları"], ["VESTL.IS", "Vestel"], ["ARCLK.IS", "Arçelik"],
  ["TKFEN.IS", "Tekfen Holding"], ["ENJSA.IS", "Enerjisa"], ["CIMSA.IS", "Çimsa"], ["ALBRK.IS", "Albaraka Türk"],
  ["VAKBN.IS", "VakıfBank"], ["HALKB.IS", "Halkbank"], ["TSKB.IS", "TSKB"], ["ODAS.IS", "Odaş Elektrik"],
  ["IPEKE.IS", "İpek Doğal Enerji"], ["KRDMA.IS", "Kardemir A"], ["KARSN.IS", "Karsan"], ["AKSA.IS", "Aksa Akrilik"],
  ["ISMEN.IS", "İş Yatırım"], ["MPARK.IS", "MLP Sağlık"],
].map(([symbol, name]) => ({ symbol: symbol!, name: name! }));

const US_TOP_50: StockListItem[] = [
  ["AAPL.US", "Apple"], ["MSFT.US", "Microsoft"], ["NVDA.US", "NVIDIA"], ["AMZN.US", "Amazon"], ["GOOGL.US", "Alphabet"],
  ["META.US", "Meta Platforms"], ["AVGO.US", "Broadcom"], ["TSLA.US", "Tesla"], ["BRK-B.US", "Berkshire Hathaway"], ["JPM.US", "JPMorgan Chase"],
  ["WMT.US", "Walmart"], ["ORCL.US", "Oracle"], ["LLY.US", "Eli Lilly"], ["V.US", "Visa"], ["MA.US", "Mastercard"],
  ["XOM.US", "Exxon Mobil"], ["COST.US", "Costco"], ["NFLX.US", "Netflix"], ["AMD.US", "AMD"], ["CRM.US", "Salesforce"],
  ["QCOM.US", "Qualcomm"], ["CSCO.US", "Cisco"], ["IBM.US", "IBM"], ["NOW.US", "ServiceNow"], ["PLTR.US", "Palantir"],
  ["MU.US", "Micron"], ["AMAT.US", "Applied Materials"], ["TXN.US", "Texas Instruments"], ["INTU.US", "Intuit"], ["CAT.US", "Caterpillar"],
  ["GE.US", "GE Aerospace"], ["BA.US", "Boeing"], ["MCD.US", "McDonald's"], ["KO.US", "Coca-Cola"], ["PEP.US", "PepsiCo"],
  ["DIS.US", "Walt Disney"], ["NKE.US", "Nike"], ["SBUX.US", "Starbucks"], ["TMO.US", "Thermo Fisher"], ["ABBV.US", "AbbVie"],
  ["JNJ.US", "Johnson & Johnson"], ["MRK.US", "Merck"], ["PFE.US", "Pfizer"], ["UNH.US", "UnitedHealth"], ["CVX.US", "Chevron"],
  ["COP.US", "ConocoPhillips"], ["GS.US", "Goldman Sachs"], ["MS.US", "Morgan Stanley"], ["BAC.US", "Bank of America"], ["UBER.US", "Uber"],
].map(([symbol, name]) => ({ symbol: symbol!, name: name! }));

const ASIA_TOP_50: StockListItem[] = [
  ["7203.T", "Toyota"], ["6758.T", "Sony Group"], ["9984.T", "SoftBank Group"], ["6861.T", "Keyence"], ["8306.T", "Mitsubishi UFJ"],
  ["8035.T", "Tokyo Electron"], ["9432.T", "NTT"], ["6501.T", "Hitachi"], ["6098.T", "Recruit Holdings"], ["4063.T", "Shin-Etsu Chemical"],
  ["4502.T", "Takeda Pharmaceutical"], ["7267.T", "Honda"], ["9433.T", "KDDI"], ["6902.T", "Denso"], ["2914.T", "Japan Tobacco"],
  ["8058.T", "Mitsubishi"], ["8001.T", "Itochu"], ["8031.T", "Mitsui"], ["8766.T", "Tokio Marine"], ["7974.T", "Nintendo"],
  ["005930.KS", "Samsung Electronics"], ["000660.KS", "SK Hynix"], ["035420.KS", "NAVER"], ["035720.KS", "Kakao"], ["005380.KS", "Hyundai Motor"],
  ["012330.KS", "Hyundai Mobis"], ["105560.KS", "KB Financial"], ["055550.KS", "Shinhan Financial"], ["051910.KS", "LG Chem"], ["066570.KS", "LG Electronics"],
  ["0700.HK", "Tencent"], ["9988.HK", "Alibaba"], ["3690.HK", "Meituan"], ["0941.HK", "China Mobile"], ["1810.HK", "Xiaomi"],
  ["1299.HK", "AIA Group"], ["2318.HK", "Ping An Insurance"], ["0005.HK", "HSBC Holdings"], ["9618.HK", "JD.com"], ["1024.HK", "Kuaishou"],
  ["RELIANCE.NS", "Reliance Industries"], ["TCS.NS", "Tata Consultancy Services"], ["HDFCBANK.NS", "HDFC Bank"], ["INFY.NS", "Infosys"], ["ICICIBANK.NS", "ICICI Bank"],
  ["BHARTIARTL.NS", "Bharti Airtel"], ["ITC.NS", "ITC"], ["SBIN.NS", "State Bank of India"], ["HINDUNILVR.NS", "Hindustan Unilever"], ["LT.NS", "Larsen & Toubro"],
].map(([symbol, name]) => ({ symbol: symbol!, name: name! }));

const EUROPE_TOP_50: StockListItem[] = [
  ["SAP.DE", "SAP"], ["SIE.DE", "Siemens"], ["ALV.DE", "Allianz"], ["DTE.DE", "Deutsche Telekom"], ["AIR.PA", "Airbus"],
  ["ASML.AS", "ASML"], ["NESN.SW", "Nestlé"], ["ROG.SW", "Roche"], ["NOVN.SW", "Novartis"], ["NOVO-B.CO", "Novo Nordisk"],
  ["SHEL.L", "Shell"], ["AZN.L", "AstraZeneca"], ["HSBA.L", "HSBC"], ["ULVR.L", "Unilever"], ["BP.L", "BP"],
  ["GSK.L", "GSK"], ["RIO.L", "Rio Tinto"], ["LSEG.L", "London Stock Exchange Group"], ["REL.L", "RELX"], ["VOD.L", "Vodafone"],
  ["LVMH.PA", "LVMH"], ["TTE.PA", "TotalEnergies"], ["OR.PA", "L'Oréal"], ["SAN.PA", "Sanofi"], ["MC.PA", "LVMH Moët Hennessy"],
  ["SU.PA", "Schneider Electric"], ["BNP.PA", "BNP Paribas"], ["AI.PA", "Air Liquide"], ["SAF.PA", "Safran"], ["CS.PA", "AXA"],
  ["ENEL.MI", "Enel"], ["ENI.MI", "Eni"], ["ISP.MI", "Intesa Sanpaolo"], ["UCG.MI", "UniCredit"], ["STLAM.MI", "Stellantis"],
  ["IBE.MC", "Iberdrola"], ["ITX.MC", "Inditex"], ["SAN.MC", "Banco Santander"], ["BBVA.MC", "BBVA"], ["REP.MC", "Repsol"],
  ["INGA.AS", "ING"], ["ADYEN.AS", "Adyen"], ["PHIA.AS", "Philips"], ["HEIA.AS", "Heineken"], ["UNA.AS", "Unilever"],
  ["VOLV-B.ST", "Volvo"], ["ERIC-B.ST", "Ericsson"], ["EQNR.OL", "Equinor"], ["NOKIA.HE", "Nokia"], ["DSV.V", "DSV"],
].map(([symbol, name]) => ({ symbol: symbol!, name: name! }));

const MARKET_LABELS: Record<Market, string> = { crypto: "KRİPTO", bist: "BIST", us: "ABD", asia: "ASYA", europe: "AVRUPA" };

type CustomMarketItem = {
  id: string;
  market: Market;
  symbol: string;
  name: string;
};

const CUSTOM_MARKET_STORAGE_KEY = "formasyon-ai-custom-market-items-v1";
const PRIORITY_MARKET_STORAGE_KEY = "formasyon-ai-priority-assets-v1";
const FAVORITES_MARKET_STORAGE_KEY = "formasyon-ai-favorites-v1";

type MarketAssetRef = {
  market: Market;
  symbol: string;
};

type Ticker = { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string };

async function fetchTickers(): Promise<Ticker[]> {
  const res = await fetch("/api/binance-proxy?path=/api/v3/ticker/24hr");
  if (!res.ok) throw new Error("Binance verisi alınamadı");
  const data = (await res.json()) as Ticker[];
  return data
    .filter((t) => t.symbol.endsWith("USDT") && !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume));
}

async function fetchKlines(symbol: string, interval: Interval): Promise<Candle[]> {
  const proxyPath = `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=150`;
  const res = await fetch(
    `/api/binance-proxy?path=${encodeURIComponent(proxyPath)}`,
  );
  if (!res.ok) throw new Error("Mum verisi alınamadı");
  const raw = (await res.json()) as unknown[][];
  return raw.map((k) => ({
    time: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

function fmtPrice(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) return value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toPrecision(4);
}

function normalizeCustomAsset(input: string, selectedMarket: Market, tickers: Ticker[]): {
  market: Market;
  symbol: string;
  name: string;
} {
  let value = input.trim().toUpperCase();

  const explicit = value.match(/^(KRIPTO|KRİPTO|BIST|ABD|US|ASYA|AVRUPA|EUROPE)\s*[:\-]\s*(.+)$/);
  if (explicit) {
    const key = explicit[1] ?? "";
    value = (explicit[2] ?? "").trim();
    const explicitMarket: Market =
      key === "KRIPTO" || key === "KRİPTO" ? "crypto" :
      key === "BIST" ? "bist" :
      key === "ABD" || key === "US" ? "us" :
      key === "ASYA" ? "asia" : "europe";
    if (explicitMarket === "crypto") {
      if (!/(USDT|BUSD|FDUSD)$/.test(value)) value = `${value}USDT`;
    } else if (!/[.]/.test(value)) {
      const suffixMap: Record<Exclude<Market, "crypto">, string> = {
        bist: ".IS", us: ".US", asia: ".T", europe: ".DE",
      };
      value = `${value}${suffixMap[explicitMarket]}`;
    }
    return { market: explicitMarket, symbol: value, name: value };
  }

  const cryptoCandidate = value.replace(/\s+/g, "");
  const matchingTicker = tickers.find((t) =>
    t.symbol === cryptoCandidate ||
    t.symbol === `${cryptoCandidate}USDT`,
  );
  if (matchingTicker) {
    return { market: "crypto", symbol: matchingTicker.symbol, name: matchingTicker.symbol.replace("USDT", "") };
  }

  if (/\.IS$/.test(value)) return { market: "bist", symbol: value, name: value.replace(".IS", "") };
  if (/\.US$/.test(value)) return { market: "us", symbol: value, name: value.replace(".US", "") };
  if (/\.(T|KS|HK|NS)$/.test(value)) return { market: "asia", symbol: value, name: value.replace(/\.[A-Z]+$/, "") };
  if (/\.(DE|PA|L|MI|MC|AS|ST|OL|HE|SW|CO)$/.test(value)) return { market: "europe", symbol: value, name: value.replace(/\.[A-Z-]+$/, "") };

  if (selectedMarket !== "crypto") {
    const suffixMap: Record<Exclude<Market, "crypto">, string> = {
      bist: ".IS", us: ".US", asia: ".T", europe: ".DE",
    };
    const symbol = `${value}${suffixMap[selectedMarket]}`;
    return { market: selectedMarket, symbol, name: value };
  }

  if (!/(USDT|BUSD|FDUSD)$/.test(value)) value = `${value}USDT`;
  return { market: "crypto", symbol: value, name: value.replace(/USDT$|BUSD$|FDUSD$/, "") };
}

function isCryptoMarket(market: Market) { return market === "crypto"; }
function isStockMarket(market: Market) { return market !== "crypto"; }
function stockListForMarket(market: Market): StockListItem[] {
  if (market === "bist") return BIST_TOP_50;
  if (market === "us") return US_TOP_50;
  if (market === "asia") return ASIA_TOP_50;
  return EUROPE_TOP_50;
}
function IndicatorPanel({
  analysis,
  loading,
}: {
  analysis: ChartAnalysis | null;
  loading: boolean;
}) {
  const values = analysis?.indicatorValues ?? null;
  const series = analysis?.indicatorSeries ?? null;
  const indicatorAnalysis = analysis?.indicatorAnalysis ?? null;

  const emaPoints = series
    ? multiChartPoints([
        series.ema20.map((p) => p.value),
        series.ema50.map((p) => p.value),
        series.ema200.map((p) => p.value),
      ])
    : [];

  const bollingerPoints = series
    ? multiChartPoints([
        series.bollingerUpper.map((p) => p.value),
        series.bollingerMiddle.map((p) => p.value),
        series.bollingerLower.map((p) => p.value),
      ])
    : [];

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">📊 İNDİKATÖRLER</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            RSI, MACD, hareketli ortalamalar, Bollinger, ADX ve hacim.
          </p>
        </div>

        {loading && (
          <span className="rounded-md bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            İndikatörler hesaplanıyor...
          </span>
        )}
      </div>

      {!values || !series ? (
        <div className="mt-4 rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {loading
            ? "İndikatör verileri hazırlanıyor..."
            : "İndikatör verisi henüz oluşmadı."}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">RSI (14)</p>
              <p className="num mt-1 text-xl font-bold">
                {values.rsi.toFixed(2)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {values.rsi >= 70
                  ? "Aşırı alım"
                  : values.rsi <= 30
                    ? "Aşırı satım"
                    : values.rsi >= 50
                      ? "Pozitif momentum"
                      : "Zayıf momentum"}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">MACD</p>
              <p className="num mt-1 text-xl font-bold">
                {values.macd.toFixed(4)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Hist: {values.macdHistogram.toFixed(4)}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">ADX (14)</p>
              <p className="num mt-1 text-xl font-bold">
                {values.adx.toFixed(2)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {values.adx >= 25 ? "Trend güçlü" : "Trend zayıf/kararsız"}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Hacim / Ort.</p>
              <p className="num mt-1 text-xl font-bold">
                {(values.volumeRatio * 100).toFixed(0)}%
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Güncel: {fmtPrice(values.volume)}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <IndicatorSparkline
              values={series.rsi.map((p) => p.value)}
              title="RSI (14)"
              valueLabel={values.rsi.toFixed(2)}
            />

            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold">MACD</span>
                <span className="num text-xs text-muted-foreground">
                  {values.macd.toFixed(4)}
                </span>
              </div>

              <svg
                viewBox="0 0 520 150"
                className="h-32 w-full overflow-visible"
                preserveAspectRatio="none"
                aria-label="MACD grafiği"
              >
                <line
                  x1="8"
                  y1="75"
                  x2="512"
                  y2="75"
                  stroke="currentColor"
                  strokeOpacity="0.18"
                />
                {series.macdHistogram.slice(-120).map((point, index, arr) => {
                  const maxAbs =
                    Math.max(
                      ...arr.map((item) => Math.abs(item.value)),
                      1,
                    );
                  const x = 8 + (index / Math.max(arr.length - 1, 1)) * 504;
                  const barHeight = (Math.abs(point.value) / maxAbs) * 62;
                  const y = point.value >= 0 ? 75 - barHeight : 75;

                  return (
                    <rect
                      key={`${point.index}-${index}`}
                      x={x - 1}
                      y={y}
                      width="2"
                      height={barHeight}
                      fill="currentColor"
                      opacity="0.28"
                    />
                  );
                })}
                <polyline
                  points={chartPoints(
                    series.macd.slice(-120).map((p) => p.value),
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={chartPoints(
                    series.macdSignal.slice(-120).map((p) => p.value),
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.55"
                />
              </svg>
            </div>

            <div className="rounded-lg border border-border bg-card p-3 lg:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">EMA 20 / 50 / 200</span>
                <span className="num text-xs text-muted-foreground">
                  {values.ema20.toFixed(2)} / {values.ema50.toFixed(2)} /{" "}
                  {values.ema200.toFixed(2)}
                </span>
              </div>

              <svg
                viewBox="0 0 520 150"
                className="h-32 w-full overflow-visible"
                preserveAspectRatio="none"
                aria-label="EMA grafikleri"
              >
                <polyline
                  points={emaPoints[0] ?? ""}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={emaPoints[1] ?? ""}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeDasharray="6 3"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.7"
                />
                <polyline
                  points={emaPoints[2] ?? ""}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="2 4"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.5"
                />
              </svg>

              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span>EMA20</span>
                <span>EMA50</span>
                <span>EMA200</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-3 lg:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">Bollinger Bands</span>
                <span className="num text-xs text-muted-foreground">
                  Üst: {fmtPrice(values.bollingerUpper)} · Orta:{" "}
                  {fmtPrice(values.bollingerMiddle)} · Alt:{" "}
                  {fmtPrice(values.bollingerLower)}
                </span>
              </div>

              <svg
                viewBox="0 0 520 150"
                className="h-32 w-full overflow-visible"
                preserveAspectRatio="none"
                aria-label="Bollinger Bands grafiği"
              >
                <polyline
                  points={bollingerPoints[0] ?? ""}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.55"
                />
                <polyline
                  points={bollingerPoints[1] ?? ""}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={bollingerPoints[2] ?? ""}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.55"
                />
              </svg>

              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span>Üst bant</span>
                <span>Orta bant</span>
                <span>Alt bant</span>
              </div>
            </div>

            <IndicatorSparkline
              values={series.adx.map((p) => p.value)}
              title="ADX (14)"
              valueLabel={values.adx.toFixed(2)}
            />

            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold">Hacim / Ortalama</span>
                <span className="num text-xs text-muted-foreground">
                  {(values.volumeRatio * 100).toFixed(0)}%
                </span>
              </div>

              <svg
                viewBox="0 0 520 150"
                className="h-32 w-full overflow-visible"
                preserveAspectRatio="none"
                aria-label="Hacim grafiği"
              >
                <polyline
                  points={chartPoints(
                    series.volume.slice(-120).map((p) => p.value),
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={chartPoints(
                    series.averageVolume
                      .slice(-120)
                      .map((p) => p.value),
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.55"
                />
              </svg>

              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span>Hacim</span>
                <span>20 mum ortalaması</span>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">EMA20</p>
              <p className="num mt-1 font-bold">{fmtPrice(values.ema20)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">EMA50</p>
              <p className="num mt-1 font-bold">{fmtPrice(values.ema50)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">EMA200</p>
              <p className="num mt-1 font-bold">{fmtPrice(values.ema200)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">MACD Signal</p>
              <p className="num mt-1 font-bold">
                {values.macdSignal.toFixed(4)}
              </p>
            </div>
          </div>

          {indicatorAnalysis && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold">🧠 İNDİKATÖR YORUMU</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Gemini'nin göstergeleri birlikte değerlendirdiği teknik senaryo.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-secondary px-3 py-1.5 text-xs font-bold">
                    {indicatorAnalysis.direction}
                  </span>
                  <span className="num rounded-md border border-border px-3 py-1.5 text-xs font-bold">
                    %{indicatorAnalysis.confidence}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6">
                {indicatorAnalysis.summary}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-bold">RSI</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {indicatorAnalysis.rsiComment}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-bold">MACD</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {indicatorAnalysis.macdComment}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-bold">EMA</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {indicatorAnalysis.emaComment}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-bold">Bollinger Bands</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {indicatorAnalysis.bollingerComment}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-bold">ADX</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {indicatorAnalysis.adxComment}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-bold">Hacim</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {indicatorAnalysis.volumeComment}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-border p-3">
                <p className="text-xs font-bold">Birleşik Teknik Değerlendirme</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {indicatorAnalysis.combinedComment}
                </p>
              </div>

              {indicatorAnalysis.reasons.length > 0 && (
                <div className="mt-3 rounded-lg border border-border p-3">
                  <p className="text-xs font-bold">Öne Çıkan Gerekçeler</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {indicatorAnalysis.reasons.map((reason, index) => (
                      <li key={`${index}-${reason}`} className="flex gap-2">
                        <span>•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3">
                <p className="text-xs font-bold">Risk Notu</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {indicatorAnalysis.riskNote}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FormationAlertPanel({
  symbol,
  analysis,
}: {
  symbol: string;
  analysis: DashboardAnalysis | null;
}) {
  const alert = analysis?.formationAlert;

  if (!analysis || !alert) {
    return (
      <section className="panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">🔔 FORMASYON + HACİM UYARISI</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Formasyon tamamlanması ve hacim teyidi birlikte kontrol edilir.
            </p>
          </div>
          <span className="rounded-md bg-secondary px-3 py-1.5 text-xs font-bold">
            BEKLE
          </span>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Henüz formasyon uyarısı oluşmadı.
        </div>
      </section>
    );
  }

  const isBuy = alert.triggered && alert.signal === "AL";
  const isSell = alert.triggered && alert.signal === "SAT";

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">🔔 FORMASYON + HACİM UYARISI</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {symbol} için formasyon kırılımı ve hacim teyidi.
          </p>
        </div>

        <span
          className={`rounded-md px-3 py-1.5 text-xs font-bold ${
            isBuy
              ? "bg-bull text-bull-foreground"
              : isSell
                ? "bg-bear text-bear-foreground"
                : "bg-secondary text-secondary-foreground"
          }`}
        >
          {isBuy ? "🟢 ALIŞ UYARISI" : isSell ? "🔴 SATIŞ UYARISI" : "BEKLE"}
        </span>
      </div>

      <div
        className={`mt-4 rounded-xl border p-4 ${
          isBuy
            ? "border-bull/40 bg-bull/10"
            : isSell
              ? "border-bear/40 bg-bear/10"
              : "border-border bg-card"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold">
              {isBuy
                ? "🟢 ALIŞ FORMASYONU TAMAMLANDI"
                : isSell
                  ? "🔴 SATIŞ FORMASYONU TAMAMLANDI"
                  : "⏳ FORMASYON TEYİDİ BEKLENİYOR"}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {analysis.pattern.name}
            </p>
          </div>

          <span className="num rounded-md border border-border bg-card px-3 py-1.5 text-xs font-bold">
            Güven: %{Number(analysis.pattern.confidence ?? 0).toFixed(0)}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Formasyon durumu</p>
            <p className="mt-1 text-sm font-bold">
              {alert.formationCompleted ? "✅ TAMAMLANDI" : "⏳ TAMAMLANMADI"}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Hacim teyidi</p>
            <p className="mt-1 text-sm font-bold">
              {alert.volumeConfirmed ? "✅ ONAYLI" : "❌ YETERSİZ"}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-bold">Durum</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {alert.message}
          </p>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-bold">Neden?</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {alert.reason}
          </p>
        </div>
      </div>
    </section>
  );
}

const EMPTY_USER_DRAWING_LINES: import("@/components/CandleChart").TradingViewLine[] = [];
const EMPTY_FORMATION_MESSAGES: FormationChatMessage[] = [];
function Dashboard() {
    // ==========================================================
  // ONBOARDING TURU STATE
  // ==========================================================
  const [runTour, setRunTour] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
    const { tierInfo } = useUserTier();
  const [limitModal, setLimitModal] = useState<{
    open: boolean;
    type: "favorites" | "priority";
  }>({ open: false, type: "favorites" });
  const routeSearch = Route.useSearch();
  const [market, setMarket] = useState<Market>(routeSearch.m ?? "crypto");
  const [symbol, setSymbol] = useState(
    routeSearch.m === "crypto" && routeSearch.s ? routeSearch.s : "BTCUSDT",
  );
  const [stockSymbol, setStockSymbol] = useState(
    routeSearch.m !== "crypto" && routeSearch.s ? routeSearch.s : "AAPL.US",
  );
  const [stockInput, setStockInput] = useState(
    routeSearch.m !== "crypto" && routeSearch.s ? routeSearch.s : "AAPL.US",
  );
  const [interval, setIntervalValue] = useState<Interval>("1h");
  const [search, setSearch] = useState("");
  const [showAllMarkets, setShowAllMarkets] = useState(false);
  const [customItems, setCustomItems] = useState<CustomMarketItem[]>([]);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [customAssetInput, setCustomAssetInput] = useState("");
  const [customAssetError, setCustomAssetError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DashboardAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [favorites, setFavorites] = useState<Array<{ market: string; symbol: string }>>([]);
  const [priorityAssets, setPriorityAssets] = useState<MarketAssetRef[]>([]);
  const [priorityPromptAsset, setPriorityPromptAsset] = useState<MarketAssetRef | null>(null);
  type UserFormationStore = Record<string, import("@/components/CandleChart").TradingViewLine[]>;
  type FormationChatStore = Record<string, FormationChatMessage[]>;

  const [userFormations, setUserFormations] = useState<UserFormationStore>({});
  const [formationChats, setFormationChats] = useState<FormationChatStore>({});
  const [formationEvaluationOpen, setFormationEvaluationOpen] = useState<Record<string, boolean>>({});
  const [showFormationCloseDialog, setShowFormationCloseDialog] = useState(false);
    // ==========================================================
  // KISA VADELİ TAKİP (FREE ÜYE LİMİTİ)
  // ==========================================================
  const [shortTermTracked, setShortTermTracked] = useState<Array<{ market: string; symbol: string }>>([]);
  const [shortTermModal, setShortTermModal] = useState(false);
  // ==========================================================
  // KISA VADELİ ANALİZ STATE'LERİ
  // ==========================================================
  const [shortTermAnalysis, setShortTermAnalysis] = useState<DashboardAnalysis | null>(null);
  const [shortTermAnalyzing, setShortTermAnalyzing] = useState(false);
  const [showShortTerm, setShowShortTerm] = useState(false);
  const shortTermCacheKey = `formasyon-ai-short-term-v1`;
  const runAnalysis = useServerFn(analyzeChart);
  const loadStock = useServerFn(getStockCandles);
  const loadAssetInfo = useServerFn(getAssetInfo);
  const loadNews = useServerFn(getMarketNews);

  const activeSymbol = market === "crypto" ? symbol : stockSymbol;
  const formationKey = `${market}:${activeSymbol}:${interval}`;
  const userDrawingLines = userFormations[formationKey] ?? EMPTY_USER_DRAWING_LINES;
  const formationMessages = formationChats[formationKey] ?? EMPTY_FORMATION_MESSAGES;
  const showFormationEvaluation = formationEvaluationOpen[formationKey] === true;

  const tickers = useQuery({
    queryKey: ["tickers"],
    queryFn: fetchTickers,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const cryptoCandles = useQuery({
    queryKey: ["klines", symbol, interval],
    queryFn: () => fetchKlines(symbol, interval),
    enabled: market === "crypto",
    refetchInterval: 15_000,
  });

  const stockCandles = useQuery({
    queryKey: ["stock", stockSymbol, interval],
    queryFn: () => loadStock({ data: { symbol: stockSymbol, interval } }),
    enabled: isStockMarket(market),
    refetchInterval: 60_000,
    retry: 0,
  });

  const assetInfo = useQuery<AssetInfo | null>({
    queryKey: ["asset-info", market, activeSymbol],
    queryFn: () => loadAssetInfo({ data: { market, symbol: activeSymbol } }),
    enabled: Boolean(activeSymbol),
    refetchInterval: market === "crypto" ? 60_000 : 300_000,
    staleTime: 30_000,
    retry: 0,
  });

  const news = useQuery({
    queryKey: ["news"],
    queryFn: () => loadNews(),
    refetchInterval: 300_000,
  });

  const candles: Candle[] = useMemo(() => {
    if (market === "crypto") return cryptoCandles.data ?? [];
    return stockCandles.data?.candles ?? [];
  }, [market, cryptoCandles.data, stockCandles.data]);

  const ticker = tickers.data?.find((t) => t.symbol === symbol);
  const last = candles.at(-1);
  const prev = candles.at(-2);
  const stockMeta = stockCandles.data;
  const livePrice =
    market === "crypto"
      ? ticker
        ? Number(ticker.lastPrice)
        : (last?.close ?? NaN)
      : (stockMeta?.price ?? last?.close ?? NaN);
  const changePct =
    market === "crypto" && ticker
      ? Number(ticker.priceChangePercent)
      : market !== "crypto" && stockMeta?.changePercent != null
        ? stockMeta.changePercent
        : last && prev
          ? ((last.close - prev.close) / prev.close) * 100
          : NaN;

  const cryptoList = useMemo(() => {
    const list = tickers.data ?? [];
    const q = search.trim().toUpperCase();
    return (q ? list.filter((t) => t.symbol.includes(q)) : list).slice(0, 100);
  }, [tickers.data, search]);

  const stockList = useMemo(() => {
    const list = stockListForMarket(market);
    const q = search.trim().toUpperCase();
    return q
      ? list.filter((item) => `${item.symbol} ${item.name}`.toUpperCase().includes(q))
      : list;
  }, [market, search]);
    // Service Worker kaydı (PWA + Push için)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      console.warn("Service Worker desteklenmiyor");
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("✅ Service Worker kaydedildi:", registration.scope);
      })
      .catch((error) => {
        console.error("❌ Service Worker kaydedilemedi:", error);
      });
  }, []);
    // Service Worker kaydı (PWA + Push için)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      console.warn("Service Worker desteklenmiyor");
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("✅ Service Worker kaydedildi:", registration.scope);
      })
      .catch((error) => {
        console.error("❌ Service Worker kaydedilemedi:", error);
      });
  }, []);

  // Kullanıcı giriş yapınca push aboneliği oluştur
  useEffect(() => {
    if (!user) return;

    void (async () => {
      const granted = await requestPushPermission();
      if (granted) {
        await subscribeToPush(user.id);
      }
    })();
  }, [user]);
    // Kullanıcı giriş yapınca push aboneliği oluştur
  useEffect(() => {
    if (!user) return;

    void (async () => {
      const granted = await requestPushPermission();
      if (granted) {
        await subscribeToPush(user.id);
      }
    })();
  }, [user]);

  // ==========================================================
  // ONBOARDING KONTROLÜ - YENİ EKLENEN
  // ==========================================================
  useEffect(() => {
    if (!user) return;

    void (async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("has_seen_onboarding")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Onboarding kontrolü hatası:", error);
        return;
      }

      if (data && data.has_seen_onboarding === false) {
        void navigate({ to: "/onboarding" });
      }
    })();
  }, [user, navigate]);

  useEffect(() => {
    if (!routeSearch.s) return;
    const nextMarket = routeSearch.m ?? "crypto";
    setMarket(nextMarket);
    if (nextMarket !== "crypto") {
      setStockSymbol(routeSearch.s);
      setStockInput(routeSearch.s);
    } else {
      setSymbol(routeSearch.s);
    }
  }, [routeSearch.m, routeSearch.s]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_MARKET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setCustomItems(parsed.filter((item): item is CustomMarketItem =>
          !!item && typeof item === "object" &&
          typeof (item as CustomMarketItem).id === "string" &&
          typeof (item as CustomMarketItem).market === "string" &&
          typeof (item as CustomMarketItem).symbol === "string" &&
          typeof (item as CustomMarketItem).name === "string"
        ));
      }
    } catch {
      // Bozuk localStorage verisi varsa uygulamanın çalışmasını engelleme.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CUSTOM_MARKET_STORAGE_KEY, JSON.stringify(customItems));
    } catch {
      // Tarayıcı depolaması kapalıysa liste sadece bu oturumda tutulur.
    }
  }, [customItems]);

  function openCustomAsset(item: CustomMarketItem) {
    setMarket(item.market);
    setSearch("");
    setShowAllMarkets(false);
    if (item.market === "crypto") {
      setSymbol(item.symbol);
    } else {
      setStockSymbol(item.symbol);
      setStockInput(item.symbol);
    }
  }

  function addCustomAsset() {
    const raw = customAssetInput.trim();
    if (!raw) {
      setCustomAssetError("Bir coin veya hisse sembolü yazın.");
      return;
    }

    const resolved = normalizeCustomAsset(raw, market, tickers.data ?? []);
    const exists = customItems.some((item) =>
      item.market === resolved.market && item.symbol === resolved.symbol,
    );

    if (exists) {
      setCustomAssetError("Bu varlık zaten eklenmiş.");
      openCustomAsset(customItems.find((item) =>
        item.market === resolved.market && item.symbol === resolved.symbol,
      )!);
      setShowAddAsset(false);
      return;
    }

    const item: CustomMarketItem = {
      id: `${resolved.market}-${resolved.symbol}-${Date.now()}`,
      ...resolved,
    };
    setCustomItems((prev) => [...prev, item]);
    setCustomAssetInput("");
    setCustomAssetError(null);
    setShowAddAsset(false);
    openCustomAsset(item);
  }

  function removeCustomAsset(id: string) {
    setCustomItems((prev) => prev.filter((item) => item.id !== id));
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_MARKET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setFavorites(
          parsed.filter(
            (item): item is { market: string; symbol: string } =>
              !!item &&
              typeof item === "object" &&
              typeof (item as { market?: unknown }).market === "string" &&
              typeof (item as { symbol?: unknown }).symbol === "string",
          ),
        );
      }
    } catch {
      // Bozuk kayıt varsa uygulamanın çalışmasını engelleme.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        FAVORITES_MARKET_STORAGE_KEY,
        JSON.stringify(favorites),
      );
    } catch {
      // Tarayıcı depolaması kapalıysa sadece mevcut oturumda tutulur.
    }
  }, [favorites]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PRIORITY_MARKET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setPriorityAssets(
          parsed.filter(
            (item): item is MarketAssetRef =>
              !!item &&
              typeof item === "object" &&
              typeof (item as { market?: unknown }).market === "string" &&
              typeof (item as { symbol?: unknown }).symbol === "string",
          ),
        );
      }
    } catch {
      // Bozuk kayıt varsa uygulamanın çalışmasını engelleme.
    }
  }, []);

    // ==========================================================
  // KISA VADELİ TAKİP LİSTESİNİ ÇEK
  // ==========================================================
  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    void (supabase as any)
      .from("short_term_tracking")
      .select("market, symbol")
      .eq("user_id", userId)
      .then((response: { data: Array<{ market: string; symbol: string }> | null; error: { message: string } | null }) => {
        if (response.error) {
          console.error("Kısa vadeli takip listesi çekilemedi:", response.error);
          return;
        }
        if (response.data) {
          setShortTermTracked(response.data);
          console.log(`✅ ${response.data.length} kısa vadeli takip varlığı çekildi.`);
        }
      });
  }, [user]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        PRIORITY_MARKET_STORAGE_KEY,
        JSON.stringify(priorityAssets),
      );
    } catch {
      // Tarayıcı depolaması kapalıysa sadece mevcut oturumda tutulur.
    }
  }, [priorityAssets]);

  // Supabase'den favorileri çek (sayfa açıldığında)
  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    void (supabase as any)
      .from("favorites")
      .select("market, symbol")
      .eq("user_id", userId)
      .then((response: { data: Array<{ market: string; symbol: string }> | null; error: { message: string } | null }) => {
        if (response.error) {
          console.error("Favoriler çekilemedi:", response.error);
          return;
        }
        if (response.data && response.data.length > 0) {
          setFavorites(
            response.data.map((item) => ({
              market: item.market,
              symbol: item.symbol,
            })),
          );
          console.log(`✅ ${response.data.length} favori Supabase'den çekildi.`);
        }
      });
  }, [user]);

  // Supabase'den öncelikli varlıkları çek (sayfa açıldığında)
  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    void (supabase as any)
      .from("priority_assets")
      .select("market, symbol")
      .eq("user_id", userId)
      .then((response: { data: Array<{ market: string; symbol: string }> | null; error: { message: string } | null }) => {
        if (response.error) {
          console.error("Priority assets çekilemedi:", response.error);
          return;
        }
        if (response.data && response.data.length > 0) {
          setPriorityAssets(
            response.data.map((item) => ({
              market: item.market as Market,
              symbol: item.symbol,
            })),
          );
          console.log(`✅ ${response.data.length} öncelikli varlık Supabase'den çekildi.`);
        }
      });
  }, [user]);

  const isFavoriteAsset = (assetMarket: Market, assetSymbol: string) =>
    favorites.some(
      (f) =>
        f.symbol === assetSymbol &&
        f.market === assetMarket,
    );

  const isPriorityAsset = (assetMarket: Market, assetSymbol: string) =>
    priorityAssets.some(
      (p) =>
        p.symbol === assetSymbol &&
        p.market === assetMarket,
    );
  // ==========================================================
  // FAVORİ + ÖNCELİKLİ BİRLEŞTİRME
  // ==========================================================
  const combinedFavorites = useMemo(() => {
    const map = new Map<
      string,
      { market: Market; symbol: string; isPriority: boolean }
    >();

    // Önce favorileri ekle
    for (const f of favorites) {
      const key = `${f.market}:${f.symbol}`;
      map.set(key, {
        market: f.market as Market,
        symbol: f.symbol,
        isPriority: isPriorityAsset(f.market as Market, f.symbol),
      });
    }

    // Sonra önceliklileri ekle (favoride olmayanları)
    for (const p of priorityAssets) {
      const key = `${p.market}:${p.symbol}`;
      if (!map.has(key)) {
        map.set(key, {
          market: p.market,
          symbol: p.symbol,
          isPriority: true,
        });
      } else {
        map.get(key)!.isPriority = true;
      }
    }

    return Array.from(map.values());
  }, [favorites, priorityAssets]);

  function setFavoriteAsset(
    assetMarket: Market,
    assetSymbol: string,
    shouldFavorite?: boolean,
  ) {
    const currentlyFavorite = isFavoriteAsset(assetMarket, assetSymbol);
    const nextFavorite = shouldFavorite ?? !currentlyFavorite;

    if (nextFavorite === currentlyFavorite) return;

    setFavorites((prevList) => {
      if (nextFavorite) {
        if (prevList.some((f) => f.symbol === assetSymbol && f.market === assetMarket)) {
          return prevList;
        }
        return [...prevList, { symbol: assetSymbol, market: assetMarket }];
      }

      return prevList.filter(
        (f) => !(f.symbol === assetSymbol && f.market === assetMarket),
      );
    });
  }

    async function toggleFavoriteAsset(assetMarket: Market, assetSymbol: string) {
    const currentlyFavorite = isFavoriteAsset(assetMarket, assetSymbol);

    // LİMİT KONTROLÜ — favori eklerken
    if (!currentlyFavorite && tierInfo) {
      const limit = tierInfo.limits.favorites;
      if (limit < 999 && favorites.length >= limit) {
        setLimitModal({ open: true, type: "favorites" });
        return;
      }
    }

    if (currentlyFavorite) {
      await removePriorityAsset(assetMarket, assetSymbol);
    }

    setFavoriteAsset(assetMarket, assetSymbol);

    if (user) {
      if (currentlyFavorite) {
        const { error } = await (supabase as any)
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("market", assetMarket)
          .eq("symbol", assetSymbol);

        if (error) {
          console.error("Favori silinemedi:", error);
        } else {
          console.log("✅ Favori Supabase'den silindi:", assetSymbol);
        }
      } else {
        const { error } = await (supabase as any)
          .from("favorites")
          .upsert(
            {
              user_id: user.id,
              market: assetMarket,
              symbol: assetSymbol,
            },
            { onConflict: "user_id,market,symbol" },
          );

        if (error) {
          console.error("Favori kaydedilemedi:", error);
        } else {
          console.log("✅ Favori Supabase'e kaydedildi:", assetSymbol);
        }
      }
    }
  }

  async function removePriorityAsset(
    assetMarket: Market,
    assetSymbol: string,
  ) {
    setPriorityAssets((prev) =>
      prev.filter(
        (item) =>
          !(
            item.market === assetMarket &&
            item.symbol === assetSymbol
          ),
      ),
    );

    if (user) {
      const { error } = await (supabase as any)
        .from("priority_assets")
        .delete()
        .eq("user_id", user.id)
        .eq("market", assetMarket)
        .eq("symbol", assetSymbol);

      if (error) {
        console.error("Priority asset silinemedi:", error);
      }
    }
  }

    function togglePriorityAsset(
    assetMarket: Market,
    assetSymbol: string,
  ) {
    // LİMİT KONTROLÜ — priority eklerken
    if (!isPriorityAsset(assetMarket, assetSymbol) && tierInfo) {
      const limit = tierInfo.limits.priority;
      if (limit === 0) {
        setLimitModal({ open: true, type: "priority" });
        return;
      }
      if (limit < 999 && priorityAssets.length >= limit) {
        setLimitModal({ open: true, type: "priority" });
        return;
      }
    }

    if (isPriorityAsset(assetMarket, assetSymbol)) {
      void removePriorityAsset(
        assetMarket,
        assetSymbol,
      );
      return;
    }

    setPriorityPromptAsset({
      market: assetMarket,
      symbol: assetSymbol,
    });
  }

  async function confirmPriority(
    makePriority: boolean,
  ) {
    const asset = priorityPromptAsset;
    if (!asset) return;

    await setFavoriteAsset(
      asset.market,
      asset.symbol,
      true,
    );

    if (makePriority && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }

    if (makePriority) {
      setPriorityAssets((prev) =>
        prev.some(
          (item) =>
            item.market === asset.market &&
            item.symbol === asset.symbol,
        )
          ? prev
          : [...prev, asset],
      );

      if (user) {
        const { error } = await (supabase as any)
          .from("priority_assets")
          .upsert(
            {
              user_id: user.id,
              market: asset.market,
              symbol: asset.symbol,
            },
            { onConflict: "user_id,market,symbol" },
          );

        if (error) {
          console.error("Priority asset kaydedilemedi:", error);
        } else {
          console.log("✅ Öncelikli varlık Supabase'e kaydedildi:", asset.symbol);
        }
      }
    }

    setPriorityPromptAsset(null);
  }

    async function removeAllFavorites() {
    if (favorites.length === 0) return;

    const confirmed = window.confirm(
      "Tüm favorileri ve bu favorilere bağlı öncelikleri kaldırmak istediğinize emin misiniz?",
    );
    if (!confirmed) return;

    // Local state sıfırla (hızlı UX)
    setFavorites([]);
    setPriorityAssets([]);

    // Supabase'e silme isteği gönder
    if (user) {
      try {
        // Tüm favorileri sil
        const favRes = await (supabase as any)
          .from("favorites")
          .delete()
          .eq("user_id", user.id);

        if (favRes.error) {
          console.error("Favoriler silinemedi:", favRes.error);
          toast.error("Favoriler silinemedi");
          return;
        }

        // Tüm priority_assets'leri sil
        const priRes = await (supabase as any)
          .from("priority_assets")
          .delete()
          .eq("user_id", user.id);

        if (priRes.error) {
          console.error("Öncelikli varlıklar silinemedi:", priRes.error);
          toast.error("Öncelikli varlıklar silinemedi");
          return;
        }

        console.log("✅ Tüm favoriler ve öncelikler silindi");
        toast.success("Tüm favoriler ve öncelikler kaldırıldı");
      } catch (err) {
        console.error("Silme hatası:", err);
        toast.error("Bağlantı hatası");
      }
    }
  }

  const isFavorite = isFavoriteAsset(
    market,
    activeSymbol,
  );

  function toggleFavorite() {
    void toggleFavoriteAsset(market, activeSymbol);
  }

  function setCurrentUserDrawingLines(lines: import("@/components/CandleChart").TradingViewLine[]) {
    setUserFormations((prev) => ({ ...prev, [formationKey]: lines }));
    if (lines.length === 0) {
      setFormationEvaluationOpen((prev) => ({ ...prev, [formationKey]: false }));
    }
  }

  function requestFormationClose() {
    setShowFormationCloseDialog(true);
  }

  function closeCurrentFormation() {
    setUserFormations((prev) => {
      const next = { ...prev };
      delete next[formationKey];
      return next;
    });
    setFormationChats((prev) => {
      const next = { ...prev };
      delete next[formationKey];
      return next;
    });
    setFormationEvaluationOpen((prev) => ({ ...prev, [formationKey]: false }));
    setShowFormationCloseDialog(false);
  }

  function closeAllUserFormations() {
    setUserFormations({});
    setFormationChats({});
    setFormationEvaluationOpen({});
    setShowFormationCloseDialog(false);
  }

  const newsItems: NewsImpact[] = news.data?.items ?? [];

  const baseCode = useMemo(() => {
    const s = activeSymbol.toUpperCase();
    if (market === "crypto") return s.replace(/USDT$|BUSD$|FDUSD$/, "");
    return s.replace(/\.[A-Z0-9-]+$/, "").replace(/^\^/, "");
  }, [activeSymbol, market]);

  const relevantNews = useMemo(() => {
    const normalizedSymbol = baseCode
      .toUpperCase()
      .replace(/\.(IS|US)$/i, "")
      .replace(/USDT$/i, "");

    const aliases: Record<string, string[]> = {
      BTC: ["BTC", "BITCOIN"],
      ETH: ["ETH", "ETHEREUM"],
      BNB: ["BNB", "BINANCE COIN"],
      SOL: ["SOL", "SOLANA"],
      XRP: ["XRP", "RIPPLE"],
      ADA: ["ADA", "CARDANO"],
      DOGE: ["DOGE", "DOGECOIN"],
      AVAX: ["AVAX", "AVALANCHE"],
      DOT: ["DOT", "POLKADOT"],
      LINK: ["LINK", "CHAINLINK"],
      MATIC: ["MATIC", "POLYGON"],
      TRX: ["TRX", "TRON"],

      THYAO: ["THYAO", "TURK HAVA YOLLARI", "TURKISH AIRLINES"],
      ASELS: ["ASELS", "ASELSAN"],
      GARAN: ["GARAN", "GARANTI", "GARANTI BBVA"],

      AAPL: ["AAPL", "APPLE", "APPLE INC"],
      NVDA: ["NVDA", "NVIDIA"],
      MSFT: ["MSFT", "MICROSOFT"],
      AMZN: ["AMZN", "AMAZON"],
      GOOGL: ["GOOGL", "GOOGLE", "ALPHABET"],
      META: ["META", "META PLATFORMS"],
      TSLA: ["TSLA", "TESLA"],
    };

    const searchTerms = [
      normalizedSymbol,
      ...(aliases[normalizedSymbol] ?? []),
    ]
      .map((value) => value.toUpperCase())
      .filter(Boolean);

    const matches = newsItems.filter((news) => {
      const assetMatches = news.assets.some((asset) => {
        const assetCode = asset.asset
          .toUpperCase()
          .replace(/\.(IS|US)$/i, "")
          .replace(/USDT$/i, "");

        return (
          assetCode === normalizedSymbol ||
          searchTerms.includes(assetCode)
        );
      });

      const text = [
        news.title,
        news.summary,
        news.detail,
      ]
        .join(" ")
        .toUpperCase();

      const textMatches = searchTerms.some((term) =>
        text.includes(term),
      );

      return assetMatches || textMatches;
    });

    return matches.slice(0, 5).map((news) => {
      const asset =
        news.assets.find((item) => {
          const assetCode = item.asset
            .toUpperCase()
            .replace(/\.(IS|US)$/i, "")
            .replace(/USDT$/i, "");

          return (
            assetCode === normalizedSymbol ||
            searchTerms.includes(assetCode)
          );
        }) ?? null;

      return {
        title: news.title.slice(0, 300),
        source: news.source.slice(0, 60),
        summary: news.summary.slice(0, 600),
        published: news.published,
        link: news.link,
        detail: news.detail.slice(0, 1200),
        ...(asset
          ? {
              direction: asset.direction,
              strength: asset.strength,
              note: asset.note?.slice(0, 400) ?? "",
            }
          : {}),
      };
    });
  }, [newsItems, baseCode]);

  const newsSignature = relevantNews.map((n) => n.title).join("|");

  useEffect(() => {
    if (candles.length < 30) return;
    let cancelled = false;
    setAnalyzing(true);
    setAnalysisError(null);
    void runAnalysis({
      data: {
        symbol: activeSymbol,
        market: market === "crypto" ? "kripto" : `hisse/${MARKET_LABELS[market]}`,
        interval,
        candles: candles.map(({ time, open, high, low, close, volume }) => ({
          time,
          open,
          high,
          low,
          close,
          volume,
        })),
        news: relevantNews,
      },
    })
      .then((result) => {
        if (cancelled) return;
        const nextAnalysis = result.analysis as DashboardAnalysis | null;
        setAnalysis(nextAnalysis);
        setAnalysisError(result.error);
      })
      .catch(() => {
        if (!cancelled) setAnalysisError("Analiz servisi şu an yanıt vermiyor.");
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, interval, market, candles.length > 0, newsSignature]);
  // ==========================================================
  // KISA VADELİ ANALİZ - LOCALSTORAGE'DAN YÜKLE
  // ==========================================================
  useEffect(() => {
    if (!activeSymbol) return;
    try {
      const raw = window.localStorage.getItem(shortTermCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, DashboardAnalysis>;
      const key = `${market}:${activeSymbol}:${interval}`;
      if (parsed[key]) {
        setShortTermAnalysis(parsed[key]);
        setShowShortTerm(true);
      } else {
        setShortTermAnalysis(null);
        setShowShortTerm(false);
      }
    } catch {
      // Bozuk kayıt varsa uygulamanın çalışmasını engelleme
    }
  }, [activeSymbol, market, interval, shortTermCacheKey]);

  // ==========================================================
  // KISA VADELİ ANALİZ - ÇALIŞTIR
  // ==========================================================
    async function runShortTermAnalysis() {
    if (candles.length < 20) {
      toast.error("Kısa vadeli analiz için en az 20 mum gerekli.");
      return;
    }

    // ==========================================================
    // FREE ÜYE LİMİT KONTROLÜ
    // ==========================================================
    const tier = tierInfo?.tier ?? "free";
    const isPaidUser = tier === "admin" || tier === "premium" || tier === "trial";
    const shortTermLimit = tierInfo?.limits.shortTermTracking ?? 2;

    if (!isPaidUser) {
      const isAlreadyTracked = shortTermTracked.some(
        (t) => t.market === market && t.symbol === activeSymbol,
      );

      if (!isAlreadyTracked) {
        // 2 varlık sınırına ulaşıldı mı?
        if (shortTermTracked.length >= shortTermLimit) {
          setShortTermModal(true);
          return;
        }

        // Yeni varlığı kaydet
        if (user) {
          const { error: insertError } = await (supabase as any)
            .from("short_term_tracking")
            .insert({
              user_id: user.id,
              market,
              symbol: activeSymbol,
            });

          if (insertError) {
            console.error("Kısa vadeli takip kaydedilemedi:", insertError);
            toast.error("Kayıt sırasında bir hata oluştu.");
            return;
          }

          setShortTermTracked((prev) => [
            ...prev,
            { market, symbol: activeSymbol },
          ]);
          toast.success(`✅ ${activeSymbol} kısa vadeli takibe eklendi`);
        }
      }
    }

    // ==========================================================
    // ANALİZİ ÇALIŞTIR
    // ==========================================================
    setShortTermAnalyzing(true);
    setShowShortTerm(true);

    try {
      const shortCandles = candles.slice(-30);

      const result = await runAnalysis({
        data: {
          symbol: activeSymbol,
          market: market === "crypto" ? "kripto" : `hisse/${MARKET_LABELS[market]}`,
          interval,
          candles: shortCandles.map(({ time, open, high, low, close, volume }) => ({
            time, open, high, low, close, volume,
          })),
          news: relevantNews,
          timeframe: "short",
        },
      });

      const nextAnalysis = result.analysis as DashboardAnalysis | null;
      setShortTermAnalysis(nextAnalysis);

      try {
        const raw = window.localStorage.getItem(shortTermCacheKey);
        const parsed = raw ? (JSON.parse(raw) as Record<string, DashboardAnalysis>) : {};
        const key = `${market}:${activeSymbol}:${interval}`;
        if (nextAnalysis) {
          parsed[key] = nextAnalysis;
          window.localStorage.setItem(shortTermCacheKey, JSON.stringify(parsed));
        }
      } catch {
        // localStorage hatası sessizce yut
      }

      toast.success("✅ Kısa vadeli analiz tamamlandı");
    } catch {
      toast.error("Kısa vadeli analiz yapılamadı.");
    } finally {
      setShortTermAnalyzing(false);
    }
  }

  // ==========================================================
  // KISA VADELİ ANALİZ - SADECE BU SEMBOLÜ TEMİZLE
  // ==========================================================
  function clearShortTermForCurrentSymbol() {
    try {
      const raw = window.localStorage.getItem(shortTermCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, DashboardAnalysis>;
      const key = `${market}:${activeSymbol}:${interval}`;
      delete parsed[key];
      window.localStorage.setItem(shortTermCacheKey, JSON.stringify(parsed));
      setShortTermAnalysis(null);
      setShowShortTerm(false);
      toast.success("Bu sembolün kısa vadeli analizi temizlendi.");
    } catch {
      toast.error("Temizleme başarısız.");
    }
  }

  // ==========================================================
  // KISA VADELİ ANALİZ - TÜMÜNÜ TEMİZLE
  // ==========================================================
  function clearAllShortTermAnalyses() {
    if (!window.confirm("Tüm kısa vadeli analizler silinsin mi?")) return;
    window.localStorage.removeItem(shortTermCacheKey);
    setShortTermAnalysis(null);
    setShowShortTerm(false);
    toast.success("Tüm kısa vadeli analizler temizlendi.");
  }
    // ==========================================================
  // ONBOARDING TURU BAŞLATMA
  // ==========================================================
  useEffect(() => {
    const shouldStart = window.localStorage.getItem("formasyon-ai-start-tour");
    if (shouldStart === "1") {
      window.localStorage.removeItem("formasyon-ai-start-tour");
      // Kısa bir gecikmeyle turu başlat (sayfanın yüklenmesini bekle)
      setTimeout(() => setRunTour(true), 1500);
    }
  }, []);
  // === GİRİŞ YAPMAMIŞ KULLANICIYA WELCOME EKRANI ===
  if (!user) {
    return <WelcomeGate />;
  }

  return (
    <>
      <div className="min-h-screen">
                {/* ========================================================== */}
        {/* ONBOARDING TOOLTIP TURU */}
        {/* ========================================================== */}
        <Joyride
          run={runTour}
          steps={[
            {
              target: "body",
              placement: "bottom",
              content: (
                <div>
                  <h3 className="text-lg font-bold">🚀 Formasyon AI'ya Hoş Geldiniz!</h3>
                  <p className="mt-2 text-sm">
                    Size uygulamayı kısaca tanıtalım. 5 adımda neler yapabileceğinizi göreceksiniz.
                  </p>
                </div>
              ),
            },
            {
              target: "nav.market-tabs",
              content: (
                <div>
                  <h3 className="font-bold">📊 Piyasa Seçimi</h3>
                  <p className="mt-1 text-sm">
                    Buradan KRİPTO, BIST, ABD, ASYA ve AVRUPA piyasalarını seçebilirsin.
                  </p>
                </div>
              ),
              placement: "bottom",
            },
            {
              target: ".favorites-panel",
              content: (
                <div>
                  <h3 className="font-bold">⭐ Favori Listesi</h3>
                  <p className="mt-1 text-sm">
                    Beğendiğin varlıkları favorilere ekle, tek ekrandan takip et.
                  </p>
                </div>
              ),
              placement: "right",
            },
            {
              target: ".short-term-button",
              content: (
                <div>
                  <h3 className="font-bold">📉 Kısa Vadeli Analiz</h3>
                  <p className="mt-1 text-sm">
                    Kısa vadeli (20-30 mum) formasyon analizi için bu butona bas.
                  </p>
                </div>
              ),
              placement: "bottom",
            },
            {
              target: ".notification-bell",
              content: (
                <div>
                  <h3 className="font-bold">🔔 Bildirimler</h3>
                  <p className="mt-1 text-sm">
                    Önemli formasyon ve haber bildirimlerini buradan alırsın.
                  </p>
                </div>
              ),
              placement: "bottom",
            },
          ]}
          continuous
          styles={{
          tooltip: {
    borderRadius: 12,
    backgroundColor: "#ffffff",
    color: "#1f2937",
  },
  buttonPrimary: {
    backgroundColor: "#f59e0b",
    color: "#ffffff",
  },
}}
          locale={{
            back: "Geri",
            close: "Kapat",
            last: "Bitir",
            next: "İleri",
            skip: "Atla",
          }}
        />
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
            <span className="num text-sm font-bold uppercase tracking-[0.2em] text-primary">Formasyon AI</span>
            <nav className="flex gap-2 text-xs">
              <span className="rounded-md bg-secondary px-3 py-1.5 font-bold">Grafik</span>
              <Link to="/coins" className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
                Liste
              </Link>
            </nav>
                        <Link
              to="/settings"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              ⚙️ Ayarlar
            </Link>
            <div className="ml-auto flex items-center gap-2 text-sm">
              {isAdmin && (
  <Link
    to="/admin"
    className="rounded-md border border-amber-500/40 px-2.5 py-1.5 text-xs font-bold text-amber-500 hover:bg-amber-500/10"
    title="Admin Paneli"
  >
    👑
  </Link>
)}
<div className="notification-bell">
              <NotificationBell
                onOpenSymbol={(m, s) => {
                  setMarket(m as Market);
                  if (m !== "crypto") {
                    setStockSymbol(s);
                    setStockInput(s);
                  } else {
                    setSymbol(s);
                  }
                }}
              />
              </div>

              {user ? (
                <>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
                  <button
                    onClick={() => void signOut()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
                  >
                    Çıkış
                  </button>
                </>
              ) : (
                <Link
                  to="/auth"
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                >
                  Giriş / Kayıt
                </Link>
              )}
            </div>
          </div>
        </header>
        {/* LİMİT AŞIMI MODALI */}
        <LimitReachedModal
          open={limitModal.open}
          onClose={() => setLimitModal({ ...limitModal, open: false })}
          limitType={limitModal.type}
          currentTier={tierInfo?.tier ?? "free"}
          currentLimit={
            limitModal.type === "favorites"
              ? tierInfo?.limits.favorites ?? 5
              : tierInfo?.limits.priority ?? 0
          }
        />
                {/* KISA VADELİ ANALİZ LİMİT MODALI */}
        <LimitReachedModal
          open={shortTermModal}
          onClose={() => setShortTermModal(false)}
          limitType="short_term"
          currentTier={tierInfo?.tier ?? "free"}
          currentLimit={tierInfo?.limits.shortTermTracking ?? 2}
        />
        {priorityPromptAsset && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="text-center">
                <div className="text-3xl">⚡</div>
                <h2 className="mt-2 text-lg font-bold">ÖNCELİK AYARI</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  <span className="font-bold text-foreground">{priorityPromptAsset.symbol}</span> için formasyon, indikatör ve haberlere öncelik verilsin mi?
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Önceliğe alınan varlık daha detaylı takip edilir. Diğer kripto ve hisselerin taraması devam eder.
                </p>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void confirmPriority(true)}
                  className="rounded-lg bg-primary px-4 py-3 text-xs font-bold text-primary-foreground hover:opacity-90"
                >
                  ⚡ ÖNCELİKLİ OLSUN
                </button>
                <button
                  type="button"
                  onClick={() => void confirmPriority(false)}
                  className="rounded-lg border border-border px-4 py-3 text-xs font-bold hover:bg-secondary"
                >
                  ★ SADECE FAVORİYE AL
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPriorityPromptAsset(null)}
                className="mt-3 w-full rounded-lg px-4 py-2 text-xs text-muted-foreground hover:bg-secondary"
              >
                VAZGEÇ
              </button>
            </div>
          </div>
        )}

        <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
          <aside className="panel h-fit p-4">
            <div className="market-tabs grid grid-cols-5 gap-1 rounded-lg bg-secondary p-1">
            {(Object.keys(MARKET_LABELS) as Market[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMarket(m);
                    setSearch("");
                    setShowAllMarkets(false);
                  }}
                  className={`rounded-md px-2 py-2 text-[10px] font-bold transition-colors sm:text-xs ${
                    market === m
                      ? "bg-primary text-primary-foreground"
                      : "text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {MARKET_LABELS[m]}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setCustomAssetError(null);
                setShowAddAsset(true);
              }}
              className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
            >
              ＋ LİSTEYE EKLE
            </button>

            {showAddAsset && (
              <div className="mt-3 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold">Coin / Hisse Ekle</p>
                  <button
                    onClick={() => setShowAddAsset(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    aria-label="Kapat"
                  >
                    ✕
                  </button>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Örn: BTC, BTCUSDT, THYAO.IS, AAPL.US, 7203.T veya SAP.DE. Sistem uygun piyasayı otomatik belirler.
                </p>
                <input
                  autoFocus
                  value={customAssetInput}
                  onChange={(e) => {
                    setCustomAssetInput(e.target.value);
                    setCustomAssetError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCustomAsset();
                  }}
                  placeholder="Sembol yaz..."
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
                {customAssetInput.trim() && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Otomatik bölüm: <span className="font-bold">{MARKET_LABELS[normalizeCustomAsset(customAssetInput, market, tickers.data ?? []).market]}</span>
                  </p>
                )}
                {customAssetError && (
                  <p className="mt-2 text-[11px] text-warn">{customAssetError}</p>
                )}
                <button
                  onClick={addCustomAsset}
                  className="mt-3 w-full rounded-md border border-primary px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10"
                >
                  LİSTEYE EKLE VE ANALİZ ET
                </button>
              </div>
            )}

                        {combinedFavorites.length > 0 && (
              <div className="favorites-panel mt-4 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">⭐ Favoriler</p>
                  <span className="num text-[10px] text-muted-foreground">{combinedFavorites.length}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {combinedFavorites.map((f) => {
                    const favoriteMarket = f.market;
                    const priority = f.isPriority;
                    const isFav = isFavoriteAsset(favoriteMarket, f.symbol);
                    return (
                      <div key={`${f.market}-${f.symbol}`} className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setMarket(favoriteMarket);
                            setShowAllMarkets(false);
                            setSearch("");
                            if (favoriteMarket === "crypto") setSymbol(f.symbol);
                            else {
                              setStockSymbol(f.symbol);
                              setStockInput(f.symbol);
                            }
                          }}
                          className="num min-w-0 flex-1 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary"
                        >
                          <span className="block font-semibold">
                            {f.symbol.replace(/\.(IS|US)$/, "").replace(/USDT$/, "")}
                          </span>
                          <span className="block text-[9px] text-muted-foreground">
                            {MARKET_LABELS[favoriteMarket]}
                            {priority && !isFav && " · ⚡ Öncelikli"}
                            {priority && isFav && " · ⭐ ⚡"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void toggleFavoriteAsset(favoriteMarket, f.symbol);
                          }}
                          className={`rounded px-1.5 py-1 text-base leading-none transition-colors ${
                            isFav
                              ? "text-primary hover:bg-destructive/10 hover:text-destructive"
                              : "text-muted-foreground hover:bg-secondary hover:text-primary"
                          }`}
                          title={isFav ? "Favoriden kaldır" : "Favoriye ekle"}
                          aria-label={`${f.symbol} favori durumu`}
                        >
                          {isFav ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePriorityAsset(favoriteMarket, f.symbol);
                          }}
                          className={`rounded px-1.5 py-1 text-sm leading-none transition-colors ${
                            priority
                              ? "text-amber-500 hover:bg-amber-500/10"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                          title={priority ? "Önceliği kaldır" : "Önceliğe al"}
                          aria-label={priority ? `${f.symbol} önceliğini kaldır` : `${f.symbol} önceliğe al`}
                        >
                          {priority ? "⚡" : "○"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => void removeAllFavorites()}
                  className="mt-3 w-full rounded-md border border-destructive/30 px-3 py-2 text-[11px] font-bold text-destructive hover:bg-destructive/10"
                >
                  🗑️ TÜMÜNÜ KALDIR
                </button>
              </div>
            )}

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={market === "crypto" ? "Coin ara (BTC, ETH...)" : "Hisse ara (isim veya sembol...)"}
              className="mt-4 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
            />

            {customItems.filter((item) => item.market === market).length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Eklenenler</p>
                  <span className="text-[10px] text-muted-foreground">Kalıcı</span>
                </div>
                <ul className="mt-2 space-y-1">
                                   {customItems.filter((item) => item.market === market).map((item) => (
                    <li key={item.id} className="flex items-center gap-1">
                      <button
                        onClick={() => openCustomAsset(item)}
                        className={`min-w-0 flex-1 rounded-md px-2 py-2 text-left text-xs hover:bg-secondary ${
                          activeSymbol === item.symbol ? "bg-secondary" : ""
                        }`}
                      >
                        <span className="num block font-semibold">{item.symbol.replace(/\.(IS|US)$/, "").replace(/USDT$/, "")}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{item.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleFavoriteAsset(item.market, item.symbol)}
                        className={`rounded px-1.5 py-2 text-base ${isFavoriteAsset(item.market, item.symbol) ? "text-primary" : "text-muted-foreground"}`}
                        title={isFavoriteAsset(item.market, item.symbol) ? "Favorilerden çıkar" : "Favorilere ekle"}
                      >
                        {isFavoriteAsset(item.market, item.symbol) ? "★" : "☆"}
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePriorityAsset(item.market, item.symbol)}
                        className={`rounded px-1.5 py-2 text-base ${isPriorityAsset(item.market, item.symbol) ? "text-amber-500" : "text-muted-foreground"}`}
                        title={isPriorityAsset(item.market, item.symbol) ? "Önceliği kaldır" : "Önceliğe al"}
                      >
                        {isPriorityAsset(item.market, item.symbol) ? "⚡" : "○"}
                      </button>
                      <button
                        onClick={() => removeCustomAsset(item.id)}
                        className="rounded px-2 py-2 text-xs text-muted-foreground hover:bg-bear/10 hover:text-bear"
                        title="Listeden kaldır"
                        aria-label={`${item.symbol} listesinden kaldır`}
                      >
                        🗑
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {market === "crypto" ? (
              <>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Popüler 100 Coin</p>
                  <span className="num text-[10px] text-muted-foreground">{cryptoList.length}</span>
                </div>
                <ul className="mt-2 max-h-[520px] space-y-1 overflow-y-auto">
                  {tickers.isLoading && <li className="text-xs text-muted-foreground">Piyasa yükleniyor...</li>}
                  {tickers.isError && (
                    <li className="text-xs text-warn">Binance verisi alınamadı, bağlantınızı kontrol edin.</li>
                  )}
                  {cryptoList.slice(0, showAllMarkets ? 100 : 20).map((t) => {
                    const chg = Number(t.priceChangePercent);
                    return (
                      <li key={t.symbol} className="flex items-center gap-1">
                        <button
                          onClick={() => setSymbol(t.symbol)}
                          className={`min-w-0 flex-1 flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary ${
                            symbol === t.symbol ? "bg-secondary" : ""
                          }`}
                        >
                          <span className="num font-semibold">{t.symbol.replace("USDT", "")}</span>
                          <span className="num text-muted-foreground">{fmtPrice(Number(t.lastPrice))}</span>
                          <span className={`num w-14 text-right ${chg >= 0 ? "text-bull" : "text-bear"}`}>
                            {chg.toFixed(2)}%
                          </span>
                        </button>
                        <button type="button" onClick={() => void toggleFavoriteAsset("crypto", t.symbol)} className={`rounded px-1.5 py-1.5 text-base ${isFavoriteAsset("crypto", t.symbol) ? "text-primary" : "text-muted-foreground"}`} title={isFavoriteAsset("crypto", t.symbol) ? "Favorilerden çıkar" : "Favorilere ekle"}>
                          {isFavoriteAsset("crypto", t.symbol) ? "★" : "☆"}
                        </button>
                        <button type="button" onClick={() => togglePriorityAsset("crypto", t.symbol)} className={`rounded px-1.5 py-1.5 text-base ${isPriorityAsset("crypto", t.symbol) ? "text-amber-500" : "text-muted-foreground"}`} title={isPriorityAsset("crypto", t.symbol) ? "Önceliği kaldır" : "Önceliğe al"}>
                          {isPriorityAsset("crypto", t.symbol) ? "⚡" : "○"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!search && cryptoList.length > 20 && (
                  <button
                    onClick={() => setShowAllMarkets((v) => !v)}
                    className="mt-3 w-full rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"
                  >
                    {showAllMarkets ? "İLK 20'Yİ GÖSTER" : "TÜMÜNÜ GÖSTER (100)"}
                  </button>
                )}
              </>
            ) : (
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{MARKET_LABELS[market]} — İLK 50</p>
                  <span className="num text-[10px] text-muted-foreground">{stockList.length}</span>
                </div>
                <ul className="mt-2 max-h-[520px] space-y-1 overflow-y-auto">
                  {stockList.slice(0, showAllMarkets ? 50 : 20).map((item) => (
                    <li key={item.symbol} className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setStockSymbol(item.symbol);
                          setStockInput(item.symbol);
                        }}
                        className={`min-w-0 flex-1 rounded-md px-2 py-2 text-left text-xs hover:bg-secondary ${
                          stockSymbol === item.symbol ? "bg-secondary" : ""
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="num block font-semibold">{item.symbol.replace(/\.[A-Z0-9-]+$/, "")}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">{item.name}</span>
                        </span>
                      </button>
                      <button type="button" onClick={() => void toggleFavoriteAsset(market, item.symbol)} className={`rounded px-1.5 py-2 text-base ${isFavoriteAsset(market, item.symbol) ? "text-primary" : "text-muted-foreground"}`} title={isFavoriteAsset(market, item.symbol) ? "Favorilerden çıkar" : "Favorilere ekle"}>
                        {isFavoriteAsset(market, item.symbol) ? "★" : "☆"}
                      </button>
                      <button type="button" onClick={() => togglePriorityAsset(market, item.symbol)} className={`rounded px-1.5 py-2 text-base ${isPriorityAsset(market, item.symbol) ? "text-amber-500" : "text-muted-foreground"}`} title={isPriorityAsset(market, item.symbol) ? "Önceliği kaldır" : "Önceliğe al"}>
                        {isPriorityAsset(market, item.symbol) ? "⚡" : "○"}
                      </button>
                    </li>
                  ))}
                </ul>
                {!search && (
                  <button
                    onClick={() => setShowAllMarkets((v) => !v)}
                    className="mt-3 w-full rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"
                  >
                    {showAllMarkets ? "İLK 20'Yİ GÖSTER" : "TÜMÜNÜ GÖSTER (50)"}
                  </button>
                )}

                <div className="mt-4 border-t border-border pt-4">
                  <label htmlFor="stock" className="text-xs text-muted-foreground">Manuel sembol</label>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const next = stockInput.trim().toUpperCase();
                      if (next) setStockSymbol(next);
                    }}
                    className="mt-1 flex gap-2"
                  >
                    <input
                      id="stock"
                      value={stockInput}
                      onChange={(e) => setStockInput(e.target.value)}
                      className="num w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
                    />
                    <button className="rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground">Yükle</button>
                  </form>
                </div>

                {stockCandles.isError && (
                  <p className="mt-3 text-xs text-warn">
                    Bu sembol için veri bulunamadı. Veri sağlayıcının desteklediği borsa ekini kullanın.
                  </p>
                )}
              </div>
            )}
          </aside>

          <div className="space-y-4">
            <section className="panel p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <h1 className="num text-2xl font-bold">{activeSymbol}</h1>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="num text-xl font-semibold">{fmtPrice(livePrice)}</span>
                    <span className={`num text-sm ${changePct >= 0 ? "text-bull" : "text-bear"}`}>
                      {Number.isFinite(changePct) ? `${changePct.toFixed(2)}%` : "-"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  {INTERVALS.map((iv) => (
                    <button
                      key={iv}
                      onClick={() => setIntervalValue(iv)}
                      className={`num rounded-md px-3 py-1.5 text-xs font-bold ${
                        interval === iv
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-muted"
                      }`}
                    >
                      {iv}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {user && (
                    <>
                      <button
                        type="button"
                        onClick={() => void toggleFavorite()}
                        className={`rounded-md border px-2.5 py-1.5 text-base ${
                          isFavorite ? "border-primary text-primary" : "border-border text-muted-foreground"
                        }`}
                        title={isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
                      >
                        {isFavorite ? "★" : "☆"}
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePriorityAsset(market, activeSymbol)}
                        className={`rounded-md border px-2.5 py-1.5 text-base ${
                          isPriorityAsset(market, activeSymbol) ? "border-amber-500/40 text-amber-500" : "border-border text-muted-foreground"
                        }`}
                        title={isPriorityAsset(market, activeSymbol) ? "Önceliği kaldır" : "Önceliğe al"}
                      >
                        {isPriorityAsset(market, activeSymbol) ? "⚡" : "○"}
                      </button>
                    </>
                  )}
                  {analysis && (
                    <span
                      className={`num rounded-md px-3 py-1.5 text-xs font-bold ${
                        analysis.pattern.bias === "yükseliş"
                          ? "bg-bull text-bull-foreground"
                          : analysis.pattern.bias === "düşüş"
                            ? "bg-bear text-bear-foreground"
                            : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {analysis.pattern.name}
                    </span>
                  )}
                </div>
              </div>
                          {/* KISA VADELİ ANALİZ BUTONU */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
               <button
  type="button"
  onClick={() => void runShortTermAnalysis()}
  disabled={shortTermAnalyzing || candles.length < 20}
  className="short-term-button rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-50"
>
  {shortTermAnalyzing
    ? "⏳ Analiz ediliyor..."
    : tierInfo?.tier === "free"
      ? `📉 Kısa Vadeli Analiz (${shortTermTracked.length}/${tierInfo?.limits.shortTermTracking ?? 2})`
      : "📉 Kısa Vadeli (20-30 Mum) Formasyon Değerlendir"}
</button>

              {shortTermAnalysis && (
                <button
                  type="button"
                  onClick={() => clearShortTermForCurrentSymbol()}
                  className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10"
                >
                  🗑️ Bu Sembolü Temizle
                </button>
              )}

              <button
                type="button"
                onClick={() => clearAllShortTermAnalyses()}
                className="ml-auto rounded-md border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary"
              >
                🗑️ Tüm Kısa Vadeli Analizleri Temizle
              </button>
            </div>
              <div className="mt-3 overflow-hidden rounded-md bg-card p-2">
                <CandleChart
                  candles={candles}
                  lines={
                    analysis?.formationEngine?.primary?.lines?.length
                      ? analysis.formationEngine.primary.lines
                      : analysis?.pattern.lines ?? []
                  }
                  patternName={
                    analysis?.formationEngine?.primary?.name ??
                    analysis?.pattern.name
                  }
                  userLines={userDrawingLines}
                  onUserDrawingChange={setCurrentUserDrawingLines}
                  onDrawingModeChange={(active) => {
                    if (!active) setFormationEvaluationOpen((prev) => ({ ...prev, [formationKey]: false }));
                  }}
                  onEvaluateFormation={() => setFormationEvaluationOpen((prev) => ({ ...prev, [formationKey]: true }))}
                  onRequestClearDrawings={requestFormationClose}
                />
              </div>
              {analyzing && (
                <p className="mt-2 text-xs text-muted-foreground">AI formasyonu grafiğe çiziyor...</p>
              )}
            </section>

            {showFormationEvaluation && userDrawingLines.length > 0 && (
              <FormationEvaluationPanel
                symbol={activeSymbol}
                interval={interval}
                analysis={analysis}
                relevantNews={relevantNews}
                userLines={userDrawingLines}
                messages={formationMessages}
                onMessagesChange={(messages) => setFormationChats((prev) => ({ ...prev, [formationKey]: messages }))}
                onClose={() => setFormationEvaluationOpen((prev) => ({ ...prev, [formationKey]: false }))}
              />
            )}

            {showFormationCloseDialog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold">🧹 FORMASYONLARI KAPAT</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {activeSymbol} için çizdiğiniz bireysel formasyonları nasıl kapatmak istiyorsunuz?
                      </p>
                    </div>
                    <button type="button" onClick={() => setShowFormationCloseDialog(false)} className="rounded-md border border-border px-2 py-1 text-xs">✕</button>
                  </div>
                  <div className="mt-4 space-y-2">
                    <button type="button" onClick={closeCurrentFormation} className="w-full rounded-xl border border-border bg-card p-3 text-left hover:bg-secondary">
                      <span className="block text-sm font-bold">SADECE BU FORMASYONU KAPAT</span>
                      <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                        Sadece {activeSymbol} için üzerinde çalıştığınız formasyonu ve ona ait AI sohbetini kapatır.
                      </span>
                    </button>
                    <button type="button" onClick={closeAllUserFormations} className="w-full rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-left hover:bg-destructive/10">
                      <span className="block text-sm font-bold text-destructive">TÜM FORMASYONLARI KAPAT</span>
                      <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                        Tüm coin ve hisselerde sizin çizdiğiniz bütün bireysel formasyonları ve bu çizimlere ait sohbetleri kapatır. AI'ın otomatik formasyonları silinmez.
                      </span>
                    </button>
                    <button type="button" onClick={() => setShowFormationCloseDialog(false)} className="w-full rounded-md border border-border px-3 py-2 text-xs font-bold">VAZGEÇ</button>
                  </div>
                </div>
              </div>
            )}
            {/* UZUN VADELİ ANALİZ AÇILIR PENCERE */}
            <details className="panel p-4" open>
              <summary className="cursor-pointer text-sm font-bold">
                📊 Uzun Vadeli Analiz (200+ Mum)
              </summary>
              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs font-bold text-muted-foreground">FORMASYON MOTORU</p>
                  <p className="mt-1 text-sm">
                    <span
                      className={
                        analysis?.pattern.bias === "yükseliş"
                          ? "text-bull font-bold"
                          : analysis?.pattern.bias === "düşüş"
                            ? "text-bear font-bold"
                            : "text-muted-foreground font-bold"
                      }
                    >
                      {analysis?.pattern.name ?? "Formasyon tespit edilmedi"} → {analysis?.pattern.bias ?? "nötr"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {analysis?.pattern.bias === "düşüş"
                      ? "Fiyat uzun vadede düşüş formasyonu içinde hareket ediyor."
                      : analysis?.pattern.bias === "yükseliş"
                        ? "Fiyat uzun vadede yükseliş formasyonu içinde."
                        : "Formasyon nötr."}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs font-bold text-muted-foreground">İNDİKATÖR MOTORU</p>
                  <p className="mt-1 text-sm">
                    <span
                      className={
                        analysis?.indicatorAnalysis?.direction === "yükseliş"
                          ? "text-bull font-bold"
                          : analysis?.indicatorAnalysis?.direction === "düşüş"
                            ? "text-bear font-bold"
                            : "text-muted-foreground font-bold"
                      }
                    >
                      {analysis?.indicatorAnalysis?.direction ?? "kararsız"} (%{analysis?.indicatorAnalysis?.confidence ?? 0})
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {analysis?.indicatorAnalysis?.summary ?? "İndikatör yorumu bekleniyor."}
                  </p>
                </div>

                {analysis?.pattern.bias !== analysis?.indicatorAnalysis?.direction &&
                  analysis?.pattern.bias !== "nötr" &&
                  analysis?.indicatorAnalysis?.direction &&
                  analysis?.indicatorAnalysis?.direction !== "kararsız" && (
                    <div className="rounded-lg border border-warn/40 bg-warn/10 p-3">
                      <p className="text-xs font-bold text-warn">⚠️ ÇELİŞKİ TESPİT EDİLDİ</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Formasyon motoru "{analysis?.pattern.bias}" derken, indikatör motoru "{analysis?.indicatorAnalysis?.direction}" diyor. 
                        Bu, farklı zaman dilimlerinden kaynaklanıyor olabilir. Kısa vadeli analiz için yukarıdaki butona basın.
                      </p>
                    </div>
                  )}
              </div>
            </details>

            {/* KISA VADELİ ANALİZ AÇILIR PENCERE */}
            {showShortTerm && (
              <details className="panel p-4" open>
                <summary className="cursor-pointer text-sm font-bold">
                  📉 Kısa Vadeli Analiz (20-30 Mum)
                  {shortTermAnalyzing && <span className="ml-2 text-xs text-muted-foreground">Yükleniyor...</span>}
                </summary>
                <div className="mt-3 space-y-3">
                  {shortTermAnalyzing ? (
                    <p className="text-sm text-muted-foreground">Kısa vadeli analiz yapılıyor...</p>
                  ) : shortTermAnalysis ? (
                    <>
                      <div className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs font-bold text-muted-foreground">FORMASYON MOTORU (20-30 MUM)</p>
                        <p className="mt-1 text-sm">
                          <span
                            className={
                              shortTermAnalysis.pattern.bias === "yükseliş"
                                ? "text-bull font-bold"
                                : shortTermAnalysis.pattern.bias === "düşüş"
                                  ? "text-bear font-bold"
                                  : "text-muted-foreground font-bold"
                            }
                          >
                            {shortTermAnalysis.pattern.name} → {shortTermAnalysis.pattern.bias}
                          </span>
                        </p>
                      </div>

                      <div className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs font-bold text-muted-foreground">İNDİKATÖR MOTORU (20-30 MUM)</p>
                        <p className="mt-1 text-sm">
                          <span
                            className={
                              shortTermAnalysis.indicatorAnalysis?.direction === "yükseliş"
                                ? "text-bull font-bold"
                                : shortTermAnalysis.indicatorAnalysis?.direction === "düşüş"
                                  ? "text-bear font-bold"
                                  : "text-muted-foreground font-bold"
                            }
                          >
                            {shortTermAnalysis.indicatorAnalysis?.direction} (%{shortTermAnalysis.indicatorAnalysis?.confidence})
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {shortTermAnalysis.indicatorAnalysis?.summary}
                        </p>
                      </div>

                      {shortTermAnalysis.pattern.bias === shortTermAnalysis.indicatorAnalysis?.direction && (
  <div className="rounded-lg border border-bull/40 bg-bull/10 p-3">
    <p className="text-xs font-bold text-bull">✅ UYUMLU SONUÇ</p>
    <p className="mt-1 text-xs text-muted-foreground">
      Kısa vadede formasyon ve indikatörler aynı yönü gösteriyor: <strong>{shortTermAnalysis.pattern.bias}</strong>.
    </p>
  </div>
)}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Analiz yapılamadı.</p>
                  )}
                </div>
              </details>
            )}
            <FormationAlertPanel
              symbol={activeSymbol}
              analysis={analysis}
            />
            <IndicatorPanel analysis={analysis} loading={analyzing} />
            <ReasoningPanel analysis={analysis} loading={analyzing} error={analysisError} />
            <PredictionPanel analysis={analysis} loading={analyzing} />
            <NewsPanel items={newsItems} loading={news.isLoading} error={news.data?.error ?? null} />

            <p className="pb-8 text-center text-xs text-muted-foreground">
              Veriler Binance ve halka açık kaynaklardan gelir. İçerik yatırım tavsiyesi değildir.
            </p>
          </div>

          <AssetInfoPanel
            market={market}
            symbol={activeSymbol}
            data={assetInfo.data ?? null}
            loading={assetInfo.isLoading || assetInfo.isFetching}
            error={assetInfo.error ? "Varlık bilgileri alınamadı. Mevcut grafik ve analiz verileri kullanılmaya devam ediyor." : null}
            news={relevantNews}
            newsLoading={news.isLoading || news.isFetching}
          />
        </main>
      </div>
    </>
  );
}