import { createContext, useContext, useState, useCallback } from 'react';
import axios from 'axios';
import { getAccessToken } from '../supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;
const ProjectsContext = createContext();

export const ProjectsProvider = ({ children }) => {
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

  const addProject = (project) => {
    setProjects(prev => [project, ...prev]);
  };

  const removeProject = (id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const updateProject = (id, updates) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  return (
    <ProjectsContext.Provider value={{ projects, loaded, fetchProjects, addProject, removeProject, updateProject }}>
      {children}
    </ProjectsContext.Provider>
  );
};

export const useProjects = () => useContext(ProjectsContext);
