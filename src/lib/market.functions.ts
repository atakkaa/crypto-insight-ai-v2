import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StockQuote = {
  symbol: string;
  price: number;
  changePercent: number;
  currency: string;
  name: string;
  exchange: string;
};

const StockInput = z.object({
  symbol: z.string().min(1).max(20),
  interval: z.enum(["15m", "1h", "4h", "1d"]).optional(),
});

const QuotesInput = z.object({
  symbols: z.array(z.string().min(1).max(20)).min(1).max(40),
});

export const BIST_SYMBOLS = [
  "XU100.IS",
  "THYAO.IS",
  "ASELS.IS",
  "GARAN.IS",
  "AKBNK.IS",
  "ISCTR.IS",
  "YKBNK.IS",
  "KCHOL.IS",
  "SAHOL.IS",
  "SISE.IS",
  "EREGL.IS",
  "TUPRS.IS",
  "BIMAS.IS",
  "FROTO.IS",
  "TCELL.IS",
  "PETKM.IS",
  "SASA.IS",
  "KOZAL.IS",
  "ASTOR.IS",
  "TOASO.IS",
];

const ALIASES: Record<string, string> = {
  "^SPX": "^GSPC",
  "^NDQ": "^IXIC",
  "^DJI": "^DJI",
  XU100: "XU100.IS",
  XU030: "XU030.IS",
  BIST100: "XU100.IS",
};

const YAHOO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const YAHOO_QUERY_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
] as const;

type YahooSession = {
  cookie: string;
  crumb: string;
  createdAt: number;
};

let yahooSession: YahooSession | null = null;

let yahooSessionPromise:
  | Promise<YahooSession | null>
  | null = null;

const YAHOO_SESSION_TTL =
  45 * 60 * 1000;

function toYahoo(symbol: string): string {
  const s = symbol.trim().toUpperCase();

  if (ALIASES[s]) {
    return ALIASES[s]!;
  }

  if (s.endsWith(".US")) {
    return s.slice(0, -3);
  }

  return s;
}

function yahooRange(
  interval: "15m" | "1h" | "4h" | "1d",
) {
  if (interval === "15m") {
    return {
      yInterval: "15m",
      range: "1mo",
    };
  }

  if (
    interval === "1h" ||
    interval === "4h"
  ) {
    return {
      yInterval: "1h",
      range: "6mo",
    };
  }

  return {
    yInterval: "1d",
    range: "2y",
  };
}

function aggregate(
  candles: Candle[],
  size: number,
): Candle[] {
  const out: Candle[] = [];

  for (
    let i = 0;
    i < candles.length;
    i += size
  ) {
    const chunk = candles.slice(
      i,
      i + size,
    );

    const first = chunk[0];
    const last =
      chunk[chunk.length - 1];

    if (!first || !last) {
      continue;
    }

    out.push({
      time: first.time,
      open: first.open,
      high: Math.max(
        ...chunk.map(
          (c) => c.high,
        ),
      ),
      low: Math.min(
        ...chunk.map(
          (c) => c.low,
        ),
      ),
      close: last.close,
      volume: chunk.reduce(
        (sum, c) =>
          sum + (c.volume || 0),
        0,
      ),
    });
  }

  return out;
}

/* =========================================================
   YAHOO COOKIE + CRUMB
   ========================================================= */

function getSetCookieValues(
  headers: Headers,
): string[] {
  const extendedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (
    typeof extendedHeaders.getSetCookie ===
    "function"
  ) {
    try {
      return extendedHeaders.getSetCookie();
    } catch {
      // Aşağıdaki fallback kullanılacak.
    }
  }

  const raw =
    headers.get("set-cookie");

  if (!raw) {
    return [];
  }

  /*
   * Bazı fetch implementasyonlarında
   * birden fazla Set-Cookie tek header
   * içinde gelebilir.
   */
  return raw.split(
    /,(?=\s*[^;,=\s]+=[^;,]+)/g,
  );
}

function cookieHeaderFromSetCookie(
  cookies: string[],
): string {
  const values = cookies
    .map((cookie) =>
      cookie
        .split(";")[0]
        ?.trim(),
    )
    .filter(
      (value): value is string =>
        Boolean(value),
    );

  return Array.from(
    new Set(values),
  ).join("; ");
}

