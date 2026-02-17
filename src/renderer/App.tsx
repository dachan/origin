import React, { useEffect } from 'react';
import { TerminalProvider, useTerminal } from './context/TerminalContext';
import TerminalOutput from './components/TerminalOutput';
import CommandInput from './components/CommandInput';
import CommandPalette from './components/CommandPalette';
import Toast from './components/Toast';
import ContextMenu from './components/ContextMenu';

const AppContent: React.FC = () => {
  const { togglePalette } = useTerminal();

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K or Cmd+Shift+P to toggle command palette
      if (
        (e.metaKey && e.key === 'k') ||
        (e.metaKey && e.shiftKey && e.key === 'p') ||
        (e.metaKey && e.shiftKey && e.key === 'P')
      ) {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePalette]);

  return (
    <div className="app-container">
      <TerminalOutput>
        <CommandInput />
      </TerminalOutput>
      <CommandPalette />
      <Toast />
      <ContextMenu />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <TerminalProvider>
      <AppContent />
    </TerminalProvider>
  );
};

export default App;
