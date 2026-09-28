import { useEffect, useState } from "react";

import type { ChartAnalysis } from "@/lib/analysis.functions";
import type { TradingViewLine } from "@/components/CandleChart";
import type { FormationEngineCandidate } from "@/lib/analysis-types";
import {
  evaluateFormation,
  type FormationEvaluationResult,
} from "@/lib/formation-evaluation.functions";
import { askFormationChat } from "@/lib/formation-chat.functions";

type Props = {
  symbol: string;
  interval: string;
  market?: string;
  analysis: ChartAnalysis | null;

  relevantNews: Array<{
    title: string;
    source: string;
    summary: string;
    detail: string;
    direction?: "yukarı" | "aşağı" | "yatay";
    strength?: "yüksek" | "orta" | "düşük";
    note?: string;
  }>;

  userLines: TradingViewLine[];

  messages: FormationChatMessage[];

  onMessagesChange: (messages: FormationChatMessage[]) => void;

  onClose: () => void;
};

export type FormationChatMessage = {
  role: "user" | "assistant";
  text: string;
};

function drawingStructure(lines: TradingViewLine[]) {
  if (lines.length === 0) {
    return "Çizim bulunamadı.";
  }

  if (lines.length === 1) {
    const line = lines[0];

    if (!line) {
      return "Çizim bulunamadı.";
    }

    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;

    if (Math.abs(dx) < 0.001) {
      return "Dikey çizgi";
    }

    const slope = dy / dx;

    if (slope < -0.08) {
      return "Yükselen trend çizgisi";
    }

    if (slope > 0.08) {
      return "Düşen trend çizgisi";
    }

    return "Yatay destek/direnç çizgisi";
  }

  const slopes = lines.map((line) => {
    const dx = line.end.x - line.start.x;

    if (Math.abs(dx) < 0.001) {
      return 0;
    }

    return (line.end.y - line.start.y) / dx;
  });

  const hasUp = slopes.some((value) => value < -0.08);
  const hasDown = slopes.some((value) => value > 0.08);

  if (hasUp && hasDown) {
    return "Yakınsayan iki trend çizgisi — üçgen/kırılım adayı";
  }

  if (slopes.every((value) => Math.abs(value) <= 0.08)) {
    return "Yatay bant / destek-direnç yapısı";
  }

  return "Kanal yapısı adayı";
}

function scoreLabel(score: number) {
  if (score >= 80) return "Yüksek teknik uyum";
  if (score >= 60) return "Orta teknik uyum";
  if (score >= 40) return "Sınırlı teknik uyum";

  return "Düşük teknik uyum";
}

function alignmentLabel(
  alignment: FormationEvaluationResult["comparison"]["alignment"],
) {
  if (alignment === "uyumlu") {
    return "🟢 Uyumlu";
  }

  if (alignment === "kısmen uyumlu") {
    return "🟡 Kısmen uyumlu";
  }

  return "🔴 Uyumsuz";
}

function engineBiasLabel(
  bias: FormationEngineCandidate["bias"],
) {
  if (bias === "yükseliş") {
    return "🟢 Yükseliş";
  }

  if (bias === "düşüş") {
    return "🔴 Düşüş";
  }

  return "🟡 Nötr";
}

function breakoutLabel(
  breakout: FormationEngineCandidate["breakoutStatus"],
) {
  if (breakout === "yukarı kırılım") {
    return "🟢 Yukarı kırılım";
  }

  if (breakout === "aşağı kırılım") {
    return "🔴 Aşağı kırılım";
  }

  return "🟡 Kırılım yok";
}

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("tr-TR", {
      maximumFractionDigits: 2,
    });
  }

  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }

  return value.toPrecision(5);
}

