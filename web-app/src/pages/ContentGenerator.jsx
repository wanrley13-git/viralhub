import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Lightbulb, FileCheck, FileText, Minus, Plus, ChevronDown, Video, X, ImagePlus,
  BookOpen, Mic, Check, Pencil, Trash2, Eye, Download, Search, Upload,
  Link as LinkIcon, FileVideo, AlertCircle, Loader2, CheckCircle2,
  LayoutGrid, Grid3x3, Clock, Heart,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { useSidebar } from '../contexts/SidebarContext';
import { getAccessToken } from '../supabaseClient';
import { resolveThumbnailUrl } from '../components/Thumbnail';
import MarkdownRenderer from '../components/MarkdownRenderer';

const API_URL = import.meta.env.VITE_API_URL;

// ─── Filled 4-point star icon ───
const StarFilled = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 0L15 9L24 12L15 15L12 24L9 15L0 12L9 9L12 0Z" />
  </svg>
);

const TABS = [
  { id: 'ideas',     label: 'Ideias',        icon: Lightbulb, pill: true  },
  { id: 'developed', label: 'Desenvolvidos', icon: FileText,  pill: true  },
  { id: 'history',   label: 'Histórico',     icon: Clock,     pill: false },
  { id: 'saved',     label: 'Favoritos',     icon: Heart,     pill: false },
];

const MIN_QTY = 1;
const MAX_QTY = 40;

// ─── Small components ───
const RefChip = ({ analysis, onRemove }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/[0.08] text-[12px] font-semibold text-gray-300 whitespace-nowrap select-none shrink-0">
    <Video size={11} strokeWidth={2} className="shrink-0 text-primary/70" />
    <span className="truncate max-w-[120px]">{analysis.title}</span>
    <button onClick={(e) => { e.stopPropagation(); onRemove(analysis.id); }} className="opacity-40 hover:opacity-100 transition-opacity">
      <X size={10} strokeWidth={2.5} />
    </button>
  </span>
);

const ImageThumb = ({ file, onRemove }) => (
  <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/[0.08] shrink-0 group">
    <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
    <button onClick={onRemove} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
      <X size={12} strokeWidth={2.5} className="text-white" />
    </button>
  </div>
);

// ─── Format relative/absolute date for history ───
const formatDateHeader = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} às ${hour}:${min}`;
};

// ─── Idea card component (reused across tabs) ───
const IdeaCard = ({ idea, index, isSelected, cs, onToggleSelect, onToggleSave, showDate = false }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.5) }}
    onClick={() => onToggleSelect(idea.id)}
    className={`relative ${cs.pad} rounded-2xl border cursor-pointer transition-all duration-300 group flex flex-col ${
      isSelected
        ? 'bg-primary/5 border-primary/30'
        : 'bg-white/[0.02] border-white/[0.08] hover:border-primary/40'
    }`}
  >
    {/* Top-right corner: heart + selection checkbox side by side */}
    <div className="absolute top-3 right-3 flex items-center gap-2">
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSave(idea.id); }}
        className="w-7 h-7 flex items-center justify-center rounded-full transition-transform duration-200 active:scale-125 overflow-visible"
        style={{
          backgroundColor: idea.is_saved ? '#2E0B15' : 'transparent',
          border: idea.is_saved ? '1px solid #38161F' : '1px solid transparent',
        }}
        title={idea.is_saved ? 'Remover dos favoritos' : 'Favoritar'}
      >
        <Heart
          size={14}
          strokeWidth={2}
          fill={idea.is_saved ? '#E2272F' : 'none'}
          stroke={idea.is_saved ? '#E2272F' : '#ffffff'}
        />
      </button>
      <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
        isSelected ? 'bg-primary text-white' : 'bg-white/[0.06] text-transparent group-hover:text-white/20'
      }`}>
        <Check size={12} strokeWidth={3} />
      </div>
    </div>

    <p className="font-bold uppercase tracking-widest text-white/25 mb-2" style={{ fontSize: cs.label }}>
      Ideia {String(index + 1).padStart(2, '0')}
    </p>
    <p className={`font-bold text-white leading-snug uppercase tracking-wide pr-20 ${cs.clampTitle}`} style={{ fontSize: cs.title }}>
      {idea.title}
    </p>
    {idea.summary && (
      <p className={`text-white/40 leading-relaxed mt-3 ${cs.clampSum}`} style={{ fontSize: cs.summary }}>
        {idea.summary}
      </p>
    )}

    {showDate && idea.created_at && (
      <span className="text-[10px] text-white/30 font-mono flex items-center gap-1 mt-3">
        <Clock size={10} strokeWidth={1.5} />
        {formatDateHeader(idea.created_at)}
      </span>
    )}
  </motion.div>
);

