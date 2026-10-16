// src/hooks/usePullToRefresh.ts
import { useEffect, useRef, useState } from "react";

type Options = {
  /** Çekme eşiği (px). Bu değeri geçince tetiklenir. Varsayılan: 80 */
  threshold?: number;
  /** Tetiklendiğinde çağrılacak async fonksiyon */
  onRefresh: () => Promise<void> | void;
  /** Bu hook aktif mi? Varsayılan: true */
  enabled?: boolean;
};

type PullState = {
  /** Şu anki çekme mesafesi (px) */
  pullDistance: number;
  /** Kullanıcı çekiyor mu? */
  isPulling: boolean;
  /** Yenileme çalışıyor mu? */
  isRefreshing: boolean;
};

/**
 * Mobil cihazlarda sayfanın en üstünden aşağı çekince yenileme yapan hook.
 * Touch event'lerini dinler, sayfa en üstte değilse tetiklenmez.
 */
export function usePullToRefresh({
  threshold = 80,
  onRefresh,
  enabled = true,
}: Options): PullState {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const isTouchingRef = useRef(false);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!("ontouchstart" in window)) return; // Sadece dokunmatik cihazlarda

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;

      // Sayfa en üstte mi?
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      if (scrollTop > 5) return;

      // Yenileme zaten çalışıyor mu?
      if (isRefreshingRef.current) return;

      startYRef.current = touch.clientY;
      isTouchingRef.current = true;
    }

    function handleTouchMove(e: TouchEvent) {
      if (!isTouchingRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      const currentY = touch.clientY;
      const deltaY = currentY - startYRef.current;

      // Sadece aşağı çekişleri dinle
      if (deltaY <= 0) {
        setPullDistance(0);
        setIsPulling(false);
        return;
      }

      // Sayfa scroll'u yukarı kaydıysa iptal
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      if (scrollTop > 5) {
        setPullDistance(0);
        setIsPulling(false);
        isTouchingRef.current = false;
        return;
      }

      // Direnç efekti (çekmeyi yavaşlat)
      const damped = Math.min(deltaY * 0.5, threshold * 1.6);
      setPullDistance(damped);
      setIsPulling(damped > 10);

      // Varsayılan scroll'u engelle (pull-to-refresh sırasında)
      if (damped > 10 && e.cancelable) {
        e.preventDefault();
      }
    }

    async function handleTouchEnd() {
      if (!isTouchingRef.current) return;
      isTouchingRef.current = false;

      const shouldRefresh = pullDistance >= threshold;
      setPullDistance(0);
      setIsPulling(false);

      if (!shouldRefresh || isRefreshingRef.current) return;

      isRefreshingRef.current = true;
      setIsRefreshing(true);

      try {
        await onRefresh();
      } catch (err) {
        console.error("Pull-to-refresh hatası:", err);
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
      }
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, threshold, onRefresh]);

  return { pullDistance, isPulling, isRefreshing };
}