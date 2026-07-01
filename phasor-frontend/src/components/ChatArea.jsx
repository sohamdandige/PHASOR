import { useEffect, useRef } from 'react';
import { AlertTriangle, Bot, User } from 'lucide-react';
import TerminalLoader from './TerminalLoader';
import DebateTrace from './DebateTrace';
import { renderMarkdownWithCodeBlocks } from './CodeBlock';
import { PHASES } from '../hooks/usePhasorChat';

function UserMessage({ message }) {
  return (
    <div className="flex gap-3 fade-up" style={{ alignItems: 'flex-start' }}>
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: '#27272A' }}
      >
        <User size={14} style={{ color: '#A1A1AA' }} />
      </div>
      <div
        className="rounded-lg px-4 py-3 text-sm leading-6 max-w-2xl"
        style={{
          background: '#18181B',
          border: '1px solid #27272A',
          color: '#F4F4F5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

function AssistantMessage({ message, onOpenInspector }) {
  if (message.error) {
    return (
      <div className="flex gap-3 fade-up">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: '#1c0a0a' }}
        >
          <AlertTriangle size={14} style={{ color: '#f87171' }} />
        </div>
        <div
          className="rounded-lg px-4 py-3 text-sm leading-6"
          style={{
            background: '#18181B',
            border: '1px solid #3f1515',
            color: '#f87171',
            maxWidth: '80%',
          }}
        >
          {message.error}
        </div>
      </div>
    );
  }

  if (!message.verdict) return null; // pending shown as terminal elsewhere

  return (
    <div className="flex gap-3 fade-up">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: 'linear-gradient(135deg, #7C3AED, #2563EB)' }}
      >
        <Bot size={14} style={{ color: '#fff' }} />
      </div>
      <div className="flex-1 min-w-0" style={{ maxWidth: 'calc(100% - 44px)' }}>
        {/* Verdict */}
        <div
          className="rounded-lg px-4 py-3 text-sm leading-6"
          style={{
            background: '#18181B',
            border: '1px solid #27272A',
            color: '#F4F4F5',
            wordBreak: 'break-word',
          }}
        >
          {renderMarkdownWithCodeBlocks(message.verdict, onOpenInspector)}
        </div>

        {/* Debate trace (collapsible) */}
        {(message.answers || message.debates) && (
          <DebateTrace answers={message.answers} debates={message.debates} />
        )}
      </div>
    </div>
  );
}

export default function ChatArea({ messages, phase, terminalLogs, isStreaming, onOpenInspector }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, terminalLogs]);

  const showTerminal = isStreaming && phase !== PHASES.DONE;
  const hasPendingAssistant = messages.some(m => m.pending);

  return (
    <div
      className="flex-1 overflow-y-auto px-6 py-6"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {/* Empty state */}
      {messages.length === 0 && !isStreaming && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: 'linear-gradient(135deg, #7C3AED22, #2563EB22)', border: '1px solid #27272A' }}
          >
            φ
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold mb-1" style={{ color: '#F4F4F5' }}>
              Phasor AI Workspace
            </h2>
            <p className="text-sm" style={{ color: '#52525b', maxWidth: 340 }}>
              Multiple models answer independently, debate adversarially, and synthesize a verified consensus.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {[
              'How does RSA encryption work?',
              'Implement a binary search in Python',
              'Explain transformer attention',
              'Best database for time series data?',
            ].map(q => (
              <button
                key={q}
                onClick={() => {/* handled by InputConsole */}}
                className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                style={{
                  background: '#18181B',
                  border: '1px solid #27272A',
                  color: '#A1A1AA',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#F4F4F5'; e.currentTarget.style.borderColor = '#3f3f46'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#A1A1AA'; e.currentTarget.style.borderColor = '#27272A'; }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.map(msg => (
        msg.role === 'user' ? (
          <UserMessage key={msg.id} message={msg} />
        ) : !msg.pending ? (
          <AssistantMessage key={msg.id} message={msg} onOpenInspector={onOpenInspector} />
        ) : null
      ))}

      {/* Terminal loader while streaming */}
      {showTerminal && hasPendingAssistant && (
        <div className="flex gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #2563EB)' }}
          >
            <Bot size={14} style={{ color: '#fff' }} />
          </div>
          <div className="flex-1">
            <TerminalLoader phase={phase} logs={terminalLogs} />
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
