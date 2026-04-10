/**
 * NotesContext — backend-backed notes with workspace scoping.
 *
 * Migrated from localStorage to REST API so team workspace members
 * can share notes.  When the API is unreachable (500, network error,
 * missing tables) the context transparently falls back to localStorage
 * so the user experience is never broken.
 *
 * On first load, any leftover localStorage data is bulk-imported into
 * the backend and then cleaned up.
 */
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { useWorkspace } from './WorkspaceContext';
import { getAccessToken } from '../supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;
const NotesContext = createContext();
const MIGRATED_KEY = 'viralhub_notes_migrated_to_api';

// ── helpers ────────────────────────────────────────────────────

const authHeaders = async () => {
  const token = await getAccessToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
};

/** Backend snake_case → frontend camelCase for folders */
const normalizeFolder = (f) => ({
  id: f.id,
  name: f.name,
  icon: f.icon,
  parentId: f.parent_id ?? null,
  order: f.order_index ?? 0,
});

/** Backend snake_case → frontend camelCase for notes */
const normalizeNote = (n) => ({
  id: n.id,
  folderId: n.folder_id ?? null,
  title: n.title,
  content: n.content_md !== undefined ? (n.content_md ?? '') : undefined,
  order: n.order_index ?? 0,
  createdAt: n.created_at ? new Date(n.created_at).getTime() : Date.now(),
  updatedAt: n.updated_at ? new Date(n.updated_at).getTime() : Date.now(),
});

// ── localStorage fallback helpers ─────────────────────────────

const lsKey = (wsId) => `viralhub_notes_ws_${wsId}`;

const DEFAULT_FOLDER = { id: 'default', name: 'Geral', icon: 'folder', parentId: null, order: 0 };

/** Read workspace-scoped notes data from localStorage. */
const readLS = (wsId) => {
  try {
    const raw = localStorage.getItem(lsKey(wsId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        folders: parsed.folders?.length ? parsed.folders : [DEFAULT_FOLDER],
        notes: parsed.notes ?? [],
      };
    }
  } catch { /* corrupted data */ }
  return { folders: [DEFAULT_FOLDER], notes: [] };
};

/** Write workspace-scoped notes data to localStorage. */
const writeLS = (wsId, folders, notes) => {
  try {
    localStorage.setItem(lsKey(wsId), JSON.stringify({ folders, notes }));
  } catch { /* quota exceeded — silent */ }
};

// ── localStorage migration helpers ─────────────────────────────

/** Find any legacy localStorage notes data and return {folders, notes}. */
const findLegacyData = (wsId) => {
  const candidates = [
    `viralhub_notes_ws_${wsId}`,
    'viralhub_notes',
  ];
  for (const key of candidates) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.notes?.length > 0 || parsed.folders?.length > 1) return { key, data: parsed };
      }
    } catch {}
  }
  return null;
};

const cleanupLegacyKeys = () => {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('viralhub_notes') && !key.startsWith(MIGRATED_KEY)) toRemove.push(key);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
};

// ── provider ───────────────────────────────────────────────────

