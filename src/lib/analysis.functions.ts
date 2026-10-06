import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { ChartAnalysis } from "./analysis-types";

export type { ChartAnalysis, PatternLine } from "./analysis-types";

// ============================================================
// INPUT SCHEMAS
// ============================================================

const CandleSchema = z.object({
  time: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
});

const NewsContextSchema = z.object({
  title: z.string().max(300),
  source: z.string().max(60),
  summary: z.string().max(600),
  detail: z.string().max(1200),
  direction: z.string().max(20).optional(),
  strength: z.string().max(20).optional(),
  note: z.string().max(400).optional(),
});

const AnalyzeInput = z.object({
  symbol: z.string().min(1).max(30),
  market: z.string().min(1).max(20),
  interval: z.string().min(1).max(10),
  candles: z.array(CandleSchema).min(20).max(400),
  news: z.array(NewsContextSchema).max(6).optional(),
  timeframe: z.enum(["long", "short"]).optional(),
});

// ============================================================
// CACHE AYARLARI
// ============================================================

const CACHE_TTL_MINUTES = 30;

// ============================================================
// CACHE OKUMA
// ============================================================

async function getCachedAnalysis(
  market: string,
  symbol: string,
  interval: string,
): Promise<ChartAnalysis | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("precomputed_analysis")
      .select("analysis, computed_at")
      .eq("market", market)
      .eq("symbol", symbol)
      .eq("timeframe", interval)
      .maybeSingle();

    if (error || !data?.analysis || !data.computed_at) return null;

    const ageMinutes =
      (Date.now() - new Date(data.computed_at).getTime()) / 60_000;

    if (ageMinutes > CACHE_TTL_MINUTES) {
      console.log(
        `⚠️ Cache eski: ${symbol} (${ageMinutes.toFixed(0)} dk > ${CACHE_TTL_MINUTES} dk)`,
      );
      return null;
    }

    console.log(`✅ CACHE HIT: ${symbol} (${ageMinutes.toFixed(0)} dk)`);
    return data.analysis as ChartAnalysis;
  } catch (error) {
    console.warn("Cache okuma hatası:", error);
    return null;
  }
}

// ============================================================
// CACHE YAZMA (fire-and-forget)
// ============================================================

async function saveToCache(
  market: string,
  symbol: string,
  interval: string,
  analysis: ChartAnalysis,
): Promise<void> {
  try {
    await (supabase as any)
      .from("precomputed_analysis")
      .upsert(
        {
          market,
          symbol,
          timeframe: interval,
          analysis,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "market,symbol,timeframe" },
      );

    console.log(`💾 CACHE KAYDEDİLDİ: ${symbol}`);
  } catch (error) {
    console.warn("Cache kayıt hatası:", error);
  }
}

// ============================================================
// ANA FONKSİYON
// ============================================================

export const analyzeChart = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AnalyzeInput.parse(data))
  .handler(async ({ data }) => {
    const { symbol, market, interval, timeframe } = data;

    // 1. ÖNCE CACHE'E BAK (Kısa vadeli analizler için cache kullanmıyoruz)
    if (timeframe !== "short") {
      const cached = await getCachedAnalysis(market, symbol, interval);
      if (cached) {
        return { analysis: cached, error: null as string | null };
      }
    }

    // 2. CACHE YOK → ESKİ YÖNTEM (hesapla)
    console.log(`⚠️ CACHE MISS: ${symbol} — yeniden hesaplanıyor...`);

    const { runChartAnalysis } = await import("./analysis.server");
    const { GatewayError } = await import("./ai-gateway.server");

    try {
      const result = await runChartAnalysis({
        ...data,
        timeframe: timeframe ?? "long",
      });

      // 3. SONUCU CACHE'E YAZ (sadece uzun vadeli analizler için)
      if (timeframe !== "short") {
        void saveToCache(market, symbol, interval, result);
      }

      return { analysis: result, error: null as string | null };
    } catch (error) {
      const message =
        error instanceof GatewayError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Teknik analiz şu anda yapılamadı, tekrar deneyin.";

      return {
        analysis: null as ChartAnalysis | null,
        error: message,
      };
    }
  });