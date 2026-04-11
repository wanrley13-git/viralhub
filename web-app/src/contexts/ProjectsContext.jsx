import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { getAccessToken } from '../supabaseClient';
import { useWorkspace } from './WorkspaceContext';
import useRealtimeSync from '../hooks/useRealtimeSync';

const API_URL = import.meta.env.VITE_API_URL;
const ProjectsContext = createContext();

export const ProjectsProvider = ({ children }) => {
  const { activeWorkspaceId, activeWorkspace, currentUserId } = useWorkspace();
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await axios.get(`${API_URL}/projects/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(res.data);
      setLoaded(true);
    } catch (err) {
      console.error('Erro ao buscar projetos:', err);
    }
  }, []);

  const addProject = useCallback((project) => {
    setProjects(prev => [project, ...prev]);
  }, []);

  const removeProject = useCallback((id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const updateProject = useCallback((id, updates) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  // ── realtime sync (team workspaces) ──
  useRealtimeSync({
    table: 'projects',
    workspaceId: activeWorkspaceId,
    currentUserId,
    isPersonal: activeWorkspace?.is_personal ?? true,
    onInsert: (row) => setProjects((prev) => prev.some((p) => p.id === row.id) ? prev : [row, ...prev]),
    onUpdate: (row) => setProjects((prev) => prev.map((p) => (p.id === row.id ? { ...p, ...row } : p))),
    onDelete: (row) => setProjects((prev) => prev.filter((p) => p.id !== row.id)),
  });

  // Memoise so consumers re-render only when the fields they read change.
  const value = useMemo(
    () => ({ projects, loaded, fetchProjects, addProject, removeProject, updateProject }),
    [projects, loaded, fetchProjects, addProject, removeProject, updateProject]
  );

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
};

export const useProjects = () => useContext(ProjectsContext);
