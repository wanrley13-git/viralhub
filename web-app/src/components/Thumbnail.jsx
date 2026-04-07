import { useState } from 'react';
import { FileVideo } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Resolves a thumbnail URL: if absolute, use as-is; if relative, prefix with API_URL.
 */
export function resolveThumbnailUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
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
        <FileVideo size={iconSize} strokeWidth={1.2} className="text-gray-600" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
