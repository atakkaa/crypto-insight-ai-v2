import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ChartAnalysis } from "./analysis-types";
import type { NewsContextItem } from "./analysis-types";
import type { UserFormationLine } from "./formation-evaluation.server";

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

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(5000),
});

const NewsContextSchema = z.object({
  title: z.string().max(300),
  source: z.string().max(100),
  summary: z.string().max(1000),
  detail: z.string().max(2000),
  direction: z.string().max(30).optional(),
  strength: z.string().max(30).optional(),
  note: z.string().max(600).optional(),
});

const FormationChatInput = z.object({
  symbol: z.string().min(1).max(30),
  market: z.string().min(1).max(30),
  interval: z.string().min(1).max(10),

  analysis: z.unknown(),

  userLines: z
    .array(UserFormationLineSchema)
    .max(20),

  relevantNews: z
    .array(NewsContextSchema)
    .max(10),

  messages: z
    .array(ChatMessageSchema)
    .max(30),

  question: z
    .string()
    .min(1)
    .max(3000),
});

export const askFormationChat = createServerFn({
  method: "POST",
})
  .inputValidator((data: unknown) =>
    FormationChatInput.parse(data),
  )
  .handler(async ({ data }) => {
    const { answerFormationChat } = await import(
      "./formation-chat.server"
    );

    try {
      const answer = await answerFormationChat({
        symbol: data.symbol,
        market: data.market,
        interval: data.interval,

        analysis: data.analysis as ChartAnalysis | null,

        userLines:
          data.userLines as UserFormationLine[],

        relevantNews:
          data.relevantNews as NewsContextItem[],

        messages: data.messages,

        question: data.question,
      });

      return {
        answer,
        error: null as string | null,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Formasyon AI sohbeti şu anda yanıt veremiyor.";

      return {
        answer: null as string | null,
        error: message,
      };
    }
  });