import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Plus, ChevronRight, ChevronDown, FolderOpen, Folder,
  FileText, MoreHorizontal, Trash2, Pencil, Eye, FolderPlus,
  X, GripVertical, SmilePlus, PanelLeftClose, PanelLeftOpen,
  Heading1, Heading2, Heading3, Bold, Italic, Strikethrough,
  List, ListOrdered, CheckSquare, Quote, Code, Link as LinkIcon,
  Minus, Table, Palette, Tag, ImagePlus,
} from 'lucide-react';
import TurndownService from 'turndown';
import { marked } from 'marked';
// Markdown rendering handled by contenteditable editor + preview HTML
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import axios from 'axios';
import { useSidebar } from '../contexts/SidebarContext';
import { useNotes } from '../contexts/NotesContext';
import ImageLightbox from '../components/ImageLightbox';
import { resolveThumbnailUrl } from '../components/Thumbnail';

const API_URL = import.meta.env.VITE_API_URL;

function cn(...inputs) { return twMerge(clsx(inputs)); }

// ── Markdown helpers (same as TaskEditor) ──
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
turndown.addRule('coloredSpan', {
  filter: (node) => node.nodeName === 'SPAN' && node.style && node.style.color,
  replacement: (content) => content,
});
// Preserve [[note links]] through turndown
turndown.addRule('noteLink', {
  filter: (node) => node.nodeName === 'A' && node.getAttribute('data-note-link'),
  replacement: (content) => `[[${content}]]`,
});
// Strip image resize toolbar from output
turndown.addRule('imgResizeToolbar', {
  filter: (node) => node.classList && node.classList.contains('img-resize-toolbar'),
  replacement: () => '',
});
// Strip img-resize-wrapper, keep inner content
turndown.addRule('imgResizeWrapper', {
  filter: (node) => node.classList && node.classList.contains('img-resize-wrapper'),
  replacement: (content) => content,
});
// Preserve img style (maxWidth) as HTML so it round-trips
turndown.addRule('styledImg', {
  filter: (node) => node.nodeName === 'IMG' && node.style && node.style.maxWidth && node.style.maxWidth !== '100%',
  replacement: (content, node) => {
    const src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    const style = node.getAttribute('style') || '';
    return `<img src="${src}" alt="${alt}" style="${style}" />`;
  },
});
const mdToHtml = (md) => {
  if (!md) return '';
  // Convert [[note name]] to clickable spans before markdown parse
  const withLinks = md.replace(/\[\[([^\]]+)\]\]/g, '<a data-note-link="true" class="note-link">$1</a>');
  return marked.parse(withLinks, { breaks: true, gfm: true });
};
const htmlToMd = (html) => (!html ? '' : turndown.turndown(html));
const cleanEditorHtml = (editor) => {
  const clone = editor.cloneNode(true);
  clone.querySelectorAll('.img-resize-toolbar').forEach(t => t.remove());
  clone.querySelectorAll('.img-resize-wrapper').forEach(w => {
    while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w);
    w.remove();
  });
  return clone.innerHTML;
};
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

const getCurrentBlock = (editor) => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.anchorNode;
  if (!node) return null;
  if (node === editor) return node.firstChild;
  while (node && node.parentNode !== editor) node = node.parentNode;
  return node;
};
const placeCursorAtEnd = (el) => {
  const r = document.createRange(), s = window.getSelection();
  r.selectNodeContents(el); r.collapse(false); s.removeAllRanges(); s.addRange(r);
};
const placeCursorAtStart = (el) => {
  const r = document.createRange(), s = window.getSelection();
  if (el.firstChild) r.setStart(el.firstChild, 0); else r.setStart(el, 0);
  r.collapse(true); s.removeAllRanges(); s.addRange(r);
};

// ── Icon pack (curated SVG icons inspired by obsidian-iconize) ──
const FOLDER_ICONS = [
  { id: 'folder', label: 'Pasta', svg: '<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'star', label: 'Estrela', svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'heart', label: 'Coração', svg: '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'zap', label: 'Raio', svg: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'book', label: 'Livro', svg: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'bookmark', label: 'Marcador', svg: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'flame', label: 'Fogo', svg: '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'globe', label: 'Globo', svg: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="12" rx="4" ry="10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/>' },
  { id: 'code', label: 'Código', svg: '<polyline points="16 18 22 12 16 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="8 6 2 12 8 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'music', label: 'Música', svg: '<path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'camera', label: 'Câmera', svg: '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'target', label: 'Alvo', svg: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'lightbulb', label: 'Ideia', svg: '<line x1="9" y1="18" x2="15" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="22" x2="14" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'rocket', label: 'Foguete', svg: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'crown', label: 'Coroa', svg: '<path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="2" y1="21" x2="22" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'coffee', label: 'Café', svg: '<path d="M18 8h1a4 4 0 010 8h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="6" y1="1" x2="6" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="1" x2="10" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="1" x2="14" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'palette', label: 'Paleta', svg: '<circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'sparkles', label: 'Brilho', svg: '<path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'hash', label: 'Hash', svg: '<line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="15" x2="20" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="3" x2="8" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="3" x2="14" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
];

const FolderIcon = ({ iconId, size = 16, className = '' }) => {
  const icon = FOLDER_ICONS.find((i) => i.id === iconId) || FOLDER_ICONS[0];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      dangerouslySetInnerHTML={{ __html: icon.svg }}
    />
  );
};

