// src/components/Skeleton.tsx

// ==========================================================
// TEMEL SKELETON (animasyonlu gri blok)
// ==========================================================

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded-md bg-secondary/60 ${className}`}
      style={style}
    />
  );
}

// ==========================================================
// SKELETON SATIR (küçük kart - liste öğeleri için)
// ==========================================================

export function SkeletonRow({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-border p-3 sm:p-4">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-3/4" />
        {lines > 1 && <Skeleton className="h-2 w-1/2" />}
      </div>
      <Skeleton className="h-6 w-16 shrink-0" />
    </div>
  );
}

// ==========================================================
// SKELETON KART (orta boy)
// ==========================================================

export function SkeletonCard() {
  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-6 w-16" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="grid grid-cols-3 gap-2 pt-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}

// ==========================================================
// SKELETON LİSTE (birden fazla kart/satır)
// ==========================================================

export function SkeletonList({
  count = 5,
  variant = "row",
}: {
  count?: number;
  variant?: "row" | "card";
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          {variant === "row" ? <SkeletonRow /> : <SkeletonCard />}
        </div>
      ))}
    </div>
  );
}

// ==========================================================
// SKELETON STAT KART (dashboard / stats için)
// ==========================================================

export function SkeletonStat() {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-6 w-16" />
    </div>
  );
}

// ==========================================================
// SKELETON STAT GRID (4'lü istatistik bloğu)
// ==========================================================

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  );
}