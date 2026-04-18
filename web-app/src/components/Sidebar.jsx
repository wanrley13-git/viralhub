import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import {
  TrendingUp,
  Sparkles,
  Layout,
  LogOut,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Zap,
  Film,
  Clapperboard,
  FolderKanban,
  Plus,
  BookOpen,
  Lightbulb,
  User,
  Users,
  Check,
  X,
  Trash2,
  Mail,
  Shield,
  Loader2,
  ChevronLeft,
  Lock,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSidebar } from '../contexts/SidebarContext';
import { useProjects } from '../contexts/ProjectsContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { supabase, getAccessToken } from '../supabaseClient';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const API_URL = import.meta.env.VITE_API_URL;

const SIDEBAR_PROJECT_COLORS = [
  '#06b6d4', '#22c55e', '#8b5cf6',
  '#f59e0b', '#f43f5e', '#3b82f6',
];

const MAX_SIDEBAR_PROJECTS = 3;

const PERMISSION_LABELS = {
  analyses: 'Análises',
  transcriptions: 'Transcrições',
  cinema: 'Cinema',
  content: 'Conteúdo',
  ideas: 'Ideias',
  kanban: 'Kanban',
  notes: 'Notas',
  calendar: 'Calendário',
  knowledge: 'Bases',
  tones: 'Tons',
};

