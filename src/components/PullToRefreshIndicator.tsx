// src/components/PullToRefreshIndicator.tsx

type Props = {
  pullDistance: number;
  isPulling: boolean;
  isRefreshing: boolean;
  threshold?: number;
};

/**
 * Sayfa üstünde görünen pull-to-refresh göstergesi.
 * Çekme mesafesine göre ok döner, eşiğe ulaşınca "Bırak" yazısı çıkar,
 * yenileme sırasında spinner döner.
 */
export function PullToRefreshIndicator({
  pullDistance,
  isPulling,
  isRefreshing,
  threshold = 80,
}: Props) {
  // Eğer hiçbir şey aktif değilse gösterme
  if (!isPulling && !isRefreshing && pullDistance === 0) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const ready = pullDistance >= threshold;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[95] flex justify-center"
      style={{
        transform: `translateY(${Math.min(pullDistance, threshold * 1.2)}px)`,
        transition: isPulling ? "none" : "transform 0.2s ease-out",
      }}
    >
      <div
        className={`mt-2 flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur ${
          isRefreshing ? "opacity-100" : "opacity-90"
        }`}
        style={{
          transform: `scale(${isRefreshing ? 1 : 0.85 + progress * 0.15})`,
          transition: "transform 0.15s ease-out",
        }}
      >
        {isRefreshing ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-xs font-bold text-primary">Yenileniyor...</span>
          </>
        ) : ready ? (
          <>
            <span className="text-base">🔄</span>
            <span className="text-xs font-bold text-primary">Bırak, yenile</span>
          </>
        ) : (
          <>
            <span
              className="text-base"
              style={{
                display: "inline-block",
                transform: `rotate(${progress * 180}deg)`,
                transition: "transform 0.1s linear",
              }}
            >
              ⬇️
            </span>
            <span className="text-xs font-bold text-muted-foreground">
              Aşağı çek
            </span>
          </>
        )}
      </div>
    </div>
  );
}