import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Analyzer from './pages/Analyzer';
import Creator from './pages/Creator';
import Kanban from './pages/Kanban';
import Transcriber from './pages/Transcriber';
import Notes from './pages/Notes';
import Settings from './pages/Settings';
import { SidebarProvider } from './contexts/SidebarContext';
import { ProjectsProvider } from './contexts/ProjectsContext';
import { NotesProvider } from './contexts/NotesContext';
import { supabase } from './supabaseClient';

const PageTransition = ({ children }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
);

const ProtectedRoute = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-h-screen">
        <PageTransition>{children}</PageTransition>
      </div>
    </div>
  );
};

function App() {
  return (
    <SidebarProvider>
      <ProjectsProvider>
      <NotesProvider>
      <Router>
        <Routes>
          {/* Rotas Públicas */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Rotas Protegidas */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Analyzer />
              </ProtectedRoute>
            }
          />

          <Route
            path="/transcriber"
            element={
              <ProtectedRoute>
                <Transcriber />
              </ProtectedRoute>
            }
          />

          <Route
            path="/creator"
            element={
              <ProtectedRoute>
                <Creator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notes"
            element={
              <ProtectedRoute>
                <Notes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kanban"
            element={
              <ProtectedRoute>
                <Kanban />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kanban/:projectId"
            element={
              <ProtectedRoute>
                <Kanban />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      </NotesProvider>
      </ProjectsProvider>
    </SidebarProvider>
  );
}

export default App;