async function getYahooCookie(): Promise<
  string | null
> {
  const headers = {
    "User-Agent":
      YAHOO_USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language":
      "en-US,en;q=0.9",
  };

  /*
   * Yahoo'nun cookie bootstrap endpoint'i.
   * 404 dönmesi tek başına hata değildir;
   * önemli olan Set-Cookie gelmesidir.
   */
  try {
    const response =
      await fetch(
        "https://fc.yahoo.com",
        {
          method: "GET",
          redirect: "manual",
          headers,
        },
      );

    const cookies =
      getSetCookieValues(
        response.headers,
      );

    const cookieHeader =
      cookieHeaderFromSetCookie(
        cookies,
      );

    if (cookieHeader) {
      return cookieHeader;
    }
  } catch {
    // Aşağıdaki finance.yahoo.com fallback'i denenecek.
  }

  /*
   * Bazı ortamlarda fc.yahoo.com cookie
   * vermeyebiliyor. Ana Yahoo sayfasını
   * ikinci bootstrap olarak deniyoruz.
   */
  try {
    const response =
      await fetch(
        "https://finance.yahoo.com",
        {
          method: "GET",
          redirect: "manual",
          headers,
        },
      );

    const cookies =
      getSetCookieValues(
        response.headers,
      );

    const cookieHeader =
      cookieHeaderFromSetCookie(
        cookies,
      );

    if (cookieHeader) {
      return cookieHeader;
    }
  } catch {
    // Cookie alınamazsa null dönecek.
  }

  return null;
}

async function createYahooSession(): Promise<
  YahooSession | null
> {
  const cookie =
    await getYahooCookie();

  if (!cookie) {
    return null;
  }

  for (
    const host of YAHOO_QUERY_HOSTS
  ) {
    try {
      const response =
        await fetch(
          `${host}/v1/test/getcrumb`,
          {
            method: "GET",
            headers: {
              "User-Agent":
                YAHOO_USER_AGENT,
              Accept:
                "text/plain,*/*;q=0.8",
              "Accept-Language":
                "en-US,en;q=0.9",
              Cookie: cookie,
              Referer:
                "https://finance.yahoo.com/",
            },
          },
        );

      if (!response.ok) {
        continue;
      }

      const crumb =
        (
          await response.text()
        ).trim();

      /*
       * HTML dönmesi genellikle consent /
       * bot kontrolü / başarısız oturum
       * anlamına gelir.
       */
      if (
        !crumb ||
        crumb.includes("<html") ||
        crumb.includes("<HTML") ||
        crumb.length > 200
      ) {
        continue;
      }

      return {
        cookie,
        crumb,
        createdAt: Date.now(),
      };
    } catch {
      // Diğer Yahoo host'u denenir.
    }
  }

  return null;
}

async function getYahooSession(
  forceRefresh = false,
): Promise<YahooSession | null> {
  const now = Date.now();

  if (
    !forceRefresh &&
    yahooSession &&
    now -
      yahooSession.createdAt <
      YAHOO_SESSION_TTL
  ) {
    return yahooSession;
  }

  if (
    !forceRefresh &&
    yahooSessionPromise
  ) {
    return yahooSessionPromise;
  }

  yahooSessionPromise =
    createYahooSession();

  try {
    const session =
      await yahooSessionPromise;

    yahooSession =
      session;

    return session;
  } finally {
    yahooSessionPromise = null;
  }
}

function invalidateYahooSession() {
  yahooSession = null;
}

/**
 * Cookie + crumb isteyen Yahoo endpointleri
 * için ortak istek yardımcısı.
 */
