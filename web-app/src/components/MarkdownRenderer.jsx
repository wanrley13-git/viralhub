import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

/**
 * Unified Markdown renderer used across the app:
 * - Notas (preview mode)
 * - Cards do Kanban (expanded view)
 * - Chatbot responses
 * - Analysis/Transcription reports
 * - Content Generator (developed content modal)
 *
 * Supports: GFM (tables, strikethrough, task lists), raw HTML,
 * auto-linked URLs, and checkbox rendering.
 *
 * Props:
 *   - children: markdown source string
 *   - className: extra CSS classes
 *   - chat: tighter spacing variant
 *   - onTaskToggle(index, checked): if provided, checkboxes become
 *     interactive (clickable) and fire the callback with the
 *     zero-based index of the task list item within the source.
 *     When omitted, checkboxes render disabled (read-only).
 */
export default function MarkdownRenderer({ children, className = '', chat = false, onTaskToggle }) {
  // Fresh counter per render so the nth checkbox in reading order gets
  // the nth index — matches toggleTaskInSource() which also walks the
  // source text in order.
  const taskCounter = useRef({ n: 0 });
  taskCounter.current.n = 0;

  const interactive = typeof onTaskToggle === 'function';

  return (
    <div className={`markdown-body ${chat ? 'chat-markdown' : ''} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Make links open in new tab
          a: ({ node, children, href, ...props }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
          // Style + optionally enable checkboxes from task lists
          input: ({ node, ...props }) => {
            if (props.type === 'checkbox') {
              if (interactive) {
                const idx = taskCounter.current.n++;
                return (
                  <input
                    type="checkbox"
                    defaultChecked={!!props.checked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onTaskToggle(idx, e.target.checked)}
                    className="mr-2 accent-primary w-4 h-4 rounded align-middle cursor-pointer"
                  />
                );
              }
              return (
                <input
                  {...props}
                  disabled
                  className="mr-2 accent-primary w-4 h-4 rounded align-middle"
                />
              );
            }
            return <input {...props} />;
          },
          // Auto-linkify plain URLs in text
          p: ({ node, children, ...props }) => {
            const processed = processChildren(children);
            return <p {...props}>{processed}</p>;
          },
          li: ({ node, children, ...props }) => {
            const processed = processChildren(children);
            return <li {...props}>{processed}</li>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

// Auto-detect URLs in text nodes and wrap them in <a> tags
function processChildren(children) {
  if (!Array.isArray(children)) children = [children];
  return children.map((child, i) => {
    if (typeof child !== 'string') return child;
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    const parts = child.split(urlRegex);
    if (parts.length === 1) return child;
    return parts.map((part, j) =>
      urlRegex.test(part) ? (
        <a key={`${i}-${j}`} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
      ) : part
    );
  });
}

/**
 * Flip the checked state of the Nth task-list marker inside a markdown
 * source string. The index matches the reading order used by
 * MarkdownRenderer when it numbers each rendered checkbox.
 *
 * Matches both unordered (- / *) and numbered (1.) markers and is
 * tolerant of leading whitespace so nested task lists work.
 */
export function toggleTaskInSource(md, targetIndex) {
  if (!md) return md;
  let i = 0;
  return md.replace(/^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])/gm, (m, pre, state, post) => {
    if (i++ !== targetIndex) return m;
    const next = state.trim() === '' ? 'x' : ' ';
    return pre + next + post;
  });
}
