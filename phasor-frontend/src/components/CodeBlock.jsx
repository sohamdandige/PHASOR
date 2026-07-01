import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

export default function CodeBlock({ language, code, onOpenInspector }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div
      className="rounded-lg overflow-hidden my-3"
      style={{ border: '1px solid #27272A', background: '#09090B' }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-1.5"
        style={{ background: '#0d0d0f', borderBottom: '1px solid #27272A' }}
      >
        <span
          className="text-xs font-mono"
          style={{ color: '#7C3AED', textTransform: 'lowercase' }}
        >
          {language || 'code'}
        </span>
        <div className="flex items-center gap-2">
          {onOpenInspector && (
            <button
              onClick={() => onOpenInspector({ language, code })}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
              style={{ color: '#A1A1AA', background: '#18181B', border: '1px solid #27272A' }}
              onMouseEnter={e => e.currentTarget.style.color = '#F4F4F5'}
              onMouseLeave={e => e.currentTarget.style.color = '#A1A1AA'}
            >
              <ExternalLink size={11} />
              Inspector
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
            style={{
              color: copied ? '#4ade80' : '#A1A1AA',
              background: '#18181B',
              border: '1px solid #27272A',
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Code content */}
      <pre
        className="px-4 py-4 text-xs overflow-x-auto font-mono leading-5"
        style={{ color: '#d4d4d8', tabSize: 2 }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Parses markdown text and renders code blocks with the CodeBlock component
// and normal text as-is. Returns an array of React nodes.
export function renderMarkdownWithCodeBlocks(text, onOpenInspector) {
  if (!text) return null;

  const parts = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Text before the code block
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      parts.push(
        <span key={`text-${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>
          {before}
        </span>
      );
    }

    const lang = match[1] || 'code';
    const code = match[2].trimEnd();
    parts.push(
      <CodeBlock
        key={`code-${match.index}`}
        language={lang}
        code={code}
        onOpenInspector={onOpenInspector}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last code block
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>
        {text.slice(lastIndex)}
      </span>
    );
  }

  return parts.length > 0 ? parts : <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
}
