import './index.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

declare global {
  interface Window {
    electronAPI: {
      sendInput: (data: string) => void;
      resize: (cols: number, rows: number) => void;
      onData: (callback: (data: string) => void) => void;
      copyToClipboard: (text: string) => void;
      pasteFromClipboard: () => string;
      ready: () => void;
    };
  }
}

const terminal = new Terminal({
  cursorBlink: true,
  fontFamily: 'monospace',
  fontSize: 14,
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

const container = document.getElementById('terminal');
if (container) {
  terminal.open(container);
  fitAddon.fit();

  // Custom key handler for copy/cut/paste/delete
  terminal.attachCustomKeyEventHandler((event) => {
    const isMac = navigator.platform.includes('Mac');
    const modKey = isMac ? event.metaKey : event.ctrlKey;

    // Copy: Cmd+C (Mac) or Ctrl+Shift+C (non-Mac, to avoid conflict with SIGINT)
    if (event.type === 'keydown' && event.key === 'c' && modKey) {
      if (terminal.hasSelection()) {
        window.electronAPI.copyToClipboard(terminal.getSelection());
        return false; // Prevent default
      }
      // No selection: let Ctrl+C pass through as SIGINT
      return true;
    }

    // Cut: Cmd+X (Mac) or Ctrl+Shift+X
    if (event.type === 'keydown' && event.key === 'x' && modKey) {
      if (terminal.hasSelection()) {
        const selection = terminal.getSelection();
        window.electronAPI.copyToClipboard(selection);
        // Send backspaces to delete the selected text from command line
        for (let i = 0; i < selection.length; i++) {
          window.electronAPI.sendInput('\x7f'); // DEL character
        }
        terminal.clearSelection();
        return false;
      }
      return true;
    }

    // Paste: Cmd+V (Mac) or Ctrl+Shift+V
    if (event.type === 'keydown' && event.key === 'v' && modKey) {
      const text = window.electronAPI.pasteFromClipboard();
      if (text) {
        window.electronAPI.sendInput(text);
      }
      return false;
    }

    // Delete/Backspace selected text
    if (event.type === 'keydown' && (event.key === 'Backspace' || event.key === 'Delete')) {
      if (terminal.hasSelection()) {
        const selection = terminal.getSelection();
        // Send backspaces to delete
        for (let i = 0; i < selection.length; i++) {
          window.electronAPI.sendInput('\x7f');
        }
        terminal.clearSelection();
        return false;
      }
    }

    return true;
  });

  // Send terminal input to main process
  terminal.onData((data) => {
    window.electronAPI.sendInput(data);
  });

  // Receive output from main process
  window.electronAPI.onData((data) => {
    terminal.write(data);
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    fitAddon.fit();
    window.electronAPI.resize(terminal.cols, terminal.rows);
  });

  // Initial resize notification
  window.electronAPI.resize(terminal.cols, terminal.rows);

  // Signal ready - clears terminal on reload
  window.electronAPI.ready();
}
