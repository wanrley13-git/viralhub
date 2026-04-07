import { useState, useRef, useEffect } from 'react';
import {
  Sparkles, Lightbulb, FileCheck, Minus, Plus,
  Send, ChevronDown, FileText, Video,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSidebar } from '../contexts/SidebarContext';

// ─── Tab config ───
const TABS = [
  { id: 'ideas', label: 'Ideias', icon: Lightbulb },
  { id: 'developed', label: 'Desenvolvidos', icon: FileCheck },
];

const QUANTITY_OPTIONS = [3, 5, 10];

const ContentGenerator = () => {
  const { collapsed } = useSidebar();

  // Tabs
  const [activeTab, setActiveTab] = useState('ideas');

  // Prompt bar state
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('');
  const [reference, setReference] = useState('');
  const [quantity, setQuantity] = useState(5);
  const [toneOpen, setToneOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);

  const textareaRef = useRef(null);
  const toneRef = useRef(null);
  const refRef = useRef(null);

  // Placeholder data — will be replaced by API calls
  const tones = [
    { id: 'casual', label: 'Casual' },
    { id: 'professional', label: 'Profissional' },
    { id: 'humorous', label: 'Humorístico' },
    { id: 'educational', label: 'Educativo' },
    { id: 'provocative', label: 'Provocativo' },
  ];

  const references = [
    { id: 'none', label: 'Nenhuma referência' },
  ];

  // ─── Auto-resize textarea ───
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [prompt]);

  // ─── Close dropdowns on outside click ───
  useEffect(() => {
    const handleClick = (e) => {
      if (toneRef.current && !toneRef.current.contains(e.target)) setToneOpen(false);
      if (refRef.current && !refRef.current.contains(e.target)) setRefOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ─── Quantity stepper ───
  const stepQuantity = (dir) => {
    const idx = QUANTITY_OPTIONS.indexOf(quantity);
    const next = idx + dir;
    if (next >= 0 && next < QUANTITY_OPTIONS.length) {
      setQuantity(QUANTITY_OPTIONS[next]);
    }
  };

  const selectedToneLabel = tones.find(t => t.id === tone)?.label || 'Tom';
  const selectedRefLabel = references.find(r => r.id === reference)?.label || 'Referência';

  return (
    <div
      className="flex flex-col h-screen transition-all duration-300"
      style={{ marginLeft: collapsed ? 72 : 260 }}
    >
      {/* ═══════ HEADER ═══════ */}
      <div className="shrink-0 px-8 pt-8 pb-2">
        {/* Title row */}
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

        {/* Tab switcher */}
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

      {/* ═══════ CONTENT GRID (scrollable) ═══════ */}
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
            {/* Empty state */}
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

      {/* ═══════ BOTTOM PROMPT BAR ═══════ */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#0e0e11]">
        <div className="px-8 py-4">
          {/* Textarea row */}
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Descreva o conteúdo que deseja criar..."
                rows={1}
                className="w-full bg-[#18181d] border border-white/[0.06] rounded-2xl px-5 py-3.5 pr-4 text-[14px] text-white placeholder-gray-600 resize-none outline-none transition-all duration-200 focus:border-primary/40 focus:shadow-[0_0_0_2px_rgba(55,178,77,0.15)] custom-scrollbar leading-relaxed"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    // Will trigger generate later
                  }
                }}
              />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2.5 mt-3 flex-wrap">
            {/* Tone selector */}
            <div ref={toneRef} className="relative">
              <button
                onClick={() => { setToneOpen(!toneOpen); setRefOpen(false); }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] font-semibold text-gray-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-200"
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
                    className="absolute bottom-full mb-2 left-0 w-48 bg-[#1a1a1f] border border-white/[0.08] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden z-50"
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

            {/* Reference selector */}
            <div ref={refRef} className="relative">
              <button
                onClick={() => { setRefOpen(!refOpen); setToneOpen(false); }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13px] font-semibold text-gray-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-200"
              >
                <Video size={14} strokeWidth={1.8} className="text-gray-500 shrink-0" />
                <span className="truncate max-w-[120px]">{selectedRefLabel}</span>
                <ChevronDown size={12} className={`text-gray-600 transition-transform duration-200 ${refOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {refOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full mb-2 left-0 w-56 bg-[#1a1a1f] border border-white/[0.08] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                  >
                    {references.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => { setReference(r.id); setRefOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors duration-150 ${
                          reference === r.id
                            ? 'bg-primary/10 text-primary'
                            : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-white/[0.06] mx-0.5" />

            {/* Quantity stepper */}
            <div className="flex items-center gap-0 rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden">
              <button
                onClick={() => stepQuantity(-1)}
                disabled={quantity === QUANTITY_OPTIONS[0]}
                className="px-2.5 py-2 text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
              >
                <Minus size={14} strokeWidth={2} />
              </button>
              <span className="px-2.5 py-2 text-[13px] font-bold text-white tabular-nums min-w-[32px] text-center border-x border-white/[0.06]">
                {quantity}
              </span>
              <button
                onClick={() => stepQuantity(1)}
                disabled={quantity === QUANTITY_OPTIONS[QUANTITY_OPTIONS.length - 1]}
                className="px-2.5 py-2 text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
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
