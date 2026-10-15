// src/components/ConfirmModal.tsx
import { useEffect } from "react";
import { createPortal } from "react-dom";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
};

type Props = {
  open: boolean;
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({ open, options, onConfirm, onCancel }: Props) {
  // ESC ile iptal
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel, onConfirm]);

  // Body scroll kilidi
  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const {
    title,
    message,
    confirmText = "Onayla",
    cancelText = "Vazgeç",
    variant = "default",
  } = options;

  const confirmBtnClass =
    variant === "destructive"
      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      : "bg-primary text-primary-foreground hover:bg-primary/90";

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onCancel}
      style={{ touchAction: "none" }}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: "auto" }}
      >
        {/* İÇERİK */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="text-center sm:text-left">
            <h2 className="text-lg font-bold">{title}</h2>
            {message && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {message}
              </p>
            )}
          </div>
        </div>

        {/* BUTONLAR */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-secondary/30 p-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] w-full rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-secondary sm:w-auto"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[44px] w-full rounded-md px-4 py-2 text-sm font-bold ${confirmBtnClass} sm:w-auto`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}