import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import MarkdownRenderer from '../components/MarkdownRenderer';
import {
  Upload, Link as LinkIcon, FileVideo, Sparkles, Loader2, Download,
  Terminal, Activity, AlertCircle, Library as LibraryIcon,
  Calendar, FileText, Search, Trash2, Check, CloudDownload, X, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { useSidebar } from '../contexts/SidebarContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getAccessToken } from '../supabaseClient';
import Thumbnail from '../components/Thumbnail';
import useToast from '../hooks/useToast';

const API_URL = import.meta.env.VITE_API_URL;

// Hard caps, mirrored from the backend (routers/analysis.py). Keep in
// sync: the server enforces them with HTTP 400s and the UI refuses to
// even fire the request when the user is over the limit, so they never
// have to wait for a round-trip to discover it's too many.
const MAX_LINKS_PER_ANALYSIS = 20;
const MAX_FILES_PER_ANALYSIS = 30;

// ─── Date helpers for library grouping ───
// Normalize to local "YYYY-MM-DD" key so two ISO strings from the same
// calendar day always collapse into the same bucket regardless of hours.
const toDateKey = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return 'unknown';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Human-friendly label for a date key — "Hoje" / "Ontem" / "DD/MM/YYYY"
const formatGroupHeader = (dateKey) => {
  if (!dateKey || dateKey === 'unknown') return 'Sem data';
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  if (dateKey === today) return 'Hoje';
  if (dateKey === yesterday) return 'Ontem';
  const [yy, mm, dd] = dateKey.split('-');
  return `${dd}/${mm}/${yy}`;
};

// Bucket a flat list of analyses into { dateKey, label, items[] } groups
// already sorted most-recent-day-first, with items inside each day kept in
// the original (already-chronological-desc) order.
const groupAnalysesByDate = (list) => {
  const buckets = new Map();
  for (const a of list) {
    const key = toDateKey(a.created_at);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(a);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dateKey, items]) => ({
      dateKey,
      label: formatGroupHeader(dateKey),
      items,
    }));
};

