// api/scan-short-term.ts — Kısa Vadeli (20-30 Mum) Premium Tarama

import { scanShortTermForPremium } from "../src/lib/scan.server";

type RequestLike = {
  method?: string;
  query?: Record<string, any>;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ResponseLike;
  json: (data: unknown) => unknown;
  end: () => unknown;
};

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") return response.status(200).end();

  try {
    if (request.method !== "GET" && request.method !== "POST") {
      return response.status(405).json({ success: false, error: "Sadece GET/POST desteklenir" });
    }

    console.log("🔍 Kısa vadeli tarama başladı...");
    const result = await scanShortTermForPremium();
    console.log(`✅ Kısa vadeli tarama tamamlandı:`, result);

    return response.status(200).json({
      success: true,
      message: "Kısa vadeli tarama tamamlandı.",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Kısa vadeli tarama hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}