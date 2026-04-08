import { useState, useRef, useEffect, useCallback } from 'react';
import TurndownService from 'turndown';
import { marked } from 'marked';
import {
  X, Eye, Pencil, Heading1, Heading2, Heading3,
  Bold, Italic, Strikethrough, List, ListOrdered, CheckSquare,
  Quote, Code, Link as LinkIcon, Minus, Table,
  Tag, ChevronDown, Palette, ImagePlus
} from 'lucide-react';
import axios from 'axios';
import ImageLightbox from './ImageLightbox';
import MarkdownRenderer, { toggleTaskInSource } from './MarkdownRenderer';

const TAGS = ['Reels', 'Carrossel', 'Post', 'Vídeo Longo', 'Nota', 'Ideia'];

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

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

turndown.addRule('coloredSpan', {
  filter: (node) => node.nodeName === 'SPAN' && node.style && node.style.color,
  replacement: (content) => content,
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
// Serialize .checklist-item divs as GFM task list items so the checked
// state round-trips correctly through markdown.
turndown.addRule('checklistItem', {
  filter: (node) => node.classList && node.classList.contains('checklist-item'),
  replacement: (content, node) => {
    const input = node.querySelector('input[type="checkbox"]');
    const checked = input && input.checked ? 'x' : ' ';
    const span = node.querySelector('span');
    const text = (span?.textContent || '').replace(/\u200B/g, '').trim();
    return `- [${checked}] ${text}\n`;
  },
});

const mdToHtml = (md) => {
  if (!md) return '';
  // Expand GFM task list markers into our editor's checklist markup BEFORE
  // handing off to marked so the checked attribute survives the round trip
  // and the DOM shape matches what insertChecklist creates.
  const pre = md.replace(/^(\s*)- \[([ xX])\] (.*)$/gm, (m, indent, state, rest) => {
    const checked = state.toLowerCase() === 'x' ? ' checked' : '';
    return `${indent}<div class="checklist-item"><input type="checkbox"${checked} /> <span>${rest || '\u200B'}</span></div>`;
  });
  return marked.parse(pre, { breaks: true, gfm: true });
};

const htmlToMd = (html) => {
  if (!html) return '';
  return turndown.turndown(html);
};
const cleanEditorHtml = (editor) => {
  const clone = editor.cloneNode(true);
  clone.querySelectorAll('.img-resize-toolbar').forEach(t => t.remove());
  clone.querySelectorAll('.img-resize-wrapper').forEach(w => {
    while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w);
    w.remove();
  });
  return clone.innerHTML;
};

// URL regex for auto-linkify
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

// ── Helpers ──
const getCurrentBlock = (editor) => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.anchorNode;
  if (!node) return null;
  if (node === editor) return node.firstChild;
  while (node && node.parentNode !== editor) {
    node = node.parentNode;
  }
  return node;
};
// Walk up from the selection to find the nearest <li>. Needed because
// getCurrentBlock returns the parent UL/OL for list selections.
const getCurrentListItem = (editor) => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.anchorNode;
  while (node && node !== editor) {
    if (node.nodeName === 'LI') return node;
    node = node.parentNode;
  }
  return null;
};

const placeCursorAtEnd = (el) => {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
};

