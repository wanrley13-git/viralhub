import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';

/**
 * Check whether the current user is allowed to access `module`
 * in the active workspace.
 *
 * Returns `true` when:
 *   - No workspace loaded yet (avoid flash of denied screen)
 *   - Personal workspace (always full access)
 *   - my_permissions is null (owner — full access)
 *   - Permission for the module is not explicitly `false`
 */
export function useModuleAllowed(module) {
  const { activeWorkspace } = useWorkspace();

  return useMemo(() => {
    if (!activeWorkspace) return true;
    if (activeWorkspace.is_personal) return true;
    if (!activeWorkspace.my_permissions) return true;
    return activeWorkspace.my_permissions[module] !== false;
  }, [activeWorkspace, module]);
}

/**
 * Denied screen shown when the user lacks permission for a module.
 */
const DeniedScreen = () => (
  <div className="flex items-center justify-center h-full min-h-screen">
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="text-center space-y-5 px-6"
    >
      <div className="mx-auto w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
        <Lock size={28} strokeWidth={1.5} className="text-gray-500" />
      </div>
      <div className="space-y-2">
        <h2 className="text-[17px] font-extrabold text-white tracking-tight">
          Acesso restrito
        </h2>
        <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs mx-auto">
          Você não tem acesso a este módulo neste workspace.
          Peça ao administrador para liberar.
        </p>
      </div>
    </motion.div>
  </div>
);

/**
 * Gate component — renders children only if the user has access to `module`.
 * Otherwise shows the denied screen.
 *
 * Also listens for runtime 403 events dispatched by the axios interceptor
 * (covers edge-case where permissions change while the user is on the page).
 */
const PermissionGate = ({ module, children }) => {
  const allowed = useModuleAllowed(module);
  const { activeWorkspace } = useWorkspace();
  const [apiForbidden, setApiForbidden] = useState(false);

  // Listen for runtime 403 errors from the axios interceptor
  useEffect(() => {
    const handler = () => setApiForbidden(true);
    window.addEventListener('api-permission-denied', handler);
    return () => window.removeEventListener('api-permission-denied', handler);
  }, []);

  // Reset the runtime flag when workspace or module changes
  useEffect(() => {
    setApiForbidden(false);
  }, [module, activeWorkspace?.id]);

  if (!allowed || apiForbidden) {
    return <DeniedScreen />;
  }

  return children;
};

export default PermissionGate;
