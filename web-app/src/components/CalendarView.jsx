import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Trash2 } from 'lucide-react';
import axios from 'axios';
import { getAccessToken } from '../supabaseClient';
import { useWorkspace } from '../contexts/WorkspaceContext';
import useRealtimeSync from '../hooks/useRealtimeSync';

const API_URL = import.meta.env.VITE_API_URL;

const WEEKDAYS_SHORT = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7);
const NOTE_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#ec4899','#06b6d4'];

const hexToRgba = (hex, a) => {
  if (!hex || hex[0] !== '#') return 'transparent';
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

function pad(n) { return String(n).padStart(2,'0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function getMonday(d) { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate()-(day===0?6:day-1)); return r; }
function getSunday(d) { return addDays(getMonday(d),6); }
const GRID_START_HOUR = 7;
function timeToPixels(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h - GRID_START_HOUR) * 60 + m; // 1 minute = 1 pixel, grid starts at 7am
}
function durationPixels(start, end) {
  return Math.max(timeToPixels(end) - timeToPixels(start), 30);
}


// ── MONTH VIEW ──
function MonthView({ date, items, onDayClick }) {
  const year = date.getFullYear(), month = date.getMonth();
  const daysInMonth = new Date(year,month+1,0).getDate();
  const firstDay = new Date(year,month,1).getDay();
  const todayStr = fmtDate(new Date());

  const itemsByDate = useMemo(() => {
    const map = {};
    items.forEach(it => { if (!it.scheduled_date) return; (map[it.scheduled_date] ??= []).push(it); });
    return map;
  }, [items]);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="grid grid-cols-7">
        {WEEKDAYS_SHORT.map(d => (
          <div key={d} className="text-center text-[11px] font-bold uppercase tracking-widest text-gray-600 py-3 border-b border-white/[0.04]">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="border-b border-r border-white/[0.04] bg-background" />;
          const ds = `${year}-${pad(month+1)}-${pad(day)}`;
          const dayItems = itemsByDate[ds] || [];
          const isToday = ds === todayStr;
          return (
            <div key={day} onClick={() => onDayClick(new Date(year,month,day))}
              className="border-b border-r border-white/[0.04] p-2 flex flex-col cursor-pointer hover:bg-white/[0.015] transition-colors min-h-0">
              <span className={`text-[13px] font-semibold mb-1.5 w-7 h-7 flex items-center justify-center rounded-full self-center ${
                isToday ? 'bg-blue-500 text-white' : 'text-gray-400'}`}>{day}</span>
              <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                {dayItems.slice(0,3).map(it => (
                  <div key={`${it.type}-${it.id}`} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[13px] truncate">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: it.color || it.card_color || '#3b82f6' }} />
                    <span className="truncate text-gray-300 font-medium">
                      {it.start_time || it.scheduled_time ? `${(it.start_time || it.scheduled_time).slice(0,5)} ` : ''}
                      {it.title}
                    </span>
                  </div>
                ))}
                {dayItems.length > 3 && <span className="text-[11px] text-gray-600 font-mono pl-1">+{dayItems.length-3} mais</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── TIME GRID (Day + Week) with drag-and-drop ──
function TimeGrid({ days, items, onSlotClick, onItemClick, onItemDrop }) {
  const scrollRef = useRef(null);
  const todayStr = fmtDate(new Date());

  // Drag state
  const [dragging, setDragging] = useState(null);
  const gridRef = useRef(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 2*60; }, []);

  const itemsByDate = useMemo(() => {
    const map = {};
    items.forEach(it => {
      if (!it.scheduled_date) return;
      const time = it.start_time || it.scheduled_time;
      if (!time) return;
      (map[it.scheduled_date] ??= []).push(it);
    });
    return map;
  }, [items]);

  // Drag handlers
  const handleDragStart = useCallback((e, item) => {
    setDragging(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // required for firefox
  }, []);

  const handleDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const handleDrop = useCallback((e, targetDate, targetHour) => {
    e.preventDefault();
    if (!dragging) return;
    const newTime = `${pad(targetHour)}:00`;
    onItemDrop(dragging, targetDate, newTime);
    setDragging(null);
  }, [dragging, onItemDrop]);

  const handleDragEnd = useCallback(() => setDragging(null), []);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
      {/* Day headers */}
      <div className="flex sticky top-0 z-20 bg-background border-b border-white/[0.04]">
        <div className="w-16 shrink-0" />
        {days.map(d => {
          const ds = fmtDate(d);
          const isToday = ds === todayStr;
          return (
            <div key={ds} className="flex-1 text-center py-3 border-l border-white/[0.04]">
              <div className="text-[11px] font-bold uppercase tracking-widest text-gray-600">{WEEKDAYS_SHORT[d.getDay()]}</div>
              <div className={`text-xl font-bold mt-0.5 w-10 h-10 flex items-center justify-center rounded-full mx-auto ${
                isToday ? 'bg-blue-500 text-white' : 'text-gray-300'}`}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Time rows */}
      <div ref={gridRef} className="flex relative">
        <div className="w-16 shrink-0">
          {HOURS.map(h => (
            <div key={h} className="h-[60px] flex items-start justify-end pr-3 -mt-2">
              <span className="text-[11px] font-mono text-gray-600">{h > 12 ? `${h-12} PM` : h === 12 ? '12 PM' : `${h} AM`}</span>
            </div>
          ))}
        </div>

        {days.map(d => {
          const ds = fmtDate(d);
          const isToday = ds === todayStr;
          const dayItems = itemsByDate[ds] || [];

          return (
            <div key={ds} className="flex-1 relative border-l border-white/[0.04]">
              {HOURS.map(h => (
                <div key={h}
                  className={`h-[60px] border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.01] ${dragging ? 'hover:bg-blue-500/[0.06]' : ''}`}
                  onClick={() => !dragging && onSlotClick(ds, `${pad(h)}:00`)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, ds, h)}
                />
              ))}

              {/* Events */}
              {dayItems.map(it => {
                const startTime = it.start_time || it.scheduled_time || '09:00';
                const endTime = it.end_time || (() => { const [h,m] = startTime.split(':').map(Number); return `${pad(h+1)}:${pad(m)}`; })();
                const top = timeToPixels(startTime);
                const height = durationPixels(startTime, endTime);
                const color = it.color || it.card_color || '#3b82f6';

                return (
                  <div key={`${it.type}-${it.id}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, it)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => { e.stopPropagation(); onItemClick(it); }}
                    className="absolute left-1 right-1 rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing overflow-hidden hover:brightness-110 transition-all z-10"
                    style={{ top, height, backgroundColor: hexToRgba(color,0.25), borderLeft: `3px solid ${color}` }}>
                    <div className="text-[15px] font-bold text-white truncate leading-tight">{it.title}</div>
                    <div className="text-[13px] text-white/60 font-mono mt-0.5">{startTime} – {endTime}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── NOTE EDITOR MODAL ──
function NoteEditor({ note, initialDate, initialTime, projectId, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(note?.title || '');
  const [description, setDescription] = useState(note?.description || '');
  const [date, setDate] = useState(note?.scheduled_date || initialDate || '');
  const [startTime, setStartTime] = useState(note?.start_time || initialTime || '09:00');
  const [endTime, setEndTime] = useState(note?.end_time || (() => {
    const t = note?.start_time || initialTime || '09:00';
    const [h,m] = t.split(':').map(Number);
    return `${pad(h+1)}:${pad(m)}`;
  })());
  const [color, setColor] = useState(note?.color || '#3b82f6');

  const handleSave = async () => {
    if (!title.trim() || !date) return;
    await onSave({ title: title.trim(), description, scheduled_date: date, start_time: startTime, end_time: endTime, color, project_id: projectId }, note?.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="glass-raised w-full max-w-md rounded-3xl p-7 space-y-5 shadow-modal" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-extrabold text-white">{note ? 'Editar Nota' : 'Nova Nota'}</h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl"><X size={16} /></button>
        </div>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Título"
          className="w-full bg-surface-flat border border-border-subtle rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)" rows={3}
          className="w-full bg-surface-flat border border-border-subtle rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none" />
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-surface-flat border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-blue-500/50" /></div>
          <div><label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Início</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full bg-surface-flat border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-blue-500/50" /></div>
          <div><label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Fim</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full bg-surface-flat border border-border-subtle rounded-xl px-3 py-2.5 text-sm text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-blue-500/50" /></div>
        </div>
        <div><label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Cor</label>
          <div className="flex gap-2">
            {NOTE_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? 'border-white scale-125' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          {note && onDelete && (
            <button onClick={() => { onDelete(note.id); onClose(); }}
              className="px-4 py-2.5 text-red-400 hover:bg-red-400/10 rounded-xl text-sm font-bold transition-colors flex items-center gap-2">
              <Trash2 size={14} /> Excluir</button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-5 py-2.5 text-gray-400 hover:text-white rounded-xl text-sm font-medium transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!title.trim() || !date}
            className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors">Salvar</button>
        </div>
      </div>
    </div>
  );
}


// ── MAIN ──
export default function CalendarView({ tasks, projectId, onEditTask }) {
  const { activeWorkspaceId, activeWorkspace, currentUserId } = useWorkspace();
  const [view, setView] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [notes, setNotes] = useState([]);
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [noteInitialDate, setNoteInitialDate] = useState('');
  const [noteInitialTime, setNoteInitialTime] = useState('');

  const fetchNotes = async () => {
    try {
      const token = await getAccessToken();
      const url = projectId ? `${API_URL}/calendar/notes?project_id=${projectId}` : `${API_URL}/calendar/notes`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setNotes(res.data);
    } catch (err) { console.error('Erro ao buscar notas:', err); }
  };

  useEffect(() => {
    setNotes([]);
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeWorkspaceId]);

  // ── realtime sync (team workspaces) ──
  useRealtimeSync({
    table: 'calendar_notes',
    workspaceId: activeWorkspaceId,
    currentUserId,
    isPersonal: activeWorkspace?.is_personal ?? true,
    filter: (row) => (projectId ? row.project_id === projectId : true),
    onInsert: (row) => setNotes((prev) => [...prev, row]),
    onUpdate: (row) => setNotes((prev) => prev.map((n) => (n.id === row.id ? { ...n, ...row } : n))),
    onDelete: (row) => setNotes((prev) => prev.filter((n) => n.id !== row.id)),
  });

  const saveNote = async (data, noteId) => {
    const token = await getAccessToken();
    if (noteId) await axios.patch(`${API_URL}/calendar/notes/${noteId}`, data, { headers: { Authorization: `Bearer ${token}` } });
    else await axios.post(`${API_URL}/calendar/notes`, data, { headers: { Authorization: `Bearer ${token}` } });
    fetchNotes();
  };

  const deleteNote = async (noteId) => {
    const token = await getAccessToken();
    await axios.delete(`${API_URL}/calendar/notes/${noteId}`, { headers: { Authorization: `Bearer ${token}` } });
    fetchNotes();
  };

  const allItems = useMemo(() => {
    const taskItems = tasks.filter(t => t.scheduled_date).map(t => ({ ...t, type: 'task' }));
    const noteItems = notes.map(n => ({ ...n, type: 'note' }));
    return [...taskItems, ...noteItems];
  }, [tasks, notes]);

  const goToday = () => setCurrentDate(new Date());

  const nav = (dir) => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth()+dir);
    else if (view === 'week') d.setDate(d.getDate()+dir*7);
    else d.setDate(d.getDate()+dir);
    setCurrentDate(d);
  };

  const headerLabel = () => {
    if (view === 'month') return `${MONTH_NAMES[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;
    if (view === 'week') {
      const mon = getMonday(currentDate), sun = getSunday(currentDate);
      if (mon.getMonth() === sun.getMonth()) return `${mon.getDate()} – ${sun.getDate()} de ${MONTH_NAMES[mon.getMonth()]} de ${mon.getFullYear()}`;
      return `${mon.getDate()} ${MONTH_NAMES[mon.getMonth()].slice(0,3)} – ${sun.getDate()} ${MONTH_NAMES[sun.getMonth()].slice(0,3)} ${sun.getFullYear()}`;
    }
    return `${currentDate.getDate()} de ${MONTH_NAMES[currentDate.getMonth()]} de ${currentDate.getFullYear()}`;
  };

  const viewDays = view === 'week' ? Array.from({length:7},(_,i) => addDays(getMonday(currentDate),i)) : [currentDate];

  const handleSlotClick = (date, time) => { setEditingNote(null); setNoteInitialDate(date); setNoteInitialTime(time); setNoteEditorOpen(true); };
  const handleItemClick = (item) => { if (item.type === 'task') onEditTask(item); else { setEditingNote(item); setNoteEditorOpen(true); } };
  const handleDayClick = (d) => { setCurrentDate(d); setView('day'); };

  // Drag-and-drop: update item date/time
  const handleItemDrop = useCallback(async (item, newDate, newTime) => {
    const token = await getAccessToken();
    try {
      if (item.type === 'task') {
        await axios.patch(`${API_URL}/tasks/${item.id}`, { scheduled_date: newDate, scheduled_time: newTime }, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.patch(`${API_URL}/calendar/notes/${item.id}`, { scheduled_date: newDate, start_time: newTime, end_time: (() => {
          const [h,m] = newTime.split(':').map(Number);
          const dur = item.end_time && item.start_time ? timeToPixels(item.end_time) - timeToPixels(item.start_time) : 60;
          const endM = (h-7)*60+m+dur;
          return `${pad(Math.floor(endM/60)+7)}:${pad(endM%60)}`;
        })() }, { headers: { Authorization: `Bearer ${token}` } });
        fetchNotes();
      }
    } catch (err) { console.error('Erro ao mover:', err); }
  }, [fetchNotes]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-2 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={goToday} className="px-4 py-2 text-xs font-bold text-gray-300 bg-surface-flat border border-border-subtle rounded-xl hover:bg-white/[0.06] transition-colors">Hoje</button>
          <button onClick={() => nav(-1)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg"><ChevronLeft size={18} /></button>
          <button onClick={() => nav(1)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg"><ChevronRight size={18} /></button>
          <h3 className="text-xl font-bold text-white ml-2">{headerLabel()}</h3>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setEditingNote(null); setNoteInitialDate(fmtDate(currentDate)); setNoteInitialTime('09:00'); setNoteEditorOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/15 rounded-xl text-xs font-bold hover:bg-blue-500/15 transition-colors">
            <Plus size={14} /> Nova Nota</button>
          <div className="flex gap-0.5 p-0.5 bg-surface-flat rounded-xl border border-border-subtle">
            {[{id:'day',label:'Dia'},{id:'week',label:'Semana'},{id:'month',label:'Mês'}].map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${view === v.id ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {v.label}</button>
            ))}
          </div>
        </div>
      </div>

      {view === 'month' ? (
        <MonthView date={currentDate} items={allItems} onDayClick={handleDayClick} />
      ) : (
        <TimeGrid days={viewDays} items={allItems} onSlotClick={handleSlotClick} onItemClick={handleItemClick} onItemDrop={handleItemDrop} />
      )}

      {noteEditorOpen && (
        <NoteEditor note={editingNote} initialDate={noteInitialDate} initialTime={noteInitialTime}
          projectId={projectId ? parseInt(projectId) : null} onSave={saveNote} onDelete={deleteNote}
          onClose={() => { setNoteEditorOpen(false); setEditingNote(null); }} />
      )}
    </div>
  );
}