const placeCursorAtStart = (el) => {
  const range = document.createRange();
  const sel = window.getSelection();
  if (el.firstChild) {
    range.setStart(el.firstChild, 0);
  } else {
    range.setStart(el, 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
};

import { resolveThumbnailUrl } from './Thumbnail';

const API_URL = import.meta.env.VITE_API_URL;

const TaskEditor = ({ task, onSave, onClose, initialStatus, initialDate }) => {
  const isEditing = !!task;
  const [title, setTitle] = useState(task?.title || '');
  const [tag, setTag] = useState(task?.tag || 'Nota');
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(task?.scheduled_date || initialDate || '');
  const [scheduledTime, setScheduledTime] = useState(task?.scheduled_time || '');
  const [viewMode, setViewMode] = useState('edit');
  const [activeFormats, setActiveFormats] = useState({});
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const imageInputRef = useRef(null);

  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const contentRef = useRef(task?.content_md || '');
  const colorPickerRef = useRef(null);
  const savedSelectionRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const taskCreatedRef = useRef(isEditing); // track if task exists in DB

  useEffect(() => {
    if (titleRef.current && !isEditing) {
      titleRef.current.focus();
    }
  }, [isEditing]);

  // Load editor content when switching TO edit mode
  useEffect(() => {
    if (editorRef.current && viewMode === 'edit') {
      const html = mdToHtml(contentRef.current);
      editorRef.current.innerHTML = html || '<p><br></p>';
    }
  }, [viewMode]);

  // Sync before preview
  const switchToPreview = () => {
    if (editorRef.current) {
      contentRef.current = htmlToMd(cleanEditorHtml(editorRef.current));
    }
    setViewMode('preview');
  };

  const switchToEdit = () => {
    setViewMode('edit');
  };

  // ── Auto-save with debounce ──
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      doSave();
    }, 800);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const doSave = async () => {
    const currentTitle = titleRef.current?.value || title;
    if (!currentTitle.trim()) return; // Don't save without title

    if (editorRef.current) {
      contentRef.current = htmlToMd(cleanEditorHtml(editorRef.current));
    }

    try {
      await onSave({
        title: currentTitle.trim(),
        content_md: contentRef.current || '',
        tag,
        status: task?.status || initialStatus || 'todo',
        scheduled_date: scheduledDate || null,
        scheduled_time: scheduledTime || null,
      });
      taskCreatedRef.current = true;
    } catch (err) {
      console.error('Auto-save error:', err);
    }
  };

  // Trigger auto-save when title or tag changes
  const handleTitleChange = (e) => {
    setTitle(e.target.value);
    triggerAutoSave();
  };

  const handleTagChange = (t) => {
    setTag(t);
    setShowTagMenu(false);
    // Immediate save on tag change
    setTimeout(() => doSave(), 100);
  };

  // Close color picker on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setShowColorPicker(false);
      }
    };
    if (showColorPicker) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showColorPicker]);

  // Track active formatting
  const updateActiveFormats = useCallback(() => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    let inEditor = false;
    let node = sel.anchorNode;
    while (node) {
      if (node === editorRef.current) { inEditor = true; break; }
      node = node.parentNode;
    }
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
      contentRef.current = htmlToMd(cleanEditorHtml(editorRef.current));
    }
    triggerAutoSave();
  };

  // ── Color: use execCommand with styleWithCSS ──
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
        const range = sel.getRangeAt(0);
        const selectedText = range.toString();
        if (selectedText) {
          document.execCommand('insertHTML', false, `<span style="color: ${color}">${selectedText}</span>`);
        }
      }
      syncContent();
    }, 50);
  };

  // Code toggle
  const toggleCode = () => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && !sel.isCollapsed) {
      let node = sel.anchorNode;
      let insideCode = false;
      while (node && node !== editorRef.current) {
        if (node.nodeName === 'CODE') { insideCode = true; break; }
        node = node.parentNode;
      }
      if (insideCode) {
        const codeEl = node;
        const textNode = document.createTextNode(codeEl.textContent);
        codeEl.parentNode.replaceChild(textNode, codeEl);
      } else {
        const text = sel.toString();
        document.execCommand('insertHTML', false, `<code>${text}</code>\u200B`);
      }
    } else {
      document.execCommand('insertHTML', false, '<code>código</code>\u200B');
    }
    syncContent();
  };

  const insertTable = () => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, '<table><thead><tr><th>Coluna 1</th><th>Coluna 2</th><th>Coluna 3</th></tr></thead><tbody><tr><td>valor</td><td>valor</td><td>valor</td></tr></tbody></table><p><br></p>');
    syncContent();
  };

  const insertHR = () => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, '<hr/><p><br></p>');
    syncContent();
  };

  const insertLink = () => {
    const url = prompt('URL do link:');
    if (url) execCmd('createLink', url);
  };

  const insertChecklist = () => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, '<div class="checklist-item"><input type="checkbox" /> <span>\u200B</span></div>');
    requestAnimationFrame(() => {
      const span = editorRef.current?.querySelector('.checklist-item:last-of-type span');
      if (span) placeCursorAtStart(span);
    });
    syncContent();
  };

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
      savedSelectionRef.current = (() => {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) return sel.getRangeAt(0).cloneRange();
        return null;
      })();
      setShowColorPicker(!showColorPicker);
    }, isColorBtn: true },
    { type: 'divider' },
    { key: 'image', icon: ImagePlus, label: 'Inserir imagem', action: () => imageInputRef.current?.click() },
  ];

  // ── Auto-linkify: convert URLs in text to <a> tags ──
  const autoLinkify = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const anchorNode = sel.anchorNode;
    if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) return;

    // Don't linkify if already inside an <a>
    let parent = anchorNode.parentNode;
    while (parent && parent !== editor) {
      if (parent.nodeName === 'A') return;
      parent = parent.parentNode;
    }

    const text = anchorNode.textContent;
    const match = text.match(/(https?:\/\/[^\s<>"']+)\s$/);
    if (match) {
      const url = match[1];
      const urlStart = match.index;
      const urlEnd = urlStart + url.length;

      const range = document.createRange();
      range.setStart(anchorNode, urlStart);
      range.setEnd(anchorNode, urlEnd);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener">${url}</a> `);
      syncContent();
    }
  };

  // ── Real-time markdown shortcut detection ──
  const processMarkdownShortcuts = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const anchorNode = sel.anchorNode;
    if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) return;

    const text = anchorNode.textContent;
    const offset = sel.anchorOffset;

    const block = getCurrentBlock(editor);
    if (!block) return;

    const blockText = block.textContent;

    // ── Block shortcuts ──
    if (/^# /.test(blockText) && block.nodeName !== 'H1' && !['H2', 'H3'].includes(block.nodeName)) {
      const remaining = blockText.slice(2);
      document.execCommand('formatBlock', false, 'h1');
      const newBlock = getCurrentBlock(editor);
      if (newBlock) {
        newBlock.textContent = remaining || '\u200B';
        placeCursorAtEnd(newBlock);
      }
      return;
    }

    if (/^## /.test(blockText) && block.nodeName !== 'H2') {
      const remaining = blockText.slice(3);
      document.execCommand('formatBlock', false, 'h2');
      const newBlock = getCurrentBlock(editor);
      if (newBlock) {
        newBlock.textContent = remaining || '\u200B';
        placeCursorAtEnd(newBlock);
      }
      return;
    }

    if (/^### /.test(blockText) && block.nodeName !== 'H3') {
      const remaining = blockText.slice(4);
      document.execCommand('formatBlock', false, 'h3');
      const newBlock = getCurrentBlock(editor);
      if (newBlock) {
        newBlock.textContent = remaining || '\u200B';
        placeCursorAtEnd(newBlock);
      }
      return;
    }

    if (/^> /.test(blockText) && block.nodeName !== 'BLOCKQUOTE') {
      const remaining = blockText.slice(2);
      document.execCommand('formatBlock', false, 'blockquote');
      const newBlock = getCurrentBlock(editor);
      if (newBlock) {
        newBlock.textContent = remaining || '\u200B';
        placeCursorAtEnd(newBlock);
      }
      return;
    }

    if (/^- \[[ x]\] /.test(blockText)) {
      const checked = blockText.startsWith('- [x] ');
      const remaining = blockText.replace(/^- \[[ x]\] /, '');
      block.innerHTML = '';
      document.execCommand('insertHTML', false,
        `<div class="checklist-item"><input type="checkbox" ${checked ? 'checked' : ''}/> <span>${remaining || '\u200B'}</span></div>`
      );
      syncContent();
      return;
    }

    if (/^[-*] /.test(blockText) && block.nodeName !== 'LI' && block.nodeName !== 'UL') {
      const remaining = blockText.slice(2);
      document.execCommand('insertUnorderedList', false, null);
      const sel2 = window.getSelection();
      if (sel2.anchorNode) {
        let li = sel2.anchorNode;
        while (li && li.nodeName !== 'LI') li = li.parentNode;
        if (li) {
          li.textContent = remaining || '\u200B';
          placeCursorAtEnd(li);
        }
      }
      return;
    }

    if (/^1\. /.test(blockText) && block.nodeName !== 'LI' && block.nodeName !== 'OL') {
      const remaining = blockText.slice(3);
      document.execCommand('insertOrderedList', false, null);
      const sel2 = window.getSelection();
      if (sel2.anchorNode) {
        let li = sel2.anchorNode;
        while (li && li.nodeName !== 'LI') li = li.parentNode;
        if (li) {
          li.textContent = remaining || '\u200B';
          placeCursorAtEnd(li);
        }
      }
      return;
    }

    if (blockText.trim() === '---') {
      block.remove();
      document.execCommand('insertHTML', false, '<hr/><p><br></p>');
      return;
    }

    // ── Inline shortcuts ──
    const boldMatch = text.match(/\*\*(.+?)\*\*$/);
    if (boldMatch && offset === text.length) {
      const boldText = boldMatch[1];
      const matchStart = text.lastIndexOf('**' + boldText + '**');
      const range = document.createRange();
      range.setStart(anchorNode, matchStart);
      range.setEnd(anchorNode, offset);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete', false, null);
      document.execCommand('insertHTML', false, `<strong>${boldText}</strong>\u200B`);
      return;
    }

    const italicMatch = text.match(/(?<!\*)\*([^*]+?)\*$/);
    if (italicMatch && offset === text.length) {
      const italicText = italicMatch[1];
      const fullMatch = '*' + italicText + '*';
      const matchStart = text.lastIndexOf(fullMatch);
      if (matchStart >= 0) {
        const range = document.createRange();
        range.setStart(anchorNode, matchStart);
        range.setEnd(anchorNode, offset);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('delete', false, null);
        document.execCommand('insertHTML', false, `<em>${italicText}</em>\u200B`);
        return;
      }
    }

    const strikeMatch = text.match(/~~(.+?)~~$/);
    if (strikeMatch && offset === text.length) {
      const strikeText = strikeMatch[1];
      const matchStart = text.lastIndexOf('~~' + strikeText + '~~');
      const range = document.createRange();
      range.setStart(anchorNode, matchStart);
      range.setEnd(anchorNode, offset);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete', false, null);
      document.execCommand('insertHTML', false, `<s>${strikeText}</s>\u200B`);
      return;
    }

    const codeMatch = text.match(/`([^`]+?)`$/);
    if (codeMatch && offset === text.length) {
      const codeText = codeMatch[1];
      const matchStart = text.lastIndexOf('`' + codeText + '`');
      const range = document.createRange();
      range.setStart(anchorNode, matchStart);
      range.setEnd(anchorNode, offset);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete', false, null);
      document.execCommand('insertHTML', false, `<code>${codeText}</code>\u200B`);
      return;
    }
  }, []);

  const handleEditorInput = useCallback(() => {
    processMarkdownShortcuts();
    autoLinkify();
    syncContent();
  }, [processMarkdownShortcuts]);

  const handleEditorClick = (e) => {
    const link = e.target.closest('a');
    if (link && link.href) {
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener');
      return;
    }
    // Persist checkbox toggles inside .checklist-item immediately.
    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
      requestAnimationFrame(() => syncContent());
    }
  };

  const handleEditorKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      execCmd('bold');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      execCmd('italic');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const block = getCurrentBlock(editorRef.current);
      if (!block) return;

      // Heading → new paragraph
      if (/^H[1-3]$/.test(block.nodeName)) {
        e.preventDefault();
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        block.after(p);
        placeCursorAtStart(p);
        syncContent();
        return;
      }

      // Checklist item → new item (or exit when empty)
      const checkItem = block.closest?.('.checklist-item') || (block.classList?.contains('checklist-item') ? block : null);
      if (checkItem) {
        const span = checkItem.querySelector('span');
        const text = (span?.textContent || '').replace(/\u200B/g, '').trim();
        if (!text) {
          // Empty → exit to paragraph
          e.preventDefault();
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          checkItem.after(p);
          checkItem.remove();
          placeCursorAtStart(p);
          syncContent();
        } else {
          // Has text → new checklist item below
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

      // Empty list item → exit list to paragraph
      const enterLi = getCurrentListItem(editorRef.current);
      if (enterLi) {
        const text = (enterLi.textContent || '').replace(/\u200B/g, '').trim();
        if (!text) {
          e.preventDefault();
          const list = enterLi.parentNode;
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          list.after(p);
          enterLi.remove();
          if (!list.children.length) list.remove();
          placeCursorAtStart(p);
          syncContent();
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
          if (isAtStart) {
            e.preventDefault();
            document.execCommand('formatBlock', false, 'p');
            syncContent();
            return;
          }
        }

        // Empty checklist item → unwrap to paragraph (regardless of cursor position)
        const checkItem = block.closest?.('.checklist-item') || (block.classList?.contains('checklist-item') ? block : null);
        if (checkItem) {
          const span = checkItem.querySelector('span');
          const cText = (span?.textContent || '').replace(/\u200B/g, '').trim();
          if (cText === '') {
            e.preventDefault();
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            checkItem.before(p);
            checkItem.remove();
            placeCursorAtStart(p);
            syncContent();
            return;
          }
          if (span && sel.anchorNode === span && range.startOffset === 0) {
            e.preventDefault();
            const p = document.createElement('p');
            p.innerHTML = span.innerHTML || '<br>';
            checkItem.before(p); checkItem.remove();
            placeCursorAtStart(p); syncContent();
            return;
          }
        }

        // Empty list item (bullet / numbered) → unwrap to paragraph.
        // Place the new paragraph AFTER the list so the user can continue
        // writing below the remaining items (if any).
        const bsLi = getCurrentListItem(editorRef.current);
        if (bsLi) {
          const liText = (bsLi.textContent || '').replace(/\u200B/g, '').trim();
          if (liText === '') {
            e.preventDefault();
            const list = bsLi.parentNode;
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            list.after(p);
            bsLi.remove();
            if (!list.children.length) list.remove();
            placeCursorAtStart(p);
            syncContent();
            return;
          }
          if (range.startOffset === 0) {
            const textNode = sel.anchorNode;
            const isAtStart = textNode === bsLi || textNode === bsLi.firstChild;
            if (isAtStart) {
              e.preventDefault();
              const list = bsLi.parentNode;
              const p = document.createElement('p');
              p.innerHTML = bsLi.innerHTML || '<br>';
              list.after(p); bsLi.remove();
              if (!list.children.length) list.remove();
              placeCursorAtStart(p); syncContent();
              return;
            }
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

    if (html) {
      document.execCommand('insertHTML', false, html);
    } else if (text) {
      // Auto-linkify URLs in pasted plain text
      const linkified = text.replace(URL_REGEX, '<a href="$1" target="_blank" rel="noopener">$1</a>');
      if (linkified !== text) {
        document.execCommand('insertHTML', false, linkified);
      } else {
        document.execCommand('insertText', false, text);
      }
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

  // Save on close
  const handleClose = () => {
    if (editorRef.current) {
      contentRef.current = htmlToMd(cleanEditorHtml(editorRef.current));
    }
    // Final save before closing
    if (title.trim()) {
      doSave();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md bg-black/60 animate-fade-in" onClick={handleClose}>
      <div
        className="glass-raised w-full max-w-5xl h-[90vh] rounded-4xl flex flex-col overflow-hidden shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between px-7 py-4 border-b border-border-subtle bg-surface/60">
          <div className="flex items-center gap-4">
            {/* Tag Selector */}
            <div className="relative">
              <button
                onClick={() => setShowTagMenu(!showTagMenu)}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-bold border border-primary/15 hover:bg-primary/15 transition-colors"
              >
                <Tag size={12} />
                {tag}
                <ChevronDown size={12} />
              </button>
              {showTagMenu && (
                <div className="absolute top-full left-0 mt-2 z-50 glass-raised rounded-xl py-1.5 min-w-[150px] animate-fade-in shadow-modal">
                  {TAGS.map(t => (
                    <button
                      key={t}
                      onClick={() => handleTagChange(t)}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        tag === t ? 'text-primary bg-primary/10 font-medium' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scheduled Date + Time */}
            <div className="flex gap-1.5">
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => { setScheduledDate(e.target.value); triggerAutoSave(); }}
                className="px-3 py-1.5 bg-surface-flat text-gray-300 rounded-xl text-xs font-mono border border-border-subtle hover:border-border-hover focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors [color-scheme:dark]"
                title="Data"
              />
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => { setScheduledTime(e.target.value); triggerAutoSave(); }}
                className="px-2.5 py-1.5 bg-surface-flat text-gray-300 rounded-xl text-xs font-mono border border-border-subtle hover:border-border-hover focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors [color-scheme:dark] w-[90px]"
                title="Hora"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex gap-1 p-1 bg-surface-flat rounded-xl border border-border-subtle">
              <button
                onClick={switchToEdit}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'edit' ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}
                title="Editar"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={switchToPreview}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'preview' ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}
                title="Preview"
              >
                <Eye size={13} />
              </button>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 bg-white/5 hover:bg-white/8 rounded-xl transition-colors text-gray-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toolbar */}
        {viewMode === 'edit' && (
          <div className="px-10 py-2.5 flex items-center gap-0.5 flex-wrap border-b border-border-subtle relative">
            {toolbarActions.map((action, i) => {
              if (action.type === 'divider') {
                return <div key={i} className="w-px h-5 bg-white/8 mx-1.5" />;
              }
              const active = action.activeKey ? isActive(action.activeKey) : false;
              return (
                <div key={action.key} className="relative">
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      action.action();
                    }}
                    title={action.label}
                    className={`p-2 rounded-lg transition-all ${
                      active
                        ? 'text-primary bg-primary/10'
                        : 'text-gray-500 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <action.icon size={15} />
                  </button>

                  {action.isColorBtn && showColorPicker && (
                    <div
                      ref={colorPickerRef}
                      className="absolute top-full right-0 mt-2 z-50 glass-raised rounded-xl p-3 min-w-[180px] animate-fade-in shadow-modal"
                    >
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2 px-1">Cor do texto</p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {TEXT_COLORS.map((color) => (
                          <button
                            key={color.label}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              applyColor(color.value);
                            }}
                            title={color.label}
                            className="w-7 h-7 rounded-lg border border-white/10 hover:border-white/30 transition-all hover:scale-110 flex items-center justify-center"
                            style={{ backgroundColor: color.value || '#18181D' }}
                          >
                            {!color.value && <X size={10} className="text-gray-500" />}
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
        <div className="px-10 pt-6 pb-1">
          <input
            ref={titleRef}
            value={title}
            onChange={handleTitleChange}
            placeholder="Sem título"
            className="w-full bg-transparent text-3xl font-bold text-white placeholder-gray-700 focus:outline-none tracking-tight"
            style={{ caretColor: '#37B24D' }}
          />
        </div>

        {/* Editor Body */}
        <div className="flex-1 flex overflow-hidden">
          {viewMode === 'edit' ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
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
                data-placeholder="Comece a escrever... Digite # para título, - para lista, > para citação"
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar px-10 py-6">
              {contentRef.current?.trim() ? (
                <MarkdownRenderer
                  className="markdown-body-lg max-w-none"
                  onTaskToggle={(idx, checked) => {
                    const next = toggleTaskInSource(contentRef.current || '', idx);
                    contentRef.current = next;
                    triggerAutoSave();
                  }}
                >
                  {contentRef.current || ''}
                </MarkdownRenderer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-600 text-sm font-serif italic">Nenhum conteúdo ainda...</p>
                </div>
              )}
            </div>
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
      </div>

      {/* Image Lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
};

export default TaskEditor;
