import { useState, useRef, useCallback, useEffect } from 'react';
import { Paperclip, AtSign, Send, X, Code2, StopCircle } from 'lucide-react';
import { PLAN_META } from '../hooks/useApp';

function detectCode(text) {
  const codePatterns = [
    /^\s*(import|from|def |class |function |const |let |var |#include)/m,
    /[{}\[\]();]{3,}/,
    /=>/,
    /\|\||\&\&/,
    /^\s{4}|\t/m,
  ];
  return codePatterns.some(p => p.test(text));
}

function SnippetCard({ snippet, onRemove }) {
  const preview = snippet.content.split('\n').slice(0, 4).join('\n');
  const isCode = snippet.isCode;

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{ border: '1px solid #27272A', background: '#09090B', maxWidth: 280 }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5"
        style={{ borderBottom: '1px solid #1c1c1f', background: '#0d0d0f' }}
      >
        <Code2 size={11} style={{ color: '#7C3AED' }} />
        <span className="text-xs font-mono" style={{ color: '#7C3AED' }}>
          {isCode ? 'code' : 'text'}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded font-mono"
          style={{ background: '#7C3AED22', color: '#7C3AED', border: '1px solid #7C3AED44', marginLeft: 'auto' }}
        >
          PASTED
        </span>
        <button
          onClick={onRemove}
          className="p-0.5 rounded"
          style={{ color: '#52525b' }}
          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
          onMouseLeave={e => e.currentTarget.style.color = '#52525b'}
        >
          <X size={11} />
        </button>
      </div>
      <div className="px-3 py-2 snippet-fade">
        <pre
          className="text-xs font-mono leading-4 whitespace-pre overflow-hidden"
          style={{ color: '#71717a', maxHeight: 56 }}
        >
          {preview}
        </pre>
      </div>
    </div>
  );
}

function FileAttachment({ file, onRemove }) {
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
      style={{ background: '#18181B', border: '1px solid #27272A', color: '#A1A1AA' }}
    >
      <Paperclip size={11} />
      <span className="max-w-32 truncate">{file.name}</span>
      <button
        onClick={onRemove}
        style={{ color: '#52525b' }}
        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
        onMouseLeave={e => e.currentTarget.style.color = '#52525b'}
      >
        <X size={11} />
      </button>
    </div>
  );
}

export default function InputConsole({ onSend, isStreaming, onCancel, plan, serverConfig }) {
  const [text, setText] = useState('');
  const [snippets, setSnippets] = useState([]); // [{ id, content, isCode }]
  const [attachments, setAttachments] = useState([]); // [{ id, name, content }]
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const planMeta = PLAN_META[plan] || PLAN_META.free;
  const planConfig = serverConfig?.plans?.[plan];

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [text]);

  // Cmd+Enter to send
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        handleSend();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const handlePaste = useCallback((e) => {
    const pasted = e.clipboardData?.getData('text') || '';
    if (!pasted) return;

    const isLong = pasted.length > 400;
    const isCode = detectCode(pasted);

    if (isLong || isCode) {
      e.preventDefault();
      setSnippets(prev => [...prev, {
        id: Date.now(),
        content: pasted,
        isCode,
      }]);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments(prev => [...prev, {
          id: Date.now() + Math.random(),
          name: file.name,
          content: ev.target.result,
        }]);
      };
      reader.readAsText(file);
    });
  }, []);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments(prev => [...prev, {
          id: Date.now() + Math.random(),
          name: file.name,
          content: ev.target.result,
        }]);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  }, []);

  const handleSend = useCallback(() => {
    const query = text.trim();
    const allSnippetContent = snippets.map(s => s.content).join('\n\n');
    const fullQuery = allSnippetContent ? `${query}\n\n${allSnippetContent}`.trim() : query;

    if (!fullQuery && attachments.length === 0) return;
    if (isStreaming) return;

    onSend(fullQuery, attachments);
    setText('');
    setSnippets([]);
    setAttachments([]);
  }, [text, snippets, attachments, isStreaming, onSend]);

  const hasContent = text.trim() || snippets.length > 0 || attachments.length > 0;
  const stagingItems = [...snippets, ...attachments];

  // Model display from plan config
  const debaterSlugs = planConfig?.debaters || [];
  const modelNames = debaterSlugs.map(s => {
    const parts = s.split('/');
    return parts[parts.length - 1]?.split('-').slice(0, 2).join(' ') || s;
  });

  return (
    <div
      className="shrink-0"
      style={{
        background: '#141417',
        borderTop: '1px solid #27272A',
        padding: '12px 16px',
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-xl"
          style={{ background: '#7C3AED22', border: '2px dashed #7C3AED' }}
        >
          <span style={{ color: '#7C3AED', fontSize: 14 }}>Drop files to attach</span>
        </div>
      )}

      {/* Staging row: snippets + attachments */}
      {stagingItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {snippets.map(s => (
            <SnippetCard
              key={s.id}
              snippet={s}
              onRemove={() => setSnippets(prev => prev.filter(x => x.id !== s.id))}
            />
          ))}
          {attachments.map(a => (
            <FileAttachment
              key={a.id}
              file={a}
              onRemove={() => setAttachments(prev => prev.filter(x => x.id !== a.id))}
            />
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Ask anything... (⌘↵ or Enter to send)"
        disabled={isStreaming}
        className="w-full resize-none outline-none text-sm leading-5 bg-transparent"
        style={{
          color: '#F4F4F5',
          caretColor: '#7C3AED',
          minHeight: 40,
          maxHeight: 200,
        }}
        rows={1}
      />

      {/* Bottom action row */}
      <div className="flex items-center gap-2 mt-2">
        {/* Attach */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded transition-colors"
          style={{ color: '#52525b' }}
          title="Attach file"
          onMouseEnter={e => e.currentTarget.style.color = '#A1A1AA'}
          onMouseLeave={e => e.currentTarget.style.color = '#52525b'}
        >
          <Paperclip size={15} />
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

        {/* @ mention */}
        <button
          className="p-1.5 rounded transition-colors text-xs font-bold"
          style={{ color: '#52525b' }}
          title="Mention framework / docs"
          onMouseEnter={e => e.currentTarget.style.color = '#A1A1AA'}
          onMouseLeave={e => e.currentTarget.style.color = '#52525b'}
        >
          <AtSign size={15} />
        </button>

        {/* Model matrix display */}
        <div
          className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-default"
          style={{ background: '#18181B', border: '1px solid #27272A', color: '#52525b' }}
        >
          <span style={{ color: '#A1A1AA' }}>{planMeta.label}</span>
          {modelNames.length > 0 && (
            <>
              <span>·</span>
              <span className="truncate">{modelNames.join(' · ')}</span>
            </>
          )}
        </div>

        {/* Send / Cancel */}
        {isStreaming ? (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{ background: '#18181B', border: '1px solid #27272A', color: '#f87171' }}
          >
            <StopCircle size={14} />
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!hasContent}
            className="btn-gradient flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm text-white font-medium"
          >
            <Send size={13} />
            Send
          </button>
        )}
      </div>
    </div>
  );
}
