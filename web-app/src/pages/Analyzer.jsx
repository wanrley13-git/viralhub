import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import MarkdownRenderer from '../components/MarkdownRenderer';
import {
  Upload, Link as LinkIcon, FileVideo, Sparkles, Loader2, Download,
  Terminal, Activity, AlertCircle, Library as LibraryIcon,
  Calendar, FileText, Search, Trash2, CheckSquare, Square, CloudDownload, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { useSidebar } from '../contexts/SidebarContext';
import { getAccessToken } from '../supabaseClient';
import Thumbnail from '../components/Thumbnail';

const API_URL = import.meta.env.VITE_API_URL;

const Analyzer = () => {
  const { collapsed } = useSidebar();
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
  const logEndRef = useRef(null);

  // === Estados da Biblioteca ===
  const [analyses, setAnalyses] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedExports, setSelectedExports] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [cardSize, setCardSize] = useState(2); // 0=small(6cols), 1=medium(5cols), 2=large(4cols)

  useEffect(() => {
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
  }, []);

  // Close modals on ESC / deselect all when in bulk-select mode
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key !== 'Escape') return;
      // Priority: close reading modal first if open
      if (selectedAnalysis) {
        setSelectedAnalysis(null);
        return;
      }
      // Otherwise, if in select mode with items selected, clear the selection
      if (isSelectMode && selectedExports.length > 0) {
        setSelectedExports([]);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [selectedAnalysis, isSelectMode, selectedExports.length]);

  useEffect(() => {
    if (taskId) {
      const eventSource = new EventSource(`${API_URL}/analyze/progress/${taskId}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data.progress || 0);
        setLogs(data.logs || []);

        if (data.logs && data.logs.length > 0) {
          setStatusMessage(data.logs[data.logs.length - 1]);
        }

        if (data.status === 'completed') {
          setLoading(false);
          setTaskId(null);
          eventSource.close();
          fetchHistory();
          setFiles([]);
          setLinks('');
          setProgress(0);
        }

        if (data.status === 'error') {
          setError(data.logs[data.logs.length - 1] || "Erro desconhecido na análise.");
          setLoading(false);
          setTaskId(null);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setError("Erro na conexão com o servidor de progresso.");
        setLoading(false);
        setTaskId(null);
        eventSource.close();
      };

      return () => eventSource.close();
    }
  }, [taskId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        if (files.length > 20) throw new Error("O limite atual é de 20 arquivos por análise.");

        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        res = await axios.post(`${API_URL}/analyze/files`, formData, {
          ...config,
          headers: { ...config.headers, 'Content-Type': 'multipart/form-data' }
        });
      } else {
        const linkList = links.split('\n').map(l => l.trim()).filter(l => l);
        if (linkList.length === 0) throw new Error("Insira pelo menos um link.");
        if (linkList.length > 20) throw new Error("O limite atual é de 20 links por análise.");
        res = await axios.post(`${API_URL}/analyze/links`, { links: linkList }, config);
      }
      if (res.data.taskId) setTaskId(res.data.taskId);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "Erro ao iniciar análise.");
      setLoading(false);
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

  const handleDeleteUnit = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Excluir permanentemente este relatório?')) return;
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/analyze/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (selectedAnalysis && selectedAnalysis.id === id) {
          setSelectedAnalysis(null);
      }
      fetchHistory();
    } catch (err) {
      console.error('Erro ao excluir:', err);
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
  const handleExportMarkdown = () => {
    if (selectedExports.length === 0) return;
    setExporting(true);
    try {
      // Preserve the order in which reports are displayed on screen
      // (most recent first) rather than click-order, so the exported
      // file feels chronological.
      const idSet = new Set(selectedExports);
      const picked = (analyses || []).filter(a => idSet.has(a.id));

      const today = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
      });

      const header =
`# Análises Exportadas — ViralHub
Data: ${today}
Total: ${picked.length} ${picked.length === 1 ? 'análise' : 'análises'}

---

`;

      const body = picked.map((a, i) => {
        const title = (a.title || `Análise #${a.id}`).trim();
        const content = (a.report_md || '').trim();
        return `## ${i + 1}. ${title}\n\n${content}`;
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

      setIsSelectMode(false);
      setSelectedExports([]);
    } catch (err) {
      console.error('Erro exportando:', err);
      alert('Erro ao exportar relatórios.');
    } finally {
      setExporting(false);
    }
  };

  const filteredAnalyses = (analyses || []).filter(a =>
    (a.title && a.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (a.report_md && a.report_md.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // "Selecionar todos" / "Desmarcar todos" toggle over the currently
  // visible (post-search) list of analyses.
  const visibleIds = filteredAnalyses.map(a => a.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedExports.includes(id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      // Deselect only the visible ones, preserve any hidden-but-selected
      // (e.g. cards currently filtered out by search).
      setSelectedExports(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedExports(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

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
                <div className="w-full bg-surface border border-border-subtle rounded-2xl p-5 font-mono text-sm text-green-400/70 h-52 overflow-y-auto flex flex-col gap-1.5 custom-scrollbar">
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-gray-600 shrink-0">[{new Date().toLocaleTimeString([], {hour12: false})}]</span>
                      <span>{log}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
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
                          <p className="text-sm text-gray-600 font-mono tracking-wide">.mp4, .mov, .zip — Máx: 20 por operação</p>
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
                    <p className="text-sm text-gray-600 font-mono tracking-wide text-center">Copie e cole o link de até 20 vídeos do Instagram, Shorts ou TikTok</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-5 p-4 bg-red-500/8 border border-red-500/15 text-red-400 rounded-2xl text-sm font-medium flex items-center gap-2.5 animate-fade-in">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              <button
                onClick={handleAnalyze}
                disabled={loading || taskId || (activeTab === 'upload' ? files.length === 0 : links.trim() === '')}
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
              <button
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setSelectedExports([]);
                }}
                className={`btn-magnetic flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  isSelectMode
                    ? 'bg-primary/15 text-primary border border-primary/20'
                    : 'bg-surface-flat text-gray-400 hover:text-white border border-border-subtle hover:border-border-hover'
                }`}
              >
                <CheckSquare size={14} strokeWidth={2.5} /> {isSelectMode ? 'Cancelar' : 'Ação em Lote'}
              </button>

              {isSelectMode && visibleIds.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className={`btn-magnetic flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                    allVisibleSelected
                      ? 'bg-primary/15 text-primary border border-primary/20'
                      : 'bg-surface-flat text-gray-400 hover:text-white border border-border-subtle hover:border-border-hover'
                  }`}
                >
                  {allVisibleSelected
                    ? <CheckSquare size={14} strokeWidth={2.5} />
                    : <Square size={14} strokeWidth={2.5} />
                  }
                  {allVisibleSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              )}

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
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 ${
              cardSize === 0 ? 'lg:grid-cols-4 xl:grid-cols-6' :
              cardSize === 1 ? 'lg:grid-cols-3 xl:grid-cols-5' :
              'lg:grid-cols-3 xl:grid-cols-4'
            }`}>
              {filteredAnalyses.map((analysis, idx) => (
                <motion.div
                  key={analysis.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => {
                    if (isSelectMode) {
                      setSelectedExports(prev => prev.includes(analysis.id) ? prev.filter(id => id !== analysis.id) : [...prev, analysis.id]);
                    } else {
                      setSelectedAnalysis(analysis);
                    }
                  }}
                  className={`glass lift rounded-3xl p-5 transition-all cursor-pointer relative overflow-hidden group ${
                    selectedExports.includes(analysis.id)
                    ? 'border-primary/30 glow-primary bg-primary/5'
                    : 'hover:border-border-hover'
                  }`}
                >
                  {/* Select checkbox */}
                  {isSelectMode && (
                    <div className={`absolute top-4 left-4 z-10 w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                      selectedExports.includes(analysis.id) ? 'bg-primary border-primary text-white' : 'border-white/15 bg-black/40'
                    }`}>
                      {selectedExports.includes(analysis.id) && <CheckSquare size={11} />}
                    </div>
                  )}

                  {/* Hover actions */}
                  <div className="absolute top-0 right-0 p-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {!isSelectMode && (
                      <>
                        <button
                          onClick={(e) => downloadSingleReport(e, analysis)}
                          className="p-2 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl text-blue-400 transition-all btn-ghost"
                          title="Baixar Markdown"
                        >
                          <CloudDownload size={13} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteUnit(e, analysis.id)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-400 transition-all btn-ghost"
                          title="Excluir"
                        >
                          <Trash2 size={13} strokeWidth={2.5} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Card type label */}
                  <div className={`flex items-center gap-2 mb-3.5 ${isSelectMode ? 'ml-7' : ''}`}>
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
                    {analysis.report_md.substring(0, 120)}...
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ FLOATING BULK EXPORT BAR ═══ */}
      <AnimatePresence>
        {isSelectMode && selectedExports.length > 0 && !selectedAnalysis && (
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

              <button
                onClick={handleExportMarkdown}
                disabled={exporting}
                className="flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-white text-[13px] font-bold shadow-[0_0_24px_rgba(55,178,77,0.35)] transition-colors duration-200 disabled:opacity-60 disabled:pointer-events-none"
              >
                {exporting
                  ? <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
                  : <Download size={14} strokeWidth={2.5} />
                }
                Exportar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Leitura */}
      {selectedAnalysis && !isSelectMode && (
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

    </div>
  );
};

export default Analyzer;
