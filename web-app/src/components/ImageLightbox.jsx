import { useEffect, useState, useRef, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

const ImageLightbox = ({ src, alt = '', onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imgRef = useRef(null);

  const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom(z => clampZoom(z + ZOOM_STEP));
      if (e.key === '-') setZoom(z => clampZoom(z - ZOOM_STEP));
      if (e.key === '0') { setZoom(1); setOffset({ x: 0, y: 0 }); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom(z => clampZoom(z + delta));
  }, []);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = (e) => {
    if (zoom <= 1) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!dragging.current) return;
    setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };

  const handleMouseUp = () => { dragging.current = false; };

  const handleDoubleClick = () => {
    if (zoom !== 1) { setZoom(1); setOffset({ x: 0, y: 0 }); }
    else setZoom(2);
  };

  const reset = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center animate-fade-in select-none"
      style={{ backgroundColor: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-white/70 hover:text-white z-10"
      >
        <X size={20} />
      </button>

      {/* Zoom controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-2xl px-3 py-2 z-10">
        <button
          onClick={() => setZoom(z => clampZoom(z - ZOOM_STEP))}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          disabled={zoom <= MIN_ZOOM}
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-white/50 text-xs font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(z => clampZoom(z + ZOOM_STEP))}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          disabled={zoom >= MAX_ZOOM}
        >
          <ZoomIn size={16} />
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button
          onClick={reset}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Image */}
      <div
        ref={imgRef}
        className="overflow-hidden"
        style={{
          cursor: zoom > 1 ? (dragging.current ? 'grabbing' : 'grab') : 'zoom-in',
          maxWidth: '90vw',
          maxHeight: '90vh',
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
            transition: dragging.current ? 'none' : 'transform 0.15s ease',
            maxWidth: '90vw',
            maxHeight: '90vh',
            display: 'block',
          }}
          className="object-contain rounded-2xl shadow-2xl"
        />
      </div>
    </div>
  );
};

export default ImageLightbox;
