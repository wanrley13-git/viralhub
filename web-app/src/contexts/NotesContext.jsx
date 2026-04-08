import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const NotesContext = createContext();

const STORAGE_KEY = 'viralhub_notes';
const ACTIVE_KEY = 'viralhub_notes_active_id';
const FOLDER_KEY = 'viralhub_notes_folder_id';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const DEFAULT_DATA = {
  folders: [
    { id: 'default', name: 'Geral', icon: 'folder', parentId: null, order: 0 },
  ],
  notes: [],
};

const loadData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error('Error loading notes:', e); }
  return DEFAULT_DATA;
};

const saveData = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const NotesProvider = ({ children }) => {
  const [data, setData] = useState(loadData);
  const [activeNoteId, setActiveNoteId] = useState(() => {
    try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; }
  });
  const [selectedFolderId, setSelectedFolderId] = useState(() => {
    try { return localStorage.getItem(FOLDER_KEY) || null; } catch { return null; }
  });
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Persist last-open note/folder across sessions
  useEffect(() => {
    try {
      if (activeNoteId) localStorage.setItem(ACTIVE_KEY, activeNoteId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }, [activeNoteId]);

  useEffect(() => {
    try {
      if (selectedFolderId) localStorage.setItem(FOLDER_KEY, selectedFolderId);
      else localStorage.removeItem(FOLDER_KEY);
    } catch {}
  }, [selectedFolderId]);

  const persist = useCallback((updater) => {
    setData((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveData(next);
      return next;
    });
  }, []);

  // ── Folders ──
  const createFolder = useCallback((name, parentId = null) => {
    const folder = { id: generateId(), name, icon: 'folder', parentId, order: Date.now() };
    persist((prev) => ({ ...prev, folders: [...prev.folders, folder] }));
    setRenamingFolderId(folder.id);
    return folder;
  }, [persist]);

  const renameFolder = useCallback((id, name) => {
    persist((prev) => ({
      ...prev,
      folders: prev.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    }));
    setRenamingFolderId(null);
  }, [persist]);

  const setFolderIcon = useCallback((id, icon) => {
    persist((prev) => ({
      ...prev,
      folders: prev.folders.map((f) => (f.id === id ? { ...f, icon } : f)),
    }));
  }, [persist]);

  const deleteFolder = useCallback((id) => {
    persist((prev) => {
      const allIds = new Set();
      const collect = (parentId) => {
        prev.folders.forEach((f) => {
          if (f.parentId === parentId) {
            allIds.add(f.id);
            collect(f.id);
          }
        });
      };
      allIds.add(id);
      collect(id);

      return {
        folders: prev.folders.filter((f) => !allIds.has(f.id)),
        notes: prev.notes.filter((n) => !allIds.has(n.folderId)),
      };
    });
    setSelectedFolderId((prev) => (prev === id ? null : prev));
  }, [persist]);

  const moveFolder = useCallback((folderId, newParentId) => {
    // Prevent moving a folder into itself or its descendants
    persist((prev) => {
      const descendants = new Set();
      const collect = (parentId) => {
        prev.folders.forEach((f) => {
          if (f.parentId === parentId) {
            descendants.add(f.id);
            collect(f.id);
          }
        });
      };
      descendants.add(folderId);
      collect(folderId);

      if (descendants.has(newParentId)) return prev;

      return {
        ...prev,
        folders: prev.folders.map((f) =>
          f.id === folderId ? { ...f, parentId: newParentId } : f
        ),
      };
    });
  }, [persist]);

  // ── Notes ──
  const createNote = useCallback((folderId) => {
    const note = {
      id: generateId(),
      folderId,
      title: 'Sem título',
      content: '',
      order: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    persist((prev) => ({ ...prev, notes: [...prev.notes, note] }));
    setActiveNoteId(note.id);
    return note;
  }, [persist]);

  const updateNote = useCallback((id, updates) => {
    persist((prev) => ({
      ...prev,
      notes: prev.notes.map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
      ),
    }));
  }, [persist]);

  const deleteNote = useCallback((id) => {
    persist((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }));
    setActiveNoteId((prev) => (prev === id ? null : prev));
  }, [persist]);

  const moveNote = useCallback((noteId, newFolderId) => {
    persist((prev) => ({
      ...prev,
      notes: prev.notes.map((n) =>
        n.id === noteId ? { ...n, folderId: newFolderId, updatedAt: Date.now() } : n
      ),
    }));
  }, [persist]);

  const reorderNote = useCallback((draggedNoteId, targetNoteId) => {
    persist((prev) => {
      const draggedNote = prev.notes.find((n) => n.id === draggedNoteId);
      if (!draggedNote) return prev;

      // Get notes in the same folder, sorted by order
      const folderNotes = prev.notes
        .filter((n) => n.folderId === draggedNote.folderId)
        .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));

      // Determine original indices to know drag direction
      const draggedOrigIndex = folderNotes.findIndex((n) => n.id === draggedNoteId);
      const targetOrigIndex = folderNotes.findIndex((n) => n.id === targetNoteId);
      if (draggedOrigIndex === -1 || targetOrigIndex === -1) return prev;

      // Remove dragged note from array
      const withoutDragged = folderNotes.filter((n) => n.id !== draggedNoteId);

      // Find target index in the reduced array
      const targetIndex = withoutDragged.findIndex((n) => n.id === targetNoteId);

      // Dragging down: insert AFTER target. Dragging up: insert BEFORE target.
      const insertIndex = draggedOrigIndex < targetOrigIndex ? targetIndex + 1 : targetIndex;
      withoutDragged.splice(insertIndex, 0, draggedNote);

      // Assign new order values
      const orderMap = {};
      withoutDragged.forEach((n, i) => { orderMap[n.id] = i; });

      return {
        ...prev,
        notes: prev.notes.map((n) =>
          orderMap[n.id] !== undefined ? { ...n, order: orderMap[n.id] } : n
        ),
      };
    });
  }, [persist]);

  // ── Derived ──
  const activeNote = data.notes.find((n) => n.id === activeNoteId) || null;

  const getChildFolders = useCallback((parentId) => {
    return data.folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  }, [data.folders]);

  const getFolderNotes = useCallback((folderId) => {
    return data.notes
      .filter((n) => n.folderId === folderId)
      .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  }, [data.notes]);

  const searchNotes = useCallback((term) => {
    if (!term.trim()) return [];
    const lower = term.toLowerCase();
    return data.notes.filter(
      (n) =>
        n.title.toLowerCase().includes(lower) ||
        n.content.toLowerCase().includes(lower)
    );
  }, [data.notes]);

  const findNoteByTitle = useCallback((title) => {
    const lower = title.toLowerCase().trim();
    return data.notes.find((n) => n.title.toLowerCase().trim() === lower) || null;
  }, [data.notes]);

  return (
    <NotesContext.Provider
      value={{
        folders: data.folders,
        notes: data.notes,
        activeNote,
        activeNoteId,
        setActiveNoteId,
        selectedFolderId,
        setSelectedFolderId,
        renamingFolderId,
        setRenamingFolderId,
        searchTerm,
        setSearchTerm,
        createFolder,
        renameFolder,
        setFolderIcon,
        deleteFolder,
        moveFolder,
        createNote,
        updateNote,
        deleteNote,
        moveNote,
        reorderNote,
        getChildFolders,
        getFolderNotes,
        searchNotes,
        findNoteByTitle,
      }}
    >
      {children}
    </NotesContext.Provider>
  );
};

export const useNotes = () => {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within NotesProvider');
  return ctx;
};
