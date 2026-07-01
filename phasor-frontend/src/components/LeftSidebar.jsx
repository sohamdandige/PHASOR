import { MessageSquare, Plus, Trash2, ChevronRight, Zap, Activity } from 'lucide-react';
import { PLAN_META } from '../hooks/useApp';

export default function LeftSidebar({ messages, onClear, plan, usage, onUpgrade }) {
  const planMeta = PLAN_META[plan] || PLAN_META.free;

  // Derive "recent chats" from message history — group by session isn't available in this MVP
  // so we show recent user messages as quick-access items
  const recentUserMessages = messages
    .filter(m => m.role === 'user')
    .slice(-8)
    .reverse();

  const dailyPct = usage?.daily_limit
    ? Math.min((usage.daily_used / usage.daily_limit) * 100, 100)
    : 0;

  return (
    <aside
      className="flex flex-col h-full select-none"
      style={{
        width: 260,
        minWidth: 260,
        background: '#121214',
        borderRight: '1px solid #27272A',
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-4" style={{ borderBottom: '1px solid #27272A' }}>
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #2563EB)' }}
        >
          φ
        </div>
        <span className="font-semibold text-sm" style={{ color: '#F4F4F5' }}>Phasor</span>
        <span className="ml-auto text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: '#18181B', color: '#7C3AED', border: '1px solid #27272A' }}>
          {planMeta.label}
        </span>
      </div>

      {/* New chat */}
      <div className="px-3 pt-3">
        <button
          onClick={onClear}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{ background: '#18181B', border: '1px solid #27272A', color: '#A1A1AA' }}
          onMouseEnter={e => e.currentTarget.style.color = '#F4F4F5'}
          onMouseLeave={e => e.currentTarget.style.color = '#A1A1AA'}
        >
          <Plus size={14} />
          New session
        </button>
      </div>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto px-3 pt-4">
        {recentUserMessages.length > 0 ? (
          <>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: '#52525b' }}>
              This session
            </div>
            {recentUserMessages.map(m => (
              <div
                key={m.id}
                className="flex items-start gap-2 px-2 py-2 rounded-lg mb-1 cursor-default group"
                style={{ color: '#A1A1AA' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#18181B'; e.currentTarget.style.color = '#F4F4F5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1AA'; }}
              >
                <MessageSquare size={12} className="mt-0.5 shrink-0" />
                <span className="text-xs truncate leading-4">{m.content}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="px-2 py-4 text-center text-xs" style={{ color: '#3f3f46' }}>
            No messages yet
          </div>
        )}
      </div>

      {/* Usage meter */}
      {usage && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid #27272A' }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs" style={{ color: '#71717a' }}>
              <Activity size={10} className="inline mr-1" />
              Daily usage
            </span>
            <span className="text-xs font-mono" style={{ color: '#A1A1AA' }}>
              {usage.daily_used} / {usage.daily_limit ?? '∞'}
            </span>
          </div>
          {usage.daily_limit && (
            <div className="h-1 rounded-full overflow-hidden" style={{ background: '#27272A' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${dailyPct}%`,
                  background: dailyPct > 80
                    ? '#f87171'
                    : 'linear-gradient(90deg, #7C3AED, #2563EB)',
                }}
              />
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs" style={{ color: '#52525b' }}>
              {usage.rate_limit_per_minute} req/min limit
            </span>
            {plan === 'free' && (
              <button
                onClick={onUpgrade}
                className="text-xs flex items-center gap-0.5 transition-opacity hover:opacity-80"
                style={{ color: '#7C3AED' }}
              >
                <Zap size={10} />
                Upgrade
              </button>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid #27272A' }}>
        <div className="text-xs" style={{ color: '#3f3f46' }}>
          Press <kbd className="font-mono text-xs px-1 rounded" style={{ background: '#18181B', border: '1px solid #27272A', color: '#71717a' }}>⌘K</kbd> for commands
        </div>
      </div>
    </aside>
  );
}
