import type { ChartAnalysis } from "@/lib/analysis.functions";
import type { NewsImpact } from "@/lib/news.functions";

function num(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) return value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toPrecision(4);
}

export function ReasoningPanel({
  analysis,
  loading,
  error,
}: {
  analysis: ChartAnalysis | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="panel p-5">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          AI neden bu formasyonu çizdi
        </h2>
        {analysis && (
          <span className="num text-xs text-muted-foreground">
            güven %{Math.round(analysis.pattern.confidence)}
          </span>
        )}
      </header>
      {loading && <p className="mt-3 text-sm text-muted-foreground">Mumlar inceleniyor...</p>}
      {error && !loading && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {analysis && !loading && (
        <>
          <p className="mt-3 text-base font-semibold">
            {analysis.pattern.name}{" "}
            <span
              className={
                analysis.pattern.bias === "yükseliş"
                  ? "text-bull"
                  : analysis.pattern.bias === "düşüş"
                    ? "text-bear"
                    : "text-muted-foreground"
              }
            >
              · {analysis.pattern.bias}
            </span>
          </p>
          <ul className="mt-3 space-y-2">
            {(analysis.reasoning ?? []).map((line, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/90">
                <span className="num text-primary">{String(i + 1).padStart(2, "0")}</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {analysis.newsEffect && (
            <div className="mt-4 rounded-md border border-border bg-card p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Haber etkisi + formasyon
              </p>
              <p className="mt-2 text-sm">
                <span
                  className={
                    analysis.newsEffect.direction === "yukarı"
                      ? "text-bull"
                      : analysis.newsEffect.direction === "aşağı"
                        ? "text-bear"
                        : "text-muted-foreground"
                  }
                >
                  Haberler {analysis.newsEffect.direction} ({analysis.newsEffect.strength})
                </span>{" "}
                · formasyonu{" "}
                <span
                  className={
                    analysis.newsEffect.alignment === "destekliyor"
                      ? "text-bull"
                      : analysis.newsEffect.alignment === "çelişiyor"
                        ? "text-bear"
                        : "text-warn"
                  }
                >
                  {analysis.newsEffect.alignment}
                </span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/90">{analysis.newsEffect.summary}</p>
              {(analysis.newsEffect.drivers ?? []).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {analysis.newsEffect.drivers.map((d, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      • {d}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function PredictionPanel({
  analysis,
  loading,
}: {
  analysis: ChartAnalysis | null;
  loading: boolean;
}) {
  const p = analysis?.prediction;
  const tone =
    p?.action === "AL" ? "text-bull" : p?.action === "SAT" ? "text-bear" : "text-warn";

  return (
    <section className="panel p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Alım / satım tahmini
      </h2>
      {loading && <p className="mt-3 text-sm text-muted-foreground">Senaryo hesaplanıyor...</p>}
      {!loading && !p && <p className="mt-3 text-sm text-muted-foreground">Analiz bekleniyor.</p>}
      {!loading && p && (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <span className={`num text-3xl font-bold ${tone}`}>{p.action}</span>
            <span className="num text-xs text-muted-foreground">
              güven %{Math.round(p.confidence)} · {p.horizon}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-md bg-card p-3">
              <dt className="text-xs text-muted-foreground">Giriş</dt>
              <dd className="num mt-1 text-sm font-semibold">{num(p.entry)}</dd>
            </div>
            <div className="rounded-md bg-card p-3">
              <dt className="text-xs text-muted-foreground">Zarar kes</dt>
              <dd className="num mt-1 text-sm font-semibold text-bear">{num(p.stop)}</dd>
            </div>
            <div className="rounded-md bg-card p-3">
              <dt className="text-xs text-muted-foreground">Hedefler</dt>
              <dd className="num mt-1 text-sm font-semibold text-bull">
                {(p.targets ?? []).map(num).join(" / ") || "-"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {p.riskNote} — Bu içerik yatırım tavsiyesi değildir.
          </p>
        </>
      )}
    </section>
  );
}

export function NewsPanel({
  items,
  loading,
  error,
}: {
  items: NewsImpact[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="panel p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Anlık haberler ve piyasa etkisi
      </h2>
      {loading && <p className="mt-3 text-sm text-muted-foreground">Haber akışı taranıyor...</p>}
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}
      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li key={item.link || item.title} className="border-b border-border pb-4 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="num rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                {item.source}
              </span>
              <span>{item.published ? new Date(item.published).toLocaleString("tr-TR") : ""}</span>
            </div>
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1.5 block text-sm font-semibold leading-snug hover:text-primary"
            >
              {item.title}
            </a>
            {item.summary && <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>}
            {item.detail && (
              <p className="mt-1 text-xs leading-relaxed text-foreground/80">{item.detail}</p>
            )}
            {item.assets.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {item.assets.map((a, i) => (
                  <span
                    key={`${a.asset}-${i}`}
                    title={a.note}
                    className={`num rounded border px-2 py-1 text-xs ${
                      a.direction === "yukarı"
                        ? "border-bull/40 text-bull"
                        : a.direction === "aşağı"
                          ? "border-bear/40 text-bear"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {a.asset} {a.direction === "yukarı" ? "▲" : a.direction === "aşağı" ? "▼" : "▬"} {a.strength}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