async function fetchYahooAuthenticated(
  path: string,
  params: Record<
    string,
    string
  > = {},
): Promise<Response | null> {
  for (
    let attempt = 0;
    attempt < 2;
    attempt++
  ) {
    const session =
      await getYahooSession(
        attempt === 1,
      );

    if (!session) {
      return null;
    }

    /*
     * İlk denemede query1,
     * ikinci denemede query2 kullanılabilir.
     */
    const host =
      YAHOO_QUERY_HOSTS[
        attempt %
          YAHOO_QUERY_HOSTS.length
      ];

    const url =
      new URL(
        `${host}${path}`,
      );

    Object.entries({
      ...params,
      crumb: session.crumb,
    }).forEach(
      ([key, value]) => {
        url.searchParams.set(
          key,
          value,
        );
      },
    );

    try {
      const response =
        await fetch(
          url.toString(),
          {
            method: "GET",
            headers: {
              "User-Agent":
                YAHOO_USER_AGENT,
              Accept:
                "application/json",
              "Accept-Language":
                "en-US,en;q=0.9",
              Cookie:
                session.cookie,
              Referer:
                "https://finance.yahoo.com/",
            },
          },
        );

      /*
       * Invalid Crumb / Unauthorized:
       * session'ı silip bir kez
       * yeni cookie + crumb oluştur.
       */
      if (
        response.status === 401 ||
        response.status === 403
      ) {
        invalidateYahooSession();
        continue;
      }

      return response;
    } catch {
      if (attempt === 0) {
        invalidateYahooSession();
        continue;
      }

      return null;
    }
  }

  return null;
}

/* =========================================================
   YAHOO CHART
   ========================================================= */

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        symbol?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        shortName?: string;
        longName?: string;
        fullExchangeName?: string;
        exchangeName?: string;
      };

      timestamp?: number[];

      indicators?: {
        quote?: Array<{
          open?: Array<
            number | null
          >;
          high?: Array<
            number | null
          >;
          low?: Array<
            number | null
          >;
          close?: Array<
            number | null
          >;
          volume?: Array<
            number | null
          >;
        }>;
      };
    }>;

    error?: {
      description?: string;
    } | null;
  };
};

async function fetchYahooChart(
  symbol: string,
  yInterval: string,
  range: string,
) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}` +
    `?interval=${encodeURIComponent(
      yInterval,
    )}&range=${encodeURIComponent(
      range,
    )}`;

  const res =
    await fetch(url, {
      headers: {
        "User-Agent":
          YAHOO_USER_AGENT,
        Accept:
          "application/json",
      },
    });

  if (!res.ok) {
    return null;
  }

  const json =
    (await res.json()) as YahooChart;

  const result =
    json.chart?.result?.[0];

  if (!result) {
    return null;
  }

  const ts =
    result.timestamp ?? [];

  const q =
    result.indicators
      ?.quote?.[0];

  const candles: Candle[] =
    [];

  for (
    let i = 0;
    i < ts.length;
    i++
  ) {
    const close =
      q?.close?.[i];

    if (
      close == null ||
      !Number.isFinite(close)
    ) {
      continue;
    }

    candles.push({
      time:
        (ts[i] ?? 0) * 1000,

      open: Number(
        q?.open?.[i] ??
          close,
      ),

      high: Number(
        q?.high?.[i] ??
          close,
      ),

      low: Number(
        q?.low?.[i] ??
          close,
      ),

      close: Number(close),

      volume: Number(
        q?.volume?.[i] ??
          0,
      ),
    });
  }

  return {
    meta:
      result.meta ?? {},
    candles,
  };
}

/* =========================================================
   STOOQ FALLBACK
   ========================================================= */

async function fetchStooqDaily(
  symbol: string,
): Promise<Candle[]> {
  const url =
    `https://stooq.com/q/d/l/?s=` +
    `${encodeURIComponent(
      symbol.toLowerCase(),
    )}&i=d`;

  const res =
    await fetch(url, {
      headers: {
        "User-Agent":
          YAHOO_USER_AGENT,
      },
    });

  if (!res.ok) {
    return [];
  }

  const csv =
    await res.text();

  const lines =
    csv.trim().split("\n");

  if (
    lines.length < 3 ||
    !lines[0]
      ?.toLowerCase()
      .includes("date")
  ) {
    return [];
  }

  const candles: Candle[] =
    [];

  for (
    const line of lines.slice(1)
  ) {
    const [
      date,
      open,
      high,
      low,
      close,
      volume,
    ] = line.split(",");

    if (!date || !close) {
      continue;
    }

    const c: Candle = {
      time:
        new Date(
          date,
        ).getTime(),

      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(
        volume ?? 0,
      ),
    };

    if (
      Number.isFinite(
        c.close,
      )
    ) {
      candles.push(c);
    }
  }

  return candles;
}

