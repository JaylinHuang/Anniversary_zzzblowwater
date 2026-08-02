"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "ok" | "err" | "info";

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ConfirmState = {
  title: string;
  message: string;
  resolve: (ok: boolean) => void;
} | null;

type ToastApi = {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  confirm: (opts: { title?: string; message: string }) => Promise<boolean>;
};

const ToastContext = createContext<ToastApi | null>(null);

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = ++toastSeq;
      setItems((prev) => [...prev.slice(-4), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), 3200);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (m) => toast(m, "ok"),
      error: (m) => toast(m, "err"),
      confirm: ({ title = "请确认", message }) =>
        new Promise<boolean>((resolve) => {
          setConfirmState({ title, message, resolve });
        }),
    }),
    [toast],
  );

  function closeConfirm(ok: boolean) {
    confirmState?.resolve(ok);
    setConfirmState(null);
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md anim-rise ${
              t.kind === "ok"
                ? "border-[rgba(61,224,208,0.45)] bg-[color-mix(in_srgb,var(--bg-panel)_92%,transparent)] text-[var(--cyan)]"
                : t.kind === "err"
                  ? "border-[rgba(255,107,122,0.45)] bg-[color-mix(in_srgb,var(--bg-panel)_92%,transparent)] text-[var(--danger)]"
                  : "border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-panel)_92%,transparent)] text-[var(--ink)]"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {confirmState ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4">
          <div
            className="panel w-full max-w-sm rounded-2xl p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h3
              id="confirm-title"
              className="brand-font text-xl text-[var(--amber)]"
            >
              {confirmState.title}
            </h3>
            <p className="mt-3 text-sm text-[var(--fog)]">
              {confirmState.message}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => closeConfirm(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-amber"
                onClick={() => closeConfirm(true)}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast 须在 ToastProvider 内使用");
  }
  return ctx;
}
