import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import MarkdownRenderer from '../components/MarkdownRenderer';
import {
  Link as LinkIcon, Sparkles, Loader2, Download,
  Terminal, Activity, AlertCircle, Library as LibraryIcon,
  Calendar, FileText, Search, Trash2, CheckSquare, CloudDownload, X, Film
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useSidebar } from '../contexts/SidebarContext';
import { getAccessToken } from '../supabaseClient';
import Thumbnail from '../components/Thumbnail';
import useConfirm from '../hooks/useConfirm';
import useToast from '../hooks/useToast';

const API_URL = import.meta.env.VITE_API_URL;

const Transcriber = () => {
  const { collapsed } = useSidebar();
  const { confirm, ConfirmDialog } = useConfirm();
  const { toast, ToastContainer } = useToast();

  // === Estados de Upload & Transcrição ===
  const [progressTab, setProgressTab] = useState('status');
  const [links, setLinks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Iniciando...');
  const [logs, setLogs] = useState([]);
  const [taskId, setTaskId] = useState(null);
  const logEndRef = useRef(null);

  // === Estados da Biblioteca ===
  const [transcriptions, setTranscriptions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedTranscription, setSelectedTranscription] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedExports, setSelectedExports] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [cardSize, setCardSize] = useState(2);

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setSelectedTranscription(null);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (taskId) {
      const eventSource = new EventSource(`${API_URL}/transcribe/progress/${taskId}`);

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
          setLinks('');
          setProgress(0);
        }

        if (data.status === 'error') {
          setError(data.logs[data.logs.length - 1] || "Erro desconhecido na transcrição.");
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

  const handleTranscribe = async () => {
    const token = await getAccessToken();
    setError(null);
    setLoading(true);
    setProgress(0);
    setLogs([]);
    setStatusMessage('Enviando link...');

    try {
      const linkList = links.split('\n').map(l => l.trim()).filter(l => l);
      if (linkList.length === 0) throw new Error("Insira pelo menos um link do YouTube.");
      if (linkList.length > 3) throw new Error("O limite é de 3 links por transcrição.");

      const res = await axios.post(`${API_URL}/transcribe/links`, { links: linkList }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.taskId) setTaskId(res.data.taskId);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "Erro ao iniciar transcrição.");
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/transcribe/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTranscriptions(res.data);
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteUnit = async (e, id) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Excluir transcrição?',
      message: 'Essa transcrição será removida permanentemente. A ação não pode ser desfeita.',
      confirmText: 'Excluir',
      confirmColor: 'red',
    });
    if (!ok) return;
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/transcribe/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (selectedTranscription && selectedTranscription.id === id) {
        setSelectedTranscription(null);
      }
      fetchHistory();
    } catch (err) {
      console.error('Erro ao excluir:', err);
    }
  };

  const downloadSingleReport = (e, item) => {
    e.stopPropagation();
    const content = `-------------------\n${item.title}\n- ${item.summary || ''}\n-------------------\n\n${item.transcription_md}`;
    const element = document.createElement("a");
    const file = new Blob([content], { type: 'text/markdown' });
    element.href = URL.createObjectURL(file);
    element.download = `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(element);
    element.click();
  };

  const handleExportZip = async () => {
    if (selectedExports.length === 0) return;
    setExporting(true);
    try {
      const token = await getAccessToken();
      const res = await axios.post(`${API_URL}/transcribe/export`, {
        transcription_ids: selectedExports
      }, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'transcricoes_viralhub.zip');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setIsSelectMode(false);
      setSelectedExports([]);
    } catch (err) {
      console.error('Erro exportando:', err);
      toast.error({ title: 'Erro ao exportar', message: 'Não foi possível gerar o ZIP das transcrições.' });
    } finally {
      setExporting(false);
    }
  };

  const filteredTranscriptions = (transcriptions || []).filter(t =>
    (t.title && t.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (t.transcription_md && t.transcription_md.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const buildDisplayContent = (item) => {
    return `-------------------\n### ${item.title}\n- ${item.summary || ''}\n-------------------\n\n${item.transcription_md}`;
  };

  return (
    <div className="animate-fade-in relative min-h-screen transition-all duration-300" style={{ paddingLeft: collapsed ? 72 : 260 }}>
      {/* Ambient gradient */}
      <div className="fixed inset-0 pointer-events-none transition-all duration-300" style={{ marginLeft: collapsed ? 72 : 260, background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(55, 178, 77, 0.06) 0%, rgba(55, 178, 77, 0.02) 40%, transparent 70%)' }} />

      {/* SEÇÃO 1: Input */}
      <div className="max-w-4xl mx-auto pt-16 px-8 relative z-10">
        <div className="mb-12 stagger-children">
          <h2 className="text-4xl font-extrabold text-white tracking-tight">Vídeos Longos</h2>
          <p className="text-gray-500 mt-3 text-[15px] leading-relaxed max-w-lg">
            Transcritor de vídeos longos do YouTube. Cole o link e extraia a transcrição bruta completa do conteúdo em texto, sem análise — apenas o que foi falado, palavra por palavra.
          </p>
        </div>

        {/* Input Card */}
        <div className="glass-raised rounded-4xl p-8 relative overflow-hidden mb-16">
          {loading ? (
            <div className="relative z-10 flex flex-col items-center py-6">
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
                  <div className="relative w-40 h-40 mb-8">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                      <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/[0.04]" />
                      <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={502} strokeDashoffset={502 - (502 * progress) / 100} strokeLinecap="round" className="text-primary transition-all duration-700 ease-out" style={{ filter: 'drop-shadow(0 0 12px rgba(55, 178, 77, 0.5))' }} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-white font-mono tracking-tight">{progress}%</span>
                      <span className="data-label-primary mt-1">Transcrevendo</span>
                    </div>
                  </div>
                  <p className="text-gray-400 font-medium text-center text-sm animate-pulse max-w-xs">{statusMessage}</p>
                </div>
              ) : (
                <div className="w-full bg-surface border border-border-subtle rounded-2xl p-5 font-mono text-sm text-green-400/70 h-52 overflow-y-auto flex flex-col gap-1.5 custom-scrollbar">
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-gray-600 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                      <span>{log}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-red-500/10 rounded-xl">
                  <Film size={18} strokeWidth={1.5} className="text-red-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">YouTube</p>
                  <p className="text-gray-600 text-sm">Cole os links dos vídeos abaixo</p>
                </div>
              </div>

              <textarea
                value={links}
                onChange={(e) => setLinks(e.target.value)}
                className="input-field rounded-2xl p-5 resize-none w-full"
                rows="3"
                placeholder={"https://youtube.com/watch?v=...\nhttps://youtu.be/..."}
              />

              {error && (
                <div className="mt-5 p-4 bg-red-500/8 border border-red-500/15 text-red-400 rounded-2xl text-sm font-medium flex items-center gap-2.5 animate-fade-in">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              <button
                onClick={handleTranscribe}
                disabled={loading || links.trim() === ''}
                className="w-full mt-8 py-4 btn-white rounded-2xl flex justify-center items-center gap-2.5 text-sm disabled:opacity-40 disabled:pointer-events-none group"
              >
                <Sparkles size={16} strokeWidth={2.5} className="group-hover:text-primary transition-colors" />
                Transcrever Vídeo
              </button>
            </>
          )}
        </div>
      </div>

      {/* SEÇÃO 2: Biblioteca */}
      <div className="border-t border-border-subtle bg-surface/30 pt-20 pb-32 relative z-10">
        <div className="px-8 lg:px-12">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-14 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-glow-pulse" />
                <span className="data-label">Acervo de Transcrições</span>
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">Transcrições Salvas</h2>
              <p className="text-gray-500 text-sm mt-2">Busque e baixe transcrições completas.</p>
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

              {isSelectMode && selectedExports.length > 0 && (
                <button
                  onClick={handleExportZip}
                  disabled={exporting}
                  className="btn-magnetic flex items-center gap-2 px-4 py-2.5 bg-green-500/15 border border-green-500/20 text-green-400 rounded-2xl text-xs font-bold"
                >
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} strokeWidth={2.5} />} ZIP ({selectedExports.length})
                </button>
              )}

              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600" size={13} strokeWidth={2} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field rounded-2xl py-2.5 pl-10 pr-4 text-xs"
                  placeholder="Pesquisar transcrição..."
                />
              </div>

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

          {historyLoading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <Loader2 className="animate-spin text-primary" size={28} />
              <p className="text-gray-600 text-sm animate-pulse font-mono tracking-wide">Sincronizando acervo...</p>
            </div>
          ) : filteredTranscriptions.length === 0 ? (
            <div className="glass rounded-3xl p-20 text-center border-dashed border-2 border-border-subtle">
              <div className="inline-flex p-6 bg-white/[0.03] rounded-3xl mb-6">
                <LibraryIcon size={40} strokeWidth={1.5} className="text-gray-700" />
              </div>
              <p className="text-gray-400 font-semibold text-sm">Nenhuma transcrição ainda.</p>
              <p className="text-sm text-gray-600 mt-1.5">Cole um link do YouTube acima para começar.</p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 ${
              cardSize === 0 ? 'lg:grid-cols-4 xl:grid-cols-6' :
              cardSize === 1 ? 'lg:grid-cols-3 xl:grid-cols-5' :
              'lg:grid-cols-3 xl:grid-cols-4'
            }`}>
              {filteredTranscriptions.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => {
                    if (isSelectMode) {
                      setSelectedExports(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]);
                    } else {
                      setSelectedTranscription(item);
                    }
                  }}
                  className={`glass lift rounded-3xl p-5 transition-all cursor-pointer relative overflow-hidden group ${
                    selectedExports.includes(item.id)
                    ? 'border-primary/30 glow-primary bg-primary/5'
                    : 'hover:border-border-hover'
                  }`}
                >
                  {isSelectMode && (
                    <div className={`absolute top-4 left-4 z-10 w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                      selectedExports.includes(item.id) ? 'bg-primary border-primary text-white' : 'border-white/15 bg-black/40'
                    }`}>
                      {selectedExports.includes(item.id) && <CheckSquare size={11} />}
                    </div>
                  )}

                  <div className="absolute top-0 right-0 p-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {!isSelectMode && (
                      <>
                        <button
                          onClick={(e) => downloadSingleReport(e, item)}
                          className="p-2 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl text-blue-400 transition-all btn-ghost"
                          title="Baixar Markdown"
                        >
                          <CloudDownload size={13} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteUnit(e, item.id)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-400 transition-all btn-ghost"
                          title="Excluir"
                        >
                          <Trash2 size={13} strokeWidth={2.5} />
                        </button>
                      </>
                    )}
                  </div>

                  <div className={`flex items-center gap-2 mb-3.5 ${isSelectMode ? 'ml-7' : ''}`}>
                    <div className="p-1.5 bg-red-500/10 rounded-xl">
                      <Film size={13} strokeWidth={1.5} className="text-red-400" />
                    </div>
                    <span className="data-label text-red-400/80">Transcrição</span>
                  </div>

                  <div className="w-full aspect-video rounded-2xl overflow-hidden mb-4 border border-border-subtle bg-surface relative">
                    <Thumbnail
                      url={item.thumbnail_url}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                    />
                  </div>

                  <h3 className="text-[15px] font-extrabold text-white mb-2 line-clamp-2 group-hover:text-primary transition-colors tracking-tight">
                    {item.title}
                  </h3>

                  <div className="flex items-center gap-2 text-[11px] text-gray-600 mb-4 font-mono">
                    <Calendar size={10} strokeWidth={1.5} />
                    {new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>

                  <div className="text-[14px] text-gray-400 line-clamp-2 leading-relaxed">
                    {item.summary || (item.transcription_md && item.transcription_md.substring(0, 120) + '...')}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Leitura */}
      {selectedTranscription && !isSelectMode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/50 animate-fade-in" onClick={() => setSelectedTranscription(null)}>
          <div className="glass-raised w-full max-w-5xl h-[85vh] rounded-4xl flex flex-col relative overflow-hidden shadow-modal" onClick={(e) => e.stopPropagation()}>
            <div className="p-7 border-b border-border-subtle flex justify-between items-center bg-surface/60">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/12 rounded-2xl border border-red-500/15">
                  <Film size={22} strokeWidth={1.5} className="text-red-400" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-white tracking-tight">{selectedTranscription.title}</h2>
                  <p className="data-label mt-1">
                    #{selectedTranscription.id} — {new Date(selectedTranscription.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => downloadSingleReport(e, selectedTranscription)}
                  className="btn-magnetic flex items-center gap-2 px-5 py-3 bg-blue-500/10 hover:bg-blue-500/15 text-blue-400 rounded-2xl text-xs font-bold uppercase tracking-wider border border-blue-500/15"
                >
                  <CloudDownload size={14} strokeWidth={2.5} /> Baixar
                </button>
                <button
                  onClick={() => setSelectedTranscription(null)}
                  className="p-3 bg-white/5 hover:bg-white/8 rounded-2xl transition-colors text-gray-400 hover:text-white"
                >
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-background/40">
              <MarkdownRenderer className="max-w-4xl mx-auto">{buildDisplayContent(selectedTranscription)}</MarkdownRenderer>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog />
      <ToastContainer />
    </div>
  );
};

export default Transcriber;