/* =========================================================
   STOCK CANDLES
   ========================================================= */

export const getStockCandles =
  createServerFn({
    method: "GET",
  })
    .inputValidator(
      (data: unknown) =>
        StockInput.parse(data),
    )
    .handler(
      async ({ data }) => {
        const interval =
          data.interval ??
          "1d";

        const yahooSymbol =
          toYahoo(data.symbol);

        const {
          yInterval,
          range,
        } =
          yahooRange(
            interval,
          );

        try {
          const chart =
            await fetchYahooChart(
              yahooSymbol,
              yInterval,
              range,
            );

          if (
            chart &&
            chart.candles
              .length > 20
          ) {
            const candles =
              interval === "4h"
                ? aggregate(
                    chart.candles,
                    4,
                  )
                : chart.candles;

            const prevClose =
              chart.meta
                .chartPreviousClose ??
              chart.meta
                .previousClose;

            const livePrice =
              chart.meta
                .regularMarketPrice;

            return {
              symbol:
                data.symbol.toUpperCase(),

              interval,

              source:
                "yahoo" as const,

              currency:
                chart.meta
                  .currency ?? "",

              name:
                chart.meta
                  .shortName ??
                chart.meta
                  .longName ??
                data.symbol.toUpperCase(),

              exchange:
                chart.meta
                  .fullExchangeName ??
                chart.meta
                  .exchangeName ??
                "",

              price:
                Number.isFinite(
                  livePrice,
                )
                  ? Number(
                      livePrice,
                    )
                  : null,

              changePercent:
                Number.isFinite(
                  livePrice,
                ) &&
                Number.isFinite(
                  prevClose,
                ) &&
                Number(
                  prevClose,
                ) !== 0
                  ? (
                      (Number(
                        livePrice,
                      ) -
                        Number(
                          prevClose,
                        )) /
                      Number(
                        prevClose,
                      )
                    ) * 100
                  : null,

              candles:
                candles.slice(
                  -220,
                ),
            };
          }
        } catch {
          // Stooq fallback.
        }

        const fallback =
          await fetchStooqDaily(
            data.symbol,
          );

        if (
          fallback.length === 0
        ) {
          throw new Error(
            "Bu sembol için veri bulunamadı.",
          );
        }

        const last =
          fallback.at(-1)
            ?.close ?? null;

        const prev =
          fallback.at(-2)
            ?.close ?? null;

        return {
          symbol:
            data.symbol.toUpperCase(),

          interval:
            "1d" as const,

          source:
            "stooq" as const,

          currency: "",

          name:
            data.symbol.toUpperCase(),

          exchange: "",

          price: last,

          changePercent:
            last != null &&
            prev != null &&
            prev !== 0
              ? ((last - prev) /
                  prev) *
                100
              : null,

          candles:
            fallback.slice(
              -220,
            ),
        };
      },
    );

/* =========================================================
   STOCK QUOTES
   ========================================================= */

export const getStockQuotes =
  createServerFn({
    method: "GET",
  })
    .inputValidator(
      (data: unknown) =>
        QuotesInput.parse(data),
    )
    .handler(
      async ({ data }) => {
        const quotes =
          await Promise.all(
            data.symbols.map(
              async (
                symbol,
              ): Promise<StockQuote | null> => {
                try {
                  const chart =
                    await fetchYahooChart(
                      toYahoo(
                        symbol,
                      ),
                      "1d",
                      "5d",
                    );

                  if (!chart) {
                    return null;
                  }

                  const meta =
                    chart.meta;

                  const price =
                    Number(
                      meta.regularMarketPrice ??
                        chart.candles.at(
                          -1,
                        )?.close ??
                        NaN,
                    );

                  const prevClose =
                    Number(
                      meta.chartPreviousClose ??
                        meta.previousClose ??
                        chart.candles.at(
                          -2,
                        )?.close ??
                        NaN,
                    );

                  if (
                    !Number.isFinite(
                      price,
                    )
                  ) {
                    return null;
                  }

                  return {
                    symbol:
                      symbol.toUpperCase(),

                    price,

                    changePercent:
                      Number.isFinite(
                        prevClose,
                      ) &&
                      prevClose !== 0
                        ? ((price -
                            prevClose) /
                            prevClose) *
                          100
                        : NaN,

                    currency:
                      meta.currency ??
                      "",

                    name:
                      meta.shortName ??
                      meta.longName ??
                      symbol.toUpperCase(),

                    exchange:
                      meta.fullExchangeName ??
                      meta.exchangeName ??
                      "",
                  };
                } catch {
                  return null;
                }
              },
            ),
          );

        return {
          quotes:
            quotes.filter(
              (
                q,
              ): q is StockQuote =>
                q !== null,
            ),
        };
      },
    );

