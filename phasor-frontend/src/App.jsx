import { useState, useEffect, useCallback } from 'react';
import { AppProvider, useApp } from './hooks/useApp';
import { usePhasorChat } from './hooks/usePhasorChat';
import { fetchHealth } from './api/phasor';

import TopBar from './components/TopBar';
import LeftSidebar from './components/LeftSidebar';
import ChatArea from './components/ChatArea';
import InputConsole from './components/InputConsole';
import CodeInspector from './components/CodeInspector';
import CommandPalette from './components/CommandPalette';
import ByokModal from './components/ByokModal';

function PhasorApp() {
  const { token, plan, usage, serverConfig, byokConfig, setByokConfig, refreshUsage } = useApp();

  const { messages, phase, terminalLogs, isStreaming, send, cancel, clearMessages } = usePhasorChat({
    token,
    byokConfig,
  });

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorFile, setInspectorFile] = useState(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [byokModalOpen, setByokModalOpen] = useState(false);
  const [health, setHealth] = useState(null);

  // Load health on mount and periodically
  useEffect(() => {
    const load = () => fetchHealth().then(setHealth).catch(() => {});
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Global Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(o => !o);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setByokModalOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleOpenInspector = useCallback((file) => {
    setInspectorFile(file);
    setInspectorOpen(true);
  }, []);

  const handleCommand = useCallback((commandId) => {
    switch (commandId) {
      case 'clear':
        clearMessages();
        break;
      case 'toggle-inspector':
        setInspectorOpen(o => !o);
        break;
      case 'byok':
        setByokModalOpen(true);
        break;
      case 'plan-byok':
        setByokModalOpen(true);
        break;
      default:
        break;
    }
  }, [clearMessages]);

  const handleSend = useCallback((query, attachments) => {
    send(query, attachments);
    setTimeout(refreshUsage, 2000);
  }, [send, refreshUsage]);

  const recentChats = messages
    .filter(m => m.role === 'user')
    .slice(-6)
    .map(m => ({ id: m.id, preview: m.content.slice(0, 60) }));

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#09090B' }}>
      <LeftSidebar
        messages={messages}
        onClear={clearMessages}
        plan={plan}
        usage={usage}
        onUpgrade={() => setByokModalOpen(true)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar
          plan={plan}
          health={health}
          inspectorOpen={inspectorOpen}
          onToggleInspector={() => setInspectorOpen(o => !o)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenSettings={() => setByokModalOpen(true)}
        />

        <ChatArea
          messages={messages}
          phase={phase}
          terminalLogs={terminalLogs}
          isStreaming={isStreaming}
          onOpenInspector={handleOpenInspector}
        />

        <InputConsole
          onSend={handleSend}
          isStreaming={isStreaming}
          onCancel={cancel}
          plan={plan}
          serverConfig={serverConfig}
        />
      </div>

      {inspectorOpen && (
        <CodeInspector
          file={inspectorFile}
          onClose={() => setInspectorOpen(false)}
        />
      )}

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onCommand={handleCommand}
        recentChats={recentChats}
      />

      <ByokModal
        open={byokModalOpen}
        current={byokConfig}
        onSave={setByokConfig}
        onClose={() => setByokModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <PhasorApp />
    </AppProvider>
  );
}