const ContentGenerator = () => {
  const { collapsed } = useSidebar();

  // Page tabs
  const [activeTab, setActiveTab] = useState('ideas');

  // Prompt bar segments
  const [segments, setSegments] = useState([{ type: 'text', value: '' }]);
  const [selectedBaseId, setSelectedBaseId] = useState(null);
  const [selectedToneId, setSelectedToneId] = useState(null);
  const [quantity, setQuantity] = useState(5);
  const [uploadedImages, setUploadedImages] = useState([]);

  // @ mention
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);

  // Modal state
  const [configOpen, setConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState('bases'); // bases | create | view | tone | tone-create | tone-view

  // Data from API
  const [analyses, setAnalyses] = useState([]);
  const [kbAllBases, setKbAllBases] = useState([]);
  const [tones, setTones] = useState([]);

  // KB create/edit
  const [kbEditId, setKbEditId] = useState(null);
  const [kbEditName, setKbEditName] = useState('');
  const [kbSelectedIds, setKbSelectedIds] = useState([]);
  const [kbOriginalIds, setKbOriginalIds] = useState([]);
  const [kbSearchTerm, setKbSearchTerm] = useState('');
  const [kbCompiling, setKbCompiling] = useState(false);
  const [kbSaved, setKbSaved] = useState(false);
  const [kbViewingBase, setKbViewingBase] = useState(null);

  // Tone create
  const [toneCreating, setToneCreating] = useState(false);
  const [toneName, setToneName] = useState('');
  const [toneTab, setToneTab] = useState('upload');
  const [toneFiles, setToneFiles] = useState([]);
  const [toneLinks, setToneLinks] = useState('');
  const [toneNotes, setToneNotes] = useState('');
  const [toneLoading, setToneLoading] = useState(false);
  const [toneError, setToneError] = useState(null);
  const [toneProgress, setToneProgress] = useState(0);
  const [toneLogs, setToneLogs] = useState([]);
  const [toneTaskId, setToneTaskId] = useState(null);
  const [toneViewingId, setToneViewingId] = useState(null);

  // Grid size (4-6 cols) — fewer cols = bigger cards + bigger text
  const [gridCols, setGridCols] = useState(() => {
    const saved = parseInt(localStorage.getItem('viralhub_gridCols'), 10);
    return saved >= 4 && saved <= 6 ? saved : 5;
  });

  useEffect(() => {
    localStorage.setItem('viralhub_gridCols', String(gridCols));
  }, [gridCols]);

  // Scale text sizes based on grid: 4 cols = large, 6 cols = compact
  const cardScale = { 4: { label: '13px', title: '19px', summary: '15px', pad: 'p-6', clampTitle: 'line-clamp-4', clampSum: 'line-clamp-5' }, 5: { label: '11px', title: '15px', summary: '13px', pad: 'p-5', clampTitle: 'line-clamp-3', clampSum: 'line-clamp-4' }, 6: { label: '10px', title: '13px', summary: '11px', pad: 'p-4', clampTitle: 'line-clamp-3', clampSum: 'line-clamp-3' } };
  const cs = cardScale[gridCols] || cardScale[5];

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [ideas, setIdeas] = useState([]);           // Ideias tab
  const [historyIdeas, setHistoryIdeas] = useState([]); // Histórico tab
  const [savedIdeas, setSavedIdeas] = useState([]);     // Salvos tab
  const [loadingTab, setLoadingTab] = useState(false);
  const [selectedIdeas, setSelectedIdeas] = useState([]);
  const [errorToast, setErrorToast] = useState(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [quantityEditing, setQuantityEditing] = useState(false);
  const [quantityInput, setQuantityInput] = useState('');

  const textareaRef = useRef(null);
  const mentionRef = useRef(null);
  const fileInputRef = useRef(null);

  // Derived
  const selectedRefs = segments.filter(s => s.type === 'ref').map(s => s.analysis);
  const activeText = segments[segments.length - 1].value;
  const hasContent = segments.some(s => (s.type === 'text' && s.value.trim()) || s.type === 'ref');
  const activeBase = kbAllBases.find(b => b.id === selectedBaseId);
  const activeTone = tones.find(t => t.id === selectedToneId);

  const filteredAnalyses = analyses.filter((a) =>
    !selectedRefs.find((r) => r.id === a.id) &&
    a.title?.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  // ─── Dropzone for tone video files ───
  const toneDropzone = useDropzone({
    onDrop: (accepted) => setToneFiles(accepted),
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'] },
    maxFiles: 10,
  });

  // ─── Fetch data on mount ───
  useEffect(() => {
    fetchAnalyses();
    fetchKnowledgeBases();
    fetchTones();
    // fetchIdeas is triggered by the tab-based useEffect
  }, []);

  const fetchIdeas = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/content/ideas?tab=ideas`, { headers: { Authorization: `Bearer ${token}` } });
      setIdeas(res.data);
    } catch (err) { console.error('Erro buscando ideias:', err); }
  };

  const fetchHistory = async () => {
    setLoadingTab(true);
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/content/ideas?tab=history`, { headers: { Authorization: `Bearer ${token}` } });
      setHistoryIdeas(res.data);
    } catch (err) { console.error('Erro buscando histórico:', err); }
    finally { setLoadingTab(false); }
  };

  const fetchSaved = async () => {
    setLoadingTab(true);
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/content/ideas?tab=saved`, { headers: { Authorization: `Bearer ${token}` } });
      setSavedIdeas(res.data);
    } catch (err) { console.error('Erro buscando salvos:', err); }
    finally { setLoadingTab(false); }
  };

  // Fetch data when tab changes
  useEffect(() => {
    setSelectedIdeas([]); // Clear selection on tab switch
    if (activeTab === 'history') fetchHistory();
    else if (activeTab === 'saved') fetchSaved();
    else if (activeTab === 'ideas') fetchIdeas();
  }, [activeTab]);

  // Toggle bookmark/save on a specific idea
  const toggleSaveIdea = async (ideaId) => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };
      const url = `${API_URL}/content/ideas/${ideaId}/save`;
      let res;
      try {
        res = await axios.patch(url, {}, { headers });
      } catch (patchErr) {
        // Fallback to POST if PATCH is blocked by proxy/infra
        if (patchErr.response?.status === 404 || patchErr.response?.status === 405) {
          res = await axios.post(url, {}, { headers });
        } else {
          throw patchErr;
        }
      }
      const updated = res.data;
      // Update in all local states
      const updater = (list) => list.map(i => i.id === ideaId ? { ...i, is_saved: updated.is_saved } : i);
      setIdeas(updater);
      setHistoryIdeas(updater);
      // For saved list: if unsaved, remove; otherwise no change needed
      if (!updated.is_saved) {
        setSavedIdeas(prev => prev.filter(i => i.id !== ideaId));
      } else {
        // If it's not already there, refetch
        setSavedIdeas(prev => prev.find(i => i.id === ideaId) ? updater(prev) : prev);
      }
    } catch (err) {
      setErrorToast('Erro ao salvar ideia.');
      setTimeout(() => setErrorToast(null), 4000);
    }
  };

  const fetchAnalyses = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/analyze/history`, { headers: { Authorization: `Bearer ${token}` } });
      setAnalyses(res.data);
    } catch (err) { console.error('Erro buscando análises:', err); }
  };

  const fetchKnowledgeBases = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/knowledge/`, { headers: { Authorization: `Bearer ${token}` } });
      setKbAllBases(res.data);
    } catch (err) { console.error('Erro buscando bases:', err); }
  };

  const fetchTones = async () => {
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${API_URL}/tone/`, { headers: { Authorization: `Bearer ${token}` } });
      setTones(res.data);
    } catch (err) { console.error('Erro buscando tons:', err); }
  };

  // ─── KB actions (from Creator) ───
  const openKBCreate = (base = null) => {
    setKbEditId(base?.id || null);
    setKbEditName(base?.name || '');
    setKbSelectedIds(base?.selected_ids || []);
    setKbOriginalIds(base?.selected_ids || []);
    setKbSearchTerm('');
    setKbSaved(false);
    setConfigTab('create');
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
    const finalName = kbEditName.trim() || 'Nova Base';
    try {
      let kbId = kbEditId;
      if (!kbId) {
        const res = await axios.post(`${API_URL}/knowledge/`, { name: finalName }, { headers: { Authorization: `Bearer ${token}` } });
        kbId = res.data.id;
        setKbEditId(kbId);
      } else {
        await axios.patch(`${API_URL}/knowledge/${kbId}`, { name: finalName }, { headers: { Authorization: `Bearer ${token}` } });
      }
      await axios.put(`${API_URL}/knowledge/${kbId}/selection`, { selected_ids: kbSelectedIds }, { headers: { Authorization: `Bearer ${token}` } });
      await fetchKnowledgeBases();
      setKbSaved(true);
      setTimeout(() => setKbSaved(false), 2000);
    } catch (err) { console.error('Erro ao salvar KB:', err); }
  };

  const handleKBCompile = async () => {
    await handleKBSave();
    if (!kbEditId || kbSelectedIds.length === 0) return;
    setKbCompiling(true);
    try {
      const token = await getAccessToken();
      await axios.post(`${API_URL}/knowledge/${kbEditId}/compile`, {}, { headers: { Authorization: `Bearer ${token}` } });
      await fetchKnowledgeBases();
      setSelectedBaseId(kbEditId);
      setConfigTab('bases');
    } catch (err) { console.error('Erro ao compilar:', err); }
    finally { setKbCompiling(false); }
  };

  const handleKBDelete = async (kbId) => {
    if (!window.confirm('Excluir esta base?')) return;
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/knowledge/${kbId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (selectedBaseId === kbId) setSelectedBaseId(null);
      await fetchKnowledgeBases();
    } catch (err) { console.error(err); }
  };

  const handleKBExport = (kb) => {
    const blob = new Blob([kb.compiled_md || ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${kb.name.replace(/\s+/g, '_')}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Tone actions (from Creator) ───
  useEffect(() => {
    if (!toneTaskId) return;
    const es = new EventSource(`${API_URL}/tone/progress/${toneTaskId}`);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setToneProgress(data.progress || 0);
      setToneLogs(data.logs || []);
      if (data.status === 'completed') {
        setToneLoading(false); setToneCreating(false); setToneTaskId(null);
        es.close(); fetchTones();
        setToneFiles([]); setToneLinks(''); setToneProgress(0); setToneName(''); setToneNotes('');
      }
      if (data.status === 'error') {
        setToneError(data.logs?.[data.logs.length - 1] || 'Erro desconhecido.');
        setToneLoading(false); setToneTaskId(null); es.close();
      }
    };
    es.onerror = () => { setToneError('Erro na conexão.'); setToneLoading(false); setToneTaskId(null); es.close(); };
    return () => es.close();
  }, [toneTaskId]);

  const handleToneAnalyze = async () => {
    const token = await getAccessToken();
    setToneError(null); setToneLoading(true); setToneProgress(0); setToneLogs([]);
    try {
      const finalName = toneName.trim() || 'Novo Tom';
      let res;
      if (toneTab === 'upload') {
        if (toneFiles.length === 0) throw new Error('Anexe pelo menos um vídeo.');
        const fd = new FormData();
        toneFiles.forEach(f => fd.append('files', f));
        fd.append('name', finalName); fd.append('notes', toneNotes);
        res = await axios.post(`${API_URL}/tone/files`, fd, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } });
      } else {
        const links = toneLinks.split('\n').map(l => l.trim()).filter(Boolean);
        if (links.length === 0) throw new Error('Insira pelo menos um link.');
        res = await axios.post(`${API_URL}/tone/links`, { links, name: finalName, notes: toneNotes }, { headers: { Authorization: `Bearer ${token}` } });
      }
      if (res.data.taskId) setToneTaskId(res.data.taskId);
    } catch (err) { setToneError(err.response?.data?.detail || err.message); setToneLoading(false); }
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
    const a = document.createElement('a'); a.href = url; a.download = `tom_${tone.name.replace(/\s+/g, '_')}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Generate ideas ───
  const handleGenerate = async () => {
    const fullPrompt = segments.map(s => s.type === 'ref' ? `[Referência: ${s.analysis.title}]` : s.value).join('');
    if (!fullPrompt.trim()) return;

    setGenerating(true);
    setErrorToast(null);
    try {
      const token = await getAccessToken();
      const res = await axios.post(`${API_URL}/content/generate`, {
        prompt: fullPrompt,
        tone_id: selectedToneId || null,
        base_id: selectedBaseId || null,
        reference_ids: selectedRefs.map(r => r.id),
        quantity,
      }, { headers: { Authorization: `Bearer ${token}` } });

      setIdeas(prev => [...res.data, ...prev]);
      setSelectedIdeas([]);
      setActiveTab('ideas');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Erro ao gerar conteúdo. Tente novamente.';
      setErrorToast(msg);
      setTimeout(() => setErrorToast(null), 5000);
    } finally {
      setGenerating(false);
    }
  };

  const toggleIdeaSelect = (id) => {
    setSelectedIdeas(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleClearAll = async () => {
    try {
      const token = await getAccessToken();
      await axios.delete(`${API_URL}/content/ideas`, { headers: { Authorization: `Bearer ${token}` } });
      setIdeas([]);
      setSelectedIdeas([]);
      setClearConfirmOpen(false);
    } catch (err) {
      setErrorToast('Erro ao limpar ideias.');
      setTimeout(() => setErrorToast(null), 5000);
    }
  };

  // ─── Editable quantity ───
  const openQuantityEdit = () => {
    setQuantityInput(String(quantity));
    setQuantityEditing(true);
  };

  const commitQuantityEdit = () => {
    const n = parseInt(quantityInput, 10);
    if (!isNaN(n)) setQuantity(Math.min(MAX_QTY, Math.max(MIN_QTY, n)));
    setQuantityEditing(false);
  };

  // ─── Textarea / segments logic ───
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [activeText]);

  useEffect(() => {
    const h = (e) => { if (mentionRef.current && !mentionRef.current.contains(e.target)) setMentionOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setConfigOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const stepQuantity = (dir) => setQuantity(p => Math.min(MAX_QTY, Math.max(MIN_QTY, p + dir)));

  // Hold-to-repeat on stepper buttons
  const holdTimerRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const startHold = (dir) => {
    stepQuantity(dir);
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => stepQuantity(dir), 100);
    }, 500);
  };
  const stopHold = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  };
  useEffect(() => () => stopHold(), []);

  const handleTextChange = useCallback((e) => {
    const val = e.target.value;
    setSegments(prev => { const u = [...prev]; u[u.length - 1] = { type: 'text', value: val }; return u; });
    const cursor = e.target.selectionStart;
    const atMatch = val.slice(0, cursor).match(/@([^@\n]*)$/);
    if (atMatch) { setMentionQuery(atMatch[1]); setMentionOpen(true); setMentionIdx(0); }
    else setMentionOpen(false);
  }, []);

  const insertRef = useCallback((analysis) => {
    const cursor = textareaRef.current?.selectionStart || activeText.length;
    const before = activeText.slice(0, cursor).replace(/@[^@\n]*$/, '');
    const after = activeText.slice(cursor);
    setSegments(prev => [...prev.slice(0, -1), { type: 'text', value: before }, { type: 'ref', analysis }, { type: 'text', value: after }]);
    setMentionOpen(false); setMentionQuery('');
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [activeText]);

  const removeRef = useCallback((refId) => {
    setSegments(prev => {
      const idx = prev.findIndex(s => s.type === 'ref' && s.analysis.id === refId);
      if (idx === -1) return prev;
      const ps = prev[idx - 1], ns = prev[idx + 1];
      const merged = (ps?.type === 'text' ? ps.value : '') + (ns?.type === 'text' ? ns.value : '');
      const s = ps?.type === 'text' ? idx - 1 : idx;
      const e = ns?.type === 'text' ? idx + 2 : idx + 1;
      const r = [...prev.slice(0, s), { type: 'text', value: merged }, ...prev.slice(e)];
      return r.length === 0 ? [{ type: 'text', value: '' }] : r;
    });
  }, []);

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setUploadedImages(p => [...p, ...files]);
    e.target.value = '';
  };

  const handleKeyDown = (e) => {
    if (mentionOpen && filteredAnalyses.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, filteredAnalyses.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); insertRef(filteredAnalyses[mentionIdx]); return; }
      else if (e.key === 'Escape') { e.preventDefault(); setMentionOpen(false); return; }
    }

    // Backspace at start of textarea → remove previous ref chip
    if (e.key === 'Backspace' && !mentionOpen) {
      const cursor = textareaRef.current?.selectionStart || 0;
      if (cursor === 0 && activeText === '' && segments.length > 1) {
        // Find last ref before this text segment
        const lastRefIdx = segments.length - 2;
        if (segments[lastRefIdx]?.type === 'ref') {
          e.preventDefault();
          removeRef(segments[lastRefIdx].analysis.id);
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) { e.preventDefault(); if (hasContent && !generating) handleGenerate(); }
  };

  // ─── Helpers for modal sub-pages ───
  const isSubPage = configTab === 'create' || configTab === 'view' || configTab === 'tone-create' || configTab === 'tone-view';
  const goBack = () => setConfigTab(configTab.startsWith('tone') ? 'tone' : 'bases');

  return (
    <div className="flex flex-col h-screen transition-all duration-300" style={{ marginLeft: collapsed ? 72 : 260 }}>
      {/* ═══ TABS + CONTROLS ═══ */}
      <div className="shrink-0 px-8 pt-6">
        <div className="flex items-center gap-2">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            const activeStyle = tab.pill && isActive
              ? 'bg-white/[0.08] border border-white/[0.1] text-white'
              : 'border border-transparent';
            const textColor = isActive ? 'text-white' : 'text-white/40 hover:text-white/60';
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 ${activeStyle} ${textColor}`}
              >
                <Icon size={14} strokeWidth={1.8} className="shrink-0" />
                {tab.label}
              </button>
            );
          })}

          <div className="flex-1" />

          {/* Grid size slider */}
          <div className="flex items-center gap-2">
            <LayoutGrid size={14} strokeWidth={1.5} className="text-gray-600" />
            <input
              type="range"
              min={4}
              max={6}
              value={gridCols}
              onChange={(e) => setGridCols(Number(e.target.value))}
              className="w-20 h-1 appearance-none bg-white/[0.08] rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gray-400 [&::-webkit-slider-thumb]:hover:bg-white [&::-webkit-slider-thumb]:transition-colors"
            />
            <Grid3x3 size={14} strokeWidth={1.5} className="text-gray-600" />
          </div>

          {/* Clear button + confirmation popup */}
          {ideas.length > 0 && activeTab === 'ideas' && (
            <div className="relative">
              <button
                onClick={() => setClearConfirmOpen(!clearConfirmOpen)}
                className="p-2 rounded-lg bg-white/[0.06] border border-white/[0.08] text-gray-400 hover:text-red-400 hover:bg-red-400/[0.1] hover:border-red-400/20 transition-colors"
                title="Limpar ideias"
              >
                <Trash2 size={14} strokeWidth={1.5} fill="currentColor" />
              </button>
              <AnimatePresence>
                {clearConfirmOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setClearConfirmOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full right-0 mt-2 bg-[#16161a] border border-white/[0.08] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] p-3 z-40 w-52"
                    >
                      <p className="text-[12px] text-gray-300 font-medium mb-2.5">Limpar todas as ideias?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleClearAll}
                          className="flex-1 py-1.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-400 text-[11px] font-bold hover:bg-red-500/25 transition-colors"
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setClearConfirmOpen(false)}
                          className="flex-1 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-gray-400 text-[11px] font-bold hover:bg-white/[0.08] transition-colors"
                        >
                          Não
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
        <div className="h-px bg-white/[0.04] -mx-8 mt-4" />
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="h-full">

            {/* Loading skeleton (Ideias only, while generating) */}
            {activeTab === 'ideas' && generating && (
              <div className={`grid gap-3 ${gridCols === 4 ? 'grid-cols-4' : gridCols === 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>
                {Array.from({ length: quantity }).map((_, i) => (
                  <div key={i} className={`bg-white/[0.03] border border-white/[0.08] rounded-2xl ${cs.pad} animate-pulse flex flex-col gap-2.5`} style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="h-3 bg-white/[0.04] rounded w-16" />
                    <div className="h-5 bg-white/[0.06] rounded w-full" />
                    <div className="h-5 bg-white/[0.05] rounded w-3/4" />
                    <div className="mt-2 pt-2 space-y-2">
                      <div className="h-3.5 bg-white/[0.03] rounded w-full" />
                      <div className="h-3.5 bg-white/[0.03] rounded w-5/6" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Loading spinner for history/saved */}
            {(activeTab === 'history' || activeTab === 'saved') && loadingTab && (
              <div className="h-full flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-gray-600" />
              </div>
            )}

            {/* IDEIAS tab cards */}
            {activeTab === 'ideas' && !generating && ideas.length > 0 && (
              <div className={`grid gap-3 ${gridCols === 4 ? 'grid-cols-4' : gridCols === 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>
                {ideas.map((idea, i) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    index={i}
                    isSelected={selectedIdeas.includes(idea.id)}
                    cs={cs}
                    onToggleSelect={toggleIdeaSelect}
                    onToggleSave={toggleSaveIdea}
                  />
                ))}
              </div>
            )}

            {/* IDEIAS empty state */}
            {activeTab === 'ideas' && !generating && ideas.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                  <Lightbulb size={32} strokeWidth={1.2} className="text-gray-600" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-gray-400">Suas ideias aparecerão aqui</p>
                  <p className="text-[13px] text-gray-600 mt-1.5 max-w-sm">Descreva o que deseja criar na barra abaixo e gere ideias com IA</p>
                </div>
              </div>
            )}

            {/* HISTÓRICO tab: grouped by batch */}
            {activeTab === 'history' && !loadingTab && historyIdeas.length > 0 && (() => {
              // Group consecutive ideas with same batch_id
              const groups = [];
              let currentGroup = null;
              historyIdeas.forEach((idea) => {
                const key = idea.batch_id || idea.created_at;
                if (!currentGroup || currentGroup.key !== key) {
                  currentGroup = { key, timestamp: idea.created_at, items: [] };
                  groups.push(currentGroup);
                }
                currentGroup.items.push(idea);
              });
              return (
                <div className="space-y-8">
                  {groups.map((group, gi) => (
                    <div key={group.key}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-amber-400/70">
                          <Clock size={12} strokeWidth={1.8} />
                          Gerado em {formatDateHeader(group.timestamp)}
                        </div>
                        <div className="flex-1 h-px bg-white/[0.04]" />
                      </div>
                      <div className={`grid gap-3 ${gridCols === 4 ? 'grid-cols-4' : gridCols === 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>
                        {group.items.map((idea, i) => (
                          <IdeaCard
                            key={idea.id}
                            idea={idea}
                            index={i}
                            isSelected={selectedIdeas.includes(idea.id)}
                            cs={cs}
                            onToggleSelect={toggleIdeaSelect}
                            onToggleSave={toggleSaveIdea}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* HISTÓRICO empty state */}
            {activeTab === 'history' && !loadingTab && historyIdeas.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-20 h-20 rounded-3xl bg-amber-500/[0.05] border border-amber-500/15 flex items-center justify-center">
                  <Clock size={32} strokeWidth={1.2} className="text-amber-500/60" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-gray-400">Histórico vazio</p>
                  <p className="text-[13px] text-gray-600 mt-1.5 max-w-sm">Suas ideias geradas aparecerão aqui em ordem cronológica</p>
                </div>
              </div>
            )}

            {/* SALVOS tab */}
            {activeTab === 'saved' && !loadingTab && savedIdeas.length > 0 && (
              <div className={`grid gap-3 ${gridCols === 4 ? 'grid-cols-4' : gridCols === 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>
                {savedIdeas.map((idea, i) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    index={i}
                    isSelected={selectedIdeas.includes(idea.id)}
                    cs={cs}
                    onToggleSelect={toggleIdeaSelect}
                    onToggleSave={toggleSaveIdea}
                    showDate
                  />
                ))}
              </div>
            )}

            {/* FAVORITOS empty state */}
            {activeTab === 'saved' && !loadingTab && savedIdeas.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-20 h-20 rounded-3xl bg-[#2E0B15] border border-[#38161F] flex items-center justify-center">
                  <Heart size={32} strokeWidth={1.5} fill="#E2272F" stroke="#E2272F" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-gray-400">Nenhuma ideia favoritada</p>
                  <p className="text-[13px] text-gray-600 mt-1.5 max-w-sm">Clique no ícone de coração nas ideias para favoritá-las</p>
                </div>
              </div>
            )}

            {/* Desenvolvidos tab — empty for now */}
            {activeTab === 'developed' && (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                  <FileCheck size={32} strokeWidth={1.2} className="text-gray-600" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-gray-400">Seus conteúdos desenvolvidos aparecerão aqui</p>
                  <p className="text-[13px] text-gray-600 mt-1.5 max-w-sm">Desenvolva suas ideias em roteiros completos prontos para gravar</p>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

      </div>

      {/* ═══ ERROR TOAST ═══ */}
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed top-6 right-6 z-[200] bg-red-500/10 border border-red-500/20 text-red-400 px-5 py-3 rounded-xl text-[13px] font-semibold flex items-center gap-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl"
          >
            <AlertCircle size={15} strokeWidth={2} />
            {errorToast}
            <button onClick={() => setErrorToast(null)} className="ml-2 opacity-60 hover:opacity-100 transition-opacity"><X size={13} strokeWidth={2.5} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ DEVELOP BUTTON (floating above prompt bar) ═══ */}
      <AnimatePresence>
        {selectedIdeas.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="shrink-0 flex justify-center px-6 pb-3"
          >
            <button className="px-12 py-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-[15px] font-bold shadow-[0_8px_32px_rgba(37,99,235,0.35)] transition-colors duration-200">
              Criar conteúdo · {selectedIdeas.length}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ FLOATING PROMPT BAR ═══ */}
      <div className="shrink-0 flex justify-center px-6 pb-7">
        <div className="w-full max-w-[800px] bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-3xl px-6 pt-5 pb-5 shadow-[0_-8px_40px_rgba(0,0,0,0.35)]">
          {uploadedImages.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              {uploadedImages.map((file, i) => <ImageThumb key={i} file={file} onRemove={() => setUploadedImages(p => p.filter((_, j) => j !== i))} />)}
            </div>
          )}

          <div className="relative">
            <div className="flex flex-wrap items-center gap-1.5 min-h-[28px] cursor-text" onClick={() => textareaRef.current?.focus()}>
              <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="shrink-0 w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-gray-600 hover:text-gray-300 hover:bg-white/[0.07] transition-all duration-200" title="Anexar imagem">
                <ImagePlus size={15} strokeWidth={1.8} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />

              {segments.map((seg, i) => {
                if (seg.type === 'ref') return <RefChip key={`ref-${seg.analysis.id}`} analysis={seg.analysis} onRemove={removeRef} />;
                if (i === segments.length - 1) return (
                  <textarea key="active-input" ref={textareaRef} value={seg.value} onChange={handleTextChange} onKeyDown={handleKeyDown}
                    placeholder={segments.length === 1 && !seg.value ? 'Descreva o conteúdo que deseja criar... Use @ para referenciar análises' : ''} rows={1}
                    className="flex-1 min-w-[120px] bg-transparent text-[14px] text-white placeholder-gray-600 resize-none outline-none custom-scrollbar leading-relaxed py-1" />
                );
                if (!seg.value) return null;
                return <span key={`text-${i}`} className="text-[14px] text-white whitespace-pre-wrap leading-relaxed py-1">{seg.value}</span>;
              })}
            </div>

            <AnimatePresence>
              {mentionOpen && filteredAnalyses.length > 0 && (
                <motion.div ref={mentionRef} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }}
                  className="absolute bottom-full mb-3 left-0 w-80 bg-[#16161a] border border-white/[0.08] rounded-xl shadow-[0_16px_56px_rgba(0,0,0,0.6)] overflow-hidden z-50">
                  <div className="px-3.5 py-2.5 border-b border-white/[0.06]"><p className="data-label">Referenciar análise</p></div>
                  <div className="max-h-52 overflow-y-auto custom-scrollbar py-1">
                    {filteredAnalyses.map((a, i) => (
                      <button key={a.id} onClick={() => insertRef(a)} className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${i === mentionIdx ? 'bg-white/[0.06] text-white' : 'text-gray-400 hover:bg-white/[0.04]'}`}>
                        <div className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.04] flex items-center justify-center shrink-0 overflow-hidden">
                          {a.thumbnail_url ? <img src={resolveThumbnailUrl(a.thumbnail_url)} alt="" className="w-full h-full object-cover" /> : <Video size={14} strokeWidth={1.5} className="text-gray-500" />}
                        </div>
                        <span className="text-[13px] font-medium truncate">{a.title}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 mt-5">
            {/* Base button */}
            <button
              onClick={() => { setConfigOpen(true); setConfigTab('bases'); fetchKnowledgeBases(); fetchTones(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.05] text-[13px] font-semibold transition-all duration-200 shrink-0 ${
                activeBase ? 'text-primary border-primary/20' : 'text-gray-500 hover:text-gray-300 hover:border-white/[0.08]'
              }`}
            >
              <BookOpen size={14} strokeWidth={1.8} className={activeBase ? 'text-primary' : 'text-gray-500'} />
              {activeBase ? activeBase.name : 'Base'}
              <ChevronDown size={12} />
            </button>

            {/* Tom button */}
            <button
              onClick={() => { setConfigOpen(true); setConfigTab('tone'); fetchKnowledgeBases(); fetchTones(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.05] text-[13px] font-semibold transition-all duration-200 shrink-0 ${
                activeTone ? 'text-primary border-primary/20' : 'text-gray-500 hover:text-gray-300 hover:border-white/[0.08]'
              }`}
            >
              <Mic size={14} strokeWidth={1.8} className={activeTone ? 'text-primary' : 'text-gray-500'} />
              {activeTone ? activeTone.name : 'Tom'}
              <ChevronDown size={12} />
            </button>

            <div className="flex items-center gap-0 rounded-xl bg-white/[0.04] border border-white/[0.05]">
              <button
                onMouseDown={() => startHold(-1)}
                onMouseUp={stopHold}
                onMouseLeave={stopHold}
                onTouchStart={() => startHold(-1)}
                onTouchEnd={stopHold}
                disabled={quantity <= MIN_QTY}
                className="px-2.5 py-2 text-gray-500 hover:text-white disabled:opacity-30 transition-colors rounded-l-xl"
              ><Minus size={14} strokeWidth={2} /></button>
              {quantityEditing ? (
                <input
                  type="number"
                  min={MIN_QTY}
                  max={MAX_QTY}
                  value={quantityInput}
                  autoFocus
                  onChange={(e) => setQuantityInput(e.target.value)}
                  onBlur={commitQuantityEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitQuantityEdit(); }
                    if (e.key === 'Escape') { e.preventDefault(); setQuantityEditing(false); }
                  }}
                  className="px-2 py-2 text-[13px] font-bold text-white tabular-nums w-[40px] text-center bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              ) : (
                <button
                  onClick={openQuantityEdit}
                  className="px-3 py-2 text-[13px] font-bold text-white tabular-nums min-w-[32px] text-center select-none hover:bg-white/[0.04] transition-colors"
                  title="Clique para editar"
                >
                  {quantity}
                </button>
              )}
              <button
                onMouseDown={() => startHold(1)}
                onMouseUp={stopHold}
                onMouseLeave={stopHold}
                onTouchStart={() => startHold(1)}
                onTouchEnd={stopHold}
                disabled={quantity >= MAX_QTY}
                className="px-2.5 py-2 text-gray-500 hover:text-white disabled:opacity-30 transition-colors rounded-r-xl"
              ><Plus size={14} strokeWidth={2} /></button>
            </div>
            <div className="flex-1" />
            <button onClick={handleGenerate} disabled={!hasContent || generating} className="btn-primary flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none">
              {generating ? <><Loader2 size={14} className="animate-spin" /> Gerando...</> : <><StarFilled size={14} /> Gerar</>}
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
           BASE / TOM CONFIG MODAL (from Creator)
         ═══════════════════════════════════════════ */}
      <AnimatePresence>
        {configOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/50" onClick={() => setConfigOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="glass-raised w-full max-w-4xl max-h-[85vh] rounded-4xl flex flex-col overflow-hidden shadow-modal" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="pt-7 px-5 pb-5 border-b border-white/[0.06] flex items-center justify-between bg-surface/60">
                <div className="flex items-center gap-3">
                  {isSubPage && (
                    <button onClick={goBack} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all">
                      <ChevronDown size={16} className="rotate-90" />
                    </button>
                  )}

                  {configTab === 'bases' && <><BookOpen size={20} strokeWidth={1.5} className="text-primary" /><h3 className="text-lg font-extrabold text-white tracking-tight">Bases</h3></>}
                  {configTab === 'tone' && <><Mic size={20} strokeWidth={1.5} className="text-primary" /><h3 className="text-lg font-extrabold text-white tracking-tight">Tom</h3></>}
                  {configTab === 'create' && <><BookOpen size={20} strokeWidth={1.5} className="text-primary" /><h3 className="text-lg font-extrabold text-white tracking-tight">{kbEditId ? 'Editar Base' : 'Nova Base'}</h3></>}
                  {configTab === 'view' && <><BookOpen size={20} strokeWidth={1.5} className="text-primary" /><h3 className="text-lg font-extrabold text-white tracking-tight">Visualizar Base</h3></>}
                  {configTab === 'tone-view' && <><Mic size={20} strokeWidth={1.5} className="text-primary" /><h3 className="text-lg font-extrabold text-white tracking-tight">Visualizar Tom</h3></>}
                </div>

                <div className="flex items-center gap-2">
                  {configTab === 'create' && (
                    <>
                      <button onClick={handleKBSave} className={`btn-magnetic px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all ${kbSaved ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-[#18181d] text-white border border-white/[0.06] hover:border-white/[0.1]'}`}>
                        {kbSaved ? <><CheckCircle2 size={13} strokeWidth={2.5} /> Salvo!</> : <><Check size={13} strokeWidth={2.5} /> Salvar</>}
                      </button>
                      <button onClick={handleKBCompile} disabled={kbSelectedIds.length === 0 || kbCompiling} className="btn-primary px-5 py-2 rounded-xl text-xs flex items-center gap-2 disabled:opacity-40">
                        {kbCompiling ? <><Loader2 size={13} className="animate-spin" /> Compilando...</> : <><StarFilled size={11} /> {kbEditId ? 'Analisar novamente' : 'Iniciar Análise'}</>}
                      </button>
                    </>
                  )}
                  {configTab === 'view' && kbViewingBase?.compiled_md && (
                    <button onClick={() => handleKBExport(kbViewingBase)} className="btn-magnetic bg-[#18181d] text-white px-4 py-2 rounded-xl text-xs flex items-center gap-2 border border-white/[0.06]"><Download size={13} strokeWidth={2.5} /> Exportar</button>
                  )}
                  {configTab === 'tone-view' && (
                    <button onClick={() => handleToneExport(tones.find(t => t.id === toneViewingId))} className="btn-magnetic bg-[#18181d] text-white px-4 py-2 rounded-xl text-xs flex items-center gap-2 border border-white/[0.06]"><Download size={13} strokeWidth={2.5} /> Exportar</button>
                  )}
                  <button onClick={() => setConfigOpen(false)} className="p-2 bg-white/5 hover:bg-white/8 rounded-xl transition-colors text-gray-400 hover:text-white"><X size={16} strokeWidth={2.5} /></button>
                </div>
              </div>

              {/* ── BASES LIST ── */}
              {configTab === 'bases' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                  {kbAllBases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[300px] space-y-4 opacity-60">
                      <div className="p-8 bg-white/[0.03] rounded-3xl border border-white/[0.06]"><BookOpen size={40} strokeWidth={1.5} className="text-primary" /></div>
                      <h4 className="text-lg font-extrabold text-white">Nenhuma base criada</h4>
                      <p className="text-sm text-gray-500 max-w-xs text-center">Selecione vídeos da sua biblioteca para criar uma base de conhecimento compilada.</p>
                      <button onClick={() => openKBCreate()} className="btn-primary px-5 py-2.5 rounded-2xl text-sm flex items-center gap-2"><Plus size={15} strokeWidth={2.5} /> Criar Base</button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button onClick={() => openKBCreate()} className="w-full p-4 bg-white/[0.02] hover:bg-white/[0.04] rounded-2xl border border-dashed border-white/[0.08] hover:border-white/[0.12] transition-all flex items-center justify-center gap-2.5 text-gray-500 hover:text-white text-sm font-semibold">
                        <Plus size={15} strokeWidth={2.5} /> Nova Base
                      </button>
                      {kbAllBases.map(kb => {
                        const ids = kb.selected_ids || [];
                        const thumbs = analyses.filter(a => ids.includes(a.id) && a.thumbnail_url);
                        const isActive = selectedBaseId === kb.id;
                        return (
                          <div key={kb.id} onClick={() => { setSelectedBaseId(kb.id); setConfigOpen(false); }}
                            className={`p-4 rounded-2xl border transition-all flex items-center gap-4 group cursor-pointer ${isActive ? 'bg-primary/5 border-primary/20' : 'bg-[#111113] border-white/[0.06] hover:border-white/[0.1]'}`}>
                            <div className="flex gap-1 shrink-0">
                              {thumbs.slice(0, 3).map((a, i) => (
                                <div key={i} className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.04]">
                                  <img src={resolveThumbnailUrl(a.thumbnail_url)} alt="" className="w-full h-full object-cover opacity-70" />
                                </div>
                              ))}
                              {thumbs.length === 0 && <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center"><BookOpen size={14} strokeWidth={1.5} className="text-gray-700" /></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">{kb.name}</h4>
                              <div className="flex items-center gap-2 text-[11px] font-mono text-gray-600 mt-0.5">
                                <span>{ids.length} vídeo{ids.length !== 1 ? 's' : ''}</span>
                                {kb.compiled_md ? <span className="text-primary flex items-center gap-1"><Check size={9} strokeWidth={1.5} /> Compilada</span> : <span className="text-amber-500/70">Pendente</span>}
                                {isActive && <span className="text-primary">· Ativa</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {kb.compiled_md && <button onClick={e => { e.stopPropagation(); setKbViewingBase(kb); setConfigTab('view'); }} className="p-2.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/[0.06]" title="Ver"><Eye size={16} strokeWidth={2.5} /></button>}
                              <button onClick={e => { e.stopPropagation(); openKBCreate(kb); }} className="p-2.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/[0.06]" title="Editar"><Pencil size={16} strokeWidth={2.5} /></button>
                              {kb.compiled_md && <button onClick={e => { e.stopPropagation(); handleKBExport(kb); }} className="p-2.5 rounded-xl text-gray-500 hover:text-primary hover:bg-primary/10" title="Exportar"><Download size={16} strokeWidth={2.5} /></button>}
                              <button onClick={e => { e.stopPropagation(); handleKBDelete(kb.id); }} className="p-2.5 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-400/[0.08]" title="Excluir"><Trash2 size={16} strokeWidth={2.5} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── CREATE / EDIT BASE ── */}
              {configTab === 'create' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-4">
                  <input value={kbEditName} onChange={e => setKbEditName(e.target.value)} className="bg-transparent text-xl font-bold text-white tracking-tight focus:outline-none placeholder-gray-700 border-b border-white/[0.06] pb-3" placeholder="Nome da base..." />
                  <div className="flex items-center justify-between">
                    <p className="text-gray-500 text-xs uppercase tracking-wide">{kbSelectedIds.length}/30 selecionados</p>
                    <div className="relative w-56">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={13} />
                      <input value={kbSearchTerm} onChange={e => setKbSearchTerm(e.target.value)} className="input-field rounded-xl py-2 pl-9 pr-3 text-xs" placeholder="Buscar vídeo..." />
                    </div>
                  </div>
                  {kbCompiling && (
                    <div className="p-4 bg-primary/5 border border-primary/15 rounded-2xl flex items-center gap-3 animate-fade-in">
                      <Loader2 size={18} strokeWidth={1.5} className="animate-spin text-primary" />
                      <div><p className="text-white text-sm font-semibold">Compilando base...</p><p className="text-gray-500 text-sm mt-0.5">Analisando {kbSelectedIds.length} vídeos.</p></div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {analyses.filter(a => a.title?.toLowerCase().includes(kbSearchTerm.toLowerCase())).map(a => {
                      const isSel = kbSelectedIds.includes(a.id);
                      return (
                        <button key={a.id} type="button" onClick={() => toggleKBSelect(a.id)}
                          className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-square group ${isSel ? 'border-primary shadow-glow-sm scale-[1.02]' : 'border-transparent hover:border-white/[0.08]'}`}>
                          {a.thumbnail_url ? <img src={resolveThumbnailUrl(a.thumbnail_url)} alt={a.title} className={`w-full h-full object-cover transition-all ${isSel ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'}`} />
                            : <div className="w-full h-full bg-white/[0.03] flex items-center justify-center"><FileVideo size={20} strokeWidth={1.5} className="text-gray-700" /></div>}
                          <div className={`absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isSel ? 'bg-primary text-white' : 'bg-black/50 text-white/30 opacity-0 group-hover:opacity-100'}`}><Check size={14} strokeWidth={2.5} /></div>
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent"><p className="text-[10px] text-white truncate">{a.title}</p></div>
                        </button>
                      );
                    })}
                  </div>
                  {analyses.length === 0 && <div className="flex-1 flex items-center justify-center opacity-50 py-12"><p className="text-gray-500 text-sm">Biblioteca vazia. Analise vídeos primeiro.</p></div>}
                </div>
              )}

              {/* ── VIEW BASE ── */}
              {configTab === 'view' && kbViewingBase && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                  <h4 className="text-lg font-extrabold text-white mb-1">{kbViewingBase.name}</h4>
                  <p className="text-gray-600 text-xs font-mono mb-7">{(kbViewingBase.selected_ids || []).length} vídeos compilados</p>
                  {kbViewingBase.compiled_md ? <MarkdownRenderer className="max-w-none">{kbViewingBase.compiled_md}</MarkdownRenderer> : <p className="text-gray-500 text-sm italic text-center py-12">Esta base ainda não foi compilada.</p>}
                </div>
              )}

              {/* ── TONE LIST ── */}
              {configTab === 'tone' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                  {tones.length === 0 && !toneCreating && !toneLoading ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[300px] space-y-4 opacity-60">
                      <div className="p-8 bg-white/[0.03] rounded-3xl border border-white/[0.06]"><Mic size={40} strokeWidth={1.5} className="text-primary" /></div>
                      <h4 className="text-lg font-extrabold text-white">Nenhum tom criado</h4>
                      <p className="text-sm text-gray-500 max-w-xs text-center">Envie vídeos de referência para que a IA aprenda o estilo e personalidade do criador.</p>
                      <button onClick={() => setToneCreating(true)} className="btn-primary px-5 py-2.5 rounded-2xl text-sm flex items-center gap-2"><Plus size={15} strokeWidth={2.5} /> Novo Tom</button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {!toneCreating && !toneLoading && (
                        <button onClick={() => setToneCreating(true)} className="w-full p-4 bg-white/[0.02] hover:bg-white/[0.04] rounded-2xl border border-dashed border-white/[0.08] hover:border-white/[0.12] transition-all flex items-center justify-center gap-2.5 text-gray-500 hover:text-white text-sm font-semibold">
                          <Plus size={15} strokeWidth={2.5} /> Novo Tom
                        </button>
                      )}

                      {/* Create/loading form */}
                      {(toneCreating || toneLoading) && (
                        <div className="animate-fade-in">
                          {toneLoading ? (
                            <div className="bg-[#111113] border border-white/[0.06] rounded-2xl p-6 flex flex-col items-center gap-4">
                              <div className="relative w-28 h-28">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                                  <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/[0.04]" />
                                  <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={502} strokeDashoffset={502 - (502 * toneProgress) / 100} strokeLinecap="round" className="text-primary transition-all duration-700 ease-out" style={{ filter: 'drop-shadow(0 0 12px rgba(55, 178, 77, 0.5))' }} />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-bold text-white font-mono">{toneProgress}%</span></div>
                              </div>
                              <p className="text-gray-400 font-normal text-sm animate-pulse text-center max-w-xs">{toneLogs.length > 0 ? toneLogs[toneLogs.length - 1] : 'Processando...'}</p>
                            </div>
                          ) : (
                            <div className="bg-[#111113] border border-white/[0.06] rounded-2xl p-5 space-y-4">
                              <div className="flex items-center justify-between">
                                <input value={toneName} onChange={e => setToneName(e.target.value)} className="bg-transparent text-lg font-bold text-white tracking-tight focus:outline-none placeholder-gray-700 border-b border-white/[0.06] pb-2 flex-1" placeholder="Dê um nome para este tom..." />
                                <button onClick={() => { setToneCreating(false); setToneName(''); setToneFiles([]); setToneLinks(''); setToneNotes(''); setToneError(null); }} className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-white/[0.06] transition-colors ml-3 shrink-0"><X size={16} strokeWidth={2.5} /></button>
                              </div>
                              <div className="flex gap-1.5 p-1 bg-[#18181d] border border-white/[0.06] rounded-xl w-fit">
                                <button onClick={() => setToneTab('upload')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${toneTab === 'upload' ? 'bg-primary/20 text-primary' : 'text-gray-500 hover:text-gray-300'}`}><Upload size={13} /> Arquivos</button>
                                <button onClick={() => setToneTab('link')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${toneTab === 'link' ? 'bg-primary/20 text-primary' : 'text-gray-500 hover:text-gray-300'}`}><LinkIcon size={13} /> Links</button>
                              </div>
                              {toneTab === 'upload' ? (
                                <div {...toneDropzone.getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${toneDropzone.isDragActive ? 'border-primary bg-primary/5' : 'border-white/[0.06] hover:border-white/[0.1] hover:bg-white/[0.02]'} ${toneFiles.length > 0 ? 'border-green-500/30 bg-green-500/[0.03]' : ''}`}>
                                  <input {...toneDropzone.getInputProps()} />
                                  <div className="flex flex-col items-center gap-2">
                                    <FileVideo size={28} strokeWidth={1.5} className={toneFiles.length > 0 ? 'text-green-400' : 'text-gray-500'} />
                                    {toneFiles.length > 0 ? <><p className="text-white font-bold text-sm">{toneFiles.length} arquivo(s) na fila</p><p className="text-sm text-gray-500 truncate max-w-md">{toneFiles.map(f => f.name).join(', ')}</p></> : <><p className="text-gray-500 font-semibold text-sm">Arraste vídeos aqui</p><p className="text-sm text-gray-600 font-mono">.mp4, .mov — Máx: 10 vídeos</p></>}
                                  </div>
                                </div>
                              ) : (
                                <textarea value={toneLinks} onChange={e => setToneLinks(e.target.value)} className="input-field rounded-2xl p-4 resize-none w-full" rows="3" placeholder={"https://youtube.com/shorts/...\nhttps://www.instagram.com/reel/..."} />
                              )}
                              <textarea value={toneNotes} onChange={e => setToneNotes(e.target.value)} className="input-field rounded-2xl p-4 resize-none w-full text-xs" rows="2" placeholder="Informações adicionais sobre o tom (opcional)..." />
                              {toneError && <div className="p-3 bg-red-500/8 border border-red-500/15 text-red-400 rounded-xl text-sm font-semibold flex items-center gap-2 animate-fade-in"><AlertCircle size={14} strokeWidth={1.5} /> {toneError}</div>}
                              <button onClick={handleToneAnalyze} disabled={toneLoading || (toneTab === 'upload' ? toneFiles.length === 0 : !toneLinks.trim())} className="w-full py-3 btn-white rounded-2xl flex justify-center items-center gap-2 text-sm disabled:opacity-40 group">
                                <StarFilled size={13} className="group-hover:text-primary transition-colors" /> Analisar Tom
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tone cards */}
                      {tones.map(t => {
                        const isActive = selectedToneId === t.id;
                        return (
                          <div key={t.id} onClick={() => { setSelectedToneId(t.id); setConfigOpen(false); }}
                            className={`p-4 rounded-2xl border transition-all flex items-center gap-4 group cursor-pointer ${isActive ? 'bg-primary/5 border-primary/20' : 'bg-[#111113] border-white/[0.06] hover:border-white/[0.1]'}`}>
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.04] shrink-0 flex items-center justify-center">
                              {t.thumbnail_url ? <img src={resolveThumbnailUrl(t.thumbnail_url)} alt="" className="w-full h-full object-cover opacity-70" /> : <Mic size={14} strokeWidth={1.5} className="text-gray-700" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">{t.name}</h4>
                              <div className="flex items-center gap-2 text-[11px] font-mono text-gray-600 mt-0.5">
                                <span>{t.video_count} vídeo{t.video_count !== 1 ? 's' : ''}</span>
                                {t.tone_md ? <span className="text-primary flex items-center gap-1"><Check size={9} strokeWidth={1.5} /> Pronto</span> : <span className="text-amber-500/70">Pendente</span>}
                                {isActive && <span className="text-primary">· Ativo</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {t.tone_md && <button onClick={e => { e.stopPropagation(); setToneViewingId(t.id); setConfigTab('tone-view'); }} className="p-2 rounded-lg text-gray-600 hover:text-white hover:bg-white/[0.05]" title="Ver"><Eye size={14} strokeWidth={2.5} /></button>}
                              {t.tone_md && <button onClick={e => { e.stopPropagation(); handleToneExport(t); }} className="p-2 rounded-lg text-gray-600 hover:text-primary hover:bg-primary/10" title="Exportar"><Download size={14} strokeWidth={2.5} /></button>}
                              <button onClick={e => { e.stopPropagation(); handleToneDelete(t.id); }} className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/[0.08]" title="Excluir"><Trash2 size={14} strokeWidth={2.5} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── VIEW TONE ── */}
              {configTab === 'tone-view' && (() => {
                const t = tones.find(x => x.id === toneViewingId);
                if (!t) return null;
                return (
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <h4 className="text-lg font-extrabold text-white mb-1">{t.name}</h4>
                    <p className="text-gray-600 text-xs font-mono mb-7">{t.video_count} vídeos analisados</p>
                    {t.tone_md ? <MarkdownRenderer className="max-w-none">{t.tone_md}</MarkdownRenderer> : <p className="text-gray-500 text-sm italic text-center py-12">Tom ainda não processado.</p>}
                  </div>
                );
              })()}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ContentGenerator;
