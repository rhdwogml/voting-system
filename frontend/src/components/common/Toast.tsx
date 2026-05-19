import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import styles from './Toast.module.css';

export type ToastType = 'success' | 'error' | 'loading';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string, durationMs?: number) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, durationMs = 3500): string => {
      const id = `toast-${++counter}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      if (type !== 'loading') {
        setTimeout(() => dismissToast(id), durationMs);
      }
      return id;
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastList({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${styles.toast} ${styles[t.type]}`}
          onClick={() => onDismiss(t.id)}
          role="alert"
        >
          {t.type === 'loading' ? (
            <span className={styles.spinner} />
          ) : (
            <span className={styles.icon}>
              {t.type === 'success' ? '✓' : '✕'}
            </span>
          )}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}