/* =========================================================
   ASSET INFO TYPE
   ========================================================= */

export type AssetInfo = {
  name?: string;
  currency?: string;
  exchange?: string;
  website?: string;

  marketCap?: number | null;
  fdv?: number | null;
  marketRank?: number | null;
  volume24h?: number | null;

  circulatingSupply?: number | null;
  totalSupply?: number | null;
  maxSupply?: number | null;
  circulationRatio?: number | null;

  burnInfo?: string | null;

  ath?: number | null;
  athDate?: string | null;
  athChange?: number | null;

  atl?: number | null;
  atlDate?: string | null;
  atlChange?: number | null;

  change7d?: number | null;
  change30d?: number | null;
  change1y?: number | null;

  blockchain?: string | null;
  contract?: string | null;
  inceptionDate?: string | null;

  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  employees?: number | null;
  ceo?: string | null;
  founded?: string | null;

  peRatio?: number | null;
  forwardPe?: number | null;
  priceToBook?: number | null;
  priceToSales?: number | null;
  evToEbitda?: number | null;
  pegRatio?: number | null;

  revenue?: number | null;
  netIncome?: number | null;
  ebitda?: number | null;
  eps?: number | null;
  freeCashFlow?: number | null;

  totalDebt?: number | null;
  equity?: number | null;

  dividendYield?: number | null;
  lastDividend?: number | null;
  exDividendDate?: string | null;
  dividendDate?: string | null;

  week52High?: number | null;
  week52Low?: number | null;
  change52w?: number | null;
  change3y?: number | null;
  change5y?: number | null;

  sharesOutstanding?: number | null;
  impliedSharesOutstanding?: number | null;
  floatShares?: number | null;

  institutionalOwnership?: number | null;
  insiderOwnership?: number | null;
};

const AssetInfoInput =
  z.object({
    market: z.enum([
      "crypto",
      "bist",
      "us",
      "asia",
      "europe",
    ]),

    symbol:
      z.string().min(1).max(40),
  });

