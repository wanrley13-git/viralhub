import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Layout, Search, Loader2, Sparkles, Plus, X, Pencil, Calendar, ArrowLeft, FolderKanban, Trash2, Check, CalendarDays, Columns3 } from 'lucide-react';
import { motion } from 'framer-motion';
import ImageLightbox from '../components/ImageLightbox';
import KanbanBoard from '../components/KanbanBoard';
import CalendarView from '../components/CalendarView';
import TaskEditor from '../components/TaskEditor';
import { useNavigate, useParams } from 'react-router-dom';
import { useSidebar } from '../contexts/SidebarContext';
import { useProjects } from '../contexts/ProjectsContext';
import { getAccessToken } from '../supabaseClient';
import { resolveThumbnailUrl } from '../components/Thumbnail';

const API_URL = import.meta.env.VITE_API_URL;

const DEFAULT_COLUMNS = [
  { id: 'todo', title: 'Nova tarefa', accent: 'bg-cyan-500' },
  { id: 'doing', title: 'Produzindo', accent: 'bg-green-500' },
  { id: 'done', title: 'Concluído', accent: 'bg-amber-500' },
];

const COLUMN_ACCENTS = [
  'bg-cyan-500', 'bg-green-500', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-blue-500', 'bg-orange-500', 'bg-pink-500',
];

const PROJECT_COLORS = [
  'from-cyan-500/20 to-cyan-500/5',
  'from-green-500/20 to-green-500/5',
  'from-violet-500/20 to-violet-500/5',
  'from-amber-500/20 to-amber-500/5',
  'from-rose-500/20 to-rose-500/5',
  'from-blue-500/20 to-blue-500/5',
];

const PROJECT_ACCENT_HEX = [
  '#06b6d4', '#22c55e', '#8b5cf6',
  '#f59e0b', '#f43f5e', '#3b82f6',
];

