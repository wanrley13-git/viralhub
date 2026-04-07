import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Lightbulb, FileCheck, Minus, Plus,
  ChevronDown, FileText, Video, X, User,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSidebar } from '../contexts/SidebarContext';

// ─── Tab config ───
const TABS = [
  { id: 'ideas', label: 'Ideias', icon: Lightbulb },
  { id: 'developed', label: 'Desenvolvidos', icon: FileCheck },
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
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[12px] font-semibold text-primary mr-1 align-middle whitespace-nowrap select-none">
    <Video size={12} strokeWidth={2} className="shrink-0 opacity-70" />
    <span className="truncate max-w-[140px]">{analysis.title}</span>
    <button
      onClick={(e) => { e.stopPropagation(); onRemove(analysis.id); }}
      className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
    >
      <X size={11} strokeWidth={2.5} />
    </button>
  </span>
);

const ContentGenerator = () => {
  const { collapsed } = useSidebar();

  // Tabs
  const [activeTab, setActiveTab] = useState('ideas');

  // Prompt bar state
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('');
  const [base, setBase] = useState('');
  const [quantity, setQuantity] = useState(5);
  const [toneOpen, setToneOpen] = useState(false);
  const [baseOpen, setBaseOpen] = useState(false);
  const [selectedRefs, setSelectedRefs] = useState([]);

  // @ mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);
  const [mentionAnchor, setMentionAnchor] = useState(null);

  const textareaRef = useRef(null);
  const toneRef = useRef(null);
  const baseRef = useRef(null);
  const mentionRef = useRef(null);

  // Placeholder tones — will be replaced by API calls
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
  }, [prompt]);

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

  // ─── @ mention detection ───
  const handlePromptChange = useCallback((e) => {
    const val = e.target.value;
    setPrompt(val);

    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@([^@\n]*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionOpen(true);
      setMentionIdx(0);

      // Anchor position for popup
      const el = e.target;
      const rect = el.getBoundingClientRect();
      setMentionAnchor({ bottom: rect.top, left: rect.left + 16 });
    } else {
      setMentionOpen(false);
    }
  }, []);

  // ─── Insert reference from @ popup ───
  const insertRef = useCallback((analysis) => {
    setSelectedRefs((prev) => [...prev, analysis]);

    // Remove @query from prompt text
    const cursor = textareaRef.current?.selectionStart || prompt.length;
    const before = prompt.slice(0, cursor);
    const after = prompt.slice(cursor);
    const cleaned = before.replace(/@[^@\n]*$/, '');
    setPrompt(cleaned + after);

    setMentionOpen(false);
    setMentionQuery('');
    textareaRef.current?.focus();
  }, [prompt]);

  // ─── Remove reference chip ───
  const removeRef = useCallback((id) => {
    setSelectedRefs((prev) => prev.filter((r) => r.id !== id));
  }, []);

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
      // Will trigger generate later
    }
  };

  // ─── Open @ popup from + button ───
  const openMentionFromButton = () => {
    setPrompt((prev) => prev + '@');
    setMentionQuery('');
    setMentionOpen(true);
    setMentionIdx(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const selectedToneLabel = tones.find(t => t.id === tone)?.label || 'Tom';
  const selectedBaseLabel = MOCK_BASES.find(b => b.id === base)?.label || 'Base';

  return (
    <div
      className="flex flex-col h-screen transition-all duration-300"
      style={{ marginLeft: collapsed ? 72 : 260 }}
    >
      {/* ═══════ HEADER ═══════ */}
      <div className="shrink-0 px-8 pt-8 pb-2">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-11 h-11 bg-primary/15 rounded-2xl flex items-center justify-center border border-primary/20 glow-primary shrink-0">
            <Sparkles size={20} strokeWidth={1.5} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight leading-none">
              Gerador de Conteúdo
            </h1>
            <p className="text-[13px] text-gray-500 mt-1 font-medium">
              Gere ideias e roteiros com IA a partir das suas análises
            </p>
          </div>
        </div>

        <div className="tab-group rounded-2xl w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-item rounded-xl ${activeTab === tab.id ? 'active' : ''}`}
            >
              <tab.icon size={15} strokeWidth={1.8} />
              {tab.label}
            </button>
          ))}
        </div>
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
      <div className="shrink-0 flex justify-center px-6 pb-6">
        <div className="w-full max-w-[800px] bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl px-5 pt-5 pb-4 shadow-[0_-8px_40px_rgba(0,0,0,0.35)]">

          {/* Reference chips */}
          {selectedRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selectedRefs.map((ref) => (
                <RefChip key={ref.id} analysis={ref} onRemove={removeRef} />
              ))}
            </div>
          )}

          {/* Textarea area with + button */}
          <div className="relative flex items-start gap-3">
            {/* + button for references */}
            <button
              onClick={openMentionFromButton}
              className="shrink-0 mt-0.5 w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-gray-600 hover:text-gray-300 hover:bg-white/[0.07] hover:border-white/[0.1] transition-all duration-200"
              title="Adicionar referência (@)"
            >
              <Plus size={16} strokeWidth={2} />
            </button>

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handleKeyDown}
              placeholder="Descreva o conteúdo que deseja criar... Use @ para referenciar análises"
              rows={1}
              className="flex-1 bg-transparent text-[14px] text-white placeholder-gray-600 resize-none outline-none custom-scrollbar leading-relaxed pt-1"
            />

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

          {/* Controls row — no separator border */}
          <div className="flex items-center gap-2 mt-4">
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

            {/* Quantity stepper — no inner borders */}
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

            {/* Spacer */}
            <div className="flex-1" />

            {/* Generate button */}
            <button
              disabled={!prompt.trim()}
              className="btn-primary flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
            >
              <Sparkles size={15} strokeWidth={2} />
              Gerar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentGenerator;
