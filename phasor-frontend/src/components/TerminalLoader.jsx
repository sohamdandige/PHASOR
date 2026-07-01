import { useEffect, useState, useRef } from 'react';
import { PHASES } from '../hooks/usePhasorChat';

const PHASE_LABELS = {
  [PHASES.ROUTING]:     'Initializing',
  [PHASES.ANSWERING]:   'Collecting answers',
  [PHASES.DEBATING]:    'Running debate',
  [PHASES.SYNTHESIZING]:'Synthesizing verdict',
};

const PHASE_ORDER = [PHASES.ROUTING, PHASES.ANSWERING, PHASES.DEBATING, PHASES.SYNTHESIZING];

export default function TerminalLoader({ phase, logs }) {
  const endRef = useRef(null);
  const [visibleLogs, setVisibleLogs] = useState([]);

  // Stagger log line reveal
  useEffect(() => {
    setVisibleLogs([]);
    let i = 0;
    const timers = [];
    for (const line of logs) {
      const t = setTimeout(() => {
        setVisibleLogs(prev => [...prev, line]);
      }, i * 120);
      timers.push(t);
      i++;
    }
    return () => timers.forEach(clearTimeout);
  }, [logs]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleLogs]);

  const currentPhaseIdx = PHASE_ORDER.indexOf(phase);

  return (
    <div
      className="rounded-lg overflow-hidden fade-up"
      style={{ border: '1px solid #27272A', background: '#09090B', marginBottom: 16 }}
    >
      {/* Phase progress bar */}
      <div
        className="flex items-center gap-1 px-4 py-2"
        style={{ borderBottom: '1px solid #1c1c1f', background: '#0d0d0f' }}
      >
        {PHASE_ORDER.map((p, idx) => {
          const done = idx < currentPhaseIdx;
          const active = idx === currentPhaseIdx;
          return (
            <div key={p} className="flex items-center gap-1">
              <div
                className="flex items-center gap-1.5 text-xs font-mono transition-all"
                style={{
                  color: active ? '#a78bfa' : done ? '#4ade80' : '#3f3f46',
                }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: active
                      ? '#7C3AED'
                      : done
                      ? '#4ade80'
                      : '#27272A',
                    boxShadow: active ? '0 0 6px #7C3AED' : undefined,
                  }}
                />
                {PHASE_LABELS[p]}
              </div>
              {idx < PHASE_ORDER.length - 1 && (
                <div
                  className="w-6 h-px mx-1"
                  style={{ background: idx < currentPhaseIdx ? '#4ade80' : '#27272A' }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Terminal output */}
      <div className="px-4 py-3 font-mono text-xs" style={{ minHeight: 72, maxHeight: 140, overflowY: 'auto' }}>
        {visibleLogs.map((line, i) => {
          const isOk = line.includes('[OK]');
          const isError = line.includes('[ERR]');
          return (
            <div
              key={i}
              className="leading-5 fade-up"
              style={{
                color: isOk ? '#4ade80' : isError ? '#f87171' : '#a1a1aa',
                animationDelay: `${i * 0.05}s`,
              }}
            >
              {line}
            </div>
          );
        })}
        {/* Blinking cursor */}
        <span className="cursor-blink font-mono text-xs" style={{ color: '#7C3AED' }}>█</span>
        <div ref={endRef} />
      </div>
    </div>
  );
}
