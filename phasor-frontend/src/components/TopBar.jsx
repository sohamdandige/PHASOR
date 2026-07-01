import { Command, PanelRight, Wifi, WifiOff, Settings } from 'lucide-react';
import { PLAN_META } from '../hooks/useApp';

export default function TopBar({ plan, health, inspectorOpen, onToggleInspector, onOpenCommandPalette, onOpenSettings }) {
  const planMeta = PLAN_META[plan] || PLAN_META.free;
  const redisOk = health?.redis === 'connected';
  const allOk = health?.status === 'ok';

  return (
    <header
      className="flex items-center gap-3 px-5 h-11 shrink-0"
      style={{
        background: '#121214',
        borderBottom: '1px solid #27272A',
        zIndex: 10,
      }}
    >
      {/* Command palette shortcut */}
      <button
        onClick={onOpenCommandPalette}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors"
        style={{
          background: '#18181B',
          border: '1px solid #27272A',
          color: '#52525b',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#A1A1AA'}
        onMouseLeave={e => e.currentTarget.style.color = '#52525b'}
      >
        <Command size={11} />
        <span className="font-mono">K</span>
      </button>

      <div className="flex-1" />

      {/* Health indicator */}
      {health && (
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: allOk && redisOk ? '#4ade80' : '#f87171' }}
          title={`Status: ${health.status} | Redis: ${health.redis}`}
        >
          {allOk ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span className="font-mono hidden sm:inline">
            {allOk && redisOk ? 'online' : 'degraded'}
          </span>
        </div>
      )}

      {/* Free tier cap indicator */}
      {health?.free_tier_monthly_cap && (
        <div
          className="text-xs font-mono hidden md:block"
          style={{ color: '#52525b' }}
          title={`Free tier: ${health.free_tier_monthly_usage} / ${health.free_tier_monthly_cap} this month`}
        >
          free pool: {health.free_tier_monthly_usage}/{health.free_tier_monthly_cap}
        </div>
      )}

      {/* Plan badge */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
        style={{
          background: `${planMeta.color}22`,
          border: `1px solid ${planMeta.color}44`,
          color: planMeta.color,
        }}
      >
        <span>{planMeta.label}</span>
      </div>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="p-1.5 rounded-lg transition-colors"
        style={{ color: '#52525b' }}
        onMouseEnter={e => e.currentTarget.style.color = '#A1A1AA'}
        onMouseLeave={e => e.currentTarget.style.color = '#52525b'}
      >
        <Settings size={15} />
      </button>

      {/* Inspector toggle */}
      <button
        onClick={onToggleInspector}
        className="p-1.5 rounded-lg transition-colors"
        style={{
          color: inspectorOpen ? '#7C3AED' : '#52525b',
          background: inspectorOpen ? '#7C3AED22' : 'transparent',
        }}
        title="Toggle file inspector"
      >
        <PanelRight size={15} />
      </button>
    </header>
  );
}
