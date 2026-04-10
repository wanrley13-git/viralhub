import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getAccessToken } from '../supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;
const LS_KEY = 'activeWorkspaceId';

const WorkspaceContext = createContext();

export const WorkspaceProvider = ({ children }) => {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceIdRaw] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const n = parseInt(saved, 10);
        return Number.isFinite(n) ? n : null;
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(true);

  // Persist to localStorage
  const setActiveWorkspaceId = useCallback((id) => {
    setActiveWorkspaceIdRaw(id);
    try {
      if (id != null) localStorage.setItem(LS_KEY, String(id));
      else localStorage.removeItem(LS_KEY);
    } catch {}
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await axios.get(`${API_URL}/workspaces/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = res.data || [];
      setWorkspaces(list);

      // Auto-select personal workspace if nothing is active or active no longer valid
      if (list.length > 0) {
        setActiveWorkspaceIdRaw((prev) => {
          const valid = list.find((w) => w.id === prev);
          if (valid) return prev;
          const personal = list.find((w) => w.is_personal);
          const fallback = personal ? personal.id : list[0].id;
          try { localStorage.setItem(LS_KEY, String(fallback)); } catch {}
          return fallback;
        });
      }
    } catch (err) {
      console.error('Erro buscando workspaces:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) || null,
    [workspaces, activeWorkspaceId],
  );

  const value = useMemo(
    () => ({
      workspaces,
      activeWorkspaceId,
      setActiveWorkspaceId,
      activeWorkspace,
      fetchWorkspaces,
      loading,
    }),
    [workspaces, activeWorkspaceId, setActiveWorkspaceId, activeWorkspace, fetchWorkspaces, loading],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => useContext(WorkspaceContext);
