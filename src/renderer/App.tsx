import React, { useEffect } from 'react';
import { TerminalProvider, useTerminal } from './context/TerminalContext';
import TerminalOutput from './components/TerminalOutput';
import CommandInput from './components/CommandInput';
import CommandPalette from './components/CommandPalette';
import Toast from './components/Toast';
import ContextMenu from './components/ContextMenu';

function selectionForCopy(terminalText: string): string {
  const active = document.activeElement;
  if (
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLInputElement
  ) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    if (end > start) return active.value.slice(start, end);
  }
  const domSelection = window.getSelection()?.toString() ?? '';
  if (domSelection) return domSelection;
  return terminalText;
}

const AppContent: React.FC = () => {
  const { togglePalette, terminalRef } = useTerminal();

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K or Cmd+Shift+P to toggle command palette
      const key = e.key.toLowerCase();
      if (e.metaKey && (key === 'k' || (e.shiftKey && key === 'p'))) {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePalette]);

  // Cmd+C is owned by the Edit menu, which asks the renderer to copy.
  useEffect(() => {
    return window.electronAPI.onEditCopy(() => {
      const text = selectionForCopy(terminalRef.current?.getSelection() ?? '');
      if (text) window.electronAPI.clipboardWrite(text);
    });
  }, [terminalRef]);

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
