
// src/lib/ai-gateway.server.ts

import { GoogleGenAI } from "@google/genai";

export type GatewayMessage = {
  role: "system" | "user";
  content: string;
};

export class GatewayError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

// ==========================================================
// ENV API KEY'LERİ
// ==========================================================

function getEnvKeys(
  singleName: string,
  poolName: string,
): string[] {
  const singleValue = process.env[singleName] ?? "";
  const poolValue = process.env[poolName] ?? "";

  return [
    singleValue,
    ...poolValue.split(","),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .filter(
      (value, index, array) =>
        array.indexOf(value) === index,
    );
}

const GEMINI_KEYS = getEnvKeys(
  "GEMINI_API_KEY",
  "GEMINI_API_KEYS",
);

const OPENROUTER_KEYS = getEnvKeys(
  "OPENROUTER_API_KEY",
  "OPENROUTER_API_KEYS",
);

// ==========================================================
// JSON AYIKLAMA
// ==========================================================

function parseJson<T>(value: string): T {
  const text = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(text) as T;
  } catch {
    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");

    if (
      objectStart !== -1 &&
      objectEnd > objectStart
    ) {
      return JSON.parse(
        text.substring(
          objectStart,
          objectEnd + 1,
        ),
      ) as T;
    }

    const arrayStart = text.indexOf("[");
    const arrayEnd = text.lastIndexOf("]");

    if (
      arrayStart !== -1 &&
      arrayEnd > arrayStart
    ) {
      return JSON.parse(
        text.substring(
          arrayStart,
          arrayEnd + 1,
        ),
      ) as T;
    }

    throw new Error(
      "AI geçerli JSON döndürmedi.",
    );
  }
}

// ==========================================================
// ANA AI FONKSİYONU
// ==========================================================

export async function callAiJson<T>(
  messages: GatewayMessage[],
): Promise<T> {
  const systemMessage =
    messages.find(
      (message) => message.role === "system",
    )?.content ?? "";

  const userMessage = messages
    .filter(
      (message) => message.role === "user",
    )
    .map(
      (message) => message.content,
    )
    .join("\n");

  let lastError: unknown = null;

  // ========================================================
  // 1 — GEMINI
  // ========================================================

  for (const apiKey of GEMINI_KEYS) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
      });

      const models = [
        "gemini-3.8-flash",
        "gemini-3.6-flash",
        "gemini-2.5-flash",
      ];

      for (const model of models) {
        try {
          const prompt =
            systemMessage +
            "\n\n" +
            userMessage +
            "\n\nLÜTFEN SADECE GEÇERLİ JSON DÖNDÜR.";

          const response =
            await ai.models.generateContent({
              model,
              contents: prompt,
            });

          const text =
            typeof response.text === "string"
              ? response.text
              : "";

          if (text.trim()) {
            return parseJson<T>(text);
          }
        } catch (error) {
          lastError = error;
        }
      }
    } catch (error) {
      lastError = error;
    }
  }

  // ========================================================
  // 2 — OPENROUTER
  // ========================================================

  for (const apiKey of OPENROUTER_KEYS) {
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer":
              "https://crypto-insight-ai-v2.vercel.app",
            "X-Title": "Crypto Insight AI",
          },

          body: JSON.stringify({
            // Güncel ücretsiz OpenRouter modeli
            model: "google/gemma-4-31b-it:free",

            messages: [
              ...(systemMessage
                ? [
                    {
                      role: "system",
                      content:
                        systemMessage +
                        "\n\nLÜTFEN SADECE GEÇERLİ JSON DÖNDÜR.",
                    },
                  ]
                : []),

              {
                role: "user",
                content: userMessage,
              },
            ],

            // AI'dan JSON istemeye yardımcı olur.
            response_format: {
              type: "json_object",
            },
          }),
        },
      );

      // ------------------------------------------------------
      // OPENROUTER HATA KONTROLÜ
      // ------------------------------------------------------

      if (!response.ok) {
        let errorDetail = "";

        try {
          const errorData =
            await response.json();

          errorDetail =
            errorData?.error?.message ??
            errorData?.message ??
            "";
        } catch {
          // JSON hata cevabı yoksa devam et.
        }

        lastError = new Error(
          `OpenRouter HTTP ${response.status}${
            errorDetail
              ? `: ${errorDetail}`
              : ""
          }`,
        );

        continue;
      }

      // ------------------------------------------------------
      // BAŞARILI CEVAP
      // ------------------------------------------------------

      const data =
        (await response.json()) as {
          choices?: Array<{
            message?: {
              content?: string;
            };
          }>;
        };

      const content =
        data.choices?.[0]?.message?.content;

      if (
        typeof content !== "string" ||
        !content.trim()
      ) {
        lastError = new Error(
          "OpenRouter boş cevap döndürdü.",
        );

        continue;
      }

      return parseJson<T>(content);
    } catch (error) {
      lastError = error;
    }
  }

  // ========================================================
  // 3 — HATA
  // ========================================================

  if (
    GEMINI_KEYS.length === 0 &&
    OPENROUTER_KEYS.length === 0
  ) {
    throw new GatewayError(
      500,
      "AI API anahtarı bulunamadı. Environment Variables kontrol edilmeli.",
    );
  }

  const errorMessage =
    lastError instanceof Error
      ? lastError.message
      : "Bilinmeyen AI hatası.";

  throw new GatewayError(
    500,
    `AI servisleri kullanılamadı: ${errorMessage}`,
  );
}

// ==========================================================
// UYUMLULUK FONKSİYONU
// ==========================================================

export async function handleAiRequest(
  messages: GatewayMessage[],
  _model?: string,
): Promise<unknown> {
  return callAiJson<unknown>(messages);
}

