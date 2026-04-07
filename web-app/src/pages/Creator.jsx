import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles,
  Send,
  Loader2,
  Library,
  CheckCircle2,
  MessageSquarePlus,
  MessageSquare,
  X,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  BookOpen,
  ChevronDown,
  Plus,
  Download,
  Search,
  FileText,
  Eye,
  Mic,
  Upload,
  Link as LinkIcon,
  FileVideo,
  AlertCircle,
  ImagePlus,
  ArrowUp,
  Star,
  Film
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useSidebar } from '../contexts/SidebarContext';
import ImageLightbox from '../components/ImageLightbox';
import { getAccessToken } from '../supabaseClient';
import { resolveThumbnailUrl } from '../components/Thumbnail';

const API_URL = import.meta.env.VITE_API_URL;

// Strip emojis from message content, keeping them only in markdown headings
const stripEmojis = (text) => {
  if (!text) return text;
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
  return text.split('\n').map(line => {
    if (line.trimStart().startsWith('#')) return line;
    return line.replace(emojiRegex, '');
  }).join('\n');
};

const Creator = () => {
  const { collapsed } = useSidebar();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [transcriptions, setTranscriptions] = useState([]);
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionModalOpen, setMentionModalOpen] = useState(false);
  const [mentionModalTab, setMentionModalTab] = useState('short');
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [selectedKBId, setSelectedKBId] = useState(null);
  // KB Popup
  const [kbPopupOpen, setKbPopupOpen] = useState(false);
  const [kbPopupTab, setKbPopupTab] = useState('bases'); // 'bases' | 'create' | 'view'
  const [kbAllBases, setKbAllBases] = useState([]);
  const [kbEditName, setKbEditName] = useState('');
  const [kbEditId, setKbEditId] = useState(null);
  const [kbSelectedIds, setKbSelectedIds] = useState([]);
  const [kbCompiling, setKbCompiling] = useState(false);
  const [kbSearchTerm, setKbSearchTerm] = useState('');
  const [kbSaved, setKbSaved] = useState(false);
  const [kbOriginalIds, setKbOriginalIds] = useState([]);
  const [kbViewingBase, setKbViewingBase] = useState(null);

  // Tone states
  const [tones, setTones] = useState([]);
  const [selectedToneId, setSelectedToneId] = useState(null);
  const [toneTab, setToneTab] = useState('upload'); // 'upload' | 'link'
  const [toneLinks, setToneLinks] = useState('');
  const [toneFiles, setToneFiles] = useState([]);
  const [toneName, setToneName] = useState('');
  const [toneLoading, setToneLoading] = useState(false);
  const [toneError, setToneError] = useState(null);
  const [toneProgress, setToneProgress] = useState(0);
  const [toneLogs, setToneLogs] = useState([]);
  const [toneTaskId, setToneTaskId] = useState(null);
  const [toneViewingId, setToneViewingId] = useState(null);
  const [toneNotes, setToneNotes] = useState('');
  const [toneCreating, setToneCreating] = useState(false);

  // Image upload states
  const [chatImage, setChatImage] = useState(null); // { file, preview, url }
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const chatImageInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  // Favorites & user
  const [favoriteSessions, setFavoriteSessions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('viralhub_fav_sessions') || '[]'); } catch { return []; }
  });
  const [userName, setUserName] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');

  const chatEndRef = useRef(null);

  const toggleFavorite = (sessionId) => {
    setFavoriteSessions(prev => {
      const next = prev.includes(sessionId) ? prev.filter(id => id !== sessionId) : [...prev, sessionId];
      localStorage.setItem('viralhub_fav_sessions', JSON.stringify(next));
      return next;
    });
  };

  // Group sessions by time
  const groupSessions = (list) => {
    const groups = { favorites: [], recentes: [] };
    list.forEach(s => {
      if (favoriteSessions.includes(s.id)) { groups.favorites.push(s); return; }
      groups.recentes.push(s);
    });
    return groups;
  };

  useEffect(() => {
    fetchSessions();
    fetchTasks();
    fetchHistory();
    fetchTranscriptions();
    fetchKnowledgeBases();
    fetchTones();
    // Get user name from email
    const fetchUser = async () => {
      try {
        const storedName = localStorage.getItem('viralhub_user_name');
        if (storedName) { setUserName(storedName); return; }
        const token = await getAccessToken();
        const res = await axios.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        const email = res.data.email || '';
        const raw = email.split('@')[0].replace(/[._-]/g, ' ');
        setUserName(raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      } catch { setUserName(''); }
    };
    fetchUser();
  }, []);

  // Close popups on ESC
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setKbPopupOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  const fetchKnowledgeBases = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/knowledge/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const compiled = res.data.filter(kb => kb.compiled_md && kb.is_stale === 0);
      setKnowledgeBases(compiled);
      setKbAllBases(res.data);
      if (!selectedKBId && compiled.length > 0) {
        setSelectedKBId(compiled[0].id);
      }
    } catch (err) { console.error('Erro buscando bases:', err); }
  };

  // ── KB Popup actions ──
  const openKBPopup = () => {
    setKbPopupOpen(true);
    setKbPopupTab('bases');
    setKbSearchTerm('');
    fetchKnowledgeBases();
  };

  const openKBCreate = (base = null) => {
    const ids = base?.selected_ids || [];
    setKbEditId(base?.id || null);
    setKbEditName(base?.name || '');
    setKbSelectedIds(ids);
    setKbOriginalIds(ids);
    setKbPopupTab('create');
    setKbSearchTerm('');
  };

  const toggleKBSelect = (id) => {
    setKbSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 30) return prev;
      return [...prev, id];
    });
  };

  const handleKBSave = async () => {
    const token = await getAccessToken();
    const finalKbName = kbEditName.trim() || 'Nova Base';
    try {
      let kbId = kbEditId;
      if (!kbId) {
        const res = await axios.post(`${API_URL}/knowledge/`, { name: finalKbName }, { headers: { Authorization: `Bearer ${token}` } });
        kbId = res.data.id;
        setKbEditId(kbId);
      } else {
        await axios.patch(`${API_URL}/knowledge/${kbId}`, { name: finalKbName }, { headers: { Authorization: `Bearer ${token}` } });
      }
      await axios.put(`${API_URL}/knowledge/${kbId}/selection`, { selected_ids: kbSelectedIds }, { headers: { Authorization: `Bearer ${token}` } });
      await fetchKnowledgeBases();
      setKbSaved(true);
      setTimeout(() => setKbSaved(false), 2000);
    } catch (err) { console.error('Erro ao salvar KB:', err); }
  };

  const handleKBCompile = async () => {
    await handleKBSave();
    const kbId = kbEditId;
    if (!kbId || kbSelectedIds.length === 0) return;
    setKbCompiling(true);
    try {
      const token = await getAccessToken();
      await axios.post(`${API_URL}/knowledge/${kbId}/compile`, {}, { headers: { Authorization: `Bearer ${token}` } });
      await fetchKnowledgeBases();
      setSelectedKBId(kbId);
      setKbPopupTab('bases');
    } catch (err) { console.error('Erro ao compilar:', err); }
    finally { setKbCompiling(false); }
  };

  const handleKBDelete = async (kbId) => {
    if (!window.confirm('Excluir esta base?')) return;
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/knowledge/${kbId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (selectedKBId === kbId) setSelectedKBId(null);
      await fetchKnowledgeBases();
    } catch (err) { console.error(err); }
  };

  const handleKBExport = (kb) => {
    const blob = new Blob([kb.compiled_md || ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kb.name.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Tone functions ──
  const fetchTones = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/tone/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTones(res.data);
    } catch (err) { console.error('Erro buscando tons:', err); }
  };

  const toneDropzone = useDropzone({
    onDrop: (accepted) => setToneFiles(accepted),
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'] },
    maxFiles: 10,
  });

  // SSE para progresso do tom
  useEffect(() => {
    if (!toneTaskId) return;
    const es = new EventSource(`${API_URL}/tone/progress/${toneTaskId}`);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setToneProgress(data.progress || 0);
      setToneLogs(data.logs || []);
      if (data.status === 'completed') {
        setToneLoading(false);
        setToneCreating(false);
        setToneTaskId(null);
        es.close();
        fetchTones();
        setToneFiles([]);
        setToneLinks('');
        setToneProgress(0);
        setToneName('');
        setToneNotes('');
      }
      if (data.status === 'error') {
        setToneError(data.logs?.[data.logs.length - 1] || 'Erro desconhecido.');
        setToneLoading(false);
        setToneTaskId(null);
        es.close();
      }
    };
    es.onerror = () => {
      setToneError('Erro na conexão com o servidor.');
      setToneLoading(false);
      setToneTaskId(null);
      es.close();
    };
    return () => es.close();
  }, [toneTaskId]);

  const handleToneAnalyze = async () => {
    const token = await getAccessToken();
    setToneError(null);
    setToneLoading(true);
    setToneProgress(0);
    setToneLogs([]);

    try {
      const finalToneName = toneName.trim() || 'Novo Tom';
      let res;
      if (toneTab === 'upload') {
        if (toneFiles.length === 0) throw new Error('Anexe pelo menos um vídeo.');
        const formData = new FormData();
        toneFiles.forEach(f => formData.append('files', f));
        formData.append('name', finalToneName);
        formData.append('notes', toneNotes);
        res = await axios.post(`${API_URL}/tone/files`, formData, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
        });
      } else {
        const linkList = toneLinks.split('\n').map(l => l.trim()).filter(l => l);
        if (linkList.length === 0) throw new Error('Insira pelo menos um link.');
        if (linkList.length > 5) throw new Error('Máximo de 5 links.');
        res = await axios.post(`${API_URL}/tone/links`, { links: linkList, name: finalToneName, notes: toneNotes }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      if (res.data.taskId) setToneTaskId(res.data.taskId);
    } catch (err) {
      setToneError(err.response?.data?.detail || err.message || 'Erro ao iniciar análise de tom.');
      setToneLoading(false);
    }
  };

  const handleToneDelete = async (id) => {
    if (!window.confirm('Excluir este tom?')) return;
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/tone/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (selectedToneId === id) setSelectedToneId(null);
      fetchTones();
    } catch (err) { console.error(err); }
  };

  const handleToneExport = (tone) => {
    const blob = new Blob([tone.tone_md || ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tom_${tone.name.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchHistory = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/analyze/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAnalyses(res.data);
    } catch (err) { console.error('Erro buscando biblioteca:', err); }
  };

  const fetchTranscriptions = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/transcribe/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTranscriptions(res.data);
    } catch (err) { console.error('Erro buscando transcrições:', err); }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSessions = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/creator/sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSessions(res.data);
    } catch (err) { console.error('Erro buscando sessões:', err); }
  };

  const loadSession = async (sessionId) => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/creator/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const formatted = res.data.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        suggestion: m.has_suggestion ? JSON.parse(m.suggestion_json) : null,
        added: m.task_added === 1
      }));
      setMessages(formatted);
      setCurrentSessionId(sessionId);
    } catch (err) { console.error('Erro buscando mensagens:', err); }
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
  };

  const handleRenameSession = async (sessionId) => {
    if (!renameValue.trim()) return;
    try {
      const token = await getAccessToken();
      await axios.patch(`${API_URL}/creator/sessions/${sessionId}`, {
        title: renameValue.trim()
      }, { headers: { Authorization: `Bearer ${token}` } });
      setRenamingId(null);
      setRenameValue('');
      fetchSessions();
    } catch (err) { console.error('Erro ao renomear:', err); }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Excluir este chat permanentemente?')) return;
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/creator/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
      setMenuOpenId(null);
      fetchSessions();
    } catch (err) { console.error('Erro ao excluir:', err); }
  };

  const fetchTasks = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/tasks/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTasks(res.data);
    } catch (err) { console.error(err); }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types?.includes('Files')) setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const preview = URL.createObjectURL(file);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API_URL}/uploads/image`, formData);
      setChatImage({ file, preview, url: res.data.url });
    } catch (err) {
      console.error('Erro ao enviar imagem:', err);
      URL.revokeObjectURL(preview);
    }
  };

  const handleChatImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const preview = URL.createObjectURL(file);
    // Upload immediately
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API_URL}/uploads/image`, formData);
      setChatImage({ file, preview, url: res.data.url });
    } catch (err) {
      console.error('Erro ao enviar imagem:', err);
      URL.revokeObjectURL(preview);
    }
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!input.trim() && selectedMentions.length === 0 && !chatImage) return;
    if (loading) return;

    const finalMessage = input.trim() + " " + selectedMentions.map(m => `@${m.id}`).join(" ");
    const userMessage = { role: 'user', content: input.trim(), image: chatImage ? `${API_URL}${chatImage.url}` : null };
    setMessages(prev => [...prev, userMessage]);

    setInput('');
    setSelectedMentions([]);
    setChatImage(null);
    setLoading(true);

    try {
      const token = await getAccessToken();
      const res = await axios.post(`${API_URL}/creator/chat`, {
        message: finalMessage,
        session_id: currentSessionId,
        knowledge_base_id: selectedKBId || null,
        tone_id: selectedToneId || null
      }, { headers: { Authorization: `Bearer ${token}` } });

      const botMessage = {
        role: 'model',
        content: res.data.response,
        suggestion: res.data.suggested_task
      };
      setMessages(prev => [...prev, botMessage]);

      if (!currentSessionId) {
        setCurrentSessionId(res.data.session_id);
        fetchSessions();
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', content: "Erro na conexão com a IA Studio." }]);
    } finally {
      setLoading(false);
    }
  };

  const saveToKanban = async (suggestedTask) => {
    try {
      const token = await getAccessToken();
      await axios.post(`${API_URL}/tasks/`, {
        title: suggestedTask.title,
        content_md: suggestedTask.content,
        tag: suggestedTask.tag,
        status: 'todo',
        thumbnail_url: suggestedTask.thumbnail_url
      }, { headers: { Authorization: `Bearer ${token}` } });

      fetchTasks();
      setMessages(messages.map(m => m.suggestion === suggestedTask ? { ...m, suggestion: null, added: true } : m));
    } catch (err) { console.error(err); }
  };

  const grouped = groupSessions(sessions);
  const filteredSessions = (list) => {
    if (!sidebarSearch.trim()) return list;
    const q = sidebarSearch.toLowerCase();
    return list.filter(s => s.title.toLowerCase().includes(q));
  };

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const isFavorited = currentSessionId && favoriteSessions.includes(currentSessionId);

  // ── Render a session group section ──
  const renderSessionGroup = (label, list) => {
    const filtered = filteredSessions(list);
    if (filtered.length === 0) return null;
    return (
      <div key={label} className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 px-2 mt-5 mb-1.5">{label}</p>
        {filtered.map(s => (
          <div key={s.id} className="relative group">
            {renamingId === s.id ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSession(s.id);
                    if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                  }}
                  className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-white focus:outline-none"
                />
                <button onClick={() => handleRenameSession(s.id)} className="p-1 text-green-400 hover:bg-green-400/10 rounded-lg"><Check size={12} strokeWidth={2.5} /></button>
                <button onClick={() => { setRenamingId(null); setRenameValue(''); }} className="p-1 text-gray-500 hover:bg-white/5 rounded-lg"><X size={12} strokeWidth={2.5} /></button>
              </div>
            ) : (
              <button
                onClick={() => { loadSession(s.id); setMenuOpenId(null); }}
                className={`w-full text-left px-3 py-2 rounded-xl transition-all text-[14px] flex items-center gap-2.5 ${
                  currentSessionId === s.id
                    ? 'bg-white/[0.06] text-white'
                    : 'text-[#60606C] hover:bg-white/[0.03] hover:text-gray-300'
                }`}
              >
                <MessageSquare size={14} className={`shrink-0 ${currentSessionId === s.id ? 'text-[#34A94B]' : 'text-[#60606C]'}`} />
                <span className="truncate flex-1">{s.title}</span>
                <span
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === s.id ? null : s.id); }}
                  className="shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all text-gray-600 hover:text-white"
                >
                  <MoreHorizontal size={12} />
                </span>
              </button>
            )}

            {menuOpenId === s.id && renamingId !== s.id && (
              <div className="absolute right-2 top-full mt-1 z-50 bg-[#1a1a1f] border border-white/[0.06] rounded-xl py-1 min-w-[140px] animate-fade-in shadow-lg">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); setMenuOpenId(null); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-gray-400 hover:bg-white/[0.04] hover:text-white transition-colors"
                >
                  <Star size={11} strokeWidth={1.5} className={favoriteSessions.includes(s.id) ? 'fill-yellow-400 text-yellow-400' : ''} />
                  {favoriteSessions.includes(s.id) ? 'Desfavoritar' : 'Favoritar'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setRenamingId(s.id); setRenameValue(s.title); setMenuOpenId(null); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-gray-400 hover:bg-white/[0.04] hover:text-white transition-colors"
                >
                  <Pencil size={11} strokeWidth={2.5} /> Renomear
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-red-400/70 hover:bg-red-400/[0.06] hover:text-red-400 transition-colors"
                >
                  <Trash2 size={11} strokeWidth={2.5} /> Excluir
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // ── Chat input bar component ──
  const renderInputBar = () => (
    <form onSubmit={handleChat} className="bg-[#18181B] rounded-[17px] flex flex-col gap-3 px-5 py-4 shadow-lg relative">
      {/* Row 1: mentions + text input */}
      <div className="flex items-start gap-2 flex-wrap">
        {/* Image thumbnail preview */}
        {chatImage && (
          <div className="relative shrink-0 animate-fade-in">
            <div
              className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 cursor-zoom-in"
              onClick={(e) => { e.preventDefault(); setLightboxSrc(chatImage.preview); }}
            >
              <img src={chatImage.preview} alt="" className="w-full h-full object-cover" />
            </div>
            <button
              type="button"
              onClick={() => { URL.revokeObjectURL(chatImage.preview); setChatImage(null); }}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center transition-colors"
            >
              <X size={8} strokeWidth={2.5} className="text-white" />
            </button>
          </div>
        )}

        {/* Mention badges */}
        {selectedMentions.map((m, idx) => (
          <div key={idx} className="flex items-center gap-1.5 bg-primary/12 text-primary px-2.5 py-1 rounded-md text-[11px] font-bold shrink-0 animate-fade-in border border-primary/15">
            {m.thumbnail_url && <img src={resolveThumbnailUrl(m.thumbnail_url)} className="w-3.5 h-3.5 rounded object-cover"/>}
            <span className="truncate max-w-[100px]">{m.title}</span>
            <button
              type="button"
              onClick={() => setSelectedMentions(prev => prev.filter(x => x.id !== m.id))}
              className="hover:text-white transition-colors bg-black/20 rounded-full p-0.5"
            >
              <X size={9} strokeWidth={2.5} />
            </button>
          </div>
        ))}

        <input
          value={input}
          onChange={(e) => {
            const val = e.target.value;
            setInput(val);
            const match = val.match(/(?:^|\s)@([^\s]*)$/);
            if (match) {
              setMentionQuery(match[1]);
              setShowMention(true);
            } else {
              setShowMention(false);
            }
          }}
          className="flex-1 min-w-[100px] bg-transparent border-none focus:outline-none focus:ring-0 text-white text-sm"
          placeholder={selectedMentions.length > 0 ? "Adicione instruções..." : "Digite @ para selecionar um vídeo específico"}
        />
      </div>

      {/* Row 2: actions bar */}
      <div className="flex items-center gap-2">
        {/* [+] Button */}
        <button
          type="button"
          onClick={() => chatImageInputRef.current?.click()}
          className="w-8 h-8 rounded-lg hover:bg-white/[0.06] transition-all flex items-center justify-center text-gray-500 hover:text-white shrink-0"
          title="Enviar imagem"
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>

        {/* Hidden image input */}
        <input
          ref={chatImageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChatImageSelect}
        />

        {/* Base / Tom button */}
        <button
          type="button"
          onClick={openKBPopup}
          className="flex items-center gap-1.5 px-2.5 py-1 text-sm text-gray-500 hover:text-gray-300 transition-colors shrink-0 whitespace-nowrap"
        >
          Base / Tom <ChevronDown size={13} />
        </button>

        <div className="flex-1" />

        {/* Send button - green square with arrow */}
        <button
          type="submit"
          disabled={loading || (!input.trim() && !chatImage)}
          className="w-7 h-7 rounded-[6px] bg-[#34A94B] hover:bg-[#3bbe55] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all shrink-0"
        >
          {loading ? <Loader2 className="animate-spin text-white" size={13} strokeWidth={2.5} /> : <ArrowUp size={15} strokeWidth={2.5} className="text-white" />}
        </button>
      </div>

      {/* Mention Popup */}
      {showMention && (() => {
        const q = mentionQuery.toLowerCase();
        const filteredShort = analyses.filter(a => a.title.toLowerCase().includes(q) || String(a.id).includes(q));
        const filteredLong = transcriptions.filter(t => (t.title || '').toLowerCase().includes(q) || String(t.id).includes(q));
        const hasResults = filteredShort.length > 0 || filteredLong.length > 0;
        const LIMIT = 5;

        const selectItem = (item, keyPrefix) => {
          setSelectedMentions(prev => {
            if (!prev.find(m => m.id === item.id && m._type === keyPrefix)) return [...prev, { ...item, _type: keyPrefix }];
            return prev;
          });
          const newVal = input.replace(/(?:^|\s)@[^\s]*$/, ' ');
          setInput(newVal);
          setShowMention(false);
          setMentionModalOpen(false);
        };

        const renderItem = (item, keyPrefix) => (
          <button
            key={`${keyPrefix}-${item.id}`}
            type="button"
            onClick={() => selectItem(item, keyPrefix)}
            className="w-full text-left py-1.5 px-3 hover:bg-white/[0.04] rounded-xl transition-colors flex items-center gap-3 text-sm text-gray-300"
          >
            <div className="w-8 h-8 rounded-lg bg-surface border border-border-subtle overflow-hidden shrink-0">
              {item.thumbnail_url && <img src={resolveThumbnailUrl(item.thumbnail_url)} className="w-full h-full object-cover" />}
            </div>
            <div className="truncate">
              <p className="font-semibold text-white truncate text-[13px]">{item.title}</p>
              <p className="font-mono text-[10px] text-gray-600">ID: {item.id}</p>
            </div>
          </button>
        );

        return (
          <div className="absolute bottom-full mb-3 left-0 right-0 glass-raised rounded-2xl overflow-hidden animate-fade-in z-50 shadow-modal">
            <div className="px-4 py-3 bg-white/[0.03] border-b border-border-subtle flex items-center gap-2">
              <Library size={13} strokeWidth={1.5} className="text-primary" />
              <span className="data-label-primary">Citando da sua Biblioteca</span>
            </div>
            <div className="max-h-72 overflow-y-auto custom-scrollbar p-2">
              {!hasResults && (
                <div className="p-5 text-center text-sm text-gray-600">Nenhum vídeo encontrado.</div>
              )}

              {filteredShort.length > 0 && (
                <div>
                  <p className="data-label px-3 pt-2 pb-1">Vídeos Curtos</p>
                  {filteredShort.slice(0, LIMIT).map(a => renderItem(a, 'short'))}
                  {filteredShort.length > LIMIT && (
                    <button
                      type="button"
                      onClick={() => { setMentionModalTab('short'); setMentionModalOpen(true); setShowMention(false); }}
                      className="w-full text-center py-2 text-[12px] font-bold text-primary/70 hover:text-primary transition-colors"
                    >
                      Ver mais ({filteredShort.length - LIMIT})
                    </button>
                  )}
                </div>
              )}

              {filteredLong.length > 0 && (
                <div className={filteredShort.length > 0 ? 'mt-1 pt-1 border-t border-border-subtle' : ''}>
                  <p className="data-label px-3 pt-2 pb-1">Vídeos Longos</p>
                  {filteredLong.slice(0, LIMIT).map(t => renderItem(t, 'long'))}
                  {filteredLong.length > LIMIT && (
                    <button
                      type="button"
                      onClick={() => { setMentionModalTab('long'); setMentionModalOpen(true); setShowMention(false); }}
                      className="w-full text-center py-2 text-[12px] font-bold text-primary/70 hover:text-primary transition-colors"
                    >
                      Ver mais ({filteredLong.length - LIMIT})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </form>
  );

  return (
    <div className="h-screen flex animate-fade-in overflow-hidden transition-all duration-300" style={{ paddingLeft: collapsed ? 72 : 260 }}>

      {/* ── Conversations Sidebar ── */}
      <div className="w-[261px] bg-[#0D0D0E] border-r border-white/[0.04] flex-col hidden lg:flex shrink-0">
        {/* New Chat Button */}
        <div className="p-4 pb-2">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-gray-400 hover:text-white hover:bg-white/[0.04] transition-all"
          >
            <MessageSquarePlus size={15} className="text-gray-500" /> Novo bate-papo
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.05] rounded-xl py-2 pl-9 pr-3 text-[12px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-white/[0.1] transition-colors"
              placeholder="Pesquisar..."
            />
          </div>
        </div>

        {/* Grouped Sessions List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4">
          {renderSessionGroup('Favoritos', grouped.favorites)}
          {renderSessionGroup('Recentes', grouped.recentes)}
          {sessions.length === 0 && (
            <p className="text-[14px] text-gray-700 text-center py-8">Nenhuma conversa ainda</p>
          )}
        </div>
      </div>

      {/* ── Main Chat Area ── */}
      <div
        className="flex-1 flex flex-col relative overflow-hidden"
        style={{ background: 'linear-gradient(to top, rgba(96, 96, 108, 0.15) 0%, #0C0C0D 100%)' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm border-2 border-dashed border-primary/50 pointer-events-none animate-fade-in">
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-primary/20 rounded-3xl border border-primary/30">
                <ImagePlus size={32} strokeWidth={1.5} className="text-primary" />
              </div>
              <p className="text-white font-extrabold text-sm">Solte a imagem aqui</p>
            </div>
          </div>
        )}

        {/* ── EMPTY STATE: greeting + centered input ── */}
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <p className="text-[29px] text-[#60606C] mb-6 font-bold tracking-wide">
              Olá, {userName || 'Criador'}
            </p>
            <div className="w-full max-w-[720px] relative">
              {renderInputBar()}
            </div>
          </div>
        ) : (
          <>
            {/* Chat header with title + favorite */}
            {currentSession && (
              <div className="px-8 pt-6 pb-4 flex items-center gap-3 shrink-0">
                <h2 className="text-[15px] font-semibold text-gray-300 truncate flex-1">{currentSession.title}</h2>
                <button
                  onClick={() => toggleFavorite(currentSessionId)}
                  className="p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
                  title={isFavorited ? 'Desfavoritar' : 'Favoritar'}
                >
                  <Star size={15} strokeWidth={1.5} className={isFavorited ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600 hover:text-gray-400'} />
                </button>
              </div>
            )}

            {/* Active KB + Tone badges */}
            {(selectedKBId || selectedToneId) && (
              <div className="px-8 pb-2 flex gap-2 flex-wrap">
                {selectedKBId && (
                  <div className="flex items-center gap-1.5 bg-primary/12 text-primary px-3 py-1.5 rounded-md text-xs font-bold border border-primary/15 animate-fade-in">
                    <BookOpen size={12} strokeWidth={1.5} />
                    <span className="truncate max-w-[180px]">{knowledgeBases.find(kb => kb.id === selectedKBId)?.name || 'Base'}</span>
                    <button type="button" onClick={() => setSelectedKBId(null)} className="hover:text-white transition-colors ml-0.5 bg-black/20 rounded-full p-0.5"><X size={10} strokeWidth={2.5} /></button>
                  </div>
                )}
                {selectedToneId && (
                  <div className="flex items-center gap-1.5 bg-purple-500/12 text-purple-400 px-3 py-1.5 rounded-md text-xs font-bold border border-purple-500/15 animate-fade-in">
                    <Mic size={12} strokeWidth={1.5} />
                    <span className="truncate max-w-[180px]">{tones.find(t => t.id === selectedToneId)?.name || 'Tom'}</span>
                    <button type="button" onClick={() => setSelectedToneId(null)} className="hover:text-white transition-colors ml-0.5 bg-black/20 rounded-full p-0.5"><X size={10} strokeWidth={2.5} /></button>
                  </div>
                )}
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-48">
              <div className="max-w-[675px] mx-auto space-y-6">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`max-w-[85%] ${
                      m.role === 'user'
                        ? 'bg-[#18181B] text-gray-200 rounded-2xl rounded-br-md px-4 py-2.5'
                        : 'text-gray-300 px-1 py-2'
                    }`}>
                      {/* Attached image */}
                      {m.image && (
                        <div
                          className="w-14 h-14 rounded-lg overflow-hidden border border-white/10 mb-3 cursor-zoom-in inline-block"
                          onClick={() => setLightboxSrc(m.image)}
                        >
                          <img src={m.image} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="markdown-body chat-markdown select-text text-[15px] leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripEmojis(m.content)}</ReactMarkdown>
                      </div>

                      {/* Task Suggestion */}
                      {m.suggestion && (
                        <div className="mt-5 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl flex flex-col gap-3 max-w-sm">
                          <div className="flex items-center gap-2">
                            <Sparkles size={13} strokeWidth={1.5} className="text-[#34A94B]" />
                            <span className="text-[12px] font-semibold text-gray-400">Salvar no Kanban?</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveToKanban(m.suggestion)}
                              className="flex-1 py-2 bg-[#111F14] text-green-400 hover:bg-[#162a1a] rounded-lg text-[11px] font-bold border border-[#16331E] transition-colors"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => {
                                setMessages(messages.map(msg => msg.suggestion === m.suggestion ? { ...msg, suggestion: null } : msg));
                              }}
                              className="flex-1 py-2 bg-[#1E132A] text-purple-400 hover:bg-[#261838] rounded-lg text-[11px] font-bold border border-[#30194A] transition-colors"
                            >
                              Não
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Added badge */}
                      {m.added && (
                        <div className="mt-4 flex items-center gap-2 text-green-400 bg-[#111F14] w-fit px-3 py-1.5 rounded-md border border-[#16331E]">
                          <CheckCircle2 size={12} strokeWidth={1.5} />
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest">Adicionado</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="flex items-center gap-2 px-1 py-2 text-gray-500">
                      <Loader2 className="animate-spin" size={14} strokeWidth={1.5} />
                      <span className="text-[14px] font-mono">Gerando...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Fixed input bar at bottom */}
            <div className="absolute bottom-0 left-0 right-0 pb-6 pt-4 px-8 bg-gradient-to-t from-[#0C0C0D] via-[#0C0C0D] to-transparent">
              <div className="relative max-w-[675px] mx-auto">
                {renderInputBar()}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══ KB + TONE POPUP MODAL ═══ */}
      {kbPopupOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/50 animate-fade-in" onClick={() => setKbPopupOpen(false)}>
          <div className="glass-raised w-full max-w-4xl max-h-[85vh] rounded-4xl flex flex-col overflow-hidden shadow-modal" onClick={(e) => e.stopPropagation()}>

            {/* Popup Header */}
            <div className="pt-7 px-5 pb-5 border-b border-border-subtle flex items-center justify-between bg-surface/60">
              <div className="flex items-center gap-3">
                {/* Back button for sub-pages */}
                {(kbPopupTab === 'create' || kbPopupTab === 'view' || kbPopupTab === 'tone-view') && (
                  <button onClick={() => setKbPopupTab(kbPopupTab === 'tone-view' ? 'tone' : 'bases')} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all">
                    <ChevronDown size={16} className="rotate-90" />
                  </button>
                )}

                {/* Main tabs */}
                {(kbPopupTab === 'bases' || kbPopupTab === 'tone') && (
                  <div className="flex gap-1 p-1 bg-surface-flat border border-border-subtle rounded-xl">
                    <button
                      onClick={() => setKbPopupTab('bases')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        kbPopupTab === 'bases' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <BookOpen size={13} /> Bases
                    </button>
                    <button
                      onClick={() => setKbPopupTab('tone')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        kbPopupTab === 'tone' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <Mic size={13} /> Tom
                    </button>
                  </div>
                )}

                {/* Sub-page titles */}
                {kbPopupTab === 'create' && (
                  <>
                    <BookOpen size={20} strokeWidth={1.5} className="text-primary" />
                    <h3 className="text-lg font-extrabold text-white tracking-tight">{kbEditId ? 'Editar Base' : 'Nova Base'}</h3>
                  </>
                )}
                {kbPopupTab === 'view' && (
                  <>
                    <BookOpen size={20} strokeWidth={1.5} className="text-primary" />
                    <h3 className="text-lg font-extrabold text-white tracking-tight">Visualizar Base</h3>
                  </>
                )}
                {kbPopupTab === 'tone-view' && (
                  <>
                    <Mic size={20} strokeWidth={1.5} className="text-primary" />
                    <h3 className="text-lg font-extrabold text-white tracking-tight">Visualizar Tom</h3>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {kbPopupTab === 'create' && (
                  <>
                    <button
                      onClick={handleKBSave}
                      className={`btn-magnetic px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all duration-300 ${
                        kbSaved
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-surface-flat text-white border border-border-subtle hover:border-border-hover'
                      }`}
                    >
                      {kbSaved ? <><CheckCircle2 size={13} strokeWidth={2.5} /> Salvo!</> : <><Check size={13} strokeWidth={2.5} /> Salvar</>}
                    </button>
                    <button
                      onClick={handleKBCompile}
                      disabled={kbSelectedIds.length === 0 || kbCompiling || (kbEditId && JSON.stringify([...kbSelectedIds].sort()) === JSON.stringify([...kbOriginalIds].sort()))}
                      className="btn-primary px-5 py-2 rounded-xl text-xs flex items-center gap-2 disabled:opacity-40"
                    >
                      {kbCompiling ? <><Loader2 size={13} strokeWidth={2.5} className="animate-spin" /> Compilando...</> : <><Sparkles size={13} strokeWidth={2.5} /> {kbEditId ? 'Analisar novamente' : 'Iniciar Análise'}</>}
                    </button>
                  </>
                )}
                {kbPopupTab === 'view' && kbViewingBase?.compiled_md && (
                  <button onClick={() => handleKBExport(kbViewingBase)} className="btn-magnetic bg-surface-flat text-white px-4 py-2 rounded-xl text-xs flex items-center gap-2 border border-border-subtle hover:border-border-hover">
                    <Download size={13} strokeWidth={2.5} /> Exportar
                  </button>
                )}
                {kbPopupTab === 'tone-view' && (
                  <button onClick={() => handleToneExport(tones.find(t => t.id === toneViewingId))} className="btn-magnetic bg-surface-flat text-white px-4 py-2 rounded-xl text-xs flex items-center gap-2 border border-border-subtle hover:border-border-hover">
                    <Download size={13} strokeWidth={2.5} /> Exportar
                  </button>
                )}
                <button onClick={() => setKbPopupOpen(false)} className="p-2 bg-white/5 hover:bg-white/8 rounded-xl transition-colors text-gray-400 hover:text-white">
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* ── BASES LIST TAB ── */}
            {kbPopupTab === 'bases' && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                {kbAllBases.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[300px] space-y-4 opacity-60">
                    <div className="p-8 bg-white/[0.03] rounded-3xl border border-border-subtle">
                      <BookOpen size={40} strokeWidth={1.5} className="text-primary" />
                    </div>
                    <h4 className="text-lg font-extrabold text-white">Nenhuma base criada</h4>
                    <p className="text-sm text-gray-500 max-w-xs text-center">Selecione vídeos da sua biblioteca para criar uma base de conhecimento compilada.</p>
                    <button onClick={() => openKBCreate()} className="btn-primary px-5 py-2.5 rounded-2xl text-sm flex items-center gap-2">
                      <Plus size={15} strokeWidth={2.5} /> Criar Base
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Create new button */}
                    <button
                      onClick={() => openKBCreate()}
                      className="w-full p-4 bg-surface-flat/50 hover:bg-surface-flat rounded-2xl border border-dashed border-border-subtle hover:border-border-hover transition-all flex items-center justify-center gap-2.5 text-gray-500 hover:text-white text-sm font-semibold"
                    >
                      <Plus size={15} strokeWidth={2.5} /> Nova Base
                    </button>

                    {kbAllBases.map(kb => {
                      const ids = kb.selected_ids || [];
                      const thumbs = analyses.filter(a => ids.includes(a.id) && a.thumbnail_url);
                      const isActive = selectedKBId === kb.id;
                      return (
                        <div
                          key={kb.id}
                          className={`p-4 rounded-2xl border transition-all flex items-center gap-4 group cursor-pointer ${
                            isActive ? 'bg-primary/5 border-primary/20' : 'bg-surface border-border-subtle hover:border-border-hover'
                          }`}
                          onClick={() => { setSelectedKBId(kb.id); setKbPopupOpen(false); }}
                        >
                          {/* Thumbs */}
                          <div className="flex gap-1 shrink-0">
                            {thumbs.slice(0, 3).map((a, i) => (
                              <div key={i} className="w-10 h-10 rounded-lg overflow-hidden bg-surface-flat">
                                <img src={resolveThumbnailUrl(a.thumbnail_url)} alt="" className="w-full h-full object-cover opacity-70" />
                              </div>
                            ))}
                            {thumbs.length === 0 && (
                              <div className="w-10 h-10 rounded-lg bg-surface-flat flex items-center justify-center">
                                <BookOpen size={14} strokeWidth={1.5} className="text-gray-700" />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-white truncate">{kb.name}</h4>
                            <div className="flex items-center gap-2 text-[11px] font-mono text-gray-600 mt-0.5">
                              <span>{ids.length} vídeo{ids.length !== 1 ? 's' : ''}</span>
                              {kb.compiled_md ? (
                                <span className="text-primary flex items-center gap-1"><Check size={9} strokeWidth={1.5} /> Compilada</span>
                              ) : (
                                <span className="text-amber-500/70">Pendente</span>
                              )}
                              {isActive && <span className="text-primary">· Ativa</span>}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            {kb.compiled_md && (
                              <button onClick={(e) => { e.stopPropagation(); setKbViewingBase(kb); setKbPopupTab('view'); }} className="p-2.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors" title="Ver">
                                <Eye size={16} strokeWidth={2.5} />
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); openKBCreate(kb); }} className="p-2.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors" title="Editar">
                              <Pencil size={16} strokeWidth={2.5} />
                            </button>
                            {kb.compiled_md && (
                              <button onClick={(e) => { e.stopPropagation(); handleKBExport(kb); }} className="p-2.5 rounded-xl text-gray-500 hover:text-primary hover:bg-primary/10 transition-colors" title="Exportar">
                                <Download size={16} strokeWidth={2.5} />
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleKBDelete(kb.id); }} className="p-2.5 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-400/[0.08] transition-colors" title="Excluir">
                              <Trash2 size={16} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── CREATE / EDIT TAB ── */}
            {kbPopupTab === 'create' && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-4">
                {/* Name input */}
                <input
                  value={kbEditName}
                  onChange={(e) => setKbEditName(e.target.value)}
                  className="bg-transparent text-xl font-bold text-white tracking-tight focus:outline-none placeholder-gray-700 border-b border-border-subtle pb-3"
                  placeholder="Nome da base..."
                />

                <div className="flex items-center justify-between">
                  <p className="text-gray-500 text-xs uppercase tracking-wide">{kbSelectedIds.length}/30 selecionados</p>
                  <div className="relative w-56">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={13} />
                    <input
                      value={kbSearchTerm}
                      onChange={(e) => setKbSearchTerm(e.target.value)}
                      className="input-field rounded-xl py-2 pl-9 pr-3 text-xs"
                      placeholder="Buscar vídeo..."
                    />
                  </div>
                </div>

                {kbCompiling && (
                  <div className="p-4 bg-primary/5 border border-primary/15 rounded-2xl flex items-center gap-3 animate-fade-in">
                    <Loader2 size={18} strokeWidth={1.5} className="animate-spin text-primary" />
                    <div>
                      <p className="text-white text-sm font-semibold">Compilando base...</p>
                      <p className="text-gray-500 text-sm mt-0.5">Analisando {kbSelectedIds.length} vídeos.</p>
                    </div>
                  </div>
                )}

                {/* Selection grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {analyses
                    .filter(a => a.title?.toLowerCase().includes(kbSearchTerm.toLowerCase()))
                    .map(a => {
                      const isSelected = kbSelectedIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleKBSelect(a.id)}
                          className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-square group ${
                            isSelected ? 'border-primary shadow-glow-sm scale-[1.02]' : 'border-transparent hover:border-border-hover'
                          }`}
                        >
                          {a.thumbnail_url ? (
                            <img src={resolveThumbnailUrl(a.thumbnail_url)} alt={a.title} className={`w-full h-full object-cover transition-all ${isSelected ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'}`} />
                          ) : (
                            <div className="w-full h-full bg-surface-flat flex items-center justify-center">
                              <FileText size={20} strokeWidth={1.5} className="text-gray-700" />
                            </div>
                          )}
                          <div className={`absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                            isSelected ? 'bg-primary text-white' : 'bg-black/50 text-white/30 opacity-0 group-hover:opacity-100'
                          }`}>
                            <Check size={14} strokeWidth={2.5} />
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                            <p className="text-[10px] text-white truncate font-normal">{a.title}</p>
                          </div>
                        </button>
                      );
                    })}
                </div>

                {analyses.length === 0 && (
                  <div className="flex-1 flex items-center justify-center opacity-50 py-12">
                    <p className="text-gray-500 text-sm">Biblioteca vazia. Analise vídeos primeiro.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── VIEW TAB ── */}
            {kbPopupTab === 'view' && kbViewingBase && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <h4 className="text-lg font-extrabold text-white mb-1">{kbViewingBase.name}</h4>
                <p className="text-gray-600 text-xs font-mono mb-7">{(kbViewingBase.selected_ids || []).length} vídeos compilados</p>
                {kbViewingBase.compiled_md ? (
                  <div className="markdown-body max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{kbViewingBase.compiled_md}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm italic text-center py-12">Esta base ainda não foi compilada.</p>
                )}
              </div>
            )}

            {/* ── TONE TAB ── */}
            {kbPopupTab === 'tone' && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                {tones.length === 0 && !toneCreating && !toneLoading ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[300px] space-y-4 opacity-60">
                    <div className="p-8 bg-white/[0.03] rounded-3xl border border-border-subtle">
                      <Mic size={40} strokeWidth={1.5} className="text-primary" />
                    </div>
                    <h4 className="text-lg font-extrabold text-white">Nenhum tom criado</h4>
                    <p className="text-sm text-gray-500 max-w-xs text-center">Envie vídeos de referência para que a IA aprenda o estilo e personalidade do criador.</p>
                    <button onClick={() => setToneCreating(true)} className="btn-primary px-5 py-2.5 rounded-2xl text-sm flex items-center gap-2">
                      <Plus size={15} strokeWidth={2.5} /> Novo Tom
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Create new button */}
                    {!toneCreating && !toneLoading && (
                      <button
                        onClick={() => setToneCreating(true)}
                        className="w-full p-4 bg-surface-flat/50 hover:bg-surface-flat rounded-2xl border border-dashed border-border-subtle hover:border-border-hover transition-all flex items-center justify-center gap-2.5 text-gray-500 hover:text-white text-sm font-semibold"
                      >
                        <Plus size={15} strokeWidth={2.5} /> Novo Tom
                      </button>
                    )}

                    {/* Create form (only when toneCreating or toneLoading) */}
                    {(toneCreating || toneLoading) && (
                      <div className="animate-fade-in">
                        {toneLoading ? (
                          <div className="bg-surface border border-border-subtle rounded-2xl p-6 flex flex-col items-center gap-4">
                            <div className="relative w-28 h-28">
                              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                                <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/[0.04]" />
                                <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={502} strokeDashoffset={502 - (502 * toneProgress) / 100} strokeLinecap="round" className="text-primary transition-all duration-700 ease-out" style={{ filter: 'drop-shadow(0 0 12px rgba(55, 178, 77, 0.5))' }} />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-xl font-bold text-white font-mono">{toneProgress}%</span>
                              </div>
                            </div>
                            <p className="text-gray-400 font-normal text-sm animate-pulse text-center max-w-xs">
                              {toneLogs.length > 0 ? toneLogs[toneLogs.length - 1] : 'Processando...'}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-surface border border-border-subtle rounded-2xl p-5 space-y-4">
                            <div className="flex items-center justify-between">
                              <input
                                value={toneName}
                                onChange={(e) => setToneName(e.target.value)}
                                className="bg-transparent text-lg font-bold text-white tracking-tight focus:outline-none placeholder-gray-700 border-b border-border-subtle pb-2 flex-1"
                                placeholder="Dê um nome para este tom..."
                              />
                              <button onClick={() => { setToneCreating(false); setToneName(''); setToneFiles([]); setToneLinks(''); setToneNotes(''); setToneError(null); }} className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-white/[0.06] transition-colors ml-3 shrink-0">
                                <X size={16} strokeWidth={2.5} />
                              </button>
                            </div>

                            {/* Tab switcher */}
                            <div className="flex gap-1.5 p-1 bg-surface-flat border border-border-subtle rounded-xl w-fit">
                              <button
                                onClick={() => setToneTab('upload')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                                  toneTab === 'upload' ? 'bg-primary/20 text-primary' : 'text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                <Upload size={13} /> Arquivos
                              </button>
                              <button
                                onClick={() => setToneTab('link')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                                  toneTab === 'link' ? 'bg-primary/20 text-primary' : 'text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                <LinkIcon size={13} /> Links
                              </button>
                            </div>

                            {toneTab === 'upload' ? (
                              <div
                                {...toneDropzone.getRootProps()}
                                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                                  toneDropzone.isDragActive
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border-subtle hover:border-border-hover hover:bg-white/[0.02]'
                                } ${toneFiles.length > 0 ? 'border-green-500/30 bg-green-500/[0.03]' : ''}`}
                              >
                                <input {...toneDropzone.getInputProps()} />
                                <div className="flex flex-col items-center gap-2">
                                  <FileVideo size={28} strokeWidth={1.5} className={toneFiles.length > 0 ? 'text-green-400' : 'text-gray-500'} />
                                  {toneFiles.length > 0 ? (
                                    <>
                                      <p className="text-white font-bold text-sm">{toneFiles.length} arquivo(s) na fila</p>
                                      <p className="text-sm text-gray-500 truncate max-w-md">{toneFiles.map(f => f.name).join(', ')}</p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-gray-500 font-semibold text-sm">Arraste vídeos aqui</p>
                                      <p className="text-sm text-gray-600 font-mono">.mp4, .mov — Máx: 5 vídeos</p>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <textarea
                                value={toneLinks}
                                onChange={(e) => setToneLinks(e.target.value)}
                                className="input-field rounded-2xl p-4 resize-none w-full"
                                rows="3"
                                placeholder={"https://youtube.com/shorts/...\nhttps://www.instagram.com/reel/..."}
                              />
                            )}

                            <textarea
                              value={toneNotes}
                              onChange={(e) => setToneNotes(e.target.value)}
                              className="input-field rounded-2xl p-4 resize-none w-full text-xs"
                              rows="2"
                              placeholder="Informações adicionais sobre o tom (opcional)... Ex: Sem sensacionalismo, linguagem natural sem formalidade..."
                            />

                            {toneError && (
                              <div className="p-3 bg-red-500/8 border border-red-500/15 text-red-400 rounded-xl text-sm font-semibold flex items-center gap-2 animate-fade-in">
                                <AlertCircle size={14} strokeWidth={1.5} /> {toneError}
                              </div>
                            )}

                            <button
                              onClick={handleToneAnalyze}
                              disabled={toneLoading || (toneTab === 'upload' ? toneFiles.length === 0 : toneLinks.trim() === '')}
                              className="w-full py-3 btn-white rounded-2xl flex justify-center items-center gap-2 text-sm disabled:opacity-40 disabled:pointer-events-none group"
                            >
                              <Sparkles size={15} strokeWidth={2.5} className="group-hover:text-primary transition-colors" />
                              Analisar Tom
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tons list */}
                    {tones.map(tone => {
                      const isActive = selectedToneId === tone.id;
                      return (
                        <div
                          key={tone.id}
                          className={`p-4 rounded-2xl border transition-all flex items-center gap-4 group cursor-pointer ${
                            isActive ? 'bg-primary/5 border-primary/20' : 'bg-surface border-border-subtle hover:border-border-hover'
                          }`}
                          onClick={() => { setSelectedToneId(tone.id); setKbPopupOpen(false); }}
                        >
                          {/* Thumbnail */}
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-flat shrink-0">
                            {tone.thumbnail_url ? (
                              <img src={resolveThumbnailUrl(tone.thumbnail_url)} alt="" className="w-full h-full object-cover opacity-70" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Mic size={14} strokeWidth={1.5} className="text-gray-700" />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-white truncate">{tone.name}</h4>
                            <div className="flex items-center gap-2 text-[11px] font-mono text-gray-600 mt-0.5">
                              <span>{tone.video_count} vídeo{tone.video_count !== 1 ? 's' : ''}</span>
                              {tone.tone_md ? (
                                <span className="text-primary flex items-center gap-1"><Check size={9} strokeWidth={1.5} /> Pronto</span>
                              ) : (
                                <span className="text-amber-500/70">Pendente</span>
                              )}
                              {isActive && <span className="text-primary">· Ativo</span>}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {tone.tone_md && (
                              <button onClick={(e) => { e.stopPropagation(); setToneViewingId(tone.id); setKbPopupTab('tone-view'); }} className="p-2 rounded-lg text-gray-600 hover:text-white hover:bg-white/[0.05]" title="Ver">
                                <Eye size={14} strokeWidth={2.5} />
                              </button>
                            )}
                            {tone.tone_md && (
                              <button onClick={(e) => { e.stopPropagation(); handleToneExport(tone); }} className="p-2 rounded-lg text-gray-600 hover:text-primary hover:bg-primary/10" title="Exportar">
                                <Download size={14} strokeWidth={2.5} />
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleToneDelete(tone.id); }} className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/[0.08]" title="Excluir">
                              <Trash2 size={14} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── TONE VIEW TAB ── */}
            {kbPopupTab === 'tone-view' && toneViewingId && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {(() => {
                  const tone = tones.find(t => t.id === toneViewingId);
                  if (!tone) return <p className="text-gray-500 text-sm">Tom não encontrado.</p>;
                  return (
                    <>
                      <h4 className="text-lg font-extrabold text-white mb-1">{tone.name}</h4>
                      <p className="text-gray-600 text-xs font-mono mb-7">{tone.video_count} vídeo{tone.video_count !== 1 ? 's' : ''} analisado{tone.video_count !== 1 ? 's' : ''}</p>
                      {tone.tone_md ? (
                        <div className="markdown-body max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{tone.tone_md}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm italic text-center py-12">Este tom ainda não foi analisado.</p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {/* Mention Library Modal */}
      {mentionModalOpen && (() => {
        const items = mentionModalTab === 'short' ? analyses : transcriptions;
        const selectItem = (item) => {
          const keyPrefix = mentionModalTab;
          setSelectedMentions(prev => {
            if (!prev.find(m => m.id === item.id && m._type === keyPrefix)) return [...prev, { ...item, _type: keyPrefix }];
            return prev;
          });
          const newVal = input.replace(/(?:^|\s)@[^\s]*$/, ' ');
          setInput(newVal);
          setMentionModalOpen(false);
        };

        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" onClick={() => setMentionModalOpen(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-[680px] max-h-[75vh] glass-raised rounded-3xl overflow-hidden flex flex-col animate-scale-in shadow-modal"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 bg-white/[0.03] border-b border-border-subtle flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Library size={16} strokeWidth={1.5} className="text-primary" />
                  <h3 className="text-[15px] font-extrabold text-white tracking-tight">Biblioteca</h3>
                </div>
                <button
                  onClick={() => setMentionModalOpen(false)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>

              {/* Tabs */}
              <div className="px-6 pt-4 pb-2 flex gap-1.5 shrink-0">
                <button
                  onClick={() => setMentionModalTab('short')}
                  className={`px-4 py-2 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all ${
                    mentionModalTab === 'short' ? 'bg-primary/15 text-primary border border-primary/20' : 'text-gray-500 hover:text-gray-300 border border-transparent hover:bg-white/[0.03]'
                  }`}
                >
                  Vídeos Curtos ({analyses.length})
                </button>
                <button
                  onClick={() => setMentionModalTab('long')}
                  className={`px-4 py-2 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all ${
                    mentionModalTab === 'long' ? 'bg-primary/15 text-primary border border-primary/20' : 'text-gray-500 hover:text-gray-300 border border-transparent hover:bg-white/[0.03]'
                  }`}
                >
                  Vídeos Longos ({transcriptions.length})
                </button>
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-3">
                {items.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-gray-600 text-sm">Nenhum vídeo nesta categoria.</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => selectItem(item)}
                        className="group text-left bg-surface hover:bg-surface-flat border border-border-subtle hover:border-primary/20 rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-card-hover"
                      >
                        <div className="aspect-video bg-background overflow-hidden">
                          {item.thumbnail_url ? (
                            <img src={resolveThumbnailUrl(item.thumbnail_url)} alt="" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-300" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film size={24} strokeWidth={1} className="text-gray-700" />
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-[13px] font-bold text-white truncate group-hover:text-primary transition-colors">{item.title}</p>
                          <p className="font-mono text-[10px] text-gray-600 mt-1">
                            {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : `ID: ${item.id}`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Creator;