const Analyzer = () => {
  const { collapsed } = useSidebar();
  const { activeWorkspaceId } = useWorkspace();
  const { toast, ToastContainer } = useToast();
  // === Estados de Upload & Análise ===
  const [activeTab, setActiveTab] = useState('upload');
  const [progressTab, setProgressTab] = useState('status');
  const [links, setLinks] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Iniciando...');
  const [logs, setLogs] = useState([]);
  const [taskId, setTaskId] = useState(null);
  // Ref to the scrollable LOGS CONTAINER (not a sentinel inside it).
  // We set scrollTop directly so only this inner box scrolls — never the
  // page. Using scrollIntoView here previously caused a loop where every
  // new log line scrolled the whole document down to keep the container
  // in view, fighting the user's own scroll input.
  const logsContainerRef = useRef(null);

  // === Estados da Biblioteca ===
  const [analyses, setAnalyses] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Bulk selection is now implicit: clicking the card checkbox toggles an
  // id into selectedExports. When the list is non-empty, the floating bar
  // and "bulk mode" UI appears automatically — no explicit toggle needed.
  const [selectedExports, setSelectedExports] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cardSize, setCardSize] = useState(2); // 0=small(6cols), 1=medium(5cols), 2=large(4cols)

  useEffect(() => {
    // Clear stale data from previous workspace before refetching
    setAnalyses([]);
    setSelectedAnalysis(null);
    setSelectedExports([]);

    fetchHistory();
    // Resume progress listener if there's an active analysis for this user
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await axios.get(`${API_URL}/analyze/active`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data?.taskId) {
          setTaskId(res.data.taskId);
          setProgress(res.data.progress || 0);
          setLogs(res.data.logs || []);
          setLoading(true);
          if (res.data.logs && res.data.logs.length > 0) {
            setStatusMessage(res.data.logs[res.data.logs.length - 1]);
          } else {
            setStatusMessage('Retomando análise em andamento...');
          }
        }
      } catch (err) {
        // Silent — endpoint might not exist yet or no active task
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  // ESC priority:
  //   1. Close delete confirmation if open
  //   2. Close reading modal if open
  //   3. Otherwise clear the current bulk selection
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (deleteConfirmOpen) {
        setDeleteConfirmOpen(false);
        return;
      }
      if (selectedAnalysis) {
        setSelectedAnalysis(null);
        return;
      }
      if (selectedExports.length > 0) {
        setSelectedExports([]);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [selectedAnalysis, deleteConfirmOpen, selectedExports.length]);

  // SSE connection with automatic reconnect.
  //
  // Background: Railway's HTTP/2 proxy kills long-lived SSE streams with
  // ERR_HTTP2_PROTOCOL_ERROR when the backend is crunching through a
  // 30–50 video batch (several minutes between state updates). The
  // server now emits a 15s heartbeat AND we reconnect on any onerror
  // that fires before the task hit a terminal state. Five failed
  // reconnects in a row is treated as a hard give-up so we don't spin
  // forever, but the backend task keeps running regardless — the user
  // can just refresh to resume.
  useEffect(() => {
    if (!taskId) return;

    const MAX_RECONNECTS = 5;
    const RECONNECT_DELAY_MS = 3000;

    let terminated = false;          // true once we hit completed/error OR cleanup runs
    let reconnectAttempts = 0;
    let eventSource = null;
    let reconnectTimer = null;

    const connect = () => {
      eventSource = new EventSource(`${API_URL}/analyze/progress/${taskId}`);

      // Successful open → reset the reconnect counter so a single
      // hiccup doesn't burn the whole budget.
      eventSource.onopen = () => {
        reconnectAttempts = 0;
      };

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data.progress || 0);
        setLogs(data.logs || []);

        if (data.logs && data.logs.length > 0) {
          setStatusMessage(data.logs[data.logs.length - 1]);
        }

        if (data.status === 'completed') {
          terminated = true;
          setLoading(false);
          setTaskId(null);
          eventSource.close();
          fetchHistory();
          setFiles([]);
          setLinks('');
          setProgress(0);
        }

        if (data.status === 'error') {
          terminated = true;
          setError(data.logs[data.logs.length - 1] || "Erro desconhecido na análise.");
          setLoading(false);
          setTaskId(null);
          eventSource.close();
        }

        if (data.status === 'cancelled') {
          terminated = true;
          setStatusMessage('Análise cancelada pelo usuário');
          setLoading(false);
          setTaskId(null);
          eventSource.close();
          // Refresh the library anyway — any videos that finished
          // analysing before the cancel landed were saved to the DB.
          fetchHistory();
        }
      };

      eventSource.onerror = () => {
        // Close whatever is here so we fully own reconnection timing
        // instead of fighting the browser's native auto-retry.
        try { eventSource.close(); } catch (_) {}

        // If we already saw a terminal state (or the component is
        // being torn down), don't try to reconnect.
        if (terminated) return;

        if (reconnectAttempts >= MAX_RECONNECTS) {
          setError("Conexão perdida. A análise pode ainda estar rodando no servidor. Recarregue a página para verificar.");
          setLoading(false);
          return;
        }

        reconnectAttempts += 1;
        setStatusMessage(
          `Conexão perdida. Reconectando (${reconnectAttempts}/${MAX_RECONNECTS}) em 3s...`
        );
        reconnectTimer = setTimeout(() => {
          if (!terminated) connect();
        }, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      terminated = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (eventSource) {
        try { eventSource.close(); } catch (_) {}
        eventSource = null;
      }
    };
  }, [taskId]);

  // Keep the logs panel pinned to the bottom as new lines arrive. We
  // mutate scrollTop on the INNER container ONLY — never the window or
  // document — so the rest of the page stays put regardless of how many
  // log updates stream in per second.
  useEffect(() => {
    const el = logsContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  // === Lógicas de Upload ===
  const onDrop = (acceptedFiles) => {
    setFiles(acceptedFiles);
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
      'application/zip': ['.zip', '.rar']
    }
  });

  const handleAnalyze = async () => {
    const token = await getAccessToken();
    setError(null);
    setLoading(true);
    setProgress(0);
    setLogs([]);
    setStatusMessage('Enviando arquivos...');

    const config = { headers: { Authorization: `Bearer ${token}` } };
    try {
      let res;
      if (activeTab === 'upload') {
        if (files.length === 0) throw new Error("Anexe pelo menos um vídeo ou arquivo ZIP.");
        if (files.length > MAX_FILES_PER_ANALYSIS) {
          throw new Error(`Máximo de ${MAX_FILES_PER_ANALYSIS} arquivos por análise.`);
        }

        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        res = await axios.post(`${API_URL}/analyze/files`, formData, {
          ...config,
          headers: { ...config.headers, 'Content-Type': 'multipart/form-data' }
        });
      } else {
        const linkList = links.split('\n').map(l => l.trim()).filter(l => l);
        if (linkList.length === 0) throw new Error("Insira pelo menos um link.");
        if (linkList.length > MAX_LINKS_PER_ANALYSIS) {
          throw new Error(`Máximo de ${MAX_LINKS_PER_ANALYSIS} links por análise.`);
        }
        res = await axios.post(`${API_URL}/analyze/links`, { links: linkList }, config);
      }
      if (res.data.taskId) setTaskId(res.data.taskId);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "Erro ao iniciar análise.");
      setLoading(false);
    }
  };

  // Request server-side cancellation of the currently running task.
  // The worker loops poll the status flag and bail out cooperatively,
  // so the UI doesn't flip to "cancelado" the instant this returns —
  // it waits for the SSE stream to push the "cancelled" status.
  const [cancelling, setCancelling] = useState(false);
  const handleCancelAnalysis = async () => {
    if (!taskId || cancelling) return;
    setCancelling(true);
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/analyze/cancel/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStatusMessage('Cancelando análise... aguarde o worker encerrar.');
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || 'Erro ao cancelar análise.');
    } finally {
      setCancelling(false);
    }
  };

  // === Lógicas da Biblioteca ===
  const fetchHistory = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/analyze/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAnalyses(res.data);
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const downloadSingleReport = (e, analysis) => {
    e.stopPropagation();
    const element = document.createElement("a");
    const file = new Blob([analysis.report_md], {type: 'text/markdown'});
    element.href = URL.createObjectURL(file);
    element.download = `${analysis.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(element);
    element.click();
  };

  // Concatenate the selected analyses into a single markdown file and
  // trigger a download. Everything happens client-side — no backend
  // round-trip — so it's instant even for dozens of reports.
  const handleExportMarkdown = async () => {
    if (selectedExports.length === 0) return;
    setExporting(true);
    try {
      const token = await getAccessToken();
      const cfg = { headers: { Authorization: `Bearer ${token}` } };

      // Fetch full report_md for each selected analysis
      const picked = await Promise.all(
        selectedExports.map(async (id) => {
          try {
            const res = await axios.get(`${API_URL}/analyze/${id}`, cfg);
            return res.data;
          } catch {
            const fallback = (analyses || []).find(a => a.id === id);
            return fallback || { id, title: `Análise #${id}`, report_md: '' };
          }
        })
      );

      const today = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
      });

      const header =