// ────────────────────── Workspace Management Panel ──────────────────────
const WorkspaceManagePanel = ({ workspaceId, onClose }) => {
  const { fetchWorkspaces } = useWorkspace();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState(null);
  const [wsName, setWsName] = useState('');
  const [editingName, setEditingName] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/workspaces/${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDetail(res.data);
      setWsName(res.data.name);
    } catch {
      setError('Erro ao carregar workspace.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const saveName = async () => {
    if (!wsName.trim() || wsName === detail?.name) { setEditingName(false); return; }
    try {
      const token = await getAccessToken();
      await axios.patch(`${API_URL}/workspaces/${workspaceId}`, { name: wsName.trim() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDetail((d) => ({ ...d, name: wsName.trim() }));
      fetchWorkspaces();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao renomear.');
    }
    setEditingName(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      await axios.post(`${API_URL}/workspaces/${workspaceId}/invite`, { email: inviteEmail.trim() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInviteEmail('');
      fetchDetail();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao convidar.');
    } finally {
      setInviting(false);
    }
  };

  const removeMember = async (userId) => {
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/workspaces/${workspaceId}/members/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchDetail();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao remover membro.');
    }
  };

  const togglePerm = async (userId, key, current) => {
    const member = detail?.members?.find((m) => m.user_id === userId);
    if (!member) return;
    let perms = {};
    try { perms = JSON.parse(member.permissions || '{}'); } catch {}
    perms[key] = !current;
    try {
      const token = await getAccessToken();
      await axios.patch(`${API_URL}/workspaces/${workspaceId}/members/${userId}`, { permissions: perms }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchDetail();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao atualizar permissões.');
    }
  };

  const deleteWorkspace = async () => {
    if (!window.confirm('Tem certeza que deseja deletar este workspace? Os dados (análises, etc.) NÃO serão deletados.')) return;
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/workspaces/${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchWorkspaces();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao deletar workspace.');
    }
  };

  const isOwner = detail?.members?.find((m) => m.role === 'owner');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-white/[0.06]">
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all">
          <ChevronLeft size={16} />
        </button>
        <span className="text-[14px] font-bold text-white truncate flex-1">Gerenciar Workspace</span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-7 py-6 space-y-7">
        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2 flex items-center gap-2"
            >
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)}><X size={12} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Name */}
        <div>
          <p className="data-label mb-2">Nome</p>
          {editingName ? (
            <div className="flex gap-1.5">
              <input
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setWsName(detail?.name || ''); } }}
                autoFocus
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white outline-none focus:border-primary/30"
              />
              <button onClick={saveName} className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"><Check size={14} /></button>
              <button onClick={() => { setEditingName(false); setWsName(detail?.name || ''); }} className="p-2 rounded-xl bg-white/[0.04] text-gray-500 hover:text-white transition-colors"><X size={14} /></button>
            </div>
          ) : (
            <button
              onClick={() => isOwner && setEditingName(true)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[13px] text-white",
                isOwner ? "hover:border-white/[0.12] cursor-pointer" : "cursor-default"
              )}
            >
              {detail?.name}
            </button>
          )}
        </div>

        {/* Invite */}
        {isOwner && (
          <div>
            <p className="data-label mb-2">Convidar membro</p>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
                  placeholder="email@exemplo.com"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-[13px] text-white placeholder-gray-600 outline-none focus:border-primary/30"
                />
              </div>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-[12px] font-bold hover:bg-primary/20 transition-colors disabled:opacity-40"
              >
                {inviting ? <Loader2 size={14} className="animate-spin" /> : 'Convidar'}
              </button>
            </div>
          </div>
        )}

        {/* Members */}
        <div>
          <p className="data-label mb-2">Membros ({detail?.members?.length || 0})</p>
          <div className="space-y-2">
            {detail?.members?.map((m) => {
              let perms = {};
              try { perms = JSON.parse(m.permissions || '{}'); } catch {}
              return (
                <div key={m.id} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                      m.role === 'owner' ? "bg-primary/15 text-primary" : "bg-white/[0.06] text-gray-500"
                    )}>
                      {m.role === 'owner' ? <Shield size={13} /> : <User size={13} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-white font-semibold truncate">{m.email || `User #${m.user_id}`}</p>
                      <p className="text-[10px] text-gray-600 font-medium uppercase tracking-wider">{m.role}</p>
                    </div>
                    {isOwner && m.role !== 'owner' && (
                      <button
                        onClick={() => removeMember(m.user_id)}
                        className="p-1.5 rounded-lg text-red-400/40 hover:text-red-400 hover:bg-red-400/10 transition-all"
                        title="Remover membro"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {/* Permission toggles — only for non-owner members, only if viewer is owner */}
                  {isOwner && m.role !== 'owner' && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                        const on = perms[key] !== false;
                        return (
                          <button
                            key={key}
                            onClick={() => togglePerm(m.user_id, key, on)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-150 border whitespace-nowrap",
                              on
                                ? "bg-primary/10 border-primary/20 text-primary"
                                : "bg-white/[0.02] border-white/[0.05] text-gray-600"
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Delete workspace */}
        {isOwner && !detail?.is_personal && (
          <button
            onClick={deleteWorkspace}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/5 border border-red-500/10 text-red-400/60 hover:text-red-400 hover:border-red-500/20 text-[12px] font-bold transition-all"
          >
            <Trash2 size={13} />
            Deletar workspace
          </button>
        )}
      </div>
    </div>
  );
};

// ────────────────────────── Main Sidebar ────────────────────────────
const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed, toggle } = useSidebar();
  const { projects, fetchProjects, addProject: addProjectToCtx } = useProjects();
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, activeWorkspace, fetchWorkspaces } = useWorkspace();

  const isHubActive = location.pathname === '/' || location.pathname === '/transcriber';
  const isKanbanActive = location.pathname.startsWith('/kanban');
  const isGeneratorActive = location.pathname === '/creator' || location.pathname === '/ideas';

  const [hubOpen, setHubOpen] = useState(isHubActive);
  const [kanbanOpen, setKanbanOpen] = useState(isKanbanActive);
  const [generatorOpen, setGeneratorOpen] = useState(isGeneratorActive);

  // Workspace switcher
  const [wsSwitcherOpen, setWsSwitcherOpen] = useState(false);
  const [wsManageId, setWsManageId] = useState(null); // non-null → show manage panel
  const [wsCreating, setWsCreating] = useState(false);
  const [wsNewName, setWsNewName] = useState('');
  const switcherRef = useRef(null);

  // Auto-collapse submenus based on current route
  useEffect(() => {
    setHubOpen(isHubActive);
    setKanbanOpen(isKanbanActive);
    setGeneratorOpen(isGeneratorActive);
  }, [location.pathname]);

  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (isKanbanActive) fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKanbanActive, activeWorkspaceId]);

  // Close switcher on outside click
  useEffect(() => {
    const handler = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setWsSwitcherOpen(false);
      }
    };
    if (wsSwitcherOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [wsSwitcherOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleCreateWorkspace = async () => {
    const name = wsNewName.trim() || 'Novo Workspace';
    try {
      const token = await getAccessToken();
      const res = await axios.post(`${API_URL}/workspaces/`, { name }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchWorkspaces();
      setActiveWorkspaceId(res.data.id);
      setWsCreating(false);
      setWsNewName('');
    } catch (err) {
      console.error('Erro criando workspace:', err);
    }
  };

  // Permission helper — returns true when the module is accessible
  const isModuleAllowed = (module) => {
    if (!activeWorkspace) return true;
    if (activeWorkspace.is_personal) return true;
    if (!activeWorkspace.my_permissions) return true; // owner
    return activeWorkspace.my_permissions[module] !== false;
  };

  const hubSubItems = [
    { icon: Zap, label: 'Vídeos curtos', path: '/', module: 'analyses' },
    { icon: Film, label: 'Vídeos longos', path: '/transcriber', module: 'transcriptions' },
    { icon: Clapperboard, label: 'Cinema', path: '/cinema', module: 'cinema' },
  ];

  const generatorSubItems = [
    { icon: Sparkles,  label: 'Conteúdos', path: '/creator', module: 'content' },
    { icon: Lightbulb, label: 'Ideias',    path: '/ideas',   module: 'ideas'   },
  ];

  const menuItems = [
    { icon: BookOpen, label: 'Notas', path: '/notes', module: 'notes' },
  ];

  const hubAllowed = hubSubItems.some((s) => isModuleAllowed(s.module));
  const generatorAllowed = generatorSubItems.some((s) => isModuleAllowed(s.module));
  const kanbanAllowed = isModuleAllowed('kanban');

  const handleCreateProject = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.post(`${API_URL}/projects/`, { name: 'Novo Projeto' }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      addProjectToCtx(res.data);
      navigate(`/kanban/${res.data.id}`);
    } catch (err) { console.error(err); }
  };

  // ─── Manage panel (drawer overlay — wider than sidebar) ───
  if (wsManageId && !collapsed) {
    return (
      <>
        {/* Backdrop — click to close */}
        <div
          className="fixed inset-0 bg-black/40 z-[55]"
          onClick={() => setWsManageId(null)}
        />
        <div
          className={cn(
            "h-screen bg-surface/95 backdrop-blur-2xl border-r border-border-subtle flex flex-col fixed left-0 top-0 z-[60] transition-all duration-300 ease-in-out w-[420px]"
          )}
        >
          <WorkspaceManagePanel
            workspaceId={wsManageId}
            onClose={() => setWsManageId(null)}
          />
        </div>
      </>
    );
  }

  return (
    <div
      className={cn(
        "h-screen bg-surface/80 backdrop-blur-xl border-r border-border-subtle flex flex-col fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Logo / Expand toggle */}
      <div className={cn("flex items-center", collapsed ? "p-4 justify-center" : "p-7 pb-6 justify-between")}>
        {collapsed ? (
          <button
            onClick={toggle}
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all border border-border-subtle"
            title="Expandir sidebar"
          >
            <PanelLeftOpen size={20} strokeWidth={1.5} />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 bg-primary/15 rounded-2xl flex items-center justify-center border border-primary/20 glow-primary shrink-0">
                <TrendingUp size={20} strokeWidth={1.5} className="text-primary" />
              </div>
              <h1 className="text-[17px] font-extrabold text-white tracking-tight leading-none">ViralHub</h1>
            </div>
            <button
              onClick={toggle}
              className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Retrair sidebar"
            >
              <PanelLeftClose size={18} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {/* Divider */}
      <div className={cn("h-px bg-gradient-to-r from-transparent via-white/6 to-transparent", collapsed ? "mx-3" : "mx-5")} />

      {/* ─── Workspace Switcher ─── */}
      {!collapsed && (
        <div className="px-4 pt-4 pb-1" ref={switcherRef}>
          <div className="relative">
            <button
              onClick={() => setWsSwitcherOpen((v) => !v)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                wsSwitcherOpen
                  ? "bg-white/[0.06] border border-white/[0.1]"
                  : "bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.08]"
              )}
            >
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                activeWorkspace?.is_personal
                  ? "bg-primary/15 text-primary"
                  : "bg-violet-500/15 text-violet-400"
              )}>
                {activeWorkspace?.is_personal ? <User size={13} strokeWidth={2} /> : <Users size={13} strokeWidth={2} />}
              </div>
              <span className="flex-1 text-[12px] font-bold text-white truncate text-left">
                {activeWorkspace?.name || 'Workspace'}
              </span>
              <ChevronDown size={13} className={cn(
                "text-gray-600 transition-transform duration-200 shrink-0",
                wsSwitcherOpen && "rotate-180"
              )} />
            </button>

            {/* Dropdown */}
            <AnimatePresence>
              {wsSwitcherOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className="absolute left-0 right-0 top-full mt-1.5 bg-[#141418] border border-white/[0.08] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                >
                  <div className="py-1 max-h-[240px] overflow-y-auto custom-scrollbar">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => {
                          setActiveWorkspaceId(ws.id);
                          setWsSwitcherOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors group/item",
                          ws.id === activeWorkspaceId
                            ? "bg-white/[0.05]"
                            : "hover:bg-white/[0.03]"
                        )}
                      >
                        <div className={cn(
                          "w-6 h-6 rounded-md flex items-center justify-center shrink-0",
                          ws.is_personal ? "bg-primary/12 text-primary" : "bg-violet-500/12 text-violet-400"
                        )}>
                          {ws.is_personal ? <User size={11} strokeWidth={2} /> : <Users size={11} strokeWidth={2} />}
                        </div>
                        <span className="flex-1 text-[12px] font-semibold text-gray-300 truncate">{ws.name}</span>
                        {ws.id === activeWorkspaceId && (
                          <Check size={13} className="text-primary shrink-0" />
                        )}
                        {!ws.is_personal && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setWsManageId(ws.id);
                              setWsSwitcherOpen(false);
                            }}
                            className="p-1 rounded-md text-gray-600 hover:text-white hover:bg-white/[0.06] opacity-0 group-hover/item:opacity-100 transition-all"
                            title="Gerenciar"
                          >
                            <Settings size={11} />
                          </button>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-white/[0.06]">
                    {wsCreating ? (
                      <div className="flex items-center gap-1.5 px-3 py-2">
                        <input
                          value={wsNewName}
                          onChange={(e) => setWsNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateWorkspace();
                            if (e.key === 'Escape') { setWsCreating(false); setWsNewName(''); }
                          }}
                          autoFocus
                          placeholder="Nome do workspace"
                          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder-gray-600 outline-none focus:border-primary/30"
                        />
                        <button onClick={handleCreateWorkspace} className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"><Check size={12} /></button>
                        <button onClick={() => { setWsCreating(false); setWsNewName(''); }} className="p-1.5 rounded-lg bg-white/[0.04] text-gray-500 hover:text-white transition-colors"><X size={12} /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setWsCreating(true)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-gray-500 hover:text-white hover:bg-white/[0.03] transition-colors"
                      >
                        <Plus size={13} strokeWidth={2} />
                        <span className="text-[12px] font-semibold">Novo workspace</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className={cn("flex-1 pt-4 overflow-y-auto overflow-x-hidden custom-scrollbar", collapsed ? "px-2" : "px-4")}>
        {!collapsed && <p className="data-label px-3 mb-4">Menu</p>}
        <nav className={cn("stagger-children", collapsed ? "space-y-2" : "space-y-1")}>
          {/* 1. Gerador com submenu */}
          {generatorAllowed && (
          <div>
            <button
              onClick={() => {
                if (collapsed) {
                  const first = generatorSubItems.find((s) => isModuleAllowed(s.module));
                  if (first) navigate(first.path);
                } else {
                  const next = !generatorOpen;
                  setGeneratorOpen(next);
                  if (next) {
                    setHubOpen(false);
                    setKanbanOpen(false);
                  }
                }
              }}
              title={collapsed ? 'Gerador' : undefined}
              className={cn(
                "w-full flex items-center rounded-2xl transition-all duration-200 group relative",
                collapsed
                  ? "justify-center p-3"
                  : "gap-3.5 px-4 py-3",
                isGeneratorActive
                  ? "bg-primary/10 text-white border border-primary/15"
                  : "text-gray-500 hover:text-white hover:bg-white/[0.03] border border-transparent"
              )}
            >
              {isGeneratorActive && (
                <div className={cn(
                  "absolute top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full shadow-[0_0_12px_rgba(55,178,77,0.5)]",
                  collapsed ? "-left-2" : "-left-4"
                )} />
              )}

              <div className={cn(
                "p-1.5 rounded-xl transition-colors shrink-0",
                isGeneratorActive ? "bg-primary/20 text-primary" : "text-gray-500 group-hover:text-gray-300"
              )}>
                <Sparkles size={18} />
              </div>

              {!collapsed && (
                <>
                  <div className="flex flex-col flex-1 text-left">
                    <span className="text-[13px] font-semibold leading-tight">Gerador</span>
                  </div>
                  <ChevronDown size={14} className={cn(
                    "text-gray-600 transition-transform duration-200",
                    generatorOpen && "rotate-180"
                  )} />
                </>
              )}
            </button>

            {/* Sub-items */}
            {!collapsed && generatorOpen && (
              <div className="ml-[22px] mt-2 space-y-1.5 border-l border-white/[0.06] pl-4">
                {generatorSubItems.map((sub) => {
                  const allowed = isModuleAllowed(sub.module);
                  if (!allowed) {
                    return (
                      <div
                        key={sub.path}
                        className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-gray-700 cursor-not-allowed select-none"
                      >
                        <sub.icon size={14} strokeWidth={1.5} className="shrink-0 text-gray-700" />
                        <span className="text-[13px] font-semibold leading-tight flex-1 opacity-60">{sub.label}</span>
                        <Lock size={11} className="text-gray-700 shrink-0" />
                      </div>
                    );
                  }
                  return (
                  <NavLink
                    key={sub.path}
                    to={sub.path}
                    end
                    className={({ isActive }) => cn(
                      "flex items-center gap-2.5 px-3 py-3 rounded-xl transition-all duration-200 group/sub",
                      isActive
                        ? "bg-primary/8 text-white"
                        : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <sub.icon size={14} strokeWidth={1.5} className={cn(
                          "shrink-0 transition-colors",
                          isActive ? "text-primary" : "text-gray-600 group-hover/sub:text-gray-400"
                        )} />
                        <span className="text-[13px] font-semibold leading-tight">{sub.label}</span>
                      </>
                    )}
                  </NavLink>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* 2. Notas */}
          {menuItems.map((item) => {
            const allowed = isModuleAllowed(item.module);
            if (!allowed) {
              return (
                <div
                  key={item.path}
                  title={collapsed ? `${item.label} (bloqueado)` : undefined}
                  className={cn(
                    "flex items-center rounded-2xl text-gray-700 cursor-not-allowed select-none border border-transparent",
                    collapsed ? "justify-center p-3" : "gap-3.5 px-4 py-3"
                  )}
                >
                  <div className="p-1.5 rounded-xl shrink-0 text-gray-700">
                    <item.icon size={18} />
                  </div>
                  {!collapsed && (
                    <>
                      <span className="text-[13px] font-semibold leading-tight flex-1 opacity-60">{item.label}</span>
                      <Lock size={12} className="text-gray-700 shrink-0" />
                    </>
                  )}
                </div>
              );
            }
            return (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) => cn(
                "flex items-center rounded-2xl transition-all duration-200 group relative",
                collapsed
                  ? "justify-center p-3"
                  : "gap-3.5 px-4 py-3",
                isActive
                  ? "bg-primary/10 text-white border border-primary/15"
                  : "text-gray-500 hover:text-white hover:bg-white/[0.03] border border-transparent"
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className={cn(
                      "absolute top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full shadow-[0_0_12px_rgba(55,178,77,0.5)]",
                      collapsed ? "-left-2" : "-left-4"
                    )} />
                  )}

                  <div className={cn(
                    "p-1.5 rounded-xl transition-colors shrink-0",
                    isActive ? "bg-primary/20 text-primary" : "text-gray-500 group-hover:text-gray-300"
                  )}>
                    <item.icon size={18} />
                  </div>

                  {!collapsed && (
                    <span className="text-[13px] font-semibold leading-tight">{item.label}</span>
                  )}
                </>
              )}
            </NavLink>
            );
          })}

          {/* 3. Quadros (ex-Kanban) com submenu de projetos */}
          {kanbanAllowed ? (
          <div>
            <button
              onClick={() => {
                if (collapsed) {
                  navigate('/kanban');
                } else {
                  const next = !kanbanOpen;
                  setKanbanOpen(next);
                  if (next) {
                    setHubOpen(false);
                    setGeneratorOpen(false);
                  }
                }
              }}
              title={collapsed ? 'Quadros' : undefined}
              className={cn(
                "w-full flex items-center rounded-2xl transition-all duration-200 group relative",
                collapsed
                  ? "justify-center p-3"
                  : "gap-3.5 px-4 py-3",
                isKanbanActive
                  ? "bg-primary/10 text-white border border-primary/15"
                  : "text-gray-500 hover:text-white hover:bg-white/[0.03] border border-transparent"
              )}
            >
              {isKanbanActive && (
                <div className={cn(
                  "absolute top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full shadow-[0_0_12px_rgba(55,178,77,0.5)]",
                  collapsed ? "-left-2" : "-left-4"
                )} />
              )}

              <div className={cn(
                "p-1.5 rounded-xl transition-colors shrink-0",
                isKanbanActive ? "bg-primary/20 text-primary" : "text-gray-500 group-hover:text-gray-300"
              )}>
                <Layout size={18} />
              </div>

              {!collapsed && (
                <>
                  <div className="flex flex-col flex-1 text-left">
                    <span className="text-[13px] font-semibold leading-tight">Quadros</span>
                  </div>
                  <ChevronDown size={14} className={cn(
                    "text-gray-600 transition-transform duration-200",
                    kanbanOpen && "rotate-180"
                  )} />
                </>
              )}
            </button>

            {/* Sub-items: projetos */}
            {!collapsed && kanbanOpen && (
              <div className="ml-[22px] mt-2 space-y-1.5 border-l border-white/[0.06] pl-4">
                {projects.slice(0, MAX_SIDEBAR_PROJECTS).map((project) => {
                  const dotColor = SIDEBAR_PROJECT_COLORS[project.id % SIDEBAR_PROJECT_COLORS.length];
                  return (
                    <NavLink
                      key={project.id}
                      to={`/kanban/${project.id}`}
                      className={({ isActive }) => cn(
                        "flex items-center gap-2.5 px-3 py-3 rounded-xl transition-all duration-200 group/sub",
                        isActive
                          ? "bg-primary/8 text-white"
                          : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
                      )}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0 opacity-50"
                        style={{ backgroundColor: dotColor }}
                      />
                      <span className="text-[13px] font-semibold leading-tight truncate">{project.name}</span>
                    </NavLink>
                  );
                })}

                <NavLink
                  to="/kanban"
                  end
                  className={({ isActive }) => cn(
                    "flex items-center gap-2.5 px-3 py-3 rounded-xl transition-all duration-200 group/sub",
                    isActive
                      ? "bg-primary/8 text-white"
                      : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
                  )}
                >
                  {({ isActive }) => (
                    <>
                      <FolderKanban size={14} strokeWidth={1.5} className={cn(
                        "shrink-0 transition-colors",
                        isActive ? "text-primary" : "text-gray-600 group-hover/sub:text-gray-400"
                      )} />
                      <span className="text-[13px] font-semibold leading-tight">Todos os projetos</span>
                    </>
                  )}
                </NavLink>
              </div>
            )}
          </div>
          ) : (
          <div
            title={collapsed ? 'Quadros (bloqueado)' : undefined}
            className={cn(
              "flex items-center rounded-2xl text-gray-700 cursor-not-allowed select-none border border-transparent",
              collapsed ? "justify-center p-3" : "gap-3.5 px-4 py-3"
            )}
          >
            <div className="p-1.5 rounded-xl shrink-0 text-gray-700">
              <Layout size={18} />
            </div>
            {!collapsed && (
              <>
                <span className="text-[13px] font-semibold leading-tight flex-1 opacity-60">Quadros</span>
                <Lock size={12} className="text-gray-700 shrink-0" />
              </>
            )}
          </div>
          )}

          {/* 4. Hub Analítico com submenu */}
          {hubAllowed && (
          <div>
            <button
              onClick={() => {
                if (collapsed) {
                  const first = hubSubItems.find((s) => isModuleAllowed(s.module));
                  if (first) navigate(first.path);
                } else {
                  const next = !hubOpen;
                  setHubOpen(next);
                  if (next) {
                    setKanbanOpen(false);
                    setGeneratorOpen(false);
                  }
                }
              }}
              title={collapsed ? 'Hub Analítico' : undefined}
              className={cn(
                "w-full flex items-center rounded-2xl transition-all duration-200 group relative",
                collapsed
                  ? "justify-center p-3"
                  : "gap-3.5 px-4 py-3",
                isHubActive
                  ? "bg-primary/10 text-white border border-primary/15"
                  : "text-gray-500 hover:text-white hover:bg-white/[0.03] border border-transparent"
              )}
            >
              {isHubActive && (
                <div className={cn(
                  "absolute top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full shadow-[0_0_12px_rgba(55,178,77,0.5)]",
                  collapsed ? "-left-2" : "-left-4"
                )} />
              )}

              <div className={cn(
                "p-1.5 rounded-xl transition-colors shrink-0",
                isHubActive ? "bg-primary/20 text-primary" : "text-gray-500 group-hover:text-gray-300"
              )}>
                <TrendingUp size={18} />
              </div>

              {!collapsed && (
                <>
                  <div className="flex flex-col flex-1 text-left">
                    <span className="text-[13px] font-semibold leading-tight">Hub Analítico</span>
                  </div>
                  <ChevronDown size={14} className={cn(
                    "text-gray-600 transition-transform duration-200",
                    hubOpen && "rotate-180"
                  )} />
                </>
              )}
            </button>

            {/* Sub-items */}
            {!collapsed && hubOpen && (
              <div className="ml-[22px] mt-2 space-y-1.5 border-l border-white/[0.06] pl-4">
                {hubSubItems.map((sub) => {
                  const allowed = isModuleAllowed(sub.module);
                  if (!allowed) {
                    return (
                      <div
                        key={sub.path}
                        className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-gray-700 cursor-not-allowed select-none"
                      >
                        <sub.icon size={14} strokeWidth={1.5} className="shrink-0 text-gray-700" />
                        <span className="text-[13px] font-semibold leading-tight flex-1 opacity-60">{sub.label}</span>
                        <Lock size={11} className="text-gray-700 shrink-0" />
                      </div>
                    );
                  }
                  return (
                  <NavLink
                    key={sub.path}
                    to={sub.path}
                    end
                    className={({ isActive }) => cn(
                      "flex items-center gap-2.5 px-3 py-3 rounded-xl transition-all duration-200 group/sub",
                      isActive
                        ? "bg-primary/8 text-white"
                        : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <sub.icon size={14} strokeWidth={1.5} className={cn(
                          "shrink-0 transition-colors",
                          isActive ? "text-primary" : "text-gray-600 group-hover/sub:text-gray-400"
                        )} />
                        <span className="text-[13px] font-semibold leading-tight">{sub.label}</span>
                      </>
                    )}
                  </NavLink>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </nav>
      </div>

      {/* Footer */}
      <div className={cn("space-y-0.5", collapsed ? "p-2" : "p-4")}>
        <div className={cn("mb-3 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent", collapsed ? "mx-1" : "mx-1")} />

        <NavLink
          to="/settings"
          title={collapsed ? "Configurações" : undefined}
          className={({ isActive }) => cn(
            "w-full flex items-center transition-all duration-200 rounded-xl group",
            collapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2.5",
            isActive
              ? "text-white bg-white/[0.06]"
              : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
          )}
        >
          <Settings size={16} strokeWidth={1.5} className="group-hover:rotate-45 transition-transform duration-300 shrink-0" />
          {!collapsed && <span className="font-medium text-[13px]">Configurações</span>}
        </NavLink>

        <button
          onClick={handleLogout}
          title={collapsed ? "Sair" : undefined}
          className={cn(
            "w-full flex items-center text-red-400/50 hover:text-red-400 transition-all duration-200 rounded-xl hover:bg-red-400/[0.05] group",
            collapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2.5"
          )}
        >
          <LogOut size={16} strokeWidth={2.5} className="shrink-0" />
          {!collapsed && <span className="font-medium text-[13px]">Sair</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
