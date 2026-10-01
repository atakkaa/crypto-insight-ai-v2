import { useQuery } from "@tanstack/react-query";

type Ticker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
};

// Sabit liste: en popüler kripto + BIST hisseleri
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

const BIST_SYMBOLS = [
  { symbol: "ASELS.IS", name: "ASELS" },
  { symbol: "THYAO.IS", name: "THYAO" },
  { symbol: "GARAN.IS", name: "GARAN" },
  { symbol: "AKBNK.IS", name: "AKBNK" },
  { symbol: "SISE.IS", name: "SISE" },
];

async function fetchCryptoPrices(): Promise<Map<string, { price: number; change: number }>> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    if (!res.ok) throw new Error("Binance verisi alınamadı");
    const data = (await res.json()) as Ticker[];
    const map = new Map<string, { price: number; change: number }>();
    for (const t of data) {
      if (SYMBOLS.includes(t.symbol)) {
        map.set(t.symbol, {
          price: Number(t.lastPrice),
          change: Number(t.priceChangePercent),
        });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function fmtPrice(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) return value.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toFixed(2);
  return value.toPrecision(4);
}

export function MarketTicker() {
  const { data: cryptoData } = useQuery({
    queryKey: ["welcome-ticker"],
    queryFn: fetchCryptoPrices,
    refetchInterval: 30_000, // 30 saniyede bir güncelle
    staleTime: 15_000,
  });

  const items: Array<{ label: string; price: string; change: number }> = [];

  // Kripto verilerini ekle
  for (const symbol of SYMBOLS) {
    const info = cryptoData?.get(symbol);
    const label = symbol.replace("USDT", "");
    if (info) {
      items.push({
        label,
        price: fmtPrice(info.price),
        change: info.change,
      });
    } else {
      // Veri gelmediyse placeholder göster
      items.push({ label, price: "—", change: 0 });
    }
  }

  // BIST hisselerini ekle (şimdilik statik fiyat, sonra gerçek veri bağlanabilir)
  for (const b of BIST_SYMBOLS) {
    items.push({
      label: b.name,
      price: "—",
      change: 0,
    });
  }

  // Kesintisiz kayma için listeyi 2 kez tekrarla
  const doubled = [...items, ...items];

  return (
    <div className="welcome-ticker-wrap">
      <div className="welcome-ticker-track">
        {doubled.map((item, idx) => {
          const isUp = item.change >= 0;
          return (
            <span key={`${item.label}-${idx}`} className="welcome-ticker-item">
              <span className="num font-bold">{item.label}</span>
              <span className="num ml-1 text-muted-foreground">{item.price}</span>
              <span className={`num ml-1 ${isUp ? "text-bull" : "text-bear"}`}>
                {isUp ? "▲" : "▼"} {Math.abs(item.change).toFixed(2)}%
              </span>
              <span className="mx-3 text-border">│</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}