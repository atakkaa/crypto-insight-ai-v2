export type PatternLine = {
  label: string;
  kind: "destek" | "direnç" | "trend" | "hedef" | "boyun";
  points: Array<{ index: number; price: number }>;
};

/** Analize girdi olarak verilen haber etkisi. */
export type NewsContextItem = {
  title: string;
  source: string;
  summary: string;
  detail: string;
  direction?: string | undefined;
  strength?: string | undefined;
  note?: string | undefined;
};

/**
 * Teknik indikatörlerin güncel değerleri.
 *
 * Bu veriler hem Gemini analizine gönderilir,
 * hem de frontend tarafındaki indikatör grafiklerinde kullanılabilir.
 */
export type IndicatorValues = {
  rsi: number;

  macd: number;
  macdSignal: number;
  macdHistogram: number;

  ema20: number;
  ema50: number;
  ema200: number;

  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;

  adx: number;

  volume: number;
  averageVolume: number;
  volumeRatio: number;
};

/**
 * İndikatör grafiklerinde kullanılacak zaman serileri.
 */
export type IndicatorSeriesPoint = {
  index: number;
  time: number;
  value: number;
};

export type IndicatorSeries = {
  rsi: IndicatorSeriesPoint[];

  macd: IndicatorSeriesPoint[];

  macdSignal: IndicatorSeriesPoint[];

  macdHistogram: IndicatorSeriesPoint[];

  ema20: IndicatorSeriesPoint[];

  ema50: IndicatorSeriesPoint[];

  ema200: IndicatorSeriesPoint[];

  bollingerUpper: IndicatorSeriesPoint[];

  bollingerMiddle: IndicatorSeriesPoint[];

  bollingerLower: IndicatorSeriesPoint[];

  adx: IndicatorSeriesPoint[];

  volume: IndicatorSeriesPoint[];

  averageVolume: IndicatorSeriesPoint[];
};

/**
 * Gemini'nin indikatörleri yorumlaması.
 *
 * Buradaki açıklamalar yatırım tavsiyesi değil,
 * teknik göstergelerin birlikte oluşturduğu senaryodur.
 */
export type IndicatorAnalysis = {
  direction: "yükseliş" | "düşüş" | "kararsız";

  confidence: number;

  summary: string;

  reasons: string[];

  rsiComment: string;

  macdComment: string;

  emaComment: string;

  bollingerComment: string;

  adxComment: string;

  volumeComment: string;

  combinedComment: string;

  riskNote: string;
};

/**
 * Teknik destek/direnç seviyesi.
 */
export type TechnicalLevel = {
  price: number;
  distancePercent: number;
};

/**
 * Deterministik teknik analiz motorunun ürettiği kanıtlar.
 *
 * Bu değerler başarı veya kâr ihtimali değildir.
 * Fiyat, trend, momentum, volatilite, hacim ve kırılım
 * durumunun teknik olarak nasıl göründüğünü ifade eder.
 */
export type TechnicalEvidence = {
  currentPrice: number;

  trendDirection: "yükseliş" | "düşüş" | "yatay";

  trendStrength: "güçlü" | "orta" | "zayıf";

  momentumDirection: "pozitif" | "negatif" | "karışık";

  volatilityState: "düşük" | "normal" | "yüksek";

  volumeState: "güçlü" | "normal" | "zayıf";

  breakoutStatus:
    | "yukarı kırılım"
    | "aşağı kırılım"
    | "kırılım yok";

  supportLevels: TechnicalLevel[];

  resistanceLevels: TechnicalLevel[];

  nearestSupport: number | null;

  nearestResistance: number | null;

  /**
   * Teknik göstergelerin ve fiyat yapısının
   * birbiriyle uyumunu gösteren 0-100 arası skor.
   *
   * Bu değer başarı ihtimali değildir.
   */
  alignmentScore: number;

  alignment:
    | "yükseliş destekli"
    | "düşüş destekli"
    | "karışık";

  bullishFactors: string[];

  bearishFactors: string[];

  neutralFactors: string[];

  summary: string;
};

/**
 * Kendi formasyon motorumuzun tespit ettiği formasyon adayı.
 *
 * score formasyonun teknik kriterlerle uyumunu gösterir.
 * Başarı veya kâr olasılığı değildir.
 */
export type FormationEngineCandidate = {
  name: string;

  bias: "yükseliş" | "düşüş" | "nötr";

  score: number;

  lines: PatternLine[];

  breakoutStatus:
    | "yukarı kırılım"
    | "aşağı kırılım"
    | "kırılım yok";

  support: number | null;

  resistance: number | null;

  neckline: number | null;

  target: number | null;

  invalidation: number | null;

  reasons: string[];
};

/**
 * Kendi deterministik formasyon motorumuzun sonucu.
 */
export type FormationEngineResult = {
  primary: FormationEngineCandidate | null;

  candidates: FormationEngineCandidate[];

  swingHighs: Array<{
    index: number;
    price: number;
    time: number;
  }>;

  swingLows: Array<{
    index: number;
    price: number;
    time: number;
  }>;
};

export type ChartAnalysis = {
  pattern: {
    name: string;
    bias: "yükseliş" | "düşüş" | "nötr";
    confidence: number;
    lines: PatternLine[];
  };

  /**
   * AI'nin formasyonu neden seçtiğini açıklayan maddeler.
   */
  reasoning: string[];

  prediction: {
    action: "AL" | "SAT" | "BEKLE";
    entry: number | null;
    stop: number | null;
    targets: number[];
    horizon: string;
    riskNote: string;
    confidence: number;
  };

  /**
   * Haber metinlerinin bu sembol üzerindeki etkisi
   * ve formasyonla uyumu.
   */
  newsEffect?: {
    direction: "yukarı" | "aşağı" | "yatay";
    strength: "yüksek" | "orta" | "düşük";
    alignment: "destekliyor" | "çelişiyor" | "nötr";
    summary: string;
    drivers: string[];
  } | null;

  /**
   * Teknik indikatörlerin ham değerleri.
   *
   * Frontend bu alanı kullanarak RSI, MACD, EMA,
   * Bollinger, ADX ve hacim grafiklerini gösterebilir.
   */
  indicatorValues?: IndicatorValues | null;

  /**
   * İndikatörlerin zaman içindeki değişimini gösteren
   * grafik verileri.
   */
  indicatorSeries?: IndicatorSeries | null;

  /**
   * Gemini'nin indikatörleri birlikte yorumladığı
   * Türkçe analiz.
   */
  indicatorAnalysis?: IndicatorAnalysis | null;

  /**
   * Deterministik teknik analiz motorunun kanıtları.
   */
  technicalEvidence?: TechnicalEvidence | null;

  /**
   * Kendi formasyon tespit motorumuzun sonucu.
   */
  formationEngine?: FormationEngineResult | null;
};
/**
 * Kısa vadeli (20-30 mum) analiz için kullanılan zaman dilimi tipi.
 * "long" = 200 mum (varsayılan), "short" = 20-30 mum.
 */
export type AnalysisTimeframe = "long" | "short";