// ─── Project List View ───
const ProjectListView = ({ collapsed }) => {
  const { projects, loaded, fetchProjects, removeProject, updateProject } = useProjects();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const navigate = useNavigate();
  const loading = !loaded;

  useEffect(() => { fetchProjects(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const token = await getAccessToken();
      const res = await axios.post(`${API_URL}/projects/`, { name: 'Novo Projeto' }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      navigate(`/kanban/${res.data.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id) => {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      const token = await getAccessToken();
      await axios.patch(`${API_URL}/projects/${id}`, { name: editName.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      updateProject(id, { name: editName.trim() });
    } catch (err) { console.error(err); }
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este projeto e todos seus cards?')) return;
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/projects/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      removeProject(id);
    } catch (err) { console.error(err); }
  };

  return (
    <div className="animate-fade-in min-h-screen flex flex-col transition-all duration-300" style={{ paddingLeft: collapsed ? 72 : 260 }}>
      <div className="flex-1 flex flex-col p-8">
        {/* Header */}
        <div className="flex justify-between items-end mb-14">
          <div>
            <h2 className="text-4xl font-extrabold text-white tracking-tight">Meus Projetos</h2>
            <p className="text-gray-500 mt-3 text-[15px]">Cada projeto é um quadro Kanban independente com seus próprios cards.</p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="btn-primary px-6 py-2.5 rounded-2xl text-sm flex items-center gap-2"
          >
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2.5} />}
            Novo Projeto
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="animate-spin text-primary" size={32} />
            <p className="text-gray-600 text-sm animate-pulse font-mono tracking-wide">Carregando projetos...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-5 opacity-50">
            <div className="p-10 bg-white/[0.03] rounded-4xl border border-border-subtle">
              <FolderKanban size={52} strokeWidth={1.5} className="text-primary" />
            </div>
            <h3 className="text-xl font-extrabold text-white tracking-tight">Nenhum projeto</h3>
            <p className="text-sm text-gray-500 leading-relaxed">Crie seu primeiro projeto para organizar seus conteúdos em quadros Kanban.</p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="text-white hover:text-primary font-bold uppercase tracking-widest text-xs transition-colors btn-ghost flex items-center gap-1.5"
            >
              <Plus size={13} strokeWidth={2.5} /> Criar Projeto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((project, idx) => {
              const colorIdx = project.id % PROJECT_COLORS.length;
              const accentHex = PROJECT_ACCENT_HEX[colorIdx];

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="group relative bg-surface rounded-3xl border border-border-subtle hover:border-border-hover transition-all duration-300 cursor-pointer shadow-card hover:shadow-card-hover overflow-hidden aspect-square flex flex-col"
                  onClick={() => {
                    if (editingId !== project.id) navigate(`/kanban/${project.id}`);
                  }}
                >
                  {/* Gradient background - taller for square feel */}
                  <div className={`flex-1 min-h-0 bg-gradient-to-b ${PROJECT_COLORS[colorIdx]} relative`}>
                    {/* Glow orb */}
                    <div
                      className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full blur-3xl opacity-30"
                      style={{ backgroundColor: accentHex }}
                    />
                    {/* Icon */}
                    <div className="absolute bottom-5 left-6">
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center border"
                        style={{ backgroundColor: `${accentHex}20`, borderColor: `${accentHex}30` }}
                      >
                        <FolderKanban size={18} strokeWidth={1.5} style={{ color: accentHex }} />
                      </div>
                    </div>
                  </div>

                  {/* Info section */}
                  <div className="p-6 pt-5 bg-surface">
                    {editingId === project.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(project.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="flex-1 bg-surface-flat border border-border-subtle rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <button onClick={() => handleRename(project.id)} className="p-2 text-green-400 hover:bg-green-400/10 rounded-xl"><Check size={16} /></button>
                        <button onClick={() => setEditingId(null)} className="p-2 text-gray-500 hover:bg-white/5 rounded-xl"><X size={16} /></button>
                      </div>
                    ) : (
                      <h3 className="text-[17px] font-extrabold text-white tracking-tight truncate mb-3">{project.name}</h3>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-500 flex items-center gap-2">
                        <Calendar size={12} strokeWidth={1.5} />
                        {new Date(project.created_at).toLocaleDateString('pt-BR')}
                      </span>

                      {/* Actions */}
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditingId(project.id); setEditName(project.name); }}
                          className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-colors"
                          title="Renomear"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(project.id)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Create new card */}
            <button
              onClick={handleCreate}
              disabled={creating}
              className="aspect-square bg-surface/50 hover:bg-surface rounded-3xl border border-dashed border-border-subtle hover:border-border-hover transition-all flex flex-col items-center justify-center gap-4 text-gray-500 hover:text-white"
            >
              {creating ? <Loader2 size={28} className="animate-spin" /> : <Plus size={28} />}
              <span className="text-sm font-semibold">Novo Projeto</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Board View (inside a project) ───
const BoardView = ({ projectId, collapsed }) => {
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [createStatus, setCreateStatus] = useState('todo');
  const [previewTask, setPreviewTask] = useState(null);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [viewMode, setViewMode] = useState('kanban');
  const navigate = useNavigate();

  useEffect(() => {
    fetchProject();
    fetchTasks();
  }, [projectId]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setPreviewTask(null);
        setEditorOpen(false);
        setEditingTask(null);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  const fetchProject = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProject(res.data);
      if (res.data.columns_json) {
        try {
          const cols = JSON.parse(res.data.columns_json);
          if (Array.isArray(cols) && cols.length > 0) setColumns(cols);
        } catch { /* use default */ }
      }
    } catch (err) {
      console.error('Erro ao buscar projeto:', err);
      if (err?.response?.status === 404) navigate('/kanban');
    }
  };

  const saveColumns = async (newColumns) => {
    setColumns(newColumns);
    try {
      const token = await getAccessToken();
      await axios.patch(`${API_URL}/projects/${projectId}`, {
        columns_json: JSON.stringify(newColumns)
      }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) { console.error(err); }
  };

  const fetchTasks = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/tasks/?project_id=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTasks(res.data);
    } catch (err) {
      console.error('Erro ao buscar tarefas:', err);
    } finally {
      setLoading(false);
    }
  };

  const onTaskUpdate = async (id, updates) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    try {
      const token = await getAccessToken();
      await axios.patch(`${API_URL}/tasks/${id}`, updates, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error(err);
      fetchTasks();
    }
  };

  const onTaskDelete = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/tasks/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error(err);
      fetchTasks();
    }
  };

  const [createDate, setCreateDate] = useState(null);

  const handleCreateTask = (status, scheduledDate = null) => {
    setEditingTask(null);
    setCreateStatus(status);
    setCreateDate(scheduledDate);
    setEditorOpen(true);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setEditorOpen(true);
  };

  const handlePreviewTask = (task) => {
    setPreviewTask(task);
  };

  const handleSaveTask = async (taskData) => {
    const token = await getAccessToken();
    try {
      if (editingTask) {
        await axios.patch(`${API_URL}/tasks/${editingTask.id}`, taskData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        const res = await axios.post(`${API_URL}/tasks/`, { ...taskData, project_id: parseInt(projectId) }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        // After first create, switch to editing mode so subsequent auto-saves do PATCH
        setEditingTask(res.data);
      }
      fetchTasks();
    } catch (err) {
      console.error('Erro ao salvar:', err?.response?.status, err?.response?.data || err.message);
      throw err;
    }
  };

  // Column management - now persisted to DB via project
  const addColumn = () => {
    const id = 'col_' + Date.now();
    const accentIdx = columns.length % COLUMN_ACCENTS.length;
    const newCols = [...columns, { id, title: 'Nova Coluna', accent: COLUMN_ACCENTS[accentIdx] }];
    saveColumns(newCols);
  };

  const renameColumn = (colId, newTitle) => {
    const newCols = columns.map(c => c.id === colId ? { ...c, title: newTitle } : c);
    saveColumns(newCols);
  };

  const deleteColumn = (colId) => {
    const tasksInColumn = tasks.filter(t => t.status === colId);
    if (tasksInColumn.length > 0) {
      if (!window.confirm(`Essa coluna tem ${tasksInColumn.length} card(s). Os cards serão movidos para "Nova tarefa". Continuar?`)) return;
      tasksInColumn.forEach(t => onTaskUpdate(t.id, { status: 'todo' }));
    }
    const newCols = columns.filter(c => c.id !== colId);
    saveColumns(newCols);
  };

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.content_md && t.content_md.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="animate-fade-in min-h-screen flex flex-col transition-all duration-300" style={{ paddingLeft: collapsed ? 72 : 260 }}>
      <div className="flex-1 flex flex-col p-8 pb-0">

        {/* Header */}
        <div className="flex justify-between items-end mb-14">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => navigate('/kanban')}
                className="flex items-center gap-1.5 text-gray-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-wider"
              >
                <ArrowLeft size={12} strokeWidth={2.5} />
                Projetos
              </button>
              <span className="text-gray-700">/</span>
              <span className="data-label-primary">{project?.name || 'Carregando...'}</span>
            </div>
            <h2 className="text-4xl font-extrabold text-white tracking-tight">
              {project?.name || 'Quadro de Produção'}
            </h2>
          </div>

          <div className="flex gap-3 items-center">
            {/* View Toggle */}
            <div className="flex gap-0.5 p-1 bg-surface-flat rounded-2xl border border-border-subtle">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  viewMode === 'kanban'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Columns3 size={14} strokeWidth={2} /> Kanban
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  viewMode === 'calendar'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <CalendarDays size={14} strokeWidth={2} /> Calendário
              </button>
            </div>

            <div className="relative w-56">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600" size={14} strokeWidth={2} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field rounded-2xl py-2.5 pl-10 pr-4 text-sm"
                placeholder="Buscar card..."
              />
            </div>
            <button
              onClick={() => handleCreateTask('todo')}
              className="btn-magnetic bg-surface-flat text-white px-5 py-2.5 rounded-2xl text-sm flex items-center gap-2 border border-border-subtle hover:border-border-hover"
            >
              <Plus size={15} strokeWidth={2.5} /> Novo Card
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="animate-spin text-primary" size={32} />
            <p className="text-gray-600 text-sm animate-pulse font-mono tracking-wide">Organizando roteiros e pautas...</p>
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="flex-1 overflow-hidden -mx-4">
            <KanbanBoard
              tasks={filteredTasks}
              columns={columns}
              onTaskUpdate={onTaskUpdate}
              onTaskDelete={onTaskDelete}
              onCreateTask={handleCreateTask}
              onEditTask={handleEditTask}
              onPreviewTask={handlePreviewTask}
              onAddColumn={addColumn}
              onRenameColumn={renameColumn}
              onDeleteColumn={deleteColumn}
            />
          </div>
        ) : (
          <CalendarView
            tasks={filteredTasks}
            projectId={projectId}
            onEditTask={handleEditTask}
          />
        )}
      </div>

      {/* Task Editor Modal */}
      {editorOpen && (
        <TaskEditor
          task={editingTask}
          initialDate={createDate}
          initialStatus={createStatus}
          onSave={handleSaveTask}
          onClose={() => { setEditorOpen(false); setEditingTask(null); setCreateDate(null); }}
        />
      )}

      {/* Read-Only Preview Modal */}
      {previewTask && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/50 animate-fade-in" onClick={() => setPreviewTask(null)}>
          <div className="glass-raised w-full max-w-3xl max-h-[85vh] rounded-4xl flex flex-col overflow-hidden shadow-modal" onClick={(e) => e.stopPropagation()}>
            {/* Preview Header */}
            <div className="p-7 border-b border-border-subtle flex justify-between items-start bg-surface/60">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-lg text-[10px] font-bold uppercase tracking-wider font-mono border border-primary/15">
                    {previewTask.tag}
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-gray-600">
                    <Calendar size={10} strokeWidth={1.5} />
                    {new Date(previewTask.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight">{previewTask.title}</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setPreviewTask(null); handleEditTask(previewTask); }}
                  className="btn-magnetic flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary rounded-xl text-xs font-bold border border-primary/15 hover:bg-primary/15"
                >
                  <Pencil size={13} /> Editar
                </button>
                <button onClick={() => setPreviewTask(null)} className="p-2.5 bg-white/5 hover:bg-white/8 rounded-xl transition-colors text-gray-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Preview Body */}
            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-background/40">
              {previewTask.thumbnail_url && (
                <div
                  className="w-full max-w-md rounded-2xl overflow-hidden border border-border-subtle mb-6 cursor-zoom-in"
                  onClick={() => setLightboxSrc(resolveThumbnailUrl(previewTask.thumbnail_url))}
                >
                  <img src={resolveThumbnailUrl(previewTask.thumbnail_url)} alt="" className="w-full object-cover" />
                </div>
              )}
              {previewTask.content_md ? (
                <div className="markdown-body max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{previewTask.content_md}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-gray-600 text-sm font-serif italic text-center py-12">Este card não possui conteúdo.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
};

// ─── Main Kanban Component ───
const Kanban = () => {
  const { projectId } = useParams();
  const { collapsed } = useSidebar();

  if (projectId) {
    return <BoardView projectId={projectId} collapsed={collapsed} />;
  }

  return <ProjectListView collapsed={collapsed} />;
};

export default Kanban;
