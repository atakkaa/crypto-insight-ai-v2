import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ChartAnalysis } from "./analysis-types";
import type {
  FormationEvaluationResult,
  UserFormationLine,
} from "./formation-evaluation.server";

/**
 * Kullanıcının çizdiği formasyon çizgisi.
 */
const UserFormationLineSchema = z.object({
  start: z.object({
    x: z.number(),
    y: z.number(),
  }),
  end: z.object({
    x: z.number(),
    y: z.number(),
  }),
});

/**
 * Haber bağlamı.
 */
const NewsContextSchema = z.object({
  title: z.string().max(300),
  source: z.string().max(100),
  summary: z.string().max(1000),
  detail: z.string().max(2000),
  direction: z.string().max(30).optional(),
  strength: z.string().max(30).optional(),
  note: z.string().max(600).optional(),
});

/**
 * Formasyon değerlendirme isteği.
 */
const FormationEvaluationInput = z.object({
  symbol: z.string().min(1).max(30),

  market: z.string().min(1).max(30),

  interval: z.string().min(1).max(10),

  /**
   * Mevcut AI analizinin tamamı.
   * Buradaki mevcut AI analizini değiştirmiyoruz.
   */
  analysis: z.unknown(),

  /**
   * Kullanıcının grafikte çizdiği çizgiler.
   */
  userLines: z
    .array(UserFormationLineSchema)
    .min(1)
    .max(20),

  /**
   * Kullanıcının formasyonu neden düşündüğünü
   * açıklayabileceği isteğe bağlı gerekçe.
   */
  userReason: z.string().max(3000).optional(),

  /**
   * Mevcut ilgili haberler.
   */
  relevantNews: z
    .array(NewsContextSchema)
    .max(10)
    .optional(),
});

export type {
  FormationEvaluationResult,
  UserFormationLine,
};

/**
 * Kullanıcının çizdiği formasyonu,
 * mevcut AI analiziyle karşılaştırır.
 */
export const evaluateFormation = createServerFn({
  method: "POST",
})
  .inputValidator((data: unknown) =>
    FormationEvaluationInput.parse(data),
  )
  .handler(async ({ data }) => {
    const {
      evaluateUserFormation,
    } = await import("./formation-evaluation.server");

    try {
      const result = await evaluateUserFormation({
        symbol: data.symbol,
        market: data.market,
        interval: data.interval,

        /**
         * Mevcut AI analizini aynen gönderiyoruz.
         */
        analysis:
          data.analysis as ChartAnalysis | null,

        /**
         * Kullanıcının çizdiği formasyon çizgileri.
         */
        userLines:
          data.userLines as UserFormationLine[],

        /**
         * Kullanıcının formasyonu neden düşündüğünü
         * AI değerlendirmesine aktarıyoruz.
         *
         * exactOptionalPropertyTypes nedeniyle
         * undefined göndermiyoruz.
         */
        userReason:
          data.userReason ?? "",

        /**
         * İlgili haberleri mevcut haliyle aktarıyoruz.
         */
        relevantNews:
          data.relevantNews ?? [],
      });

      return {
        result,
        error: null as string | null,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Formasyon değerlendirmesi şu an yapılamadı, tekrar deneyin.";

      return {
        result:
          null as FormationEvaluationResult | null,

        error: message,
      };
    }
  });