`# Análises Exportadas — ViralHub
Data de exportação: ${today}
Total: ${picked.length} ${picked.length === 1 ? 'análise' : 'análises'}

---

`;

      const body = picked.map((a) => {
        const title = (a.title || `Análise #${a.id}`).trim();
        const content = (a.report_md || '').trim();
        const createdAt = a.created_at
          ? new Date(a.created_at).toLocaleDateString('pt-BR', {
              day: '2-digit', month: 'long', year: 'numeric'
            })
          : '—';
        return `## ${title}\nData: ${createdAt}\n\n${content}`;
      }).join('\n\n---\n\n');

      const full = header + body + '\n';

      const blob = new Blob([full], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `viralhub_analises_${stamp}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setSelectedExports([]);
    } catch (err) {
      console.error('Erro exportando:', err);
      toast.error({ title: 'Erro ao exportar', message: 'Não foi possível gerar o arquivo de relatórios.' });
    } finally {
      setExporting(false);
    }
  };

  // Bulk delete — fires one DELETE /analyze/{id} per selected analysis in
  // parallel, then refreshes the history list. The confirmation step is
  // handled by the custom modal (setDeleteConfirmOpen(true)).
  const handleBulkDelete = async () => {
    if (selectedExports.length === 0) return;
    setDeleting(true);
    try {
      const token = await getAccessToken();
      const cfg = { headers: { Authorization: `Bearer ${token}` } };
      await Promise.all(
        selectedExports.map(id =>
          axios.delete(`${API_URL}/analyze/${id}`, cfg).catch(err => {
            console.error(`Falha ao apagar análise #${id}:`, err);
          })
        )
      );
      // Drop them from the currently visible reading modal as well
      if (selectedAnalysis && selectedExports.includes(selectedAnalysis.id)) {
        setSelectedAnalysis(null);
      }
      setSelectedExports([]);
      setDeleteConfirmOpen(false);
      await fetchHistory();
    } catch (err) {
      console.error('Erro apagando em lote:', err);
      toast.error({ title: 'Erro ao apagar', message: 'Falha ao remover uma ou mais análises.' });
    } finally {
      setDeleting(false);
    }
  };

  const filteredAnalyses = (analyses || []).filter(a =>
    (a.title && a.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (a.report_preview && a.report_preview.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Bucketed by calendar day for the grouped render below
  const groupedAnalyses = groupAnalysesByDate(filteredAnalyses);

  // Toggle a single card's membership in the selection set
  const toggleCardSelect = (id) => {
    setSelectedExports(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Per-group "Selecionar todos de [data]" toggle. Selects every id in
  // the group if any is missing; otherwise removes all ids in the group.
  const toggleGroupSelect = (groupItems) => {
    const groupIds = groupItems.map(a => a.id);
    const allSelected = groupIds.every(id => selectedExports.includes(id));
    if (allSelected) {
      setSelectedExports(prev => prev.filter(id => !groupIds.includes(id)));
    } else {
      setSelectedExports(prev => Array.from(new Set([...prev, ...groupIds])));
    }
  };

  // Is the click-to-toggle "bulk mode" active? (Any selection → yes)
  const hasSelection = selectedExports.length > 0;

  return (
    <div className="animate-fade-in relative min-h-screen transition-all duration-300" style={{ paddingLeft: collapsed ? 72 : 260 }}>
      {/* Ambient radial gradient background */}
      <div className="fixed inset-0 pointer-events-none transition-all duration-300" style={{ marginLeft: collapsed ? 72 : 260, background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(55, 178, 77, 0.06) 0%, rgba(55, 178, 77, 0.02) 40%, transparent 70%)' }} />

      {/* SEÇÃO 1: Upload e Análise */}
      <div className="max-w-4xl mx-auto pt-16 px-8 relative z-10">
        <div className="mb-12 stagger-children">
          <h2 className="text-4xl font-extrabold text-white tracking-tight">Workspace Analítico</h2>
          <p className="text-gray-500 mt-3 text-[15px] leading-relaxed max-w-lg">
            Hub centralizado de decodificação viral. Arraste arquivos para extrair relatórios automáticos.
          </p>
        </div>

        {/* Upload Card */}
        <div className="glass-raised rounded-4xl p-8 relative overflow-hidden mb-16">
          {/* Top glow line */}
          {loading ? (
            /* ── Progress State ── */
            <div className="relative z-10 flex flex-col items-center py-6">
              {/* Tab switcher */}
              <div className="tab-group rounded-2xl mb-8 w-full max-w-[280px]">
                <button
                  onClick={() => setProgressTab('status')}
                  className={`tab-item rounded-xl ${progressTab === 'status' ? 'active' : ''}`}
                >
                  <Activity size={14} strokeWidth={1.5} /> Status
                </button>
                <button
                  onClick={() => setProgressTab('logs')}
                  className={`tab-item rounded-xl ${progressTab === 'logs' ? 'active' : ''}`}
                >
                  <Terminal size={14} strokeWidth={1.5} /> Log
                </button>
              </div>

              {progressTab === 'status' ? (
                <div className="w-full flex flex-col items-center animate-fade-in">
                  {/* Circular progress */}
                  <div className="relative w-40 h-40 mb-8">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                      <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/[0.04]" />
                      <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={502} strokeDashoffset={502 - (502 * progress) / 100} strokeLinecap="round" className="text-primary transition-all duration-700 ease-out" style={{ filter: 'drop-shadow(0 0 12px rgba(55, 178, 77, 0.5))' }} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-white font-mono tracking-tight">{progress}%</span>
                      <span className="data-label-primary mt-1">Extraindo</span>
                    </div>
                  </div>
                  <p className="text-gray-400 font-medium text-center text-sm animate-pulse max-w-xs">{statusMessage}</p>
                </div>
              ) : (
                <div
                  ref={logsContainerRef}
                  className="w-full bg-surface border border-border-subtle rounded-2xl p-5 font-mono text-sm text-green-400/70 h-52 overflow-y-auto flex flex-col gap-1.5 custom-scrollbar"
                >
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-gray-600 shrink-0">[{new Date().toLocaleTimeString([], {hour12: false})}]</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Cancel button — visible any time a task is active,
                  regardless of which progress tab (status / log) is
                  selected. The worker loops poll the cancel flag at
                  every download/analysis step, so the actual stop
                  happens cooperatively rather than instantaneously. */}
              {taskId && (
                <button
                  onClick={handleCancelAnalysis}
                  disabled={cancelling}
                  className="mt-8 px-6 py-3 rounded-2xl flex items-center gap-2.5 text-sm font-semibold
                             bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50
                             text-red-300 hover:text-red-200 transition-all duration-200
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cancelling ? (
                    <>
                      <Loader2 size={15} strokeWidth={2.5} className="animate-spin" />
                      Cancelando...
                    </>
                  ) : (
                    <>
                      <X size={15} strokeWidth={2.5} />
                      Cancelar análise
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            /* ── Upload State ── */
            <>
              {/* Tab switcher */}
              <div className="flex gap-2 p-1.5 bg-surface-flat border border-border-subtle rounded-2xl mb-8 relative z-10 w-fit">
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                    activeTab === 'upload'
                      ? 'bg-primary text-white shadow-lg'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Upload size={15} strokeWidth={2} /> Arquivos / ZIP
                </button>
                <button
                  onClick={() => setActiveTab('link')}
                  className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                    activeTab === 'link'
                      ? 'bg-primary text-white shadow-lg'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <LinkIcon size={15} strokeWidth={2} /> Links URL
                </button>
              </div>

              <div className="relative z-10">
                {activeTab === 'upload' ? (
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all duration-300 ${
                      isDragActive
                        ? 'border-primary bg-primary/5 scale-[1.01]'
                        : 'border-border-subtle hover:border-border-hover hover:bg-white/[0.02]'
                    } ${files.length > 0 ? 'border-green-500/30 bg-green-500/[0.03]' : ''}`}
                  >
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className={`p-4 rounded-2xl ${files.length > 0 ? 'bg-green-500/10' : 'bg-white/[0.04]'}`}>
                        <FileVideo size={32} strokeWidth={1.5} className={files.length > 0 ? 'text-green-400' : 'text-gray-500'} />
                      </div>
                      {files.length > 0 ? (
                        <div>
                          <p className="text-white font-bold text-sm">{files.length} arquivo(s) na fila</p>
                          <p className="text-sm text-gray-500 mt-1.5 max-w-md truncate">{files.map(f => f.name).join(', ')}</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-white font-semibold text-sm">Arraste e solte vídeos ou ZIP com vídeos aqui</p>
                          <p className="text-sm text-gray-600 font-mono tracking-wide">.mp4, .mov, .zip — Máx: {MAX_FILES_PER_ANALYSIS} por operação</p>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <textarea
                      value={links}
                      onChange={(e) => setLinks(e.target.value)}
                      className="input-field rounded-2xl p-5 resize-none w-full"
                      rows="3"
                      placeholder={"https://youtube.com/shorts/...\nhttps://..."}
                    />
                    <p className="text-sm text-gray-600 font-mono tracking-wide text-center">Copie e cole o link de até {MAX_LINKS_PER_ANALYSIS} vídeos do Instagram, Shorts ou TikTok</p>
                  </div>
                )}
              </div>

              {/* Live over-limit warning — fires BEFORE the user hits
                  Iniciar so they don't waste a click on a request the
                  backend would just 400 back. Mirrors the server caps
                  from routers/analysis.py (20 / 30). */}
              {(() => {
                const linkCount = activeTab === 'link'
                  ? links.split('\n').map(l => l.trim()).filter(Boolean).length
                  : 0;
                const tooManyLinks = activeTab === 'link' && linkCount > MAX_LINKS_PER_ANALYSIS;
                const tooManyFiles = activeTab === 'upload' && files.length > MAX_FILES_PER_ANALYSIS;
                if (!tooManyLinks && !tooManyFiles) return null;
                const msg = tooManyLinks
                  ? `Você colou ${linkCount} links. Máximo de ${MAX_LINKS_PER_ANALYSIS} por análise — remova ${linkCount - MAX_LINKS_PER_ANALYSIS} para continuar.`
                  : `Você anexou ${files.length} arquivos. Máximo de ${MAX_FILES_PER_ANALYSIS} por análise — remova ${files.length - MAX_FILES_PER_ANALYSIS} para continuar.`;
                return (
                  <div className="mt-5 p-4 bg-amber-500/8 border border-amber-500/20 text-amber-300 rounded-2xl text-sm font-medium flex items-center gap-2.5 animate-fade-in">
                    <AlertTriangle size={15} /> {msg}
                  </div>
                );
              })()}

              {error && (
                <div className="mt-5 p-4 bg-red-500/8 border border-red-500/15 text-red-400 rounded-2xl text-sm font-medium flex items-center gap-2.5 animate-fade-in">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              <button
                onClick={handleAnalyze}
                disabled={
                  loading ||
                  taskId ||
                  (activeTab === 'upload'
                    ? files.length === 0 || files.length > MAX_FILES_PER_ANALYSIS
                    : links.trim() === '' ||
                      links.split('\n').map(l => l.trim()).filter(Boolean).length > MAX_LINKS_PER_ANALYSIS)
                }
                className="w-full mt-8 py-4 btn-white rounded-2xl flex justify-center items-center gap-2.5 text-sm disabled:opacity-40 disabled:pointer-events-none group"
              >
                {loading || taskId ? (
                  <>
                    <Loader2 size={16} strokeWidth={2.5} className="animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} strokeWidth={2.5} className="group-hover:text-primary transition-colors" />
                    Iniciar Automação e Gerar
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* SEÇÃO 2: Biblioteca */}
      <div className="border-t border-border-subtle bg-surface/30 pt-20 pb-32 relative z-10">
        <div className="px-8 lg:px-12">
          {/* Header da Biblioteca */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-14 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-glow-pulse" />
                <span className="data-label">Acervo Permanente</span>
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">Relatórios em Acervo</h2>
              <p className="text-gray-500 text-sm mt-2">Busque e baixe em MD isolado ou lotes compactados.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600" size={13} strokeWidth={2} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field rounded-2xl py-2.5 pl-10 pr-4 text-xs"
                  placeholder="Pesquisar relatório..."
                />
              </div>

              {/* Card size slider */}
              <div className="relative w-[72px] h-[30px] bg-[#18181D] rounded-full border border-white/[0.06] flex items-center px-[3px] cursor-pointer select-none"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const pct = x / rect.width;
                  if (pct < 0.33) setCardSize(0);
                  else if (pct < 0.66) setCardSize(1);
                  else setCardSize(2);
                }}
              >
                <div
                  className="w-[22px] h-[22px] rounded-full bg-primary shadow-[0_0_10px_rgba(55,178,77,0.4)] transition-all duration-200 ease-out"
                  style={{ marginLeft: cardSize === 0 ? '0px' : cardSize === 1 ? '21px' : '42px' }}
                />
              </div>
            </div>
          </div>

          {/* Library Content */}
          {historyLoading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <Loader2 className="animate-spin text-primary" size={28} />
              <p className="text-gray-600 text-sm animate-pulse font-mono tracking-wide">Sincronizando acervo...</p>
            </div>
          ) : filteredAnalyses.length === 0 ? (
            <div className="glass rounded-3xl p-20 text-center border-dashed border-2 border-border-subtle">
              <div className="inline-flex p-6 bg-white/[0.03] rounded-3xl mb-6">
                <LibraryIcon size={40} strokeWidth={1.5} className="text-gray-700" />
              </div>
              <p className="text-gray-400 font-semibold text-sm">Biblioteca vazia.</p>
              <p className="text-sm text-gray-600 mt-1.5">Nenhum relatório pronto para mostrar.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-14">
              {groupedAnalyses.map((group, gIdx) => {
                const groupIds = group.items.map(a => a.id);
                const groupAllSelected = groupIds.every(id => selectedExports.includes(id));
                const groupPartiallySelected = !groupAllSelected && groupIds.some(id => selectedExports.includes(id));
                return (
                  <section key={group.dateKey}>
                    {/* ── Group header: date divider + "Selecionar todos de [data]" ── */}
                    <div className="flex items-center gap-4 mb-6 group/header">
                      <button
                        onClick={() => toggleGroupSelect(group.items)}
                        className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                          groupAllSelected
                            ? 'bg-primary text-white'
                            : groupPartiallySelected
                              ? 'bg-primary/30 text-white'
                              : 'bg-white/[0.06] text-transparent hover:text-white/20'
                        }`}
                        title={groupAllSelected ? `Desmarcar todos de ${group.label}` : `Selecionar todos de ${group.label}`}
                      >
                        <Check size={12} strokeWidth={3} />
                      </button>
                      <span className="data-label-primary whitespace-nowrap">{group.label}</span>
                      <span className="text-[11px] text-gray-600 font-mono whitespace-nowrap">
                        {group.items.length} {group.items.length === 1 ? 'relatório' : 'relatórios'}
                      </span>
                      <div className="flex-1 h-px bg-gradient-to-r from-white/[0.08] to-transparent" />
                    </div>

                    {/* ── Group grid ── */}
                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 ${
                      cardSize === 0 ? 'lg:grid-cols-4 xl:grid-cols-6' :
                      cardSize === 1 ? 'lg:grid-cols-3 xl:grid-cols-5' :
                      'lg:grid-cols-3 xl:grid-cols-4'
                    }`}>
                      {group.items.map((analysis, idx) => {
                        const isSel = selectedExports.includes(analysis.id);
                        return (
                          <motion.div
                            key={analysis.id}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: Math.min(gIdx * 0.04 + idx * 0.04, 0.5), ease: [0.16, 1, 0.3, 1] }}
                            onClick={async () => {
                              // Implicit bulk mode: once anything is selected,
                              // clicking a card toggles selection. Otherwise the
                              // card opens the reading modal as usual.
                              if (hasSelection) {
                                toggleCardSelect(analysis.id);
                              } else {
                                try {
                                  const token = await getAccessToken();
                                  const res = await axios.get(`${API_URL}/analyze/${analysis.id}`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                  });
                                  setSelectedAnalysis(res.data);
                                } catch {
                                  setSelectedAnalysis(analysis);
                                }
                              }
                            }}
                            className={`glass lift rounded-3xl p-5 transition-all cursor-pointer relative overflow-hidden group ${
                              isSel
                                ? 'border-primary/40 glow-primary bg-primary/[0.06]'
                                : 'hover:border-border-hover'
                            }`}
                          >
                            {/* ── Top-right: selection checkbox (always present, subtle → visible on hover, primary when selected) ── */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleCardSelect(analysis.id); }}
                              className={`absolute top-4 right-4 z-20 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                                isSel
                                  ? 'bg-primary text-white shadow-[0_0_12px_rgba(55,178,77,0.5)]'
                                  : 'bg-black/60 backdrop-blur-sm text-transparent opacity-0 group-hover:opacity-100 group-hover:text-white/40 border border-white/10'
                              }`}
                              title={isSel ? 'Desmarcar' : 'Selecionar'}
                            >
                              <Check size={13} strokeWidth={3} />
                            </button>

                            {/* Card type label */}
                            <div className="flex items-center gap-2 mb-3.5">
                              <div className="p-1.5 bg-primary/10 rounded-xl">
                                <FileText size={13} strokeWidth={1.5} className="text-primary" />
                              </div>
                              <span className="data-label-primary">Relatório</span>
                            </div>

                            {/* Thumbnail */}
                            <div className="w-full aspect-video rounded-2xl overflow-hidden mb-4 border border-border-subtle bg-surface relative">
                              <Thumbnail
                                url={analysis.thumbnail_url}
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                              />
                            </div>

                            {/* Title */}
                            <h3 className="text-[15px] font-extrabold text-white mb-2 line-clamp-1 group-hover:text-primary transition-colors tracking-tight">
                              {analysis.title}
                            </h3>

                            {/* Date */}
                            <div className="flex items-center gap-2 text-[11px] text-gray-600 mb-4 font-mono">
                              <Calendar size={10} strokeWidth={1.5} />
                              {new Date(analysis.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </div>

                            {/* Preview */}
                            <div className="text-[14px] text-gray-400 line-clamp-2 leading-relaxed">
                              {(analysis.report_preview || '').substring(0, 120)}...
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ FLOATING BULK ACTION BAR ═══ */}
      <AnimatePresence>
        {hasSelection && !selectedAnalysis && !deleteConfirmOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-8 left-0 right-0 z-[80] flex justify-center items-center px-6 pointer-events-none"
            style={{ paddingLeft: collapsed ? 72 : 260 }}
          >
            <div className="pointer-events-auto flex items-center gap-2 pl-5 pr-2 py-2 rounded-full bg-[#16161a]/95 backdrop-blur-xl border border-white/[0.08] shadow-[0_20px_64px_rgba(0,0,0,0.55)]">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-glow-pulse" />
                <span className="text-[13px] font-bold text-white tracking-tight">
                  {selectedExports.length} {selectedExports.length === 1 ? 'selecionado' : 'selecionados'}
                </span>
              </div>

              <div className="w-px h-6 bg-white/[0.08] mx-1" />

              <button
                onClick={() => setSelectedExports([])}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-bold text-gray-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                title="Limpar seleção (Esc)"
              >
                <X size={13} strokeWidth={2.5} />
                Limpar
              </button>

              {/* Apagar · N (red) */}
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={deleting}
                className="flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold shadow-[0_0_24px_rgba(220,38,38,0.35)] transition-colors duration-200 disabled:opacity-60 disabled:pointer-events-none"
              >
                <Trash2 size={14} strokeWidth={2.5} />
                Apagar · {selectedExports.length}
              </button>

              {/* Exportar · N (blue) */}
              <button
                onClick={handleExportMarkdown}
                disabled={exporting}
                className="flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold shadow-[0_0_24px_rgba(37,99,235,0.35)] transition-colors duration-200 disabled:opacity-60 disabled:pointer-events-none"
              >
                {exporting
                  ? <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
                  : <Download size={14} strokeWidth={2.5} />
                }
                Exportar · {selectedExports.length}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
      <AnimatePresence>
        {deleteConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 backdrop-blur-md bg-black/60"
            onClick={() => !deleting && setDeleteConfirmOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md rounded-3xl bg-[#16161a] border border-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-7">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                    <AlertTriangle size={22} strokeWidth={2} className="text-red-400" />
                  </div>
                  <div className="flex-1 pt-1">
                    <h3 className="text-[17px] font-extrabold text-white tracking-tight leading-tight">
                      Apagar {selectedExports.length} {selectedExports.length === 1 ? 'análise' : 'análises'}?
                    </h3>
                    <p className="text-[13px] text-gray-400 mt-2 leading-relaxed">
                      Tem certeza que deseja apagar {selectedExports.length} {selectedExports.length === 1 ? 'análise' : 'análises'}?
                      Essa ação não pode ser desfeita.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-7">
                  <button
                    onClick={() => setDeleteConfirmOpen(false)}
                    disabled={deleting}
                    className="px-5 py-2.5 rounded-full text-[13px] font-bold text-gray-300 hover:text-white hover:bg-white/[0.05] transition-colors disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={deleting}
                    className="flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold shadow-[0_0_24px_rgba(220,38,38,0.35)] transition-colors duration-200 disabled:opacity-60 disabled:pointer-events-none"
                  >
                    {deleting
                      ? <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
                      : <Trash2 size={14} strokeWidth={2.5} />
                    }
                    {deleting ? 'Apagando...' : 'Apagar tudo'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Leitura */}
      {selectedAnalysis && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/50 animate-fade-in" onClick={() => setSelectedAnalysis(null)}>
          <div className="glass-raised w-full max-w-5xl h-[85vh] rounded-4xl flex flex-col relative overflow-hidden shadow-modal" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-7 border-b border-border-subtle flex justify-between items-center bg-surface/60">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/12 rounded-2xl border border-primary/15">
                  <LibraryIcon size={22} strokeWidth={1.5} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-white tracking-tight">{selectedAnalysis.title}</h2>
                  <p className="data-label mt-1">
                    #{selectedAnalysis.id} — {new Date(selectedAnalysis.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => downloadSingleReport(e, selectedAnalysis)}
                  className="btn-magnetic flex items-center gap-2 px-5 py-3 bg-blue-500/10 hover:bg-blue-500/15 text-blue-400 rounded-2xl text-xs font-bold uppercase tracking-wider border border-blue-500/15"
                >
                  <CloudDownload size={14} strokeWidth={2.5} /> Baixar
                </button>
                <button
                  onClick={() => setSelectedAnalysis(null)}
                  className="p-3 bg-white/5 hover:bg-white/8 rounded-2xl transition-colors text-gray-400 hover:text-white"
                >
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-background/40">
              <MarkdownRenderer className="max-w-4xl mx-auto">{selectedAnalysis.report_md}</MarkdownRenderer>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
};

export default Analyzer;
