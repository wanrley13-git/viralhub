import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

/**
 * Toast — top-right ephemeral notification, auto-dismiss.
 *
 * Visual language follows CLAUDE.md:
 *   • background : #1A1A1A
 *   • border     : subtle dark border (#2A2A2A)
 *   • left rail  : colored stripe (success=green, error=red, info=blue)
 *   • fades in from the right, floats for ~4s, fades out
 *
 * This component only renders the visual stack; scheduling /
 * auto-removal is owned by useToast so a single portal mount is all
 * the host page needs.
 */

const VARIANT_STYLES = {
  success: {
    accent: '#37B24D',
    glow: '0 0 28px rgba(55, 178, 77, 0.25)',
    icon: CheckCircle2,
    iconColor: '#7fdc91',
  },
  error: {
    accent: '#E2272F',
    glow: '0 0 28px rgba(226, 39, 47, 0.25)',
    icon: AlertCircle,
    iconColor: '#ff6b72',
  },
  info: {
    accent: '#2F6FEB',
    glow: '0 0 28px rgba(47, 111, 235, 0.25)',
    icon: Info,
    iconColor: '#6b9bff',
  },
};

const ToastItem = ({ toast, onDismiss }) => {
  const variant = VARIANT_STYLES[toast.variant] || VARIANT_STYLES.info;
  const Icon = variant.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto flex items-start gap-3 pl-4 pr-3 py-3.5 min-w-[280px] max-w-[380px] relative overflow-hidden"
      style={{
        background: '#1A1A1A',
        border: '1px solid #2A2A2A',
        borderRadius: '12px',
        boxShadow: `0 20px 48px rgba(0,0,0,0.55), ${variant.glow}`,
      }}
      role="status"
      aria-live="polite"
    >
      {/* Colored left rail */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: variant.accent }}
      />

      <Icon
        size={17}
        strokeWidth={2.2}
        style={{ color: variant.iconColor }}
        className="shrink-0 mt-0.5 ml-1"
      />

      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-[13px] font-bold text-white leading-tight">{toast.title}</p>
        )}
        {toast.message && (
          <p
            className={`text-[12px] leading-snug ${toast.title ? 'mt-1' : ''}`}
            style={{ color: '#A0A0A0' }}
          >
            {toast.message}
          </p>
        )}
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
        aria-label="Fechar notificação"
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
};

const ToastStack = ({ toasts, onDismiss }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed top-6 right-6 z-[130] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
};

export default ToastStack;
