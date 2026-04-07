import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Lightbulb, FileCheck, Minus, Plus,
  ChevronDown, Video, X, ImagePlus, BookOpen, Mic, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSidebar } from '../contexts/SidebarContext';

// ─── Filled 4-point star icon ───
const StarFilled = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 0L15 9L24 12L15 15L12 24L9 15L0 12L9 9L12 0Z" />
  </svg>
);

// ─── Tab config ───
const TABS = [
  { id: 'ideas', label: 'Ideias' },
  { id: 'developed', label: 'Desenvolvidos' },
];

const MIN_QTY = 1;
const MAX_QTY = 20;

// ─── Mock data ───
const MOCK_ANALYSES = [
  { id: 1, title: 'Como ganhar 10k seguidores em 30 dias', thumbnail: null },
  { id: 2, title: 'Rotina matinal que viralizou no TikTok', thumbnail: null },
  { id: 3, title: 'Por que esse Reels teve 2M de views', thumbnail: null },
  { id: 4, title: 'Hook magnético — análise frame a frame', thumbnail: null },
];

const MOCK_BASES = [
  { id: 1, name: 'Hooks Virais', video_count: 8, compiled: true },
  { id: 2, name: 'Storytelling Curto', video_count: 5, compiled: true },
  { id: 3, name: 'CTAs que Convertem', video_count: 12, compiled: false },
];

const MOCK_TONES = [
  { id: 1, name: 'Casual Educativo', video_count: 4, ready: true },
  { id: 2, name: 'Provocativo Direto', video_count: 6, ready: true },
  { id: 3, name: 'Storyteller Emocional', video_count: 3, ready: false },
];

// ─── Inline reference chip ───
const RefChip = ({ analysis, onRemove }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/[0.08] text-[12px] font-semibold text-gray-300 whitespace-nowrap select-none shrink-0">
    <Video size={11} strokeWidth={2} className="shrink-0 text-primary/70" />
    <span className="truncate max-w-[120px]">{analysis.title}</span>
    <button
      onClick={(e) => { e.stopPropagation(); onRemove(analysis.id); }}
      className="opacity-40 hover:opacity-100 transition-opacity"
    >
      <X size={10} strokeWidth={2.5} />
    </button>
  </span>
);

// ─── Uploaded image thumbnail ───
const ImageThumb = ({ file, onRemove }) => (
  <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/[0.08] shrink-0 group">
    <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
    <button
      onClick={onRemove}
      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
    >
      <X size={12} strokeWidth={2.5} className="text-white" />
    </button>
  </div>
);

