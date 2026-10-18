"use client";
import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Inbox, Moon, Sun, X } from "lucide-react";
function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}
export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  return (
    <button
      className="iconbtn"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const value = !dark;
        document.documentElement.classList.toggle("dark", value);
        localStorage.setItem("examguard-theme", value ? "dark" : "light");
      }}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
const ToastContext = createContext<(message: string, error?: boolean) => void>(
  () => {},
);
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string, error = false) => {
    setToast({ message, error });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          className="toast row"
          data-error={toast.error}
          role={toast.error ? "alert" : "status"}
        >
          {toast.message}
          <button
            className="iconbtn"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export function Empty({
  title = "Nothing here yet",
  description = "New activity will appear here.",
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children && <div style={{ marginTop: 18 }}>{children}</div>}
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  const green = [
    "PUBLISHED",
    "ACTIVE",
    "GRADED",
    "PASSED",
    "RELEASED",
  ].includes(status);
  const amber = ["DRAFT", "SUBMITTED", "AUTO_SUBMITTED", "PENDING"].includes(
    status,
  );
  return (
    <span
      className={`badge ${green ? "green" : amber ? "amber" : status === "IN_PROGRESS" ? "blue" : ""}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
export function Confirm({
  open,
  title,
  message,
  onConfirm,
  onClose,
  confirmLabel = "Confirm",
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
  confirmLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      aria-labelledby="confirm-title"
    >
      <h2 id="confirm-title">{title}</h2>
      <p>{message}</p>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
export async function api<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers:
      method === "GET" ? undefined : { "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Unable to complete your request.");
  return result;
}
export function useResource<T>(path: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({ path: "", data: null, error: "", loading: true });
  const reload = useCallback(() => {
    setResult((r) => ({ ...r, loading: true }));
    setRevision((v) => v + 1);
  }, []);
  useEffect(() => {
    let active = true;
    api<T>(path)
      .then((data) => {
        if (active) setResult({ path, data, error: "", loading: false });
      })
      .catch((e) => {
        if (active)
          setResult({
            path,
            data: null,
            error: e instanceof Error ? e.message : "Request failed",
            loading: false,
          });
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return {
    data: result.path === path ? result.data : null,
    error: result.path === path ? result.error : "",
    loading: result.path !== path || result.loading,
    reload,
  };
}
export function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading">
      <div className="skeleton" />
      <div className="grid2">
        <div className="skeleton" style={{ height: 220 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    </div>
  );
}
export function Failure({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="card" role="alert">
      <h2>We couldn’t load this page</h2>
      <p className="muted" style={{ margin: "10px 0 20px" }}>
        {message}
      </p>
      {retry && (
        <button className="btn" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function date(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
) {
  return value
    ? new Date(value).toLocaleString(
        undefined,
        options || { month: "short", day: "numeric", year: "numeric" },
      )
    : "—";
}