// ── Icon Picker (fixed position portal) ──
const IconPicker = ({ currentIcon, onSelect, onClose, anchorRef }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const pickerRef = useRef(null);

  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.top,
        left: rect.right + 8,
      });
    }
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={pickerRef}
      className="fixed z-[200] glass-raised rounded-2xl p-4 w-[240px] animate-fade-in shadow-modal"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="data-label uppercase tracking-wider">Ícone da pasta</p>
        <button onClick={onClose} className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {FOLDER_ICONS.map((icon) => (
          <button
            key={icon.id}
            onClick={() => { onSelect(icon.id); onClose(); }}
            title={icon.label}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-110",
              currentIcon === icon.id
                ? "bg-primary/20 text-primary border border-primary/30"
                : "text-gray-400 hover:text-white hover:bg-white/[0.06] border border-transparent"
            )}
          >
            <FolderIcon iconId={icon.id} size={18} />
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Text Colors (same as TaskEditor) ──
const TEXT_COLORS = [
  { label: 'Padrão', value: '' },
  { label: 'Branco', value: '#ffffff' },
  { label: 'Cinza', value: '#9ca3af' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Amarelo', value: '#eab308' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Roxo', value: '#a855f7' },
  { label: 'Rosa', value: '#ec4899' },
];

// ═══════════════════════════════════════════════
// Folder Tree Item (recursive)
// ═══════════════════════════════════════════════
const FolderTreeItem = ({ folder, depth = 0 }) => {
  const {
    getChildFolders, getFolderNotes, createFolder, renameFolder,
    deleteFolder, setFolderIcon, createNote, activeNoteId, setActiveNoteId,
    moveNote, moveFolder, deleteNote,
    selectedFolderId, setSelectedFolderId,
    renamingFolderId, setRenamingFolderId,
  } = useNotes();

  const [expanded, setExpanded] = useState(depth === 0);
  const [showMenu, setShowMenu] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const menuRef = useRef(null);
  const renameRef = useRef(null);
  const rowRef = useRef(null);

  const isRenaming = renamingFolderId === folder.id;
  const [renamingValue, setRenamingValue] = useState(folder.name);
  const isSelected = selectedFolderId === folder.id;

  const children = getChildFolders(folder.id);
  const notes = getFolderNotes(folder.id);
  const hasContent = children.length > 0 || notes.length > 0;

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [isRenaming]);

  // When folder is created with renamingFolderId, start with empty value
  useEffect(() => {
    if (isRenaming) {
      setRenamingValue(folder.name === 'Nova pasta' || folder.name === '' ? '' : folder.name);
    }
  }, [isRenaming, folder.name]);

  const handleRename = () => {
    const finalName = renamingValue.trim() || 'Nova pasta';
    renameFolder(folder.id, finalName);
    setRenamingValue(finalName);
  };

  const handleCancelRename = () => {
    setRenamingFolderId(null);
    if (!renamingValue.trim()) {
      renameFolder(folder.id, 'Nova pasta');
    }
  };

  // Drag & drop (for both notes AND folders)
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); };
  const handleDragLeave = (e) => { e.stopPropagation(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const noteId = e.dataTransfer.getData('text/note-id');
    const folderId = e.dataTransfer.getData('text/folder-id');
    if (noteId) {
      moveNote(noteId, folder.id);
      setExpanded(true);
    } else if (folderId && folderId !== folder.id) {
      moveFolder(folderId, folder.id);
      setExpanded(true);
    }
  };

  // Make folder draggable (not the default root folder)
  const handleFolderDragStart = (e) => {
    if (folder.id === 'default') { e.preventDefault(); return; }
    e.dataTransfer.setData('text/folder-id', folder.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleClick = (e) => {
    setSelectedFolderId(folder.id);
    setExpanded(!expanded);
  };

  return (
    <div>
      {/* Folder row */}
      <div
        ref={rowRef}
        draggable={folder.id !== 'default'}
        onDragStart={handleFolderDragStart}
        className={cn(
          "group flex items-center gap-1.5 py-2 px-2 rounded-xl cursor-pointer transition-all duration-150 relative",
          dragOver
            ? "bg-primary/15 border border-primary/30"
            : isSelected
              ? "bg-white/[0.06]"
              : "hover:bg-white/[0.04]"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="text-gray-500 shrink-0 w-4 flex items-center justify-center">
          {hasContent ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : <span className="w-3" />}
        </span>

        <span className="shrink-0 text-gray-400">
          <FolderIcon iconId={folder.icon} size={16} />
        </span>

        {isRenaming ? (
          <input
            ref={renameRef}
            value={renamingValue}
            onChange={(e) => setRenamingValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') handleCancelRename(); }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Nome da pasta"
            className="flex-1 bg-transparent text-[13px] text-white font-normal focus:outline-none border-b border-primary/40 py-0.5"
          />
        ) : (
          <span className="flex-1 text-[13px] font-semibold text-gray-300 truncate select-none">{folder.name}</span>
        )}

        {/* Action buttons */}
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); createNote(folder.id); setExpanded(true); }}
            className="p-1 rounded-lg text-gray-600 hover:text-primary hover:bg-primary/10 transition-colors"
            title="Nova nota"
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="p-1 rounded-lg text-gray-600 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <MoreHorizontal size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* Context menu */}
        {showMenu && (
          <div
            ref={menuRef}
            className="absolute right-0 top-full mt-1 z-[100] glass-raised rounded-xl py-1.5 min-w-[170px] animate-fade-in shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { createFolder('Nova pasta', folder.id); setExpanded(true); setShowMenu(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-400 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              <FolderPlus size={14} strokeWidth={2.5} /> Subpasta
            </button>
            <button
              onClick={() => { setShowIconPicker(true); setShowMenu(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-400 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              <SmilePlus size={14} strokeWidth={2.5} /> Alterar ícone
            </button>
            <button
              onClick={() => { setRenamingFolderId(folder.id); setRenamingValue(folder.name); setShowMenu(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-400 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              <Pencil size={14} strokeWidth={2.5} /> Renomear
            </button>
            {folder.id !== 'default' && (
              <button
                onClick={() => { deleteFolder(folder.id); setShowMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-400/70 hover:text-red-400 hover:bg-red-400/[0.05] transition-colors"
              >
                <Trash2 size={14} strokeWidth={2.5} /> Deletar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Icon picker (rendered as fixed portal) */}
      {showIconPicker && (
        <IconPicker
          currentIcon={folder.icon}
          onSelect={(icon) => setFolderIcon(folder.id, icon)}
          onClose={() => setShowIconPicker(false)}
          anchorRef={rowRef}
        />
      )}

      {/* Expanded content */}
      {expanded && (
        <div>
          {children.map((child) => (
            <FolderTreeItem key={child.id} folder={child} depth={depth + 1} />
          ))}
          {notes.map((note) => (
            <NoteItem key={note.id} note={note} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Note Item in tree ──
const NoteItem = ({ note, depth }) => {
  const { activeNoteId, setActiveNoteId, deleteNote, updateNote, selectedFolderId, setSelectedFolderId, reorderNote } = useNotes();
  const isActive = activeNoteId === note.id;
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renamingValue, setRenamingValue] = useState(note.title);
  const [dragOverNote, setDragOverNote] = useState(false);
  const menuRef = useRef(null);
  const renameRef = useRef(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  useEffect(() => {
    if (renaming && renameRef.current) { renameRef.current.focus(); renameRef.current.select(); }
  }, [renaming]);

  const handleRename = () => {
    if (renamingValue.trim()) updateNote(note.id, { title: renamingValue.trim() });
    setRenaming(false);
  };

  const handleNoteDragOver = (e) => {
    const noteId = e.dataTransfer.types.includes('text/note-id');
    if (!noteId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverNote(true);
  };

  const handleNoteDragLeave = (e) => {
    e.stopPropagation();
    setDragOverNote(false);
  };

  const handleNoteDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverNote(false);
    const draggedNoteId = e.dataTransfer.getData('text/note-id');
    if (draggedNoteId && draggedNoteId !== note.id) {
      reorderNote(draggedNoteId, note.id);
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/note-id', note.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={handleNoteDragOver}
      onDragLeave={handleNoteDragLeave}
      onDrop={handleNoteDrop}
      className={cn(
        "group flex items-center gap-2 py-2 px-2 rounded-xl cursor-pointer transition-all duration-150 relative",
        dragOverNote
          ? "bg-primary/15 border border-primary/30"
          : isActive
            ? "bg-white/[0.07] text-white"
            : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]"
      )}
      style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
      onClick={() => { setActiveNoteId(note.id); setSelectedFolderId(null); }}
    >
      <GripVertical size={12} className="shrink-0 text-gray-700 opacity-0 group-hover:opacity-100 cursor-grab transition-opacity" />
      <FileText size={15} strokeWidth={1.5} className={cn("shrink-0", isActive ? "text-primary" : "text-gray-600")} />

      {renaming ? (
        <input
          ref={renameRef}
          value={renamingValue}
          onChange={(e) => setRenamingValue(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-transparent text-[13px] text-white font-normal focus:outline-none border-b border-primary/40 py-0.5"
        />
      ) : (
        <span className="flex-1 text-[13px] font-semibold truncate">{note.title}</span>
      )}

      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="p-1 rounded-lg text-gray-600 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <MoreHorizontal size={14} strokeWidth={2.5} />
        </button>
      </div>

      {showMenu && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-[100] glass-raised rounded-xl py-1.5 min-w-[150px] animate-fade-in shadow-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setRenaming(true); setRenamingValue(note.title); setShowMenu(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <Pencil size={14} strokeWidth={2.5} /> Renomear
          </button>
          <button
            onClick={() => { deleteNote(note.id); setShowMenu(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-400/70 hover:text-red-400 hover:bg-red-400/[0.05] transition-colors"
          >
            <Trash2 size={14} strokeWidth={2.5} /> Deletar
          </button>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════
// Note Link Suggestions Popup
// ═══════════════════════════════════════════════
const NoteLinkSuggestions = ({ query, notes, onSelect, position }) => {
  const filtered = useMemo(() => {
    if (!query) return notes.slice(0, 8);
    const lower = query.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(lower)).slice(0, 8);
  }, [query, notes]);

  if (filtered.length === 0) return null;

  return (
    <div
      className="fixed z-[200] glass-raised rounded-xl py-1.5 min-w-[220px] max-w-[300px] animate-fade-in shadow-modal"
      style={{ top: position.top, left: position.left }}
    >
      <p className="data-label uppercase tracking-wider px-4 mb-1">Vincular nota</p>
      {filtered.map((note) => (
        <button
          key={note.id}
          onMouseDown={(e) => { e.preventDefault(); onSelect(note); }}
          className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-gray-400 hover:text-white hover:bg-white/[0.04] transition-colors text-left"
        >
          <FileText size={13} strokeWidth={1.5} className="shrink-0 text-gray-600" />
          <span className="truncate">{note.title}</span>
        </button>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════
// Note Editor (reuses TaskEditor markdown system)
// ═══════════════════════════════════════════════
const NoteEditor = ({ note, onPreviewToggle }) => {
  const { updateNote, notes, findNoteByTitle, setActiveNoteId } = useNotes();
  const [viewMode, setViewMode] = useState('edit');
  const [title, setTitle] = useState(note.title);
  const [activeFormats, setActiveFormats] = useState({});
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [linkSuggestion, setLinkSuggestion] = useState(null);

  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const editorRef = useRef(null);
  const contentRef = useRef(note.content || '');
  const editorHtmlRef = useRef('');
  const titleRef = useRef(null);
  const colorPickerRef = useRef(null);
  const savedSelectionRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const imageInputRef = useRef(null);

  // Reset when note changes
  useEffect(() => {
    setTitle(note.title);
    contentRef.current = note.content || '';
    const html = mdToHtml(note.content) || '<p><br></p>';
    editorHtmlRef.current = html;
    setViewMode('edit');
    setLinkSuggestion(null);
    if (editorRef.current) {
      editorRef.current.innerHTML = html;
    }
  }, [note.id]);

  // Load editor content from saved HTML (avoids MD→HTML→MD round-trip duplication)
  useEffect(() => {
    if (editorRef.current && viewMode === 'edit') {
      editorRef.current.innerHTML = editorHtmlRef.current || '<p><br></p>';
    }
  }, [viewMode]);

  // Handle clicks on [[note links]]
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const handleClick = (e) => {
      const link = e.target.closest('a[data-note-link]');
      if (link) {
        e.preventDefault();
        const targetNote = findNoteByTitle(link.textContent);
        if (targetNote) setActiveNoteId(targetNote.id);
      }
    };
    editor.addEventListener('click', handleClick);
    return () => editor.removeEventListener('click', handleClick);
  }, [note.id, findNoteByTitle, setActiveNoteId]);

  // Auto-save
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (editorRef.current) {
        editorHtmlRef.current = editorRef.current.innerHTML;
        contentRef.current = htmlToMd(cleanEditorHtml(editorRef.current));
      }
      updateNote(note.id, { title: titleRef.current?.value || title, content: contentRef.current });
    }, 600);
  }, [note.id, title, updateNote]);

  useEffect(() => () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); }, []);

  // Close color picker
  useEffect(() => {
    if (!showColorPicker) return;
    const handler = (e) => { if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) setShowColorPicker(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColorPicker]);

  // Format tracking
  const updateActiveFormats = useCallback(() => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    let node = sel.anchorNode;
    let inEditor = false;
    while (node) { if (node === editorRef.current) { inEditor = true; break; } node = node.parentNode; }
    if (!inEditor) return;

    const formats = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    };
    node = sel.anchorNode;
    while (node && node !== editorRef.current) {
      const name = node.nodeName;
      if (name === 'H1') formats.h1 = true;
      if (name === 'H2') formats.h2 = true;
      if (name === 'H3') formats.h3 = true;
      if (name === 'BLOCKQUOTE') formats.blockquote = true;
      if (name === 'CODE' || name === 'PRE') formats.code = true;
      node = node.parentNode;
    }
    setActiveFormats(formats);
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', updateActiveFormats);
    return () => document.removeEventListener('selectionchange', updateActiveFormats);
  }, [updateActiveFormats]);

  const execCmd = (command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    updateActiveFormats();
    syncContent();
  };

  const formatBlock = (tagName) => {
    editorRef.current?.focus();
    const block = getCurrentBlock(editorRef.current);
    if (block && block.nodeName === tagName.toUpperCase()) {
      document.execCommand('formatBlock', false, 'p');
    } else {
      document.execCommand('formatBlock', false, tagName);
    }
    updateActiveFormats();
    syncContent();
  };

  const syncContent = () => {
    if (editorRef.current) {
      editorHtmlRef.current = editorRef.current.innerHTML;
      contentRef.current = htmlToMd(cleanEditorHtml(editorRef.current));
    }
    triggerAutoSave();
  };

  const applyColor = (color) => {
    const savedRange = savedSelectionRef.current;
    setShowColorPicker(false);
    setTimeout(() => {
      editorRef.current?.focus();
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      if (!color) {
        document.execCommand('removeFormat', false, null);
      } else {
        // Wrap selection in span with color
        const range = sel.getRangeAt(0);
        const selectedText = range.toString();
        if (selectedText) {
          document.execCommand('insertHTML', false, `<span style="color: ${color}">${selectedText}</span>`);
        }
      }
      syncContent();
    }, 50);
  };

  const toggleCode = () => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && !sel.isCollapsed) {
      let node = sel.anchorNode;
      let insideCode = false;
      while (node && node !== editorRef.current) { if (node.nodeName === 'CODE') { insideCode = true; break; } node = node.parentNode; }
      if (insideCode) {
        const textNode = document.createTextNode(node.textContent);
        node.parentNode.replaceChild(textNode, node);
      } else {
        document.execCommand('insertHTML', false, `<code>${sel.toString()}</code>\u200B`);
      }
    } else {
      document.execCommand('insertHTML', false, '<code>código</code>\u200B');
    }
    syncContent();
  };

  const insertTable = () => { editorRef.current?.focus(); document.execCommand('insertHTML', false, '<table><thead><tr><th>Coluna 1</th><th>Coluna 2</th><th>Coluna 3</th></tr></thead><tbody><tr><td>valor</td><td>valor</td><td>valor</td></tr></tbody></table><p><br></p>'); syncContent(); };
  const insertHR = () => { editorRef.current?.focus(); document.execCommand('insertHTML', false, '<hr/><p><br></p>'); syncContent(); };
  const insertLink = () => { const url = prompt('URL do link:'); if (url) execCmd('createLink', url); };
  const insertChecklist = () => { editorRef.current?.focus(); document.execCommand('insertHTML', false, '<div class="checklist-item"><input type="checkbox" /> <span>Tarefa</span></div>'); syncContent(); };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API_URL}/uploads/image`, formData);
      const url = resolveThumbnailUrl(res.data.url);
      editorRef.current?.focus();
      document.execCommand('insertHTML', false,
        `<p><img src="${url}" alt="${file.name}" style="max-width:100%;border-radius:12px;cursor:pointer;" class="uploaded-img" /></p><p><br></p>`
      );
      syncContent();
    } catch (err) {
      console.error('Erro ao enviar imagem:', err);
    }
  };

  // Image resize sizes
  const IMG_SIZES = [
    { label: '25%', value: '25%' },
    { label: '50%', value: '50%' },
    { label: '75%', value: '75%' },
    { label: '100%', value: '100%' },
  ];

  // Image click: select for resize or double-click for lightbox
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const clearSelection = () => {
      editor.querySelectorAll('.img-resize-wrapper.selected').forEach((w) => w.classList.remove('selected'));
    };

    const wrapImageIfNeeded = (img) => {
      if (img.parentElement?.classList?.contains('img-resize-wrapper')) return img.parentElement;
      const wrapper = document.createElement('span');
      wrapper.className = 'img-resize-wrapper';
      wrapper.contentEditable = 'false';
      const toolbar = document.createElement('span');
      toolbar.className = 'img-resize-toolbar';
      IMG_SIZES.forEach(({ label, value }) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.setAttribute('data-size', value);
        btn.onmousedown = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          img.style.maxWidth = value;
          toolbar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          syncContent();
        };
        if (img.style.maxWidth === value) btn.classList.add('active');
        toolbar.appendChild(btn);
      });
      const lbBtn = document.createElement('button');
      lbBtn.textContent = '🔍';
      lbBtn.title = 'Visualizar';
      lbBtn.onmousedown = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setLightboxSrc(img.src);
      };
      toolbar.appendChild(lbBtn);
      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(img);
      wrapper.appendChild(toolbar);
      return wrapper;
    };

    const handleImgClick = (e) => {
      if (e.target.tagName === 'IMG') {
        e.stopPropagation();
        e.preventDefault();
        clearSelection();
        const wrapper = wrapImageIfNeeded(e.target);
        wrapper.classList.add('selected');
      } else if (!e.target.closest('.img-resize-wrapper')) {
        clearSelection();
      }
    };

    const handleDblClick = (e) => {
      if (e.target.tagName === 'IMG') {
        e.stopPropagation();
        e.preventDefault();
        setLightboxSrc(e.target.src);
      }
    };

    const handleImgKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = editor.querySelector('.img-resize-wrapper.selected');
        if (selected) {
          e.preventDefault();
          selected.remove();
          syncContent();
        }
      }
    };

    editor.addEventListener('click', handleImgClick);
    editor.addEventListener('dblclick', handleDblClick);
    editor.addEventListener('keydown', handleImgKeyDown);
    return () => {
      editor.removeEventListener('click', handleImgClick);
      editor.removeEventListener('dblclick', handleDblClick);
      editor.removeEventListener('keydown', handleImgKeyDown);
    };
  }, [viewMode]);

  const isActive = (key) => !!activeFormats[key];

  const toolbarActions = [
    { key: 'h1', icon: Heading1, label: 'Título 1', action: () => formatBlock('h1'), activeKey: 'h1' },
    { key: 'h2', icon: Heading2, label: 'Título 2', action: () => formatBlock('h2'), activeKey: 'h2' },
    { key: 'h3', icon: Heading3, label: 'Título 3', action: () => formatBlock('h3'), activeKey: 'h3' },
    { type: 'divider' },
    { key: 'bold', icon: Bold, label: 'Negrito', action: () => execCmd('bold'), activeKey: 'bold' },
    { key: 'italic', icon: Italic, label: 'Itálico', action: () => execCmd('italic'), activeKey: 'italic' },
    { key: 'strike', icon: Strikethrough, label: 'Riscado', action: () => execCmd('strikeThrough'), activeKey: 'strikeThrough' },
    { key: 'code', icon: Code, label: 'Código', action: toggleCode, activeKey: 'code' },
    { type: 'divider' },
    { key: 'ul', icon: List, label: 'Lista', action: () => execCmd('insertUnorderedList'), activeKey: 'insertUnorderedList' },
    { key: 'ol', icon: ListOrdered, label: 'Lista numerada', action: () => execCmd('insertOrderedList'), activeKey: 'insertOrderedList' },
    { key: 'checklist', icon: CheckSquare, label: 'Checklist', action: insertChecklist },
    { type: 'divider' },
    { key: 'quote', icon: Quote, label: 'Citação', action: () => formatBlock('blockquote'), activeKey: 'blockquote' },
    { key: 'hr', icon: Minus, label: 'Separador', action: insertHR },
    { key: 'link', icon: LinkIcon, label: 'Link', action: insertLink },
    { key: 'table', icon: Table, label: 'Tabela', action: insertTable },
    { type: 'divider' },
    { key: 'color', icon: Palette, label: 'Cor do texto', action: () => {
      savedSelectionRef.current = (() => { const s = window.getSelection(); return s.rangeCount > 0 ? s.getRangeAt(0).cloneRange() : null; })();
      setShowColorPicker(!showColorPicker);
    }, isColorBtn: true },
    { type: 'divider' },
    { key: 'image', icon: ImagePlus, label: 'Inserir imagem', action: () => imageInputRef.current?.click() },
  ];

  // ── [[ note link detection ──
  const checkNoteLinkTrigger = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const anchorNode = sel.anchorNode;
    if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) { setLinkSuggestion(null); return; }

    const text = anchorNode.textContent;
    const offset = sel.anchorOffset;
    const before = text.slice(0, offset);

    // Check if we're inside [[ ... (no closing ]])
    const openIdx = before.lastIndexOf('[[');
    if (openIdx === -1 || before.indexOf(']]', openIdx) !== -1) {
      setLinkSuggestion(null);
      return;
    }

    const query = before.slice(openIdx + 2);

    // Get caret position for popup
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setLinkSuggestion({
      query,
      position: { top: rect.bottom + 4, left: rect.left },
    });
  }, []);

  const handleNoteLinkSelect = useCallback((selectedNote) => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const anchorNode = sel.anchorNode;
    if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) return;

    const text = anchorNode.textContent;
    const offset = sel.anchorOffset;
    const before = text.slice(0, offset);
    const openIdx = before.lastIndexOf('[[');
    if (openIdx === -1) return;

    // Replace [[ query with the note link HTML
    const after = text.slice(offset);
    const range = document.createRange();
    range.setStart(anchorNode, openIdx);
    range.setEnd(anchorNode, offset);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete', false, null);
    document.execCommand('insertHTML', false, `<a data-note-link="true" class="note-link">${selectedNote.title}</a>&nbsp;`);

    setLinkSuggestion(null);
    syncContent();
  }, []);

  // Markdown shortcuts
  const processMarkdownShortcuts = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const anchorNode = sel.anchorNode;
    const block = getCurrentBlock(editor);
    if (!block) return;
    const blockText = block.textContent;
    // For text-based shortcuts we need a text node
    const isTextNode = anchorNode && anchorNode.nodeType === Node.TEXT_NODE;
    const text = isTextNode ? anchorNode.textContent : '';
    const offset = isTextNode ? sel.anchorOffset : 0;

    // Block-level shortcuts that don't need text node
    if (/^- \[[ x]\] /.test(blockText) && !block.classList?.contains('checklist-item')) {
      const checked = blockText.startsWith('- [x] ');
      const remaining = blockText.replace(/^- \[[ x]\] /, '');
      block.innerHTML = `<div class="checklist-item"><input type="checkbox" ${checked ? 'checked' : ''}/> <span>${remaining || '\u200B'}</span></div>`;
      const span = block.querySelector('.checklist-item span');
      if (span) placeCursorAtEnd(span);
      syncContent();
      return;
    }

    if (!isTextNode) return;

    // Check for closing ]] to create note link
    if (text.slice(0, offset).match(/\[\[(.+?)\]\]$/)) {
      const match = text.slice(0, offset).match(/\[\[(.+?)\]\]$/);
      if (match) {
        const linkText = match[1];
        const fullMatch = `[[${linkText}]]`;
        const matchStart = text.lastIndexOf(fullMatch);
        if (matchStart >= 0) {
          const range = document.createRange();
          range.setStart(anchorNode, matchStart);
          range.setEnd(anchorNode, matchStart + fullMatch.length);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('delete', false, null);
          document.execCommand('insertHTML', false, `<a data-note-link="true" class="note-link">${linkText}</a>\u200B`);
          setLinkSuggestion(null);
          return;
        }
      }
    }

    if (/^# /.test(blockText) && block.nodeName !== 'H1' && !['H2','H3'].includes(block.nodeName)) {
      const remaining = blockText.slice(2);
      document.execCommand('formatBlock', false, 'h1');
      const nb = getCurrentBlock(editor); if (nb) { nb.textContent = remaining || '\u200B'; placeCursorAtEnd(nb); } return;
    }
    if (/^## /.test(blockText) && block.nodeName !== 'H2') {
      const remaining = blockText.slice(3);
      document.execCommand('formatBlock', false, 'h2');
      const nb = getCurrentBlock(editor); if (nb) { nb.textContent = remaining || '\u200B'; placeCursorAtEnd(nb); } return;
    }
    if (/^### /.test(blockText) && block.nodeName !== 'H3') {
      const remaining = blockText.slice(4);
      document.execCommand('formatBlock', false, 'h3');
      const nb = getCurrentBlock(editor); if (nb) { nb.textContent = remaining || '\u200B'; placeCursorAtEnd(nb); } return;
    }
    if (/^> /.test(blockText) && block.nodeName !== 'BLOCKQUOTE') {
      const remaining = blockText.slice(2);
      document.execCommand('formatBlock', false, 'blockquote');
      const nb = getCurrentBlock(editor); if (nb) { nb.textContent = remaining || '\u200B'; placeCursorAtEnd(nb); } return;
    }
    if (/^[-*] /.test(blockText) && block.nodeName !== 'LI' && block.nodeName !== 'UL') {
      const remaining = blockText.slice(2);
      document.execCommand('insertUnorderedList', false, null);
      const s2 = window.getSelection(); if (s2.anchorNode) { let li = s2.anchorNode; while (li && li.nodeName !== 'LI') li = li.parentNode; if (li) { li.textContent = remaining || '\u200B'; placeCursorAtEnd(li); } } return;
    }
    if (/^1\. /.test(blockText) && block.nodeName !== 'LI' && block.nodeName !== 'OL') {
      const remaining = blockText.slice(3);
      document.execCommand('insertOrderedList', false, null);
      const s2 = window.getSelection(); if (s2.anchorNode) { let li = s2.anchorNode; while (li && li.nodeName !== 'LI') li = li.parentNode; if (li) { li.textContent = remaining || '\u200B'; placeCursorAtEnd(li); } } return;
    }
    if (blockText.trim() === '---') { block.remove(); document.execCommand('insertHTML', false, '<hr/><p><br></p>'); return; }

    // Inline
    const boldMatch = text.match(/\*\*(.+?)\*\*$/);
    if (boldMatch && offset === text.length) {
      const bt = boldMatch[1]; const ms = text.lastIndexOf('**'+bt+'**');
      const r = document.createRange(); r.setStart(anchorNode, ms); r.setEnd(anchorNode, offset);
      sel.removeAllRanges(); sel.addRange(r); document.execCommand('delete'); document.execCommand('insertHTML', false, `<strong>${bt}</strong>\u200B`); return;
    }
    const italicMatch = text.match(/(?<!\*)\*([^*]+?)\*$/);
    if (italicMatch && offset === text.length) {
      const it = italicMatch[1]; const full = '*'+it+'*'; const ms = text.lastIndexOf(full);
      if (ms >= 0) { const r = document.createRange(); r.setStart(anchorNode, ms); r.setEnd(anchorNode, offset); sel.removeAllRanges(); sel.addRange(r); document.execCommand('delete'); document.execCommand('insertHTML', false, `<em>${it}</em>\u200B`); return; }
    }
    const strikeMatch = text.match(/~~(.+?)~~$/);
    if (strikeMatch && offset === text.length) {
      const st = strikeMatch[1]; const ms = text.lastIndexOf('~~'+st+'~~');
      const r = document.createRange(); r.setStart(anchorNode, ms); r.setEnd(anchorNode, offset);
      sel.removeAllRanges(); sel.addRange(r); document.execCommand('delete'); document.execCommand('insertHTML', false, `<s>${st}</s>\u200B`); return;
    }
    const codeMatch = text.match(/`([^`]+?)`$/);
    if (codeMatch && offset === text.length) {
      const ct = codeMatch[1]; const ms = text.lastIndexOf('`'+ct+'`');
      const r = document.createRange(); r.setStart(anchorNode, ms); r.setEnd(anchorNode, offset);
      sel.removeAllRanges(); sel.addRange(r); document.execCommand('delete'); document.execCommand('insertHTML', false, `<code>${ct}</code>\u200B`); return;
    }
  }, []);

  const autoLinkify = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const anchorNode = sel.anchorNode;
    if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) return;
    let parent = anchorNode.parentNode;
    while (parent && parent !== editor) { if (parent.nodeName === 'A') return; parent = parent.parentNode; }
    const text = anchorNode.textContent;
    const match = text.match(/(https?:\/\/[^\s<>"']+)\s$/);
    if (match) {
      const url = match[1]; const urlStart = match.index; const urlEnd = urlStart + url.length;
      const range = document.createRange(); range.setStart(anchorNode, urlStart); range.setEnd(anchorNode, urlEnd);
      sel.removeAllRanges(); sel.addRange(range);
      document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener">${url}</a> `);
      syncContent();
    }
  };

  const handleEditorInput = useCallback(() => {
    processMarkdownShortcuts();
    autoLinkify();
    checkNoteLinkTrigger();
    syncContent();
  }, [processMarkdownShortcuts, checkNoteLinkTrigger]);

  const handleEditorClick = (e) => {
    const link = e.target.closest('a');
    if (link && link.href && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener');
    }
  };

  const handlePreviewClick = (e) => {
    const link = e.target.closest('a');
    if (link && link.href) {
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener');
    }
  };

  const handleEditorKeyDown = (e) => {
    // Close suggestions on Escape
    if (e.key === 'Escape' && linkSuggestion) {
      e.preventDefault();
      setLinkSuggestion(null);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); execCmd('bold'); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); execCmd('italic'); return; }

    if (e.key === 'Enter' && !e.shiftKey) {
      const block = getCurrentBlock(editorRef.current);
      if (!block) return;

      // Heading → new paragraph
      if (/^H[1-3]$/.test(block.nodeName)) {
        e.preventDefault(); const p = document.createElement('p'); p.innerHTML = '<br>'; block.after(p); placeCursorAtStart(p); syncContent(); return;
      }

      // Checklist item → new checklist item
      const checkItem = block.closest?.('.checklist-item') || (block.classList?.contains('checklist-item') ? block : null);
      if (checkItem) {
        const span = checkItem.querySelector('span');
        const text = span?.textContent?.replace(/\u200B/g, '').trim() || '';
        if (!text) {
          // Empty checklist item → exit to paragraph
          e.preventDefault();
          const p = document.createElement('p'); p.innerHTML = '<br>';
          checkItem.after(p); checkItem.remove(); placeCursorAtStart(p); syncContent();
        } else {
          // Create new checklist item
          e.preventDefault();
          const newItem = document.createElement('div');
          newItem.className = 'checklist-item';
          newItem.innerHTML = '<input type="checkbox" /> <span>\u200B</span>';
          checkItem.after(newItem);
          const newSpan = newItem.querySelector('span');
          placeCursorAtStart(newSpan);
          syncContent();
        }
        return;
      }

      // Empty list item → exit list
      if (block.nodeName === 'LI') {
        const text = block.textContent?.replace(/\u200B/g, '').trim() || '';
        if (!text) {
          e.preventDefault();
          const list = block.parentNode;
          const p = document.createElement('p'); p.innerHTML = '<br>';
          list.after(p); block.remove();
          if (!list.children.length) list.remove();
          placeCursorAtStart(p); syncContent();
          return;
        }
      }
    }

    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel.rangeCount && sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const block = getCurrentBlock(editorRef.current);
        if (!block) return;

        // Heading/blockquote at start → convert to paragraph
        if (/^(H[1-3]|BLOCKQUOTE)$/.test(block.nodeName) && range.startOffset === 0) {
          const textNode = sel.anchorNode;
          const isAtStart = textNode === block || (textNode === block.firstChild && range.startOffset === 0);
          if (isAtStart) { e.preventDefault(); document.execCommand('formatBlock', false, 'p'); syncContent(); return; }
        }

        // List item at start → convert to paragraph (don't merge with above)
        if (block.nodeName === 'LI' && range.startOffset === 0) {
          const textNode = sel.anchorNode;
          const isAtStart = textNode === block || textNode === block.firstChild;
          if (isAtStart) {
            e.preventDefault();
            const list = block.parentNode;
            const p = document.createElement('p');
            p.innerHTML = block.innerHTML || '<br>';
            list.before(p); block.remove();
            if (!list.children.length) list.remove();
            placeCursorAtStart(p); syncContent();
            return;
          }
        }

        // Checklist item at start → convert to paragraph
        const checkItem = block.closest?.('.checklist-item') || (block.classList?.contains('checklist-item') ? block : null);
        if (checkItem) {
          const span = checkItem.querySelector('span');
          if (span && sel.anchorNode === span && range.startOffset === 0) {
            e.preventDefault();
            const p = document.createElement('p');
            p.innerHTML = span.innerHTML || '<br>';
            checkItem.before(p); checkItem.remove();
            placeCursorAtStart(p); syncContent();
            return;
          }
        }
      }
    }
  };

  const handleEditorPaste = async (e) => {
    // Handle pasted images
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          const formData = new FormData();
          formData.append('file', file);
          try {
            const res = await axios.post(`${API_URL}/uploads/image`, formData);
            const url = resolveThumbnailUrl(res.data.url);
            editorRef.current?.focus();
            document.execCommand('insertHTML', false,
              `<p><img src="${url}" alt="Imagem colada" style="max-width:100%;border-radius:12px;cursor:pointer;" class="uploaded-img" /></p><p><br></p>`
            );
            syncContent();
          } catch (err) {
            console.error('Erro ao enviar imagem colada:', err);
          }
          return;
        }
      }
    }

    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const html = e.clipboardData.getData('text/html');
    if (html) { document.execCommand('insertHTML', false, html); }
    else if (text) {
      const linkified = text.replace(URL_REGEX, '<a href="$1" target="_blank" rel="noopener">$1</a>');
      if (linkified !== text) document.execCommand('insertHTML', false, linkified);
      else document.execCommand('insertText', false, text);
    }
    syncContent();
  };

  const handleEditorDrop = async (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      e.preventDefault();
      e.stopPropagation();
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await axios.post(`${API_URL}/uploads/image`, formData);
        const url = resolveThumbnailUrl(res.data.url);
        editorRef.current?.focus();
        document.execCommand('insertHTML', false,
          `<p><img src="${url}" alt="${file.name}" style="max-width:100%;border-radius:12px;cursor:pointer;" class="uploaded-img" /></p><p><br></p>`
        );
        syncContent();
      } catch (err) {
        console.error('Erro ao enviar imagem:', err);
      }
    }
  };

  const switchToPreview = () => {
    if (editorRef.current) {
      editorHtmlRef.current = editorRef.current.innerHTML;
      contentRef.current = htmlToMd(cleanEditorHtml(editorRef.current));
      setPreviewHtml(cleanEditorHtml(editorRef.current));
    } else {
      setPreviewHtml(mdToHtml(contentRef.current) || '');
    }
    setViewMode('preview');
    if (onPreviewToggle) onPreviewToggle(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toggle — FIXED position, never moves */}
      <div className="px-6 py-2 flex items-center justify-end border-b border-border-subtle">
        <div className="flex gap-1 p-1 bg-surface-flat rounded-xl border border-border-subtle">
          <button
            onClick={() => { setViewMode('edit'); if (onPreviewToggle) onPreviewToggle(false); }}
            className={`p-1.5 rounded-lg transition-all ${viewMode === 'edit' ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}
            title="Editar"
          >
            <Pencil size={13} strokeWidth={2.5} />
          </button>
          <button
            onClick={switchToPreview}
            className={`p-1.5 rounded-lg transition-all ${viewMode === 'preview' ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}
            title="Preview"
          >
            <Eye size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Toolbar — only in edit mode, separate row */}
      {viewMode === 'edit' && (
        <div className="px-6 py-1.5 flex items-center gap-0.5 flex-wrap border-b border-border-subtle relative">
          {toolbarActions.map((action, i) => {
            if (action.type === 'divider') return <div key={i} className="w-px h-5 bg-white/8 mx-1.5" />;
            const active = action.activeKey ? isActive(action.activeKey) : false;
            return (
              <div key={action.key} className="relative">
                <button
                  onMouseDown={(e) => { e.preventDefault(); action.action(); }}
                  title={action.label}
                  className={`p-2 rounded-lg transition-all ${active ? 'text-primary bg-primary/10' : 'text-gray-500 hover:text-white hover:bg-white/[0.06]'}`}
                >
                  <action.icon size={15} />
                </button>
                {action.isColorBtn && showColorPicker && (
                  <div ref={colorPickerRef} className="absolute top-full right-0 mt-2 z-50 glass-raised rounded-xl p-3 min-w-[180px] animate-fade-in shadow-modal">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2 px-1">Cor do texto</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {TEXT_COLORS.map((color) => (
                        <button
                          key={color.label}
                          onMouseDown={(e) => { e.preventDefault(); applyColor(color.value); }}
                          title={color.label}
                          className="w-7 h-7 rounded-lg border border-white/10 hover:border-white/30 transition-all hover:scale-110 flex items-center justify-center"
                          style={{ backgroundColor: color.value || '#18181D' }}
                        >
                          {!color.value && <X size={10} strokeWidth={2.5} className="text-gray-500" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Title */}
      <div className="px-10 pt-8 pb-1">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => { setTitle(e.target.value); triggerAutoSave(); }}
          placeholder="Sem título"
          className="w-full bg-transparent text-3xl font-extrabold text-white placeholder-gray-700 focus:outline-none tracking-tight"
          style={{ caretColor: '#37B24D' }}
        />
        <p className="text-[11px] text-gray-600 mt-2 font-mono uppercase tracking-wider">
          {new Date(note.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden relative">
        {viewMode === 'edit' ? (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onKeyDown={handleEditorKeyDown}
              onClick={handleEditorClick}
              onPaste={handleEditorPaste}
              onDrop={handleEditorDrop}
              className="notion-editor w-full min-h-full px-10 py-4 focus:outline-none text-[1.171875rem] leading-[1.85]"
              style={{ caretColor: '#37B24D' }}
              data-placeholder="Comece a escrever... Digite # para título, [[ para vincular notas"
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {previewHtml?.trim() ? (
              <div
                className="notion-editor w-full min-h-full px-10 py-4 text-[1.171875rem] leading-[1.85]"
                onClick={handlePreviewClick}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-600 text-sm font-serif italic">Nenhum conteúdo ainda...</p>
              </div>
            )}
          </div>
        )}

        {/* Note link suggestions */}
        {linkSuggestion && (
          <NoteLinkSuggestions
            query={linkSuggestion.query}
            notes={notes.filter((n) => n.id !== note.id)}
            onSelect={handleNoteLinkSelect}
            position={linkSuggestion.position}
          />
        )}
      </div>

      {/* Hidden image input */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Image Lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════
// Main Notes Page
// ═══════════════════════════════════════════════
const Notes = () => {
  const { collapsed } = useSidebar();
  const {
    folders, activeNote, activeNoteId, setActiveNoteId,
    selectedFolderId, setSelectedFolderId,
    searchTerm, setSearchTerm, searchNotes,
    createFolder, createNote, getChildFolders,
  } = useNotes();
  const [notesSidebarCollapsed, setNotesSidebarCollapsed] = useState(false);

  const rootFolders = useMemo(() => getChildFolders(null), [getChildFolders]);
  const searchResults = useMemo(() => searchTerm.trim() ? searchNotes(searchTerm) : [], [searchTerm, searchNotes]);

  // Fix 4: Create folder inside selected folder if one is selected
  const handleCreateFolder = () => {
    const parentId = selectedFolderId || null;
    createFolder('Nova pasta', parentId);
  };

  const handleCreateNote = () => {
    const folderId = selectedFolderId || folders.find((f) => f.parentId === null)?.id;
    if (folderId) createNote(folderId);
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-background transition-all duration-300",
        collapsed ? "ml-[72px]" : "ml-[260px]"
      )}
    >
      <div className="flex h-screen">
        {/* Notes Sidebar */}
        <div className={cn(
          "shrink-0 bg-surface/50 border-r border-border-subtle flex flex-col transition-all duration-300",
          notesSidebarCollapsed ? "w-0 overflow-hidden border-r-0" : "w-[280px]"
        )}>
          {/* Header */}
          <div className="p-4 pt-5 pb-3">
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => setNotesSidebarCollapsed(true)}
                className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                title="Retrair painel"
              >
                <PanelLeftClose size={18} />
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCreateFolder}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Nova pasta"
                >
                  <FolderPlus size={16} strokeWidth={2.5} />
                </button>
                <button
                  onClick={handleCreateNote}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Nova nota"
                >
                  <Plus size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar notas..."
                className="w-full bg-surface-flat border border-border-subtle rounded-xl py-2.5 pl-9 pr-3 text-[13px] text-white placeholder-gray-600 focus:outline-none focus:border-primary/30 transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-600 hover:text-white"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          {/* Tree or Search Results */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
            {searchTerm.trim() ? (
              <div className="space-y-0.5">
                <p className="data-label uppercase tracking-wider px-3 mb-2">{searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''}</p>
                {searchResults.map((note) => {
                  const folder = folders.find((f) => f.id === note.folderId);
                  return (
                    <button
                      key={note.id}
                      onClick={() => { setActiveNoteId(note.id); setSearchTerm(''); }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all",
                        activeNoteId === note.id
                          ? "bg-white/[0.07] text-white"
                          : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
                      )}
                    >
                      <FileText size={15} strokeWidth={1.5} className="shrink-0 text-gray-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold truncate">{note.title}</p>
                        {folder && <p className="text-[11px] text-gray-600 truncate">{folder.name}</p>}
                      </div>
                    </button>
                  );
                })}
                {searchResults.length === 0 && (
                  <p className="text-[14px] text-gray-600 text-center py-8">Nenhuma nota encontrada</p>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {rootFolders.map((folder) => (
                  <FolderTreeItem key={folder.id} folder={folder} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Expand button when sidebar is collapsed */}
          {notesSidebarCollapsed && (
            <div className="px-4 py-3 border-b border-border-subtle flex items-center">
              <button
                onClick={() => setNotesSidebarCollapsed(false)}
                className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                title="Expandir painel"
              >
                <PanelLeftOpen size={18} />
              </button>
            </div>
          )}
          {activeNote ? (
            <NoteEditor key={activeNote.id} note={activeNote} onPreviewToggle={(isPreview) => setNotesSidebarCollapsed(isPreview)} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-surface-raised rounded-3xl flex items-center justify-center mx-auto mb-4 border border-border-subtle">
                  <FileText size={24} strokeWidth={1.5} className="text-gray-600" />
                </div>
                <h3 className="text-lg font-extrabold text-gray-400 mb-1">Nenhuma nota selecionada</h3>
                <p className="text-sm text-gray-600">Selecione uma nota na sidebar ou crie uma nova</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Notes;