export const NotesProvider = ({ children }) => {
  const { activeWorkspaceId } = useWorkspace();

  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeNoteId, setActiveNoteId] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // true = API unavailable, persist to localStorage
  const fallbackRef = useRef(false);

  // ── persist to localStorage (used in fallback mode) ─────────

  const persistLS = useCallback((nextFolders, nextNotes) => {
    if (!activeWorkspaceId) return;
    writeLS(activeWorkspaceId, nextFolders ?? folders, nextNotes ?? notes);
  }, [activeWorkspaceId, folders, notes]);

  // ── fetch from API ──────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const headers = await authHeaders();
      if (!headers) {
        // Not authenticated — use localStorage directly
        fallbackRef.current = true;
        const ls = readLS(activeWorkspaceId);
        setFolders(ls.folders);
        setNotes(ls.notes);
        return;
      }
      const [fRes, nRes] = await Promise.all([
        axios.get(`${API_URL}/notes/folders`, { headers }),
        axios.get(`${API_URL}/notes/`, { headers }),
      ]);
      fallbackRef.current = false;
      setFolders(fRes.data.map(normalizeFolder));
      setNotes(nRes.data.map(normalizeNote));
    } catch (err) {
      console.warn('Notes API unavailable, falling back to localStorage.', err?.response?.status, err?.message);
      fallbackRef.current = true;
      const ls = readLS(activeWorkspaceId);
      setFolders(ls.folders);
      setNotes(ls.notes);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  // ── localStorage → API migration (one-time) ─────────────────

  const migrateLocalStorage = useCallback(async () => {
    if (!activeWorkspaceId) return false;
    const migKey = `${MIGRATED_KEY}_${activeWorkspaceId}`;
    if (localStorage.getItem(migKey)) return false;

    const legacy = findLegacyData(activeWorkspaceId);
    if (!legacy) {
      localStorage.setItem(migKey, '1');
      return false;
    }

    try {
      const headers = await authHeaders();
      if (!headers) return false;
      const { folders: lf = [], notes: ln = [] } = legacy.data;

      const foldersToImport = lf.filter((f) => f.id !== 'default');
      const defaultFolder = lf.find((f) => f.id === 'default');

      const bulkPayload = {
        folders: [
          ...(defaultFolder
            ? [{ temp_id: 'default', name: defaultFolder.name || 'Geral', icon: defaultFolder.icon || 'folder', temp_parent_id: null, order_index: 0 }]
            : [{ temp_id: 'default', name: 'Geral', icon: 'folder', temp_parent_id: null, order_index: 0 }]),
          ...foldersToImport.map((f, i) => ({
            temp_id: String(f.id),
            name: f.name,
            icon: f.icon || 'folder',
            temp_parent_id: f.parentId ? String(f.parentId) : null,
            order_index: i + 1,
          })),
        ],
        notes: ln.map((n, i) => ({
          temp_folder_id: n.folderId ? String(n.folderId) : 'default',
          title: n.title || 'Sem título',
          content_md: n.content || '',
          order_index: i,
        })),
      };

      await axios.post(`${API_URL}/notes/bulk`, bulkPayload, { headers });
      localStorage.setItem(migKey, '1');
      cleanupLegacyKeys();
      return true;
    } catch (err) {
      console.error('Notes migration error:', err);
      return false;
    }
  }, [activeWorkspaceId]);

  // ── main effect: migrate then fetch ──────────────────────────

  useEffect(() => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setActiveNoteId(null);
    setSelectedFolderId(null);
    // Reset fallback on workspace switch — retry API
    fallbackRef.current = false;

    (async () => {
      await migrateLocalStorage();
      await fetchAll();
    })();
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── folder CRUD ─────────────────────────────────────────────

  const createFolder = useCallback(async (name, parentId = null) => {
    // localStorage fallback
    if (fallbackRef.current) {
      const folder = {
        id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        icon: 'folder',
        parentId,
        order: Date.now(),
      };
      setFolders((prev) => {
        const next = [...prev, folder];
        writeLS(activeWorkspaceId, next, notes);
        return next;
      });
      setRenamingFolderId(folder.id);
      return folder;
    }

    try {
      const headers = await authHeaders();
      const res = await axios.post(`${API_URL}/notes/folders`, {
        name,
        icon: 'folder',
        parent_id: parentId,
        order_index: folders.length,
      }, { headers });
      const folder = normalizeFolder(res.data);
      setFolders((prev) => [...prev, folder]);
      setRenamingFolderId(folder.id);
      return folder;
    } catch (err) {
      console.error('Create folder error:', err);
      return null;
    }
  }, [activeWorkspaceId, notes]);

  const renameFolder = useCallback(async (id, name) => {
    setFolders((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, name } : f));
      if (fallbackRef.current) writeLS(activeWorkspaceId, next, notes);
      return next;
    });
    setRenamingFolderId(null);

    if (fallbackRef.current) return;
    try {
      const headers = await authHeaders();
      await axios.patch(`${API_URL}/notes/folders/${id}`, { name }, { headers });
    } catch (err) {
      console.error('Rename folder error:', err);
    }
  }, [activeWorkspaceId, notes]);

  const setFolderIcon = useCallback(async (id, icon) => {
    setFolders((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, icon } : f));
      if (fallbackRef.current) writeLS(activeWorkspaceId, next, notes);
      return next;
    });

    if (fallbackRef.current) return;
    try {
      const headers = await authHeaders();
      await axios.patch(`${API_URL}/notes/folders/${id}`, { icon }, { headers });
    } catch (err) {
      console.error('Set folder icon error:', err);
    }
  }, [activeWorkspaceId, notes]);

  const deleteFolder = useCallback(async (id) => {
    setFolders((prev) => {
      const allIds = new Set();
      const collect = (parentId) => {
        prev.forEach((f) => {
          if (f.parentId === parentId) { allIds.add(f.id); collect(f.id); }
        });
      };
      allIds.add(id);
      collect(id);
      setNotes((pn) => {
        const next = pn.filter((n) => !allIds.has(n.folderId));
        if (fallbackRef.current) writeLS(activeWorkspaceId, prev.filter((f) => !allIds.has(f.id)), next);
        return next;
      });
      return prev.filter((f) => !allIds.has(f.id));
    });
    setSelectedFolderId((prev) => (prev === id ? null : prev));

    if (fallbackRef.current) return;
    try {
      const headers = await authHeaders();
      await axios.delete(`${API_URL}/notes/folders/${id}`, { headers });
    } catch (err) {
      console.error('Delete folder error:', err);
      fetchAll();
    }
  }, [fetchAll, activeWorkspaceId]);

  const moveFolder = useCallback(async (folderId, newParentId) => {
    setFolders((prev) => {
      const descendants = new Set();
      const collect = (pid) => {
        prev.forEach((f) => {
          if (f.parentId === pid) { descendants.add(f.id); collect(f.id); }
        });
      };
      descendants.add(folderId);
      collect(folderId);
      if (descendants.has(newParentId)) return prev;

      const next = prev.map((f) => (f.id === folderId ? { ...f, parentId: newParentId } : f));
      if (fallbackRef.current) writeLS(activeWorkspaceId, next, notes);
      return next;
    });

    if (fallbackRef.current) return;
    try {
      const headers = await authHeaders();
      await axios.patch(`${API_URL}/notes/folders/${folderId}`, {
        parent_id: newParentId,
      }, { headers });
    } catch (err) {
      console.error('Move folder error:', err);
      fetchAll();
    }
  }, [fetchAll, activeWorkspaceId, notes]);

  // ── note CRUD ───────────────────────────────────────────────

  const createNote = useCallback(async (folderId) => {
    // localStorage fallback
    if (fallbackRef.current) {
      const now = Date.now();
      const note = {
        id: `n_${now}_${Math.random().toString(36).slice(2, 7)}`,
        folderId,
        title: 'Sem título',
        content: '',
        order: now,
        createdAt: now,
        updatedAt: now,
      };
      setNotes((prev) => {
        const next = [...prev, note];
        writeLS(activeWorkspaceId, folders, next);
        return next;
      });
      setActiveNoteId(note.id);
      return note;
    }

    try {
      const headers = await authHeaders();
      const res = await axios.post(`${API_URL}/notes/`, {
        folder_id: folderId,
        title: 'Sem título',
        content_md: '',
        order_index: notes.filter((n) => n.folderId === folderId).length,
      }, { headers });
      const note = normalizeNote(res.data);
      setNotes((prev) => [...prev, note]);
      setActiveNoteId(note.id);
      return note;
    } catch (err) {
      console.error('Create note error:', err);
      return null;
    }
  }, [activeWorkspaceId, folders]);

  const updateNote = useCallback(async (id, updates) => {
    setNotes((prev) => {
      const next = prev.map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
      );
      if (fallbackRef.current) writeLS(activeWorkspaceId, folders, next);
      return next;
    });

    if (fallbackRef.current) return;
    try {
      const headers = await authHeaders();
      const payload = {};
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.content !== undefined) payload.content_md = updates.content;
      if (updates.folderId !== undefined) payload.folder_id = updates.folderId;
      if (updates.order !== undefined) payload.order_index = updates.order;
      if (Object.keys(payload).length > 0) {
        await axios.patch(`${API_URL}/notes/${id}`, payload, { headers });
      }
    } catch (err) {
      console.error('Update note error:', err);
    }
  }, [activeWorkspaceId, folders]);

  const deleteNote = useCallback(async (id) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (fallbackRef.current) writeLS(activeWorkspaceId, folders, next);
      return next;
    });
    setActiveNoteId((prev) => (prev === id ? null : prev));

    if (fallbackRef.current) return;
    try {
      const headers = await authHeaders();
      await axios.delete(`${API_URL}/notes/${id}`, { headers });
    } catch (err) {
      console.error('Delete note error:', err);
      fetchAll();
    }
  }, [fetchAll, activeWorkspaceId, folders]);

  const moveNote = useCallback(async (noteId, newFolderId) => {
    setNotes((prev) => {
      const next = prev.map((n) =>
        n.id === noteId ? { ...n, folderId: newFolderId, updatedAt: Date.now() } : n
      );
      if (fallbackRef.current) writeLS(activeWorkspaceId, folders, next);
      return next;
    });

    if (fallbackRef.current) return;
    try {
      const headers = await authHeaders();
      await axios.patch(`${API_URL}/notes/${noteId}`, {
        folder_id: newFolderId,
      }, { headers });
    } catch (err) {
      console.error('Move note error:', err);
      fetchAll();
    }
  }, [fetchAll, activeWorkspaceId, folders]);

  const reorderNote = useCallback(async (draggedNoteId, targetNoteId) => {
    setNotes((prev) => {
      const draggedNote = prev.find((n) => n.id === draggedNoteId);
      if (!draggedNote) return prev;

      const folderNotes = prev
        .filter((n) => n.folderId === draggedNote.folderId)
        .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));

      const draggedOrigIndex = folderNotes.findIndex((n) => n.id === draggedNoteId);
      const targetOrigIndex = folderNotes.findIndex((n) => n.id === targetNoteId);
      if (draggedOrigIndex === -1 || targetOrigIndex === -1) return prev;

      const withoutDragged = folderNotes.filter((n) => n.id !== draggedNoteId);
      const targetIndex = withoutDragged.findIndex((n) => n.id === targetNoteId);
      const insertIndex = draggedOrigIndex < targetOrigIndex ? targetIndex + 1 : targetIndex;
      withoutDragged.splice(insertIndex, 0, draggedNote);

      const orderMap = {};
      withoutDragged.forEach((n, i) => { orderMap[n.id] = i; });

      // Fire-and-forget PATCH calls for reordered notes (API mode only)
      if (!fallbackRef.current) {
        (async () => {
          try {
            const headers = await authHeaders();
            await Promise.all(
              Object.entries(orderMap).map(([nid, order]) =>
                axios.patch(`${API_URL}/notes/${nid}`, { order_index: order }, { headers })
              )
            );
          } catch (err) {
            console.error('Reorder note error:', err);
          }
        })();
      }

      const next = prev.map((n) =>
        orderMap[n.id] !== undefined ? { ...n, order: orderMap[n.id] } : n
      );
      if (fallbackRef.current) writeLS(activeWorkspaceId, folders, next);
      return next;
    });
  }, [activeWorkspaceId, folders]);

  // ── fetch note content on demand ────────────────────────────

  const selectNote = useCallback(async (noteId) => {
    setActiveNoteId(noteId);
    if (!noteId || fallbackRef.current) return;

    const existing = notes.find((n) => n.id === noteId);
    if (existing && existing.content !== undefined) return;

    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await axios.get(`${API_URL}/notes/${noteId}`, { headers });
      const content = res.data.content_md ?? '';
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, content } : n)));
    } catch (err) {
      console.error('Fetch note content error:', err);
    }
  }, [notes]);

  // ── derived / helpers ───────────────────────────────────────

  const activeNote = notes.find((n) => n.id === activeNoteId) || null;

  const getChildFolders = useCallback((parentId) => {
    return folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  }, [folders]);

  const getFolderNotes = useCallback((folderId) => {
    return notes
      .filter((n) => n.folderId === folderId)
      .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  }, [notes]);

  const searchNotes = useCallback((term) => {
    if (!term.trim()) return [];
    const lower = term.toLowerCase();
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(lower) ||
        (n.content || '').toLowerCase().includes(lower)
    );
  }, [notes]);

  const findNoteByTitle = useCallback((title) => {
    const lower = title.toLowerCase().trim();
    return notes.find((n) => n.title.toLowerCase().trim() === lower) || null;
  }, [notes]);

  // ── memoised context value ─────────────────────────────────

  const value = useMemo(() => ({
    folders,
    notes,
    loading,
    activeNote,
    activeNoteId,
    setActiveNoteId,
    selectNote,
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
  }), [
    folders, notes, loading, activeNote, activeNoteId, selectNote, selectedFolderId,
    renamingFolderId, searchTerm,
    createFolder, renameFolder, setFolderIcon, deleteFolder, moveFolder,
    createNote, updateNote, deleteNote, moveNote, reorderNote,
    getChildFolders, getFolderNotes, searchNotes, findNoteByTitle,
  ]);

  return (
    <NotesContext.Provider value={value}>
      {children}
    </NotesContext.Provider>
  );
};

export const useNotes = () => {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within NotesProvider');
  return ctx;
};
