import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, X } from 'lucide-react';

/**
 * ConfirmModal — replacement for window.confirm() / window.alert().
 *
 * Matches the rest of ViralHub's modal language (see Analyzer.jsx's
 * delete-confirm dialog): dark card, subtle borders, fade+scale
 * entrance via Framer Motion, ESC + overlay-click to dismiss.
 *
 * Colors pinned to the CLAUDE.md spec:
 *   • overlay      : rgba(0,0,0,0.6)
 *   • card bg      : #1A1A1A
 *   • card border  : #2A2A2A (1px, radius 12px)
 *   • title        : white
 *   • message      : #A0A0A0
 *   • cancel btn   : ghost, border #333
 *   • action btn   : red (#E2272F) for destructive, blue for neutral
 *
 * Single-button mode (for alert() replacements) is enabled by
 * setting `hideCancel` to true.
 */

const COLOR_STYLES = {
  red: {
    bg: '#E2272F',
    hover: '#c5212a',
    glow: '0 0 24px rgba(226, 39, 47, 0.35)',
    iconBg: 'rgba(226, 39, 47, 0.10)',
    iconBorder: 'rgba(226, 39, 47, 0.25)',
    iconColor: '#ff6b72',
  },
  blue: {
    bg: '#2F6FEB',
    hover: '#2459c7',
    glow: '0 0 24px rgba(47, 111, 235, 0.35)',
    iconBg: 'rgba(47, 111, 235, 0.10)',
    iconBorder: 'rgba(47, 111, 235, 0.25)',
    iconColor: '#6b9bff',
  },
  green: {
    bg: '#37B24D',
    hover: '#2f9c42',
    glow: '0 0 24px rgba(55, 178, 77, 0.35)',
    iconBg: 'rgba(55, 178, 77, 0.10)',
    iconBorder: 'rgba(55, 178, 77, 0.25)',
    iconColor: '#7fdc91',
  },
};

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Tem certeza?',
  message = '',
  confirmText = 'Confirmar',
  confirmColor = 'red',
  cancelText = 'Cancelar',
  hideCancel = false,
}) => {
  // ESC closes the modal. We don't fight with other ESC listeners on
  // the page because this one is mounted-while-open only, and since
  // it's the top-most element (z-[120]) it's fine for it to run in
  // addition to any page-level handlers — pages already guard against
  // double-close (e.g. Analyzer.jsx prioritizes its own modal state).
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const palette = COLOR_STYLES[confirmColor] || COLOR_STYLES.red;
  const Icon = confirmColor === 'red' ? AlertTriangle : Info;

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="confirm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-6 backdrop-blur-md"
          style={{ background: 'rgba(0, 0, 0, 0.60)' }}
          onClick={onClose}
        >
          <motion.div
            key="confirm-card"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.65)]"
            style={{
              background: '#1A1A1A',
              border: '1px solid #2A2A2A',
              borderRadius: '12px',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
          >
            <div className="p-7">
              <div className="flex items-start gap-4">
                <div
                  className="shrink-0 p-3 rounded-2xl"
                  style={{
                    background: palette.iconBg,
                    border: `1px solid ${palette.iconBorder}`,
                  }}
                >
                  <Icon size={22} strokeWidth={2} style={{ color: palette.iconColor }} />
                </div>
                <div className="flex-1 pt-1 min-w-0">
                  <h3
                    id="confirm-modal-title"
                    className="text-[17px] font-extrabold text-white tracking-tight leading-tight"
                  >
                    {title}
                  </h3>
                  {message && (
                    <p
                      className="text-[13px] mt-2 leading-relaxed whitespace-pre-line"
                      style={{ color: '#A0A0A0' }}
                    >
                      {message}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 -mr-2 -mt-2 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                  aria-label="Fechar"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 mt-7">
                {!hideCancel && (
                  <button
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-full text-[13px] font-bold text-gray-300 hover:text-white transition-colors"
                    style={{
                      border: '1px solid #333',
                      background: 'transparent',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#555')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#333')}
                  >
                    {cancelText}
                  </button>
                )}
                <button
                  onClick={onConfirm}
                  className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white transition-all duration-200"
                  style={{
                    background: palette.bg,
                    boxShadow: palette.glow,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = palette.hover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = palette.bg)}
                  autoFocus
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Portal to <body> so the modal escapes any ancestor overflow/stacking
  // context. Renders nothing during SSR (document check is for safety
  // even though this is a Vite client-only app).
  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
};

export default ConfirmModal;
