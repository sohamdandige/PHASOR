import { useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, Swords, CheckCircle2, AlertTriangle } from 'lucide-react';

// Extract a short model display name from an OpenRouter slug like "google/gemini-2.0-flash"
function modelDisplayName(slug) {
  if (!slug) return 'Model';
  const part = slug.split('/').pop() || slug;
  return part
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace('Gemini', 'Gemini')
    .replace('Gpt', 'GPT')
    .replace('Claude', 'Claude');
}

// Lightweight heuristic diff renderer: highlights sentences that appear only
// in the critique (not in the original answer) in green, and notes structural
// changes. This is visual flare — not a true diff algorithm.
function renderCritique(text) {
  if (!text || text === '[Model unavailable]') {
    return <span style={{ color: '#52525b' }}>[No critique available]</span>;
  }
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.map((s, i) => {
    const isPositive = /correct|accurate|right|good|strong|well|valid|agree/i.test(s);
    const isNegative = /error|incorrect|wrong|missing|gap|unsupported|flaw|inaccurate|overlooked|omit/i.test(s);
    return (
      <span
        key={i}
        className={isPositive ? 'diff-add' : isNegative ? 'diff-remove' : 'diff-neutral'}
      >
        {s}{' '}
      </span>
    );
  });
}

function ModelBadge({ slug, index }) {
  const colors = ['#7C3AED', '#2563EB', '#10b981', '#f59e0b', '#ef4444'];
  const color = colors[index % colors.length];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      M{index + 1}
    </span>
  );
}

function AnswerCard({ model, answer, index }) {
  const [open, setOpen] = useState(index === 0);
  const unavailable = answer === '[Model unavailable]';

  return (
    <div
      className="rounded-lg overflow-hidden mb-2"
      style={{ border: '1px solid #27272A', background: '#0d0d0f' }}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
        style={{ color: open ? '#F4F4F5' : '#A1A1AA' }}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => e.currentTarget.style.background = '#18181B'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <ModelBadge slug={model} index={index} />
        <span className="flex-1 truncate">{modelDisplayName(model)}</span>
        {unavailable && <AlertTriangle size={12} style={{ color: '#f87171' }} />}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div
          className="px-4 pb-4 pt-1 text-sm leading-6 fade-up"
          style={{
            color: unavailable ? '#52525b' : '#d4d4d8',
            borderTop: '1px solid #1c1c1f',
            fontFamily: unavailable ? 'inherit' : 'inherit',
          }}
        >
          {unavailable ? '[Model unavailable for this request]' : answer}
        </div>
      )}
    </div>
  );
}

function DebateCard({ pairKey, critique, modelSlugs }) {
  const [open, setOpen] = useState(false);
  const [criticSlug, targetSlug] = pairKey.split('->');
  const criticIdx = modelSlugs.indexOf(criticSlug);
  const targetIdx = modelSlugs.indexOf(targetSlug);
  const unavailable = critique === '[Model unavailable]';

  return (
    <div
      className="rounded-lg overflow-hidden mb-2"
      style={{ border: '1px solid #27272A', background: '#0d0d0f' }}
    >
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm"
        style={{ color: open ? '#F4F4F5' : '#A1A1AA' }}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => e.currentTarget.style.background = '#18181B'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <ModelBadge slug={criticSlug} index={criticIdx >= 0 ? criticIdx : 0} />
        <span className="text-xs" style={{ color: '#52525b' }}>critiques</span>
        <ModelBadge slug={targetSlug} index={targetIdx >= 0 ? targetIdx : 1} />
        <div className="flex-1" />
        {unavailable && <AlertTriangle size={12} style={{ color: '#f87171' }} />}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div
          className="px-4 pb-4 pt-1 text-sm leading-6 fade-up"
          style={{ color: '#d4d4d8', borderTop: '1px solid #1c1c1f' }}
        >
          {renderCritique(critique)}
        </div>
      )}
    </div>
  );
}

export default function DebateTrace({ answers, debates }) {
  const [showAnswers, setShowAnswers] = useState(false);
  const [showDebates, setShowDebates] = useState(false);

  if (!answers && !debates) return null;

  const modelSlugs = answers ? Object.keys(answers) : [];
  const debatePairs = debates ? Object.entries(debates) : [];

  const availableAnswers = modelSlugs.filter(m => answers[m] !== '[Model unavailable]');
  const availableDebates = debatePairs.filter(([, v]) => v !== '[Model unavailable]');

  return (
    <div className="mt-4 fade-up" style={{ borderTop: '1px solid #27272A', paddingTop: 16 }}>
      {/* Answers section */}
      {answers && (
        <div className="mb-3">
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors mb-2"
            style={{
              background: showAnswers ? '#18181B' : 'transparent',
              color: '#A1A1AA',
              border: '1px solid #27272A',
            }}
            onClick={() => setShowAnswers(o => !o)}
          >
            <MessageSquare size={13} />
            <span>Independent answers</span>
            <span
              className="ml-1 text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: '#18181B', color: '#7C3AED', border: '1px solid #27272A' }}
            >
              {availableAnswers.length}/{modelSlugs.length}
            </span>
            <div className="flex-1" />
            {showAnswers ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {showAnswers && modelSlugs.map((model, i) => (
            <AnswerCard key={model} model={model} answer={answers[model]} index={i} />
          ))}
        </div>
      )}

      {/* Debates section */}
      {debates && debatePairs.length > 0 && (
        <div>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors mb-2"
            style={{
              background: showDebates ? '#18181B' : 'transparent',
              color: '#A1A1AA',
              border: '1px solid #27272A',
            }}
            onClick={() => setShowDebates(o => !o)}
          >
            <Swords size={13} />
            <span>Adversarial debate trace</span>
            <span
              className="ml-1 text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: '#18181B', color: '#f59e0b', border: '1px solid #27272A' }}
            >
              {availableDebates.length} critiques
            </span>
            <div className="flex-1" />
            {showDebates ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {showDebates && debatePairs.map(([key, critique]) => (
            <DebateCard key={key} pairKey={key} critique={critique} modelSlugs={modelSlugs} />
          ))}
        </div>
      )}

      {/* Verdict badge */}
      <div
        className="flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg text-xs"
        style={{ background: '#0d2d1a', border: '1px solid #166534', color: '#4ade80' }}
      >
        <CheckCircle2 size={12} />
        Consensus synthesized from {availableAnswers.length} models across {availableDebates.length} debate rounds
      </div>
    </div>
  );
}