const ContentGenerator = () => {
  const { collapsed } = useSidebar();

  // Tabs
  const [activeTab, setActiveTab] = useState('ideas');

  // Prompt bar — segments model: [{type:'text', value:''}, {type:'ref', analysis:{...}}, ...]
  // Invariant: always starts & ends with a text segment, no adjacent text segments
  const [segments, setSegments] = useState([{ type: 'text', value: '' }]);
  const [selectedBaseId, setSelectedBaseId] = useState(null);
  const [selectedToneId, setSelectedToneId] = useState(null);
  const [quantity, setQuantity] = useState(5);
  const [configOpen, setConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState('bases');
  const [uploadedImages, setUploadedImages] = useState([]);

  // @ mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);

  const textareaRef = useRef(null);
  const mentionRef = useRef(null);
  const fileInputRef = useRef(null);

  // Derived
  const selectedRefs = segments.filter(s => s.type === 'ref').map(s => s.analysis);
  const activeText = segments[segments.length - 1].value;
  const hasContent = segments.some(s => (s.type === 'text' && s.value.trim()) || s.type === 'ref');

  // Filtered analyses for @ popup
  const filteredAnalyses = MOCK_ANALYSES.filter((a) =>
    !selectedRefs.find((r) => r.id === a.id) &&
    a.title.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  // ─── Auto-resize textarea ───
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [activeText]);

  // ─── Close dropdowns on outside click ───
  useEffect(() => {
    const handleClick = (e) => {
      if (mentionRef.current && !mentionRef.current.contains(e.target)) setMentionOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ─── Close modal on ESC ───
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setConfigOpen(false); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  // ─── Quantity stepper ───
  const stepQuantity = (dir) => {
    setQuantity((prev) => Math.min(MAX_QTY, Math.max(MIN_QTY, prev + dir)));
  };

  // ─── Handle text change in active (last) textarea ───
  const handleTextChange = useCallback((e) => {
    const val = e.target.value;
    setSegments((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = { type: 'text', value: val };
      return updated;
    });

    // @ mention detection
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@([^@\n]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionOpen(true);
      setMentionIdx(0);
    } else {
      setMentionOpen(false);
    }
  }, []);

  // ─── Insert reference at @ position ───
  const insertRef = useCallback((analysis) => {
    const cursor = textareaRef.current?.selectionStart || activeText.length;
    const before = activeText.slice(0, cursor).replace(/@[^@\n]*$/, '');
    const after = activeText.slice(cursor);

    setSegments((prev) => [
      ...prev.slice(0, -1),
      { type: 'text', value: before },
      { type: 'ref', analysis },
      { type: 'text', value: after },
    ]);

    setMentionOpen(false);
    setMentionQuery('');
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [activeText]);

  // ─── Remove reference chip ───
  const removeRef = useCallback((refId) => {
    setSegments((prev) => {
      const idx = prev.findIndex(s => s.type === 'ref' && s.analysis.id === refId);
      if (idx === -1) return prev;

      const prevSeg = prev[idx - 1];
      const nextSeg = prev[idx + 1];
      const mergedText = (prevSeg?.type === 'text' ? prevSeg.value : '') +
                         (nextSeg?.type === 'text' ? nextSeg.value : '');

      const startSlice = prevSeg?.type === 'text' ? idx - 1 : idx;
      const endSlice = nextSeg?.type === 'text' ? idx + 2 : idx + 1;

      const result = [
        ...prev.slice(0, startSlice),
        { type: 'text', value: mergedText },
        ...prev.slice(endSlice),
      ];

      return result.length === 0 ? [{ type: 'text', value: '' }] : result;
    });
  }, []);

  // ─── Image upload ───
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setUploadedImages((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeImage = (idx) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── Keyboard nav for @ popup ───
  const handleKeyDown = (e) => {
    if (mentionOpen && filteredAnalyses.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => Math.min(i + 1, filteredAnalyses.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        insertRef(filteredAnalyses[mentionIdx]);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) {
      e.preventDefault();
    }
  };

  const activeBase = MOCK_BASES.find(b => b.id === selectedBaseId);
  const activeTone = MOCK_TONES.find(t => t.id === selectedToneId);

  return (
    <div
      className="flex flex-col h-screen transition-all duration-300"
      style={{ marginLeft: collapsed ? 72 : 260 }}
    >
      {/* ═══════ TABS (top of page) ═══════ */}
      <div className="shrink-0 px-8 pt-6">
        <div className="flex items-center gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative pb-2.5 text-[13px] font-semibold transition-colors duration-200 ${
                activeTab === tab.id
                  ? 'text-white'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
        <div className="h-px bg-white/[0.04] -mx-8" />
      </div>

      {/* ═══════ CONTENT GRID ═══════ */}
      <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="h-full"
          >
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                {activeTab === 'ideas' ? (
                  <Lightbulb size={32} strokeWidth={1.2} className="text-gray-600" />
                ) : (
                  <FileCheck size={32} strokeWidth={1.2} className="text-gray-600" />
                )}
              </div>
              <div>
                <p className="text-[15px] font-semibold text-gray-400">
                  {activeTab === 'ideas'
                    ? 'Suas ideias aparecerão aqui'
                    : 'Seus conteúdos desenvolvidos aparecerão aqui'}
                </p>
                <p className="text-[13px] text-gray-600 mt-1.5 max-w-sm">
                  {activeTab === 'ideas'
                    ? 'Descreva o que deseja criar na barra abaixo e gere ideias com IA'
                    : 'Desenvolva suas ideias em roteiros completos prontos para gravar'}
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ═══════ FLOATING BOTTOM PROMPT BAR ═══════ */}
      <div className="shrink-0 flex justify-center px-6 pb-7">
        <div className="w-full max-w-[800px] bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-3xl px-6 pt-5 pb-5 shadow-[0_-8px_40px_rgba(0,0,0,0.35)]">

          {/* Uploaded images row */}
          {uploadedImages.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              {uploadedImages.map((file, i) => (
                <ImageThumb key={i} file={file} onRemove={() => removeImage(i)} />
              ))}
            </div>
          )}

          {/* Textarea with inline ref chips at correct positions */}
          <div className="relative">
            <div
              className="flex flex-wrap items-center gap-1.5 min-h-[28px] cursor-text"
              onClick={() => textareaRef.current?.focus()}
            >
              {/* + button for image upload */}
              <button
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="shrink-0 w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-gray-600 hover:text-gray-300 hover:bg-white/[0.07] hover:border-white/[0.1] transition-all duration-200"
                title="Anexar imagem de referência"
              >
                <ImagePlus size={15} strokeWidth={1.8} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />

              {/* Render segments in order: static text → chip → ... → active textarea */}
              {segments.map((seg, i) => {
                if (seg.type === 'ref') {
                  return <RefChip key={`ref-${seg.analysis.id}`} analysis={seg.analysis} onRemove={removeRef} />;
                }

                // Last text segment → active textarea
                if (i === segments.length - 1) {
                  return (
                    <textarea
                      key="active-input"
                      ref={textareaRef}
                      value={seg.value}
                      onChange={handleTextChange}
                      onKeyDown={handleKeyDown}
                      placeholder={segments.length === 1 && !seg.value
                        ? 'Descreva o conteúdo que deseja criar... Use @ para referenciar análises'
                        : ''
                      }
                      rows={1}
                      className="flex-1 min-w-[120px] bg-transparent text-[14px] text-white placeholder-gray-600 resize-none outline-none custom-scrollbar leading-relaxed py-1"
                    />
                  );
                }

                // Previous text segments → static spans
                if (!seg.value) return null;
                return (
                  <span key={`text-${i}`} className="text-[14px] text-white whitespace-pre-wrap leading-relaxed py-1">
                    {seg.value}
                  </span>
                );
              })}
            </div>

            {/* @ Mention popup */}
            <AnimatePresence>
              {mentionOpen && filteredAnalyses.length > 0 && (
                <motion.div
                  ref={mentionRef}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full mb-3 left-0 w-80 bg-[#16161a] border border-white/[0.08] rounded-xl shadow-[0_16px_56px_rgba(0,0,0,0.6)] overflow-hidden z-50"
                >
                  <div className="px-3.5 py-2.5 border-b border-white/[0.06]">
                    <p className="data-label">Referenciar análise</p>
                  </div>
                  <div className="max-h-52 overflow-y-auto custom-scrollbar py-1">
                    {filteredAnalyses.map((a, i) => (
                      <button
                        key={a.id}
                        onClick={() => insertRef(a)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-100 ${
                          i === mentionIdx
                            ? 'bg-white/[0.06] text-white'
                            : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.04] flex items-center justify-center shrink-0">
                          <Video size={14} strokeWidth={1.5} className="text-gray-500" />
                        </div>
                        <span className="text-[13px] font-medium truncate">{a.title}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2 mt-5">
            {/* Active selection badges */}
            {activeBase && (
              <div className="flex items-center gap-1.5 bg-primary/12 text-primary px-3 py-1.5 rounded-lg text-[11px] font-bold border border-primary/15 animate-fade-in">
                <BookOpen size={12} strokeWidth={1.5} />
                <span className="truncate max-w-[120px]">{activeBase.name}</span>
                <button onClick={() => setSelectedBaseId(null)} className="hover:text-white transition-colors ml-0.5 bg-black/20 rounded-full p-0.5">
                  <X size={9} strokeWidth={2.5} />
                </button>
              </div>
            )}
            {activeTone && (
              <div className="flex items-center gap-1.5 bg-purple-500/12 text-purple-400 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-purple-500/15 animate-fade-in">
                <Mic size={12} strokeWidth={1.5} />
                <span className="truncate max-w-[120px]">{activeTone.name}</span>
                <button onClick={() => setSelectedToneId(null)} className="hover:text-white transition-colors ml-0.5 bg-black/20 rounded-full p-0.5">
                  <X size={9} strokeWidth={2.5} />
                </button>
              </div>
            )}

            {/* Base / Tom button */}
            <button
              onClick={() => { setConfigOpen(true); setConfigTab('bases'); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] text-gray-500 hover:text-gray-300 transition-colors shrink-0 whitespace-nowrap"
            >
              Base / Tom <ChevronDown size={13} />
            </button>

            {/* Quantity stepper */}
            <div className="flex items-center gap-0 rounded-xl bg-white/[0.04] border border-white/[0.05]">
              <button
                onClick={() => stepQuantity(-1)}
                disabled={quantity <= MIN_QTY}
                className="px-2.5 py-2 text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500 transition-colors rounded-l-xl"
              >
                <Minus size={14} strokeWidth={2} />
              </button>
              <span className="px-3 py-2 text-[13px] font-bold text-white tabular-nums min-w-[32px] text-center select-none">
                {quantity}
              </span>
              <button
                onClick={() => stepQuantity(1)}
                disabled={quantity >= MAX_QTY}
                className="px-2.5 py-2 text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500 transition-colors rounded-r-xl"
              >
                <Plus size={14} strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1" />

            {/* Generate button */}
            <button
              disabled={!hasContent}
              className="btn-primary flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
            >
              <StarFilled size={14} />
              Gerar
            </button>
          </div>
        </div>
      </div>

      {/* ═══════ BASE / TOM CONFIG MODAL ═══════ */}
      <AnimatePresence>
        {configOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/50"
            onClick={() => setConfigOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="glass-raised w-full max-w-2xl max-h-[70vh] rounded-3xl flex flex-col overflow-hidden shadow-modal"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="pt-6 px-6 pb-5 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex gap-1 p-1 bg-[#18181d] border border-white/[0.06] rounded-xl">
                  <button
                    onClick={() => setConfigTab('bases')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      configTab === 'bases' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <BookOpen size={13} /> Bases
                  </button>
                  <button
                    onClick={() => setConfigTab('tone')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      configTab === 'tone' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <Mic size={13} /> Tom
                  </button>
                </div>
                <button
                  onClick={() => setConfigOpen(false)}
                  className="p-2 bg-white/5 hover:bg-white/8 rounded-xl transition-colors text-gray-400 hover:text-white"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                {configTab === 'bases' && (
                  <div className="space-y-3">
                    {MOCK_BASES.length === 0 ? (
                      <div className="flex flex-col items-center justify-center min-h-[200px] space-y-4 opacity-60">
                        <div className="p-8 bg-white/[0.03] rounded-3xl border border-white/[0.06]">
                          <BookOpen size={40} strokeWidth={1.5} className="text-primary" />
                        </div>
                        <h4 className="text-lg font-extrabold text-white">Nenhuma base criada</h4>
                        <p className="text-sm text-gray-500 max-w-xs text-center">Crie bases de conhecimento no Hub Analítico.</p>
                      </div>
                    ) : (
                      MOCK_BASES.map((kb) => {
                        const isActive = selectedBaseId === kb.id;
                        return (
                          <div
                            key={kb.id}
                            onClick={() => { setSelectedBaseId(kb.id); setConfigOpen(false); }}
                            className={`p-4 rounded-2xl border transition-all flex items-center gap-4 group cursor-pointer ${
                              isActive ? 'bg-primary/5 border-primary/20' : 'bg-[#111113] border-white/[0.06] hover:border-white/[0.1]'
                            }`}
                          >
                            <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                              <BookOpen size={16} strokeWidth={1.5} className={isActive ? 'text-primary' : 'text-gray-600'} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">{kb.name}</h4>
                              <div className="flex items-center gap-2 text-[11px] font-mono text-gray-600 mt-0.5">
                                <span>{kb.video_count} vídeo{kb.video_count !== 1 ? 's' : ''}</span>
                                {kb.compiled ? (
                                  <span className="text-primary flex items-center gap-1"><Check size={9} strokeWidth={1.5} /> Compilada</span>
                                ) : (
                                  <span className="text-amber-500/70">Pendente</span>
                                )}
                                {isActive && <span className="text-primary">· Ativa</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {configTab === 'tone' && (
                  <div className="space-y-3">
                    {MOCK_TONES.length === 0 ? (
                      <div className="flex flex-col items-center justify-center min-h-[200px] space-y-4 opacity-60">
                        <div className="p-8 bg-white/[0.03] rounded-3xl border border-white/[0.06]">
                          <Mic size={40} strokeWidth={1.5} className="text-primary" />
                        </div>
                        <h4 className="text-lg font-extrabold text-white">Nenhum tom criado</h4>
                        <p className="text-sm text-gray-500 max-w-xs text-center">Crie perfis de voz no Hub Analítico.</p>
                      </div>
                    ) : (
                      MOCK_TONES.map((t) => {
                        const isActive = selectedToneId === t.id;
                        return (
                          <div
                            key={t.id}
                            onClick={() => { setSelectedToneId(t.id); setConfigOpen(false); }}
                            className={`p-4 rounded-2xl border transition-all flex items-center gap-4 group cursor-pointer ${
                              isActive ? 'bg-primary/5 border-primary/20' : 'bg-[#111113] border-white/[0.06] hover:border-white/[0.1]'
                            }`}
                          >
                            <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                              <Mic size={16} strokeWidth={1.5} className={isActive ? 'text-purple-400' : 'text-gray-600'} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">{t.name}</h4>
                              <div className="flex items-center gap-2 text-[11px] font-mono text-gray-600 mt-0.5">
                                <span>{t.video_count} vídeo{t.video_count !== 1 ? 's' : ''}</span>
                                {t.ready ? (
                                  <span className="text-primary flex items-center gap-1"><Check size={9} strokeWidth={1.5} /> Pronto</span>
                                ) : (
                                  <span className="text-amber-500/70">Pendente</span>
                                )}
                                {isActive && <span className="text-purple-400">· Ativo</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ContentGenerator;
