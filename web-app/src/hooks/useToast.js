import React, { useCallback, useRef, useState } from 'react';
import ToastStack from '../components/Toast';

/**
 * useToast — ephemeral top-right notifications.
 *
 * Usage:
 *   const { toast, ToastContainer } = useToast();
 *   ...
 *   toast.error('Erro ao exportar relatórios.');
 *   toast.success('Análise salva com sucesso.');
 *   toast.info({ title: 'Hmm', message: 'Nada pra mostrar.' });
 *
 *   return (
 *     <>
 *       ...
 *       <ToastContainer />
 *     </>
 *   );
 *
 * Each toast auto-dismisses after 4 seconds (override per-call with
 * the `duration` option). A single hook instance maintains its own
 * queue — pages that need toasts should instantiate the hook once at
 * the top of the component and reuse the `toast` object everywhere.
 *
 * NOTE: this file is `.js` (not `.jsx`) per the project spec, so the
 * returned container uses React.createElement rather than JSX.
 */

const DEFAULT_DURATION_MS = 4000;
let idSeq = 0;

export function useToast() {
  const [toasts, setToasts] = useState([]);
  // Map<id, timeoutId> so we can cancel pending dismiss timers when a
  // user closes the toast manually.
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timersRef.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant, arg) => {
      // Normalize: push('error', 'msg') OR push('error', { title, message })
      const opts = typeof arg === 'string' ? { message: arg } : (arg || {});
      const id = ++idSeq;
      const toast = {
        id,
        variant,
        title: opts.title ?? null,
        message: opts.message ?? '',
        duration: opts.duration ?? DEFAULT_DURATION_MS,
      };
      setToasts((prev) => [...prev, toast]);

      if (toast.duration > 0) {
        const handle = setTimeout(() => dismiss(id), toast.duration);
        timersRef.current.set(id, handle);
      }
      return id;
    },
    [dismiss]
  );

  // Shortcut object that stays the same reference across renders.
  // Each method closes over the latest `push`/`dismiss` (which are
  // stable via useCallback), so callers can capture `toast` once
  // without getting stale closures.
  const toastRef = useRef(null);
  if (toastRef.current === null) {
    toastRef.current = {
      success: (arg) => push('success', arg),
      error: (arg) => push('error', arg),
      info: (arg) => push('info', arg),
      dismiss: (id) => dismiss(id),
    };
  } else {
    toastRef.current.success = (arg) => push('success', arg);
    toastRef.current.error = (arg) => push('error', arg);
    toastRef.current.info = (arg) => push('info', arg);
    toastRef.current.dismiss = (id) => dismiss(id);
  }

  const ToastContainer = useCallback(
    () => React.createElement(ToastStack, { toasts, onDismiss: dismiss }),
    [toasts, dismiss]
  );

  return { toast: toastRef.current, ToastContainer };
}

export default useToast;