export function FormationEvaluationPanel({
  symbol,
  interval,
  market = "bilinmiyor",
  analysis,
  relevantNews,
  userLines,
  messages,
  onMessagesChange,
  onClose,
}: Props) {
  const [evaluation, setEvaluation] =
    useState<FormationEvaluationResult | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [reason, setReason] = useState("");

  const [chatInput, setChatInput] = useState("");

  const [chatLoading, setChatLoading] = useState(false);

  const [reasonSubmitted, setReasonSubmitted] = useState(false);

  /*
   * ============================================================
   * FORMASYON MOTORU
   * ============================================================
   *
   * analysis içinde formationEngine varsa kullanılır.
   *
   * ÖNEMLİ:
   * engine null olabilir.
   * Bu nedenle aşağıdaki tüm kullanımlarda güvenli kontroller
   * yapılmaktadır.
   */
  const engine = analysis?.formationEngine ?? null;

  const enginePrimary = engine?.primary ?? null;

  /**
   * Formasyon değerlendirmesini çalıştırır.
   *
   * reasonOverride verilirse kullanıcının yazdığı gerekçe
   * doğrudan AI değerlendirme katmanına gönderilir.
   */
  async function runEvaluation(reasonOverride = "") {
    setLoading(true);
    setError(null);

    try {
      const response = await evaluateFormation({
        data: {
          symbol,
          market,
          interval,
          analysis,
          userLines,
          userReason: reasonOverride,
          relevantNews,
        },
      });

      if (response.error) {
        setError(response.error);
        setEvaluation(null);
        return;
      }

      setEvaluation(response.result);
      setReasonSubmitted(Boolean(reasonOverride.trim()));
    } catch (evaluationError) {
      setEvaluation(null);

      setError(
        evaluationError instanceof Error
          ? evaluationError.message
          : "Formasyon değerlendirmesi sırasında bir hata oluştu.",
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * Panel ilk açıldığında mevcut AI analiziyle
   * kullanıcının çizimini değerlendir.
   */
  useEffect(() => {
    let cancelled = false;

    async function initialEvaluation() {
      setLoading(true);
      setError(null);

      try {
        const response = await evaluateFormation({
          data: {
            symbol,
            market,
            interval,
            analysis,
            userLines,
            userReason: "",
            relevantNews,
          },
        });

        if (cancelled) {
          return;
        }

        if (response.error) {
          setError(response.error);
          setEvaluation(null);
          return;
        }

        setEvaluation(response.result);
      } catch (evaluationError) {
        if (cancelled) {
          return;
        }

        setEvaluation(null);

        setError(
          evaluationError instanceof Error
            ? evaluationError.message
            : "Formasyon değerlendirmesi sırasında bir hata oluştu.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void initialEvaluation();

    return () => {
      cancelled = true;
    };
  }, [
    symbol,
    market,
    interval,
    analysis,
    userLines,
    relevantNews,
  ]);

  /**
   * Kullanıcının yazdığı gerekçeyle tekrar AI değerlendirmesi.
   */
  async function evaluateWithReason() {
    const cleanedReason = reason.trim();

    if (!cleanedReason) {
      setError("Önce formasyonu neden düşündüğünü kısaca yaz.");
      return;
    }

    await runEvaluation(cleanedReason);
  }

  /**
   * Gerçek Formasyon AI sohbeti.
   *
   * Kullanıcının sorusu + mevcut AI analizi + kullanıcı çizimi +
   * haberler + önceki sohbet mesajları server tarafındaki AI'ya gönderiliyor.
   */
  async function sendChat() {
    const question = chatInput.trim();

    if (!question || chatLoading) {
      return;
    }

    const userMessage: FormationChatMessage = {
      role: "user",
      text: question,
    };

    const nextMessages = [...messages, userMessage];

    onMessagesChange(nextMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await askFormationChat({
        data: {
          symbol,
          market,
          interval,
          analysis,
          userLines,
          relevantNews,
          messages,
          question,
        },
      });

      if (response.error) {
        onMessagesChange([
          ...nextMessages,
          {
            role: "assistant",
            text: `⚠️ Formasyon AI yanıt veremedi: ${response.error}`,
          },
        ]);

        return;
      }

      onMessagesChange([
        ...nextMessages,
        {
          role: "assistant",
          text:
            response.answer ??
            "Bu soru için mevcut teknik verilerle anlamlı bir cevap oluşturulamadı.",
        },
      ]);
    } catch (chatError) {
      onMessagesChange([
        ...nextMessages,
        {
          role: "assistant",
          text:
            chatError instanceof Error
              ? `⚠️ Formasyon AI sohbetinde hata oluştu: ${chatError.message}`
              : "⚠️ Formasyon AI sohbetinde beklenmeyen bir hata oluştu.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  const userFormationName =
    evaluation?.userFormation.name ?? drawingStructure(userLines);

  const aiFormationName =
    evaluation?.aiFormation.name ??
    analysis?.pattern?.name ??
    "Henüz yok";

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">
            🤖 FORMASYONU DEĞERLENDİR
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            {symbol} · {interval}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Yüzdeler başarı veya kazanç ihtimali değildir; mevcut
            teknik verilere uyum skorudur.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary"
        >
          ✕ Kapat
        </button>
      </div>

      {loading && (
        <div className="mt-4 rounded-xl border border-border bg-card p-6 text-center">
          <div className="text-2xl">🤖</div>

          <p className="mt-2 text-sm font-bold">
            Formasyon AI değerlendiriyor...
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Kullanıcı çizimi, mevcut AI formasyonu, indikatörler,
            hacim ve haberler birlikte analiz ediliyor.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-bold text-destructive">
            ⚠️ Değerlendirme yapılamadı
          </p>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {error}
          </p>
        </div>
      )}

      {evaluation && !loading && (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                Senin çizimin
              </p>

              <p className="mt-1 font-bold">
                {userFormationName}
              </p>

              <p className="mt-2 text-xs text-muted-foreground">
                Yön:{" "}
                <span className="font-semibold text-foreground">
                  {evaluation.userFormation.direction}
                </span>
              </p>

              <p className="mt-3 text-3xl font-bold">
                %{evaluation.userFormation.compatibilityScore}
              </p>

              <p className="text-[11px] text-muted-foreground">
                {scoreLabel(
                  evaluation.userFormation.compatibilityScore,
                )}
              </p>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {evaluation.userFormation.explanation}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                Mevcut AI formasyonu
              </p>

              <p className="mt-1 font-bold">
                {aiFormationName}
              </p>

              <p className="mt-2 text-xs text-muted-foreground">
                Yön:{" "}
                <span className="font-semibold text-foreground">
                  {evaluation.aiFormation.direction}
                </span>
              </p>

              <p className="mt-3 text-3xl font-bold">
                %{evaluation.aiFormation.compatibilityScore}
              </p>

              <p className="text-[11px] text-muted-foreground">
                {scoreLabel(
                  evaluation.aiFormation.compatibilityScore,
                )}
              </p>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {evaluation.aiFormation.explanation}
              </p>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground">
                Formasyon karşılaştırması
              </p>

              <p className="mt-2 text-lg font-bold">
                {alignmentLabel(
                  evaluation.comparison.alignment,
                )}
              </p>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {evaluation.comparison.summary}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold">
                🔎 Teknik karşılaştırma
              </h3>

              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                {evaluation.comparison.technicalReasons.length >
                0 ? (
                  evaluation.comparison.technicalReasons.map(
                    (item: string, index: number) => (
                      <li key={`${item}-${index}`}>
                        • {item}
                      </li>
                    ),
                  )
                ) : (
                  <li>
                    • AI tarafından özel bir karşılaştırma nedeni
                    belirtilmedi.
                  </li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold">
                📊 İndikatör değerlendirmesi
              </h3>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Yön:{" "}
                <span className="font-semibold text-foreground">
                  {evaluation.indicatorAssessment.direction}
                </span>
              </p>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {evaluation.indicatorAssessment.summary}
              </p>

              {evaluation.indicatorAssessment
                .supportingIndicators.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold">
                    🟢 Destekleyenler
                  </p>

                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {evaluation.indicatorAssessment.supportingIndicators.map(
                      (item: string, index: number) => (
                        <li key={`${item}-${index}`}>
                          • {item}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}

              {evaluation.indicatorAssessment
                .conflictingIndicators.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold">
                    🔴 Çelişenler
                  </p>

                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {evaluation.indicatorAssessment.conflictingIndicators.map(
                      (item: string, index: number) => (
                        <li key={`${item}-${index}`}>
                          • {item}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold">
                📈 Hacim teyidi
              </h3>

              <p className="mt-2 text-2xl font-bold">
                {Number(
                  evaluation.volumeAssessment.ratio,
                ).toFixed(2)}
                x
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Ortalama hacme göre
              </p>

              <p className="mt-3 text-sm leading-6">
                {evaluation.volumeAssessment.confirmed
                  ? "🟢 Hacim teyidi mevcut."
                  : "🟡 Hacim henüz teyit seviyesinde değil."}
              </p>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {evaluation.volumeAssessment.summary}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold">
                📰 Haber etkisi
              </h3>

              <p className="mt-2 text-sm">
                Yön:{" "}
                <span className="font-bold">
                  {evaluation.newsAssessment.direction}
                </span>
              </p>

              <p className="mt-1 text-sm">
                Güç:{" "}
                <span className="font-bold">
                  {evaluation.newsAssessment.strength}
                </span>
              </p>

              <p className="mt-1 text-sm">
                Etki:{" "}
                <span className="font-bold">
                  {evaluation.newsAssessment.alignment}
                </span>
              </p>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {evaluation.newsAssessment.summary}
              </p>

              {evaluation.newsAssessment.drivers.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {evaluation.newsAssessment.drivers.map(
                    (item: string, index: number) => (
                      <li key={`${item}-${index}`}>
                        • {item}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-bold">
              🧠 AI'nin genel teknik değerlendirmesi
            </h3>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {evaluation.finalAssessment}
            </p>

            <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3">
              <p className="text-xs font-bold">
                ⚠️ Risk / geçersizlik şartı
              </p>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {evaluation.riskNote}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold">
                🟢 Kullanıcı çiziminin güçlü tarafları
              </h3>

              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                {evaluation.userFormation.strengths.length >
                0 ? (
                  evaluation.userFormation.strengths.map(
                    (item: string, index: number) => (
                      <li key={`${item}-${index}`}>
                        • {item}
                      </li>
                    ),
                  )
                ) : (
                  <li>
                    • AI tarafından ayrıca belirtilen güçlü taraf
                    bulunmadı.
                  </li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold">
                🔴 Kullanıcı çiziminin zayıf tarafları
              </h3>

              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                {evaluation.userFormation.weaknesses.length >
                0 ? (
                  evaluation.userFormation.weaknesses.map(
                    (item: string, index: number) => (
                      <li key={`${item}-${index}`}>
                        • {item}
                      </li>
                    ),
                  )
                ) : (
                  <li>
                    • AI tarafından ayrıca belirtilen zayıf taraf
                    bulunmadı.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </>
      )}

      {/* ============================================================
          FORMASYON MOTORU
          ============================================================ */}

      {engine && (
        <section className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">
                🧠 Teknik Formasyon Motoru
              </h3>

              <p className="mt-1 text-xs text-muted-foreground">
                Bu bölüm fiyat geometrisi, swing noktaları,
                destek/direnç ve kırılım verilerinden oluşturulan
                teknik formasyon adaylarını gösterir.
              </p>

              <p className="mt-1 text-[11px] text-muted-foreground">
                Skor başarı veya kazanç ihtimali değildir; formasyonun
                mevcut fiyat yapısına teknik uyum skorudur.
              </p>
            </div>

            {enginePrimary && (
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-right">
                <p className="text-[10px] text-muted-foreground">
                  ANA ADAY
                </p>

                <p className="text-sm font-bold">
                  {enginePrimary.name}
                </p>

                <p className="text-xs text-muted-foreground">
                  %{Math.round(enginePrimary.score)}
                </p>
              </div>
            )}
          </div>

          {enginePrimary ? (
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    Birincil teknik aday
                  </p>

                  <h4 className="mt-1 text-lg font-bold">
                    {enginePrimary.name}
                  </h4>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-bold">
                      {engineBiasLabel(enginePrimary.bias)}
                    </span>

                    <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-bold">
                      {breakoutLabel(
                        enginePrimary.breakoutStatus,
                      )}
                    </span>

                    <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-bold">
                      Teknik uyum %{Math.round(enginePrimary.score)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] text-muted-foreground">
                    Destek
                  </p>

                  <p className="mt-1 text-sm font-bold">
                    {formatPrice(enginePrimary.support)}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] text-muted-foreground">
                    Direnç
                  </p>

                  <p className="mt-1 text-sm font-bold">
                    {formatPrice(enginePrimary.resistance)}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] text-muted-foreground">
                    Boyun çizgisi
                  </p>

                  <p className="mt-1 text-sm font-bold">
                    {formatPrice(enginePrimary.neckline)}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] text-muted-foreground">
                    Hedef
                  </p>

                  <p className="mt-1 text-sm font-bold">
                    {formatPrice(enginePrimary.target)}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs font-bold">
                  📌 Teknik gerekçeler
                </p>

                {enginePrimary.reasons.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                    {enginePrimary.reasons.map(
                      (item: string, index: number) => (
                        <li key={`${item}-${index}`}>
                          • {item}
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Bu aday için ayrıca açıklanmış teknik gerekçe
                    bulunmuyor.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-bold">
                Henüz yeterli formasyon adayı bulunamadı.
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Motor mevcut mum yapısında yeterli geometrik kanıt
                bulamadı.
              </p>
            </div>
          )}

          {/* Diğer adaylar */}
          <div className="mt-4">
            <h4 className="text-xs font-bold">
              🔍 Diğer formasyon adayları
            </h4>

            {(engine?.candidates?.length ?? 0) <= 1 ? (
              <div className="mt-2 rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  Ana aday dışında gösterilecek başka güçlü formasyon
                  adayı bulunamadı.
                </p>
              </div>
            ) : (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {engine?.candidates
                  ?.filter(
                    (candidate: FormationEngineCandidate) =>
                      candidate !== enginePrimary,
                  )
                  .map(
                    (
                      candidate: FormationEngineCandidate,
                      index: number,
                    ) => (
                      <div
                        key={`${candidate.name}-${index}`}
                        className="rounded-lg border border-border bg-card p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold">
                              {candidate.name}
                            </p>

                            <div className="mt-1 flex flex-wrap gap-1">
                              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                                {engineBiasLabel(
                                  candidate.bias,
                                )}
                              </span>

                              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                                {breakoutLabel(
                                  candidate.breakoutStatus,
                                )}
                              </span>
                            </div>
                          </div>

                          <span className="text-sm font-bold">
                            %{Math.round(candidate.score)}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-muted-foreground">
                              Destek
                            </span>

                            <p className="font-semibold">
                              {formatPrice(candidate.support)}
                            </p>
                          </div>

                          <div>
                            <span className="text-muted-foreground">
                              Direnç
                            </span>

                            <p className="font-semibold">
                              {formatPrice(candidate.resistance)}
                            </p>
                          </div>

                          <div>
                            <span className="text-muted-foreground">
                              Hedef
                            </span>

                            <p className="font-semibold">
                              {formatPrice(candidate.target)}
                            </p>
                          </div>

                          <div>
                            <span className="text-muted-foreground">
                              Geçersizlik
                            </span>

                            <p className="font-semibold">
                              {formatPrice(
                                candidate.invalidation,
                              )}
                            </p>
                          </div>
                        </div>

                        {candidate.reasons.length > 0 && (
                          <ul className="mt-3 space-y-1 text-[11px] leading-5 text-muted-foreground">
                            {candidate.reasons.map(
                              (
                                item: string,
                                reasonIndex: number,
                              ) => (
                                <li
                                  key={`${item}-${reasonIndex}`}
                                >
                                  • {item}
                                </li>
                              ),
                            )}
                          </ul>
                        )}
                      </div>
                    ),
                  )}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground">
                Tespit edilen swing tepeleri
              </p>

              <p className="mt-1 text-lg font-bold">
                {engine.swingHighs.length}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground">
                Tespit edilen swing dipleri
              </p>

              <p className="mt-1 text-lg font-bold">
                {engine.swingLows.length}
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold">
          📝 Sen bu formasyonu neden düşündün?
        </h3>

        <p className="mt-1 text-xs text-muted-foreground">
          Buraya formasyonu neden çizdiğini yaz. Örneğin fiyat
          hareketi, destek/direnç, hacim, indikatör veya gördüğün
          bir haber olabilir.
        </p>

        <textarea
          value={reason}
          onChange={(event) =>
            setReason(event.target.value)
          }
          placeholder="Örn: Bu formasyonu düşündüm çünkü fiyat destekten döndü, hacim arttı ve haber pozitifti..."
          className="mt-3 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void evaluateWithReason()}
            disabled={loading || !reason.trim()}
            className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            🤖 Gerekçemle Tekrar Değerlendir
          </button>

          {reasonSubmitted && !loading && (
            <span className="text-xs text-muted-foreground">
              ✓ Gerekçen AI değerlendirmesine gönderildi.
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-bold">
            💬 Formasyon AI — Teknik Sohbet
          </h3>

          <p className="mt-1 text-xs text-muted-foreground">
            Sadece formasyon, teknik analiz, indikatör, hacim,
            destek/direnç, kırılım ve ilgili haberler.
          </p>
        </div>

        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border bg-background p-3">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Örn: “Bu çizim neden AI formasyonuyla uyuşmuyor?”
            </p>
          )}

          {messages.map(
            (message: FormationChatMessage, index: number) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-lg p-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-8 bg-primary/10"
                    : "mr-8 bg-secondary/60"
                }`}
              >
                <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                  {message.role === "user"
                    ? "Sen"
                    : "Formasyon AI"}
                </p>

                {message.text}
              </div>
            ),
          )}

          {chatLoading && (
            <div className="mr-8 rounded-lg bg-secondary/60 p-3 text-sm leading-6">
              <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                Formasyon AI
              </p>

              <p className="text-muted-foreground">
                🤖 Teknik verileri değerlendiriyor...
              </p>
            </div>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <input
            value={chatInput}
            onChange={(event) =>
              setChatInput(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendChat();
              }
            }}
            disabled={chatLoading}
            placeholder="Formasyon hakkında soru sor..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring disabled:opacity-60"
          />

          <button
            type="button"
            onClick={() => void sendChat()}
            disabled={chatLoading || !chatInput.trim()}
            className="rounded-md bg-primary px-4 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chatLoading ? "..." : "Gönder"}
          </button>
        </div>
      </div>
    </section>
  );
}