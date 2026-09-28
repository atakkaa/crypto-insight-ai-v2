import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { AlertBell } from "@/components/AlertBell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/coins")({
  head: () => ({
    meta: [
      { title: "Coin ve Hisse Listesi — Formasyon AI" },
      {
        name: "description",
        content:
          "Kripto, BIST, ABD, Asya ve Avrupa piyasalarını listeleyin, favorilerinize ekleyin ve tek dokunuşla AI formasyon analizine gidin.",
      },
      {
        property: "og:title",
        content: "Coin ve Hisse Listesi — Formasyon AI",
      },
      {
        property: "og:description",
        content:
          "Kripto ve dünya borsalarından varlıkları favorilerinize ekleyin, grafiği ve AI analizini anında açın.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CoinsPage,
});

type Ticker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type Market = "crypto" | "bist" | "us" | "asia" | "europe";

type Fav = {
  market: Market;
  symbol: string;
};

type StockListItem = {
  symbol: string;
  name: string;
};

const BIST_TOP_50: StockListItem[] = [
  { symbol: "THYAO.IS", name: "Türk Hava Yolları" },
  { symbol: "ASELS.IS", name: "Aselsan" },
  { symbol: "TUPRS.IS", name: "Tüpraş" },
  { symbol: "BIMAS.IS", name: "BİM Birleşik Mağazalar" },
  { symbol: "GARAN.IS", name: "Garanti BBVA" },
  { symbol: "AKBNK.IS", name: "Akbank" },
  { symbol: "YKBNK.IS", name: "Yapı Kredi" },
  { symbol: "ISCTR.IS", name: "İş Bankası C" },
  { symbol: "KCHOL.IS", name: "Koç Holding" },
  { symbol: "SAHOL.IS", name: "Sabancı Holding" },
  { symbol: "EREGL.IS", name: "Ereğli Demir Çelik" },
  { symbol: "SISE.IS", name: "Şişecam" },
  { symbol: "PETKM.IS", name: "Petkim" },
  { symbol: "TCELL.IS", name: "Turkcell" },
  { symbol: "TAVHL.IS", name: "TAV Havalimanları" },
  { symbol: "TOASO.IS", name: "Tofaş" },
  { symbol: "FROTO.IS", name: "Ford Otosan" },
  { symbol: "ARCLK.IS", name: "Arçelik" },
  { symbol: "MGROS.IS", name: "Migros" },
  { symbol: "SASA.IS", name: "SASA Polyester" },
  { symbol: "HEKTS.IS", name: "Hektaş" },
  { symbol: "KRDMD.IS", name: "Kardemir D" },
  { symbol: "ENKAI.IS", name: "Enka İnşaat" },
  { symbol: "ULKER.IS", name: "Ülker Bisküvi" },
  { symbol: "KOZAL.IS", name: "Koza Altın" },
  { symbol: "KOZAA.IS", name: "Koza Anadolu Metal" },
  { symbol: "ALARK.IS", name: "Alarko Holding" },
  { symbol: "DOHOL.IS", name: "Doğan Holding" },
  { symbol: "TKFEN.IS", name: "Tekfen Holding" },
  { symbol: "VESTL.IS", name: "Vestel" },
  { symbol: "OYAKC.IS", name: "Oyak Çimento" },
  { symbol: "CIMSA.IS", name: "Çimsa" },
  { symbol: "CCOLA.IS", name: "Coca-Cola İçecek" },
  { symbol: "AEFES.IS", name: "Anadolu Efes" },
  { symbol: "MAVI.IS", name: "Mavi Giyim" },
  { symbol: "TSKB.IS", name: "TSKB" },
  { symbol: "HALKB.IS", name: "Halkbank" },
  { symbol: "VAKBN.IS", name: "VakıfBank" },
  { symbol: "ISGYO.IS", name: "İş GYO" },
  { symbol: "EKGYO.IS", name: "Emlak Konut GYO" },
  { symbol: "PGSUS.IS", name: "Pegasus" },
  { symbol: "DOAS.IS", name: "Doğuş Otomotiv" },
  { symbol: "KONTR.IS", name: "Kontrolmatik" },
  { symbol: "ASTOR.IS", name: "Astor Enerji" },
  { symbol: "ODAS.IS", name: "Odaş Elektrik" },
  { symbol: "ENJSA.IS", name: "Enerjisa" },
  { symbol: "GUBRF.IS", name: "Gübre Fabrikaları" },
  { symbol: "AKSEN.IS", name: "Aksa Enerji" },
  { symbol: "OYAKC.IS", name: "Oyak Çimento" },
  { symbol: "CANTE.IS", name: "Çan2 Termik" },
];

const US_TOP_50: StockListItem[] = [
  { symbol: "AAPL.US", name: "Apple" },
  { symbol: "MSFT.US", name: "Microsoft" },
  { symbol: "NVDA.US", name: "NVIDIA" },
  { symbol: "AMZN.US", name: "Amazon" },
  { symbol: "GOOGL.US", name: "Alphabet" },
  { symbol: "META.US", name: "Meta Platforms" },
  { symbol: "TSLA.US", name: "Tesla" },
  { symbol: "AVGO.US", name: "Broadcom" },
  { symbol: "BRK-B.US", name: "Berkshire Hathaway" },
  { symbol: "GOOG.US", name: "Alphabet Class C" },
  { symbol: "LLY.US", name: "Eli Lilly" },
  { symbol: "WMT.US", name: "Walmart" },
  { symbol: "JPM.US", name: "JPMorgan Chase" },
  { symbol: "V.US", name: "Visa" },
  { symbol: "ORCL.US", name: "Oracle" },
  { symbol: "MA.US", name: "Mastercard" },
  { symbol: "NFLX.US", name: "Netflix" },
  { symbol: "COST.US", name: "Costco" },
  { symbol: "JNJ.US", name: "Johnson & Johnson" },
  { symbol: "HD.US", name: "Home Depot" },
  { symbol: "PG.US", name: "Procter & Gamble" },
  { symbol: "ABBV.US", name: "AbbVie" },
  { symbol: "CRM.US", name: "Salesforce" },
  { symbol: "BAC.US", name: "Bank of America" },
  { symbol: "AMD.US", name: "AMD" },
  { symbol: "KO.US", name: "Coca-Cola" },
  { symbol: "PEP.US", name: "PepsiCo" },
  { symbol: "ADBE.US", name: "Adobe" },
  { symbol: "CSCO.US", name: "Cisco" },
  { symbol: "TMO.US", name: "Thermo Fisher Scientific" },
  { symbol: "MCD.US", name: "McDonald's" },
  { symbol: "ABT.US", name: "Abbott Laboratories" },
  { symbol: "IBM.US", name: "IBM" },
  { symbol: "GE.US", name: "GE Aerospace" },
  { symbol: "CAT.US", name: "Caterpillar" },
  { symbol: "INTU.US", name: "Intuit" },
  { symbol: "NOW.US", name: "ServiceNow" },
  { symbol: "QCOM.US", name: "Qualcomm" },
  { symbol: "TXN.US", name: "Texas Instruments" },
  { symbol: "AMAT.US", name: "Applied Materials" },
  { symbol: "ISRG.US", name: "Intuitive Surgical" },
  { symbol: "BKNG.US", name: "Booking Holdings" },
  { symbol: "UBER.US", name: "Uber" },
  { symbol: "COIN.US", name: "Coinbase" },
  { symbol: "MSTR.US", name: "Strategy" },
  { symbol: "PLTR.US", name: "Palantir" },
  { symbol: "PANW.US", name: "Palo Alto Networks" },
  { symbol: "CRWD.US", name: "CrowdStrike" },
  { symbol: "SHOP.US", name: "Shopify" },
  { symbol: "^SPX", name: "S&P 500" },
  { symbol: "^NDQ", name: "Nasdaq 100" },
];

const ASIA_TOP_50: StockListItem[] = [
  { symbol: "7203.T", name: "Toyota" },
  { symbol: "6758.T", name: "Sony Group" },
  { symbol: "9984.T", name: "SoftBank Group" },
  { symbol: "6861.T", name: "Keyence" },
  { symbol: "8306.T", name: "Mitsubishi UFJ" },
  { symbol: "6501.T", name: "Hitachi" },
  { symbol: "8035.T", name: "Tokyo Electron" },
  { symbol: "4063.T", name: "Shin-Etsu Chemical" },
  { symbol: "6098.T", name: "Recruit Holdings" },
  { symbol: "9432.T", name: "NTT" },
  { symbol: "9433.T", name: "KDDI" },
  { symbol: "4502.T", name: "Takeda Pharmaceutical" },
  { symbol: "6367.T", name: "Daikin Industries" },
  { symbol: "7267.T", name: "Honda" },
  { symbol: "6902.T", name: "Denso" },
  { symbol: "6594.T", name: "Nidec" },
  { symbol: "7741.T", name: "HOYA" },
  { symbol: "2914.T", name: "Japan Tobacco" },
  { symbol: "4568.T", name: "Daiichi Sankyo" },
  { symbol: "8058.T", name: "Mitsubishi Corp" },
  { symbol: "9983.T", name: "Fast Retailing" },
  { symbol: "7974.T", name: "Nintendo" },
  { symbol: "4519.T", name: "Chugai Pharmaceutical" },
  { symbol: "8766.T", name: "Tokio Marine" },
  { symbol: "8411.T", name: "Mizuho Financial" },
  { symbol: "8316.T", name: "Sumitomo Mitsui Financial" },
  { symbol: "8001.T", name: "Itochu" },
  { symbol: "8031.T", name: "Mitsui" },
  { symbol: "6503.T", name: "Mitsubishi Electric" },
  { symbol: "8801.T", name: "Mitsui Fudosan" },
  { symbol: "8802.T", name: "Mitsubishi Estate" },
  { symbol: "5401.T", name: "Nippon Steel" },
  { symbol: "3402.T", name: "Toray Industries" },
  { symbol: "5108.T", name: "Bridgestone" },
  { symbol: "4452.T", name: "Kao" },
  { symbol: "3382.T", name: "Seven & i" },
  { symbol: "9020.T", name: "East Japan Railway" },
  { symbol: "9022.T", name: "Central Japan Railway" },
  { symbol: "6504.T", name: "Fuji Electric" },
  { symbol: "6146.T", name: "Disco" },
  { symbol: "6723.T", name: "Renesas Electronics" },
  { symbol: "7735.T", name: "Screen Holdings" },
  { symbol: "6762.T", name: "TDK" },
  { symbol: "6971.T", name: "Kyocera" },
  { symbol: "7832.T", name: "Bandai Namco" },
  { symbol: "9697.T", name: "Capcom" },
  { symbol: "9613.T", name: "NTT Data" },
  { symbol: "4661.T", name: "Oriental Land" },
  { symbol: "4503.T", name: "Astellas Pharma" },
];

const EUROPE_TOP_50: StockListItem[] = [
  { symbol: "SAP.DE", name: "SAP" },
  { symbol: "SIE.DE", name: "Siemens" },
  { symbol: "ALV.DE", name: "Allianz" },
  { symbol: "DTE.DE", name: "Deutsche Telekom" },
  { symbol: "AIR.PA", name: "Airbus" },
  { symbol: "MC.PA", name: "LVMH" },
  { symbol: "OR.PA", name: "L'Oréal" },
  { symbol: "SAN.PA", name: "Sanofi" },
  { symbol: "TTE.PA", name: "TotalEnergies" },
  { symbol: "BNP.PA", name: "BNP Paribas" },
  { symbol: "SU.PA", name: "Schneider Electric" },
  { symbol: "AI.PA", name: "Air Liquide" },
  { symbol: "CS.PA", name: "AXA" },
  { symbol: "DG.PA", name: "Vinci" },
  { symbol: "BN.PA", name: "Danone" },
  { symbol: "RI.PA", name: "Pernod Ricard" },
  { symbol: "ENGI.PA", name: "Engie" },
  { symbol: "VIV.PA", name: "Vivendi" },
  { symbol: "DSY.PA", name: "Dassault Systèmes" },
  { symbol: "SU.PA", name: "Schneider Electric" },
  { symbol: "SHEL.L", name: "Shell" },
  { symbol: "AZN.L", name: "AstraZeneca" },
  { symbol: "HSBA.L", name: "HSBC" },
  { symbol: "ULVR.L", name: "Unilever" },
  { symbol: "BP.L", name: "BP" },
  { symbol: "GSK.L", name: "GSK" },
  { symbol: "RIO.L", name: "Rio Tinto" },
  { symbol: "LSEG.L", name: "London Stock Exchange Group" },
  { symbol: "REL.L", name: "RELX" },
  { symbol: "VOD.L", name: "Vodafone" },
  { symbol: "NESN.SW", name: "Nestlé" },
  { symbol: "NOVN.SW", name: "Novartis" },
  { symbol: "ROG.SW", name: "Roche" },
  { symbol: "UBSG.SW", name: "UBS" },
  { symbol: "ZURN.SW", name: "Zurich Insurance" },
  { symbol: "NVO.CO", name: "Novo Nordisk" },
  { symbol: "MAERSK-B.CO", name: "A.P. Moller - Maersk" },
  { symbol: "EQNR.OL", name: "Equinor" },
  { symbol: "DNB.OL", name: "DNB Bank" },
  { symbol: "VOLV-B.ST", name: "Volvo" },
  { symbol: "ERIC-B.ST", name: "Ericsson" },
  { symbol: "ATCO-A.ST", name: "Atlas Copco" },
  { symbol: "SEB-A.ST", name: "SEB" },
  { symbol: "NOKIA.HE", name: "Nokia" },
  { symbol: "ORNBV.HE", name: "Orion" },
  { symbol: "ENI.MI", name: "Eni" },
  { symbol: "ISP.MI", name: "Intesa Sanpaolo" },
  { symbol: "ENEL.MI", name: "Enel" },
  { symbol: "UCG.MI", name: "UniCredit" },
  { symbol: "IBE.MC", name: "Iberdrola" },
];

const MARKET_LABELS: Record<Market, string> = {
  crypto: "KRİPTO",
  bist: "BIST",
  us: "ABD",
  asia: "ASYA",
  europe: "AVRUPA",
};

const MARKET_LISTS: Record<Exclude<Market, "crypto">, StockListItem[]> = {
  bist: BIST_TOP_50,
  us: US_TOP_50,
  asia: ASIA_TOP_50,
  europe: EUROPE_TOP_50,
};

async function fetchTickers(): Promise<Ticker[]> {
  const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");

  if (!res.ok) {
    throw new Error("Binance verisi alınamadı");
  }

  const data = (await res.json()) as Ticker[];

  return data
    .filter(
      (t) =>
        t.symbol.endsWith("USDT") &&
        !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol),
    )
    .sort(
      (a, b) =>
        Number(b.quoteVolume) - Number(a.quoteVolume),
    );
}

function fmtPrice(value: number) {
  if (!Number.isFinite(value)) return "-";

  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("tr-TR", {
      maximumFractionDigits: 2,
    });
  }

  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }

  return value.toPrecision(4);
}

function fmtVolume(value: number) {
  if (!Number.isFinite(value)) return "-";

  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(1)} Mr`;
  }

  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(1)} M`;
  }

  return value.toFixed(0);
}

function CoinsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [market, setMarket] = useState<Market>("crypto");
  const [search, setSearch] = useState("");
  const [stockInput, setStockInput] = useState("");
  const [favorites, setFavorites] = useState<Fav[]>([]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const tickers = useQuery({
    queryKey: ["tickers"],
    queryFn: fetchTickers,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }

    void supabase
      .from("favorites")
      .select("market, symbol")
      .then(({ data }) => {
        const rows = (data ?? []) as Array<{
          market: string;
          symbol: string;
        }>;

        setFavorites(
          rows
            .filter((row) =>
              ["crypto", "bist", "us", "asia", "europe"].includes(
                row.market,
              ),
            )
            .map((row) => ({
              market: row.market as Market,
              symbol: row.symbol,
            })),
        );
      });
  }, [user]);

  const isFav = (m: Market, s: string) =>
    favorites.some(
      (f) => f.market === m && f.symbol === s,
    );

  async function toggleFav(m: Market, s: string) {
    if (!user) return;

    if (isFav(m, s)) {
      await supabase
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("market", m)
        .eq("symbol", s);

      setFavorites((prev) =>
        prev.filter(
          (f) => !(f.market === m && f.symbol === s),
        ),
      );
    } else {
      const { error } = await supabase
        .from("favorites")
        .insert({
          user_id: user.id,
          market: m,
          symbol: s,
        });

      if (error) {
        console.error("Favori eklenemedi:", error);
        return;
      }

      setFavorites((prev) => [
        ...prev,
        { market: m, symbol: s },
      ]);
    }
  }

  function openAnalysis(m: string, s: string) {
    const validMarket: Market =
      m === "crypto" ||
      m === "bist" ||
      m === "us" ||
      m === "asia" ||
      m === "europe"
        ? m
        : "us";

    void navigate({
      to: "/",
      search: {
        m: validMarket,
        s,
      },
    });
  }

  const cryptoList = useMemo(() => {
    const list = tickers.data ?? [];
    const q = search.trim().toUpperCase();

    let out = q
      ? list.filter((t) =>
          t.symbol.toUpperCase().includes(q),
        )
      : list;

    if (onlyFavorites) {
      out = out.filter((t) =>
        isFav("crypto", t.symbol),
      );
    }

    return out.slice(0, showAll ? 300 : 50);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tickers.data,
    search,
    onlyFavorites,
    favorites,
    showAll,
  ]);

  const stockList = useMemo(() => {
    if (market === "crypto") return [];

    const baseList =
      MARKET_LISTS[market as Exclude<Market, "crypto">] ?? [];

    const extra = favorites
      .filter((f) => f.market === market)
      .map((f) => ({
        symbol: f.symbol,
        name: f.symbol,
      }));

    const all = [
      ...baseList,
      ...extra,
    ].filter(
      (item, index, arr) =>
        arr.findIndex(
          (x) => x.symbol === item.symbol,
        ) === index,
    );

    const q = search.trim().toUpperCase();

    let out = q
      ? all.filter(
          (item) =>
            item.symbol.toUpperCase().includes(q) ||
            item.name.toUpperCase().includes(q),
        )
      : all;

    if (onlyFavorites) {
      out = out.filter((item) =>
        isFav(market, item.symbol),
      );
    }

    return out;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    market,
    favorites,
    search,
    onlyFavorites,
  ]);

  const visibleStocks = stockList.slice(
    0,
    showAll ? 50 : 20,
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="num text-sm font-bold uppercase tracking-[0.2em] text-primary"
          >
            Formasyon AI
          </Link>

          <nav className="flex gap-2 text-xs">
            <Link
              to="/"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              Grafik
            </Link>

            <span className="rounded-md bg-secondary px-3 py-1.5 font-bold">
              Liste
            </span>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <AlertBell onOpenSymbol={openAnalysis} />

            {!user && (
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

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <section className="panel p-4">
          <h1 className="text-lg font-bold">
            Coin ve hisse listesi
          </h1>

          <p className="mt-1 text-xs text-muted-foreground">
            Yıldıza dokunarak favorilerinize ekleyin.
            Favorileriniz arka planda düzenli olarak AI ile
            taranır, güçlü bir fırsat çıkınca zil ikonundan
            ve tarayıcı bildirimiyle haber veririz. Satıra
            dokunmak grafiği ve AI analizini açar.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(
              [
                "crypto",
                "bist",
                "us",
                "asia",
                "europe",
              ] as Market[]
            ).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMarket(m);
                  setSearch("");
                  setShowAll(false);
                }}
                className={`rounded-md px-3 py-2 text-xs font-bold ${
                  market === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {MARKET_LABELS[m]}
              </button>
            ))}

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder={
                market === "crypto"
                  ? "Coin ara (BTC, ETH...)"
                  : `${MARKET_LABELS[market]} hisse ara...`
              }
              className="min-w-[180px] flex-1 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
            />

            <button
              onClick={() =>
                setOnlyFavorites((v) => !v)
              }
              className={`rounded-md border px-3 py-2 text-xs font-bold ${
                onlyFavorites
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              ★ Sadece favoriler
            </button>
          </div>

          {!user && (
            <p className="mt-3 text-xs text-warn">
              Favori eklemek ve bildirim almak için{" "}
              <Link
                to="/auth"
                className="underline"
              >
                giriş yapın
              </Link>
              .
            </p>
          )}
        </section>

        {market !== "crypto" && user && (
          <section className="panel p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();

                const s = stockInput
                  .trim()
                  .toUpperCase();

                if (s) {
                  void toggleFav(market, s);
                }

                setStockInput("");
              }}
              className="flex flex-wrap gap-2"
            >
              <input
                value={stockInput}
                onChange={(e) =>
                  setStockInput(e.target.value)
                }
                placeholder={`Listede olmayan ${MARKET_LABELS[market]} hissesi ekle`}
                className="num min-w-[220px] flex-1 rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
              />

              <button
                className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                type="submit"
              >
                Favorilere ekle
              </button>
            </form>
          </section>
        )}

        <section className="panel overflow-hidden">
          {market === "crypto" ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  KRİPTO —{" "}
                  {showAll ? "İLK 300" : "İLK 50"}
                </p>

                <span className="num text-[10px] text-muted-foreground">
                  {cryptoList.length}
                </span>
              </div>

              {tickers.isLoading && (
                <p className="p-4 text-xs text-muted-foreground">
                  Piyasa yükleniyor...
                </p>
              )}

              {tickers.isError && (
                <p className="p-4 text-xs text-warn">
                  Binance verisi alınamadı, bağlantınızı
                  kontrol edin.
                </p>
              )}

              <ul className="divide-y divide-border">
                {cryptoList.map((t) => {
                  const chg = Number(
                    t.priceChangePercent,
                  );

                  return (
                    <li
                      key={t.symbol}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50"
                    >
                      <button
                        onClick={() =>
                          void toggleFav(
                            "crypto",
                            t.symbol,
                          )
                        }
                        className={`w-7 text-base ${
                          isFav(
                            "crypto",
                            t.symbol,
                          )
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                        aria-label="Favori"
                      >
                        {isFav(
                          "crypto",
                          t.symbol,
                        )
                          ? "★"
                          : "☆"}
                      </button>

                      <button
                        onClick={() =>
                          openAnalysis(
                            "crypto",
                            t.symbol,
                          )
                        }
                        className="flex flex-1 items-center justify-between gap-2 text-left"
                      >
                        <span className="num text-sm font-semibold">
                          {t.symbol.replace(
                            "USDT",
                            "",
                          )}
                        </span>

                        <span className="num hidden text-xs text-muted-foreground sm:inline">
                          hacim{" "}
                          {fmtVolume(
                            Number(
                              t.quoteVolume,
                            ),
                          )}
                        </span>

                        <span className="num text-sm">
                          {fmtPrice(
                            Number(
                              t.lastPrice,
                            ),
                          )}
                        </span>

                        <span
                          className={`num w-16 text-right text-sm ${
                            chg >= 0
                              ? "text-bull"
                              : "text-bear"
                          }`}
                        >
                          {chg.toFixed(2)}%
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {cryptoList.length > 50 && (
                <div className="border-t border-border p-3 text-center">
                  <button
                    onClick={() =>
                      setShowAll((v) => !v)
                    }
                    className="rounded-md border border-border px-4 py-2 text-xs font-bold hover:bg-secondary"
                  >
                    {showAll
                      ? "İlk 50'yi göster"
                      : "Daha fazla göster"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {MARKET_LABELS[market]} —{" "}
                  {showAll ? "İLK 50" : "İLK 20"}
                </p>

                <span className="num text-[10px] text-muted-foreground">
                  {stockList.length}
                </span>
              </div>

              <ul className="divide-y divide-border">
                {visibleStocks.map((item) => (
                  <li
                    key={item.symbol}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50"
                  >
                    <button
                      onClick={() =>
                        void toggleFav(
                          market,
                          item.symbol,
                        )
                      }
                      className={`w-7 text-base ${
                        isFav(
                          market,
                          item.symbol,
                        )
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                      aria-label="Favori"
                    >
                      {isFav(
                        market,
                        item.symbol,
                      )
                        ? "★"
                        : "☆"}
                    </button>

                    <button
                      onClick={() =>
                        openAnalysis(
                          market,
                          item.symbol,
                        )
                      }
                      className="num flex flex-1 items-center justify-between gap-3 text-left"
                    >
                      <span className="text-sm font-semibold">
                        {item.name}
                      </span>

                      <span className="num text-xs text-muted-foreground">
                        {item.symbol}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {stockList.length > 20 && (
                <div className="border-t border-border p-3 text-center">
                  <button
                    onClick={() =>
                      setShowAll((v) => !v)
                    }
                    className="rounded-md border border-border px-4 py-2 text-xs font-bold hover:bg-secondary"
                  >
                    {showAll
                      ? "İlk 20'yi göster"
                      : "İlk 50'yi göster"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <p className="pb-8 text-center text-xs text-muted-foreground">
          Veriler Binance ve halka açık kaynaklardan
          gelir. İçerik yatırım tavsiyesi değildir.
        </p>
      </main>
    </div>
  );
}