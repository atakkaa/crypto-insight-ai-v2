export type DeterministicNewsItem = {
  title: string;
  summary?: string;
  detail?: string;
  direction?: "yukarı" | "aşağı" | "yatay";
  strength?: "yüksek" | "orta" | "düşük";
  note?: string;
};

export type FormationNewsImpact = {
  effect: "destekliyor" | "nötr" | "zayıflatıyor" | "geçersizleştirme riski";
  direction: "yukarı" | "aşağı" | "yatay";
  strength: "yüksek" | "orta" | "düşük";
  score: number;
  reason: string;
  newsCount: number;
};

const POSITIVE = [
  "anlaşma", "onay", "onaylandı", "yatırım", "yatırımcı", "giriş", "rekor",
  "büyüme", "artış", "arttı", "yükseldi", "yükseliş", "güçlü", "pozitif",
  "kar art", "gelir art", "beklentiyi aşt", "talep art", "faiz indir",
  "teşvik", "etf girişi", "net giriş", "upgrade", "beat", "approval",
];

const NEGATIVE = [
  "saldırı", "hack", "hacker", "dava", "ceza", "yaptırım", "yasak", "kriz",
  "iflas", "kayıp", "zarar", "düşüş", "düştü", "geriledi", "negatif",
  "satış baskısı", "çıkış", "net çıkış", "faiz artır", "enflasyon artt",
  "işten çıkar", "downgrade", "miss", "recession", "risk",
];

function inferDirection(text: string): {
  direction: "yukarı" | "aşağı" | "yatay";
  strength: "yüksek" | "orta" | "düşük";
  note: string;
} {
  const normalizedText = text.toLocaleLowerCase("tr-TR");
  const positiveHits = POSITIVE.filter((keyword) => normalizedText.includes(keyword)).length;
  const negativeHits = NEGATIVE.filter((keyword) => normalizedText.includes(keyword)).length;

  if (positiveHits === 0 && negativeHits === 0) {
    return {
      direction: "yatay",
      strength: "düşük",
      note: "Haber metninde belirgin yönlü etki anahtarı bulunamadı.",
    };
  }

  if (positiveHits === negativeHits) {
    return {
      direction: "yatay",
      strength: "orta",
      note: "Olumlu ve olumsuz sinyaller birlikte bulunduğu için haber etkisi dengeli.",
    };
  }

  const direction = positiveHits > negativeHits ? "yukarı" : "aşağı";
  const hits = Math.max(positiveHits, negativeHits);
  const strength = hits >= 4 ? "yüksek" : hits >= 2 ? "orta" : "düşük";

  return {
    direction,
    strength,
    note: `AI olmadan yapılan metin tabanlı değerlendirme: ${hits} yönlü haber göstergesi bulundu.`,
  };
}

export function normalizeNewsForDeterministicAnalysis(
  items: DeterministicNewsItem[],
): DeterministicNewsItem[] {
  return items.map((item: DeterministicNewsItem) => {
    if (item.direction) return item;

    return {
      ...item,
      ...inferDirection(
        [item.title, item.summary ?? "", item.detail ?? ""].join(" "),
      ),
    };
  });
}

export function evaluateFormationNewsImpact(
  formationBias: "yükseliş" | "düşüş" | "nötr",
  items: DeterministicNewsItem[],
): FormationNewsImpact {
  const news = normalizeNewsForDeterministicAnalysis(items);
  const relevant = news.filter(
    (item) => item.direction && item.direction !== "yatay",
  );

  if (formationBias === "nötr" || relevant.length === 0) {
    return {
      effect: "nötr",
      direction: "yatay",
      strength: "düşük",
      score: 0,
      reason:
        formationBias === "nötr"
          ? "Formasyon yönü nötr olduğu için haberin formasyona yönlü etkisi belirlenemedi."
          : "İlgili haberlerde formasyon yönünü net biçimde destekleyen veya zayıflatan sinyal bulunamadı.",
      newsCount: news.length,
    };
  }

  const formationDirection = formationBias === "yükseliş" ? "yukarı" : "aşağı";
  let score = 0;

  for (const item of relevant) {
    const weight =
      item.strength === "yüksek" ? 3 :
      item.strength === "orta" ? 2 : 1;

    score += item.direction === formationDirection ? weight : -weight;
  }

  const absolute = Math.abs(score);
  const direction: FormationNewsImpact["direction"] =
    score > 0
      ? formationBias === "yükseliş"
        ? "yukarı"
        : "aşağı"
      : formationBias === "yükseliş"
        ? "aşağı"
        : "yukarı";

  const strength =
    absolute >= 5 ? "yüksek" : absolute >= 2 ? "orta" : "düşük";

  let effect: FormationNewsImpact["effect"];

  if (score >= 4) effect = "destekliyor";
  else if (score <= -5) effect = "geçersizleştirme riski";
  else if (score < 0) effect = "zayıflatıyor";
  else effect = "nötr";

  const reason =
    effect === "destekliyor"
      ? `Haber yönü mevcut ${formationBias} formasyonuyla uyumlu; toplam haber etkisi +${score}.`
      : effect === "zayıflatıyor"
        ? `Haber yönü mevcut ${formationBias} formasyonuna karşı; toplam haber etkisi ${score}.`
        : effect === "geçersizleştirme riski"
          ? `Güçlü olumsuz haber akışı mevcut ${formationBias} formasyonunu ciddi biçimde zayıflatıyor; toplam etki ${score}.`
          : "Haber akışında formasyon yönünü belirgin biçimde değiştirecek üstünlük yok.";

  return {
    effect,
    direction,
    strength,
    score,
    reason,
    newsCount: news.length,
  };
}
