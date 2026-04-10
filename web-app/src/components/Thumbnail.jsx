import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Resolves a thumbnail URL: if absolute, use as-is; if relative, prefix with API_URL.
 */
export function resolveThumbnailUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

/** Inline SVG — replaces lucide-react FileVideo to avoid bundling the entire icon library (~326KB). */
function FileVideoIcon({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m10 11 5 3-5 3v-6Z" />
    </svg>
  );
}

/**
 * Thumbnail image with built-in error fallback.
 * Shows a placeholder icon when the image fails to load.
 */
export default function Thumbnail({ url, alt = '', className = '', iconSize = 24 }) {
  const [failed, setFailed] = useState(false);
  const src = resolveThumbnailUrl(url);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-surface-flat ${className}`}>
        <FileVideoIcon size={iconSize} className="text-gray-600" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
