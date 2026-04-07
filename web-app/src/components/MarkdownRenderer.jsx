import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

/**
 * Unified Markdown renderer used across the app:
 * - Notas (preview mode)
 * - Cards do Kanban (expanded view)
 * - Chatbot responses
 * - Analysis/Transcription reports
 *
 * Supports: GFM (tables, strikethrough, task lists), raw HTML,
 * auto-linked URLs, and checkbox rendering.
 */
export default function MarkdownRenderer({ children, className = '', chat = false }) {
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
          // Style checkboxes from task lists
          input: ({ node, ...props }) => {
            if (props.type === 'checkbox') {
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
