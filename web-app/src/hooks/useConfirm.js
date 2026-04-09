import React, { useCallback, useRef, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';

/**
 * useConfirm — promise-based replacement for window.confirm/alert.
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   ...
 *   const ok = await confirm({
 *     title: 'Excluir projeto?',
 *     message: 'Essa ação não pode ser desfeita.',
 *     confirmText: 'Excluir',
 *     confirmColor: 'red',
 *   });
 *   if (!ok) return;
 *
 *   // Alert-style (single button, returns true when user clicks OK):
 *   await confirm({
 *     title: 'Erro',
 *     message: 'Falha ao exportar.',
 *     variant: 'alert',
 *     confirmText: 'OK',
 *     confirmColor: 'blue',
 *   });
 *
 * IMPORTANT: the caller MUST render <ConfirmDialog /> once inside the
 * component's JSX tree — without it, the hook has no DOM to mount to
 * and calls to confirm() will hang forever waiting for a click.
 *
 * NOTE: this file is intentionally `.js` (not `.jsx`) per the project
 * spec. Vite 8 / rolldown does not parse `.js` as JSX, so we build
 * the dialog element via React.createElement instead of JSX syntax.
 */
export function useConfirm() {
  const [state, setState] = useState({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    confirmColor: 'red',
    hideCancel: false,
  });

  // Resolver for the current in-flight confirm() promise. Stored in a
  // ref so updating the modal state doesn't rebuild the resolver and
  // accidentally drop a pending click.
  const resolverRef = useRef(null);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        title: opts.title ?? 'Tem certeza?',
        message: opts.message ?? '',
        confirmText: opts.confirmText ?? 'Confirmar',
        cancelText: opts.cancelText ?? 'Cancelar',
        confirmColor: opts.confirmColor ?? 'red',
        // variant: 'alert' → single-button mode (OK only)
        hideCancel: opts.variant === 'alert' || opts.hideCancel === true,
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  }, []);

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
  }, []);

  // Stable element so the host component can drop it into its tree
  // once and forget about it. Built with createElement because this
  // file is `.js`, not `.jsx`.
  const ConfirmDialog = useCallback(
    () =>
      React.createElement(ConfirmModal, {
        isOpen: state.open,
        onClose: handleClose,
        onConfirm: handleConfirm,
        title: state.title,
        message: state.message,
        confirmText: state.confirmText,
        cancelText: state.cancelText,
        confirmColor: state.confirmColor,
        hideCancel: state.hideCancel,
      }),
    [state, handleClose, handleConfirm]
  );

  return { confirm, ConfirmDialog };
}

export default useConfirm;
