import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
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
  FolderKanban,
  Plus,
  BookOpen,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSidebar } from '../contexts/SidebarContext';
import { useProjects } from '../contexts/ProjectsContext';
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

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed, toggle } = useSidebar();
  const { projects, fetchProjects, addProject: addProjectToCtx } = useProjects();

  const isHubActive = location.pathname === '/' || location.pathname === '/transcriber';
  const isKanbanActive = location.pathname.startsWith('/kanban');

  const [hubOpen, setHubOpen] = useState(isHubActive);
  const [kanbanOpen, setKanbanOpen] = useState(isKanbanActive);

  // Auto-collapse submenus based on current route
  useEffect(() => {
    setHubOpen(isHubActive);
    setKanbanOpen(isKanbanActive);
  }, [location.pathname]);

  useEffect(() => {
    fetchProjects();
  }, [location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const hubSubItems = [
    { icon: Zap, label: 'Vídeos curtos', path: '/' },
    { icon: Film, label: 'Vídeos longos', path: '/transcriber' },
  ];

  const menuItems = [
    { icon: Sparkles, label: 'Criação AI', path: '/creator' },
    { icon: BookOpen, label: 'Notas', path: '/notes' },
  ];

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

      {/* Navigation */}
      <div className={cn("flex-1 pt-6 overflow-y-auto overflow-x-hidden custom-scrollbar", collapsed ? "px-2" : "px-4")}>
        {!collapsed && <p className="data-label px-3 mb-4">Workspace</p>}
        <nav className={cn("stagger-children", collapsed ? "space-y-2" : "space-y-1")}>
          {/* Hub Analítico com submenu */}
          <div>
            <button
              onClick={() => {
                if (collapsed) {
                  navigate('/');
                } else {
                  const next = !hubOpen;
                  setHubOpen(next);
                  if (next) setKanbanOpen(false);
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
                {hubSubItems.map((sub) => (
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
                ))}
              </div>
            )}
          </div>

          {menuItems.map((item) => (
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
          ))}

          {/* Kanban com submenu de projetos */}
          <div>
            <button
              onClick={() => {
                if (collapsed) {
                  navigate('/kanban');
                } else {
                  const next = !kanbanOpen;
                  setKanbanOpen(next);
                  if (next) setHubOpen(false);
                }
              }}
              title={collapsed ? 'Kanban' : undefined}
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
                    <span className="text-[13px] font-semibold leading-tight">Kanban</span>
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

              </div>
            )}
          </div>
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
