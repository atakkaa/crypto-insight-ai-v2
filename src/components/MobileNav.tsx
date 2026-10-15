// src/components/MobileNav.tsx
import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { NotificationBell } from "@/components/NotificationBell";
import { ShortTermNotificationBell } from "@/components/ShortTermNotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useUserTier } from "@/hooks/useUserTier";

export function MobileNav({
  onOpenSymbol,
}: {
  onOpenSymbol: (market: string, symbol: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const { tierInfo } = useUserTier();

  const isPremium =
    tierInfo?.tier === "admin" ||
    tierInfo?.tier === "premium" ||
    tierInfo?.tier === "trial";

  return (
    <>
      {/* ========================================================== */}
      {/* ÜST HEADER (MOBİL) */}
      {/* ========================================================== */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div
          className="flex items-center justify-between gap-2 px-3 py-2"
          style={{
            paddingTop: "max(0.5rem, env(safe-area-inset-top))",
          }}
        >
          {/* HAMBURGER BUTONU */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-base hover:bg-secondary"
            aria-label="Menüyü aç"
          >
            ☰
          </button>

          {/* LOGO */}
          <Link
            to="/"
            className="num text-sm font-bold uppercase tracking-[0.2em] text-primary"
          >
            AE Analiz
          </Link>

          {/* SAĞ TARAF: BİLDİRİM + PROFİL */}
          <div className="flex items-center gap-1.5">
            <NotificationBell onOpenSymbol={onOpenSymbol} />
            <ShortTermNotificationBell onOpenSymbol={onOpenSymbol} />

            {user ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-xs hover:bg-secondary"
                title={user.email ?? ""}
              >
                👤
              </button>
            ) : (
              <Link
                to="/auth"
                className="rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-bold text-primary-foreground"
              >
                Giriş
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================== */}
      {/* HAMBURGER MENÜ (AÇILINCA) */}
      {/* ========================================================== */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[100] flex"
          onClick={() => setMenuOpen(false)}
        >
          {/* ARKA PLAN KARARTMA */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* MENÜ PANELİ */}
          <div
            className="relative z-10 h-full w-72 max-w-[85vw] overflow-y-auto border-r border-border bg-background"
            onClick={(e) => e.stopPropagation()}
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {/* MENÜ BAŞLIĞI */}
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-4 py-3">
              <span className="num text-sm font-bold uppercase tracking-[0.2em] text-primary">
                AE Analiz
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm hover:bg-secondary"
                aria-label="Menüyü kapat"
              >
                ✕
              </button>
            </div>

            {/* KULLANICI BİLGİSİ */}
            {user && (
              <div className="border-b border-border px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Giriş yapıldı
                </p>
                <p className="mt-0.5 truncate text-xs font-semibold">
                  {user.email}
                </p>
                {tierInfo && (
                  <p className="mt-1 inline-block rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {tierInfo.emoji} {tierInfo.label}
                  </p>
                )}
              </div>
            )}

            {/* MENÜ LİNKLERİ */}
            <nav className="space-y-1 p-3">
              <MenuLink
                to="/"
                emoji="📈"
                label="Grafik"
                onClick={() => setMenuOpen(false)}
              />
              <MenuLink
                to="/coins"
                emoji="📋"
                label="Liste"
                onClick={() => setMenuOpen(false)}
              />
              <MenuLink
                to="/market-summary"
                emoji="📊"
                label="Piyasa Özeti"
                onClick={() => setMenuOpen(false)}
              />

              {/* PREMIUM LİNK */}
              {isPremium && (
                <MenuLink
                  to="/stats"
                  emoji="📊"
                  label="İstatistikler"
                  onClick={() => setMenuOpen(false)}
                />
              )}

              <MenuLink
                to="/alarms"
                emoji="🔔"
                label="Alarmlar"
                onClick={() => setMenuOpen(false)}
              />
              <MenuLink
                to="/short-term-notifications"
                emoji="📉"
                label="Kısa Vadeli"
                onClick={() => setMenuOpen(false)}
              />
              <MenuLink
                to="/settings"
                emoji="⚙️"
                label="Ayarlar"
                onClick={() => setMenuOpen(false)}
              />

              {/* 👑 ADMIN — SADECE ADMIN GÖRÜR */}
              {isAdmin && (
                <>
                  <div className="my-2 border-t border-border" />
                  <MenuLink
                    to="/admin"
                    emoji="👑"
                    label="Admin Paneli"
                    onClick={() => setMenuOpen(false)}
                  />
                  <MenuLink
                    to="/backtest"
                    emoji="🧪"
                    label="Backtest"
                    onClick={() => setMenuOpen(false)}
                  />
                </>
              )}

              {/* ÇIKIŞ */}
              {user && (
                <>
                  <div className="my-2 border-t border-border" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void signOut();
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold text-destructive hover:bg-destructive/10"
                  >
                    <span className="text-base">🚪</span>
                    <span>Çıkış Yap</span>
                  </button>
                </>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* ALT TAB BAR (MOBİL) — SAFE AREA DESTEKLİ */}
      {/* ========================================================== */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="grid grid-cols-5">
          <TabLink to="/" emoji="📈" label="Grafik" />
          <TabLink to="/market-summary" emoji="📊" label="Özet" />
          <TabLink to="/alarms" emoji="🔔" label="Alarm" />
          <TabLink to="/short-term-notifications" emoji="📉" label="Kısa" />
          <TabLink to="/settings" emoji="⚙️" label="Ayar" />
        </div>
      </nav>
    </>
  );
}

// ==========================================================
// MENÜ LİNK BİLEŞENİ
// ==========================================================

function MenuLink({
  to,
  emoji,
  label,
  onClick,
}: {
  to: string;
  emoji: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold hover:bg-secondary"
    >
      <span className="text-base">{emoji}</span>
      <span>{label}</span>
    </Link>
  );
}

// ==========================================================
// ALT TAB LİNK BİLEŞENİ
// ==========================================================

function TabLink({
  to,
  emoji,
  label,
}: {
  to: string;
  emoji: string;
  label: string;
}) {
  return (
    <Link
      to={to}
      activeProps={{ className: "text-primary" }}
      className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold text-muted-foreground hover:bg-secondary"
    >
      <span className="text-lg">{emoji}</span>
      <span>{label}</span>
    </Link>
  );
}