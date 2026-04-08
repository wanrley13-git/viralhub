import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Calendar,
  Trash2,
  Plus,
  Pencil,
  MoreHorizontal,
  Check,
  X
} from 'lucide-react';
import { clsx } from 'clsx';
import ImageLightbox from './ImageLightbox';
import { resolveThumbnailUrl } from './Thumbnail';

const API_URL = import.meta.env.VITE_API_URL;

const PALETTE = [
  "none",
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#06b6d4",
];

const hexToRgba = (hex, alpha) => {
  if (!hex || hex === 'none' || hex[0] !== '#') return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const KanbanBoard = ({
  tasks, columns, onTaskUpdate, onTaskDelete,
  onCreateTask, onEditTask, onPreviewTask,
  onAddColumn, onRenameColumn, onDeleteColumn
}) => {
  const [renamingCol, setRenamingCol] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [colMenuOpen, setColMenuOpen] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const tasksByStatus = {};
  columns.forEach(col => {
    tasksByStatus[col.id] = tasks.filter(t => t.status === col.id);
  });

  const onDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    onTaskUpdate(parseInt(draggableId), { status: destination.droppableId });
  };

  return (
    <div className="flex gap-5 h-full p-6 overflow-x-auto custom-scrollbar bg-background items-start">
      <DragDropContext onDragEnd={onDragEnd}>
        {columns.map((column) => (
          <div key={column.id} className="w-[310px] flex flex-col h-full shrink-0">
            {/* Column Header */}
            <div className="flex items-center justify-between mb-4 p-3.5 bg-surface rounded-2xl border border-border-subtle relative">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={clsx("w-2 h-2 rounded-full shrink-0", column.accent)} />

                {renamingCol === column.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && renameValue.trim()) { onRenameColumn(column.id, renameValue.trim()); setRenamingCol(null); }
                        if (e.key === 'Escape') setRenamingCol(null);
                      }}
                      className="flex-1 bg-surface-flat border border-border-subtle rounded-lg px-2 py-1 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-0"
                    />
                    <button onClick={() => { if (renameValue.trim()) { onRenameColumn(column.id, renameValue.trim()); } setRenamingCol(null); }} className="p-1 text-green-400 hover:bg-green-400/10 rounded-lg"><Check size={12} /></button>
                    <button onClick={() => setRenamingCol(null)} className="p-1 text-gray-500 hover:bg-white/5 rounded-lg"><X size={12} /></button>
                  </div>
                ) : (
                  <>
                    <h3 className="font-extrabold text-white text-[13px] tracking-tight truncate">{column.title}</h3>
                    <span className="font-mono text-[10px] text-gray-600 bg-white/[0.04] px-2 py-0.5 rounded-lg shrink-0">
                      {(tasksByStatus[column.id] || []).length}
                    </span>
                  </>
                )}
              </div>

              {renamingCol !== column.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onCreateTask(column.id)}
                    className="text-gray-600 hover:text-primary transition-colors p-1 rounded-lg hover:bg-primary/10"
                    title="Criar card"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => setColMenuOpen(colMenuOpen === column.id ? null : column.id)}
                    className="text-gray-600 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
                  >
                    <MoreHorizontal size={14} strokeWidth={1.5} />
                  </button>
                </div>
              )}

              {/* Column Menu */}
              {colMenuOpen === column.id && (
                <div className="absolute right-0 top-full mt-1 z-50 glass-raised rounded-xl py-1.5 min-w-[150px] animate-fade-in shadow-modal">
                  <button
                    onClick={() => { setRenamingCol(column.id); setRenameValue(column.title); setColMenuOpen(null); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                  >
                    <Pencil size={13} strokeWidth={2} /> Renomear
                  </button>
                  {columns.length > 1 && (
                    <button
                      onClick={() => { onDeleteColumn(column.id); setColMenuOpen(null); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-400/[0.08] transition-colors"
                    >
                      <Trash2 size={13} strokeWidth={2} /> Excluir coluna
                    </button>
                  )}
                </div>
              )}
            </div>

            <Droppable droppableId={column.id}>
              {(provided, snapshot) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={clsx(
                    "flex-1 flex flex-col gap-3 transition-all duration-200 p-1 rounded-2xl",
                    snapshot.isDraggingOver ? 'bg-primary/[0.03] border border-dashed border-primary/20' : 'border border-transparent',
                    (tasksByStatus[column.id] || []).length === 0 && 'min-h-[80px]'
                  )}
                >
                  {(tasksByStatus[column.id] || []).map((task, index) => {
                    const cardColor = task.card_color && task.card_color !== 'none' && task.card_color !== '#111114' ? task.card_color : null;
                    const gradientStyle = cardColor
                      ? { background: `linear-gradient(to bottom, ${hexToRgba(cardColor, 0.18)} 0%, ${hexToRgba(cardColor, 0.06)} 50%, transparent 100%)` }
                      : {};

                    return (
                      <Draggable key={task.id} draggableId={task.id.toString()} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              ...gradientStyle,
                            }}
                            className={clsx(
                              "p-5 rounded-2xl border flex flex-col gap-3 transition-shadow relative group cursor-grab active:cursor-grabbing bg-surface",
                              dragSnapshot.isDragging
                                ? 'shadow-glow-md rotate-1 z-50 border-primary/30'
                                : 'border-border-subtle hover:border-border-hover shadow-card hover:shadow-card-hover'
                            )}
                            onClick={() => onPreviewTask(task)}
                          >
                            {/* Accent line at top */}
                            {cardColor && (
                              <div
                                className="absolute top-0 left-4 right-4 h-[2px] rounded-full"
                                style={{ backgroundColor: hexToRgba(cardColor, 0.5) }}
                              />
                            )}

                            {/* Title */}
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex-1">
                                <h4 className="text-[14px] font-extrabold leading-snug mb-1 mr-4 tracking-tight text-white">
                                  {task.title}
                                </h4>
                              </div>

                              <div className="flex gap-1.5 absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => { e.stopPropagation(); onEditTask(task); }}
                                  className="transition-colors p-1.5 rounded-lg text-white/20 hover:text-blue-400 hover:bg-white/10"
                                  title="Editar"
                                >
                                  <Pencil size={12} strokeWidth={2.5} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onTaskDelete(task.id); }}
                                  className="transition-colors p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-white/10"
                                  title="Excluir"
                                >
                                  <Trash2 size={12} strokeWidth={2.5} />
                                </button>
                              </div>
                            </div>

                            {/* Thumbnail */}
                            {task.thumbnail_url && (
                              <div
                                className="w-full aspect-video rounded-xl overflow-hidden border border-border-subtle bg-background cursor-zoom-in"
                                onClick={(e) => { e.stopPropagation(); setLightboxSrc(resolveThumbnailUrl(task.thumbnail_url)); }}
                              >
                                <img
                                  src={resolveThumbnailUrl(task.thumbnail_url)}
                                  alt="Preview"
                                  loading="lazy"
                                  decoding="async"
                                  className="w-full h-full object-cover opacity-75 group-hover:opacity-100 transition-opacity duration-500"
                                />
                              </div>
                            )}

                            {/* Content preview */}
                            {task.content_md && (() => {
                              const cleaned = task.content_md.replace(/<img[^>]*\/?>/gi, '').replace(/!\[.*?\]\(.*?\)/g, '').trim();
                              if (!cleaned) return null;
                              return (
                                <p className="text-sm line-clamp-2 leading-relaxed text-white/40">
                                  {cleaned.substring(0, 80)}{cleaned.length > 80 ? '...' : ''}
                                </p>
                              );
                            })()}

                            {/* Tag */}
                            <div className="flex flex-wrap gap-2 mb-1">
                              <div
                                className="px-2.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border font-mono bg-white/[0.04] border-white/8 text-white/60"
                                style={cardColor ? { borderColor: hexToRgba(cardColor, 0.15), color: hexToRgba(cardColor, 0.8), backgroundColor: hexToRgba(cardColor, 0.08) } : {}}
                              >
                                {task.tag}
                              </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between mt-1 pt-3.5 border-t border-white/[0.05]">
                              <div className="flex items-center gap-1.5 font-mono text-[10px] text-white/30">
                                <Calendar size={10} strokeWidth={1.5} />
                                {new Date(task.created_at).toLocaleDateString()}
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Color palette */}
                                <div className="flex gap-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {PALETTE.map(color => (
                                    <button
                                      key={color}
                                      onClick={(e) => { e.stopPropagation(); onTaskUpdate(task.id, { card_color: color }); }}
                                      className={clsx(
                                        "w-3.5 h-3.5 rounded-full border-2 hover:scale-150 transition-transform duration-200",
                                        (task.card_color || 'none') === color ? 'border-primary scale-125' : 'border-white/10'
                                      )}
                                      style={{ backgroundColor: color === 'none' ? '#111114' : color }}
                                    />
                                  ))}
                                </div>

                                {/* Avatar */}
                                <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold font-mono bg-white/[0.06] border-white/10 text-white">
                                  W
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </DragDropContext>

      {/* Add Column Button */}
      <div className="shrink-0 pt-0">
        <button
          onClick={onAddColumn}
          className="w-[310px] p-3.5 bg-surface/50 hover:bg-surface rounded-2xl border border-dashed border-border-subtle hover:border-border-hover transition-all flex items-center justify-center gap-2.5 text-gray-500 hover:text-white text-sm font-semibold"
        >
          <Plus size={15} strokeWidth={2.5} /> Nova Coluna
        </button>
      </div>

      {/* Image Lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
};

export default KanbanBoard;
