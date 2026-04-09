import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import { SidebarProvider } from './contexts/SidebarContext';
import { ProjectsProvider } from './contexts/ProjectsContext';
import { NotesProvider } from './contexts/NotesContext';
import { supabase } from './supabaseClient';

// Route-level code splitting. Each of these pages is large (500-1700 LOC)
// and pulls in heavy dependencies (marked, turndown, react-dropzone, etc).
// Loading them on demand keeps the initial bundle small and makes tab
// switches feel instant after first visit (the chunks get cached).
const Analyzer = lazy(() => import('./pages/Analyzer'));
const ContentGenerator = lazy(() => import('./pages/ContentGenerator'));
const IdeaGenerator = lazy(() => import('./pages/IdeaGenerator'));
const Kanban = lazy(() => import('./pages/Kanban'));
const Transcriber = lazy(() => import('./pages/Transcriber'));
const Notes = lazy(() => import('./pages/Notes'));
const Settings = lazy(() => import('./pages/Settings'));

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

// Lightweight fallback rendered inside the main content area while a
// lazy page chunk is downloading. Avoids a full-screen spinner so the
// sidebar stays visible and responsive.
const RouteLoader = () => (
  <div className="flex items-center justify-center h-full min-h-screen">
    <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-primary animate-spin" />
  </div>
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
        <PageTransition>
          <Suspense fallback={<RouteLoader />}>{children}</Suspense>
        </PageTransition>
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
                <ContentGenerator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ideas"
            element={
              <ProtectedRoute>
                <IdeaGenerator />
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