function numOrNull(
  value: unknown,
): number | null {
  const n =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function yahooValue(
  obj: any,
  key: string,
): number | null {
  return numOrNull(
    obj?.[key]?.raw ??
      obj?.[key],
  );
}

function dateValue(
  obj: any,
  key: string,
): string | null {
  const raw =
    obj?.[key]?.raw ??
    obj?.[key];

  if (!raw) {
    return null;
  }

  const d =
    new Date(
      typeof raw === "number"
        ? raw * 1000
        : raw,
    );

  return Number.isNaN(
    d.getTime(),
  )
    ? String(raw)
    : d.toLocaleDateString(
        "tr-TR",
      );
}

function mergeAssetInfo(
  base: AssetInfo | null,
  extra: AssetInfo | null,
): AssetInfo | null {
  if (!base && !extra) {
    return null;
  }

  return {
    ...(base ?? {}),
    ...(extra ?? {}),
  };
}

/* =========================================================
   YAHOO QUOTE
   ========================================================= */

async function fetchYahooQuoteAssetInfo(
  symbol: string,
): Promise<AssetInfo | null> {
  const yahooSymbol =
    toYahoo(symbol);

  const response =
    await fetchYahooAuthenticated(
      "/v7/finance/quote",
      {
        symbols:
          yahooSymbol,
      },
    );

  if (!response) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const json =
    (await response.json()) as any;

  const q =
    json?.quoteResponse
      ?.result?.[0];

  if (!q) {
    return null;
  }

  return {
    name:
      q.longName ??
      q.shortName ??
      symbol,

    currency:
      q.currency ?? "",

    exchange:
      q.fullExchangeName ??
      q.exchange ??
      "",

    marketCap:
      numOrNull(
        q.marketCap,
      ),

    peRatio:
      numOrNull(
        q.trailingPE,
      ),

    forwardPe:
      numOrNull(
        q.forwardPE,
      ),

    priceToBook:
      numOrNull(
        q.priceToBook,
      ),

    priceToSales:
      numOrNull(
        q.priceToSalesTrailing12Months,
      ),

    evToEbitda:
      numOrNull(
        q.enterpriseToEbitda,
      ),

    pegRatio:
      numOrNull(
        q.pegRatio,
      ),

    revenue:
      numOrNull(
        q.totalRevenue,
      ),

    netIncome:
      numOrNull(
        q.netIncomeToCommon,
      ),

    ebitda:
      numOrNull(
        q.ebitda,
      ),

    eps:
      numOrNull(
        q.epsTrailingTwelveMonths ??
          q.trailingEps,
      ),

    freeCashFlow:
      numOrNull(
        q.freeCashflow,
      ),

    totalDebt:
      numOrNull(
        q.totalDebt,
      ),

    equity:
      numOrNull(
        q.bookValue != null &&
          q.sharesOutstanding !=
            null
          ? Number(
              q.bookValue,
            ) *
              Number(
                q.sharesOutstanding,
              )
          : null,
      ),

    dividendYield:
      numOrNull(
        q.dividendYield,
      ) != null
        ? numOrNull(
            q.dividendYield,
          )! * 100
        : null,

    lastDividend:
      numOrNull(
        q.dividendRate,
      ),

    exDividendDate:
      q.exDividendDate
        ? new Date(
            Number(
              q.exDividendDate,
            ) * 1000,
          ).toLocaleDateString(
            "tr-TR",
          )
        : null,

    dividendDate:
      q.dividendDate
        ? new Date(
            Number(
              q.dividendDate,
            ) * 1000,
          ).toLocaleDateString(
            "tr-TR",
          )
        : null,

    week52High:
      numOrNull(
        q.fiftyTwoWeekHigh,
      ),

    week52Low:
      numOrNull(
        q.fiftyTwoWeekLow,
      ),

    sharesOutstanding:
      numOrNull(
        q.sharesOutstanding,
      ),

    floatShares:
      numOrNull(
        q.floatShares,
      ),

    institutionalOwnership:
      numOrNull(
        q.heldPercentInstitutions,
      ) != null
        ? numOrNull(
            q.heldPercentInstitutions,
          )! * 100
        : null,

    insiderOwnership:
      numOrNull(
        q.heldPercentInsiders,
      ) != null
        ? numOrNull(
            q.heldPercentInsiders,
          )! * 100
        : null,
  };
}

/* =========================================================
   YAHOO QUOTE SUMMARY
   ========================================================= */

async function fetchYahooAssetInfo(
  symbol: string,
): Promise<AssetInfo | null> {
  const yahooSymbol =
    toYahoo(symbol);

  let summary:
    | AssetInfo
    | null = null;

  /*
   * Önce detaylı quoteSummary.
   */
  try {
    const response =
      await fetchYahooAuthenticated(
        `/v10/finance/quoteSummary/${encodeURIComponent(
          yahooSymbol,
        )}`,
        {
          modules:
            "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile,summaryProfile",
        },
      );

    if (
      response &&
      response.ok
    ) {
      const json =
        (await response.json()) as any;

      const result =
        json?.quoteSummary
          ?.result?.[0];

      if (result) {
        const p =
          result.price ?? {};

        const s =
          result.summaryDetail ??
          {};

        const k =
          result.defaultKeyStatistics ??
          {};

        const f =
          result.financialData ??
          {};

        const profile =
          result.assetProfile ??
          result.summaryProfile ??
          {};

        summary = {
          name:
            p.longName?.raw ??
            p.shortName?.raw ??
            symbol,

          currency:
            p.currency?.raw ??
            "",

          exchange:
            p.fullExchangeName
              ?.raw ??
            p.exchangeName?.raw ??
            "",

          marketCap:
            yahooValue(
              p,
              "marketCap",
            ),

          peRatio:
            yahooValue(
              s,
              "trailingPE",
            ),

          forwardPe:
            yahooValue(
              s,
              "forwardPE",
            ),

          priceToBook:
            yahooValue(
              k,
              "priceToBook",
            ),

          priceToSales:
            yahooValue(
              k,
              "priceToSalesTrailing12Months",
            ),

          evToEbitda:
            yahooValue(
              k,
              "enterpriseToEbitda",
            ),

          pegRatio:
            yahooValue(
              k,
              "pegRatio",
            ),

          revenue:
            yahooValue(
              f,
              "totalRevenue",
            ),

          netIncome:
            yahooValue(
              f,
              "netIncomeToCommon",
            ),

          ebitda:
            yahooValue(
              f,
              "ebitda",
            ),

          eps:
            yahooValue(
              k,
              "trailingEps",
            ),

          freeCashFlow:
            yahooValue(
              f,
              "freeCashflow",
            ),

          totalDebt:
            yahooValue(
              f,
              "totalDebt",
            ),

          equity:
            yahooValue(
              f,
              "totalStockholderEquity",
            ),

          dividendYield:
            yahooValue(
              s,
              "dividendYield",
            ) != null
              ? yahooValue(
                  s,
                  "dividendYield",
                )! * 100
              : null,

          lastDividend:
            yahooValue(
              s,
              "dividendRate",
            ),

          exDividendDate:
            dateValue(
              s,
              "exDividendDate",
            ),

          dividendDate:
            dateValue(
              s,
              "dividendDate",
            ),

          week52High:
            yahooValue(
              s,
              "fiftyTwoWeekHigh",
            ),

          week52Low:
            yahooValue(
              s,
              "fiftyTwoWeekLow",
            ),

          sharesOutstanding:
            yahooValue(
              k,
              "sharesOutstanding",
            ),

          impliedSharesOutstanding:
            yahooValue(
              k,
              "impliedSharesOutstanding",
            ),

          floatShares:
            yahooValue(
              k,
              "floatShares",
            ),

          institutionalOwnership:
            yahooValue(
              k,
              "heldPercentInstitutions",
            ) != null
              ? yahooValue(
                  k,
                  "heldPercentInstitutions",
                )! * 100
              : null,

          insiderOwnership:
            yahooValue(
              k,
              "heldPercentInsiders",
            ) != null
              ? yahooValue(
                  k,
                  "heldPercentInsiders",
                )! * 100
              : null,

          sector:
            profile.sector
              ?.raw ??
            profile.sector ??
            null,

          industry:
            profile.industry
              ?.raw ??
            profile.industry ??
            null,

          country:
            profile.country
              ?.raw ??
            profile.country ??
            null,

          employees:
            yahooValue(
              profile,
              "fullTimeEmployees",
            ),

          ceo:
            profile
              .companyOfficers?.[0]
              ?.name ??
            null,

          founded: null,

          website:
            profile.website
              ?.raw ??
            profile.website ??
            null,
        };
      }
    }
  } catch {
    // Quote fallback aşağıda.
  }

  /*
   * quoteSummary çalışmazsa v7 quote
   * ile mümkün olan alanları tamamla.
   */
  let quote:
    | AssetInfo
    | null = null;

  try {
    quote =
      await fetchYahooQuoteAssetInfo(
        symbol,
      );
  } catch {
    quote = null;
  }

  let merged =
    mergeAssetInfo(
      summary,
      quote,
    );

  /*
   * Chart endpoint'i auth gerektirmediği
   * için temel şirket bilgisini son
   * fallback olarak koruyoruz.
   */
  try {
    const chart =
      await fetchYahooChart(
        yahooSymbol,
        "1d",
        "5d",
      );

    if (chart) {
      const meta =
        chart.meta ?? {};

      const chartInfo:
        AssetInfo = {
          name:
            meta.longName ??
            meta.shortName ??
            symbol,

          currency:
            meta.currency ?? "",

          exchange:
            meta.fullExchangeName ??
            meta.exchangeName ??
            "",
        };

      /*
       * Burada chartInfo önceki detaylı
       * bilgileri ezmez; yalnızca eksik
       * alanları tamamlar.
       */
      merged =
        mergeAssetInfo(
          chartInfo,
          merged,
        );
    }
  } catch {
    // Mevcut bilgiler korunur.
  }

  return merged;
}

/* =========================================================
   COINGECKO
   ========================================================= */

async function fetchCoinGeckoAssetInfo(
  symbol: string,
): Promise<AssetInfo | null> {
  const base =
    symbol
      .replace(
        /USDT$|BUSD$|FDUSD$/,
        "",
      )
      .toLowerCase();

  const searchRes =
    await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(
        base,
      )}`,
      {
        headers: {
          Accept:
            "application/json",
        },
      },
    );

  if (!searchRes.ok) {
    return null;
  }

  const search =
    (await searchRes.json()) as any;

  const coins =
    Array.isArray(
      search?.coins,
    )
      ? search.coins
      : [];

  const exact =
    coins.find(
      (c: any) =>
        String(
          c.symbol ?? "",
        ).toUpperCase() ===
        base.toUpperCase(),
    ) ?? coins[0];

  if (!exact?.id) {
    return null;
  }

  const res =
    await fetch(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
        exact.id,
      )}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
      {
        headers: {
          Accept:
            "application/json",
        },
      },
    );

  if (!res.ok) {
    return null;
  }

  const c =
    (await res.json()) as any;

  const md =
    c.market_data ?? {};

  const usd = (
    key: string,
  ) =>
    numOrNull(
      md?.[key]?.usd,
    );

  const pct = (
    key: string,
  ) =>
    numOrNull(
      md?.[key]?.usd,
    );

  const circulating =
    numOrNull(
      md.circulating_supply,
    );

  const total =
    numOrNull(
      md.total_supply,
    );

  return {
    name:
      c.name ??
      base.toUpperCase(),

    currency: "USD",

    marketCap:
      usd("market_cap"),

    fdv:
      usd(
        "fully_diluted_valuation",
      ),

    marketRank:
      numOrNull(
        c.market_cap_rank,
      ),

    volume24h:
      usd("total_volume"),

    circulatingSupply:
      circulating,

    totalSupply:
      total,

    maxSupply:
      numOrNull(
        md.max_supply,
      ),

    circulationRatio:
      circulating != null &&
      total
        ? (circulating /
            total) *
          100
        : null,

    burnInfo:
      "Genel veri sağlayıcıda güvenilir toplam yakım miktarı bulunmuyor",

    ath:
      usd("ath"),

    athDate:
      c.ath_date?.usd
        ? new Date(
            c.ath_date.usd,
          ).toLocaleDateString(
            "tr-TR",
          )
        : null,

    athChange:
      pct(
        "ath_change_percentage",
      ),

    atl:
      usd("atl"),

    atlDate:
      c.atl_date?.usd
        ? new Date(
            c.atl_date.usd,
          ).toLocaleDateString(
            "tr-TR",
          )
        : null,

    atlChange:
      pct(
        "atl_change_percentage",
      ),

    change7d:
      pct(
        "price_change_percentage_7d_in_currency",
      ),

    change30d:
      pct(
        "price_change_percentage_30d_in_currency",
      ),

    change1y:
      pct(
        "price_change_percentage_1y_in_currency",
      ),

    blockchain:
      c.asset_platform_id ??
      (c.platforms
        ? Object.keys(
            c.platforms ?? {},
          )[0] ?? "-"
        : null),

    contract:
      c.platforms
        ? Object.values(
            c.platforms as Record<
              string,
              string
            >,
          ).find(Boolean) ??
          null
        : null,

    inceptionDate:
      c.genesis_date
        ? new Date(
            `${c.genesis_date}T00:00:00`,
          ).toLocaleDateString(
            "tr-TR",
          )
        : null,

    website:
      c.links?.homepage?.find(
        (x: string) => x,
      ) ?? null,
  };
}

/* =========================================================
   GET ASSET INFO
   ========================================================= */

export const getAssetInfo =
  createServerFn({
    method: "GET",
  })
    .inputValidator(
      (data: unknown) =>
        AssetInfoInput.parse(
          data,
        ),
    )
    .handler(
      async ({ data }) => {
        try {
          return data.market ===
            "crypto"
            ? await fetchCoinGeckoAssetInfo(
                data.symbol,
              )
            : await fetchYahooAssetInfo(
                data.symbol,
              );
        } catch {
          return null;
        }
      },
    );