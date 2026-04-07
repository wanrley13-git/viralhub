import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Lightbulb, FileCheck, Minus, Plus,
  ChevronDown, FileText, Video, X, User, ImagePlus,
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
  { id: 'default', label: 'Padrão' },
  { id: 'educator', label: 'Educador' },
  { id: 'storyteller', label: 'Storyteller' },
  { id: 'provocateur', label: 'Provocador' },
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
  const [tone, setTone] = useState('');
  const [base, setBase] = useState('');
  const [quantity, setQuantity] = useState(5);
  const [toneOpen, setToneOpen] = useState(false);
  const [baseOpen, setBaseOpen] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);

  // @ mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);

  const textareaRef = useRef(null);
  const toneRef = useRef(null);
  const baseRef = useRef(null);
  const mentionRef = useRef(null);
  const fileInputRef = useRef(null);

  // Derived
  const selectedRefs = segments.filter(s => s.type === 'ref').map(s => s.analysis);
  const activeText = segments[segments.length - 1].value;
  const hasContent = segments.some(s => (s.type === 'text' && s.value.trim()) || s.type === 'ref');

  // Placeholder tones
  const tones = [
    { id: 'casual', label: 'Casual' },
    { id: 'professional', label: 'Profissional' },
    { id: 'humorous', label: 'Humorístico' },
    { id: 'educational', label: 'Educativo' },
    { id: 'provocative', label: 'Provocativo' },
  ];

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
      if (toneRef.current && !toneRef.current.contains(e.target)) setToneOpen(false);
      if (baseRef.current && !baseRef.current.contains(e.target)) setBaseOpen(false);
      if (mentionRef.current && !mentionRef.current.contains(e.target)) setMentionOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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

  const selectedToneLabel = tones.find(t => t.id === tone)?.label || 'Tom';
  const selectedBaseLabel = MOCK_BASES.find(b => b.id === base)?.label || 'Base';

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
            {/* Base selector */}
            <div ref={baseRef} className="relative">
              <button
                onClick={() => { setBaseOpen(!baseOpen); setToneOpen(false); }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.05] text-[13px] font-semibold text-gray-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.08] transition-all duration-200"
              >
                <User size={14} strokeWidth={1.8} className="text-gray-500 shrink-0" />
                <span className="truncate max-w-[100px]">{selectedBaseLabel}</span>
                <ChevronDown size={12} className={`text-gray-600 transition-transform duration-200 ${baseOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {baseOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full mb-2 left-0 w-48 bg-[#16161a] border border-white/[0.08] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                  >
                    {MOCK_BASES.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => { setBase(b.id); setBaseOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors duration-150 ${
                          base === b.id
                            ? 'bg-primary/10 text-primary'
                            : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Tone selector */}
            <div ref={toneRef} className="relative">
              <button
                onClick={() => { setToneOpen(!toneOpen); setBaseOpen(false); }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.05] text-[13px] font-semibold text-gray-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.08] transition-all duration-200"
              >
                <FileText size={14} strokeWidth={1.8} className="text-gray-500 shrink-0" />
                <span className="truncate max-w-[100px]">{selectedToneLabel}</span>
                <ChevronDown size={12} className={`text-gray-600 transition-transform duration-200 ${toneOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {toneOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full mb-2 left-0 w-48 bg-[#16161a] border border-white/[0.08] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                  >
                    {tones.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setTone(t.id); setToneOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors duration-150 ${
                          tone === t.id
                            ? 'bg-primary/10 text-primary'
                            : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
    </div>
  );
};

export default ContentGenerator;
