import { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, Zap, Settings, X, ChevronRight } from 'lucide-react';

const COMMANDS = [
  { id: 'clear', label: 'Clear conversation', icon: MessageSquare, group: 'Actions', shortcut: null },
  { id: 'toggle-inspector', label: 'Toggle file inspector', icon: ChevronRight, group: 'View', shortcut: null },
  { id: 'byok', label: 'Configure BYOK', icon: Settings, group: 'Settings', shortcut: null },
  { id: 'plan-free', label: 'Switch to Free plan', icon: Zap, group: 'Plan', shortcut: null },
  { id: 'plan-core', label: 'Switch to Core plan', icon: Zap, group: 'Plan', shortcut: null },
  { id: 'plan-pro', label: 'Switch to Pro plan', icon: Zap, group: 'Plan', shortcut: null },
  { id: 'plan-byok', label: 'Switch to BYOK plan', icon: Zap, group: 'Plan', shortcut: null },
];

export default function CommandPalette({ open, onClose, onCommand, recentChats = [] }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const chatItems = recentChats.map(c => ({
    id: `chat-${c.id}`,
    label: c.preview,
    icon: MessageSquare,
    group: 'Recent Chats',
    shortcut: null,
  }));

  const allItems = [...chatItems, ...COMMANDS];
  const filtered = query
    ? allItems.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
    : allItems;

  // Group results
  const grouped = filtered.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const flatItems = Object.values(grouped).flat();

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && flatItems[selectedIndex]) {
        onCommand(flatItems[selectedIndex].id);
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, flatItems, selectedIndex, onClose, onCommand]);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ background: 'rgba(9,9,11,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden fade-up"
        style={{ background: '#18181B', border: '1px solid #27272A', maxHeight: '480px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4" style={{ borderBottom: '1px solid #27272A' }}>
          <Search size={16} style={{ color: '#A1A1AA', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands, chats..."
            className="flex-1 py-4 bg-transparent outline-none text-sm"
            style={{ color: '#F4F4F5', caretColor: '#7C3AED' }}
          />
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-700 transition-colors"
            style={{ color: '#A1A1AA' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto" style={{ maxHeight: '380px' }}>
          {Object.keys(grouped).length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: '#A1A1AA' }}>
              No results for "{query}"
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#52525b' }}>
                  {group}
                </div>
                {items.map(item => {
                  const isSelected = flatIndex === selectedIndex;
                  const currentIndex = flatIndex++;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors text-sm"
                      style={{
                        background: isSelected ? '#27272A' : 'transparent',
                        color: isSelected ? '#F4F4F5' : '#A1A1AA',
                      }}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      onClick={() => { onCommand(item.id); onClose(); }}
                    >
                      <Icon size={14} style={{ flexShrink: 0 }} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.shortcut && (
                        <kbd className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: '#27272A', color: '#71717a' }}>
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 text-xs" style={{ borderTop: '1px solid #27272A', color: '#52525b' }}>
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
