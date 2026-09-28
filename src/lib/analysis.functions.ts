import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ChartAnalysis } from "./analysis-types";

export type { ChartAnalysis, PatternLine } from "./analysis-types";

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
});

export const analyzeChart = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AnalyzeInput.parse(data))
  .handler(async ({ data }) => {
    const { runChartAnalysis } = await import("./analysis.server");
    const { GatewayError } = await import("./ai-gateway.server");
    try {
      const result = await runChartAnalysis(data);
      return { analysis: result, error: null as string | null };
    } catch (error) {
      // runChartAnalysis kendi içinde AI kota/gateway hatalarını
      // deterministik teknik + formasyon fallback'ine çevirir.
      // Buraya düşülmesi artık AI kotasının bittiği anlamına gelmez;
      // burada yalnızca gerçek bir sunucu/veri hatasını bildiriyoruz.
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
